import ExcelJS from "exceljs";
import { DemandModel } from "../models/demand-model.model.js";
import { ImportBatch } from "../models/import-batch.model.js";
import { Product } from "../models/product.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { assessReadinessSummary, getDashboardSummary } from "./dashboard.service.js";
import { getDuplicateEvidence } from "../utils/product-matching.js";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const moneyFormat = '"$"#,##0.00;[Red]-"$"#,##0.00';
const numberFormat = '#,##0.00';
const integerFormat = '#,##0';

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function createWorkbook(title) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Pricing Manager";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.subject = title;
  workbook.title = title;
  return workbook;
}

function styleTitle(row) {
  row.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  row.alignment = { vertical: "middle" };
  row.height = 26;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  row.alignment = { vertical: "middle", wrapText: true };
}

function addTitle(sheet, title, subtitle = "") {
  sheet.addRow([title]);
  styleTitle(sheet.lastRow);
  if (subtitle) {
    sheet.addRow([subtitle]);
    sheet.lastRow.font = { italic: true, color: { argb: "FF475569" } };
  }
  sheet.addRow([]);
}

function addKeyValues(sheet, rows) {
  const start = sheet.rowCount + 1;
  rows.forEach(([label, value]) => sheet.addRow([label, value]));
  for (let index = start; index <= sheet.rowCount; index += 1) {
    const row = sheet.getRow(index);
    row.getCell(1).font = { bold: true, color: { argb: "FF334155" } };
    row.getCell(2).font = { bold: true };
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
  }
  sheet.addRow([]);
}

function addTable(sheet, headers, rows, options = {}) {
  if (options.title) {
    sheet.addRow([options.title]);
    sheet.lastRow.font = { bold: true, size: 13, color: { argb: "FF0F172A" } };
  }
  sheet.addRow(headers);
  styleHeader(sheet.lastRow);
  const firstDataRow = sheet.rowCount + 1;
  rows.forEach((row) => sheet.addRow(row));
  const lastDataRow = sheet.rowCount;

  for (let index = firstDataRow; index <= lastDataRow; index += 1) {
    const row = sheet.getRow(index);
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      cell.alignment = { vertical: "top", wrapText: true };
    });
  }
  sheet.addRow([]);
}

function addVisualBars(sheet, title, items, labelKey, valueKey) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 0);
  const rows = items.map((item) => {
    const value = Number(item[valueKey] || 0);
    const barLength = maxValue > 0 ? Math.max(1, Math.round((value / maxValue) * 24)) : 0;
    return [item[labelKey], value, "#".repeat(barLength)];
  });
  addTable(sheet, ["Item", "Value", "Visual bar"], rows, { title });
}

function applyFormats(sheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
    });
  });
  sheet.columns.forEach((column) => {
    let maxLength = 12;
    column.eachCell({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value ?? "").length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 12), 44);
  });
  const headerRow = sheet.getRow(4);
  headerRow.eachCell((cell, colNumber) => {
    const header = String(cell.value || "").toLowerCase();
    if (["price", "cost", "revenue", "profit", "amount"].some((term) => header.includes(term))) {
      sheet.getColumn(colNumber).numFmt = moneyFormat;
    } else if (["%", "score", "reliability"].some((term) => header.includes(term))) {
      sheet.getColumn(colNumber).numFmt = numberFormat;
    } else if (["rows", "units", "records", "inventory", "products"].some((term) => header.includes(term))) {
      sheet.getColumn(colNumber).numFmt = integerFormat;
    }
  });
}

function finalizeWorkbook(workbook) {
  workbook.eachSheet((sheet) => applyFormats(sheet));
  return workbook;
}

export async function workbookBuffer(workbook) {
  return workbook.xlsx.writeBuffer();
}

export function sendWorkbook(res, workbook, filename) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  return workbook.xlsx.write(res);
}

async function getEnrichedProducts() {
  const workspaceMatch = { workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" };
  const products = await Product.find(workspaceMatch).sort({ name: 1 }).lean();
  const salesCounts = await SalesData.aggregate([
    { $match: workspaceMatch },
    {
      $group: {
        _id: "$productId",
        salesRecords: { $sum: 1 },
        units: { $sum: "$quantity" },
        revenue: { $sum: { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] } },
        distinctPrices: { $addToSet: "$price" },
        zeroQuantityRows: { $sum: { $cond: [{ $eq: ["$quantity", 0] }, 1, 0] } },
        costRows: { $sum: { $cond: [{ $ne: ["$cost", null] }, 1, 0] } },
        competitorRows: { $sum: { $cond: [{ $ne: ["$competitorPrice", null] }, 1, 0] } },
        belowCostRows: { $sum: { $cond: [{ $lt: ["$price", "$cost"] }, 1, 0] } },
        stockoutRows: { $sum: { $cond: [{ $or: [{ $eq: ["$inventory", 0] }, { $eq: ["$stockoutFlag", true] }] }, 1, 0] } }
      }
    }
  ]);
  const modelCounts = await DemandModel.aggregate([
    { $match: workspaceMatch },
    { $group: { _id: "$productId", fittedModels: { $sum: 1 } } }
  ]);
  const salesMap = new Map(salesCounts.map((item) => [String(item._id), item]));
  const modelMap = new Map(modelCounts.map((item) => [String(item._id), item.fittedModels]));

  return products.map((product) => {
    const sales = salesMap.get(String(product._id)) || {};
    const readiness = assessReadinessSummary({
      records: sales.salesRecords || 0,
      distinctPrices: sales.distinctPrices?.length || 0,
      zeroQuantityRows: sales.zeroQuantityRows || 0,
      costRows: sales.costRows || 0,
      competitorRows: sales.competitorRows || 0,
      belowCostRows: sales.belowCostRows || 0,
      stockoutRows: sales.stockoutRows || 0
    });

    return {
      ...product,
      salesRecords: sales.salesRecords || 0,
      units: sales.units || 0,
      revenue: sales.revenue || 0,
      distinctPrices: sales.distinctPrices?.length || 0,
      fittedModels: modelMap.get(String(product._id)) || 0,
      readiness
    };
  });
}

function findPotentialProductDuplicates(products) {
  const duplicates = [];

  for (let leftIndex = 0; leftIndex < products.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < products.length; rightIndex += 1) {
      const left = products[leftIndex];
      const right = products[rightIndex];
      const match = getDuplicateEvidence(left, right);
      if (!match) continue;

      duplicates.push([
        left.name,
        left.sku,
        right.name,
        right.sku,
        left.category,
        match.exactIdentityMatch ? "Yes" : "No",
        round(match.textScore * 100, 1),
        round(match.overlap * 100, 1),
        match.sharedNameTokens.join(", ") || "-",
        round(match.priceScore * 100, 1),
        round(match.reviewScore * 100, 1),
        match.exactIdentityMatch ? "Exact identity match" : "Manual review only"
      ]);
    }
  }

  return duplicates.sort((left, right) => right[10] - left[10]).slice(0, 50);
}

export async function buildDashboardWorkbook() {
  const dashboard = await getDashboardSummary();
  const workbook = createWorkbook("Dashboard Report");
  const summary = workbook.addWorksheet("Summary");
  addTitle(summary, "Dashboard Report", "Business snapshot from current workspace data.");
  addKeyValues(summary, [
    ["Products", dashboard.metrics.productCount],
    ["Sales rows", dashboard.metrics.salesRecords],
    ["Total units", dashboard.metrics.totalUnits],
    ["Total revenue", dashboard.metrics.totalRevenue],
    ["Total profit", dashboard.metrics.totalProfit],
    ["Pricing insights", dashboard.metrics.modelCount],
    ["Recommendations", dashboard.metrics.recommendationCount]
  ]);
  addVisualBars(summary, "Top products by revenue", dashboard.topProducts, "name", "revenue");
  addTable(workbook.addWorksheet("Calculation Notes"), ["Output", "Working"], [
    ["Sales rows", "Count of stored imported sales records."],
    ["Total units", "Sum of quantity across imported sales records."],
    ["Total revenue", "Sum of sales revenue. If revenue is missing, importer can derive revenue as price x quantity."],
    ["Total profit", "Sum of (price - product cost) x quantity."],
    ["Top products / customer groups / categories", "Rows are grouped by the label and ranked by summed revenue."]
  ]);
  addTable(workbook.addWorksheet("Trend"), ["Month", "Revenue", "Records"], dashboard.trend.map((item) => [item.month, item.revenue, item.records]));
  addTable(workbook.addWorksheet("Customer Groups"), ["Customer Group", "Records", "Revenue", "Units"], dashboard.segments.map((item) => [item.label, item.records, item.revenue, item.units]));
  addTable(workbook.addWorksheet("Categories"), ["Category", "Records", "Revenue"], dashboard.categories.map((item) => [item.category, item.records, item.revenue]));
  return finalizeWorkbook(workbook);
}

export async function buildProductsWorkbook() {
  const products = await getEnrichedProducts();
  const workbook = createWorkbook("Products Report");
  const sheet = workbook.addWorksheet("Products");
  addTitle(sheet, "Products Report", "Product portfolio with sales readiness and pricing model status.");
  addTable(sheet, ["Product", "SKU", "Category", "Base Price", "Cost", "Inventory", "Sales Rows", "Units", "Revenue", "Distinct Prices", "Readiness", "Reason", "Models"], products.map((product) => [
    product.name,
    product.sku,
    product.category,
    product.basePrice,
    product.cost,
    product.inventory,
    product.salesRecords,
    product.units,
    round(product.revenue),
    product.distinctPrices,
    product.readiness.status,
    product.readiness.reason,
    product.fittedModels
  ]));
  addVisualBars(workbook.addWorksheet("Revenue Visuals"), "Product revenue visual", products, "name", "revenue");
  addTable(workbook.addWorksheet("Product Matching"), ["Master Product", "Master SKU", "Possible Duplicate", "Duplicate SKU", "Category", "Shared ID", "Name Match %", "Token Overlap %", "Shared Tokens", "Price Similarity %", "Review Score %", "Decision"], findPotentialProductDuplicates(products), {
    title: "Possible product duplicates. Price/category similarity alone is not enough to identify duplicates."
  });
  return finalizeWorkbook(workbook);
}

export async function buildSalesDataWorkbook(source) {
  const query = source ? { workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active", "importMeta.source": source } : { workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" };
  const [rows, batch] = await Promise.all([
    SalesData.find(query).sort({ createdAt: -1 }).limit(5000).lean(),
    source ? ImportBatch.findOne({ workspaceId: DEFAULT_WORKSPACE_ID, source }).sort({ createdAt: -1 }).lean() : null
  ]);
  const workbook = createWorkbook("Sales Data Report");
  const summary = workbook.addWorksheet("Summary");
  const products = new Set(rows.map((row) => String(row.productId)));
  const externalIds = new Set(rows.map((row) => row.externalProductId).filter(Boolean));
  const revenue = rows.reduce((total, row) => total + Number(row.revenue ?? row.price * row.quantity ?? 0), 0);
  const units = rows.reduce((total, row) => total + Number(row.quantity || 0), 0);
  addTitle(summary, source ? `Upload Intelligence Report: ${source}` : "Sales Data Report", "What the system inferred from imported sales rows.");
  addKeyValues(summary, [
    ["Rows included", rows.length],
    ["Products detected", products.size],
    ["External product IDs", externalIds.size],
    ["Units sold", units],
    ["Revenue", round(revenue)],
    ["Average price", units ? round(revenue / units) : 0],
    ["Data fitness", batch?.dataFitnessLabel || "Not scored"],
    ["Fitness score", batch?.dataFitnessScore ?? ""],
    ["Cost quality", batch?.costQualitySummary?.label || ""],
    ["Source", source || "All imports"]
  ]);
  if (batch?.datasetWarnings?.length) {
    addTable(workbook.addWorksheet("Warnings"), ["Warning"], batch.datasetWarnings.map((warning) => [warning]));
  }
  addTable(workbook.addWorksheet("Imported Rows"), ["Date", "Product", "SKU", "External ID", "Category", "Segment", "Price", "Quantity", "Revenue", "Cost", "Region", "Channel", "Promotion", "Source Row"], rows.map((row) => [
    row.date?.toISOString?.().slice(0, 10),
    row.productSnapshot?.name,
    row.productSnapshot?.sku,
    row.externalProductId || row.productSnapshot?.externalProductId,
    row.productSnapshot?.category,
    row.customerSegmentLabel,
    row.price,
    row.quantity,
    row.revenue,
    row.cost,
    row.region,
    row.channel,
    row.promotion ? "Yes" : "No",
    row.importMeta?.rowNumber
  ]));
  return finalizeWorkbook(workbook);
}

export async function buildPricingInsightsWorkbook() {
  const models = await DemandModel.find({ workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" }).sort({ updatedAt: -1 }).populate("productId", "name sku category").lean();
  const workbook = createWorkbook("Pricing Insights Report");
  const sheet = workbook.addWorksheet("Pricing Insights");
  addTitle(sheet, "Pricing Insights Report", "Fitted demand models with model reliability, formulas, and warnings.");
  addTable(sheet, ["Product", "SKU", "Segment", "Readiness", "Data Fitness", "Fitness Score", "Cost Quality", "Business Risk", "Model", "Model Reliability", "Score", "Grouped Points", "Raw Rows", "Distinct Prices", "Historical Fit", "Demand Error %", "Revenue Error %", "Profit Error %", "Beats Baseline", "Baseline MAPE", "Model Improvement", "ML Ready", "Formula", "Evidence Summary", "Blocked Reasons", "Warnings"], models.map((model) => [
    model.productId?.name,
    model.productId?.sku,
    model.segment,
    model.readinessLevel,
    model.dataFitnessLabel,
    model.dataFitnessScore,
    model.costQuality?.label,
    model.businessRiskLevel,
    model.modelType,
    model.modelReliabilityLabel || model.reliabilityLabel,
    model.reliabilityScore,
    model.groupedDemandPoints,
    model.rawRowsUsed,
    model.distinctPriceCount,
    model.rSquared,
    (model.backtestMetrics || model.accuracyMetrics)?.available ? (model.backtestMetrics || model.accuracyMetrics).demandMAPE : "",
    (model.backtestMetrics || model.accuracyMetrics)?.available ? (model.backtestMetrics || model.accuracyMetrics).revenueMAPE : "",
    (model.backtestMetrics || model.accuracyMetrics)?.available ? (model.backtestMetrics || model.accuracyMetrics).profitMAPE : "",
    (model.backtestMetrics || model.accuracyMetrics)?.baselineComparison?.available ? ((model.backtestMetrics || model.accuracyMetrics).baselineComparison.modelBeatsBaseline ? "Yes" : "No") : "N/A",
    (model.backtestMetrics || model.accuracyMetrics)?.baselineComparison?.available ? (model.backtestMetrics || model.accuracyMetrics).baselineComparison.bestBaselineMAPE : "",
    (model.backtestMetrics || model.accuracyMetrics)?.baselineComparison?.available ? `${(model.backtestMetrics || model.accuracyMetrics).baselineComparison.improvementPercent}%` : "",
    model.mlReadiness?.ready ? "Yes" : "No",
    model.formulaText,
    model.evidenceSummary ? JSON.stringify(model.evidenceSummary) : "",
    (model.blockedReasons || []).join(" | "),
    [...(model.modelWarnings || []), ...(model.reliabilityReasons || []), ...(model.dataFitnessWarnings || [])].join(" | ")
  ]));
  addTable(workbook.addWorksheet("Calculation Notes"), ["Output", "Working"], [
    ["Grouped demand points", "Raw sales rows are grouped by product, customer segment, date, and price."],
    ["Model formula", "The selected price-response model estimates demand from historical price and quantity movement."],
    ["Historical fit", "Shows how well the formula fits historical grouped demand points; it is not a future guarantee."],
    ["Backtest error", "Older grouped points are used for training and newer grouped points are held out for error checking."],
    ["Model reliability", "Requires enough grouped points, enough price levels, normal price-response direction, and acceptable backtest evidence."],
    ["Baseline comparison", "The model's held-out demand error is compared against three naive methods (Average Demand, Last Observation, 3-Point Moving Average). The model must outperform the best naive baseline to be considered reliable for recommendations."]
  ]);
  return finalizeWorkbook(workbook);
}

export async function buildRecommendationsWorkbook(historyOnly = false) {
  const recommendations = await Recommendation.find({ workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" }).sort({ createdAt: -1 }).limit(500).populate("productId", "name sku category").lean();
  const outcomes = await RecommendationOutcome.find({ workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" }).sort({ updatedAt: -1 }).limit(500).populate("productId", "name sku category").lean();
  const workbook = createWorkbook(historyOnly ? "Recommendation History Report" : "Recommendations Report");
  const sheet = workbook.addWorksheet(historyOnly ? "History" : "Recommendations");
  addTitle(sheet, historyOnly ? "Recommendation History Report" : "Recommendations Report", "Saved pricing recommendations with assumptions and explanations.");
  addTable(sheet, ["Created At", "Product", "SKU", "Category", "Goal", "Status", "Recommendation Status", "Decision", "Business Risk", "Optimizer", "Recommended Price", "Safe Band", "Estimated Demand Range", "Estimated Revenue Range", "Estimated Profit Range", "Estimated Revenue", "Estimated Profit", "Estimated Improvement Range", "Model Reliability", "Profit Uses Estimated Cost", "Backtest Error", "Evidence Summary", "Warnings", "Explanation"], recommendations.map((item) => [
    item.createdAt?.toISOString?.(),
    item.productId?.name,
    item.productId?.sku,
    item.productId?.category,
    item.objective,
    item.status || "Draft",
    item.recommendationStatus,
    item.decisionLabel,
    item.businessRiskLevel,
    item.optimizationMethod,
    item.recommendedPrice,
    item.safePriceBand ? `${item.safePriceBand.min} to ${item.safePriceBand.max}` : "",
    item.predictionRange?.demand ? `${item.predictionRange.demand.low} to ${item.predictionRange.demand.high}` : item.expectedDemand,
    item.predictionRange?.revenue ? `${item.predictionRange.revenue.low} to ${item.predictionRange.revenue.high}` : item.expectedRevenue,
    item.predictionRange?.profit ? `${item.predictionRange.profit.low} to ${item.predictionRange.profit.high}` : item.expectedProfit,
    item.expectedRevenue,
    item.expectedProfit,
    item.estimatedImprovementRange ? `${item.estimatedImprovementRange.low}% to ${item.estimatedImprovementRange.high}%` : item.improvementPercent,
    item.modelReliabilityLabel || item.resultReliability?.label || item.confidence,
    item.profitUsesEstimatedCost ? "Yes" : "No",
    item.modelErrorSummary?.available ? item.modelErrorSummary.worstErrorPercent : "",
    item.evidenceSummary ? JSON.stringify(item.evidenceSummary) : "",
    [...(item.warnings || []), ...(item.guardrailWarnings || [])].join(" | "),
    item.explanation
  ]));
  if (!historyOnly) {
    const tested = recommendations.flatMap((item) => (item.testedPrices || []).slice(0, 20).map((price) => [
      item.productId?.name,
      item.objective,
      price.price,
      price.expectedDemand,
      price.expectedRevenue,
      price.expectedProfit
    ]));
    addTable(workbook.addWorksheet("Tested Prices"), ["Product", "Goal", "Price", "Demand", "Revenue", "Profit"], tested);
  }
  addTable(workbook.addWorksheet("Calculation Notes"), ["Output", "Working"], [
    ["Recommended price", "Selected from tested candidate prices according to the chosen objective and guardrails."],
    ["Estimated revenue", "Recommended price x estimated demand."],
    ["Estimated profit", "(Recommended price - product cost) x estimated demand."],
    ["Estimated improvement", "Selected objective at recommended price compared with the baseline/current price."],
    ["Safe band", "Nearby tested prices that remain close to the best objective value."]
  ]);
  addTable(workbook.addWorksheet("Outcome Accuracy"), ["Product", "SKU", "Status", "Applied Price", "Start Date", "End Date", "Estimated Demand", "Actual Units", "Estimated Profit", "Actual Profit", "Prediction Error %", "Profit Lift", "Target Hit", "Rows Measured"], outcomes.map((item) => [
    item.productId?.name,
    item.productId?.sku,
    item.status,
    item.appliedPrice,
    item.startDate?.toISOString?.().slice(0, 10),
    item.endDate?.toISOString?.().slice(0, 10),
    item.expectedDemand,
    item.actualUnits,
    item.expectedProfit,
    item.actualProfit,
    item.predictionError,
    item.profitLift,
    item.targetHit ? "Yes" : "No",
    item.rowsMeasured
  ]), {
    title: "Predicted vs actual recommendation outcomes"
  });
  return finalizeWorkbook(workbook);
}

export async function buildExaminerWorkbook() {
  const workbook = createWorkbook("Examiner Workbook");
  const dashboard = await getDashboardSummary();
  const products = await getEnrichedProducts();
  const models = await DemandModel.find({ workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" }).sort({ updatedAt: -1 }).populate("productId", "name sku category").lean();
  const recommendations = await Recommendation.find({ workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" }).sort({ createdAt: -1 }).limit(100).populate("productId", "name sku category").lean();
  const outcomes = await RecommendationOutcome.find({ workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" }).sort({ updatedAt: -1 }).limit(100).populate("productId", "name sku category").lean();
  const executive = workbook.addWorksheet("Executive Summary");
  addTitle(executive, "Examiner Workbook", "A polished overview of imported data, models, recommendations, and limitations.");
  addKeyValues(executive, [
    ["Products", dashboard.metrics.productCount],
    ["Sales rows", dashboard.metrics.salesRecords],
    ["Total revenue", dashboard.metrics.totalRevenue],
    ["Total profit", dashboard.metrics.totalProfit],
    ["Pricing insights", dashboard.metrics.modelCount],
    ["Recommendations", dashboard.metrics.recommendationCount]
  ]);
  addTable(workbook.addWorksheet("Products"), ["Product", "SKU", "Revenue", "Readiness", "Reason"], products.map((product) => [product.name, product.sku, round(product.revenue), product.readiness.status, product.readiness.reason]));
  addTable(workbook.addWorksheet("Pricing Insights"), ["Product", "Readiness", "Data Fitness", "Cost Quality", "Model", "Model Reliability", "Demand Error %", "ML Ready", "Formula", "Warnings"], models.map((model) => [model.productId?.name, model.readinessLevel, model.dataFitnessLabel, model.costQuality?.label, model.modelType, model.modelReliabilityLabel || model.reliabilityLabel, (model.backtestMetrics || model.accuracyMetrics)?.available ? (model.backtestMetrics || model.accuracyMetrics).demandMAPE : "", model.mlReadiness?.ready ? "Yes" : "No", model.formulaText, [...(model.modelWarnings || []), ...(model.modelReliabilityReasons || model.reliabilityReasons || []), ...(model.dataFitnessWarnings || [])].join(" | ")]));
  addTable(workbook.addWorksheet("Recommendations"), ["Product", "Goal", "Status", "Recommendation Status", "Decision", "Business Risk", "Optimizer", "Recommended Price", "Safe Band", "Estimated Revenue Range", "Estimated Profit Range", "Model Reliability", "Profit Uses Estimated Cost", "Explanation"], recommendations.map((item) => [item.productId?.name, item.objective, item.status || "Draft", item.recommendationStatus, item.decisionLabel, item.businessRiskLevel, item.optimizationMethod, item.recommendedPrice, item.safePriceBand ? `${item.safePriceBand.min} to ${item.safePriceBand.max}` : "", item.predictionRange?.revenue ? `${item.predictionRange.revenue.low} to ${item.predictionRange.revenue.high}` : item.expectedRevenue, item.predictionRange?.profit ? `${item.predictionRange.profit.low} to ${item.predictionRange.profit.high}` : item.expectedProfit, item.modelReliabilityLabel || item.resultReliability?.label, item.profitUsesEstimatedCost ? "Yes" : "No", item.explanation]));
  addTable(workbook.addWorksheet("Recommendation Outcomes"), ["Product", "Status", "Applied Price", "Estimated Profit", "Actual Profit", "Prediction Error %", "Profit Lift", "Target Hit"], outcomes.map((item) => [item.productId?.name, item.status, item.appliedPrice, item.expectedProfit, item.actualProfit, item.predictionError, item.profitLift, item.targetHit ? "Yes" : "No"]));
  addTable(workbook.addWorksheet("Product Matching"), ["Master Product", "Master SKU", "Possible Duplicate", "Duplicate SKU", "Category", "Shared ID", "Name Match %", "Token Overlap %", "Shared Tokens", "Price Similarity %", "Review Score %", "Decision"], findPotentialProductDuplicates(products), {
    title: "Product matching review. Price/category similarity alone is not enough to identify duplicates."
  });
  addTable(workbook.addWorksheet("Dashboard"), ["Metric", "Value"], Object.entries(dashboard.metrics));
  addTable(workbook.addWorksheet("Calculation Notes"), ["Output", "Working"], [
    ["Dashboard revenue", "Sum of imported sales revenue."],
    ["Dashboard profit", "Sum of (price - product cost) x quantity."],
    ["Pricing insight", "Raw rows are grouped into demand points before model fitting."],
    ["Scenario/recommendation revenue", "Chosen price x estimated demand."],
    ["Scenario/recommendation profit", "(Chosen price - product cost) x estimated demand."],
    ["Model reliability", "Based on grouped points, price levels, price-response direction, historical fit, and backtest evidence."],
    ["Baseline comparison", "The model's held-out demand error is compared against three naive baselines (Average Demand, Last Observation, 3-Point Moving Average). If the model cannot outperform the best naive baseline, recommendations are blocked."]
  ]);
  addTable(workbook.addWorksheet("Assumptions"), ["Area", "Assumption / Limitation"], [
    ["Modeling", "The system uses explainable statistical models, not black-box AI."],
    ["Recommendations", "Best price requires enough historical price variation."],
    ["Summary-only data", "When demand modeling is not valid, the app reports business summary instead of fake recommendations."],
    ["CSV exports", "CSV is plain data; polished reports are provided as Excel workbooks."]
  ]);
  return finalizeWorkbook(workbook);
}
