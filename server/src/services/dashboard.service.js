import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { getRecommendationPerformance } from "./recommendation-outcome.service.js";
import { SalesData } from "../models/sales-data.model.js";
import { getActiveImportBatchFilter, listImportBatches } from "./import-batch.service.js";
import { formatSegmentLabel } from "../utils/segments.js";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function getReadinessMode(readiness) {
  if (readiness.status === "Ready" || readiness.status === "Limited") return "Price Response Model";
  return readiness.warnings?.length ? "Business Summary Only" : "Insufficient Data";
}

export async function getDashboardSummary() {
  const workspaceMatch = { workspaceId: DEFAULT_WORKSPACE_ID, datasetStatus: "active" };
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const revenueExpression = { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] };
  const rowProfitExpression = {
    $subtract: [
      revenueExpression,
      { $multiply: [{ $ifNull: ["$cost", 0] }, "$quantity"] }
    ]
  };
  const [products, modelCount, recommendationCount, productSales, segments, trend, sources, recentRecommendations, readiness] = await Promise.all([
    Product.find(workspaceMatch).sort({ name: 1 }).lean(),
    DemandModel.countDocuments(workspaceMatch),
    Recommendation.countDocuments(workspaceMatch),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: "$productId",
          records: { $sum: 1 },
          units: { $sum: "$quantity" },
          revenue: { $sum: revenueExpression },
          profit: { $sum: rowProfitExpression },
          averagePrice: { $avg: "$price" },
          snapshotSku: { $first: "$productSnapshot.sku" },
          snapshotName: { $first: "$productSnapshot.name" },
          snapshotCategory: { $first: "$productSnapshot.category" }
        }
      },
      { $sort: { revenue: -1 } }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: {
            key: "$customerSegment",
            label: "$customerSegmentLabel"
          },
          records: { $sum: 1 },
          revenue: { $sum: revenueExpression },
          units: { $sum: "$quantity" }
        }
      },
      { $sort: { revenue: -1 } }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m", date: "$date" } },
          revenue: { $sum: revenueExpression },
          records: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } },
      { $limit: 12 }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: "$importMeta.source",
          rows: { $sum: 1 },
          revenue: { $sum: revenueExpression },
          lastImportedAt: { $max: "$createdAt" }
        }
      },
      { $sort: { lastImportedAt: -1 } }
    ]),
    Recommendation.find(workspaceMatch).sort({ createdAt: -1 }).limit(5).populate("productId", "name sku category").lean(),
    getInsightReadiness()
  ]);

  const productMap = new Map(products.map((product) => [String(product._id), product]));
  const enrichedProductSales = productSales.map((item) => {
    const product = productMap.get(String(item._id));

    return {
      productId: item._id,
      name: item.snapshotName || product?.name || "Unknown product",
      sku: item.snapshotSku || product?.sku || "No SKU",
      category: item.snapshotCategory || product?.category || "Uncategorized",
      revenue: round(item.revenue),
      profit: round(item.profit),
      units: round(item.units, 0),
      records: item.records,
      averagePrice: round(item.averagePrice)
    };
  });
  const categoryMap = new Map();

  for (const item of enrichedProductSales) {
    const current = categoryMap.get(item.category) || { category: item.category, records: 0, revenue: 0 };
    current.records += item.records;
    current.revenue += item.revenue;
    categoryMap.set(item.category, current);
  }

  const totalRevenue = enrichedProductSales.reduce((total, item) => total + item.revenue, 0);
  const totalProfit = enrichedProductSales.reduce((total, item) => total + item.profit, 0);
  const totalUnits = enrichedProductSales.reduce((total, item) => total + item.units, 0);
  const totalRecords = enrichedProductSales.reduce((total, item) => total + item.records, 0);
  const weightedPriceTotal = enrichedProductSales.reduce((total, item) => total + item.averagePrice * item.records, 0);
  const topProfitProduct = [...enrichedProductSales].sort((a, b) => b.profit - a.profit)[0] || null;
  const topRevenueProduct = enrichedProductSales[0] || null;
  const riskyProducts = readiness.limitedExamples || [];

  return {
    metrics: {
      productCount: products.length,
      salesRecords: totalRecords,
      totalUnits: round(totalUnits, 0),
      totalRevenue: round(totalRevenue),
      totalProfit: round(totalProfit),
      averagePrice: totalRecords ? round(weightedPriceTotal / totalRecords) : 0,
      modelCount,
      recommendationCount,
      modelReadyProducts: readiness.readyCombinations || 0,
      summaryOnlyProducts: readiness.notReadyCombinations || 0,
      riskyProducts: riskyProducts.length
    },
    topProducts: enrichedProductSales.slice(0, 8),
    topProductsByProfit: [...enrichedProductSales].sort((a, b) => b.profit - a.profit).slice(0, 8),
    businessHighlights: {
      topRevenueProduct,
      topProfitProduct,
      strongestRecommendation: recentRecommendations[0] || null,
      dataQualityWarnings: [
        ...(readiness.notReadyCombinations ? [`${readiness.notReadyCombinations} product/customer combinations can only show summary data.`] : []),
        ...(readiness.readyCombinations ? [] : ["No products are currently ready for reliable price-response modeling."])
      ]
    },
    readinessBreakdown: [
      { label: "Ready or limited", count: readiness.readyCombinations + readiness.limitedCombinations },
      { label: "Summary only", count: readiness.notReadyCombinations }
    ],
    segments: segments.map((item) => ({
      segment: item._id?.key || "retail",
      label: item._id?.label || formatSegmentLabel(item._id?.key || "retail"),
      records: item.records,
      revenue: round(item.revenue),
      units: round(item.units, 0)
    })),
    categories: [...categoryMap.values()]
      .map((item) => ({ ...item, revenue: round(item.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8),
    trend: trend.map((item) => ({
      month: item._id,
      revenue: round(item.revenue),
      records: item.records
    })),
    recentRecommendations: recentRecommendations.map((item) => ({
      _id: item._id,
      product: item.productId,
      objective: item.objective,
      segment: item.segment,
      segmentLabel: formatSegmentLabel(item.segment),
      recommendedPrice: item.recommendedPrice,
      expectedRevenue: item.expectedRevenue,
      expectedProfit: item.expectedProfit,
      improvementPercent: item.improvementPercent,
      createdAt: item.createdAt
    })),
    sources: sources.map((item) => ({
      source: item._id || "Unknown source",
      rows: item.rows,
      revenue: round(item.revenue),
      lastImportedAt: item.lastImportedAt
    }))
  };
}

export async function getDataQualitySummary() {
  const readiness = await getInsightReadiness();
  const importBatches = await listImportBatches();
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const revenueExpression = { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] };
  const [overview, sources, optional, segments] = await Promise.all([
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: null,
          rows: { $sum: 1 },
          products: { $addToSet: "$productId" },
          revenue: { $sum: revenueExpression },
          units: { $sum: "$quantity" },
          costRows: { $sum: { $cond: [{ $ne: ["$cost", null] }, 1, 0] } },
          competitorRows: { $sum: { $cond: [{ $ne: ["$competitorPrice", null] }, 1, 0] } },
          stockoutRows: { $sum: { $cond: [{ $or: [{ $eq: ["$inventory", 0] }, { $eq: ["$stockoutFlag", true] }] }, 1, 0] } },
          promotionRows: { $sum: { $cond: [{ $eq: ["$promotion", true] }, 1, 0] } },
          regionRows: { $sum: { $cond: [{ $and: [{ $ne: ["$region", null] }, { $ne: ["$region", ""] }] }, 1, 0] } },
          channelRows: { $sum: { $cond: [{ $and: [{ $ne: ["$channel", null] }, { $ne: ["$channel", ""] }] }, 1, 0] } }
        }
      }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: "$importMeta.source",
          rows: { $sum: 1 },
          revenue: { $sum: revenueExpression },
          latestRow: { $max: "$createdAt" }
        }
      },
      { $sort: { latestRow: -1 } }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: null,
          regions: { $addToSet: "$region" },
          channels: { $addToSet: "$channel" },
          seasons: { $addToSet: "$dateParts.season" }
        }
      }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: { key: "$customerSegment", label: "$customerSegmentLabel" },
          rows: { $sum: 1 },
          revenue: { $sum: revenueExpression }
        }
      },
      { $sort: { revenue: -1 } }
    ])
  ]);
  const base = overview[0] || {};
  const optionalBase = optional[0] || {};
  const detectedOptionalFields = [
    base.regionRows ? "Region" : null,
    base.channelRows ? "Sales channel" : null,
    base.promotionRows ? "Promotion" : null,
    base.competitorRows ? "Competitor price" : null,
    base.stockoutRows ? "Stockout/inventory" : null
  ].filter(Boolean);
  const warnings = [
    ...(base.rows && !base.costRows ? ["No cost values were imported, so profit is less reliable."] : []),
    ...(base.rows && !base.competitorRows ? ["No competitor prices were imported, so market comparison is unavailable."] : []),
    ...(readiness.notReadyCombinations ? [`${readiness.notReadyCombinations} combinations are summary-only because they lack enough price variation.`] : []),
    ...(base.stockoutRows ? [`${base.stockoutRows} rows look like stockouts and are excluded from model fitting.`] : [])
  ];

  return {
    overview: {
      rows: base.rows || 0,
      products: base.products?.length || 0,
      units: round(base.units, 0),
      revenue: round(base.revenue),
      costCoveragePercent: base.rows ? round((base.costRows || 0) / base.rows * 100, 1) : 0,
      competitorCoveragePercent: base.rows ? round((base.competitorRows || 0) / base.rows * 100, 1) : 0,
      stockoutRows: base.stockoutRows || 0
    },
    readiness,
    detectedOptionalFields,
    sources: sources.map((item) => ({
      source: item._id || "Unknown source",
      rows: item.rows,
      revenue: round(item.revenue),
      latestRow: item.latestRow
    })),
    customerGroups: segments.map((item) => ({
      segment: item._id?.key || "retail",
      label: item._id?.label || formatSegmentLabel(item._id?.key || "retail"),
      rows: item.rows,
      revenue: round(item.revenue)
    })),
    importBatches: importBatches.batches,
    activeImportBatchId: importBatches.activeImportBatchId,
    rollbackAvailable: importBatches.batches.some((batch) => batch.status === "archived" && batch.committedAt),
    optionalValues: {
      regions: (optionalBase.regions || []).filter(Boolean),
      channels: (optionalBase.channels || []).filter(Boolean),
      seasons: (optionalBase.seasons || []).filter(Boolean)
    },
    warnings
  };
}

export async function getProductIntelligence() {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const revenueExpression = { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] };
  const rows = await SalesData.aggregate([
    { $match: activeImportBatchFilter },
    {
      $group: {
        _id: "$productId",
        name: { $first: "$productSnapshot.name" },
        sku: { $first: "$productSnapshot.sku" },
        category: { $first: "$productSnapshot.category" },
        records: { $sum: 1 },
        units: { $sum: "$quantity" },
        revenue: { $sum: revenueExpression },
        costTotal: { $sum: { $multiply: [{ $ifNull: ["$cost", 0] }, "$quantity"] } },
        avgPrice: { $avg: "$price" },
        avgCost: { $avg: "$cost" },
        minPrice: { $min: "$price" },
        maxPrice: { $max: "$price" },
        minDemand: { $min: "$quantity" },
        maxDemand: { $max: "$quantity" },
        prices: { $addToSet: "$price" },
        segments: { $addToSet: "$customerSegmentLabel" },
        latestSaleDate: { $max: "$date" },
        competitorRows: { $sum: { $cond: [{ $ne: ["$competitorPrice", null] }, 1, 0] } },
        costRows: { $sum: { $cond: [{ $ne: ["$cost", null] }, 1, 0] } },
        stockoutRows: { $sum: { $cond: [{ $or: [{ $eq: ["$inventory", 0] }, { $eq: ["$stockoutFlag", true] }] }, 1, 0] } }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  const products = rows.map((item) => {
    const readiness = assessReadinessSummary({
      records: item.records,
      distinctPrices: item.prices?.length || 0,
      zeroQuantityRows: 0,
      costRows: item.costRows || 0,
      competitorRows: item.competitorRows || 0,
      belowCostRows: 0,
      stockoutRows: item.stockoutRows || 0
    });
    const revenue = Number(item.revenue || 0);
    const profit = revenue - Number(item.costTotal || 0);
    const marginPercent = revenue ? profit / revenue * 100 : 0;
    const score = revenue * Math.max(1, item.prices?.length || 0) * (readiness.status === "Ready" ? 1.5 : readiness.status === "Limited" ? 1 : 0.25);

    return {
      productId: item._id,
      name: item.name || "Unknown product",
      sku: item.sku || "No SKU",
      category: item.category || "Uncategorized",
      records: item.records,
      units: round(item.units, 0),
      revenue: round(revenue),
      profit: round(profit),
      marginPercent: round(marginPercent, 1),
      averagePrice: round(item.avgPrice),
      averageCost: round(item.avgCost),
      priceRange: { min: round(item.minPrice), max: round(item.maxPrice) },
      demandRange: { min: round(item.minDemand, 0), max: round(item.maxDemand, 0) },
      distinctPriceCount: item.prices?.length || 0,
      customerGroups: (item.segments || []).filter(Boolean),
      latestSaleDate: item.latestSaleDate,
      readiness,
      analysisScore: round(score, 0)
    };
  });

  return {
    products,
    bestToAnalyze: products.filter((item) => item.readiness.status !== "Not ready").sort((a, b) => b.analysisScore - a.analysisScore).slice(0, 8),
    needsData: products.filter((item) => item.readiness.status === "Not ready").slice(0, 8)
  };
}

export async function getCustomerSegmentSummary() {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const revenueExpression = { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] };
  const rows = await SalesData.aggregate([
    { $match: activeImportBatchFilter },
    {
      $group: {
        _id: { key: "$customerSegment", label: "$customerSegmentLabel" },
        rows: { $sum: 1 },
        products: { $addToSet: "$productId" },
        units: { $sum: "$quantity" },
        revenue: { $sum: revenueExpression },
        costTotal: { $sum: { $multiply: [{ $ifNull: ["$cost", 0] }, "$quantity"] } },
        avgPrice: { $avg: "$price" },
        prices: { $addToSet: "$price" }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  return rows.map((item) => {
    const revenue = Number(item.revenue || 0);
    const profit = revenue - Number(item.costTotal || 0);

    return {
      segment: item._id?.key || "retail",
      label: item._id?.label || formatSegmentLabel(item._id?.key || "retail"),
      rows: item.rows,
      products: item.products?.length || 0,
      units: round(item.units, 0),
      revenue: round(revenue),
      profit: round(profit),
      marginPercent: revenue ? round(profit / revenue * 100, 1) : 0,
      averagePrice: round(item.avgPrice),
      distinctPriceCount: item.prices?.length || 0,
      readinessHint: item.rows >= 8 && (item.prices?.length || 0) >= 3 ? "Good segment for analysis" : item.rows >= 3 ? "Usable for summary and limited analysis" : "Needs more rows"
    };
  });
}

export async function getCompetitorMarketSummary() {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const rows = await SalesData.aggregate([
    { $match: { ...activeImportBatchFilter, competitorPrice: { $ne: null } } },
    {
      $group: {
        _id: "$productId",
        name: { $first: "$productSnapshot.name" },
        sku: { $first: "$productSnapshot.sku" },
        category: { $first: "$productSnapshot.category" },
        rows: { $sum: 1 },
        avgPrice: { $avg: "$price" },
        avgCompetitorPrice: { $avg: "$competitorPrice" },
        minCompetitorPrice: { $min: "$competitorPrice" },
        maxCompetitorPrice: { $max: "$competitorPrice" }
      }
    },
    { $sort: { rows: -1 } }
  ]);

  const products = rows.map((item) => {
    const gap = Number(item.avgPrice || 0) - Number(item.avgCompetitorPrice || 0);
    const gapPercent = item.avgCompetitorPrice ? gap / item.avgCompetitorPrice * 100 : 0;
    const riskLabel = gapPercent > 10 ? "Priced above market" : gapPercent < -10 ? "Priced below market" : "Near market";

    return {
      productId: item._id,
      name: item.name || "Unknown product",
      sku: item.sku || "No SKU",
      category: item.category || "Uncategorized",
      rows: item.rows,
      averagePrice: round(item.avgPrice),
      averageCompetitorPrice: round(item.avgCompetitorPrice),
      competitorRange: { min: round(item.minCompetitorPrice), max: round(item.maxCompetitorPrice) },
      gap: round(gap),
      gapPercent: round(gapPercent, 1),
      riskLabel
    };
  });

  return {
    available: products.length > 0,
    products,
    summary: {
      productsWithCompetitorData: products.length,
      aboveMarket: products.filter((item) => item.riskLabel === "Priced above market").length,
      belowMarket: products.filter((item) => item.riskLabel === "Priced below market").length,
      nearMarket: products.filter((item) => item.riskLabel === "Near market").length
    },
    message: products.length ? "Competitor prices were detected in the uploaded data." : "No competitor price column was detected in the uploaded CSV, so market comparison is not available."
  };
}

export async function getSeasonalitySummary() {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const revenueExpression = { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] };
  const [monthly, promotionSplit, weekendSplit] = await Promise.all([
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: "$dateParts.month",
          rows: { $sum: 1 },
          units: { $sum: "$quantity" },
          revenue: { $sum: revenueExpression },
          promotionRows: { $sum: { $cond: [{ $eq: ["$promotion", true] }, 1, 0] } },
          holidayRows: { $sum: { $cond: [{ $eq: ["$holiday", true] }, 1, 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: "$promotion",
          rows: { $sum: 1 },
          units: { $sum: "$quantity" },
          revenue: { $sum: revenueExpression },
          averagePrice: { $avg: "$price" }
        }
      }
    ]),
    SalesData.aggregate([
      { $match: activeImportBatchFilter },
      {
        $group: {
          _id: "$dateParts.isWeekend",
          rows: { $sum: 1 },
          units: { $sum: "$quantity" },
          revenue: { $sum: revenueExpression },
          averagePrice: { $avg: "$price" }
        }
      }
    ])
  ]);
  const validMonths = monthly.filter((item) => Number.isFinite(item._id));
  const averageMonthlyUnits = validMonths.length
    ? validMonths.reduce((total, item) => total + Number(item.units || 0), 0) / validMonths.length
    : 0;
  const reliability = validMonths.length >= 4 && validMonths.reduce((total, item) => total + item.rows, 0) >= 20
    ? "Usable"
    : validMonths.length >= 2
      ? "Directional"
      : "Not reliable";

  return {
    reliability,
    message: reliability === "Not reliable"
      ? "Seasonality is not reliable from this CSV because too few months are represented."
      : "Seasonality is shown as business context and used in modeling only when the product-level data supports it.",
    monthly: validMonths.map((item) => ({
      month: item._id,
      rows: item.rows,
      units: round(item.units, 0),
      revenue: round(item.revenue),
      promotionRows: item.promotionRows,
      holidayRows: item.holidayRows,
      demandIndex: averageMonthlyUnits ? round((Number(item.units || 0) / averageMonthlyUnits) * 100, 1) : 0
    })),
    promotionSplit: promotionSplit.map((item) => ({
      label: item._id ? "Promotional sales" : "Regular sales",
      rows: item.rows,
      units: round(item.units, 0),
      revenue: round(item.revenue),
      averagePrice: round(item.averagePrice)
    })),
    weekendSplit: weekendSplit.map((item) => ({
      label: item._id ? "Weekend" : "Weekday",
      rows: item.rows,
      units: round(item.units, 0),
      revenue: round(item.revenue),
      averagePrice: round(item.averagePrice)
    })),
    limitations: [
      ...(reliability !== "Usable" ? ["Use this as context only; product-level recommendations still depend on model readiness."] : []),
      "Seasonality is not allowed to override weak or abnormal price-response models."
    ]
  };
}

function correlation(leftValues, rightValues) {
  const n = Math.min(leftValues.length, rightValues.length);
  if (n < 3) return null;
  const leftMean = leftValues.reduce((total, value) => total + value, 0) / n;
  const rightMean = rightValues.reduce((total, value) => total + value, 0) / n;
  let numerator = 0;
  let leftDenominator = 0;
  let rightDenominator = 0;

  for (let index = 0; index < n; index += 1) {
    const leftDelta = leftValues[index] - leftMean;
    const rightDelta = rightValues[index] - rightMean;
    numerator += leftDelta * rightDelta;
    leftDenominator += leftDelta ** 2;
    rightDenominator += rightDelta ** 2;
  }

  const denominator = Math.sqrt(leftDenominator * rightDenominator);
  return denominator ? numerator / denominator : null;
}

export async function getProductRelationships() {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const rows = await SalesData.aggregate([
    { $match: activeImportBatchFilter },
    {
      $group: {
        _id: {
          productId: "$productId",
          productName: "$productSnapshot.name",
          sku: "$productSnapshot.sku",
          category: "$productSnapshot.category",
          date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }
        },
        quantity: { $sum: "$quantity" },
        averagePrice: { $avg: "$price" }
      }
    },
    { $sort: { "_id.category": 1, "_id.productName": 1, "_id.date": 1 } }
  ]);
  const byProduct = new Map();

  for (const row of rows) {
    const productId = String(row._id.productId);
    const current = byProduct.get(productId) || {
      productId,
      name: row._id.productName || "Unknown product",
      sku: row._id.sku || "No SKU",
      category: row._id.category || "Uncategorized",
      dates: new Map()
    };
    current.dates.set(row._id.date, {
      quantity: Number(row.quantity || 0),
      price: Number(row.averagePrice || 0)
    });
    byProduct.set(productId, current);
  }

  const products = [...byProduct.values()];
  const relationships = [];

  for (let leftIndex = 0; leftIndex < products.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < products.length; rightIndex += 1) {
      const left = products[leftIndex];
      const right = products[rightIndex];
      if (left.category !== right.category) continue;

      const sharedDates = [...left.dates.keys()].filter((date) => right.dates.has(date));
      if (sharedDates.length < 3) {
        relationships.push({
          leftProduct: left,
          rightProduct: right,
          category: left.category,
          overlappingDates: sharedDates.length,
          relationship: "Not enough overlapping data",
          confidence: "Weak",
          quantityCorrelation: null
        });
        continue;
      }

      const leftQuantity = sharedDates.map((date) => left.dates.get(date).quantity);
      const rightQuantity = sharedDates.map((date) => right.dates.get(date).quantity);
      const quantityCorrelation = correlation(leftQuantity, rightQuantity);
      const relationship = quantityCorrelation === null
        ? "No clear relationship"
        : quantityCorrelation <= -0.35
          ? "Possible substitute"
          : quantityCorrelation >= 0.35
            ? "Possible complement"
            : "No clear relationship";

      relationships.push({
        leftProduct: left,
        rightProduct: right,
        category: left.category,
        overlappingDates: sharedDates.length,
        relationship,
        confidence: sharedDates.length >= 8 && Math.abs(quantityCorrelation || 0) >= 0.45 ? "Usable" : "Directional",
        quantityCorrelation: quantityCorrelation === null ? null : round(quantityCorrelation, 3)
      });
    }
  }

  return {
    relationships: relationships
      .sort((left, right) => Math.abs(right.quantityCorrelation || 0) - Math.abs(left.quantityCorrelation || 0))
      .slice(0, 50),
    summary: {
      productsChecked: products.length,
      possibleSubstitutes: relationships.filter((item) => item.relationship === "Possible substitute").length,
      possibleComplements: relationships.filter((item) => item.relationship === "Possible complement").length,
      notEnoughData: relationships.filter((item) => item.relationship === "Not enough overlapping data").length
    },
    limitations: [
      "Relationships are cautionary signals, not automatic cross-product optimization.",
      "A reliable cross-product recommendation needs overlapping dates and price variation for both products."
    ]
  };
}

export { getRecommendationPerformance };

export function assessReadinessSummary(summary) {
  const warnings = [];

  if (summary.records < 3) warnings.push(`Only ${summary.records} sales row${summary.records === 1 ? "" : "s"}.`);
  if (summary.distinctPrices < 2) warnings.push("No price variation.");
  if (summary.zeroQuantityRows > summary.records * 0.4) warnings.push("Many rows have zero quantity.");
  if (!summary.costRows) warnings.push("No cost values were imported.");
  if (!summary.competitorRows) warnings.push("No competitor prices were imported.");
  if (summary.belowCostRows > 0) warnings.push(`${summary.belowCostRows} row${summary.belowCostRows === 1 ? "" : "s"} priced below cost.`);
  if (summary.stockoutRows > 0) warnings.push(`${summary.stockoutRows} stockout row${summary.stockoutRows === 1 ? "" : "s"} will be excluded from modeling.`);

  const status = summary.records >= 8 && summary.distinctPrices >= 3 && summary.zeroQuantityRows <= summary.records * 0.2 ? "Ready" : summary.records >= 3 && summary.distinctPrices >= 2 ? "Limited" : "Not ready";

  return {
    status,
    warnings,
    reason: warnings[0] || "Enough repeated rows and price variation for a pricing insight."
  };
}

export async function getInsightReadiness() {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const rows = await SalesData.aggregate([
    { $match: { ...activeImportBatchFilter, excludedFromModel: { $ne: true } } },
    {
      $group: {
        _id: {
          productId: "$productId",
          sku: "$productSnapshot.sku",
          name: "$productSnapshot.name",
          segment: "$customerSegment",
          segmentLabel: "$customerSegmentLabel"
        },
        records: { $sum: 1 },
        units: { $sum: "$quantity" },
        distinctPrices: { $addToSet: "$price" },
        zeroQuantityRows: { $sum: { $cond: [{ $eq: ["$quantity", 0] }, 1, 0] } },
        costRows: { $sum: { $cond: [{ $ne: ["$cost", null] }, 1, 0] } },
        competitorRows: { $sum: { $cond: [{ $ne: ["$competitorPrice", null] }, 1, 0] } },
        belowCostRows: { $sum: { $cond: [{ $lt: ["$price", "$cost"] }, 1, 0] } },
        stockoutRows: { $sum: { $cond: [{ $or: [{ $eq: ["$inventory", 0] }, { $eq: ["$stockoutFlag", true] }] }, 1, 0] } },
        revenue: {
          $sum: { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] }
        }
      }
    },
    { $sort: { records: -1, revenue: -1 } }
  ]);
  const enrichedRows = rows.map((item) => {
    const readiness = assessReadinessSummary({
      records: item.records,
      distinctPrices: item.distinctPrices?.length || 0,
      zeroQuantityRows: item.zeroQuantityRows || 0,
      costRows: item.costRows || 0,
      competitorRows: item.competitorRows || 0,
      belowCostRows: item.belowCostRows || 0,
      stockoutRows: item.stockoutRows || 0
    });
    const resultMode = getReadinessMode(readiness);
    const revenue = Number(item.revenue || 0);
    const units = Number(item.units || 0);

    return {
      ...item,
      readiness,
      resultMode,
      canFitModel: resultMode === "Price Response Model",
      canShowSummary: item.records > 0,
      blockingReasons: resultMode === "Price Response Model" ? [] : readiness.warnings,
      summaryMetrics: {
        rawRows: item.records,
        usableRows: Math.max(0, item.records - (item.stockoutRows || 0)),
        groupedDemandPoints: item.records,
        unitsSold: units,
        revenue: round(revenue),
        averagePrice: units ? round(revenue / units) : 0,
        distinctPriceCount: item.distinctPrices?.length || 0
      }
    };
  });
  const ready = enrichedRows.filter((item) => item.readiness.status === "Ready");
  const limited = enrichedRows.filter((item) => item.readiness.status === "Limited");
  const notReady = enrichedRows.filter((item) => item.readiness.status === "Not ready");

  return {
    totalCombinations: enrichedRows.length,
    readyCombinations: ready.length,
    limitedCombinations: limited.length,
    notReadyCombinations: notReady.length,
    minimumRecords: 3,
    ready: [...ready, ...limited].slice(0, 20).map((item) => ({
      productId: item._id.productId,
      sku: item._id.sku || "No SKU",
      name: item._id.name || "Unknown product",
      segment: item._id.segment || "all",
      segmentLabel: item._id.segmentLabel || formatSegmentLabel(item._id.segment),
      records: item.records,
      revenue: round(item.revenue),
      readinessStatus: item.readiness.status,
      readinessReason: item.readiness.reason,
      resultMode: item.resultMode,
      canFitModel: item.canFitModel,
      canShowSummary: item.canShowSummary,
      blockingReasons: item.blockingReasons,
      summaryMetrics: item.summaryMetrics,
      warnings: item.readiness.warnings
    })),
    limitedExamples: notReady.slice(0, 10).map((item) => ({
      productId: item._id.productId,
      sku: item._id.sku || "No SKU",
      name: item._id.name || "Unknown product",
      segment: item._id.segment || "all",
      segmentLabel: item._id.segmentLabel || formatSegmentLabel(item._id.segment),
      records: item.records,
      readinessStatus: item.readiness.status,
      readinessReason: item.readiness.reason,
      resultMode: item.resultMode,
      canFitModel: item.canFitModel,
      canShowSummary: item.canShowSummary,
      blockingReasons: item.blockingReasons,
      summaryMetrics: item.summaryMetrics,
      warnings: item.readiness.warnings
    }))
  };
}
