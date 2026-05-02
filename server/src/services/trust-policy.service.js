function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

export function isNormalPriceResponse(model = {}) {
  if (!model) return false;
  return model.modelType === "log-log" ? Number(model.b) < 0 : Number(model.b) > 0;
}

export function buildEvidenceSummary(model = {}) {
  const backtest = model.modelErrorSummary || {};
  const costQuality = model.costQuality?.label || "unknown";

  return {
    groupedDemandPoints: Number(model.groupedDemandPoints || model.recordsUsed || 0),
    distinctPrices: Number(model.distinctPriceCount || 0),
    rSquared: round(model.rSquared || 0, 3),
    priceResponseDirection: isNormalPriceResponse(model) ? "Normal" : "Abnormal or unclear",
    dataFitness: model.dataFitnessLabel || "Not scored",
    backtest: backtest.available ? `${round(backtest.worstErrorPercent, 1)}% worst error` : "Not enough history",
    costQuality
  };
}

export function assessModelEvidence(model = {}) {
  const groupedDemandPoints = Number(model.groupedDemandPoints || model.recordsUsed || 0);
  const distinctPriceCount = Number(model.distinctPriceCount || 0);
  const rSquared = Number(model.rSquared || 0);
  const normalResponse = isNormalPriceResponse(model);
  const dataFitnessLabel = model.dataFitnessLabel || "Recommendation blocked";
  const backtest = model.modelErrorSummary || {};
  const reasons = [];

  if (groupedDemandPoints < 10) reasons.push("Fewer than 10 grouped demand points.");
  if (distinctPriceCount < 3) reasons.push("Fewer than 3 distinct price levels.");
  if (!normalResponse) reasons.push("Uploaded data does not show a normal price-sensitive demand pattern.");
  if (rSquared < 0.7) reasons.push("Historical fit is below the strong evidence threshold.");
  if (dataFitnessLabel !== "Model usable") reasons.push(`Data fitness is ${dataFitnessLabel}.`);
  if (!backtest.available) reasons.push("Backtest is unavailable because there is not enough time-ordered history.");
  if (backtest.available && Number(backtest.worstErrorPercent || 0) > 20) {
    reasons.push(`Backtest error is above the strong evidence threshold (${round(backtest.worstErrorPercent, 1)}%).`);
  }
  if (backtest.available && backtest.modelBeatsBaseline === false) {
    reasons.push("Model did not outperform a simple Average Demand baseline on held-out data.");
  }

  const baselineOk = !backtest.available || backtest.modelBeatsBaseline !== false;
  const coreEvidencePasses = groupedDemandPoints >= 10
    && distinctPriceCount >= 3
    && normalResponse
    && rSquared >= 0.7
    && dataFitnessLabel === "Model usable"
    && baselineOk;
  const backtestStrong = backtest.available && Number(backtest.worstErrorPercent || 0) <= 20;

  let label = "Weak";
  if (coreEvidencePasses && backtestStrong) {
    label = "Strong";
  } else if (coreEvidencePasses && !backtest.available) {
    label = "Usable, not backtested";
  } else if (
    groupedDemandPoints >= 5
    && distinctPriceCount >= 2
    && normalResponse
    && rSquared >= 0.35
    && dataFitnessLabel !== "Recommendation blocked"
    && (!backtest.available || Number(backtest.worstErrorPercent || 0) <= 35)
    && baselineOk
  ) {
    label = "Usable";
  }

  return {
    modelReliabilityLabel: label,
    modelReliabilityReasons: reasons.length ? reasons : ["All strong evidence gates passed."],
    evidenceSummary: buildEvidenceSummary({ ...model, modelErrorSummary: backtest })
  };
}

export function profitUsesEstimatedCost(source = {}) {
  const label = source.costQuality?.label || source.product?.costQuality || source.costQuality || "real";
  return label !== "real";
}

export function getRecommendationDecision({ model = {}, warnings = [], demand = 1, objective = "profit" }) {
  const evidence = assessModelEvidence(model);
  const hasMajorWarning = warnings.length > 0;
  const costIsEstimated = ["profit", "clear_inventory"].includes(objective) && profitUsesEstimatedCost(model);

  if (
    evidence.modelReliabilityLabel === "Strong"
    && model.dataFitnessLabel === "Model usable"
    && !hasMajorWarning
    && Number(demand || 0) > 0
    && !costIsEstimated
  ) {
    return {
      decisionLabel: "Recommended",
      recommendationStatus: "recommended",
      ...evidence
    };
  }

  if (evidence.modelReliabilityLabel === "Weak" || Number(demand || 0) <= 0 || model.dataFitnessLabel === "Recommendation blocked") {
    return {
      decisionLabel: "Not enough evidence",
      recommendationStatus: "not_enough_evidence",
      ...evidence
    };
  }

  return {
    decisionLabel: "Use with caution",
    recommendationStatus: "use_with_caution",
    ...evidence
  };
}

export function buildEstimatedImprovementRange({ baselineMetric, predictionRange, objective = "profit" }) {
  const range = objective === "revenue"
    ? predictionRange?.revenue
    : objective === "clear_inventory"
      ? predictionRange?.demand
      : predictionRange?.profit;

  if (!range || !Number.isFinite(Number(baselineMetric)) || Number(baselineMetric) === 0) {
    return null;
  }

  const denominator = Math.abs(Number(baselineMetric));
  return {
    low: round(((Number(range.low || 0) - Number(baselineMetric)) / denominator) * 100, 1),
    expected: round(((Number(range.expected || 0) - Number(baselineMetric)) / denominator) * 100, 1),
    high: round(((Number(range.high || 0) - Number(baselineMetric)) / denominator) * 100, 1)
  };
}
