import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { buildPredictionRange, summarizeBacktest } from "./data-fitness.service.js";
import { fitDemandModel, getDemandModelWarnings, getInsightSummary, isSupportedSegment, predictDemandFromModel } from "./demand-model.service.js";
import { getActiveImportBatchId } from "./import-batch.service.js";
import { assessModelEvidence, getRecommendationDecision, profitUsesEstimatedCost } from "./trust-policy.service.js";
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
  return assessModelEvidence({
    ...model,
    modelErrorSummary: summarizeBacktest(model.backtestMetrics || model.accuracyMetrics)
  }).modelReliabilityLabel;
}

export function getModelWarnings(model) {
  return getDemandModelWarnings(model);
}

export function getResultDecisionLabel(model, warnings = [], demand = 1) {
  return getRecommendationDecision({
    model: {
      ...model,
      modelErrorSummary: summarizeBacktest(model.backtestMetrics || model.accuracyMetrics)
    },
    warnings,
    demand
  }).decisionLabel;
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

  return `${product.name} at price ${round(price)} is estimated based on historical sales patterns to sell about ${round(demand)} units, generating ${round(revenue)} revenue and ${round(profit)} profit. Customer response is ${sensitivityLabel.toLowerCase()} with ${confidenceLabel.toLowerCase()} model reliability.${warningText}`;
}

function buildDemandWorking({ product, model, price, competitorPrice, demand, revenue, profit }) {
  const numericPrice = Number(price);
  const numericCompetitorPrice = Number(competitorPrice);
  const cost = Number(product.cost || 0);

  if (model.modelType === "context-adjusted" && model.contextModel?.features?.length) {
    const rows = [];
    let calculatedDemand = Number(model.contextModel.intercept || 0);

    for (const feature of model.contextModel.features) {
      let value = feature.baseline ?? 0;
      let source = "Historical average";

      if (feature.name === "price") {
        value = numericPrice;
        source = "Entered test price";
      } else if (feature.name === "competitorGap" && Number.isFinite(numericCompetitorPrice)) {
        value = (numericPrice - numericCompetitorPrice) / numericPrice;
        source = "Entered competitor price";
      }

      const standardizedValue = (Number(value || 0) - Number(feature.mean || 0)) / (Number(feature.standardDeviation || 1) || 1);
      const adjustment = standardizedValue * Number(feature.coefficient || 0);
      calculatedDemand += adjustment;

      if (Math.abs(adjustment) >= 0.01 || feature.name === "price" || feature.name === "competitorGap") {
        rows.push({
          feature: feature.label || feature.name,
          source,
          value: round(value, 4),
          historicalAverage: round(feature.mean, 4),
          adjustment: round(adjustment),
          explanation: adjustment < 0 ? "Reduces demand" : adjustment > 0 ? "Increases demand" : "No change"
        });
      }
    }

    return {
      modelType: "Context-adjusted price response",
      baselineDemand: round(model.contextModel.intercept),
      baselineFormula: "Baseline demand = model intercept learned from historical grouped demand points.",
      baselineExplanation: "This is the model's starting demand when price, competitor gap, and other context fields are held at their historical average levels.",
      adjustments: rows,
      finalDemandFormula: `${round(model.contextModel.intercept)} ${rows.map((row) => `${row.adjustment >= 0 ? "+" : "-"} ${Math.abs(row.adjustment)}`).join(" ")} = ${round(demand)} units`,
      calculatedDemand: round(calculatedDemand),
      finalDemand: round(demand),
      revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
      profitFormula: `(${round(numericPrice)} - ${round(cost)}) x ${round(demand)} = ${round(profit)}`,
      plainEnglish: "The model starts from historical baseline demand, then adds or subtracts demand based on the tested price and competitor price. Other context fields stay at their historical average unless the simulator provides them."
    };
  }

  if (model.modelType === "log-log") {
    return {
      modelType: "Log-log elasticity",
      baselineDemand: null,
      baselineFormula: "No separate baseline demand is shown because demand is calculated directly from the log-log price curve.",
      baselineExplanation: "The log-log model estimates demand from the learned elasticity curve instead of starting from a fixed unit baseline.",
      adjustments: [],
      finalDemandFormula: `exp(${round(model.a, 4)} + ${round(model.b, 4)} x ln(${round(numericPrice)})) = ${round(demand)} units`,
      calculatedDemand: round(demand),
      finalDemand: round(demand),
      revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
      profitFormula: `(${round(numericPrice)} - ${round(cost)}) x ${round(demand)} = ${round(profit)}`,
      plainEnglish: "The model estimates demand using a price-elasticity curve learned from historical price and quantity patterns."
    };
  }

  const priceAdjustment = -Number(model.b || 0) * numericPrice;

  return {
    modelType: "Simple price response",
    baselineDemand: round(model.a),
    baselineFormula: "Baseline demand = linear model intercept.",
    baselineExplanation: "This is the starting demand learned from historical grouped demand points before subtracting the tested price effect.",
    adjustments: [
      {
        feature: "Price",
        source: "Entered test price",
        value: round(numericPrice),
        historicalAverage: null,
        adjustment: round(priceAdjustment),
        explanation: priceAdjustment < 0 ? "Reduces demand" : "Increases demand"
      }
    ],
    finalDemandFormula: `${round(model.a)} - ${round(model.b, 4)} x ${round(numericPrice)} = ${round(demand)} units`,
    calculatedDemand: round(demand),
    finalDemand: round(demand),
    revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
    profitFormula: `(${round(numericPrice)} - ${round(cost)}) x ${round(demand)} = ${round(profit)}`,
    plainEnglish: "The model starts from baseline demand and subtracts the learned price effect."
  };
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

  const product = await Product.findOne({ _id: productId, datasetStatus: "active" }).lean();

  if (!product) {
    throw new Error("Product not found");
  }

  let model = await DemandModel.findOne({ productId, segment, datasetStatus: "active" }).lean();
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
      const predictionRange = buildPredictionRange({
        demand,
        revenue,
        profit,
        price: numericPrice,
        cost: product.cost,
        model: { reliabilityLabel: "Weak" }
      });
      const costQuality = summary.costQuality || {};

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
        estimatedDemand: round(demand),
        estimatedRevenue: round(revenue),
        estimatedProfit: round(profit),
        priceSensitivity: "Not available",
        confidence: "Not available",
        modelReliabilityLabel: "Weak",
        modelReliabilityReasons: summary.blockingReasons || ["No price-response model was available."],
        evidenceSummary: {
          groupedDemandPoints: Number(summary.summaryMetrics?.groupedDemandPoints || 0),
          distinctPrices: Number(summary.summaryMetrics?.distinctPriceCount || 0),
          dataFitness: summary.dataFitnessLabel || "Summary only",
          backtest: "Not enough history",
          costQuality: costQuality.label || "unknown"
        },
        profitUsesEstimatedCost: profitUsesEstimatedCost({ costQuality }),
        resultReliability: {
          label: "Weak",
          score: 0,
          reasons: summary.blockingReasons || []
        },
        dataFitnessScore: summary.dataFitnessScore || 0,
        dataFitnessLabel: summary.dataFitnessLabel || "Summary only",
        businessRiskLevel: "High",
        costQuality,
        predictionRange,
        modelErrorSummary: { available: false, label: "No model", message: "No model was available for this product." },
        decisionLabel: "Not enough evidence",
        recommendationStatus: "not_enough_evidence",
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
        demandWorking: {
          modelType: "Business summary only",
          baselineDemand: round(demand),
          baselineFormula: `${round(summary.summaryMetrics?.unitsSold || 0)} units / ${round(summary.summaryMetrics?.groupedDemandPoints || 0)} grouped demand points`,
          baselineExplanation: "No demand model was available, so the starting demand is the historical average units per grouped demand point.",
          adjustments: [],
          finalDemandFormula: `${round(summary.summaryMetrics?.unitsSold || 0)} units / ${round(summary.summaryMetrics?.groupedDemandPoints || 0)} grouped demand points = ${round(demand)} units`,
          calculatedDemand: round(demand),
          finalDemand: round(demand),
          revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
          profitFormula: `(${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}`,
          plainEnglish: "No demand model was available, so this uses historical average demand only."
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
  const modelErrorSummary = summarizeBacktest(model.backtestMetrics || model.accuracyMetrics);
  const trustDecision = getRecommendationDecision({
    model: { ...model, modelErrorSummary },
    warnings,
    demand
  });
  const predictionRange = buildPredictionRange({
    demand,
    revenue,
    profit,
    price: numericPrice,
    cost: product.cost,
    model: { ...model, reliabilityLabel: trustDecision.modelReliabilityLabel }
  });
  const demandWorking = buildDemandWorking({
    product,
    model,
    price: numericPrice,
    competitorPrice: numericCompetitorPrice,
    demand,
    revenue,
    profit
  });

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
    estimatedDemand: round(demand),
    estimatedRevenue: round(revenue),
    estimatedProfit: round(profit),
    priceSensitivity: sensitivityLabel,
    confidence: confidenceLabel,
    modelReliabilityLabel: trustDecision.modelReliabilityLabel,
    modelReliabilityReasons: trustDecision.modelReliabilityReasons,
    evidenceSummary: trustDecision.evidenceSummary,
    profitUsesEstimatedCost: profitUsesEstimatedCost({ costQuality: model.costQuality || {}, product }),
    resultReliability: {
      label: trustDecision.modelReliabilityLabel,
      score: round(model.reliabilityScore || 0, 0),
      reasons: trustDecision.modelReliabilityReasons
    },
    dataFitnessScore: model.dataFitnessScore || 0,
    dataFitnessLabel: model.dataFitnessLabel || "Recommendation blocked",
    businessRiskLevel: model.businessRiskLevel || "High",
    costQuality: model.costQuality || {},
    predictionRange,
    modelErrorSummary,
    readinessLevel: model.readinessLevel || "Simple model ready",
    accuracyMetrics: model.accuracyMetrics || {},
    mlReadiness: model.mlReadiness || {},
    decisionLabel: trustDecision.decisionLabel,
    recommendationStatus: trustDecision.recommendationStatus,
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
      `Estimated revenue = ${round(numericPrice)} x ${round(demand)} = ${round(revenue)}.`,
      `Estimated profit = (${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}.`
    ],
    calculationBreakdown: {
      demandFormula: model.modelType === "context-adjusted" ? `context-adjusted model at price ${round(numericPrice)}` : model.modelType === "log-log" ? `exp(${round(model.a, 4)} + ${round(model.b, 4)} x ln(${round(numericPrice)}))` : `${round(model.a, 4)} - ${round(model.b, 4)} x ${round(numericPrice)}`,
      baseDemand: round(baseDemand),
      competitorAdjustment: round(competitorAdjustment, 3),
      competitorUsed,
      revenueFormula: `${round(numericPrice)} x ${round(demand)} = ${round(revenue)}`,
      profitFormula: `(${round(numericPrice)} - ${round(product.cost)}) x ${round(demand)} = ${round(profit)}`
    },
    demandWorking,
    modelCreated,
    model: {
      recordsUsed: model.recordsUsed,
      rawRowsUsed: model.rawRowsUsed,
      groupedDemandPoints: model.groupedDemandPoints,
      distinctPriceCount: model.distinctPriceCount,
      lastUpdated: model.lastUpdated,
      modelReliabilityScore: round(model.rSquared, 3),
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
