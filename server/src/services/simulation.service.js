import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { buildPredictionRange, summarizeBacktest } from "./data-fitness.service.js";
import { fitDemandModel, getDemandModelWarnings, getInsightSummary, isSupportedSegment, predictDemandFromModel } from "./demand-model.service.js";
import { getActiveImportBatchId } from "./import-batch.service.js";
import { formatSegmentLabel } from "../utils/segments.js";

export function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

export function getSensitivityLabel(elasticity) {
  if (elasticity === null) return "Not enough demand";
  const absolute = Math.abs(elasticity);

  if (absolute > 1.1) return "High sensitivity";
  if (absolute >= 0.9) return "Balanced response";
  return "Low sensitivity";
}

export function getConfidenceLabel(model) {
  if (model.rSquared >= 0.7) return "Strong";
  if (model.rSquared >= 0.35) return "Usable";
  return "Directional";
}

export function getModelWarnings(model) {
  return getDemandModelWarnings(model);
}

export function getResultDecisionLabel(model, warnings = [], demand = 1) {
  const hasAbnormalResponse = model.modelType === "log-log" ? model.b >= 0 : model.b <= 0;

  if (model.reliabilityLabel === "Weak" || hasAbnormalResponse || demand <= 0) {
    return "Not reliable";
  }

  if (model.reliabilityLabel === "Usable" || warnings.length > 0) {
    return "Use with caution";
  }

  return "Recommended";
}

export function calculatePriceOutcome({ product, model, price, competitorPrice }) {
  const numericPrice = Number(price);
  const numericCompetitorPrice = competitorPrice === undefined || competitorPrice === null || competitorPrice === "" ? undefined : Number(competitorPrice);
  const competitorUsed = model.modelType === "context-adjusted" && model.competitorUsed && Number.isFinite(numericCompetitorPrice);
  const rawDemand = predictDemandFromModel(model, numericPrice, competitorUsed ? { competitorPrice: numericCompetitorPrice } : {});
  const baseDemand = Math.max(0, rawDemand);
  const competitorAdjustment = 1;
  const demand = Math.max(0, baseDemand);
  const revenue = numericPrice * demand;
  const profit = (numericPrice - product.cost) * demand;
  const elasticity = demand > 0 ? (model.modelType === "log-log" ? model.b : -model.b * (numericPrice / demand)) : null;

  return {
    demand,
    revenue,
    profit,
    elasticity,
    baseDemand,
    competitorAdjustment,
    competitorUsed,
    sensitivityLabel: getSensitivityLabel(elasticity),
    confidenceLabel: getConfidenceLabel(model)
  };
}

function getHistoricalRangeWarning(model, price) {
  if (!Number.isFinite(model.priceRangeMin) || !Number.isFinite(model.priceRangeMax)) return null;

  const lowGuard = model.priceRangeMin * 0.75;
  const highGuard = model.priceRangeMax * 1.25;

  if (price < lowGuard) {
    return `Test price is more than 25% below the historical price range (${round(model.priceRangeMin)} to ${round(model.priceRangeMax)}).`;
  }

  if (price > highGuard) {
    return `Test price is more than 25% above the historical price range (${round(model.priceRangeMin)} to ${round(model.priceRangeMax)}).`;
  }

  return null;
}

function buildExplanation({ product, price, demand, revenue, profit, sensitivityLabel, confidenceLabel, warnings }) {
  const warningText = warnings.length ? ` ${warnings[0]}` : "";

  return `${product.name} at $${round(price)} is expected to sell about ${round(demand)} units, generating $${round(revenue)} revenue and $${round(profit)} profit. Customer response is ${sensitivityLabel.toLowerCase()} with ${confidenceLabel.toLowerCase()} confidence.${warningText}`;
}

export async function simulatePrice({ productId, price, competitorPrice, segment = "all" }) {
  if (!isSupportedSegment(segment)) {
    throw new Error("segment must be all or an imported customer group");
  }

  const numericPrice = Number(price);
  const numericCompetitorPrice = competitorPrice === undefined || competitorPrice === null || competitorPrice === "" ? undefined : Number(competitorPrice);

  if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
    throw new Error("price must be greater than zero");
  }

  if (numericCompetitorPrice !== undefined && (!Number.isFinite(numericCompetitorPrice) || numericCompetitorPrice < 0)) {
    throw new Error("competitorPrice must be a non-negative number");
  }

  const product = await Product.findById(productId).lean();

  if (!product) {
    throw new Error("Product not found");
  }

  let model = await DemandModel.findOne({ productId, segment }).lean();
  const activeImportBatchId = await getActiveImportBatchId();
  const modelImportBatchId = model?.activeImportBatchId ? String(model.activeImportBatchId) : null;
  let modelCreated = false;

  if (!model || modelImportBatchId !== (activeImportBatchId || null) || !model.dataFitnessLabel) {
    try {
      model = await fitDemandModel({ productId, segment });
      modelCreated = true;
    } catch (error) {
      const summary = error.insightSummary || await getInsightSummary({ productId, segment });
      const demand = Number(summary.summaryMetrics?.groupedDemandPoints || 0) > 0
        ? Number(summary.summaryMetrics.unitsSold || 0) / Number(summary.summaryMetrics.groupedDemandPoints)
        : 0;
      const revenue = numericPrice * demand;
      const profit = (numericPrice - product.cost) * demand;

      return {
        product: {
          _id: product._id,
          name: product.name,
          sku: product.sku,
          cost: product.cost
        },
        segment,
        segmentLabel: formatSegmentLabel(segment),
        resultMode: "Business Summary Only",
        readinessLevel: summary.readinessLevel || "Summary only",
        mlReadiness: summary.mlReadiness,
        modelBased: false,
        inputPrice: round(numericPrice),
        competitorPrice: numericCompetitorPrice === undefined ? null : round(numericCompetitorPrice),
        expectedDemand: round(demand),
        expectedRevenue: round(revenue),
        expectedProfit: round(profit),
        priceSensitivity: "Not available",
        confidence: "Not available",
        resultReliability: {
          label: "Weak",
          score: 0,
          reasons: summary.blockingReasons || []
        },
        dataFitnessScore: summary.dataFitnessScore || 0,
        dataFitnessLabel: summary.dataFitnessLabel || "Summary only",
        businessRiskLevel: "High",
        costQuality: summary.costQuality || {},
        predictionRange: buildPredictionRange({
          demand,
          revenue,
          profit,
          price: numericPrice,
          cost: product.cost,
          model: { reliabilityLabel: "Weak" }
        }),
        modelErrorSummary: { available: false, label: "No model", message: "No model was available for this product." },
        decisionLabel: "Not reliable",
        calculationSteps: [
          "No price-response model was available for this product.",
          `Used historical average demand per grouped demand point = ${round(demand)} units.`,
          `Scenario revenue = ${round(numericPrice)} x ${round(demand)} = ${round(revenue)}.`,
          `Scenario profit = (${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}.`
        ],
        calculationBreakdown: {
          demandFormula: "Historical units sold / grouped demand points",
          baseDemand: round(demand),
          competitorAdjustment: 1,
          revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
          profitFormula: `(${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}`
        },
        summaryMetrics: summary.summaryMetrics,
        warnings: [
          "This is a scenario summary, not a demand-model prediction.",
          ...(summary.blockingReasons || [])
        ],
        explanation: `${product.name} does not have enough pricing variation for a demand model. This scenario uses historical average demand only, so it should not be treated as a price recommendation.`
      };
    }
  }

  const { demand, revenue, profit, elasticity, baseDemand, competitorAdjustment, competitorUsed, sensitivityLabel, confidenceLabel } = calculatePriceOutcome({
    product,
    model,
    price: numericPrice,
    competitorPrice: numericCompetitorPrice
  });
  const warnings = getModelWarnings(model);
  const historicalRangeWarning = getHistoricalRangeWarning(model, numericPrice);
  const profitWarning = numericPrice < product.cost ? `Test price is below product cost (${round(product.cost)}), so profit can be negative.` : null;

  if (historicalRangeWarning) warnings.push(historicalRangeWarning);
  if (profitWarning) warnings.push(profitWarning);

  if (numericCompetitorPrice !== undefined && !competitorUsed) {
    warnings.push("Competitor price was provided, but it was not used to change demand because this model did not learn a reliable competitor-price effect.");
  }

  if (demand <= 0) {
    warnings.push("Predicted demand is zero at this price, so revenue and profit estimates may not be useful.");
  }

  if (model.dataFitnessLabel === "Recommendation blocked") {
    warnings.push("This simulation can be viewed as a scenario only; recommendation is blocked by the data fitness gate.");
  }

  return {
    product: {
      _id: product._id,
      name: product.name,
      sku: product.sku,
      cost: product.cost
    },
    segment,
    segmentLabel: formatSegmentLabel(segment),
    inputPrice: round(numericPrice),
    competitorPrice: numericCompetitorPrice === undefined ? null : round(numericCompetitorPrice),
    expectedDemand: round(demand),
    expectedRevenue: round(revenue),
    expectedProfit: round(profit),
    priceSensitivity: sensitivityLabel,
    confidence: confidenceLabel,
    resultReliability: {
      label: model.reliabilityLabel || "Weak",
      score: round(model.reliabilityScore || 0, 0),
      reasons: model.reliabilityReasons || []
    },
    dataFitnessScore: model.dataFitnessScore || 0,
    dataFitnessLabel: model.dataFitnessLabel || "Recommendation blocked",
    businessRiskLevel: model.businessRiskLevel || "High",
    costQuality: model.costQuality || {},
    predictionRange: buildPredictionRange({
      demand,
      revenue,
      profit,
      price: numericPrice,
      cost: product.cost,
      model
    }),
    modelErrorSummary: summarizeBacktest(model.backtestMetrics || model.accuracyMetrics),
    readinessLevel: model.readinessLevel || "Simple model ready",
    accuracyMetrics: model.accuracyMetrics || {},
    mlReadiness: model.mlReadiness || {},
    decisionLabel: getResultDecisionLabel(model, warnings, demand),
    elasticity: elasticity === null ? null : round(elasticity, 3),
    modelType: model.modelType || "linear",
    formulaText: model.formulaText,
    historicalRangeWarning,
    profitWarning,
    calculationSteps: [
      `Model used: ${model.modelType === "context-adjusted" ? "Context-Adjusted Price Response Model" : model.modelType === "log-log" ? "Log-Log Elasticity Model" : "Simple Price Response Model"}.`,
      `Base demand at ${round(numericPrice)} = ${round(baseDemand)} units.`,
      numericCompetitorPrice === undefined
        ? "No competitor price was provided."
        : competitorUsed
          ? `Competitor price was used by the learned context model because enough competitor variation existed.`
          : "Competitor price was shown as context only; no hardcoded competitor adjustment was applied.",
      `Expected revenue = ${round(numericPrice)} x ${round(demand)} = ${round(revenue)}.`,
      `Expected profit = (${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}.`
    ],
    calculationBreakdown: {
      demandFormula: model.modelType === "context-adjusted" ? `context-adjusted model at price ${round(numericPrice)}` : model.modelType === "log-log" ? `exp(${round(model.a, 4)} + ${round(model.b, 4)} x ln(${round(numericPrice)}))` : `${round(model.a, 4)} - ${round(model.b, 4)} x ${round(numericPrice)}`,
      baseDemand: round(baseDemand),
      competitorAdjustment: round(competitorAdjustment, 3),
      competitorUsed,
      revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
      profitFormula: `(${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}`
    },
    modelCreated,
    model: {
      recordsUsed: model.recordsUsed,
      rawRowsUsed: model.rawRowsUsed,
      groupedDemandPoints: model.groupedDemandPoints,
      distinctPriceCount: model.distinctPriceCount,
      lastUpdated: model.lastUpdated,
      confidenceScore: round(model.rSquared, 3),
      priceRange: {
        min: round(model.priceRangeMin),
        max: round(model.priceRangeMax)
      },
      accuracyMetrics: model.accuracyMetrics || {},
      backtestMetrics: model.backtestMetrics || model.accuracyMetrics || {},
      dataFitnessScore: model.dataFitnessScore || 0,
      dataFitnessLabel: model.dataFitnessLabel || "Recommendation blocked",
      businessRiskLevel: model.businessRiskLevel || "High",
      costQuality: model.costQuality || {},
      readinessLevel: model.readinessLevel || "Simple model ready",
      mlReadiness: model.mlReadiness || {}
    },
    warnings,
    explanation: buildExplanation({
      product,
      price: numericPrice,
      demand,
      revenue,
      profit,
      sensitivityLabel,
      confidenceLabel,
      warnings
    })
  };
}
