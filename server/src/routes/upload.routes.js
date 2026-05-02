import { parse } from "csv-parse";
import crypto from "node:crypto";
import { Router } from "express";
import fs from "node:fs";
import { unlink } from "node:fs/promises";
import mongoose from "mongoose";
import multer from "multer";
import os from "node:os";
import { DemandModel } from "../models/demand-model.model.js";
import { ImportBatch } from "../models/import-batch.model.js";
import { ImportRowIssue } from "../models/import-row-issue.model.js";
import { Product } from "../models/product.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { SalesDataStaging } from "../models/sales-data-staging.model.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";
import { setLatestImportBatchActive } from "../services/import-batch.service.js";
import { normalizeSegmentValue } from "../utils/segments.js";
import { getWorkspaceId, workspaceFilter } from "../utils/workspace.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (req, file, callback) => {
      callback(null, `dp-di-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.csv`);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

const MAX_UPLOAD_ROWS = 10000;
const INSERT_BATCH_SIZE = 500;
const STAGING_TTL_HOURS = 24;
const ROLLBACK_WINDOW_DAYS = 7;

export const uploadRouter = Router();

async function readCsvPreview(filePath) {
  let headers = null;
  const rowsToProcess = [];
  let totalRows = 0;

  const parser = fs.createReadStream(filePath).pipe(parse({
    bom: true,
    relax_column_count: true,
    relax_quotes: true,
    skip_empty_lines: true,
    trim: true
  }));

  for await (const row of parser) {
    if (!headers) {
      headers = row.map((header, index) => String(header || `Column ${index + 1}`).trim());
      continue;
    }

    totalRows += 1;

    if (rowsToProcess.length < MAX_UPLOAD_ROWS) {
      rowsToProcess.push(row);
    }
  }

  return {
    headers,
    rowsToProcess,
    totalRows,
    truncated: totalRows > MAX_UPLOAD_ROWS
  };
}

function normalizeHeader(header) {
  const original = String(header || "").trim() || "Unnamed column";
  const spaced = original
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[$₹€£]/g, " currency ")
    .toLowerCase();
  const tokens = spaced.split(/[^a-z0-9]+/).filter(Boolean);
  const compact = tokens.join("");

  return { original, tokens, compact };
}

function hasToken(header, token) {
  return header.tokens.includes(token) || header.compact.includes(token);
}

function hasAllTokens(header, tokens) {
  return tokens.every((token) => hasToken(header, token));
}

function hasAnyToken(header, tokens) {
  return tokens.some((token) => hasToken(header, token));
}

const fieldDefinitions = {
  sku: [
    { key: "sku", priority: 100, match: (header) => header.compact === "sku" || header.compact === "productsku" }
  ],
  productId: [
    { key: "productid", priority: 100, match: (header) => ["productid", "productcode", "itemid", "itemcode"].includes(header.compact) }
  ],
  productName: [
    { key: "productname", priority: 100, match: (header) => ["productname", "itemname"].includes(header.compact) || hasAllTokens(header, ["product", "name"]) }
  ],
  category: [
    { key: "productcategory", priority: 90, match: (header) => header.compact === "productcategory" || hasAllTokens(header, ["product", "category"]) },
    { key: "category", priority: 80, match: (header) => header.compact === "category" }
  ],
  price: [
    {
      key: "unitprice",
      priority: 100,
      match: (header) =>
        !hasAnyToken(header, ["competitor", "rival", "market", "cost"]) &&
        (header.compact.includes("unitprice") ||
          header.compact.includes("priceperunit") ||
          header.compact.includes("pricebase") ||
          hasAllTokens(header, ["unit", "price"]))
    },
    {
      key: "sellingprice",
      priority: 90,
      match: (header) =>
        !hasAnyToken(header, ["competitor", "rival", "market", "cost"]) &&
        (header.compact.includes("sellingprice") || hasAllTokens(header, ["selling", "price"]))
    },
    {
      key: "price",
      priority: 80,
      match: (header) =>
        (header.compact === "price" || header.tokens.includes("price")) &&
        !hasAnyToken(header, ["competitor", "rival", "market", "cost", "revenue", "sales", "amount", "gross", "margin"])
    }
  ],
  quantity: [
    { key: "quantitysold", priority: 100, match: (header) => header.compact.includes("quantitysold") || hasAllTokens(header, ["quantity", "sold"]) },
    { key: "qtysold", priority: 90, match: (header) => header.compact.includes("qtysold") || hasAllTokens(header, ["qty", "sold"]) },
    { key: "quantity", priority: 80, match: (header) => header.compact === "quantity" || header.tokens.includes("quantity") },
    { key: "qty", priority: 70, match: (header) => header.compact === "qty" || header.tokens.includes("qty") }
  ],
  date: [
    { key: "dateofsale", priority: 100, match: (header) => header.compact.includes("dateofsale") || hasAllTokens(header, ["date", "sale"]) },
    { key: "saledate", priority: 90, match: (header) => header.compact.includes("saledate") || hasAllTokens(header, ["sale", "date"]) },
    { key: "date", priority: 80, match: (header) => header.compact === "date" || header.tokens.includes("date") }
  ],
  customerSegment: [
    { key: "customersegment", priority: 100, match: (header) => header.compact.includes("customersegment") || hasAllTokens(header, ["customer", "segment"]) },
    { key: "segment", priority: 90, match: (header) => header.compact === "segment" || header.tokens.includes("segment") },
    { key: "customertype", priority: 80, match: (header) => header.compact.includes("customertype") || hasAllTokens(header, ["customer", "type"]) },
    { key: "customergender", priority: 50, match: (header) => header.compact.includes("customergender") || hasAllTokens(header, ["customer", "gender"]) },
    { key: "region", priority: 40, match: (header) => header.compact.includes("salesregion") || header.compact === "region" || header.tokens.includes("region") }
  ],
  cost: [
    { key: "unitcost", priority: 100, match: (header) => header.compact.includes("unitcost") || hasAllTokens(header, ["unit", "cost"]) },
    { key: "productcost", priority: 90, match: (header) => header.compact.includes("productcost") || hasAllTokens(header, ["product", "cost"]) },
    { key: "cost", priority: 80, match: (header) => header.compact === "cost" || header.tokens.includes("cost") }
  ],
  competitorPrice: [
    { key: "competitorprice", priority: 100, match: (header) => header.compact.includes("competitorprice") || hasAllTokens(header, ["competitor", "price"]) },
    { key: "marketprice", priority: 90, match: (header) => header.compact.includes("marketprice") || hasAllTokens(header, ["market", "price"]) },
    { key: "rivalprice", priority: 80, match: (header) => header.compact.includes("rivalprice") || hasAllTokens(header, ["rival", "price"]) }
  ],
  inventory: [
    { key: "stocklevel", priority: 100, match: (header) => header.compact.includes("stocklevel") || hasAllTokens(header, ["stock", "level"]) },
    { key: "inventory", priority: 90, match: (header) => header.compact === "inventory" || header.tokens.includes("inventory") },
    { key: "stock", priority: 80, match: (header) => header.compact === "stock" || header.tokens.includes("stock") }
  ],
  revenue: [
    { key: "salesrevenue", priority: 100, match: (header) => header.compact.includes("salesrevenue") || hasAllTokens(header, ["sales", "revenue"]) },
    { key: "revenue", priority: 90, match: (header) => header.compact === "revenue" || header.tokens.includes("revenue") },
    { key: "salesamount", priority: 80, match: (header) => header.compact.includes("salesamount") || hasAllTokens(header, ["sales", "amount"]) }
  ],
  grossMargin: [
    { key: "grossmargin", priority: 100, match: (header) => header.compact.includes("grossmargin") || hasAllTokens(header, ["gross", "margin"]) },
    { key: "margin", priority: 80, match: (header) => header.compact === "margin" || header.tokens.includes("margin") }
  ],
  region: [
    { key: "region", priority: 90, match: (header) => header.compact === "region" || header.compact.includes("salesregion") },
    { key: "market", priority: 70, match: (header) => header.compact === "market" || header.tokens.includes("market") }
  ],
  channel: [
    { key: "channel", priority: 90, match: (header) => header.compact === "channel" || header.compact.includes("saleschannel") },
    { key: "storetype", priority: 70, match: (header) => header.compact.includes("storetype") }
  ],
  promotion: [
    { key: "promotion", priority: 90, match: (header) => header.compact.includes("promotion") || header.compact.includes("promo") },
    { key: "campaign", priority: 70, match: (header) => header.compact.includes("campaign") }
  ],
  discount: [
    { key: "discount", priority: 90, match: (header) => header.compact.includes("discount") || header.compact.includes("markdown") }
  ],
  holiday: [
    { key: "holiday", priority: 90, match: (header) => header.compact.includes("holiday") || header.compact.includes("festival") }
  ],
  marketingSpend: [
    { key: "marketingspend", priority: 90, match: (header) => header.compact.includes("marketingspend") || hasAllTokens(header, ["marketing", "spend"]) },
    { key: "adspend", priority: 80, match: (header) => header.compact.includes("adspend") || hasAllTokens(header, ["ad", "spend"]) }
  ],
  stockoutFlag: [
    { key: "stockout", priority: 100, match: (header) => header.compact.includes("stockout") || hasAllTokens(header, ["out", "stock"]) },
    { key: "outofstock", priority: 90, match: (header) => header.compact.includes("outofstock") }
  ]
};

function buildColumnMapping(headers) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const fields = {};
  const mappedFields = {};

  for (const [fieldName, definitions] of Object.entries(fieldDefinitions)) {
    const candidates = [];

    normalizedHeaders.forEach((header, index) => {
      definitions.forEach((definition) => {
        if (definition.match(header)) {
          candidates.push({
            fieldName,
            index,
            header: header.original,
            priority: definition.priority,
            key: definition.key
          });
        }
      });
    });

    candidates.sort((a, b) => b.priority - a.priority || a.index - b.index);
    fields[fieldName] = candidates;

    if (candidates[0]) {
      mappedFields[fieldName] = candidates[0].header;
    }
  }

  if (!mappedFields.price && mappedFields.revenue && mappedFields.quantity) {
    mappedFields.price = `${mappedFields.revenue} / ${mappedFields.quantity}`;
  }

  return {
    detectedColumns: normalizedHeaders.map((header) => header.original),
    fields,
    mappedFields
  };
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function parseBusinessNumber(value) {
  if (isBlank(value)) return undefined;
  const text = String(value).trim();
  const isParenthesizedNegative = /^\(.*\)$/.test(text);
  const cleaned = text.replace(/,/g, "").replace(/[^\d.-]/g, "");

  if (!cleaned || cleaned === "-" || cleaned === ".") return Number.NaN;

  const number = Number(cleaned);
  if (!Number.isFinite(number)) return Number.NaN;

  return isParenthesizedNegative && number > 0 ? -number : number;
}

function parseBooleanValue(value) {
  if (isBlank(value)) return false;
  const normalized = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "y", "promo", "promotion", "holiday", "stockout", "out of stock"].includes(normalized);
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

function normalizeCompareValue(value, fieldName) {
  if (["price", "quantity", "cost", "competitorPrice", "inventory", "revenue", "grossMargin"].includes(fieldName)) {
    const number = parseBusinessNumber(value);
    return Number.isFinite(number) ? String(number) : String(value).trim().toLowerCase();
  }

  return String(value).trim().toLowerCase();
}

function incrementConflict(conflicts, fieldName) {
  conflicts[fieldName] = (conflicts[fieldName] || 0) + 1;
}

function readField(rowValues, candidates, fieldName, conflicts) {
  if (!candidates?.length) return { value: undefined, source: undefined, conflict: false };

  const priorities = [...new Set(candidates.map((candidate) => candidate.priority))].sort((a, b) => b - a);

  for (const priority of priorities) {
    const values = candidates
      .filter((candidate) => candidate.priority === priority)
      .map((candidate) => ({
        value: rowValues[candidate.index],
        source: candidate.header
      }))
      .filter((item) => !isBlank(item.value));

    if (!values.length) continue;

    if (values.length === 1) return { ...values[0], conflict: false };

    const counts = new Map();
    values.forEach((item) => {
      const normalizedValue = normalizeCompareValue(item.value, fieldName);
      const current = counts.get(normalizedValue) || { count: 0, item };
      current.count += 1;
      counts.set(normalizedValue, current);
    });

    const ranked = [...counts.values()].sort((a, b) => b.count - a.count);
    const conflict = ranked.length > 1;

    if (conflict) incrementConflict(conflicts, fieldName);

    if (ranked.length > 1 && ranked[0].count === ranked[1].count) {
      return { value: undefined, source: ranked[0].item.source, conflict: true };
    }

    return { ...ranked[0].item, conflict };
  }

  return { value: undefined, source: undefined, conflict: false };
}

function createSku(value) {
  const sku = String(value || "Imported Product")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

  return sku || "IMPORTED-PRODUCT";
}

function normalizeProductKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function buildRawRow(headers, rowValues) {
  return headers.reduce((rawRow, header, index) => {
    const key = header || `Column ${index + 1}`;

    if (rawRow[key] === undefined) {
      rawRow[key] = rowValues[index];
    } else if (Array.isArray(rawRow[key])) {
      rawRow[key].push(rowValues[index]);
    } else {
      rawRow[key] = [rawRow[key], rowValues[index]];
    }

    return rawRow;
  }, {});
}

function rawRowsMatch(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function parseDateValue(value, rowNumber) {
  if (isBlank(value)) return new Date();

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Row ${rowNumber}: invalid date`);
  }

  return date;
}

function buildProductIndexes(products) {
  const bySku = new Map();
  const byName = new Map();
  const byNameCategory = new Map();
  const byCategory = new Map();
  const productsList = [];

  products.forEach((product) => {
    productsList.push(product);
    const skuKeys = [product.sku, product.normalizedSku, ...(product.externalProductIds || []), ...(product.aliases || [])].filter(Boolean);
    const nameKeys = [product.name, product.normalizedName, ...(product.aliases || [])].filter(Boolean);
    skuKeys.forEach((value) => {
      bySku.set(String(value).trim().toUpperCase(), product);
      bySku.set(createSku(value), product);
      bySku.set(normalizeProductKey(value), product);
    });
    nameKeys.forEach((value) => {
      byName.set(normalizeProductKey(value), product);
      byNameCategory.set(`${normalizeProductKey(value)}|${normalizeProductKey(product.category)}`, product);
    });
    if (product.category) {
      byCategory.set(normalizeProductKey(product.category), product);
    }
  });

  return { bySku, byName, byNameCategory, byCategory, products: productsList };
}

function getExternalProductId(productId) {
  if (isBlank(productId) || mongoose.Types.ObjectId.isValid(productId)) return undefined;
  return String(productId).trim();
}

function getIdentitySku({ sku, externalProductId, productName, category }) {
  if (!isBlank(sku)) return sku;
  if (!isBlank(externalProductId)) return `PID-${externalProductId}`;
  return undefined;
}

async function resolveProduct({ productId, sku, productName, category, fallbackPrice, cost, inventory, productIndexes }) {
  const externalProductId = getExternalProductId(productId);

  if (productId && mongoose.Types.ObjectId.isValid(productId)) {
    const product = await Product.findById(productId).lean();
    if (product) return { productId: product._id, status: "matchedByProductId", product };
  }

  const identitySku = getIdentitySku({ sku, externalProductId, productName, category });

  if (identitySku) {
    const directSku = String(identitySku).trim().toUpperCase();
    const generatedSku = createSku(identitySku);
    const product = productIndexes.bySku.get(directSku) || productIndexes.bySku.get(generatedSku);
    if (product) return { productId: product._id, status: "matchedBySku", product };
  }

  const productKey = normalizeProductKey(productName);
  const categoryKey = normalizeProductKey(category);
  const matchedProduct = categoryKey
    ? productIndexes.byNameCategory.get(`${productKey}|${categoryKey}`)
    : productIndexes.byName.get(productKey);

  if (matchedProduct) {
    return { productId: matchedProduct._id, status: "matchedByName", product: matchedProduct };
  }

  if (!productKey && categoryKey) {
    const categoryProduct = productIndexes.byCategory.get(categoryKey);
    if (categoryProduct) return { productId: categoryProduct._id, status: "matchedByCategory", product: categoryProduct };
  }

  // Do not auto-attach fuzzy matches. Similar-looking products are surfaced in
  // Product Matching Review so a user can merge them manually.

  const productLabel = String(productName || (externalProductId ? `Product ${externalProductId}` : "") || category || sku || "").trim();

  if (!productLabel) {
    throw new Error("missing product identity");
  }

  const createdProduct = await Product.create({
    workspaceId: productIndexes.workspaceId,
    name: productLabel,
    sku: createSku(identitySku || productLabel),
    category: String(category || productLabel).trim(),
    basePrice: fallbackPrice,
    cost: Number.isFinite(cost) ? cost : Number((fallbackPrice * 0.6).toFixed(2)),
    costQuality: Number.isFinite(cost) ? "real" : "estimated",
    inventory: Number.isFinite(inventory) ? inventory : 100,
    normalizedSku: normalizeProductKey(createSku(identitySku || productLabel)),
    normalizedName: normalizeProductKey(productLabel),
    externalProductIds: externalProductId ? [externalProductId] : [],
    aliases: [productLabel, identitySku, sku, externalProductId].filter((value) => !isBlank(value)).map(String),
    matchConfidence: 0.65
  });
  const product = createdProduct.toObject();

  productIndexes.bySku.set(String(product.sku).trim().toUpperCase(), product);
  productIndexes.bySku.set(createSku(product.sku), product);
  productIndexes.byName.set(normalizeProductKey(product.name), product);
  productIndexes.byNameCategory.set(`${normalizeProductKey(product.name)}|${normalizeProductKey(product.category)}`, product);
  productIndexes.byCategory.set(normalizeProductKey(product.category), product);

  return { productId: product._id, status: "created", product };
}

function readNumberField(rowValues, candidates, fieldName, conflicts) {
  const field = readField(rowValues, candidates, fieldName, conflicts);
  const parsed = parseBusinessNumber(field.value);
  return { ...field, fieldName, parsed };
}

function buildRowFingerprint({ source, sku, productId, productName, date, price, quantity, segment }) {
  const identity = sku || getExternalProductId(productId) || productId || productName || "unknown-product";
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

function stagingExpiryDate() {
  return new Date(Date.now() + STAGING_TTL_HOURS * 60 * 60 * 1000);
}

function getActor(req) {
  return req.user ? { id: req.user.id, name: req.user.name, role: req.user.role } : undefined;
}

function setRowIssue(row, code, reason, status = "warning") {
  row.issueCodes = [...new Set([...(row.issueCodes || []), code])];
  row.issueReasons = [...new Set([...(row.issueReasons || []), reason])];

  if (status === "error") {
    row.rowStatus = "error";
    row.excludedFromModel = true;
    return;
  }

  if (row.rowStatus === "error") return;

  if (status === "excluded_from_model") {
    row.rowStatus = "excluded_from_model";
    row.excludedFromModel = true;
    return;
  }

  if (row.rowStatus !== "excluded_from_model") {
    row.rowStatus = "warning";
  }
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function quantile(values, q) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] === undefined ? sorted[base] : sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function iqrBounds(values, multiplier = 1.5) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 4) return null;
  const q1 = quantile(clean, 0.25);
  const q3 = quantile(clean, 0.75);
  const iqr = q3 - q1;
  if (iqr <= 0) return null;
  return {
    low: q1 - multiplier * iqr,
    high: q3 + multiplier * iqr,
    median: median(clean)
  };
}

function detectCurrencyHints(headers) {
  const hints = new Set();
  headers.forEach((header) => {
    const text = String(header || "").toLowerCase();
    if (text.includes("inr") || text.includes("₹") || text.includes("rs")) hints.add("INR");
    if (text.includes("usd") || text.includes("$")) hints.add("USD");
    if (text.includes("eur") || text.includes("€")) hints.add("EUR");
    if (text.includes("gbp") || text.includes("£")) hints.add("GBP");
  });
  return [...hints];
}

function buildStagedProductIdentity({ productId, sku, productName, category }) {
  const externalProductId = getExternalProductId(productId);
  const identity = String(sku || externalProductId || productName || category || "").trim();
  const productLabel = String(productName || (externalProductId ? `Product ${externalProductId}` : "") || category || sku || "").trim();

  if (!identity && !productLabel) {
    throw new Error("missing product identity");
  }

  const generatedSku = createSku(sku || (externalProductId ? `PID-${externalProductId}` : productLabel || identity));
  const productIdentityKey = normalizeProductKey(sku || externalProductId || `${productLabel}|${category}`);

  return {
    externalProductId,
    productIdentityKey,
    productSnapshot: {
      externalProductId,
      sku: generatedSku,
      name: productLabel || generatedSku,
      category: String(category || productLabel || "Uncategorized").trim()
    }
  };
}

export function buildQualitySummary(rows, mapping, totalRows, truncated, datasetWarnings = []) {
  const counts = rows.reduce(
    (summary, row) => {
      summary[row.rowStatus] = (summary[row.rowStatus] || 0) + 1;
      if (row.excludedFromModel) summary.excludedFromModel += 1;
      if (row.rowStatus !== "error") {
        summary.commitEligibleRows += 1;
        if (!row.excludedFromModel) summary.modelEligibleRows += 1;
      }
      if (row.cost !== undefined && row.cost !== null) summary.costRows += 1;
      if (row.competitorPrice !== undefined && row.competitorPrice !== null) summary.competitorRows += 1;
      if (row.stockoutFlag) summary.stockoutRows += 1;
      if (row.promotion) summary.promotionRows += 1;
      return summary;
    },
    {
      accepted: 0,
      warning: 0,
      excluded_from_model: 0,
      error: 0,
      excludedFromModel: 0,
      commitEligibleRows: 0,
      modelEligibleRows: 0,
      costRows: 0,
      competitorRows: 0,
      stockoutRows: 0,
      promotionRows: 0
    }
  );
  const validRows = rows.filter((row) => row.rowStatus !== "error");
  const productKeys = new Set(validRows.map((row) => row.productIdentityKey).filter(Boolean));
  const segmentCounts = validRows.reduce((countsBySegment, row) => {
    const label = row.customerSegmentLabel || "Retail";
    countsBySegment[label] = (countsBySegment[label] || 0) + 1;
    return countsBySegment;
  }, {});
  const dates = validRows.map((row) => row.date).filter(Boolean).sort((a, b) => new Date(a) - new Date(b));
  const readinessByProduct = validRows.reduce((summary, row) => {
    const key = row.productIdentityKey;
    if (!key) return summary;
    const product = summary.get(key) || { rows: 0, modelRows: 0, prices: new Set() };
    product.rows += 1;
    if (!row.excludedFromModel) {
      product.modelRows += 1;
      product.prices.add(Number(row.price).toFixed(4));
    }
    summary.set(key, product);
    return summary;
  }, new Map());
  const readinessCounts = [...readinessByProduct.values()].reduce(
    (countsByReadiness, product) => {
      if (product.modelRows >= 8 && product.prices.size >= 3) countsByReadiness.ready += 1;
      else if (product.modelRows >= 3 && product.prices.size >= 2) countsByReadiness.limited += 1;
      else countsByReadiness.notReady += 1;
      return countsByReadiness;
    },
    { ready: 0, limited: 0, notReady: 0 }
  );
  const dataFitnessScore = validRows.length
    ? Math.max(0, Math.min(100, Math.round(
      (readinessCounts.ready * 100 + readinessCounts.limited * 65 + readinessCounts.notReady * 25) /
      Math.max(1, readinessCounts.ready + readinessCounts.limited + readinessCounts.notReady) -
      (counts.costRows ? 0 : 20) -
      (counts.excludedFromModel > validRows.length * 0.2 ? 15 : 0)
    )))
    : 0;

  return {
    totalRows,
    processedRows: rows.length,
    truncated,
    ...counts,
    productsDetected: productKeys.size,
    segmentsDetected: segmentCounts,
    detectedColumns: mapping.detectedColumns,
    mappedFields: mapping.mappedFields,
    dateRange: {
      start: dates[0] || null,
      end: dates[dates.length - 1] || null
    },
    costCoveragePercent: validRows.length ? Number((counts.costRows / validRows.length * 100).toFixed(1)) : 0,
    competitorCoveragePercent: validRows.length ? Number((counts.competitorRows / validRows.length * 100).toFixed(1)) : 0,
    productsReady: readinessCounts.ready,
    productsLimited: readinessCounts.limited,
    productsNotReady: readinessCounts.notReady,
    dataFitnessScore,
    dataFitnessLabel: dataFitnessScore >= 75 ? "Model usable" : dataFitnessScore >= 50 ? "Model risky" : validRows.length ? "Recommendation blocked" : "Summary only",
    datasetWarnings
  };
}

export function applyMisleadingDataChecks(rows, headers) {
  const validRows = rows.filter((row) => row.rowStatus !== "error");
  const datasetWarnings = [];
  const currencyHints = detectCurrencyHints(headers);

  if (currencyHints.length > 1) {
    datasetWarnings.push(`Multiple currency hints detected (${currencyHints.join(", ")}). Confirm values use one unit before committing.`);
  }

  const byProduct = validRows.reduce((groups, row) => {
    const key = row.productIdentityKey || "unknown";
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
    return groups;
  }, new Map());

  byProduct.forEach((productRows) => {
    const priceBounds = iqrBounds(productRows.map((row) => Number(row.price)));
    const quantityBounds = iqrBounds(productRows.map((row) => Number(row.quantity)));
    const quantityMedian = median(productRows.map((row) => Number(row.quantity)));

    productRows.forEach((row) => {
      if (priceBounds && (row.price < Math.max(0, priceBounds.low) || row.price > priceBounds.high)) {
        setRowIssue(row, "PRICE_OUTLIER", "Unit price is far outside the normal range for this product.", "warning");
      }

      if (quantityBounds && (row.quantity < Math.max(0, quantityBounds.low) || row.quantity > quantityBounds.high)) {
        setRowIssue(row, "QUANTITY_OUTLIER", "Quantity is far outside the normal range for this product.", "warning");
      }

      if (quantityMedian > 0 && row.quantity >= quantityMedian * 10 && row.quantity >= 50) {
        setRowIssue(row, "EXTREME_BULK_ROW", "Large bulk-like row excluded from price-response modeling.", "excluded_from_model");
      }
    });
  });

  const dates = validRows.map((row) => row.date?.getTime?.() || new Date(row.date).getTime()).filter(Number.isFinite);
  const dateBounds = iqrBounds(dates, 3);
  const tomorrow = Date.now() + 24 * 60 * 60 * 1000;

  validRows.forEach((row) => {
    const dateValue = row.date?.getTime?.() || new Date(row.date).getTime();

    if (Number.isFinite(dateValue) && dateValue > tomorrow) {
      setRowIssue(row, "FUTURE_DATE", "Sale date is in the future and cannot be committed as historical sales.", "error");
    } else if (dateBounds && (dateValue < dateBounds.low || dateValue > dateBounds.high)) {
      setRowIssue(row, "DATE_OUTLIER", "Sale date is far outside the batch's main date range.", "excluded_from_model");
    }

    if (Number.isFinite(row.cost) && row.price < row.cost) {
      setRowIssue(row, "PRICE_BELOW_COST", "Price is below cost; row is excluded from profit-sensitive modeling.", "excluded_from_model");
    }

    if (Number.isFinite(row.revenue)) {
      const expectedRevenue = row.price * row.quantity;
      const tolerance = Math.max(Math.abs(row.revenue) * 0.05, 1);
      if (Math.abs(row.revenue - expectedRevenue) > tolerance) {
        setRowIssue(row, "REVENUE_MISMATCH", "Revenue does not match price x quantity within tolerance.", "warning");
      }
    }

    if (row.customerSegment === "b2b" && byProduct.get(row.productIdentityKey)?.length > 1 && row.quantity >= Math.max(50, quantityMedianForProduct(byProduct.get(row.productIdentityKey)) * 5)) {
      setRowIssue(row, "SEGMENT_BULK_MIX", "B2B-like bulk row is excluded from normal customer price modeling.", "excluded_from_model");
    }
  });

  return datasetWarnings;
}

function quantityMedianForProduct(rows = []) {
  return median(rows.map((row) => Number(row.quantity)));
}

async function parseRowsForStaging({ req, importBatch, headers, rowsToProcess, mapping, source, totalRows, truncated }) {
  const rows = [];
  const conflicts = {};
  const seenFingerprints = new Set();

  for (let index = 0; index < rowsToProcess.length; index += 1) {
    const rowNumber = index + 2;
    const rowValues = rowsToProcess[index];
    const rawRow = buildRawRow(headers, rowValues);
    const baseRow = {
      workspaceId: getWorkspaceId(req),
      importBatchId: importBatch._id,
      source,
      rowNumber,
      rowStatus: "accepted",
      excludedFromModel: false,
      issueCodes: [],
      issueReasons: [],
      rawRow,
      expiresAt: importBatch.expiresAt
    };

    try {
      const quantityField = readNumberField(rowValues, mapping.fields.quantity, "quantity", conflicts);

      if (quantityField.conflict && quantityField.value === undefined) throw new Error("conflicting quantity values");
      if (!Number.isFinite(quantityField.parsed)) throw new Error("missing or invalid quantity");
      if (quantityField.parsed < 0) throw new Error("quantity cannot be negative");

      const revenueField = readNumberField(rowValues, mapping.fields.revenue, "revenue", conflicts);
      const priceField = readNumberField(rowValues, mapping.fields.price, "price", conflicts);
      let price = priceField.parsed;

      if (!Number.isFinite(price) && Number.isFinite(revenueField.parsed) && quantityField.parsed > 0 && revenueField.parsed > 0) {
        price = revenueField.parsed / quantityField.parsed;
      }

      if (!Number.isFinite(price)) throw new Error("missing or invalid price");
      if (price <= 0) throw new Error("price must be greater than zero");

      const costField = readNumberField(rowValues, mapping.fields.cost, "cost", conflicts);
      const competitorPriceField = readNumberField(rowValues, mapping.fields.competitorPrice, "competitorPrice", conflicts);
      const inventoryField = readNumberField(rowValues, mapping.fields.inventory, "inventory", conflicts);
      const grossMarginField = readNumberField(rowValues, mapping.fields.grossMargin, "grossMargin", conflicts);
      const discountField = readNumberField(rowValues, mapping.fields.discount, "discount", conflicts);
      const marketingSpendField = readNumberField(rowValues, mapping.fields.marketingSpend, "marketingSpend", conflicts);
      const dateField = readField(rowValues, mapping.fields.date, "date", conflicts);
      const segmentField = readField(rowValues, mapping.fields.customerSegment, "customerSegment", conflicts);
      const skuField = readField(rowValues, mapping.fields.sku, "sku", conflicts);
      const productIdField = readField(rowValues, mapping.fields.productId, "productId", conflicts);
      const productNameField = readField(rowValues, mapping.fields.productName, "productName", conflicts);
      const categoryField = readField(rowValues, mapping.fields.category, "category", conflicts);
      const regionField = readField(rowValues, mapping.fields.region, "region", conflicts);
      const channelField = readField(rowValues, mapping.fields.channel, "channel", conflicts);
      const promotionField = readField(rowValues, mapping.fields.promotion, "promotion", conflicts);
      const holidayField = readField(rowValues, mapping.fields.holiday, "holiday", conflicts);
      const stockoutField = readField(rowValues, mapping.fields.stockoutFlag, "stockoutFlag", conflicts);

      for (const optionalField of [costField, competitorPriceField, inventoryField, grossMarginField, discountField, marketingSpendField]) {
        if (!isBlank(optionalField.value) && !Number.isFinite(optionalField.parsed)) {
          throw new Error(`invalid ${optionalField.fieldName || "numeric"} value`);
        }
      }

      const date = parseDateValue(dateField.value, rowNumber);
      const customerSegment = normalizeSegmentValue(segmentField.value);
      const identity = buildStagedProductIdentity({
        productId: productIdField.value,
        sku: skuField.value,
        productName: productNameField.value,
        category: categoryField.value
      });
      const baseFingerprint = buildRowFingerprint({
        source,
        sku: identity.productSnapshot.sku,
        productId: productIdField.value,
        productName: identity.productSnapshot.name,
        date,
        price,
        quantity: quantityField.parsed,
        segment: customerSegment.key
      });

      if (seenFingerprints.has(baseFingerprint)) {
        throw new Error("duplicate row inside this upload");
      }
      seenFingerprints.add(baseFingerprint);

      const row = {
        ...baseRow,
        ...identity,
        price,
        quantity: quantityField.parsed,
        competitorPrice: Number.isFinite(competitorPriceField.parsed) ? competitorPriceField.parsed : undefined,
        cost: Number.isFinite(costField.parsed) ? costField.parsed : undefined,
        inventory: Number.isFinite(inventoryField.parsed) ? inventoryField.parsed : undefined,
        revenue: Number.isFinite(revenueField.parsed) ? revenueField.parsed : price * quantityField.parsed,
        grossMargin: Number.isFinite(grossMarginField.parsed) ? grossMarginField.parsed : undefined,
        region: isBlank(regionField.value) ? undefined : String(regionField.value).trim(),
        channel: isBlank(channelField.value) ? undefined : String(channelField.value).trim(),
        promotion: parseBooleanValue(promotionField.value) || Number(discountField.parsed || 0) > 0,
        discount: Number.isFinite(discountField.parsed) ? discountField.parsed : undefined,
        holiday: parseBooleanValue(holidayField.value),
        marketingSpend: Number.isFinite(marketingSpendField.parsed) ? marketingSpendField.parsed : undefined,
        stockoutFlag: parseBooleanValue(stockoutField.value) || inventoryField.parsed === 0,
        dateParts: buildDateParts(date),
        customerSegment: customerSegment.key,
        customerSegmentLabel: customerSegment.label,
        date,
        rowFingerprint: `${baseFingerprint}:${importBatch._id}`
      };

      if (row.stockoutFlag) {
        setRowIssue(row, "STOCKOUT", "Stockout row will be excluded from demand modeling.", "excluded_from_model");
      }

      rows.push(row);
    } catch (error) {
      const row = {
        ...baseRow,
        rowStatus: "error",
        excludedFromModel: true,
        issueCodes: ["STRUCTURAL_ERROR"],
        issueReasons: [error.message.replace(`Row ${rowNumber}: `, "")]
      };
      rows.push(row);
    }
  }

  const datasetWarnings = applyMisleadingDataChecks(rows, headers);
  const qualitySummary = buildQualitySummary(rows, mapping, totalRows, truncated, datasetWarnings);

  return { rows, conflicts, qualitySummary };
}

async function insertStagingRows(rows) {
  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    await SalesDataStaging.insertMany(rows.slice(index, index + INSERT_BATCH_SIZE), { ordered: false });
  }
}

async function createProductMapForCommit(req, stagedRows, importBatchId) {
  const workspaceId = getWorkspaceId(req);
  const groups = stagedRows.reduce((map, row) => {
    const key = row.productIdentityKey;
    const current = map.get(key) || [];
    current.push(row);
    map.set(key, current);
    return map;
  }, new Map());
  const productMap = new Map();

  for (const [key, rows] of groups.entries()) {
    const first = rows[0];
    const costValues = rows.map((row) => Number(row.cost)).filter((value) => Number.isFinite(value) && value >= 0);
    const inventoryValues = rows.map((row) => Number(row.inventory)).filter((value) => Number.isFinite(value) && value >= 0);
    const priceValues = rows.map((row) => Number(row.price)).filter((value) => Number.isFinite(value) && value >= 0);
    const averagePrice = priceValues.length ? priceValues.reduce((total, value) => total + value, 0) / priceValues.length : 0;
    const cost = costValues.length ? median(costValues) : Number((averagePrice * 0.6).toFixed(2));
    const sku = createSku(first.productSnapshot?.sku || first.externalProductId || first.productSnapshot?.name || key);
    const product = await Product.findOneAndUpdate(
      { sku },
      {
        $set: {
          workspaceId,
          datasetStatus: "active",
          archivedAt: null,
          archiveReason: "",
          sourceImportBatchId: importBatchId,
          name: first.productSnapshot?.name || sku,
          sku,
          category: first.productSnapshot?.category || "Uncategorized",
          basePrice: Number(averagePrice.toFixed(2)),
          cost,
          inventory: inventoryValues.length ? Math.max(...inventoryValues) : 100,
          normalizedSku: normalizeProductKey(sku),
          normalizedName: normalizeProductKey(first.productSnapshot?.name || sku),
          externalProductIds: first.externalProductId ? [first.externalProductId] : [],
          aliases: [...new Set(rows.flatMap((row) => [row.productSnapshot?.name, row.productSnapshot?.sku, row.externalProductId]).filter(Boolean).map(String))],
          costQuality: costValues.length ? "real" : "estimated",
          matchConfidence: 0.9
        }
      },
      { new: true, upsert: true, runValidators: true }
    );
    productMap.set(key, product);
  }

  return productMap;
}

function stagingRowToSalesData(req, row, product, sourceImportBatchId) {
  return {
    workspaceId: getWorkspaceId(req),
    datasetStatus: "active",
    sourceImportBatchId,
    excludedFromModel: row.excludedFromModel,
    productId: product._id,
    price: row.price,
    quantity: row.quantity,
    competitorPrice: row.competitorPrice,
    cost: row.cost,
    inventory: row.inventory,
    revenue: row.revenue,
    grossMargin: row.grossMargin,
    region: row.region,
    channel: row.channel,
    promotion: row.promotion,
    discount: row.discount,
    holiday: row.holiday,
    marketingSpend: row.marketingSpend,
    stockoutFlag: row.stockoutFlag,
    dateParts: row.dateParts,
    externalProductId: row.externalProductId,
    customerSegment: row.customerSegment,
    customerSegmentLabel: row.customerSegmentLabel,
    productSnapshot: row.productSnapshot,
    date: row.date,
    rowFingerprint: row.rowFingerprint,
    importBatchId: sourceImportBatchId,
    importMeta: {
      source: row.source,
      rowNumber: row.rowNumber
    }
  };
}

async function archiveActiveDataset(req, reason, replacementBatchId) {
  const workspaceId = getWorkspaceId(req);
  const now = new Date();
  const activeFilter = { workspaceId, datasetStatus: { $ne: "archived" } };
  const archiveUpdate = {
    $set: {
      datasetStatus: "archived",
      archivedAt: now,
      archiveReason: reason
    }
  };
  const currentActiveBatch = await ImportBatch.findOne({ workspaceId, status: "committed" }).sort({ committedAt: -1 }).lean();
  const [salesRows, products, models, recommendations, outcomes] = await Promise.all([
    SalesData.updateMany(activeFilter, archiveUpdate),
    Product.updateMany(activeFilter, archiveUpdate),
    DemandModel.updateMany(activeFilter, archiveUpdate),
    Recommendation.updateMany(activeFilter, archiveUpdate),
    RecommendationOutcome.updateMany(activeFilter, archiveUpdate)
  ]);

  if (currentActiveBatch) {
    await ImportBatch.updateOne(
      { _id: currentActiveBatch._id },
      {
        $set: {
          status: "archived",
          archivedAt: now,
          replacedImportBatchId: replacementBatchId
        }
      }
    );
  }

  return {
    previousImportBatchId: currentActiveBatch?._id || null,
    archived: {
      salesRows: salesRows.modifiedCount || 0,
      products: products.modifiedCount || 0,
      pricingInsights: models.modifiedCount || 0,
      recommendations: recommendations.modifiedCount || 0,
      recommendationOutcomes: outcomes.modifiedCount || 0
    }
  };
}

function ensureBatchIsReviewable(batch) {
  if (!batch) {
    const error = new Error("Import batch not found");
    error.statusCode = 404;
    throw error;
  }

  if (["rejected", "abandoned", "failed"].includes(batch.status)) {
    const error = new Error(`Import batch is ${batch.status} and cannot be committed.`);
    error.statusCode = 409;
    throw error;
  }
}

async function buildReviewPayload(req, batchId) {
  const batch = await ImportBatch.findOne({ _id: batchId, workspaceId: getWorkspaceId(req) }).lean();
  ensureBatchIsReviewable(batch);
  const [statusCounts, sampleIssues, productCount, modelEligibleRows] = await Promise.all([
    SalesDataStaging.aggregate([
      { $match: { workspaceId: getWorkspaceId(req), importBatchId: new mongoose.Types.ObjectId(batchId) } },
      {
        $group: {
          _id: "$rowStatus",
          rows: { $sum: 1 },
          excludedFromModel: { $sum: { $cond: [{ $eq: ["$excludedFromModel", true] }, 1, 0] } }
        }
      }
    ]),
    SalesDataStaging.find({
      workspaceId: getWorkspaceId(req),
      importBatchId: batchId,
      rowStatus: { $ne: "accepted" }
    }).sort({ rowNumber: 1 }).limit(25).lean(),
    SalesDataStaging.distinct("productIdentityKey", {
      workspaceId: getWorkspaceId(req),
      importBatchId: batchId,
      rowStatus: { $ne: "error" }
    }),
    SalesDataStaging.countDocuments({
      workspaceId: getWorkspaceId(req),
      importBatchId: batchId,
      rowStatus: { $ne: "error" },
      excludedFromModel: { $ne: true }
    })
  ]);

  const counts = statusCounts.reduce((summary, item) => {
    summary[item._id] = item.rows;
    summary.excludedFromModel += item.excludedFromModel || 0;
    return summary;
  }, { accepted: 0, warning: 0, excluded_from_model: 0, error: 0, excludedFromModel: 0 });

  return {
    importBatch: batch,
    qualitySummary: {
      ...(batch.qualitySummary || {}),
      ...counts,
      productsDetected: productCount.length,
      modelEligibleRows,
      commitEligibleRows: (counts.accepted || 0) + (counts.warning || 0) + (counts.excluded_from_model || 0)
    },
    sampleIssues: sampleIssues.map((row) => ({
      rowNumber: row.rowNumber,
      rowStatus: row.rowStatus,
      issueCodes: row.issueCodes,
      issueReasons: row.issueReasons,
      product: row.productSnapshot,
      price: row.price,
      quantity: row.quantity,
      revenue: row.revenue,
      segment: row.customerSegmentLabel
    }))
  };
}

async function handlePreview(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: "CSV file is required in form field 'file'", statusCode: 400 }
      });
    }

    const { headers, rowsToProcess, totalRows, truncated } = await readCsvPreview(req.file.path);

    if (!headers || totalRows < 1) {
      return res.status(400).json({
        success: false,
        error: { message: "CSV must contain a header row and at least one data row", statusCode: 400 }
      });
    }

    const mapping = buildColumnMapping(headers);
    const requiredMissing = ["price", "quantity"].filter((field) => !mapping.mappedFields[field] && !(field === "price" && mapping.mappedFields.revenue && mapping.mappedFields.quantity));
    const importBatch = await ImportBatch.create({
      workspaceId: getWorkspaceId(req),
      source: req.file.originalname,
      detectedColumns: mapping.detectedColumns,
      mappedFields: mapping.mappedFields,
      status: "mapping_pending",
      rowCounts: {
        totalRows,
        processedRows: Math.min(rowsToProcess.length, 10)
      },
      truncated,
      expiresAt: stagingExpiryDate()
    });
    await logAudit(req, {
      action: "upload.preview_created",
      targetType: "ImportBatch",
      targetId: importBatch._id,
      summary: `Previewed sales CSV ${req.file.originalname}`,
      metadata: { totalRows, mappedFields: mapping.mappedFields }
    });

    return res.status(201).json({
      success: true,
      data: {
        importBatchId: importBatch._id,
        status: importBatch.status,
        expiresAt: importBatch.expiresAt,
        totalRows,
        processedRows: rowsToProcess.length,
        truncated,
        detectedColumns: mapping.detectedColumns,
        mappedFields: mapping.mappedFields,
        mappingPreview: Object.entries(mapping.mappedFields).map(([field, column]) => ({ column, field, confidence: "auto-detected" })),
        requiredMissing,
        sampleRows: rowsToProcess.slice(0, 5).map((row, index) => ({
          rowNumber: index + 2,
          rawRow: buildRawRow(headers, row)
        })),
        message: "Mapping preview created. Confirm mapping and stage the file before it can affect dashboards or models."
      }
    });
  } catch (error) {
    next(error);
  } finally {
    if (req.file?.path) unlink(req.file.path).catch(() => {});
  }
}

async function handleStage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: "CSV file is required in form field 'file'", statusCode: 400 }
      });
    }

    const { headers, rowsToProcess, totalRows, truncated } = await readCsvPreview(req.file.path);

    if (!headers || totalRows < 1) {
      return res.status(400).json({
        success: false,
        error: { message: "CSV must contain a header row and at least one data row", statusCode: 400 }
      });
    }

    const mapping = buildColumnMapping(headers);
    const importBatch = await ImportBatch.create({
      workspaceId: getWorkspaceId(req),
      source: req.file.originalname,
      detectedColumns: mapping.detectedColumns,
      mappedFields: mapping.mappedFields,
      status: "quality_review",
      rowCounts: {
        totalRows,
        processedRows: rowsToProcess.length
      },
      truncated,
      expiresAt: stagingExpiryDate()
    });
    const { rows, conflicts, qualitySummary } = await parseRowsForStaging({
      req,
      importBatch,
      headers,
      rowsToProcess,
      mapping,
      source: req.file.originalname,
      totalRows,
      truncated
    });
    const rowIssues = rows
      .filter((row) => row.issueReasons?.length)
      .slice(0, 500)
      .map((row) => ({
        workspaceId: getWorkspaceId(req),
        importBatchId: importBatch._id,
        source: req.file.originalname,
        rowNumber: row.rowNumber,
        severity: row.rowStatus === "error" ? "error" : "warning",
        reason: row.issueReasons.join("; "),
        rawRow: row.rawRow
      }));

    await insertStagingRows(rows);
    if (rowIssues.length) await ImportRowIssue.insertMany(rowIssues, { ordered: false });

    await ImportBatch.findByIdAndUpdate(importBatch._id, {
      status: "quality_review",
      rowCounts: {
        totalRows,
        processedRows: rowsToProcess.length,
        importedRows: 0,
        skippedRows: qualitySummary.error,
        duplicateRowsSkipped: rows.filter((row) => row.issueCodes?.includes("STRUCTURAL_ERROR") && row.issueReasons?.some((reason) => reason.includes("duplicate"))).length,
        invalidRowsSkipped: qualitySummary.error
      },
      productSummary: {
        productsDetected: qualitySummary.productsDetected,
        productsReady: qualitySummary.productsReady,
        productsLimited: qualitySummary.productsLimited,
        productsNotReady: qualitySummary.productsNotReady
      },
      segmentCounts: qualitySummary.segmentsDetected,
      conflicts,
      datasetWarnings: qualitySummary.datasetWarnings,
      qualitySummary,
      dataFitnessScore: qualitySummary.dataFitnessScore,
      dataFitnessLabel: qualitySummary.dataFitnessLabel,
      costQualitySummary: {
        label: qualitySummary.costRows ? "real" : "missing",
        costRows: qualitySummary.costRows,
        coveragePercent: qualitySummary.costCoveragePercent
      }
    });
    await logAudit(req, {
      action: "upload.batch_staged",
      targetType: "ImportBatch",
      targetId: importBatch._id,
      summary: `Staged sales CSV ${req.file.originalname}`,
      metadata: qualitySummary
    });

    return res.status(201).json({
      success: true,
      data: {
        importBatchId: importBatch._id,
        status: "quality_review",
        expiresAt: importBatch.expiresAt,
        reviewRequired: true,
        ...qualitySummary,
        rowsReceived: totalRows,
        insertedCount: 0,
        importedRows: 0,
        skippedRows: qualitySummary.error,
        latestImportSource: req.file.originalname,
        latestImportReportUrl: `/reports/import-summary.xlsx?source=${encodeURIComponent(req.file.originalname)}`,
        errors: rows.filter((row) => row.rowStatus === "error").slice(0, 10).map((row) => ({ row: row.rowNumber, reason: row.issueReasons.join("; ") })),
        conflicts,
        message: "CSV staged for quality review. Commit is required before dashboards or models change."
      }
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    next(error);
  } finally {
    if (req.file?.path) unlink(req.file.path).catch(() => {});
  }
}

uploadRouter.post("/sales/preview", upload.single("file"), handlePreview);
uploadRouter.post("/sales/stage", upload.single("file"), handleStage);
uploadRouter.post("/sales", upload.single("file"), handleStage);

uploadRouter.get("/sales/batches/:id/review", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await buildReviewPayload(req, req.params.id)
    });
  } catch (error) {
    next(error);
  }
});

uploadRouter.post("/sales/batches/:id/reject", async (req, res, next) => {
  try {
    const batch = await ImportBatch.findOne({ _id: req.params.id, workspaceId: getWorkspaceId(req) });
    ensureBatchIsReviewable(batch);
    batch.status = "rejected";
    batch.rejectedAt = new Date();
    await batch.save();
    await SalesDataStaging.deleteMany({ workspaceId: getWorkspaceId(req), importBatchId: batch._id });
    await logAudit(req, {
      action: "upload.batch_rejected",
      targetType: "ImportBatch",
      targetId: batch._id,
      summary: `Rejected staged sales CSV ${batch.source}`
    });

    res.json({
      success: true,
      data: {
        importBatchId: batch._id,
        status: "rejected",
        message: "Staged upload rejected. No dashboard or model data was changed."
      }
    });
  } catch (error) {
    next(error);
  }
});

uploadRouter.post("/sales/batches/:id/commit", requireAuth(["admin", "manager"]), async (req, res, next) => {
  try {
    const batch = await ImportBatch.findOne({ _id: req.params.id, workspaceId: getWorkspaceId(req) });
    ensureBatchIsReviewable(batch);

    const stagedRows = await SalesDataStaging.find({
      workspaceId: getWorkspaceId(req),
      importBatchId: batch._id,
      rowStatus: { $ne: "error" }
    }).sort({ rowNumber: 1 }).lean();

    if (!stagedRows.length) {
      return res.status(400).json({
        success: false,
        error: { message: "No commit-eligible rows are available in this batch.", statusCode: 400 }
      });
    }

    const archived = await archiveActiveDataset(req, "Replaced by committed import batch", batch._id);
    const productMap = await createProductMapForCommit(req, stagedRows, batch._id);
    const salesRows = stagedRows.map((row) => stagingRowToSalesData(req, row, productMap.get(row.productIdentityKey), batch._id));

    for (let index = 0; index < salesRows.length; index += INSERT_BATCH_SIZE) {
      await SalesData.insertMany(salesRows.slice(index, index + INSERT_BATCH_SIZE), { ordered: false });
    }

    batch.status = "committed";
    batch.committedAt = new Date();
    batch.committedBy = getActor(req);
    batch.replacedImportBatchId = archived.previousImportBatchId;
    batch.expiresAt = undefined;
    batch.rowCounts = {
      ...(batch.rowCounts || {}),
      importedRows: salesRows.length,
      skippedRows: (batch.qualitySummary?.error || 0),
      invalidRowsSkipped: (batch.qualitySummary?.error || 0)
    };
    await batch.save();
    await SalesDataStaging.deleteMany({ workspaceId: getWorkspaceId(req), importBatchId: batch._id });
    await setLatestImportBatchActive(batch._id);
    await logAudit(req, {
      action: "upload.batch_committed",
      targetType: "ImportBatch",
      targetId: batch._id,
      summary: `Committed sales dataset ${batch.source}`,
      metadata: {
        committedRows: salesRows.length,
        archived: archived.archived,
        modelEligibleRows: salesRows.filter((row) => !row.excludedFromModel).length
      }
    });

    res.json({
      success: true,
      data: {
        importBatchId: batch._id,
        status: "committed",
        committedRows: salesRows.length,
        modelEligibleRows: salesRows.filter((row) => !row.excludedFromModel).length,
        archived: archived.archived,
        message: "Dataset committed. Dashboards, products, insights, simulator, and recommendations now use this verified data."
      }
    });
  } catch (error) {
    next(error);
  }
});

uploadRouter.post("/sales/batches/:id/rollback", requireAuth(["admin", "manager"]), async (req, res, next) => {
  try {
    const targetBatch = await ImportBatch.findOne({ _id: req.params.id, workspaceId: getWorkspaceId(req) });

    if (!targetBatch || !["committed", "archived"].includes(targetBatch.status)) {
      return res.status(404).json({
        success: false,
        error: { message: "Rollback target must be a committed or archived import batch.", statusCode: 404 }
      });
    }

    const rollbackCutoff = new Date(Date.now() - ROLLBACK_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    if (targetBatch.committedAt && targetBatch.committedAt < rollbackCutoff) {
      return res.status(409).json({
        success: false,
        error: { message: `Rollback window is ${ROLLBACK_WINDOW_DAYS} days. This batch is too old to restore safely.`, statusCode: 409 }
      });
    }

    const archiveResult = await archiveActiveDataset(req, "Archived by rollback", targetBatch._id);
    await SalesData.updateMany(
      { workspaceId: getWorkspaceId(req), importBatchId: targetBatch._id },
      {
        $set: {
          datasetStatus: "active",
          archivedAt: null,
          archiveReason: ""
        }
      }
    );
    const restoredRows = await SalesData.find({
      workspaceId: getWorkspaceId(req),
      importBatchId: targetBatch._id,
      datasetStatus: "active"
    }).lean();
    const productMap = await createProductMapForCommit(req, restoredRows.map((row) => ({
      ...row,
      productIdentityKey: normalizeProductKey(row.productSnapshot?.sku || row.externalProductId || row.productSnapshot?.name),
      productSnapshot: row.productSnapshot
    })), targetBatch._id);
    await Promise.all(restoredRows.map((row) => {
      const key = normalizeProductKey(row.productSnapshot?.sku || row.externalProductId || row.productSnapshot?.name);
      const product = productMap.get(key);
      return product ? SalesData.updateOne({ _id: row._id }, { $set: { productId: product._id } }) : Promise.resolve();
    }));
    await ImportBatch.updateMany(
      { workspaceId: getWorkspaceId(req), status: "committed", _id: { $ne: targetBatch._id } },
      { $set: { status: "archived", archivedAt: new Date() } }
    );
    targetBatch.status = "committed";
    targetBatch.rollbackOfImportBatchId = archiveResult.previousImportBatchId;
    await targetBatch.save();
    await setLatestImportBatchActive(targetBatch._id);
    await logAudit(req, {
      action: "upload.batch_rollback",
      targetType: "ImportBatch",
      targetId: targetBatch._id,
      summary: `Rolled back to dataset ${targetBatch.source}`,
      metadata: { archived: archiveResult.archived }
    });

    res.json({
      success: true,
      data: {
        importBatchId: targetBatch._id,
        status: "committed",
        restoredRows: restoredRows.length,
        archived: archiveResult.archived,
        message: "Rollback complete. The selected verified dataset is active again."
      }
    });
  } catch (error) {
    next(error);
  }
});
