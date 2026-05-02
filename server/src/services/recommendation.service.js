import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { buildPredictionRange, summarizeBacktest } from "./data-fitness.service.js";
import { fitDemandModel, isSupportedSegment } from "./demand-model.service.js";
import { getActiveImportBatchId } from "./import-batch.service.js";
import { calculatePriceOutcome, getConfidenceLabel, getModelWarnings, round } from "./simulation.service.js";
import { formatSegmentLabel } from "../utils/segments.js";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";
import { buildEstimatedImprovementRange, getRecommendationDecision, profitUsesEstimatedCost } from "./trust-policy.service.js";

const MAX_PRICE_POINTS = 101;
const SEARCH_ITERATIONS = 48;

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  return Number(value);
}

function buildPricePoints({ minPrice, maxPrice, step }) {
  const points = [];

  for (let price = minPrice; price <= maxPrice + Number.EPSILON && points.length < MAX_PRICE_POINTS; price += step) {
    points.push(round(price));
  }

  if (points[points.length - 1] !== round(maxPrice) && points.length < MAX_PRICE_POINTS) {
    points.push(round(maxPrice));
  }

  return [...new Set(points)].filter((price) => price > 0);
}

function defaultRangeForProduct(product) {
  const basePrice = Number(product.basePrice || 0);

  return {
    minPrice: Math.max(0.01, round(basePrice * 0.75)),
    maxPrice: Math.max(0.02, round(basePrice * 1.25))
  };
}

function buildExplanation({ product, recommendation, objective }) {
  const objectiveLabels = {
    profit: "maximum profit",
    revenue: "maximum revenue",
    clear_inventory: "moving more inventory",
    match_competitor: "staying close to competitor pricing"
  };
  const metricLabel = objectiveLabels[objective] || "maximum profit";
  const direction = recommendation.improvementAmount >= 0 ? "increase" : "decrease";
  const range = recommendation.estimatedImprovementRange;
  const improvementText = range
    ? `an estimated ${Math.abs(range.low).toFixed(1)}% to ${Math.abs(range.high).toFixed(1)}% ${direction} in the selected business metric`
    : `an estimated ${Math.abs(recommendation.improvementPercent).toFixed(1)}% ${direction} in the selected business metric`;

  return `${product.name}'s guarded price is ${recommendation.recommendedPrice} for ${metricLabel}. It is estimated based on historical sales patterns to produce ${improvementText} compared with the current price, using ${recommendation.groupedDemandPoints || recommendation.recordsUsed} grouped demand points and ${recommendation.modelReliabilityLabel || recommendation.confidence} model reliability.`;
}

function chooseObjectiveKey(objective) {
  if (objective === "revenue") return "expectedRevenue";
  if (objective === "clear_inventory") return "expectedDemand";
  if (objective === "match_competitor") return "competitorDistance";
  return "expectedProfit";
}

function getObjectiveExplanation(objective) {
  const explanations = {
    profit: "Compares tested prices and chooses the price with the highest expected profit.",
    revenue: "Compares tested prices and chooses the price with the highest expected revenue.",
    clear_inventory: "Compares tested prices and chooses the price expected to sell the most units while respecting cost guardrails.",
    match_competitor: "Chooses the tested price closest to the competitor price, using profit as a tie-breaker."
  };

  return explanations[objective] || explanations.profit;
}

function sensibleStep(range) {
  if (range >= 10000) return 500;
  if (range >= 3000) return 100;
  if (range >= 1000) return 50;
  if (range >= 100) return 10;
  return 1;
}

function buildRangeWarnings({ product, model, objective, minPrice, maxPrice, competitorPrice }) {
  const warnings = [];

  if (objective !== "revenue" && objective !== "clear_inventory" && minPrice < product.cost) {
    warnings.push(`Minimum price was below product cost (${round(product.cost)}), so loss-making prices were excluded from profit optimization.`);
  }

  if (Number.isFinite(model.priceRangeMin) && minPrice < model.priceRangeMin * 0.75) {
    warnings.push("Minimum price is more than 25% below historical prices.");
  }

  if (Number.isFinite(model.priceRangeMax) && maxPrice > model.priceRangeMax * 1.25) {
    warnings.push("Maximum price is more than 25% above historical prices.");
  }

  if (objective === "match_competitor" && !Number.isFinite(competitorPrice)) {
    warnings.push("Match competitor needs a competitor price; profit optimization was used instead.");
  }

  return warnings;
}

function getGoodAndAvoidRanges(testedPrices, objectiveKey, best) {
  if (!testedPrices.length) return { goodPriceRange: null, avoidPriceRange: null };

  const bestValue = best[objectiveKey] ?? best.expectedProfit;
  const goodPrices = testedPrices
    .filter((item) => objectiveKey === "competitorDistance" ? item.competitorDistance <= bestValue * 1.15 : item[objectiveKey] >= bestValue * 0.95)
    .map((item) => item.price);
  const avoidPrices = testedPrices
    .filter((item) => item.expectedDemand <= 0 || item.expectedProfit < 0)
    .map((item) => item.price);

  return {
    goodPriceRange: goodPrices.length ? { min: Math.min(...goodPrices), max: Math.max(...goodPrices) } : null,
    avoidPriceRange: avoidPrices.length ? { min: Math.min(...avoidPrices), max: Math.max(...avoidPrices) } : null
  };
}

function getNearbyPriceComparison(testedPrices, best, objectiveKey) {
  return testedPrices
    .filter((item) => item.price !== best.price)
    .sort((left, right) => Math.abs(left.price - best.price) - Math.abs(right.price - best.price))
    .slice(0, 2)
    .map((item) => ({
      price: item.price,
      expectedDemand: item.expectedDemand,
      expectedRevenue: item.expectedRevenue,
      expectedProfit: item.expectedProfit,
      reason: objectiveKey === "competitorDistance"
        ? `Farther from competitor price than ${best.price}.`
        : `${item[objectiveKey]} is lower than the selected price's ${best[objectiveKey]}.`
    }));
}

function evaluatePrice({ product, model, price, competitorPrice }) {
  const outcome = calculatePriceOutcome({ product, model, price, competitorPrice });

  return {
    price: round(price),
    expectedDemand: round(outcome.demand),
    expectedRevenue: round(outcome.revenue),
    expectedProfit: round(outcome.profit),
    competitorDistance: competitorPrice === undefined ? Number.POSITIVE_INFINITY : Math.abs(price - competitorPrice)
  };
}

function metricForPrice({ product, model, price, competitorPrice, objectiveKey }) {
  const result = evaluatePrice({ product, model, price, competitorPrice });
  if (objectiveKey === "competitorDistance") return -result.competitorDistance + result.expectedProfit / 1_000_000_000;
  return result[objectiveKey] ?? result.expectedProfit;
}

function analyticLinearOptimum({ product, model, minPrice, maxPrice, objectiveKey }) {
  if (model.modelType !== "linear" || model.b <= 0) return null;
  if (objectiveKey === "expectedRevenue") return model.a / (2 * model.b);
  if (objectiveKey === "expectedProfit") return (model.a + model.b * product.cost) / (2 * model.b);
  if (objectiveKey === "expectedDemand") return minPrice;
  return null;
}

function boundedSearch({ product, model, minPrice, maxPrice, competitorPrice, objectiveKey }) {
  let left = minPrice;
  let right = maxPrice;

  for (let index = 0; index < SEARCH_ITERATIONS; index += 1) {
    const first = left + (right - left) / 3;
    const second = right - (right - left) / 3;
    const firstValue = metricForPrice({ product, model, price: first, competitorPrice, objectiveKey });
    const secondValue = metricForPrice({ product, model, price: second, competitorPrice, objectiveKey });

    if (firstValue < secondValue) {
      left = first;
    } else {
      right = second;
    }
  }

  return (left + right) / 2;
}

function optimizePrice({ product, model, minPrice, maxPrice, competitorPrice, objectiveKey }) {
  if (objectiveKey === "competitorDistance" && Number.isFinite(competitorPrice)) {
    return {
      price: Math.min(maxPrice, Math.max(minPrice, competitorPrice)),
      optimizationMethod: "analytic"
    };
  }

  const analytic = analyticLinearOptimum({ product, model, minPrice, maxPrice, objectiveKey });

  if (Number.isFinite(analytic)) {
    return {
      price: Math.min(maxPrice, Math.max(minPrice, analytic)),
      optimizationMethod: "analytic"
    };
  }

  if (model.modelType === "log-log" || model.modelType === "context-adjusted") {
    return {
      price: boundedSearch({ product, model, minPrice, maxPrice, competitorPrice, objectiveKey }),
      optimizationMethod: "hill_climb"
    };
  }

  return {
    price: null,
    optimizationMethod: "grid_fallback"
  };
}

async function getRelatedProductWarnings(product) {
  const relatedProducts = await Product.find({
    _id: { $ne: product._id },
    category: product.category,
    datasetStatus: "active"
  }).limit(5).lean();

  if (!relatedProducts.length) return [];

  return [
    `${relatedProducts.length} related product${relatedProducts.length === 1 ? "" : "s"} in ${product.category} may be affected by this price decision. Treat this as a single-product recommendation, not category optimization.`
  ];
}

export async function recommendPrice({ productId, segment = "all", objective = "profit", minPrice, maxPrice, step, competitorPrice, workspaceId = DEFAULT_WORKSPACE_ID }) {
  if (!isSupportedSegment(segment)) {
    throw new Error("segment must be all or an imported customer group");
  }

  if (!["profit", "revenue", "clear_inventory", "match_competitor"].includes(objective)) {
    throw new Error("objective must be profit, revenue, clear_inventory, or match_competitor");
  }

  const product = await Product.findOne({ _id: productId, datasetStatus: "active" }).lean();

  if (!product) {
    throw new Error("Product not found");
  }

  let model = await DemandModel.findOne({ productId, segment, datasetStatus: "active" }).lean();
  const activeImportBatchId = await getActiveImportBatchId();
  const modelImportBatchId = model?.activeImportBatchId ? String(model.activeImportBatchId) : null;

  if (!model || modelImportBatchId !== (activeImportBatchId || null) || !model.dataFitnessLabel) {
    model = await fitDemandModel({ productId, segment });
  }

  const abnormalResponse = model.modelType === "log-log" ? model.b >= 0 : model.b <= 0;

  if (abnormalResponse) {
    throw new Error("Best Price Recommendation is blocked because this product's uploaded data does not show normal price-sensitive demand. Use Pricing Insights first and treat the result as directional.");
  }

  if ((model.reliabilityLabel || "Weak") === "Weak") {
    throw new Error("Best Price Recommendation is blocked because model reliability is weak. Use Pricing Insights to review missing data and treat this product as summary-only until more price variation is available.");
  }

  if ((model.dataFitnessLabel || "Recommendation blocked") === "Recommendation blocked") {
    throw new Error(`Best Price Recommendation is blocked because the data fitness gate failed: ${(model.blockedReasons || []).join(" ") || "the uploaded data is not safe enough for pricing decisions."}`);
  }

  const modelErrorSummary = summarizeBacktest(model.backtestMetrics || model.accuracyMetrics);

  if (modelErrorSummary.available && modelErrorSummary.worstErrorPercent > 35) {
    throw new Error(`Best Price Recommendation is blocked because backtesting error is too high (${modelErrorSummary.worstErrorPercent}%).`);
  }

  const defaults = defaultRangeForProduct(product);
  const numericMinPrice = parseOptionalNumber(minPrice) ?? defaults.minPrice;
  const numericMaxPrice = parseOptionalNumber(maxPrice) ?? defaults.maxPrice;
  let numericStep = parseOptionalNumber(step);
  const numericCompetitorPrice = parseOptionalNumber(competitorPrice);

  if (!Number.isFinite(numericMinPrice) || numericMinPrice <= 0) {
    throw new Error("Minimum price must be greater than zero");
  }

  if (!Number.isFinite(numericMaxPrice) || numericMaxPrice <= numericMinPrice) {
    throw new Error("Maximum price must be greater than minimum price");
  }

  if (numericCompetitorPrice !== undefined && (!Number.isFinite(numericCompetitorPrice) || numericCompetitorPrice < 0)) {
    throw new Error("Competitor price must be a non-negative number");
  }

  const costQualityLabel = model.costQuality?.label || product.costQuality || "real";
  if (["profit", "clear_inventory"].includes(objective) && costQualityLabel !== "real") {
    throw new Error(`Profit-based recommendations are blocked because cost quality is ${costQualityLabel}. Upload real cost values before trusting profit optimization.`);
  }

  if (Number.isFinite(model.priceRangeMin) && numericMinPrice < model.priceRangeMin * 0.75) {
    throw new Error("Recommendation range is more than 25% below historical prices. Narrow the range to stay inside a defensible business band.");
  }

  if (Number.isFinite(model.priceRangeMax) && numericMaxPrice > model.priceRangeMax * 1.25) {
    throw new Error("Recommendation range is more than 25% above historical prices. Narrow the range to stay inside a defensible business band.");
  }

  const range = numericMaxPrice - numericMinPrice;

  if (numericStep === undefined) {
    numericStep = sensibleStep(range);
  }

  if (!Number.isFinite(numericStep) || numericStep <= 0) {
    throw new Error("Price step must be greater than zero");
  }

  if (Math.floor(range / numericStep) + 1 > MAX_PRICE_POINTS) {
    numericStep = round(range / (MAX_PRICE_POINTS - 1), 2);
  }

  const effectiveMinPrice = objective === "profit" || objective === "clear_inventory" ? Math.max(numericMinPrice, product.cost) : numericMinPrice;

  if (effectiveMinPrice > numericMaxPrice) {
    throw new Error("Maximum price must be at or above product cost for profit recommendations.");
  }

  const guardrailWarnings = buildRangeWarnings({
    product,
    model,
    objective,
    minPrice: numericMinPrice,
    maxPrice: numericMaxPrice,
    competitorPrice: numericCompetitorPrice
  });

  if (Number.isFinite(numericCompetitorPrice) && !(model.modelType === "context-adjusted" && model.competitorUsed)) {
    guardrailWarnings.push("Competitor price was provided, but it was not used to change demand because the model did not learn a reliable competitor-price effect.");
  }

  const effectiveObjective = objective === "match_competitor" && !Number.isFinite(numericCompetitorPrice) ? "profit" : objective;
  const gridPrices = buildPricePoints({
    minPrice: effectiveMinPrice,
    maxPrice: numericMaxPrice,
    step: numericStep
  });
  const { price: optimizedPrice, optimizationMethod } = optimizePrice({
    product,
    model,
    minPrice: effectiveMinPrice,
    maxPrice: numericMaxPrice,
    competitorPrice: numericCompetitorPrice,
    objectiveKey: chooseObjectiveKey(effectiveObjective)
  });
  const candidatePrices = [...gridPrices];
  if (Number.isFinite(optimizedPrice)) {
    candidatePrices.push(optimizedPrice);
    candidatePrices.push(Math.max(effectiveMinPrice, optimizedPrice - numericStep));
    candidatePrices.push(Math.min(numericMaxPrice, optimizedPrice + numericStep));
  }
  const testedPrices = [...new Set(candidatePrices.map((price) => round(price)).filter((price) => price >= effectiveMinPrice && price <= numericMaxPrice))]
    .map((price) => evaluatePrice({
      product,
      model,
      price,
      competitorPrice: numericCompetitorPrice
    }));

  if (!testedPrices.length) {
    throw new Error("No valid prices were available to test");
  }

  const objectiveKey = chooseObjectiveKey(effectiveObjective);
  const best = testedPrices.reduce((currentBest, candidate) => {
    if (!currentBest) return candidate;
    if (objectiveKey === "competitorDistance") {
      if (candidate.competitorDistance < currentBest.competitorDistance) return candidate;
      if (candidate.competitorDistance === currentBest.competitorDistance && candidate.expectedProfit > currentBest.expectedProfit) return candidate;
      return currentBest;
    }
    if (candidate[objectiveKey] > currentBest[objectiveKey]) return candidate;
    if (candidate[objectiveKey] === currentBest[objectiveKey] && candidate.price < currentBest.price) return candidate;
    return currentBest;
  }, null);
  const baselineOutcome = calculatePriceOutcome({
    product,
    model,
    price: product.basePrice,
    competitorPrice: numericCompetitorPrice
  });
  const baselineRevenue = round(baselineOutcome.revenue);
  const baselineProfit = round(baselineOutcome.profit);
  const baselineMetric = effectiveObjective === "profit" ? baselineProfit : effectiveObjective === "clear_inventory" ? round(baselineOutcome.demand) : baselineRevenue;
  const bestMetric = objectiveKey === "competitorDistance" ? best.expectedProfit : best[objectiveKey];
  const improvementAmount = round(bestMetric - baselineMetric);
  const improvementPercent = baselineMetric === 0 ? 0 : round((improvementAmount / Math.abs(baselineMetric)) * 100, 1);
  const bestOutcome = calculatePriceOutcome({
    product,
    model,
    price: best.price,
    competitorPrice: numericCompetitorPrice
  });
  const warnings = getModelWarnings(model);
  const { goodPriceRange, avoidPriceRange } = getGoodAndAvoidRanges(testedPrices, objectiveKey, best);
  const nearbyPriceComparison = getNearbyPriceComparison(testedPrices, best, objectiveKey);
  const relatedProductWarnings = await getRelatedProductWarnings(product);
  const assumptions = [
    "Demand response is estimated from historical uploaded sales data.",
    "Raw rows are preserved, but model fitting uses grouped demand points.",
    "Stockout rows are excluded because low sales may be caused by no inventory.",
    Number.isFinite(numericCompetitorPrice) && !(model.modelType === "context-adjusted" && model.competitorUsed)
      ? "Competitor price is shown as scenario context only; no hardcoded competitor penalty is applied."
      : null,
    model.modelFamily === "context_adjusted" ? "Context features were used only where the CSV had enough variation." : "This recommendation uses a simple price-response model, so seasonality and promotion effects may remain as warnings."
  ].filter(Boolean);

  if (best.expectedDemand <= 0) {
    warnings.push("The recommended price produces zero predicted demand, so this recommendation should not be used directly.");
  }

  if (best.expectedProfit < 0) {
    warnings.push("The recommended scenario still has negative expected profit.");
  }

  const predictionRange = buildPredictionRange({
    demand: best.expectedDemand,
    revenue: best.expectedRevenue,
    profit: best.expectedProfit,
    price: best.price,
    cost: product.cost,
    model
  });
  const trustDecision = getRecommendationDecision({
    model: { ...model, modelErrorSummary },
    warnings: [...warnings, ...guardrailWarnings],
    demand: best.expectedDemand,
    objective: effectiveObjective
  });
  const estimatedImprovementRange = buildEstimatedImprovementRange({
    baselineMetric,
    predictionRange,
    objective: effectiveObjective
  });
  const usesEstimatedCost = profitUsesEstimatedCost({ costQuality: model.costQuality || { label: costQualityLabel }, product });

  const recommendationPayload = {
    workspaceId,
    datasetStatus: "active",
    sourceImportBatchId: activeImportBatchId || undefined,
    productId,
    segment,
    objective: effectiveObjective,
    minPrice: round(effectiveMinPrice),
    maxPrice: round(numericMaxPrice),
    step: round(numericStep),
    competitorPrice: numericCompetitorPrice === undefined ? undefined : round(numericCompetitorPrice),
    basePrice: round(product.basePrice),
    recommendedPrice: best.price,
    expectedDemand: best.expectedDemand,
    expectedRevenue: best.expectedRevenue,
    expectedProfit: best.expectedProfit,
    baselineRevenue,
    baselineProfit,
    improvementAmount,
    improvementPercent,
    confidence: getConfidenceLabel(model),
    modelReliabilityLabel: trustDecision.modelReliabilityLabel,
    modelReliabilityReasons: trustDecision.modelReliabilityReasons,
    evidenceSummary: trustDecision.evidenceSummary,
    profitUsesEstimatedCost: usesEstimatedCost,
    priceSensitivity: bestOutcome.sensitivityLabel,
    optimizationMethod,
    modelType: model.modelType,
    modelFamily: model.modelFamily || "simple_price_response",
    featuresUsed: model.featuresUsed || ["price"],
    recordsUsed: model.recordsUsed,
    rawRowsUsed: model.rawRowsUsed,
    groupedDemandPoints: model.groupedDemandPoints,
    distinctPriceCount: model.distinctPriceCount,
    resultReliability: {
      label: trustDecision.modelReliabilityLabel,
      score: round(model.reliabilityScore || 0, 0),
      reasons: trustDecision.modelReliabilityReasons
    },
    readinessLevel: model.readinessLevel || "Simple model ready",
    accuracyMetrics: model.accuracyMetrics || {},
    mlReadiness: model.mlReadiness || {},
    decisionLabel: trustDecision.decisionLabel,
    objectiveExplanation: getObjectiveExplanation(effectiveObjective),
    nearbyPriceComparison,
    warnings,
    guardrailWarnings,
    assumptions,
    relatedProductWarnings,
    modelLimitations: model.limitations || [],
    recommendationReliability: {
      label: trustDecision.decisionLabel,
      score: round(model.reliabilityScore || 0, 0),
      reasons: [...trustDecision.modelReliabilityReasons, ...relatedProductWarnings]
    },
    testedPriceCount: testedPrices.length,
    goodPriceRange,
    avoidPriceRange,
    safePriceBand: goodPriceRange,
    predictionRange,
    estimatedImprovementRange,
    recommendationStatus: trustDecision.recommendationStatus,
    businessRiskLevel: model.businessRiskLevel || "High",
    modelErrorSummary,
    dataFitnessScore: model.dataFitnessScore || 0,
    dataFitnessLabel: model.dataFitnessLabel || "Recommendation blocked",
    costQuality: model.costQuality || { label: costQualityLabel },
    calculationSteps: [
      `Tested ${testedPrices.length} prices from ${round(effectiveMinPrice)} to ${round(numericMaxPrice)} using a ${round(numericStep)} step.`,
      `Optimization method: ${optimizationMethod.replace("_", " ")}.`,
      `Objective: ${effectiveObjective.replace("_", " ")}.`,
      `Best price ${best.price} is estimated to produce ${best.expectedDemand} units, ${best.expectedRevenue} revenue, and ${best.expectedProfit} profit based on historical sales patterns.`,
      `Model used: ${model.modelType === "context-adjusted" ? "Context-Adjusted Price Response Model" : model.modelType === "log-log" ? "Log-Log Elasticity Model" : "Simple Price Response Model"} with ${model.recordsUsed} records.`
    ],
    testedPrices
  };

  recommendationPayload.explanation = buildExplanation({
    product,
    recommendation: recommendationPayload,
    objective: effectiveObjective
  });

  const savedRecommendation = await Recommendation.create(recommendationPayload);
  const recommendation = savedRecommendation.toObject();

  return {
    ...recommendation,
    segmentLabel: formatSegmentLabel(recommendation.segment),
    product: {
      _id: product._id,
      name: product.name,
      sku: product.sku,
      category: product.category,
      cost: product.cost
    }
  };
}
