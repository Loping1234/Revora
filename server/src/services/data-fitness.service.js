function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function round(value, digits = 2) {
  return Number(Number(value || 0).toFixed(digits));
}

function isNormalPriceResponse(model) {
  if (!model) return false;
  return model.modelType === "log-log" ? model.b < 0 : model.b > 0;
}

export function assessCostQuality({ product, summary = {}, groupedRecords = [] }) {
  const usableRows = Number(summary.usableRows || groupedRecords.length || 0);
  const costRows = Number(summary.costRows || groupedRecords.filter((record) => Number(record.cost) > 0).length || 0);
  const costCoverage = usableRows ? costRows / usableRows : 0;
  const rowCosts = groupedRecords.map((record) => Number(record.cost)).filter((value) => Number.isFinite(value) && value > 0);
  const productCostQuality = product?.costQuality || "real";
  const reasons = [];
  let label = productCostQuality;

  if (productCostQuality === "estimated") {
    reasons.push("Product cost was estimated because the import did not provide a usable cost value.");
  }

  if (productCostQuality === "missing") {
    reasons.push("Product cost is missing.");
  }

  if (usableRows > 0 && costCoverage === 0 && productCostQuality !== "real") {
    label = "missing";
    reasons.push("No transaction-level cost values were imported.");
  }

  if (rowCosts.length >= 3) {
    const minCost = Math.min(...rowCosts);
    const maxCost = Math.max(...rowCosts);
    const averageCost = rowCosts.reduce((total, value) => total + value, 0) / rowCosts.length;

    if (averageCost > 0 && (maxCost - minCost) / averageCost > 0.5) {
      label = "inconsistent";
      reasons.push("Imported cost values vary too widely to trust profit estimates without review.");
    }
  }

  if (label === "real" && costCoverage > 0 && costCoverage < 0.6) {
    reasons.push("Cost values exist, but coverage is below 60% of usable rows.");
  }

  return {
    label,
    coveragePercent: round(costCoverage * 100, 1),
    reasons: reasons.length ? reasons : ["Cost is available for profit calculations."]
  };
}

export function assessDataFitness({
  product,
  summary = {},
  groupedRecords = [],
  distinctPriceCount = 0,
  model = null,
  accuracyMetrics = null,
  excludedRows = 0
}) {
  const usableRows = Number(summary.usableRows || groupedRecords.reduce((total, record) => total + Number(record.rawRows || 1), 0));
  const rawRows = Number(summary.rawRows || usableRows + excludedRows);
  const groupedDemandPoints = groupedRecords.length;
  const zeroQuantityPoints = groupedRecords.filter((record) => Number(record.quantity || 0) === 0).length;
  const stockoutShare = rawRows ? excludedRows / rawRows : 0;
  const costQuality = assessCostQuality({ product, summary, groupedRecords });
  const blockedReasons = [];
  const warnings = [];
  let score = 0;

  if (usableRows >= 30) score += 18;
  else if (usableRows >= 10) score += 14;
  else if (usableRows >= 5) score += 9;
  else if (usableRows >= 3) score += 5;
  else blockedReasons.push("Fewer than 3 usable sales rows.");

  if (groupedDemandPoints >= 12) score += 18;
  else if (groupedDemandPoints >= 8) score += 14;
  else if (groupedDemandPoints >= 5) score += 9;
  else if (groupedDemandPoints >= 3) score += 5;
  else blockedReasons.push("Fewer than 3 grouped demand points.");

  if (distinctPriceCount >= 5) score += 18;
  else if (distinctPriceCount >= 3) score += 14;
  else if (distinctPriceCount >= 2) score += 8;
  else blockedReasons.push("Only one price level was found.");

  if (costQuality.label === "real") score += costQuality.coveragePercent >= 60 ? 14 : 9;
  else if (costQuality.label === "estimated") {
    score += 5;
    warnings.push("Profit estimates depend on estimated product cost.");
  } else {
    warnings.push("Profit optimization is blocked because cost is missing or inconsistent.");
  }

  if (stockoutShare <= 0.1) score += 8;
  else if (stockoutShare <= 0.25) {
    score += 4;
    warnings.push("Some rows were excluded as stockouts.");
  } else {
    warnings.push("Many rows look like stockouts, so demand may be understated.");
  }

  if (zeroQuantityPoints <= Math.max(1, groupedDemandPoints * 0.2)) score += 6;
  else warnings.push("Many grouped demand points have zero quantity.");

  if (model) {
    if (isNormalPriceResponse(model)) score += 10;
    else blockedReasons.push("Demand does not show a normal price-sensitive pattern.");

    if (model.rSquared >= 0.7) score += 8;
    else if (model.rSquared >= 0.35) score += 4;
    else warnings.push("Model reliability is low.");
  }

  if (accuracyMetrics?.available) {
    const demandError = Number(accuracyMetrics.demandMAPE || 0);
    const revenueError = Number(accuracyMetrics.revenueMAPE || 0);
    const worstError = Math.max(demandError, revenueError);

    if (worstError <= 20) score += 8;
    else if (worstError <= 35) score += 4;
    else {
      blockedReasons.push(`Backtest error is too high (${round(worstError, 1)}%).`);
    }
  } else {
    warnings.push(accuracyMetrics?.reason || "Backtesting is unavailable because the product does not have enough time-ordered demand points.");
  }

  let label = "Recommendation blocked";
  if (groupedDemandPoints < 3 || distinctPriceCount < 2) label = "Summary only";
  else if (blockedReasons.length) label = "Recommendation blocked";
  else if (score >= 75) label = "Model usable";
  else label = "Model risky";

  const businessRiskLevel = label === "Model usable" ? "Low" : label === "Model risky" ? "Medium" : "High";

  return {
    dataFitnessScore: clamp(Math.round(score)),
    dataFitnessLabel: label,
    businessRiskLevel,
    costQuality,
    blockedReasons,
    dataFitnessWarnings: [...warnings, ...costQuality.reasons.filter((reason) => reason !== "Cost is available for profit calculations.")]
  };
}

export function errorRateFromModel(model = {}) {
  const accuracy = model.accuracyMetrics || model.backtestMetrics || {};

  if (accuracy.available) {
    const demandError = Number(accuracy.demandMAPE || 0) / 100;
    return clamp(Math.max(demandError, 0.08), 0.08, 0.7);
  }

  const reliabilityLabel = model.modelReliabilityLabel || model.reliabilityLabel;
  if (reliabilityLabel === "Strong") return 0.15;
  if (reliabilityLabel === "Usable") return 0.25;
  if (reliabilityLabel === "Usable, not backtested") return 0.3;
  return 0.45;
}

export function buildPredictionRange({ demand, revenue, profit, price, cost, model }) {
  const errorRate = errorRateFromModel(model);
  const lowDemand = Math.max(0, Number(demand || 0) * (1 - errorRate));
  const highDemand = Math.max(0, Number(demand || 0) * (1 + errorRate));
  const numericPrice = Number(price || 0);
  const numericCost = Number(cost || 0);

  return {
    errorRate: round(errorRate * 100, 1),
    demand: { low: round(lowDemand), expected: round(demand), high: round(highDemand) },
    revenue: { low: round(numericPrice * lowDemand), expected: round(revenue), high: round(numericPrice * highDemand) },
    profit: {
      low: round((numericPrice - numericCost) * lowDemand),
      expected: round(profit),
      high: round((numericPrice - numericCost) * highDemand)
    }
  };
}

export function summarizeBacktest(metrics = {}) {
  if (!metrics.available) {
    return {
      available: false,
      label: "Not enough history",
      message: metrics.reason || "Backtesting is unavailable for this product."
    };
  }

  const worstError = Math.max(Number(metrics.demandMAPE || 0), Number(metrics.revenueMAPE || 0), Number(metrics.profitMAPE || 0));
  const label = worstError <= 20 ? "Low error" : worstError <= 35 ? "Moderate error" : "High error";

  return {
    available: true,
    label,
    worstErrorPercent: round(worstError, 1),
    demandErrorPercent: round(metrics.demandMAPE, 1),
    revenueErrorPercent: round(metrics.revenueMAPE, 1),
    profitErrorPercent: round(metrics.profitMAPE, 1),
    baselineComparison: metrics.baselineComparison || null,
    modelBeatsBaseline: metrics.baselineComparison?.modelBeatsBaseline ?? null,
    baselineImprovementPercent: metrics.baselineComparison?.improvementPercent ?? null
  };
}
