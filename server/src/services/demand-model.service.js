import mongoose from "mongoose";
import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { assessDataFitness, buildPredictionRange, summarizeBacktest } from "./data-fitness.service.js";
import { getActiveImportBatchFilter } from "./import-batch.service.js";
import { assessModelEvidence } from "./trust-policy.service.js";
import { isValidSegment } from "../utils/segments.js";

export function isSupportedSegment(segment) {
  return isValidSegment(segment);
}

export function getDemandModelWarnings(model) {
  const warnings = [];

  if (model.modelWarnings?.length) {
    warnings.push(...model.modelWarnings);
  }

  if (model.limitations?.length) {
    warnings.push(...model.limitations.slice(0, 3));
  }

  if (model.rSquared < 0.35) {
    warnings.push("Use this as a directional estimate because the sales pattern is noisy.");
  }

  if (model.modelType === "linear" && model.b <= 0) {
    warnings.push("The uploaded data does not show normal price-sensitive demand.");
  }

  if (model.modelType === "context-adjusted" && model.b <= 0) {
    warnings.push("Even after context adjustment, the model does not show normal price-sensitive demand.");
  }

  if (model.modelType === "log-log" && model.b >= 0) {
    warnings.push("The log-log model does not show normal price-sensitive demand.");
  }

  if (model.a <= 0) {
    warnings.push("The fitted baseline demand is below zero, so predictions may clamp to zero.");
  }

  if (model.recordsUsed < 10) {
    warnings.push("More repeated sales rows for this product and customer group would improve model reliability.");
  }

  return warnings;
}

function buildTrainingSummary(records, excludedRows = 0) {
  const prices = records.map((record) => Number(record.price)).filter(Number.isFinite);
  const quantities = records.map((record) => Number(record.quantity)).filter(Number.isFinite);
  const dates = records.map((record) => new Date(record.date)).filter((date) => !Number.isNaN(date.getTime())).sort((a, b) => a - b);

  return {
    excludedRows,
    priceRangeMin: Math.min(...prices),
    priceRangeMax: Math.max(...prices),
    averagePrice: prices.reduce((total, price) => total + price, 0) / prices.length,
    averageDemand: quantities.reduce((total, quantity) => total + quantity, 0) / quantities.length,
    demandRangeMin: Math.min(...quantities),
    demandRangeMax: Math.max(...quantities),
    dataStartDate: dates[0],
    dataEndDate: dates[dates.length - 1],
    distinctPrices: new Set(prices.map((price) => price.toFixed(4))).size,
    promotionRows: records.filter((record) => record.promotion).length,
    competitorRows: records.filter((record) => Number.isFinite(record.competitorPrice)).length
  };
}

function aggregateDemandRecords(records) {
  const groups = new Map();

  for (const record of records) {
    const date = record.date ? new Date(record.date) : new Date();
    const dateKey = Number.isNaN(date.getTime()) ? "unknown-date" : date.toISOString().slice(0, 10);
    const price = Number(record.price);
    const key = `${record.productId}|${record.customerSegment || "all"}|${dateKey}|${price.toFixed(4)}`;
    const current = groups.get(key) || {
      productId: record.productId,
      customerSegment: record.customerSegment,
      date,
      price,
      quantity: 0,
      revenue: 0,
      rawRows: 0,
      promotionRows: 0,
      competitorRows: 0,
      competitorPriceTotal: 0,
      discountRows: 0,
      discountTotal: 0,
      holidayRows: 0,
      weekendRows: 0,
      marketingSpendRows: 0,
      marketingSpendTotal: 0,
      costRows: 0,
      costTotal: 0,
      regionCounts: {},
      channelCounts: {},
      month: record.dateParts?.month || date.getMonth() + 1,
      season: record.dateParts?.season
    };

    current.quantity += Number(record.quantity || 0);
    current.revenue += Number(record.revenue ?? record.price * record.quantity ?? 0);
    current.rawRows += 1;
    current.promotionRows += record.promotion ? 1 : 0;
    if (Number.isFinite(record.competitorPrice)) {
      current.competitorRows += 1;
      current.competitorPriceTotal += Number(record.competitorPrice);
    }
    if (Number.isFinite(record.discount)) {
      current.discountRows += 1;
      current.discountTotal += Number(record.discount);
    }
    if (record.holiday) current.holidayRows += 1;
    if (record.dateParts?.isWeekend) current.weekendRows += 1;
    if (Number.isFinite(record.marketingSpend)) {
      current.marketingSpendRows += 1;
      current.marketingSpendTotal += Number(record.marketingSpend);
    }
    if (Number.isFinite(record.cost)) {
      current.costRows += 1;
      current.costTotal += Number(record.cost);
    }
    if (record.region) current.regionCounts[record.region] = (current.regionCounts[record.region] || 0) + 1;
    if (record.channel) current.channelCounts[record.channel] = (current.channelCounts[record.channel] || 0) + 1;
    groups.set(key, current);
  }

  return [...groups.values()].map((group) => {
    const dominantRegion = Object.entries(group.regionCounts).sort((left, right) => right[1] - left[1])[0]?.[0];
    const dominantChannel = Object.entries(group.channelCounts).sort((left, right) => right[1] - left[1])[0]?.[0];

    return {
      ...group,
      competitorPrice: group.competitorRows ? group.competitorPriceTotal / group.competitorRows : undefined,
      competitorCoverage: group.rawRows ? group.competitorRows / group.rawRows : 0,
      promotionShare: group.rawRows ? group.promotionRows / group.rawRows : 0,
      discount: group.discountRows ? group.discountTotal / group.discountRows : 0,
      holidayShare: group.rawRows ? group.holidayRows / group.rawRows : 0,
      weekendShare: group.rawRows ? group.weekendRows / group.rawRows : 0,
      marketingSpend: group.marketingSpendRows ? group.marketingSpendTotal / group.marketingSpendRows : 0,
      cost: group.costRows ? group.costTotal / group.costRows : 0,
      region: dominantRegion,
      channel: dominantChannel
    };
  }).sort((left, right) => {
    const dateOrder = new Date(left.date) - new Date(right.date);
    return dateOrder || left.price - right.price;
  });
}

async function getDemandRecordCounts(query) {
  const [counts] = await SalesData.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        rawRows: { $sum: 1 },
        usableRows: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] }
                ]
              },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  return {
    rawRows: counts?.rawRows || 0,
    usableRows: counts?.usableRows || 0,
    excludedRows: (counts?.rawRows || 0) - (counts?.usableRows || 0)
  };
}

async function getGroupedDemandRecords(query) {
  const records = await SalesData.aggregate([
    {
      $match: {
        ...query,
        inventory: { $ne: 0 },
        stockoutFlag: { $ne: true }
      }
    },
    {
      $addFields: {
        dateKey: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
        monthValue: { $ifNull: ["$dateParts.month", { $month: "$date" }] },
        seasonValue: "$dateParts.season",
        weekendValue: { $cond: [{ $eq: ["$dateParts.isWeekend", true] }, 1, 0] },
        promotionValue: { $cond: [{ $eq: ["$promotion", true] }, 1, 0] },
        holidayValue: { $cond: [{ $eq: ["$holiday", true] }, 1, 0] }
      }
    },
    {
      $group: {
        _id: {
          productId: "$productId",
          customerSegment: "$customerSegment",
          dateKey: "$dateKey",
          price: "$price"
        },
        productId: { $first: "$productId" },
        customerSegment: { $first: "$customerSegment" },
        date: { $min: "$date" },
        price: { $first: "$price" },
        quantity: { $sum: "$quantity" },
        revenue: { $sum: { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] } },
        rawRows: { $sum: 1 },
        promotionRows: { $sum: "$promotionValue" },
        holidayRows: { $sum: "$holidayValue" },
        weekendRows: { $sum: "$weekendValue" },
        competitorRows: { $sum: { $cond: [{ $ne: ["$competitorPrice", null] }, 1, 0] } },
        competitorPriceTotal: { $sum: { $ifNull: ["$competitorPrice", 0] } },
        discountRows: { $sum: { $cond: [{ $ne: ["$discount", null] }, 1, 0] } },
        discountTotal: { $sum: { $ifNull: ["$discount", 0] } },
        marketingSpendRows: { $sum: { $cond: [{ $ne: ["$marketingSpend", null] }, 1, 0] } },
        marketingSpendTotal: { $sum: { $ifNull: ["$marketingSpend", 0] } },
        costRows: { $sum: { $cond: [{ $ne: ["$cost", null] }, 1, 0] } },
        costTotal: { $sum: { $ifNull: ["$cost", 0] } },
        month: { $first: "$monthValue" },
        season: { $first: "$seasonValue" },
        region: { $first: "$region" },
        channel: { $first: "$channel" }
      }
    },
    {
      $project: {
        _id: 0,
        productId: 1,
        customerSegment: 1,
        date: 1,
        price: 1,
        quantity: 1,
        revenue: 1,
        rawRows: 1,
        month: 1,
        season: 1,
        region: 1,
        channel: 1,
        competitorPrice: {
          $cond: [{ $gt: ["$competitorRows", 0] }, { $divide: ["$competitorPriceTotal", "$competitorRows"] }, null]
        },
        competitorCoverage: {
          $cond: [{ $gt: ["$rawRows", 0] }, { $divide: ["$competitorRows", "$rawRows"] }, 0]
        },
        promotionShare: {
          $cond: [{ $gt: ["$rawRows", 0] }, { $divide: ["$promotionRows", "$rawRows"] }, 0]
        },
        discount: {
          $cond: [{ $gt: ["$discountRows", 0] }, { $divide: ["$discountTotal", "$discountRows"] }, 0]
        },
        holidayShare: {
          $cond: [{ $gt: ["$rawRows", 0] }, { $divide: ["$holidayRows", "$rawRows"] }, 0]
        },
        weekendShare: {
          $cond: [{ $gt: ["$rawRows", 0] }, { $divide: ["$weekendRows", "$rawRows"] }, 0]
        },
        marketingSpend: {
          $cond: [{ $gt: ["$marketingSpendRows", 0] }, { $divide: ["$marketingSpendTotal", "$marketingSpendRows"] }, 0]
        },
        cost: {
          $cond: [{ $gt: ["$costRows", 0] }, { $divide: ["$costTotal", "$costRows"] }, 0]
        }
      }
    },
    { $sort: { date: 1, price: 1 } }
  ]);

  return records.map((record) => ({
    ...record,
    competitorPrice: Number.isFinite(record.competitorPrice) ? record.competitorPrice : undefined
  }));
}

async function getSalesSummaryMetrics(query) {
  const [summary] = await SalesData.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        rawRows: { $sum: 1 },
        usableRows: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] }
                ]
              },
              1,
              0
            ]
          }
        },
        unitsSold: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] }
                ]
              },
              "$quantity",
              0
            ]
          }
        },
        revenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] }
                ]
              },
              { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] },
              0
            ]
          }
        },
        estimatedCost: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] }
                ]
              },
              { $multiply: [{ $ifNull: ["$cost", 0] }, "$quantity"] },
              0
            ]
          }
        },
        priceTotal: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] }
                ]
              },
              "$price",
              0
            ]
          }
        },
        costTotal: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] },
                  { $ne: ["$cost", null] }
                ]
              },
              "$cost",
              0
            ]
          }
        },
        costRows: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ["$inventory", 0] },
                  { $ne: ["$stockoutFlag", true] },
                  { $ne: ["$cost", null] }
                ]
              },
              1,
              0
            ]
          }
        },
        lowestPrice: { $min: "$price" },
        highestPrice: { $max: "$price" }
      }
    }
  ]);

  return summary || {
    rawRows: 0,
    usableRows: 0,
    unitsSold: 0,
    revenue: 0,
    estimatedCost: 0,
    priceTotal: 0,
    costTotal: 0,
    costRows: 0,
    lowestPrice: 0,
    highestPrice: 0
  };
}

function isNormalPriceResponse(model) {
  if (!model) return false;
  return model.modelType === "log-log" ? model.b < 0 : model.b > 0;
}

export function assessModelReliability({ model, groupedRecords, rawRowsUsed, excludedRows, distinctPriceCount }) {
  const reasons = [];
  const pointCount = groupedRecords.length;
  const normalResponse = isNormalPriceResponse(model);
  let score = 0;

  if (pointCount >= 10) score += 30;
  else if (pointCount >= 5) score += 20;
  else if (pointCount >= 3) score += 10;
  else reasons.push("Fewer than 3 grouped demand points.");

  if (distinctPriceCount >= 3) score += 25;
  else if (distinctPriceCount >= 2) score += 15;
  else reasons.push("Prices do not change enough to learn price response.");

  if (model.rSquared >= 0.7) score += 25;
  else if (model.rSquared >= 0.35) score += 15;
  else reasons.push("Sales pattern is noisy, so model reliability is low.");

  if (normalResponse) score += 20;
  else reasons.push("Demand does not fall when price increases in the uploaded data.");

  if (excludedRows > 0) {
    reasons.push(`${excludedRows} raw row${excludedRows === 1 ? "" : "s"} excluded from modeling.`);
  }

  if (rawRowsUsed > pointCount) {
    reasons.push(`${rawRowsUsed} raw rows were grouped into ${pointCount} demand points.`);
  }

  const label = pointCount >= 10 && distinctPriceCount >= 3 && model.rSquared >= 0.7 && normalResponse
    ? "Strong"
    : pointCount >= 5 && distinctPriceCount >= 2 && model.rSquared >= 0.35 && normalResponse
      ? "Usable"
      : "Weak";

  if (!reasons.length) {
    reasons.push(label === "Strong" ? "Enough demand points, price variation, and historical fit for a strong estimate." : "Enough data for a usable directional pricing estimate.");
  }

  return {
    reliabilityScore: Math.max(0, Math.min(100, Math.round(score))),
    reliabilityLabel: label,
    reliabilityReasons: reasons
  };
}

function getBlockingReasons({ groupedDemandPoints, distinctPriceCount, usableRows }) {
  const reasons = [];

  if (usableRows <= 0) reasons.push("No usable sales rows were found for this product and customer group.");
  if (groupedDemandPoints < 3) reasons.push(`Only ${groupedDemandPoints} grouped demand point${groupedDemandPoints === 1 ? "" : "s"} available.`);
  if (distinctPriceCount < 2) reasons.push(`Only ${distinctPriceCount} price level${distinctPriceCount === 1 ? "" : "s"} available.`);

  return reasons;
}

function countUsefulContextSignals(records) {
  const signals = [];
  const distinctMonths = new Set(records.map((record) => Number(record.month)).filter(Number.isFinite)).size;
  const regions = new Set(records.map((record) => record.region).filter(Boolean)).size;
  const channels = new Set(records.map((record) => record.channel).filter(Boolean)).size;

  if (hasUsefulVariation(records, (record) => Number.isFinite(record.competitorPrice) ? (record.price - record.competitorPrice) / record.price : undefined)) {
    signals.push("competitor price gap");
  }

  if (hasUsefulVariation(records, (record) => record.promotionShare) || hasUsefulVariation(records, (record) => record.discount)) {
    signals.push("promotion/discount");
  }

  if (hasUsefulVariation(records, (record) => record.holidayShare) || hasUsefulVariation(records, (record) => record.weekendShare) || distinctMonths >= 3) {
    signals.push("seasonality/date pattern");
  }

  if (regions >= 2) signals.push("region");
  if (channels >= 2) signals.push("channel");
  if (hasUsefulVariation(records, (record) => record.marketingSpend)) signals.push("marketing spend");

  return signals;
}

function daysBetween(startDate, endDate) {
  if (!(startDate instanceof Date) || !(endDate instanceof Date)) return 0;
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.max(0, Math.round((endDate - startDate) / (24 * 60 * 60 * 1000)));
}

function assessReadinessGate({ rawRecords, usableRecords, groupedRecords, trainingSummary, distinctPriceCount }) {
  const contextSignals = countUsefulContextSignals(groupedRecords);
  const dateCoverageDays = daysBetween(trainingSummary.dataStartDate, trainingSummary.dataEndDate);
  const reasons = [];
  let readinessLevel = "Not enough data";

  if (!usableRecords.length) {
    reasons.push("No usable sales rows after excluding stockouts.");
  } else if (groupedRecords.length < 3 || distinctPriceCount < 2) {
    readinessLevel = "Summary only";
    if (groupedRecords.length < 3) reasons.push("Needs at least 3 grouped demand points.");
    if (distinctPriceCount < 2) reasons.push("Needs at least 2 different price levels.");
  } else if (usableRecords.length >= 100 && groupedRecords.length >= 30 && distinctPriceCount >= 5 && dateCoverageDays >= 30 && contextSignals.length >= 2) {
    readinessLevel = "ML model ready";
    reasons.push("Enough rows, price levels, date coverage, and context fields for an advanced ML model candidate.");
  } else if (groupedRecords.length >= 10 && distinctPriceCount >= 3 && contextSignals.length >= 1) {
    readinessLevel = "Context model ready";
    reasons.push("Enough demand points, price variation, and context fields for context-adjusted regression.");
  } else {
    readinessLevel = "Simple model ready";
    reasons.push("Enough price variation for a simple explainable price-response model.");
  }

  if (rawRecords.length !== usableRecords.length) {
    reasons.push(`${rawRecords.length - usableRecords.length} stockout row${rawRecords.length - usableRecords.length === 1 ? "" : "s"} excluded from model fitting.`);
  }

  return {
    readinessLevel,
    readinessDetails: {
      rawRows: rawRecords.length,
      usableRows: usableRecords.length,
      groupedDemandPoints: groupedRecords.length,
      distinctPriceCount,
      dateCoverageDays,
      contextSignals,
      reasons
    },
    mlReadiness: {
      ready: readinessLevel === "ML model ready",
      minimums: {
        usableRows: 100,
        groupedDemandPoints: 30,
        distinctPrices: 5,
        dateCoverageDays: 30,
        contextSignals: 2
      },
      current: {
        usableRows: usableRecords.length,
        groupedDemandPoints: groupedRecords.length,
        distinctPrices: distinctPriceCount,
        dateCoverageDays,
        contextSignals: contextSignals.length
      },
      message: readinessLevel === "ML model ready"
        ? "Advanced ML can be considered for this dataset, but the app still compares it against explainable baselines before trusting it."
        : "Advanced ML is not enabled for this product because the data is not rich enough yet."
    }
  };
}

export async function getInsightSummary({ productId, segment = "all" }) {
  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const query = {
    productId: typeof productId === "string" ? new mongoose.Types.ObjectId(productId) : productId,
    ...(segment !== "all" && { customerSegment: segment }),
    excludedFromModel: { $ne: true },
    ...activeImportBatchFilter
  };
  const [summary, groupedRecords, product] = await Promise.all([
    getSalesSummaryMetrics(query),
    getGroupedDemandRecords(query),
    Product.findOne({ _id: productId, datasetStatus: "active" }).lean()
  ]);
  const distinctPriceCount = new Set(groupedRecords.map((record) => Number(record.price).toFixed(4))).size;
  const canFitModel = groupedRecords.length >= 3 && distinctPriceCount >= 2;
  const canShowSummary = summary.usableRows > 0;
  const trainingSummary = groupedRecords.length ? buildTrainingSummary(groupedRecords, summary.rawRows - summary.usableRows) : {};
  const readiness = assessReadinessGate({
    rawRecords: { length: summary.rawRows },
    usableRecords: { length: summary.usableRows },
    groupedRecords,
    trainingSummary,
    distinctPriceCount
  });
  const resultMode = canFitModel ? readiness.readinessLevel : canShowSummary ? "Business Summary Only" : "Insufficient Data";
  const dataFitness = assessDataFitness({
    product,
    summary,
    groupedRecords,
    distinctPriceCount,
    excludedRows: summary.rawRows - summary.usableRows
  });

  return {
    resultMode,
    readinessLevel: readiness.readinessLevel,
    readinessDetails: readiness.readinessDetails,
    mlReadiness: readiness.mlReadiness,
    canFitModel,
    canShowSummary,
    activeImportBatchId: activeImportBatchFilter.importBatchId || null,
    dataFitnessScore: dataFitness.dataFitnessScore,
    dataFitnessLabel: canFitModel ? dataFitness.dataFitnessLabel : "Summary only",
    businessRiskLevel: dataFitness.businessRiskLevel,
    costQuality: dataFitness.costQuality,
    blockingReasons: canFitModel ? [] : getBlockingReasons({
      groupedDemandPoints: groupedRecords.length,
      distinctPriceCount,
      usableRows: summary.usableRows
    }),
    blockedReasons: dataFitness.blockedReasons,
    dataFitnessWarnings: dataFitness.dataFitnessWarnings,
    suggestedNextData: canFitModel ? "This product has enough data for price response modeling." : "Add at least 3 sales dates with 2 or more different prices for this product/customer group.",
    summaryMetrics: {
      rawRows: summary.rawRows,
      usableRows: summary.usableRows,
      excludedRows: summary.rawRows - summary.usableRows,
      groupedDemandPoints: groupedRecords.length,
      unitsSold: summary.unitsSold,
      revenue: summary.revenue,
      estimatedProfit: summary.revenue - summary.estimatedCost,
      averagePrice: summary.usableRows ? summary.priceTotal / summary.usableRows : 0,
      averageCost: summary.costRows ? summary.costTotal / summary.costRows : 0,
      lowestPrice: summary.lowestPrice || 0,
      highestPrice: summary.highestPrice || 0,
      distinctPriceCount
    }
  };
}

function linearPrediction(model, price) {
  return model.a - model.b * price;
}

function logLogPrediction(model, price) {
  return Math.exp(model.a + model.b * Math.log(price));
}

function scorePredictions(records, predictions) {
  const sumQ = records.reduce((total, record) => total + record.quantity, 0);
  const meanQ = sumQ / records.length;
  const residuals = records.map((record, index) => record.quantity - predictions[index]);
  const sse = residuals.reduce((total, residual) => total + residual ** 2, 0);
  const sst = records.reduce((total, record) => total + (record.quantity - meanQ) ** 2, 0);

  return {
    stdErr: Math.sqrt(sse / Math.max(records.length - 2, 1)),
    rSquared: sst === 0 ? 1 : Math.max(0, Math.min(1, 1 - sse / sst))
  };
}

function meanAbsolute(values) {
  if (!values.length) return 0;
  return values.reduce((total, value) => total + Math.abs(value), 0) / values.length;
}

function meanAbsolutePercent(actuals, predictions) {
  const errors = actuals
    .map((actual, index) => {
      if (!Number.isFinite(actual) || Math.abs(actual) < 1e-8) return null;
      return Math.abs((actual - predictions[index]) / actual) * 100;
    })
    .filter(Number.isFinite);

  return errors.length ? meanAbsolute(errors) : 0;
}

function variance(values) {
  if (!values.length) return 0;
  const average = values.reduce((total, value) => total + value, 0) / values.length;
  return values.reduce((total, value) => total + (value - average) ** 2, 0) / values.length;
}

function hasUsefulVariation(records, getter, minimumRows = 5) {
  const values = records.map(getter).filter(Number.isFinite);
  if (values.length < minimumRows) return false;
  return variance(values) > 1e-8;
}

function buildFeatureConfigs(records) {
  const configs = [
    { name: "price", label: "Price", getter: (record) => Number(record.price), required: true }
  ];
  const distinctMonths = new Set(records.map((record) => Number(record.month)).filter(Number.isFinite));
  const regions = [...new Set(records.map((record) => record.region).filter(Boolean))].slice(0, 5);
  const channels = [...new Set(records.map((record) => record.channel).filter(Boolean))].slice(0, 5);

  if (hasUsefulVariation(records, (record) => Number.isFinite(record.competitorPrice) ? (record.price - record.competitorPrice) / record.price : undefined)) {
    configs.push({
      name: "competitorGap",
      label: "Competitor price gap",
      getter: (record) => Number.isFinite(record.competitorPrice) ? (record.price - record.competitorPrice) / record.price : 0,
      context: "competitor"
    });
  }

  if (hasUsefulVariation(records, (record) => record.promotionShare)) {
    configs.push({ name: "promotionShare", label: "Promotion effect", getter: (record) => record.promotionShare || 0, context: "promotion" });
  }

  if (hasUsefulVariation(records, (record) => record.discount)) {
    configs.push({ name: "discount", label: "Discount effect", getter: (record) => record.discount || 0, context: "promotion" });
  }

  if (hasUsefulVariation(records, (record) => record.holidayShare)) {
    configs.push({ name: "holidayShare", label: "Holiday effect", getter: (record) => record.holidayShare || 0, context: "seasonality" });
  }

  if (hasUsefulVariation(records, (record) => record.weekendShare)) {
    configs.push({ name: "weekendShare", label: "Weekend effect", getter: (record) => record.weekendShare || 0, context: "seasonality" });
  }

  if (distinctMonths.size >= 3) {
    configs.push(
      { name: "monthSin", label: "Seasonality cycle", getter: (record) => Math.sin((2 * Math.PI * Number(record.month || 1)) / 12), context: "seasonality" },
      { name: "monthCos", label: "Seasonality cycle", getter: (record) => Math.cos((2 * Math.PI * Number(record.month || 1)) / 12), context: "seasonality" }
    );
  }

  if (hasUsefulVariation(records, (record) => record.marketingSpend)) {
    configs.push({ name: "marketingSpend", label: "Marketing spend", getter: (record) => record.marketingSpend || 0, context: "marketing" });
  }

  if (regions.length >= 2) {
    for (const region of regions.slice(1)) {
      configs.push({ name: `region:${region}`, label: `Region: ${region}`, getter: (record) => record.region === region ? 1 : 0, context: "region" });
    }
  }

  if (channels.length >= 2) {
    for (const channel of channels.slice(1)) {
      configs.push({ name: `channel:${channel}`, label: `Channel: ${channel}`, getter: (record) => record.channel === channel ? 1 : 0, context: "channel" });
    }
  }

  return configs;
}

function solveLinearSystem(matrix, vector) {
  const n = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < n; column += 1) {
    let pivot = column;

    for (let row = column + 1; row < n; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) {
        pivot = row;
      }
    }

    if (Math.abs(augmented[pivot][column]) < 1e-10) {
      throw new Error("Cannot fit context-adjusted model because the feature matrix is unstable.");
    }

    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];

    for (let item = column; item <= n; item += 1) {
      augmented[column][item] /= divisor;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === column) continue;
      const factor = augmented[row][column];

      for (let item = column; item <= n; item += 1) {
        augmented[row][item] -= factor * augmented[column][item];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

function fitRidgeRegression(records, featureConfigs, ridgeLambda = 0.75) {
  const stats = featureConfigs.map((feature) => {
    const values = records.map(feature.getter);
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    const standardDeviation = Math.sqrt(variance(values)) || 1;

    return { ...feature, mean, standardDeviation };
  });
  const x = records.map((record) => [1, ...stats.map((feature) => (feature.getter(record) - feature.mean) / feature.standardDeviation)]);
  const y = records.map((record) => Number(record.quantity || 0));
  const columns = x[0].length;
  const xtx = Array.from({ length: columns }, () => Array(columns).fill(0));
  const xty = Array(columns).fill(0);

  for (let row = 0; row < x.length; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      xty[column] += x[row][column] * y[row];
      for (let inner = 0; inner < columns; inner += 1) {
        xtx[column][inner] += x[row][column] * x[row][inner];
      }
    }
  }

  for (let column = 1; column < columns; column += 1) {
    xtx[column][column] += ridgeLambda;
  }

  const beta = solveLinearSystem(xtx, xty);
  const predictions = x.map((row) => row.reduce((total, value, index) => total + value * beta[index], 0));

  return { beta, predictions, stats };
}

export function predictDemandFromModel(model, price, context = {}) {
  const numericPrice = Number(price);

  if (model.modelType === "log-log") {
    return Math.exp(model.a + model.b * Math.log(numericPrice));
  }

  if (model.modelType !== "context-adjusted" || !model.contextModel?.features?.length) {
    return model.a - model.b * numericPrice;
  }

  let demand = model.contextModel.intercept || 0;

  for (const feature of model.contextModel.features) {
    let value = feature.baseline ?? 0;

    if (feature.name === "price") {
      value = numericPrice;
    } else if (feature.name === "competitorGap" && Number.isFinite(context.competitorPrice)) {
      value = (numericPrice - Number(context.competitorPrice)) / numericPrice;
    } else if (feature.name === "promotionShare" && context.promotion !== undefined) {
      value = context.promotion ? 1 : 0;
    } else if (feature.name === "discount" && Number.isFinite(context.discount)) {
      value = Number(context.discount);
    } else if (feature.name === "holidayShare" && context.holiday !== undefined) {
      value = context.holiday ? 1 : 0;
    }

    demand += ((value - feature.mean) / (feature.standardDeviation || 1)) * feature.coefficient;
  }

  return demand;
}

export function fitContextAdjustedDemand(records) {
  const n = records.length;
  const distinctPrices = new Set(records.map((record) => Number(record.price).toFixed(4))).size;

  if (n < 10 || distinctPrices < 3) {
    throw new Error("At least 10 grouped demand points and 3 different prices are required for the context-adjusted model.");
  }

  const featureConfigs = buildFeatureConfigs(records);
  const contextFeatureCount = featureConfigs.filter((feature) => feature.name !== "price").length;

  if (contextFeatureCount < 1) {
    throw new Error("Context-adjusted model needs at least one usable context feature such as promotion, competitor price, seasonality, region, or channel.");
  }

  const { beta, predictions, stats } = fitRidgeRegression(records, featureConfigs);
  const { stdErr, rSquared } = scorePredictions(records, predictions);
  const priceFeature = stats.find((feature) => feature.name === "price");
  const priceCoefficient = beta[stats.findIndex((feature) => feature.name === "price") + 1] / (priceFeature?.standardDeviation || 1);
  const featureImportance = stats.map((feature, index) => {
    const coefficient = beta[index + 1] / (feature.standardDeviation || 1);

    return {
      feature: feature.name,
      label: feature.label,
      coefficient,
      direction: coefficient < 0 ? "Reduces demand" : coefficient > 0 ? "Increases demand" : "Neutral",
      impact: Math.abs(beta[index + 1])
    };
  }).sort((left, right) => right.impact - left.impact);
  const featuresUsed = stats.map((feature) => feature.name);
  const seasonalityUsed = stats.some((feature) => feature.context === "seasonality");
  const promotionUsed = stats.some((feature) => feature.context === "promotion");
  const competitorUsed = stats.some((feature) => feature.context === "competitor");
  const limitations = [
    ...(!seasonalityUsed ? ["Seasonality was detected only as a warning or not enough month/weekend variation existed to model it."] : []),
    ...(!promotionUsed ? ["Promotion or discount effects were not modeled because usable variation was too low."] : []),
    ...(!competitorUsed ? ["Competitor price was not modeled because competitor rows were missing or too sparse."] : [])
  ];

  return {
    a: beta[0],
    b: -priceCoefficient,
    modelType: "context-adjusted",
    modelFamily: "context_adjusted",
    formulaText: `Estimated demand = context-adjusted baseline using ${featuresUsed.join(", ")}`,
    stdErr,
    rSquared,
    recordsUsed: n,
    featuresUsed,
    featureImportance,
    seasonalityUsed,
    promotionUsed,
    competitorUsed,
    limitations,
    contextModel: {
      intercept: beta[0],
      ridgeLambda: 0.75,
      features: stats.map((feature, index) => ({
        name: feature.name,
        label: feature.label,
        context: feature.context || "price",
        mean: feature.mean,
        standardDeviation: feature.standardDeviation,
        coefficient: beta[index + 1],
        baseline: feature.mean
      }))
    }
  };
}

export function fitLinearDemand(records) {
  const n = records.length;

  if (n < 3) {
    throw new Error("At least 3 grouped demand points are required to fit a demand model");
  }

  const distinctPrices = new Set(records.map((record) => Number(record.price).toFixed(4))).size;

  if (distinctPrices < 2) {
    throw new Error("Cannot fit model because this product needs at least 2 different prices.");
  }

  const sumP = records.reduce((total, record) => total + record.price, 0);
  const sumQ = records.reduce((total, record) => total + record.quantity, 0);
  const sumPQ = records.reduce((total, record) => total + record.price * record.quantity, 0);
  const sumP2 = records.reduce((total, record) => total + record.price ** 2, 0);
  const denominator = n * sumP2 - sumP ** 2;

  if (Math.abs(denominator) < Number.EPSILON) {
    throw new Error("Cannot fit model because all price values are identical");
  }

  const slope = (n * sumPQ - sumP * sumQ) / denominator;
  const b = -slope;
  const a = (sumQ + b * sumP) / n;
  const predictions = records.map((record) => linearPrediction({ a, b }, record.price));
  const { stdErr, rSquared } = scorePredictions(records, predictions);

  return {
    a,
    b,
    modelType: "linear",
    modelFamily: "simple_price_response",
    featuresUsed: ["price"],
    featureImportance: [{ feature: "price", label: "Price", coefficient: -b, direction: b > 0 ? "Reduces demand" : "Increases demand", impact: Math.abs(b) }],
    seasonalityUsed: false,
    promotionUsed: false,
    competitorUsed: false,
    limitations: ["This simple model assumes price is the main driver of demand."],
    formulaText: `Estimated demand = ${a.toFixed(2)} - ${b.toFixed(4)} x price`,
    stdErr,
    rSquared,
    recordsUsed: n
  };
}

export function fitLogLogDemand(records) {
  const positiveRecords = records.filter((record) => record.price > 0 && record.quantity > 0);
  const n = positiveRecords.length;
  const distinctPrices = new Set(positiveRecords.map((record) => Number(record.price).toFixed(4))).size;

  if (n < 8 || distinctPrices < 3) {
    throw new Error("At least 8 positive grouped demand points and 3 different prices are required for the log-log elasticity model");
  }

  const transformed = positiveRecords.map((record) => ({
    ...record,
    logPrice: Math.log(record.price),
    logQuantity: Math.log(record.quantity)
  }));
  const sumX = transformed.reduce((total, record) => total + record.logPrice, 0);
  const sumY = transformed.reduce((total, record) => total + record.logQuantity, 0);
  const sumXY = transformed.reduce((total, record) => total + record.logPrice * record.logQuantity, 0);
  const sumX2 = transformed.reduce((total, record) => total + record.logPrice ** 2, 0);
  const denominator = n * sumX2 - sumX ** 2;

  if (Math.abs(denominator) < Number.EPSILON) {
    throw new Error("Cannot fit log-log model because all price values are identical");
  }

  const b = (n * sumXY - sumX * sumY) / denominator;
  const a = (sumY - b * sumX) / n;
  const predictions = positiveRecords.map((record) => logLogPrediction({ a, b }, record.price));
  const { stdErr, rSquared } = scorePredictions(positiveRecords, predictions);

  return {
    a,
    b,
    modelType: "log-log",
    modelFamily: "simple_price_response",
    featuresUsed: ["price"],
    featureImportance: [{ feature: "price", label: "Price", coefficient: b, direction: b < 0 ? "Reduces demand" : "Increases demand", impact: Math.abs(b) }],
    seasonalityUsed: false,
    promotionUsed: false,
    competitorUsed: false,
    limitations: ["This elasticity model still assumes price is the main driver of demand."],
    formulaText: `Estimated demand = exp(${a.toFixed(2)} + ${b.toFixed(4)} x ln(price))`,
    stdErr,
    rSquared,
    recordsUsed: n
  };
}

function selectDemandModel(records) {
  const linear = fitLinearDemand(records);
  const distinctPrices = new Set(records.map((record) => Number(record.price).toFixed(4))).size;
  let bestSimple = linear;
  let contextAdjusted = null;
  const attemptedModels = [];

  try {
    const logLog = fitLogLogDemand(records);
    const logLogIsSane = logLog.b < 0 && Number.isFinite(logLog.rSquared);
    const linearIsWeak = linear.b <= 0 || logLog.rSquared >= linear.rSquared + 0.03;

    if (logLogIsSane && records.length >= 8 && distinctPrices >= 3 && linearIsWeak) {
      bestSimple = logLog;
    }
  } catch (error) {
    attemptedModels.push({ modelType: "log-log", selected: false, reason: error.message });
  }

  try {
    contextAdjusted = fitContextAdjustedDemand(records);
  } catch (error) {
    attemptedModels.push({ modelType: "context-adjusted", selected: false, reason: error.message });
  }

  const simpleNormal = isNormalPriceResponse(bestSimple);
  const contextNormal = contextAdjusted ? isNormalPriceResponse(contextAdjusted) : false;
  const contextAddsValue = contextAdjusted && contextAdjusted.rSquared >= bestSimple.rSquared + 0.05 && contextNormal;
  const contextFixesBadSimple = contextAdjusted && !simpleNormal && contextAdjusted.rSquared >= 0.35 && contextNormal;
  const selected = contextAddsValue || contextFixesBadSimple ? contextAdjusted : bestSimple;
  const selectedReason = selected.modelType === "context-adjusted"
    ? "Selected because context features improved historical fit while preserving normal price response."
    : "Selected because the context-adjusted model was unavailable, weaker, or less business-safe.";

  selected.modelComparison = {
    selectedModel: selected.modelType,
    selectedReason,
    models: [
      {
        modelType: linear.modelType,
        modelFamily: linear.modelFamily,
        rSquared: linear.rSquared,
        stdErr: linear.stdErr,
        recordsUsed: linear.recordsUsed,
        featuresUsed: linear.featuresUsed,
        normalPriceResponse: isNormalPriceResponse(linear),
        selected: selected.modelType === linear.modelType
      },
      ...(bestSimple.modelType === "log-log" ? [{
        modelType: bestSimple.modelType,
        modelFamily: bestSimple.modelFamily,
        rSquared: bestSimple.rSquared,
        stdErr: bestSimple.stdErr,
        recordsUsed: bestSimple.recordsUsed,
        featuresUsed: bestSimple.featuresUsed,
        normalPriceResponse: isNormalPriceResponse(bestSimple),
        selected: selected.modelType === bestSimple.modelType
      }] : []),
      ...(contextAdjusted ? [{
        modelType: contextAdjusted.modelType,
        modelFamily: contextAdjusted.modelFamily,
        rSquared: contextAdjusted.rSquared,
        stdErr: contextAdjusted.stdErr,
        recordsUsed: contextAdjusted.recordsUsed,
        featuresUsed: contextAdjusted.featuresUsed,
        normalPriceResponse: isNormalPriceResponse(contextAdjusted),
        selected: selected.modelType === contextAdjusted.modelType
      }] : [])
    ],
    attemptedModels
  };

  return selected;
}

export function evaluateBaselineAccuracy(trainRecords, testRecords) {
  if (!trainRecords.length || !testRecords.length) {
    return { available: false };
  }

  const actualDemand = testRecords.map((record) => Number(record.quantity || 0));
  const actualRevenue = testRecords.map((record) => Number(record.revenue ?? record.price * record.quantity ?? 0));

  // Baseline 1: Mean Demand — always predict the average demand from training set
  const trainMeanDemand = trainRecords.reduce((total, record) => total + Number(record.quantity || 0), 0) / trainRecords.length;
  const meanPredictions = testRecords.map(() => trainMeanDemand);
  const meanRevenuePredictions = testRecords.map((record) => Number(record.price || 0) * trainMeanDemand);

  // Baseline 2: Last-Value — always predict the demand of the most recent training point
  const lastTrainDemand = Number(trainRecords[trainRecords.length - 1].quantity || 0);
  const lastValuePredictions = testRecords.map(() => lastTrainDemand);
  const lastValueRevenuePredictions = testRecords.map((record) => Number(record.price || 0) * lastTrainDemand);

  // Baseline 3: Moving Average — average of last 3 training demand points
  const windowSize = Math.min(3, trainRecords.length);
  const recentRecords = trainRecords.slice(-windowSize);
  const movingAvgDemand = recentRecords.reduce((total, record) => total + Number(record.quantity || 0), 0) / windowSize;
  const movingAvgPredictions = testRecords.map(() => movingAvgDemand);
  const movingAvgRevenuePredictions = testRecords.map((record) => Number(record.price || 0) * movingAvgDemand);

  const baselines = [
    {
      name: "mean_demand",
      label: "Average Demand",
      description: "Always predicts the average demand from the training set.",
      demandMAE: meanAbsolute(actualDemand.map((actual, index) => actual - meanPredictions[index])),
      demandMAPE: meanAbsolutePercent(actualDemand, meanPredictions),
      revenueMAPE: meanAbsolutePercent(actualRevenue, meanRevenuePredictions)
    },
    {
      name: "last_value",
      label: "Last Observation",
      description: "Always predicts the demand of the most recent training point.",
      demandMAE: meanAbsolute(actualDemand.map((actual, index) => actual - lastValuePredictions[index])),
      demandMAPE: meanAbsolutePercent(actualDemand, lastValuePredictions),
      revenueMAPE: meanAbsolutePercent(actualRevenue, lastValueRevenuePredictions)
    },
    {
      name: "moving_average_3",
      label: "3-Point Moving Average",
      description: "Predicts the average of the last 3 training demand points.",
      demandMAE: meanAbsolute(actualDemand.map((actual, index) => actual - movingAvgPredictions[index])),
      demandMAPE: meanAbsolutePercent(actualDemand, movingAvgPredictions),
      revenueMAPE: meanAbsolutePercent(actualRevenue, movingAvgRevenuePredictions)
    }
  ];

  const best = baselines.reduce((current, baseline) => baseline.demandMAPE < current.demandMAPE ? baseline : current, baselines[0]);

  return {
    available: true,
    baselines,
    bestBaselineMAPE: best.demandMAPE,
    bestBaselineName: best.name,
    bestBaselineLabel: best.label
  };
}

function evaluateHoldoutAccuracy(records) {
  const sortedRecords = [...records].sort((left, right) => new Date(left.date) - new Date(right.date));
  const testSize = Math.max(2, Math.ceil(sortedRecords.length * 0.2));
  const trainRecords = sortedRecords.slice(0, Math.max(0, sortedRecords.length - testSize));
  const testRecords = sortedRecords.slice(sortedRecords.length - testSize);
  const trainDistinctPrices = new Set(trainRecords.map((record) => Number(record.price).toFixed(4))).size;

  if (sortedRecords.length < 8 || trainRecords.length < 3 || testRecords.length < 2 || trainDistinctPrices < 2) {
    return {
      available: false,
      reason: "Holdout accuracy needs at least 8 grouped demand points, with enough older rows and price variation for training."
    };
  }

  try {
    const trainedModel = selectDemandModel(trainRecords);
    const predictedDemand = testRecords.map((record) => Math.max(0, predictDemandFromModel(trainedModel, record.price, record)));
    const actualDemand = testRecords.map((record) => Number(record.quantity || 0));
    const predictedRevenue = testRecords.map((record, index) => Number(record.price || 0) * predictedDemand[index]);
    const actualRevenue = testRecords.map((record) => Number(record.revenue ?? record.price * record.quantity ?? 0));
    const predictedProfit = testRecords.map((record, index) => (Number(record.price || 0) - Number(record.cost || 0)) * predictedDemand[index]);
    const actualProfit = testRecords.map((record) => Number(record.revenue ?? record.price * record.quantity ?? 0) - Number(record.cost || 0) * Number(record.quantity || 0));

    const modelDemandMAPE = meanAbsolutePercent(actualDemand, predictedDemand);
    const baselineResult = evaluateBaselineAccuracy(trainRecords, testRecords);
    const baselineComparison = baselineResult.available
      ? {
          ...baselineResult,
          modelBeatsBaseline: modelDemandMAPE <= baselineResult.bestBaselineMAPE,
          improvementPercent: baselineResult.bestBaselineMAPE > 0
            ? Number(((1 - modelDemandMAPE / baselineResult.bestBaselineMAPE) * 100).toFixed(1))
            : 0
        }
      : { available: false };

    return {
      available: true,
      method: "time-based holdout",
      trainedModelType: trainedModel.modelType,
      trainRows: trainRecords.length,
      testRows: testRecords.length,
      testStartDate: testRecords[0]?.date,
      testEndDate: testRecords[testRecords.length - 1]?.date,
      demandMAE: meanAbsolute(actualDemand.map((actual, index) => actual - predictedDemand[index])),
      demandMAPE: modelDemandMAPE,
      revenueMAE: meanAbsolute(actualRevenue.map((actual, index) => actual - predictedRevenue[index])),
      revenueMAPE: meanAbsolutePercent(actualRevenue, predictedRevenue),
      profitMAE: meanAbsolute(actualProfit.map((actual, index) => actual - predictedProfit[index])),
      profitMAPE: meanAbsolutePercent(actualProfit, predictedProfit),
      baselineComparison,
      samplePredictions: testRecords.slice(0, 5).map((record, index) => ({
        date: record.date,
        price: record.price,
        actualDemand: actualDemand[index],
        predictedDemand: predictedDemand[index],
        actualRevenue: actualRevenue[index],
        predictedRevenue: predictedRevenue[index]
      }))
    };
  } catch (error) {
    return {
      available: false,
      reason: `Holdout validation could not be completed: ${error.message}`
    };
  }
}

export async function fitDemandModel({ productId, segment = "all" }) {
  if (!isSupportedSegment(segment)) {
    throw new Error("segment must be all or an imported customer group");
  }

  const activeImportBatchFilter = await getActiveImportBatchFilter();
  const query = {
    productId: typeof productId === "string" ? new mongoose.Types.ObjectId(productId) : productId,
    ...(segment !== "all" && { customerSegment: segment }),
    excludedFromModel: { $ne: true },
    ...activeImportBatchFilter
  };
  const [summary, groupedRecords, product] = await Promise.all([
    getSalesSummaryMetrics(query),
    getGroupedDemandRecords(query),
    Product.findOne({ _id: productId, datasetStatus: "active" }).lean()
  ]);
  const rawRows = summary.rawRows || 0;
  const usableRows = summary.usableRows || 0;
  const excludedRows = rawRows - usableRows;
  const distinctPriceCount = new Set(groupedRecords.map((record) => Number(record.price).toFixed(4))).size;

  if (!product) {
    throw new Error("Product not found");
  }

  if (groupedRecords.length < 3 || distinctPriceCount < 2) {
    const summary = await getInsightSummary({ productId, segment });
    const error = new Error("This product does not have enough price variation for a demand model. A business summary is available instead.");
    error.statusCode = 422;
    error.insightSummary = summary;
    throw error;
  }

  const trainingSummary = buildTrainingSummary(groupedRecords, excludedRows);
  const readinessGate = assessReadinessGate({
    rawRecords: { length: rawRows },
    usableRecords: { length: usableRows },
    groupedRecords,
    trainingSummary,
    distinctPriceCount
  });
  const accuracyMetrics = evaluateHoldoutAccuracy(groupedRecords);
  const modelWarnings = [];

  if (accuracyMetrics.baselineComparison?.available && !accuracyMetrics.baselineComparison.modelBeatsBaseline) {
    modelWarnings.push(
      `The fitted model did not outperform a simple ${accuracyMetrics.baselineComparison.bestBaselineLabel || "Average Demand"} baseline on held-out data. Recommendations from this model should be treated with extra caution.`
    );
  }

  if (excludedRows > 0) {
    modelWarnings.push(`${excludedRows} stockout row${excludedRows === 1 ? "" : "s"} excluded because low sales may be caused by no stock.`);
  }

  if (trainingSummary.distinctPrices < 2) {
    modelWarnings.push("This product has no real price variation, so price response is unreliable.");
  }

  if (trainingSummary.promotionRows > 0) {
    modelWarnings.push(`${trainingSummary.promotionRows} promotional row${trainingSummary.promotionRows === 1 ? "" : "s"} included; promotions may affect demand.`);
  }

  if (readinessGate.mlReadiness.ready) {
    modelWarnings.push("This product is rich enough for an optional advanced ML model, but the selected output remains explainable until ML is compared and proven better.");
  }

  const coefficients = selectDemandModel(groupedRecords);

  const demandCurvePoints = groupedRecords.slice(0, 50).map((record) => ({
    price: Number(record.price),
    actualDemand: Number(record.quantity),
    predictedDemand: Math.max(0, predictDemandFromModel(coefficients, record.price, record))
  }));

  const curveSteps = 20;
  const curveMinPrice = trainingSummary.priceRangeMin || Math.min(...groupedRecords.map((r) => r.price));
  const curveMaxPrice = trainingSummary.priceRangeMax || Math.max(...groupedRecords.map((r) => r.price));
  const curveStep = curveMaxPrice > curveMinPrice ? (curveMaxPrice - curveMinPrice) / (curveSteps - 1) : 1;
  const fittedCurvePoints = Array.from({ length: curveSteps }, (_, i) => {
    const price = curveMinPrice + i * curveStep;
    return {
      price: Number(price.toFixed(2)),
      predictedDemand: Math.max(0, predictDemandFromModel(coefficients, price))
    };
  });

  coefficients.modelComparison = {
    ...(coefficients.modelComparison || {}),
    accuracyMetrics,
    demandCurvePoints,
    fittedCurvePoints,
    readinessLevel: readinessGate.readinessLevel,
    mlReadiness: readinessGate.mlReadiness
  };

  if (trainingSummary.competitorRows > 0 && !coefficients.competitorUsed) {
    modelWarnings.push("Competitor price was detected but too sparse or too stable to use in the selected model.");
  }

  if (trainingSummary.promotionRows > 0 && !coefficients.promotionUsed) {
    modelWarnings.push("Holiday/promotion may be driving demand, not price; promotion context was not strong enough for the selected model.");
  }

  const distinctMonths = new Set(groupedRecords.map((record) => record.month).filter(Number.isFinite)).size;
  if (distinctMonths >= 3 && !coefficients.seasonalityUsed) {
    modelWarnings.push("Seasonality was detected but not enough repeated monthly variation existed to safely adjust the model.");
  }

  const reliability = assessModelReliability({
    model: coefficients,
    groupedRecords,
    rawRowsUsed: usableRows,
    excludedRows,
    distinctPriceCount
  });
  const dataFitness = assessDataFitness({
    product,
    summary,
    groupedRecords,
    distinctPriceCount,
    model: coefficients,
    accuracyMetrics,
    excludedRows
  });
  const modelErrorSummary = summarizeBacktest(accuracyMetrics);
  const evidence = assessModelEvidence({
    ...coefficients,
    ...reliability,
    groupedDemandPoints: groupedRecords.length,
    distinctPriceCount,
    dataFitnessLabel: dataFitness.dataFitnessLabel,
    costQuality: dataFitness.costQuality,
    modelErrorSummary
  });
  const evidenceReliability = {
    reliabilityLabel: evidence.modelReliabilityLabel,
    reliabilityReasons: evidence.modelReliabilityReasons,
    modelReliabilityLabel: evidence.modelReliabilityLabel,
    modelReliabilityReasons: evidence.modelReliabilityReasons,
    evidenceSummary: evidence.evidenceSummary
  };
  const averageDemandPrediction = Math.max(0, predictDemandFromModel(coefficients, trainingSummary.averagePrice || product.basePrice));
  const averageRevenuePrediction = (trainingSummary.averagePrice || product.basePrice) * averageDemandPrediction;
  const averageProfitPrediction = ((trainingSummary.averagePrice || product.basePrice) - product.cost) * averageDemandPrediction;
  const predictionIntervals = buildPredictionRange({
    demand: averageDemandPrediction,
    revenue: averageRevenuePrediction,
    profit: averageProfitPrediction,
    price: trainingSummary.averagePrice || product.basePrice,
    cost: product.cost,
    model: { ...coefficients, ...reliability, ...evidenceReliability, accuracyMetrics }
  });
  const aggregationSummary = {
    rawRowsUsed: usableRows,
    rawRowsExcluded: excludedRows,
    groupedDemandPoints: groupedRecords.length,
    distinctPriceCount,
    grouping: "product + customer segment + date + price",
    note: "MongoDB aggregates raw sales into grouped demand points before fitting the model, so the server does not load every transaction row into application memory."
  };
  const model = await DemandModel.findOneAndUpdate(
    { productId, segment },
    {
      ...coefficients,
      productId,
      segment,
      modelFamily: coefficients.modelFamily || "simple_price_response",
      featuresUsed: coefficients.featuresUsed || ["price"],
      featureImportance: coefficients.featureImportance || [],
      seasonalityUsed: Boolean(coefficients.seasonalityUsed),
      promotionUsed: Boolean(coefficients.promotionUsed),
      competitorUsed: Boolean(coefficients.competitorUsed),
      contextModel: coefficients.contextModel || {},
      modelComparison: coefficients.modelComparison || {},
      readinessLevel: readinessGate.readinessLevel,
      readinessDetails: readinessGate.readinessDetails,
      accuracyMetrics,
      mlReadiness: readinessGate.mlReadiness,
      limitations: coefficients.limitations || [],
      rawRowsUsed: usableRows,
      groupedDemandPoints: groupedRecords.length,
      distinctPriceCount,
      ...reliability,
      ...evidenceReliability,
      aggregationSummary,
      activeImportBatchId: activeImportBatchFilter.importBatchId || null,
      datasetStatus: "active",
      sourceImportBatchId: activeImportBatchFilter.importBatchId || null,
      dataFitnessScore: dataFitness.dataFitnessScore,
      dataFitnessLabel: dataFitness.dataFitnessLabel,
      businessRiskLevel: dataFitness.businessRiskLevel,
      costQuality: dataFitness.costQuality,
      backtestMetrics: accuracyMetrics,
      predictionIntervals,
      blockedReasons: dataFitness.blockedReasons,
      dataFitnessWarnings: dataFitness.dataFitnessWarnings,
      excludedRows,
      priceRangeMin: trainingSummary.priceRangeMin,
      priceRangeMax: trainingSummary.priceRangeMax,
      averagePrice: trainingSummary.averagePrice,
      averageDemand: trainingSummary.averageDemand,
      demandRangeMin: trainingSummary.demandRangeMin,
      demandRangeMax: trainingSummary.demandRangeMax,
      dataStartDate: trainingSummary.dataStartDate,
      dataEndDate: trainingSummary.dataEndDate,
      modelWarnings,
      trainingSummary,
      lastUpdated: new Date()
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return {
    ...model,
    resultMode: "Price Response Model",
    backtestMetrics: model.backtestMetrics || model.accuracyMetrics,
    modelErrorSummary: summarizeBacktest(model.backtestMetrics || model.accuracyMetrics),
    modelReliabilityLabel: model.modelReliabilityLabel || model.reliabilityLabel,
    modelReliabilityReasons: model.modelReliabilityReasons || model.reliabilityReasons,
    evidenceSummary: model.evidenceSummary,
    warnings: [...getDemandModelWarnings(model), ...(model.dataFitnessWarnings || [])]
  };
}
