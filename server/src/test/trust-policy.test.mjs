import assert from "node:assert/strict";
import { assessModelEvidence, buildEstimatedImprovementRange, getRecommendationDecision } from "../services/trust-policy.service.js";

const strongModel = {
  modelType: "linear",
  b: 1.2,
  rSquared: 0.82,
  groupedDemandPoints: 12,
  distinctPriceCount: 4,
  dataFitnessLabel: "Model usable",
  costQuality: { label: "real" },
  modelErrorSummary: { available: true, worstErrorPercent: 14.5 }
};

const strongEvidence = assessModelEvidence(strongModel);
assert.equal(strongEvidence.modelReliabilityLabel, "Strong");

const noBacktestEvidence = assessModelEvidence({
  ...strongModel,
  modelErrorSummary: { available: false }
});
assert.equal(noBacktestEvidence.modelReliabilityLabel, "Usable, not backtested");

const weakEvidence = assessModelEvidence({
  ...strongModel,
  groupedDemandPoints: 3,
  distinctPriceCount: 2,
  rSquared: 0.25
});
assert.equal(weakEvidence.modelReliabilityLabel, "Weak");

const recommended = getRecommendationDecision({
  model: strongModel,
  warnings: [],
  demand: 25,
  objective: "profit"
});
assert.equal(recommended.decisionLabel, "Recommended");
assert.equal(recommended.recommendationStatus, "recommended");

const estimatedCostDecision = getRecommendationDecision({
  model: { ...strongModel, costQuality: { label: "estimated" } },
  warnings: [],
  demand: 25,
  objective: "profit"
});
assert.equal(estimatedCostDecision.decisionLabel, "Use with caution");

const blocked = getRecommendationDecision({
  model: { ...strongModel, dataFitnessLabel: "Recommendation blocked" },
  warnings: [],
  demand: 25,
  objective: "profit"
});
assert.equal(blocked.decisionLabel, "Not enough evidence");

const improvementRange = buildEstimatedImprovementRange({
  baselineMetric: 1000,
  objective: "profit",
  predictionRange: {
    profit: { low: 1100, expected: 1250, high: 1400 }
  }
});
assert.deepEqual(improvementRange, { low: 10, expected: 25, high: 40 });

console.log("Trust policy tests passed.");
