import { parse } from "csv-parse";
import crypto from "node:crypto";
import { Router } from "express";
import fs from "node:fs";
import { unlink } from "node:fs/promises";
import mongoose from "mongoose";
import multer from "multer";
import os from "node:os";
import { ImportBatch } from "../models/import-batch.model.js";
import { ImportRowIssue } from "../models/import-row-issue.model.js";
import { Product } from "../models/product.model.js";
import { SalesData } from "../models/sales-data.model.js";
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

uploadRouter.post("/sales", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: { message: "CSV file is required in form field 'file'", statusCode: 400 }
      });
    }

    const {
      headers,
      rowsToProcess,
      totalRows,
      truncated
    } = await readCsvPreview(req.file.path);

    if (!headers || totalRows < 1) {
      return res.status(400).json({
        success: false,
        error: { message: "CSV must contain a header row and at least one data row", statusCode: 400 }
      });
    }

    const mapping = buildColumnMapping(headers);
    const products = await Product.find(workspaceFilter(req)).lean();
    const productIndexes = buildProductIndexes(products);
    productIndexes.workspaceId = getWorkspaceId(req);
    const records = [];
    const errors = [];
    const rowIssues = [];
    const conflicts = {};
    const source = req.file.originalname;
    const importBatch = await ImportBatch.create({
      workspaceId: getWorkspaceId(req),
      source,
      detectedColumns: mapping.detectedColumns,
      mappedFields: mapping.mappedFields,
      status: "processing",
      rowCounts: {
        totalRows,
        processedRows: rowsToProcess.length
      },
      truncated
    });
    const existingSourceRows = await SalesData.find({
      workspaceId: getWorkspaceId(req),
      "importMeta.source": source,
      "importMeta.rowNumber": { $gte: 2, $lte: rowsToProcess.length + 1 }
    })
      .select("importMeta.rowNumber rawRow rowFingerprint")
      .lean();
    const existingRowsByRowNumber = existingSourceRows.reduce((rowsByNumber, record) => {
      const rowNumber = record.importMeta?.rowNumber;
      if (!Number.isFinite(rowNumber)) return rowsByNumber;

      const rows = rowsByNumber.get(rowNumber) || [];
      rows.push(record);
      rowsByNumber.set(rowNumber, rows);
      return rowsByNumber;
    }, new Map());
    const seenFingerprints = new Set();
    const detectedProductKeys = new Set();
    const createdProductKeys = new Set();
    const matchedProductKeys = new Set();
    const externalProductIds = new Set();
    const segmentCounts = {};
    const detectedOptionalFields = Object.fromEntries(
      ["region", "channel", "promotion", "discount", "holiday", "marketingSpend", "stockoutFlag"].filter((field) => mapping.mappedFields[field]).map((field) => [field, mapping.mappedFields[field]])
    );
    const datasetWarnings = [];
    let duplicateRowsSkipped = 0;
    let stockoutRowsDetected = 0;
    let promotionRowsDetected = 0;
    let costRowsDetected = 0;
    let zeroQuantityRowsDetected = 0;
    let belowCostRowsDetected = 0;

    for (let index = 0; index < rowsToProcess.length; index += 1) {
      const rowNumber = index + 2;
      const rowValues = rowsToProcess[index];
      const rawRow = buildRawRow(headers, rowValues);

      try {
        const quantityField = readNumberField(rowValues, mapping.fields.quantity, "quantity", conflicts);

        if (quantityField.conflict && quantityField.value === undefined) {
          throw new Error("conflicting quantity values");
        }

        if (!Number.isFinite(quantityField.parsed)) {
          throw new Error("missing or invalid quantity");
        }

        if (quantityField.parsed < 0) {
          throw new Error("quantity cannot be negative");
        }

        const revenueField = readNumberField(rowValues, mapping.fields.revenue, "revenue", conflicts);
        const priceField = readNumberField(rowValues, mapping.fields.price, "price", conflicts);
        let price = priceField.parsed;

        if (!Number.isFinite(price) && Number.isFinite(revenueField.parsed) && quantityField.parsed > 0 && revenueField.parsed > 0) {
          price = revenueField.parsed / quantityField.parsed;
        }

        if (!Number.isFinite(price)) {
          if (priceField.conflict && priceField.value === undefined) {
            throw new Error("conflicting price values");
          }

          if (revenueField.conflict && revenueField.value === undefined) {
            throw new Error("conflicting revenue values");
          }

          throw new Error("missing or invalid price");
        }

        if (price <= 0) {
          throw new Error("price must be greater than zero");
        }

        if (Number.isFinite(revenueField.parsed)) {
          const expectedRevenue = price * quantityField.parsed;
          const tolerance = Math.max(Math.abs(revenueField.parsed) * 0.05, 1);

          if (Math.abs(revenueField.parsed - expectedRevenue) > tolerance) {
            incrementConflict(conflicts, "revenue");
          }
        }

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
        const dateParts = buildDateParts(date);
        const customerSegment = normalizeSegmentValue(segmentField.value);
        const externalProductId = getExternalProductId(productIdField.value);
        const isPromotion = parseBooleanValue(promotionField.value) || Number(discountField.parsed || 0) > 0;
        const isHoliday = parseBooleanValue(holidayField.value);
        const isStockout = parseBooleanValue(stockoutField.value) || inventoryField.parsed === 0;

        if (isPromotion) promotionRowsDetected += 1;
        if (isStockout) stockoutRowsDetected += 1;
        if (Number.isFinite(costField.parsed)) costRowsDetected += 1;
        if (quantityField.parsed === 0) zeroQuantityRowsDetected += 1;
        if (Number.isFinite(costField.parsed) && price < costField.parsed) belowCostRowsDetected += 1;

        const rowFingerprint = buildRowFingerprint({
          source,
          sku: skuField.value,
          productId: productIdField.value,
          productName: productNameField.value,
          date,
          price,
          quantity: quantityField.parsed,
          segment: customerSegment.key
        });
        const existingSameSourceRows = existingRowsByRowNumber.get(rowNumber) || [];
        const isExistingSameSourceDuplicate = existingSameSourceRows.some(
          (record) => record.rowFingerprint === rowFingerprint || (!record.rowFingerprint && rawRowsMatch(record.rawRow, rawRow))
        );

        if (isExistingSameSourceDuplicate) {
          duplicateRowsSkipped += 1;
          continue;
        }

        if (seenFingerprints.has(rowFingerprint)) {
          duplicateRowsSkipped += 1;
          continue;
        }

        seenFingerprints.add(rowFingerprint);

        const resolvedProduct = await resolveProduct({
          productId: productIdField.value,
          sku: skuField.value,
          productName: productNameField.value,
          category: categoryField.value,
          fallbackPrice: price,
          cost: costField.parsed,
          inventory: inventoryField.parsed,
          productIndexes
        });
        const productId = resolvedProduct.productId;
        const productKey = String(productId);

        detectedProductKeys.add(productKey);
        if (externalProductId) externalProductIds.add(externalProductId);

        if (resolvedProduct.status === "created") {
          createdProductKeys.add(productKey);
        } else {
          matchedProductKeys.add(productKey);
        }

        segmentCounts[customerSegment.label] = (segmentCounts[customerSegment.label] || 0) + 1;

        records.push({
          workspaceId: getWorkspaceId(req),
          productId,
          price,
          quantity: quantityField.parsed,
          competitorPrice: Number.isFinite(competitorPriceField.parsed) ? competitorPriceField.parsed : undefined,
          cost: Number.isFinite(costField.parsed) ? costField.parsed : undefined,
          inventory: Number.isFinite(inventoryField.parsed) ? inventoryField.parsed : undefined,
          revenue: Number.isFinite(revenueField.parsed) ? revenueField.parsed : price * quantityField.parsed,
          grossMargin: Number.isFinite(grossMarginField.parsed) ? grossMarginField.parsed : undefined,
          region: isBlank(regionField.value) ? undefined : String(regionField.value).trim(),
          channel: isBlank(channelField.value) ? undefined : String(channelField.value).trim(),
          promotion: isPromotion,
          discount: Number.isFinite(discountField.parsed) ? discountField.parsed : undefined,
          holiday: isHoliday,
          marketingSpend: Number.isFinite(marketingSpendField.parsed) ? marketingSpendField.parsed : undefined,
          stockoutFlag: isStockout,
          dateParts,
          externalProductId,
          customerSegment: customerSegment.key,
          customerSegmentLabel: customerSegment.label,
          productSnapshot: {
            externalProductId,
            sku: String(skuField.value || resolvedProduct.product?.sku || (externalProductId ? `PID-${externalProductId}` : "")).trim(),
            name: String(productNameField.value || resolvedProduct.product?.name || (externalProductId ? `Product ${externalProductId}` : "")).trim(),
            category: String(categoryField.value || resolvedProduct.product?.category || "").trim()
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
        errors.push({
          row: rowNumber,
          reason: error.message.replace(`Row ${rowNumber}: `, "")
        });
        rowIssues.push({
          workspaceId: getWorkspaceId(req),
          importBatchId: importBatch._id,
          source,
          rowNumber,
          reason: error.message.replace(`Row ${rowNumber}: `, ""),
          rawRow
        });
      }
    }

    const existingFingerprints = records.length
      ? await SalesData.find(workspaceFilter(req, { rowFingerprint: { $in: records.map((record) => record.rowFingerprint) } }))
        .select("rowFingerprint")
        .lean()
      : [];
    const existingFingerprintSet = new Set(existingFingerprints.map((record) => record.rowFingerprint));
    const uniqueRecords = records.filter((record) => {
      if (!existingFingerprintSet.has(record.rowFingerprint)) return true;
      duplicateRowsSkipped += 1;
      return false;
    });

    if (stockoutRowsDetected > 0) {
      datasetWarnings.push(`${stockoutRowsDetected} stockout row${stockoutRowsDetected === 1 ? "" : "s"} detected; those rows will be excluded from model fitting.`);
    }

    if (promotionRowsDetected > 0) {
      datasetWarnings.push(`${promotionRowsDetected} promotional row${promotionRowsDetected === 1 ? "" : "s"} detected; promotions may affect demand.`);
    }

    if (!costRowsDetected) {
      datasetWarnings.push("No cost values were imported. Profit recommendations will be blocked unless a product has trusted cost data.");
    }

    if (belowCostRowsDetected > 0) {
      datasetWarnings.push(`${belowCostRowsDetected} row${belowCostRowsDetected === 1 ? "" : "s"} had price below cost. Review cost or price before trusting profit.`);
    }

    if (zeroQuantityRowsDetected > rowsToProcess.length * 0.25) {
      datasetWarnings.push("More than 25% of processed rows had zero quantity. Demand models may be weak.");
    }

    const importReadiness = uniqueRecords.reduce(
      (summary, record) => {
        const productKey = String(record.productId);
        const product = summary.byProduct.get(productKey) || { records: 0, prices: new Set() };
        product.records += 1;
        product.prices.add(Number(record.price).toFixed(4));
        summary.byProduct.set(productKey, product);
        return summary;
      },
      { byProduct: new Map() }
    );
    const readinessCounts = [...importReadiness.byProduct.values()].reduce(
      (counts, product) => {
        if (product.records >= 8 && product.prices.size >= 3) counts.ready += 1;
        else if (product.records >= 3 && product.prices.size >= 2) counts.limited += 1;
        else counts.notReady += 1;
        return counts;
      },
      { ready: 0, limited: 0, notReady: 0 }
    );
    const importDataFitnessScore = uniqueRecords.length
      ? Math.max(0, Math.min(100, Math.round(
        (readinessCounts.ready * 100 + readinessCounts.limited * 65 + readinessCounts.notReady * 25) /
        Math.max(1, readinessCounts.ready + readinessCounts.limited + readinessCounts.notReady) -
        (costRowsDetected ? 0 : 20) -
        (belowCostRowsDetected ? 10 : 0) -
        (stockoutRowsDetected > rowsToProcess.length * 0.25 ? 15 : 0)
      )))
      : 0;
    const importDataFitnessLabel = importDataFitnessScore >= 75
      ? "Model usable"
      : importDataFitnessScore >= 50
        ? "Model risky"
        : readinessCounts.ready + readinessCounts.limited > 0
          ? "Recommendation blocked"
          : "Summary only";
    const costQualitySummary = {
      label: costRowsDetected ? (belowCostRowsDetected ? "inconsistent" : "real") : "missing",
      costRows: costRowsDetected,
      coveragePercent: rowsToProcess.length ? Number(((costRowsDetected / rowsToProcess.length) * 100).toFixed(1)) : 0,
      belowCostRows: belowCostRowsDetected
    };

    const responseBase = {
      totalRows,
      processedRows: rowsToProcess.length,
      importedRows: uniqueRecords.length,
      skippedRows: errors.length + duplicateRowsSkipped,
      rowsReceived: totalRows,
      insertedCount: uniqueRecords.length,
      skippedCount: errors.length + duplicateRowsSkipped,
      reportAvailable: true,
      latestImportSource: source,
      importBatchId: importBatch._id,
      latestImportReportUrl: `/reports/import-summary.xlsx?source=${encodeURIComponent(source)}`,
      duplicateRowsSkipped,
      invalidRowsSkipped: errors.length,
      productsDetected: detectedProductKeys.size,
      externalProductIdsDetected: externalProductIds.size,
      productIdentityMode: externalProductIds.size > 0 ? "externalProductId" : mapping.mappedFields.sku ? "sku" : mapping.mappedFields.productName ? "productName" : "category",
      newProductsCreated: createdProductKeys.size,
      existingProductsMatched: [...matchedProductKeys].filter((productKey) => !createdProductKeys.has(productKey)).length,
      segmentsDetected: segmentCounts,
      detectedOptionalFields,
      datasetWarnings,
      productsReady: readinessCounts.ready,
      productsLimited: readinessCounts.limited,
      productsNotReady: readinessCounts.notReady,
      productsWithModelReadyData: readinessCounts.ready + readinessCounts.limited,
      productsWithSummaryOnlyData: readinessCounts.notReady,
      dataFitnessScore: importDataFitnessScore,
      dataFitnessLabel: importDataFitnessLabel,
      costQualitySummary,
      truncated,
      detectedColumns: mapping.detectedColumns,
      mappedFields: mapping.mappedFields,
      errors: errors.slice(0, 10),
      conflicts
    };

    const importBatchUpdate = {
      status: uniqueRecords.length ? (errors.length ? "completed_with_errors" : "completed") : "failed",
      detectedOptionalFields,
      rowCounts: {
        totalRows,
        processedRows: rowsToProcess.length,
        importedRows: uniqueRecords.length,
        skippedRows: errors.length + duplicateRowsSkipped,
        duplicateRowsSkipped,
        invalidRowsSkipped: errors.length
      },
      productSummary: {
        productsDetected: detectedProductKeys.size,
        externalProductIdsDetected: externalProductIds.size,
        productIdentityMode: responseBase.productIdentityMode,
        newProductsCreated: createdProductKeys.size,
        existingProductsMatched: responseBase.existingProductsMatched,
        productsReady: readinessCounts.ready,
        productsLimited: readinessCounts.limited,
        productsNotReady: readinessCounts.notReady
      },
      segmentCounts,
      conflicts,
      datasetWarnings,
      dataFitnessScore: importDataFitnessScore,
      dataFitnessLabel: importDataFitnessLabel,
      costQualitySummary,
      completedAt: new Date()
    };

    if (rowIssues.length) {
      await ImportRowIssue.insertMany(rowIssues.slice(0, 250), { ordered: false });
    }

    await ImportBatch.findByIdAndUpdate(importBatch._id, importBatchUpdate);

    if (!uniqueRecords.length) {
      if (duplicateRowsSkipped > 0 && errors.length === 0) {
        return res.json({
          success: true,
          data: responseBase
        });
      }

      return res.status(400).json({
        success: false,
        error: {
          message: "No valid sales rows found. Include product identity, price or revenue, and quantity.",
          statusCode: 400,
          ...responseBase
        }
      });
    }

    for (let index = 0; index < uniqueRecords.length; index += INSERT_BATCH_SIZE) {
      await SalesData.insertMany(uniqueRecords.slice(index, index + INSERT_BATCH_SIZE), { ordered: false });
    }
    await setLatestImportBatchActive(importBatch._id);
    await logAudit(req, {
      action: "upload.sales_csv",
      targetType: "ImportBatch",
      targetId: importBatch._id,
      summary: `Uploaded sales CSV ${source}`,
      metadata: {
        importedRows: uniqueRecords.length,
        skippedRows: errors.length + duplicateRowsSkipped,
        truncated
      }
    });

    res.status(201).json({
      success: true,
      data: responseBase
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    next(error);
  } finally {
    if (req.file?.path) {
      unlink(req.file.path).catch(() => {});
    }
  }
});
