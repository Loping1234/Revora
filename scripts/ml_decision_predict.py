#!/usr/bin/env python3
"""
Predict decision quality for one pricing decision from the offline ML artifact.

Input: JSON on stdin using business-friendly fields.
Output: JSON on stdout with predicted label, confidence, class votes, and feature values.
"""

from __future__ import annotations

import json
import math
import pickle
import sys
from pathlib import Path

import numpy as np

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[0]
MODEL_PATH = ROOT / "generated" / "ml" / "decision_quality_model.joblib"

sys.path.insert(0, str(SCRIPT_DIR))
import ml_decision_pipeline as pipeline  # noqa: E402


def load_artifact(path=MODEL_PATH):
    if not path.exists():
        raise FileNotFoundError("ML model artifact not found. Run npm run ml:train first.")

    # Older local artifacts were pickled while the trainer ran as __main__.
    # Register those classes on this script's __main__ module before loading.
    current_main = sys.modules.get("__main__")
    setattr(current_main, "RandomForestLite", pipeline.RandomForestLite)
    setattr(current_main, "TreeNode", pipeline.TreeNode)

    if pipeline.joblib_module is not None:
      try:
          return pipeline.joblib_module.load(path)
      except Exception:
          pass

    with path.open("rb") as handle:
        return pickle.load(handle)


def to_float(value, default=0.0):
    if value is None or value == "":
        return default
    try:
        parsed = float(str(value).replace(",", ""))
        return parsed if math.isfinite(parsed) else default
    except Exception:
        return default


def percent_change(current, previous):
    if not previous:
        return 0.0
    return ((current - previous) / previous) * 100


def encode(mapping, value):
    return mapping.get(str(value or "Unknown"), mapping.get("Unknown", 0))


def build_features(payload, artifact):
    feature_columns = artifact.get("feature_columns") or pipeline.FEATURE_COLUMNS
    medians = np.array(artifact.get("feature_medians") or [0] * len(feature_columns), dtype=float)
    maps = artifact.get("category_maps") or {}

    current_price = to_float(payload.get("currentPrice"))
    previous_price = to_float(payload.get("previousPrice"))
    quantity_sold = to_float(payload.get("quantitySold"))
    units_before = to_float(payload.get("unitsBeforeChange"))
    revenue_before = to_float(payload.get("revenueBeforeChange"))
    profit_before = to_float(payload.get("profitBeforeChange"))
    margin_rate_before = profit_before / revenue_before if revenue_before else 0.0

    estimated_cost = payload.get("estimatedUnitCost")
    if estimated_cost in (None, ""):
        estimated_cost = max(0.0, current_price * (1 - margin_rate_before)) if current_price else 0.0

    values = {
        "unit_price": current_price,
        "previous_price": previous_price,
        "price_change_percent": percent_change(current_price, previous_price),
        "quantity_sold": quantity_sold,
        "units_before_change": units_before,
        "revenue_before_change": revenue_before,
        "profit_before_change": profit_before,
        "competitor_price": to_float(payload.get("competitorPrice")),
        "discount_percent": to_float(payload.get("discountPercent")),
        "inventory_level": to_float(payload.get("inventoryLevel")),
        "holiday_flag": 1.0 if payload.get("holidayFlag") in (True, "true", "1", 1, "yes", "on") else 0.0,
        "inflation_index": to_float(payload.get("inflationIndex")),
        "unemployment_rate": to_float(payload.get("unemploymentRate")),
        "fuel_price": to_float(payload.get("fuelPrice")),
        "producer_price_index": to_float(payload.get("producerPriceIndex")),
        "consumer_sentiment": to_float(payload.get("consumerSentiment")),
        "margin_rate_before": margin_rate_before,
        "estimated_unit_cost": to_float(estimated_cost),
        "source_code": encode(maps.get("source_dataset", {}), payload.get("sourceDataset") or "Manual Decision Tester"),
        "category_code": encode(maps.get("category", {}), payload.get("category")),
        "segment_code": encode(maps.get("customer_segment", {}), payload.get("customerSegment")),
        "region_code": encode(maps.get("region", {}), payload.get("region")),
    }

    vector = np.array([to_float(values.get(column), np.nan) for column in feature_columns], dtype=float)
    vector = np.where(np.isfinite(vector), vector, medians)
    return vector.reshape(1, -1), values


def probability_vector(model, X):
    if hasattr(model, "predict_proba"):
        probabilities = model.predict_proba(X)[0]
        return np.array(probabilities, dtype=float)

    prediction = int(model.predict(X)[0])
    probabilities = np.zeros(len(pipeline.LABELS), dtype=float)
    probabilities[prediction] = 1.0
    return probabilities


def main():
    raw = sys.stdin.read().strip()
    payload = json.loads(raw or "{}")
    artifact = load_artifact()
    X, feature_values = build_features(payload, artifact)
    model = artifact.get("model")

    if model is None:
        raise RuntimeError("ML artifact is missing the trained model.")

    probabilities = probability_vector(model, X)
    predicted_index = int(np.argmax(probabilities))
    predicted_label = pipeline.LABELS[predicted_index]
    class_votes = {
        label: round(float(probabilities[index]), 4)
        for index, label in enumerate(pipeline.LABELS)
    }

    result = {
        "predictedLabel": predicted_label,
        "confidence": round(float(probabilities[predicted_index]), 4),
        "classVotes": class_votes,
        "featureValues": {
            key: round(float(value), 6) if isinstance(value, (int, float)) and math.isfinite(float(value)) else value
            for key, value in feature_values.items()
        },
        "modelType": artifact.get("model_type", "Unknown"),
        "artifactPath": str(MODEL_PATH),
    }
    print(json.dumps(result))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ML prediction failed: {error}", file=sys.stderr)
        sys.exit(1)
