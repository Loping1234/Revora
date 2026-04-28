import assert from "node:assert/strict";
import { assessDataFitness, buildPredictionRange, summarizeBacktest } from "../services/data-fitness.service.js";

const groupedRecords = Array.from({ length: 10 }, (_, index) => ({
  price: 100 + (index % 3) * 10,
  quantity: 50 - index,
  rawRows: 1,
  cost: 70
}));

const usableFitness = assessDataFitness({
  product: { costQuality: "real" },
  summary: { rawRows: 10, usableRows: 10, costRows: 10 },
  groupedRecords,
  distinctPriceCount: 3,
  model: { modelType: "linear", b: 1.2, rSquared: 0.78 },
  accuracyMetrics: { available: true, demandMAPE: 14, revenueMAPE: 12, profitMAPE: 18 },
  excludedRows: 0
});

assert.equal(usableFitness.dataFitnessLabel, "Model usable");
assert.equal(usableFitness.costQuality.label, "real");
assert.equal(usableFitness.blockedReasons.length, 0);

const missingCostFitness = assessDataFitness({
  product: { costQuality: "estimated" },
  summary: { rawRows: 10, usableRows: 10, costRows: 0 },
  groupedRecords: groupedRecords.map((record) => ({ ...record, cost: undefined })),
  distinctPriceCount: 3,
  model: { modelType: "linear", b: 1.1, rSquared: 0.7 },
  accuracyMetrics: { available: true, demandMAPE: 18, revenueMAPE: 17, profitMAPE: 0 },
  excludedRows: 0
});

assert.notEqual(missingCostFitness.dataFitnessLabel, "Recommendation blocked");
assert.equal(missingCostFitness.costQuality.label, "missing");
assert.ok(missingCostFitness.dataFitnessWarnings.some((warning) => warning.includes("Profit optimization is blocked")));

const summaryOnlyFitness = assessDataFitness({
  product: { costQuality: "real" },
  summary: { rawRows: 2, usableRows: 2, costRows: 2 },
  groupedRecords: groupedRecords.slice(0, 2),
  distinctPriceCount: 1,
  excludedRows: 0
});

assert.equal(summaryOnlyFitness.dataFitnessLabel, "Summary only");
assert.ok(summaryOnlyFitness.blockedReasons.some((reason) => reason.includes("Only one price")));

const range = buildPredictionRange({
  demand: 100,
  revenue: 10000,
  profit: 3000,
  price: 100,
  cost: 70,
  model: { reliabilityLabel: "Usable" }
});

assert.equal(range.demand.expected, 100);
assert.ok(range.demand.low < 100);
assert.ok(range.demand.high > 100);

const backtest = summarizeBacktest({ available: true, demandMAPE: 12.4, revenueMAPE: 9.2, profitMAPE: 18.8 });
assert.equal(backtest.label, "Low error");
assert.equal(backtest.worstErrorPercent, 18.8);

console.log("Data fitness reliability tests passed.");
