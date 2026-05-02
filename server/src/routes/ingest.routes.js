import crypto from "node:crypto";
import { Router } from "express";
import { ImportBatch } from "../models/import-batch.model.js";
import { ImportRowIssue } from "../models/import-row-issue.model.js";
import { Product } from "../models/product.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { setLatestImportBatchActive } from "../services/import-batch.service.js";
import { logAudit } from "../services/audit.service.js";
import { getWorkspaceId, workspaceFilter } from "../utils/workspace.js";

export const ingestRouter = Router();

function compactKey(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeProductKey(value) {
  return compactKey(value);
}

function getValue(row, aliases) {
  const entries = Object.entries(row || {});
  const aliasSet = new Set(aliases.map(compactKey));
  const found = entries.find(([key]) => aliasSet.has(compactKey(key)));
  return found?.[1];
}

function parseBusinessNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const normalized = String(value).replace(/[₹$€£,\s]/g, "").replace(/[A-Za-z]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

function parseBooleanValue(value) {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "y", "promo", "promotion", "holiday", "stockout", "out of stock"].includes(String(value || "").trim().toLowerCase());
}

function parseDateValue(value) {
  const parsed = value ? new Date(value) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

function buildDateParts(date) {
  const month = date.getMonth() + 1;
  const quarter = Math.ceil(month / 3);
  const dayOfWeek = date.getDay();
  const seasons = {
    12: "Winter",
    1: "Winter",
    2: "Winter",
    3: "Spring",
    4: "Spring",
    5: "Spring",
    6: "Summer",
    7: "Summer",
    8: "Summer",
    9: "Autumn",
    10: "Autumn",
    11: "Autumn"
  };

  return {
    month,
    quarter,
    dayOfWeek,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    season: seasons[month]
  };
}

function normalizeSegment(value) {
  const raw = String(value || "Retail").trim();
  const key = compactKey(raw) || "retail";
  return {
    key,
    label: raw || "Retail"
  };
}

function buildFingerprint({ source, identity, date, price, quantity, segment }) {
  const parts = [
    source,
    normalizeProductKey(identity),
    date instanceof Date ? date.toISOString().slice(0, 10) : String(date || ""),
    Number(price).toFixed(4),
    Number(quantity).toFixed(4),
    normalizeProductKey(segment)
  ];

  return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
}

async function resolveApiProduct({ workspaceId, sku, externalProductId, productName, category, price, cost, inventory }) {
  const identity = sku || (externalProductId ? `PID-${externalProductId}` : undefined);
  let product = identity ? await Product.findOne({ workspaceId, sku: identity }).lean() : null;

  if (!product && productName) {
    product = await Product.findOne({ workspaceId, sku: `AUTO-${normalizeProductKey(productName)}` }).lean();
  }

  if (product) return product;

  return Product.create({
    workspaceId,
    sku: identity || `AUTO-${normalizeProductKey(productName || category || "product")}-${Date.now()}`,
    name: productName || (externalProductId ? `Product ${externalProductId}` : category || "Imported Product"),
    category: category || "Uncategorized",
    basePrice: price,
    cost: Number.isFinite(cost) ? cost : Math.max(0, price * 0.65),
    costQuality: Number.isFinite(cost) ? "real" : "estimated",
    inventory: Number.isFinite(inventory) ? inventory : 0
  });
}

ingestRouter.post("/sales", async (req, res, next) => {
  try {
    return res.status(409).json({
      success: false,
      error: {
        message: "Direct sales ingestion is disabled. Use /upload/sales/preview and /upload/sales/stage so data can pass quality review before it affects pricing models.",
        statusCode: 409
      }
    });

    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const source = String(req.body?.source || "api-ingest").trim() || "api-ingest";
    const workspaceId = getWorkspaceId(req);

    if (!rows.length) {
      return res.status(400).json({
        success: false,
        error: { message: "rows must be a non-empty array", statusCode: 400 }
      });
    }

    const records = [];
    const errors = [];
    const rowIssues = [];
    const seenFingerprints = new Set();
    const productsDetected = new Set();
    let costRowsDetected = 0;
    let belowCostRowsDetected = 0;
    let stockoutRowsDetected = 0;
    const importBatch = await ImportBatch.create({
      workspaceId,
      source,
      status: "processing",
      detectedColumns: rows[0] ? Object.keys(rows[0]) : [],
      mappedFields: {
        product: "sku/productId/productName/category",
        price: "price or revenue / quantity",
        quantity: "quantity"
      },
      rowCounts: {
        totalRows: rows.length,
        processedRows: rows.length
      }
    });

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const rowNumber = index + 1;

      try {
        const quantity = parseBusinessNumber(getValue(row, ["quantity", "quantitySold", "qty", "units"]));
        const revenue = parseBusinessNumber(getValue(row, ["revenue", "salesAmount", "sales"]));
        let price = parseBusinessNumber(getValue(row, ["price", "unitPrice", "sellingPrice"]));

        if (!Number.isFinite(price) && Number.isFinite(revenue) && Number.isFinite(quantity) && quantity > 0) {
          price = revenue / quantity;
        }

        if (!Number.isFinite(price) || price <= 0) throw new Error("missing or invalid price");
        if (!Number.isFinite(quantity) || quantity < 0) throw new Error("missing or invalid quantity");

        const cost = parseBusinessNumber(getValue(row, ["cost", "unitCost"]));
        const competitorPrice = parseBusinessNumber(getValue(row, ["competitorPrice", "marketPrice"]));
        const inventory = parseBusinessNumber(getValue(row, ["inventory", "stock"]));
        const discount = parseBusinessNumber(getValue(row, ["discount"]));
        const marketingSpend = parseBusinessNumber(getValue(row, ["marketingSpend", "marketing"]));
        const grossMargin = parseBusinessNumber(getValue(row, ["grossMargin", "margin"]));
        const date = parseDateValue(getValue(row, ["date", "saleDate", "orderDate"]));
        const dateParts = buildDateParts(date);
        const segment = normalizeSegment(getValue(row, ["customerSegment", "segment", "customerType"]));
        const sku = String(getValue(row, ["sku", "productSku"]) || "").trim();
        const externalProductId = String(getValue(row, ["productId", "externalProductId", "productCode"]) || "").trim();
        const productName = String(getValue(row, ["productName", "name"]) || "").trim();
        const category = String(getValue(row, ["category", "productCategory"]) || "").trim();
        const region = String(getValue(row, ["region"]) || "").trim();
        const channel = String(getValue(row, ["channel", "salesChannel"]) || "").trim();
        const isPromotion = parseBooleanValue(getValue(row, ["promotion", "promo"])) || Number(discount || 0) > 0;
        const isHoliday = parseBooleanValue(getValue(row, ["holiday"]));
        const isStockout = parseBooleanValue(getValue(row, ["stockoutFlag", "stockout"])) || inventory === 0;
        if (Number.isFinite(cost)) costRowsDetected += 1;
        if (Number.isFinite(cost) && price < cost) belowCostRowsDetected += 1;
        if (isStockout) stockoutRowsDetected += 1;
        const product = await resolveApiProduct({ workspaceId, sku, externalProductId, productName, category, price, cost, inventory });
        const identity = sku || externalProductId || productName || category || product.sku;
        const rowFingerprint = buildFingerprint({ source, identity, date, price, quantity, segment: segment.key });

        if (seenFingerprints.has(rowFingerprint)) continue;
        seenFingerprints.add(rowFingerprint);
        productsDetected.add(String(product._id));

        records.push({
          workspaceId,
          productId: product._id,
          price,
          quantity,
          competitorPrice: Number.isFinite(competitorPrice) ? competitorPrice : undefined,
          cost: Number.isFinite(cost) ? cost : undefined,
          inventory: Number.isFinite(inventory) ? inventory : undefined,
          revenue: Number.isFinite(revenue) ? revenue : price * quantity,
          grossMargin: Number.isFinite(grossMargin) ? grossMargin : undefined,
          region: region || undefined,
          channel: channel || undefined,
          promotion: isPromotion,
          discount: Number.isFinite(discount) ? discount : undefined,
          holiday: isHoliday,
          marketingSpend: Number.isFinite(marketingSpend) ? marketingSpend : undefined,
          stockoutFlag: isStockout,
          dateParts,
          externalProductId: externalProductId || undefined,
          customerSegment: segment.key,
          customerSegmentLabel: segment.label,
          productSnapshot: {
            externalProductId: externalProductId || undefined,
            sku: product.sku,
            name: productName || product.name,
            category: category || product.category
          },
          date,
          rowFingerprint,
          importBatchId: importBatch._id,
          importMeta: {
            source,
            rowNumber
          }
        });
      } catch (error) {
        errors.push({ row: rowNumber, reason: error.message });
        rowIssues.push({
          workspaceId,
          importBatchId: importBatch._id,
          source,
          rowNumber,
          reason: error.message,
          rawRow: row
        });
      }
    }

    const existing = records.length
      ? await SalesData.find(workspaceFilter(req, { rowFingerprint: { $in: records.map((record) => record.rowFingerprint) } })).select("rowFingerprint").lean()
      : [];
    const existingFingerprints = new Set(existing.map((record) => record.rowFingerprint));
    const uniqueRecords = records.filter((record) => !existingFingerprints.has(record.rowFingerprint));

    if (uniqueRecords.length) {
      await SalesData.insertMany(uniqueRecords, { ordered: false });
      await setLatestImportBatchActive(importBatch._id);
    }

    if (rowIssues.length) {
      await ImportRowIssue.insertMany(rowIssues.slice(0, 250), { ordered: false });
    }

    const dataFitnessScore = uniqueRecords.length
      ? Math.max(0, Math.min(100, Math.round(
        60 +
        (costRowsDetected ? 15 : -20) -
        (belowCostRowsDetected ? 10 : 0) -
        (stockoutRowsDetected > rows.length * 0.25 ? 15 : 0)
      )))
      : 0;
    const dataFitnessLabel = dataFitnessScore >= 75 ? "Model usable" : dataFitnessScore >= 50 ? "Model risky" : "Recommendation blocked";

    await ImportBatch.findByIdAndUpdate(importBatch._id, {
      status: uniqueRecords.length ? (errors.length ? "completed_with_errors" : "completed") : "failed",
      rowCounts: {
        totalRows: rows.length,
        processedRows: rows.length,
        importedRows: uniqueRecords.length,
        skippedRows: errors.length + (records.length - uniqueRecords.length),
        duplicateRowsSkipped: records.length - uniqueRecords.length,
        invalidRowsSkipped: errors.length
      },
      productSummary: {
        productsDetected: productsDetected.size
      },
      dataFitnessScore,
      dataFitnessLabel,
      costQualitySummary: {
        label: costRowsDetected ? (belowCostRowsDetected ? "inconsistent" : "real") : "missing",
        costRows: costRowsDetected,
        coveragePercent: rows.length ? Number(((costRowsDetected / rows.length) * 100).toFixed(1)) : 0,
        belowCostRows: belowCostRowsDetected
      },
      datasetWarnings: [
        ...(!costRowsDetected ? ["No cost values were imported. Profit recommendations will be blocked unless trusted product cost exists."] : []),
        ...(belowCostRowsDetected ? [`${belowCostRowsDetected} rows had price below cost.`] : []),
        ...(stockoutRowsDetected ? [`${stockoutRowsDetected} stockout rows detected.`] : [])
      ],
      completedAt: new Date()
    });
    await logAudit(req, {
      action: "ingest.sales_json",
      targetType: "ImportBatch",
      targetId: importBatch._id,
      summary: `API ingest processed ${rows.length} rows and imported ${uniqueRecords.length}.`,
      metadata: {
        source,
        totalRows: rows.length,
        importedRows: uniqueRecords.length,
        skippedRows: errors.length + (records.length - uniqueRecords.length)
      }
    });

    res.status(201).json({
      success: true,
      data: {
        source,
        importBatchId: importBatch._id,
        totalRows: rows.length,
        importedRows: uniqueRecords.length,
        skippedRows: errors.length + (records.length - uniqueRecords.length),
        productsDetected: productsDetected.size,
        dataFitnessScore,
        dataFitnessLabel,
        errors: errors.slice(0, 10),
        message: "Sales rows ingested through API. CSV upload remains available for manual imports."
      }
    });
  } catch (error) {
    next(error);
  }
});
