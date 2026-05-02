import { Recommendation } from "../models/recommendation.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";
import { round } from "./simulation.service.js";

function parseDate(value, fallback) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) {
    throw new Error("Provide valid start and end dates for measuring the recommendation.");
  }
  return date;
}

async function measureActuals({ recommendation, appliedPrice, startDate, endDate }) {
  const priceTolerance = Math.max(Number(appliedPrice || 0) * 0.025, 0.01);
  const query = {
    workspaceId: recommendation.workspaceId || DEFAULT_WORKSPACE_ID,
    datasetStatus: "active",
    productId: recommendation.productId,
    date: { $gte: startDate, $lte: endDate },
    price: { $gte: appliedPrice - priceTolerance, $lte: appliedPrice + priceTolerance }
  };

  if (recommendation.segment && recommendation.segment !== "all") {
    query.customerSegment = recommendation.segment;
  }

  const [actuals] = await SalesData.aggregate([
    { $match: query },
    {
      $group: {
        _id: null,
        rowsMeasured: { $sum: 1 },
        actualUnits: { $sum: "$quantity" },
        actualRevenue: { $sum: { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] } },
        actualProfit: {
          $sum: {
            $subtract: [
              { $ifNull: ["$revenue", { $multiply: ["$price", "$quantity"] }] },
              { $multiply: [{ $ifNull: ["$cost", 0] }, "$quantity"] }
            ]
          }
        }
      }
    }
  ]);

  return actuals || {
    rowsMeasured: 0,
    actualUnits: 0,
    actualRevenue: 0,
    actualProfit: 0
  };
}

export async function applyRecommendation({ recommendationId, appliedPrice, startDate, endDate, expectedTarget, notes, workspaceId = DEFAULT_WORKSPACE_ID }) {
  const recommendation = await Recommendation.findOne({ _id: recommendationId, workspaceId, datasetStatus: "active" }).lean();

  if (!recommendation) {
    throw new Error("Recommendation not found");
  }

  const numericAppliedPrice = Number(appliedPrice || recommendation.recommendedPrice);

  if (!Number.isFinite(numericAppliedPrice) || numericAppliedPrice <= 0) {
    throw new Error("Applied price must be greater than zero.");
  }

  const start = parseDate(startDate, new Date());
  const end = parseDate(endDate, new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000));

  if (end < start) {
    throw new Error("End date must be after start date.");
  }

  const actuals = await measureActuals({
    recommendation,
    appliedPrice: numericAppliedPrice,
    startDate: start,
    endDate: end
  });
  const predictionError = recommendation.expectedDemand
    ? round(((actuals.actualUnits - recommendation.expectedDemand) / Math.abs(recommendation.expectedDemand)) * 100, 1)
    : 0;
  const revenueError = recommendation.expectedRevenue
    ? round(((actuals.actualRevenue - recommendation.expectedRevenue) / Math.abs(recommendation.expectedRevenue)) * 100, 1)
    : 0;
  const profitError = recommendation.expectedProfit
    ? round(((actuals.actualProfit - recommendation.expectedProfit) / Math.abs(recommendation.expectedProfit)) * 100, 1)
    : 0;
  const profitLift = round(actuals.actualProfit - Number(recommendation.baselineProfit || 0));
  const target = Number(expectedTarget);
  const targetHit = Number.isFinite(target) ? actuals.actualProfit >= target : actuals.actualProfit >= recommendation.expectedProfit * 0.9;
  const measured = actuals.rowsMeasured > 0;
  const status = measured ? (targetHit ? "Measured" : "Missed") : "Applied";

  const outcome = await RecommendationOutcome.findOneAndUpdate(
    { recommendationId, workspaceId },
    {
      workspaceId,
      datasetStatus: "active",
      sourceImportBatchId: recommendation.sourceImportBatchId,
      recommendationId,
      productId: recommendation.productId,
      segment: recommendation.segment,
      appliedPrice: round(numericAppliedPrice),
      startDate: start,
      endDate: end,
      expectedTarget: Number.isFinite(target) ? target : undefined,
      expectedDemand: recommendation.expectedDemand,
      expectedRevenue: recommendation.expectedRevenue,
      expectedProfit: recommendation.expectedProfit,
      actualUnits: round(actuals.actualUnits, 0),
      actualRevenue: round(actuals.actualRevenue),
      actualProfit: round(actuals.actualProfit),
      baselineProfit: recommendation.baselineProfit,
      predictionError,
      revenueError,
      profitError,
      profitLift,
      targetHit,
      rowsMeasured: actuals.rowsMeasured,
      status,
      notes,
      measuredAt: measured ? new Date() : undefined
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  await Recommendation.findByIdAndUpdate(recommendationId, {
    status,
    appliedPrice: round(numericAppliedPrice),
    appliedStartDate: start,
    appliedEndDate: end,
    expectedTarget: Number.isFinite(target) ? target : undefined,
    outcomeSummary: {
      actualUnits: outcome.actualUnits,
      actualRevenue: outcome.actualRevenue,
      actualProfit: outcome.actualProfit,
      predictionError: outcome.predictionError,
      profitLift: outcome.profitLift,
      targetHit: outcome.targetHit,
      measuredAt: outcome.measuredAt
    }
  });

  return outcome;
}

export async function getRecommendationOutcome(recommendationId, workspaceId = DEFAULT_WORKSPACE_ID) {
  return RecommendationOutcome.findOne({ recommendationId, workspaceId, datasetStatus: "active" }).populate("productId", "name sku category").lean();
}

export async function getRecommendationPerformance(workspaceId = DEFAULT_WORKSPACE_ID) {
  const outcomes = await RecommendationOutcome.find({ workspaceId, datasetStatus: "active" }).sort({ updatedAt: -1 }).limit(200).populate("productId", "name sku category").lean();
  const measured = outcomes.filter((item) => item.status === "Measured" || item.status === "Missed");

  return {
    summary: {
      appliedRecommendations: outcomes.length,
      measuredRecommendations: measured.length,
      hitRate: measured.length ? round((measured.filter((item) => item.targetHit).length / measured.length) * 100, 1) : 0,
      averagePredictionError: measured.length ? round(measured.reduce((total, item) => total + Math.abs(item.predictionError || 0), 0) / measured.length, 1) : 0,
      totalProfitLift: round(measured.reduce((total, item) => total + Number(item.profitLift || 0), 0))
    },
    outcomes
  };
}
