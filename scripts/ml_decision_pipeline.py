#!/usr/bin/env python3
"""
Offline FRED-enriched pricing decision dataset and ML training pipeline.

This script intentionally stays outside the live MERN pricing engine. It builds
an explainable training artifact from public retail/pricing datasets and
engineered decision-quality labels.

Outputs are written under generated/ml/ by default and should not be committed.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import pickle
import random
import statistics
import sys
import time
import io
import urllib.parse
import urllib.request
import zipfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np

try:
    from sklearn.ensemble import RandomForestClassifier as SklearnRandomForestClassifier
    import joblib as joblib_module
except Exception:
    SklearnRandomForestClassifier = None
    joblib_module = None


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATASET_ZIP = Path(r"C:\Users\PRANAY\OneDrive\Documents\Dataset_ML.zip")
DEFAULT_OUTPUT_DIR = ROOT / "generated" / "ml"
DEFAULT_SEED = 42

FRED_SERIES = {
    "CPIAUCSL": "inflation_index",
    "UNRATE": "unemployment_rate",
    "FEDFUNDS": "interest_rate",
    "GASREGW": "fuel_price",
    "PPIACO": "producer_price_index",
    "UMCSENT": "consumer_sentiment",
}

LABELS = ["Terrible", "Bad", "Neutral", "Good", "Terrific"]
LABEL_TO_INDEX = {label: index for index, label in enumerate(LABELS)}

FEATURE_COLUMNS = [
    "unit_price",
    "previous_price",
    "price_change_percent",
    "quantity_sold",
    "units_before_change",
    "revenue_before_change",
    "profit_before_change",
    "competitor_price",
    "discount_percent",
    "inventory_level",
    "holiday_flag",
    "inflation_index",
    "unemployment_rate",
    "fuel_price",
    "producer_price_index",
    "consumer_sentiment",
    "margin_rate_before",
    "estimated_unit_cost",
    "source_code",
    "category_code",
    "segment_code",
    "region_code",
]

OUTPUT_COLUMNS = [
    "source_dataset",
    "date",
    "product_id",
    "category",
    "customer_segment",
    "region",
    "unit_price",
    "previous_price",
    "price_change_percent",
    "quantity_sold",
    "revenue",
    "profit",
    "competitor_price",
    "discount_percent",
    "inventory_level",
    "holiday_flag",
    "inflation_index",
    "unemployment_rate",
    "interest_rate",
    "fuel_price",
    "producer_price_index",
    "consumer_sentiment",
    "estimated_unit_cost",
    "cost_quality",
    "units_before_change",
    "units_after_change",
    "revenue_before_change",
    "revenue_after_change",
    "profit_before_change",
    "profit_after_change",
    "profit_lift_percent",
    "revenue_lift_percent",
    "demand_change_percent",
    "recommendation_success_flag",
    "decision_quality",
    "risk_flags",
]


def load_dotenv(path: Path) -> dict[str, str]:
    values = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_env(name: str) -> str:
    return os.environ.get(name) or load_dotenv(ROOT / ".env").get(name, "")


def parse_float(value, default=None):
    if value is None:
        return default
    text = str(value).strip()
    if not text or text.upper() in {"NA", "N/A", "NULL", "NONE", "NAN"}:
        return default
    text = text.replace(",", "").replace("$", "").replace("₹", "").replace("%", "")
    try:
        return float(text)
    except ValueError:
        return default


def parse_bool(value) -> int:
    text = str(value or "").strip().lower()
    return 1 if text in {"1", "true", "yes", "y", "holiday"} else 0


def parse_date(value, formats=("%Y-%m-%d", "%d-%m-%Y", "%m-%d-%y", "%m/%d/%Y", "%d/%m/%Y")):
    text = str(value or "").strip()
    if not text:
        return None
    for fmt in formats:
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        return None


def month_key(value: date | None) -> str:
    if not value:
        return ""
    return f"{value.year:04d}-{value.month:02d}"


def month_start(value: date) -> date:
    return date(value.year, value.month, 1)


def safe_percent(after, before):
    before = float(before or 0)
    after = float(after or 0)
    if abs(before) < 1e-9:
        return 0.0 if abs(after) < 1e-9 else 100.0
    return ((after - before) / abs(before)) * 100


def estimate_cost(unit_price, source, category=""):
    price = float(unit_price or 0)
    category_text = str(category or "").lower()
    if "electronics" in category_text or "pharm" in category_text:
        margin = 0.68
    elif "fashion" in category_text or "beauty" in category_text:
        margin = 0.55
    elif "grocery" in category_text or "health" in category_text:
        margin = 0.74
    else:
        margin = 0.62
    return price * margin


def decision_label(profit_lift):
    if profit_lift <= -20:
        return "Terrible"
    if profit_lift < -5:
        return "Bad"
    if profit_lift < 5:
        return "Neutral"
    if profit_lift < 20:
        return "Good"
    return "Terrific"


def downgrade_label(label):
    index = LABEL_TO_INDEX.get(label, 2)
    return LABELS[max(0, index - 1)]


def risk_adjust_label(label, risk_flags):
    severe = {"stockout", "very_low_margin", "high_returns", "missing_cost"}
    if severe.intersection(set(risk_flags)):
        return downgrade_label(label)
    return label


def row_from_event(
    *,
    source_dataset,
    event_date,
    product_id,
    category,
    customer_segment,
    region,
    unit_price,
    previous_price,
    quantity_sold,
    revenue,
    profit,
    competitor_price=None,
    discount_percent=None,
    inventory_level=None,
    holiday_flag=0,
    estimated_unit_cost=None,
    cost_quality="estimated",
    units_before_change=0,
    revenue_before_change=0,
    profit_before_change=0,
    risk_flags=None,
):
    risk_flags = list(risk_flags or [])
    unit_price = float(unit_price or 0)
    previous_price = float(previous_price or unit_price or 0)
    quantity_sold = float(quantity_sold or 0)
    revenue = float(revenue if revenue is not None else unit_price * quantity_sold)
    estimated_unit_cost = float(estimated_unit_cost if estimated_unit_cost is not None else estimate_cost(unit_price, source_dataset, category))
    profit = float(profit if profit is not None else (unit_price - estimated_unit_cost) * quantity_sold)
    units_before_change = float(units_before_change or 0)
    revenue_before_change = float(revenue_before_change or 0)
    profit_before_change = float(profit_before_change or 0)
    margin_rate = (profit / revenue) if revenue else 0

    if cost_quality == "missing":
        risk_flags.append("missing_cost")
    if margin_rate < 0.03:
        risk_flags.append("very_low_margin")

    profit_lift = safe_percent(profit, profit_before_change)
    revenue_lift = safe_percent(revenue, revenue_before_change)
    demand_change = safe_percent(quantity_sold, units_before_change)
    label = risk_adjust_label(decision_label(profit_lift), risk_flags)

    return {
        "source_dataset": source_dataset,
        "date": event_date.isoformat() if isinstance(event_date, date) else str(event_date or ""),
        "product_id": str(product_id or ""),
        "category": str(category or "Unknown"),
        "customer_segment": str(customer_segment or "All Customers"),
        "region": str(region or "Unknown"),
        "unit_price": round(unit_price, 4),
        "previous_price": round(previous_price, 4),
        "price_change_percent": round(safe_percent(unit_price, previous_price), 4),
        "quantity_sold": round(quantity_sold, 4),
        "revenue": round(revenue, 4),
        "profit": round(profit, 4),
        "competitor_price": "" if competitor_price is None else round(float(competitor_price), 4),
        "discount_percent": "" if discount_percent is None else round(float(discount_percent), 4),
        "inventory_level": "" if inventory_level is None else round(float(inventory_level), 4),
        "holiday_flag": int(holiday_flag or 0),
        "inflation_index": "",
        "unemployment_rate": "",
        "interest_rate": "",
        "fuel_price": "",
        "producer_price_index": "",
        "consumer_sentiment": "",
        "estimated_unit_cost": round(estimated_unit_cost, 4),
        "cost_quality": cost_quality,
        "units_before_change": round(units_before_change, 4),
        "units_after_change": round(quantity_sold, 4),
        "revenue_before_change": round(revenue_before_change, 4),
        "revenue_after_change": round(revenue, 4),
        "profit_before_change": round(profit_before_change, 4),
        "profit_after_change": round(profit, 4),
        "profit_lift_percent": round(profit_lift, 4),
        "revenue_lift_percent": round(revenue_lift, 4),
        "demand_change_percent": round(demand_change, 4),
        "recommendation_success_flag": 1 if label in {"Good", "Terrific"} else 0,
        "decision_quality": label,
        "risk_flags": "|".join(sorted(set(risk_flags))),
    }


def open_text_from_zip(zf, name, encoding="utf-8-sig"):
    return zf.open(name), encoding


def iter_csv(zf, name, delimiter=","):
    raw, encoding = open_text_from_zip(zf, name)
    with raw:
        text = io.TextIOWrapper(raw, encoding=encoding, errors="replace", newline="")
        reader = csv.DictReader(text, delimiter=delimiter)
        for row in reader:
            yield row


def load_fred_series(series_id, api_key, cache_dir, require_fred=False):
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_file = cache_dir / f"{series_id}.csv"
    if cache_file.exists():
        observations = {}
        with cache_file.open("r", newline="", encoding="utf-8") as handle:
            for row in csv.DictReader(handle):
                d = parse_date(row.get("date"))
                value = parse_float(row.get("value"))
                if d and value is not None:
                    observations[d] = value
        return observations, "cache"

    if not api_key:
        if require_fred:
            raise RuntimeError("FRED_API_KEY is missing. Add it to .env or set it in the shell before running with --require-fred.")
        return {}, "missing_key"

    params = urllib.parse.urlencode({
        "series_id": series_id,
        "api_key": api_key,
        "file_type": "json",
    })
    url = f"https://api.stlouisfed.org/fred/series/observations?{params}"

    with urllib.request.urlopen(url, timeout=30) as response:
        data = json.loads(response.read().decode("utf-8"))

    observations = {}
    for item in data.get("observations", []):
        d = parse_date(item.get("date"))
        value = parse_float(item.get("value"))
        if d and value is not None:
            observations[d] = value

    with cache_file.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["date", "value"])
        writer.writeheader()
        for d in sorted(observations):
            writer.writerow({"date": d.isoformat(), "value": observations[d]})
    time.sleep(0.25)
    return observations, "downloaded"


def load_macro_data(output_dir, require_fred=False):
    api_key = get_env("FRED_API_KEY")
    cache_dir = output_dir / "fred_cache"
    macro = {}
    statuses = {}
    for series_id, column in FRED_SERIES.items():
        observations, status = load_fred_series(series_id, api_key, cache_dir, require_fred=require_fred)
        macro[column] = observations
        statuses[series_id] = status
    return macro, statuses


def latest_observation(observations, value_date):
    if not observations or not value_date:
        return ""
    target = value_date
    if not isinstance(target, date):
        return ""
    best = None
    for obs_date in observations:
        if obs_date <= target and (best is None or obs_date > best):
            best = obs_date
    return "" if best is None else observations[best]


def enrich_macro(row, macro):
    d = parse_date(row.get("date"))
    for column in FRED_SERIES.values():
        value = latest_observation(macro.get(column, {}), d)
        row[column] = "" if value == "" else round(float(value), 4)
    return row


def build_retail_price_rows(zf):
    name = "Dataset_ML/Retail Price Optimization/retail_price.csv"
    rows_by_product = defaultdict(list)
    for row in iter_csv(zf, name):
        product_id = row.get("product_id")
        d = parse_date(row.get("month_year"), formats=("%d-%m-%Y",))
        unit_price = parse_float(row.get("unit_price"))
        qty = parse_float(row.get("qty"), 0)
        if not product_id or not d or unit_price is None:
            continue
        revenue = parse_float(row.get("total_price"), unit_price * qty)
        cost = estimate_cost(unit_price, "Retail Price Optimization", row.get("product_category_name"))
        profit = (unit_price - cost) * qty
        competitor_values = [parse_float(row.get(key)) for key in ("comp_1", "comp_2", "comp_3")]
        competitor_values = [value for value in competitor_values if value is not None and value > 0]
        rows_by_product[product_id].append({
            "date": d,
            "product_id": product_id,
            "category": row.get("product_category_name") or "Unknown",
            "unit_price": unit_price,
            "quantity": qty,
            "revenue": revenue,
            "profit": profit,
            "cost": cost,
            "competitor_price": statistics.mean(competitor_values) if competitor_values else None,
            "discount_percent": None,
            "inventory_level": parse_float(row.get("customers")),
            "holiday_flag": parse_bool(row.get("holiday")),
        })

    events = []
    for product_id, product_rows in rows_by_product.items():
        product_rows.sort(key=lambda item: item["date"])
        for index in range(1, len(product_rows)):
            previous = product_rows[index - 1]
            current = product_rows[index]
            if abs(safe_percent(current["unit_price"], previous["unit_price"])) < 0.5:
                continue
            events.append(row_from_event(
                source_dataset="Retail Price Optimization",
                event_date=current["date"],
                product_id=product_id,
                category=current["category"],
                customer_segment="All Customers",
                region="Unknown",
                unit_price=current["unit_price"],
                previous_price=previous["unit_price"],
                quantity_sold=current["quantity"],
                revenue=current["revenue"],
                profit=current["profit"],
                competitor_price=current["competitor_price"],
                discount_percent=current["discount_percent"],
                inventory_level=current["inventory_level"],
                holiday_flag=current["holiday_flag"],
                estimated_unit_cost=current["cost"],
                cost_quality="estimated",
                units_before_change=previous["quantity"],
                revenue_before_change=previous["revenue"],
                profit_before_change=previous["profit"],
            ))
    return events


def build_revenue_forecast_rows(zf, max_groups=None):
    name = "Dataset_ML/Revenue Forecast for Dynamic Pricing/train.csv"
    grouped = {}
    base = date(2017, 1, 1)
    for row in iter_csv(zf, name, delimiter="|"):
        pid = row.get("pid")
        day = int(parse_float(row.get("day"), 0) or 0)
        price = parse_float(row.get("price"))
        if not pid or not day or price is None:
            continue
        key = (pid, day)
        item = grouped.setdefault(key, {
            "product_id": pid,
            "date": base + timedelta(days=day - 1),
            "price_total": 0.0,
            "price_count": 0,
            "competitor_total": 0.0,
            "competitor_count": 0,
            "clicks": 0.0,
            "orders": 0.0,
            "revenue": 0.0,
            "availability_min": 99.0,
            "ad_flag": 0,
        })
        item["price_total"] += price
        item["price_count"] += 1
        competitor = parse_float(row.get("competitorPrice"))
        if competitor is not None:
            item["competitor_total"] += competitor
            item["competitor_count"] += 1
        item["clicks"] += parse_float(row.get("click"), 0) or 0
        item["orders"] += parse_float(row.get("order"), 0) or 0
        item["revenue"] += parse_float(row.get("revenue"), 0) or 0
        item["availability_min"] = min(item["availability_min"], parse_float(row.get("availability"), 99) or 99)
        item["ad_flag"] = max(item["ad_flag"], int(parse_float(row.get("adFlag"), 0) or 0))

    by_product = defaultdict(list)
    for item in grouped.values():
        if item["price_count"] <= 0:
            continue
        price = item["price_total"] / item["price_count"]
        quantity = item["orders"]
        if quantity <= 0 and item["revenue"] > 0 and price > 0:
            quantity = item["revenue"] / price
        cost = estimate_cost(price, "Revenue Forecast for Dynamic Pricing", "Pharmacy")
        profit = (price - cost) * quantity
        by_product[item["product_id"]].append({
            "date": item["date"],
            "unit_price": price,
            "quantity": quantity,
            "revenue": item["revenue"] if item["revenue"] > 0 else price * quantity,
            "profit": profit,
            "cost": cost,
            "competitor_price": item["competitor_total"] / item["competitor_count"] if item["competitor_count"] else None,
            "inventory_level": item["availability_min"],
            "holiday_flag": 0,
            "ad_flag": item["ad_flag"],
            "stockout": item["availability_min"] <= 0,
        })

    events = []
    product_ids = sorted(by_product.keys(), key=lambda pid: len(by_product[pid]), reverse=True)
    for product_id in product_ids:
        product_rows = sorted(by_product[product_id], key=lambda item: item["date"])
        for index in range(1, len(product_rows)):
            previous = product_rows[index - 1]
            current = product_rows[index]
            if abs(safe_percent(current["unit_price"], previous["unit_price"])) < 0.5:
                continue
            risk = []
            if current["stockout"]:
                risk.append("stockout")
            events.append(row_from_event(
                source_dataset="Revenue Forecast for Dynamic Pricing",
                event_date=current["date"],
                product_id=product_id,
                category="Pharmacy",
                customer_segment="All Customers",
                region="Unknown",
                unit_price=current["unit_price"],
                previous_price=previous["unit_price"],
                quantity_sold=current["quantity"],
                revenue=current["revenue"],
                profit=current["profit"],
                competitor_price=current["competitor_price"],
                discount_percent=None,
                inventory_level=current["inventory_level"],
                holiday_flag=current["holiday_flag"],
                estimated_unit_cost=current["cost"],
                cost_quality="estimated",
                units_before_change=previous["quantity"],
                revenue_before_change=previous["revenue"],
                profit_before_change=previous["profit"],
                risk_flags=risk,
            ))
            if max_groups and len(events) >= max_groups:
                return events
    return events


def build_ecommerce_transaction_rows(zf):
    name = "Dataset_ML/E-Commerce Sales Transactions Dataset/ecommerce_sales_34500.csv"
    grouped = defaultdict(lambda: {
        "quantity": 0.0,
        "revenue": 0.0,
        "profit": 0.0,
        "price_total": 0.0,
        "rows": 0,
        "discount_total": 0.0,
        "shipping_total": 0.0,
        "returns": 0.0,
        "age_total": 0.0,
    })
    metadata = {}
    for row in iter_csv(zf, name):
        product_id = row.get("product_id")
        d = parse_date(row.get("order_date"))
        price = parse_float(row.get("price"))
        quantity = parse_float(row.get("quantity"), 0)
        if not product_id or not d or price is None:
            continue
        key = (product_id, d)
        discount = parse_float(row.get("discount"), 0) or 0
        total_amount = parse_float(row.get("total_amount"), price * quantity)
        margin = parse_float(row.get("profit_margin"), 0.25) or 0.25
        profit = total_amount * margin
        grouped[key]["quantity"] += quantity
        grouped[key]["revenue"] += total_amount
        grouped[key]["profit"] += profit
        grouped[key]["price_total"] += price
        grouped[key]["rows"] += 1
        grouped[key]["discount_total"] += discount
        grouped[key]["shipping_total"] += parse_float(row.get("shipping_cost"), 0) or 0
        grouped[key]["returns"] += 1 if str(row.get("returned", "")).lower() == "yes" else 0
        grouped[key]["age_total"] += parse_float(row.get("customer_age"), 0) or 0
        metadata[key] = {
            "category": row.get("category") or "Unknown",
            "region": row.get("region") or "Unknown",
            "segment": row.get("customer_gender") or "All Customers",
        }

    by_product = defaultdict(list)
    for (product_id, d), values in grouped.items():
        if values["rows"] <= 0:
            continue
        avg_price = values["price_total"] / values["rows"]
        meta = metadata[(product_id, d)]
        by_product[product_id].append({
            "date": d,
            "category": meta["category"],
            "region": meta["region"],
            "segment": meta["segment"],
            "unit_price": avg_price,
            "quantity": values["quantity"],
            "revenue": values["revenue"],
            "profit": values["profit"],
            "discount": values["discount_total"] / values["rows"],
            "return_rate": values["returns"] / values["rows"],
            "cost": avg_price * 0.7,
        })

    events = []
    for product_id, product_rows in by_product.items():
        product_rows.sort(key=lambda item: item["date"])
        for index in range(1, len(product_rows)):
            previous = product_rows[index - 1]
            current = product_rows[index]
            if abs(safe_percent(current["unit_price"], previous["unit_price"])) < 0.5:
                continue
            risk = ["high_returns"] if current["return_rate"] > 0.25 else []
            events.append(row_from_event(
                source_dataset="E-Commerce Sales Transactions",
                event_date=current["date"],
                product_id=product_id,
                category=current["category"],
                customer_segment=current["segment"],
                region=current["region"],
                unit_price=current["unit_price"],
                previous_price=previous["unit_price"],
                quantity_sold=current["quantity"],
                revenue=current["revenue"],
                profit=current["profit"],
                discount_percent=current["discount"],
                estimated_unit_cost=current["cost"],
                cost_quality="estimated",
                units_before_change=previous["quantity"],
                revenue_before_change=previous["revenue"],
                profit_before_change=previous["profit"],
                risk_flags=risk,
            ))
    return events


def load_salesmind_context(zf):
    context = {
        "segments": 0,
        "products": 0,
        "stores": 0,
        "external_factor_rows": 0,
        "note": "SalesMind 2026 is used as supplemental schema/context only because product repetition is weak.",
    }
    files = {
        "segments": "Dataset_ML/SalesMind 2026 AI Commerce Dataset/SalesMind_Customer_Segments_2026.csv",
        "products": "Dataset_ML/SalesMind 2026 AI Commerce Dataset/SalesMind_Products_Master_2026.csv",
        "stores": "Dataset_ML/SalesMind 2026 AI Commerce Dataset/SalesMind_Stores_Master_2026.csv",
        "external_factor_rows": "Dataset_ML/SalesMind 2026 AI Commerce Dataset/SalesMind_External_Factors_2026.csv",
    }
    for key, name in files.items():
        try:
            context[key] = sum(1 for _ in iter_csv(zf, name))
        except KeyError:
            context[key] = 0
    return context


def load_walmart_macro_context(zf):
    name = "Dataset_ML/Walmart Sales Forecasting/features - Walmart Sales Forecast.csv"
    cpi_values = []
    unemployment_values = []
    fuel_values = []
    for row in iter_csv(zf, name):
        cpi = parse_float(row.get("CPI"))
        unemployment = parse_float(row.get("Unemployment"))
        fuel = parse_float(row.get("Fuel_Price"))
        if cpi is not None:
            cpi_values.append(cpi)
        if unemployment is not None:
            unemployment_values.append(unemployment)
        if fuel is not None:
            fuel_values.append(fuel)
    return {
        "walmart_cpi_average": round(statistics.mean(cpi_values), 4) if cpi_values else None,
        "walmart_unemployment_average": round(statistics.mean(unemployment_values), 4) if unemployment_values else None,
        "walmart_fuel_price_average": round(statistics.mean(fuel_values), 4) if fuel_values else None,
    }


def build_dataset(dataset_zip, output_dir, require_fred=False, max_revenue_events=150000):
    if not dataset_zip.exists():
        raise FileNotFoundError(f"Dataset ZIP not found: {dataset_zip}")
    output_dir.mkdir(parents=True, exist_ok=True)

    macro, fred_statuses = load_macro_data(output_dir, require_fred=require_fred)
    events = []
    source_counts = {}
    supplemental = {}

    with zipfile.ZipFile(dataset_zip) as zf:
        builders = [
            ("Retail Price Optimization", lambda: build_retail_price_rows(zf)),
            ("Revenue Forecast for Dynamic Pricing", lambda: build_revenue_forecast_rows(zf, max_groups=max_revenue_events)),
            ("E-Commerce Sales Transactions", lambda: build_ecommerce_transaction_rows(zf)),
        ]
        for source_name, builder in builders:
            source_events = builder()
            source_counts[source_name] = len(source_events)
            events.extend(source_events)
        supplemental["salesmind"] = load_salesmind_context(zf)
        supplemental["walmart_macro_context"] = load_walmart_macro_context(zf)

    enriched = [enrich_macro(row, macro) for row in events]
    enriched = [row for row in enriched if row.get("decision_quality")]

    dataset_path = output_dir / "pricing_decision_training_dataset.csv"
    with dataset_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        for row in enriched:
            writer.writerow({column: row.get(column, "") for column in OUTPUT_COLUMNS})

    profile = {
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "dataset_zip": str(dataset_zip),
        "rows": len(enriched),
        "source_counts": source_counts,
        "label_distribution": dict(Counter(row["decision_quality"] for row in enriched)),
        "success_distribution": dict(Counter(str(row["recommendation_success_flag"]) for row in enriched)),
        "fred_series_status": fred_statuses,
        "supplemental_context": supplemental,
        "columns": OUTPUT_COLUMNS,
        "label_policy": {
            "Terrific": "profit lift >= 20%, after risk downgrades",
            "Good": "profit lift >= 5% and < 20%, after risk downgrades",
            "Neutral": "profit lift between -5% and 5%, after risk downgrades",
            "Bad": "profit lift < -5% and > -20%, after risk downgrades",
            "Terrible": "profit lift <= -20%, after risk downgrades",
        },
    }
    profile_path = output_dir / "pricing_decision_dataset_profile.json"
    profile_path.write_text(json.dumps(profile, indent=2), encoding="utf-8")

    return enriched, dataset_path, profile_path, profile


def encode_categories(values):
    counts = Counter(str(value or "Unknown") for value in values)
    ordered = [value for value, _ in counts.most_common()]
    mapping = {value: index + 1 for index, value in enumerate(ordered)}
    return mapping


def prepare_matrix(rows):
    category_maps = {
        "source_dataset": encode_categories(row.get("source_dataset") for row in rows),
        "category": encode_categories(row.get("category") for row in rows),
        "customer_segment": encode_categories(row.get("customer_segment") for row in rows),
        "region": encode_categories(row.get("region") for row in rows),
    }

    matrix = []
    labels = []
    dates = []
    for row in rows:
        enriched = dict(row)
        enriched["source_code"] = category_maps["source_dataset"].get(str(row.get("source_dataset") or "Unknown"), 0)
        enriched["category_code"] = category_maps["category"].get(str(row.get("category") or "Unknown"), 0)
        enriched["segment_code"] = category_maps["customer_segment"].get(str(row.get("customer_segment") or "Unknown"), 0)
        enriched["region_code"] = category_maps["region"].get(str(row.get("region") or "Unknown"), 0)
        before_profit = parse_float(row.get("profit_before_change"), 0) or 0
        before_revenue = parse_float(row.get("revenue_before_change"), 0) or 0
        enriched["margin_rate_before"] = before_profit / before_revenue if before_revenue else 0
        matrix.append([parse_float(enriched.get(column), 0) or 0 for column in FEATURE_COLUMNS])
        labels.append(LABEL_TO_INDEX[row["decision_quality"]])
        dates.append(parse_date(row.get("date")) or date(1900, 1, 1))

    X = np.array(matrix, dtype=float)
    y = np.array(labels, dtype=int)
    medians = np.nanmedian(X, axis=0)
    medians = np.where(np.isfinite(medians), medians, 0)
    X = np.where(np.isfinite(X), X, medians)
    return X, y, dates, category_maps, medians


@dataclass
class TreeNode:
    prediction: int
    class_counts: list[int]
    feature: int | None = None
    threshold: float | None = None
    left: "TreeNode | None" = None
    right: "TreeNode | None" = None


def gini(y):
    if len(y) == 0:
        return 0
    counts = np.bincount(y, minlength=len(LABELS)) / len(y)
    return 1.0 - float(np.sum(counts * counts))


def best_split(X, y, feature_indices, min_leaf):
    parent = gini(y)
    best = None
    best_gain = 0.0
    n = len(y)
    if n < min_leaf * 2:
        return None

    for feature in feature_indices:
        values = X[:, feature]
        if np.allclose(values, values[0]):
            continue
        percentiles = np.unique(np.percentile(values, [15, 30, 45, 60, 75, 90]))
        for threshold in percentiles:
            left_mask = values <= threshold
            left_count = int(np.sum(left_mask))
            right_count = n - left_count
            if left_count < min_leaf or right_count < min_leaf:
                continue
            gain = parent - (left_count / n) * gini(y[left_mask]) - (right_count / n) * gini(y[~left_mask])
            if gain > best_gain:
                best_gain = gain
                best = (feature, float(threshold), left_mask, gain)
    return best


def build_tree(X, y, rng, max_depth=7, min_leaf=30, feature_sample_rate=0.7):
    class_counts = np.bincount(y, minlength=len(LABELS)).astype(int).tolist()
    prediction = int(np.argmax(class_counts))
    if max_depth <= 0 or len(set(y.tolist())) <= 1 or len(y) < min_leaf * 2:
        return TreeNode(prediction=prediction, class_counts=class_counts)

    feature_count = max(1, int(X.shape[1] * feature_sample_rate))
    feature_indices = rng.sample(range(X.shape[1]), feature_count)
    split = best_split(X, y, feature_indices, min_leaf)
    if split is None:
        return TreeNode(prediction=prediction, class_counts=class_counts)

    feature, threshold, left_mask, gain = split
    left = build_tree(X[left_mask], y[left_mask], rng, max_depth=max_depth - 1, min_leaf=min_leaf, feature_sample_rate=feature_sample_rate)
    right = build_tree(X[~left_mask], y[~left_mask], rng, max_depth=max_depth - 1, min_leaf=min_leaf, feature_sample_rate=feature_sample_rate)
    node = TreeNode(prediction=prediction, class_counts=class_counts, feature=feature, threshold=threshold, left=left, right=right)
    node.gain = gain
    node.sample_count = len(y)
    return node


def predict_tree(node, row):
    current = node
    while current.feature is not None and current.left is not None and current.right is not None:
        current = current.left if row[current.feature] <= current.threshold else current.right
    return current.prediction


def collect_importance(node, importances):
    if node.feature is None:
        return
    importances[node.feature] += getattr(node, "gain", 0.0) * getattr(node, "sample_count", 1)
    collect_importance(node.left, importances)
    collect_importance(node.right, importances)


class RandomForestLite:
    def __init__(self, n_trees=35, max_depth=7, min_leaf=30, seed=DEFAULT_SEED):
        self.n_trees = n_trees
        self.max_depth = max_depth
        self.min_leaf = min_leaf
        self.seed = seed
        self.trees = []
        self.feature_importances_ = None

    def fit(self, X, y):
        rng = random.Random(self.seed)
        n = len(y)
        self.trees = []
        for _ in range(self.n_trees):
            indices = np.array([rng.randrange(n) for _ in range(n)])
            tree = build_tree(X[indices], y[indices], rng, max_depth=self.max_depth, min_leaf=self.min_leaf)
            self.trees.append(tree)
        importances = np.zeros(X.shape[1], dtype=float)
        for tree in self.trees:
            collect_importance(tree, importances)
        total = importances.sum()
        self.feature_importances_ = importances / total if total else importances
        return self

    def predict(self, X):
        predictions = []
        for row in X:
            votes = [predict_tree(tree, row) for tree in self.trees]
            predictions.append(Counter(votes).most_common(1)[0][0])
        return np.array(predictions, dtype=int)

    def predict_proba(self, X):
        probabilities = []
        for row in X:
            votes = [predict_tree(tree, row) for tree in self.trees]
            counts = np.bincount(votes, minlength=len(LABELS)).astype(float)
            total = counts.sum()
            probabilities.append(counts / total if total else counts)
        return np.array(probabilities, dtype=float)


def split_time_holdout(X, y, dates, holdout_ratio=0.2):
    order = sorted(range(len(dates)), key=lambda index: dates[index])
    cutoff = max(1, int(len(order) * (1 - holdout_ratio)))
    train_idx = np.array(order[:cutoff], dtype=int)
    test_idx = np.array(order[cutoff:], dtype=int)
    return X[train_idx], X[test_idx], y[train_idx], y[test_idx], train_idx, test_idx


def classification_report(y_true, y_pred):
    confusion = np.zeros((len(LABELS), len(LABELS)), dtype=int)
    for actual, predicted in zip(y_true, y_pred):
        confusion[int(actual), int(predicted)] += 1

    per_class = {}
    f1_values = []
    for index, label in enumerate(LABELS):
        tp = confusion[index, index]
        fp = confusion[:, index].sum() - tp
        fn = confusion[index, :].sum() - tp
        precision = tp / (tp + fp) if tp + fp else 0.0
        recall = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
        f1_values.append(f1)
        per_class[label] = {
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
            "support": int(confusion[index, :].sum()),
        }

    accuracy = float(np.mean(y_true == y_pred)) if len(y_true) else 0.0
    return {
        "accuracy": round(accuracy, 4),
        "macro_f1": round(float(np.mean(f1_values)), 4),
        "per_class": per_class,
        "confusion_matrix": {
            "labels": LABELS,
            "values": confusion.tolist(),
        },
    }


def train_model(rows, output_dir):
    X, y, dates, category_maps, medians = prepare_matrix(rows)
    X_train, X_test, y_train, y_test, train_idx, test_idx = split_time_holdout(X, y, dates)

    majority = Counter(y_train.tolist()).most_common(1)[0][0]
    majority_pred = np.full_like(y_test, majority)
    baseline_majority = classification_report(y_test, majority_pred)

    rule_pred = np.array([
        LABEL_TO_INDEX[decision_label(parse_float(rows[index].get("profit_lift_percent"), 0) or 0)]
        for index in test_idx
    ], dtype=int)
    # This baseline uses only the raw profit-lift thresholds, without risk
    # downgrades. It is not a live feature baseline because after-period outcomes
    # are target leakage, but it proves the classifier is compared against the
    # simplest possible engineered decision rule on the same holdout rows.
    baseline_rule = classification_report(y_test, rule_pred)

    if SklearnRandomForestClassifier is not None:
        model = SklearnRandomForestClassifier(
            n_estimators=180,
            max_depth=12,
            min_samples_leaf=20,
            class_weight="balanced_subsample",
            random_state=DEFAULT_SEED,
            n_jobs=-1,
        ).fit(X_train, y_train)
        model_backend = "scikit-learn RandomForestClassifier"
    else:
        model = RandomForestLite().fit(X_train, y_train)
        model_backend = "RandomForestLite fallback"
    y_pred = model.predict(X_test)
    model_report = classification_report(y_test, y_pred)

    artifact = {
        "model_type": model_backend,
        "labels": LABELS,
        "feature_columns": FEATURE_COLUMNS,
        "feature_medians": medians.tolist(),
        "category_maps": category_maps,
        "model": model,
        "note": "Offline ML decision-quality assistant. Current pricing engine remains explainable and unchanged.",
    }
    model_path = output_dir / "decision_quality_model.joblib"
    if joblib_module is not None:
        joblib_module.dump(artifact, model_path)
        artifact_format = "joblib"
    else:
        with model_path.open("wb") as handle:
            pickle.dump(artifact, handle)
        artifact_format = "pickle fallback saved with .joblib extension"

    feature_importance = []
    for column, importance in sorted(zip(FEATURE_COLUMNS, model.feature_importances_), key=lambda item: item[1], reverse=True):
        feature_importance.append({"feature": column, "importance": round(float(importance), 6)})

    importance_path = output_dir / "decision_quality_feature_importance.csv"
    with importance_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["feature", "importance"])
        writer.writeheader()
        writer.writerows(feature_importance)

    metrics = {
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "row_count": len(rows),
        "train_rows": int(len(y_train)),
        "test_rows": int(len(y_test)),
        "label_distribution": dict(Counter(row["decision_quality"] for row in rows)),
        "features_used": FEATURE_COLUMNS,
        "model_implementation": model_backend,
        "artifact_format": artifact_format,
        "model": model_report,
        "baselines": {
            "majority_class": baseline_majority,
            "simple_profit_lift_rule": baseline_rule,
        },
        "model_beats_majority_baseline": model_report["macro_f1"] > baseline_majority["macro_f1"],
        "model_beats_simple_profit_lift_rule": model_report["macro_f1"] > baseline_rule["macro_f1"],
        "usefulness": {
            "useful": model_report["macro_f1"] > baseline_majority["macro_f1"],
            "reason": "Model beats majority-class guessing on the time-based holdout."
            if model_report["macro_f1"] > baseline_majority["macro_f1"]
            else "Model does not beat majority-class guessing on the time-based holdout.",
            "macro_f1_lift_vs_majority": round(model_report["macro_f1"] - baseline_majority["macro_f1"], 4),
            "macro_f1_lift_vs_simple_profit_rule": round(model_report["macro_f1"] - baseline_rule["macro_f1"], 4),
        },
        "warning": "Engineered labels are derived from before/after outcomes, not official company labels.",
    }
    metrics_path = output_dir / "decision_quality_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    return model_path, metrics_path, importance_path, metrics


def run_pipeline(args):
    dataset_zip = Path(args.dataset_zip)
    output_dir = Path(args.output_dir)
    rows, dataset_path, profile_path, profile = build_dataset(
        dataset_zip=dataset_zip,
        output_dir=output_dir,
        require_fred=args.require_fred,
        max_revenue_events=args.max_revenue_events,
    )
    if len(rows) < 100:
        raise RuntimeError("Not enough engineered pricing decisions were generated for ML training.")
    model_path, metrics_path, importance_path, metrics = train_model(rows, output_dir)

    print("ML decision pipeline complete.")
    print(f"Dataset rows: {len(rows):,}")
    print(f"Labels: {profile['label_distribution']}")
    print(f"Dataset: {dataset_path}")
    print(f"Profile: {profile_path}")
    print(f"Model: {model_path}")
    print(f"Metrics: {metrics_path}")
    print(f"Feature importance: {importance_path}")
    print(f"Model macro F1: {metrics['model']['macro_f1']}")
    print(f"Majority baseline macro F1: {metrics['baselines']['majority_class']['macro_f1']}")


def self_test():
    rows = []
    for index, lift in enumerate([-35, -12, -1, 8, 28] * 60):
        before_profit = 1000
        after_profit = before_profit * (1 + lift / 100)
        before_revenue = 2000
        after_revenue = before_revenue * (1 + lift / 150)
        before_units = 100
        after_units = before_units * (1 + lift / 200)
        row = row_from_event(
            source_dataset="Self Test",
            event_date=date(2025, 1, 1) + timedelta(days=index),
            product_id=f"P{index % 20}",
            category="Test",
            customer_segment="All Customers",
            region="Test",
            unit_price=100 + index % 5,
            previous_price=100,
            quantity_sold=after_units,
            revenue=after_revenue,
            profit=after_profit,
            competitor_price=102,
            discount_percent=0,
            inventory_level=500,
            holiday_flag=0,
            estimated_unit_cost=60,
            cost_quality="real",
            units_before_change=before_units,
            revenue_before_change=before_revenue,
            profit_before_change=before_profit,
        )
        rows.append(row)
    output_dir = DEFAULT_OUTPUT_DIR / "self_test"
    output_dir.mkdir(parents=True, exist_ok=True)
    _, metrics_path, _, metrics = train_model(rows, output_dir)
    assert metrics["row_count"] == 300
    assert metrics["model"]["accuracy"] >= 0.6
    assert metrics_path.exists()
    print("ML pipeline self-test passed.")


def main():
    parser = argparse.ArgumentParser(description="Build FRED-enriched ML pricing decision dataset and train decision-quality model.")
    parser.add_argument("--dataset-zip", default=str(DEFAULT_DATASET_ZIP))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--require-fred", action="store_true", help="Fail if FRED_API_KEY is missing or FRED fetch fails.")
    parser.add_argument("--max-revenue-events", type=int, default=150000, help="Cap dynamic-pricing events to keep local training manageable.")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return
    run_pipeline(args)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ML decision pipeline failed: {error}", file=sys.stderr)
        sys.exit(1)
