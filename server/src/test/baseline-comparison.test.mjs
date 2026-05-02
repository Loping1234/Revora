import assert from "node:assert/strict";
import { evaluateBaselineAccuracy } from "../services/demand-model.service.js";

// Deterministic fixture: clear inverse price-demand relationship (model should win)
// Higher price → lower demand, consistent and predictable
const strongPriceResponseRecords = [
  { date: new Date("2025-01-01"), price: 10, quantity: 100, revenue: 1000 },
  { date: new Date("2025-01-05"), price: 12, quantity: 88, revenue: 1056 },
  { date: new Date("2025-01-10"), price: 14, quantity: 76, revenue: 1064 },
  { date: new Date("2025-01-15"), price: 16, quantity: 64, revenue: 1024 },
  { date: new Date("2025-01-20"), price: 18, quantity: 52, revenue: 936 },
  { date: new Date("2025-01-25"), price: 20, quantity: 40, revenue: 800 },
  { date: new Date("2025-02-01"), price: 11, quantity: 94, revenue: 1034 },
  { date: new Date("2025-02-05"), price: 13, quantity: 82, revenue: 1066 },
  { date: new Date("2025-02-10"), price: 15, quantity: 70, revenue: 1050 },
  { date: new Date("2025-02-15"), price: 17, quantity: 58, revenue: 986 },
];

// Deterministic fixture: random-looking demand with no price correlation (baseline should win)
// Demand jumps around regardless of price — a model cannot beat simple averaging
const noPriceResponseRecords = [
  { date: new Date("2025-01-01"), price: 10, quantity: 50, revenue: 500 },
  { date: new Date("2025-01-05"), price: 12, quantity: 80, revenue: 960 },
  { date: new Date("2025-01-10"), price: 14, quantity: 30, revenue: 420 },
  { date: new Date("2025-01-15"), price: 16, quantity: 90, revenue: 1440 },
  { date: new Date("2025-01-20"), price: 18, quantity: 20, revenue: 360 },
  { date: new Date("2025-01-25"), price: 20, quantity: 70, revenue: 1400 },
  { date: new Date("2025-02-01"), price: 11, quantity: 45, revenue: 495 },
  { date: new Date("2025-02-05"), price: 13, quantity: 85, revenue: 1105 },
  { date: new Date("2025-02-10"), price: 15, quantity: 25, revenue: 375 },
  { date: new Date("2025-02-15"), price: 17, quantity: 75, revenue: 1275 },
];

// Deterministic fixture: constant demand (all baselines should produce 0 error)
const constantDemandRecords = [
  { date: new Date("2025-01-01"), price: 10, quantity: 50, revenue: 500 },
  { date: new Date("2025-01-05"), price: 12, quantity: 50, revenue: 600 },
  { date: new Date("2025-01-10"), price: 14, quantity: 50, revenue: 700 },
  { date: new Date("2025-01-15"), price: 16, quantity: 50, revenue: 800 },
  { date: new Date("2025-01-20"), price: 18, quantity: 50, revenue: 900 },
  { date: new Date("2025-01-25"), price: 20, quantity: 50, revenue: 1000 },
  { date: new Date("2025-02-01"), price: 11, quantity: 50, revenue: 550 },
  { date: new Date("2025-02-05"), price: 13, quantity: 50, revenue: 650 },
  { date: new Date("2025-02-10"), price: 15, quantity: 50, revenue: 750 },
  { date: new Date("2025-02-15"), price: 17, quantity: 50, revenue: 850 },
];

// --- Test 1: Baseline results are structurally correct ---
{
  const train = strongPriceResponseRecords.slice(0, 8);
  const test = strongPriceResponseRecords.slice(8);
  const result = evaluateBaselineAccuracy(train, test);

  assert.equal(result.available, true, "Baseline comparison should be available with valid data.");
  assert.equal(result.baselines.length, 3, "Should produce exactly 3 baselines.");
  assert.equal(result.baselines[0].name, "mean_demand", "First baseline should be mean_demand.");
  assert.equal(result.baselines[0].label, "Average Demand", "Label should use business wording.");
  assert.equal(result.baselines[1].name, "last_value", "Second baseline should be last_value.");
  assert.equal(result.baselines[1].label, "Last Observation", "Label should use business wording.");
  assert.equal(result.baselines[2].name, "moving_average_3", "Third baseline should be moving_average_3.");
  assert.equal(result.baselines[2].label, "3-Point Moving Average", "Label should use business wording.");
  assert.ok(Number.isFinite(result.bestBaselineMAPE), "bestBaselineMAPE should be a finite number.");
  assert.ok(typeof result.bestBaselineName === "string", "bestBaselineName should be a string.");
  assert.ok(typeof result.bestBaselineLabel === "string", "bestBaselineLabel should be a string.");
  console.log("  ✓ Test 1: Baseline structure is correct.");
}

// --- Test 2: Mean baseline computes correctly ---
{
  const train = strongPriceResponseRecords.slice(0, 8);
  const test = strongPriceResponseRecords.slice(8);
  const result = evaluateBaselineAccuracy(train, test);

  // Train mean demand: (100+88+76+64+52+40+94+82) / 8 = 74.5
  const expectedMean = (100 + 88 + 76 + 64 + 52 + 40 + 94 + 82) / 8;
  assert.equal(expectedMean, 74.5, "Sanity check: mean of training demands should be 74.5.");
  // Test actuals: 70, 58
  // Mean predictions: 74.5, 74.5
  // MAE: (|70-74.5| + |58-74.5|) / 2 = (4.5 + 16.5) / 2 = 10.5
  const meanBaseline = result.baselines.find((b) => b.name === "mean_demand");
  assert.ok(Math.abs(meanBaseline.demandMAE - 10.5) < 0.01, `Mean demand MAE should be 10.5, got ${meanBaseline.demandMAE}.`);
  console.log("  ✓ Test 2: Mean baseline computes correctly.");
}

// --- Test 3: Constant demand produces zero baseline error ---
{
  const train = constantDemandRecords.slice(0, 8);
  const test = constantDemandRecords.slice(8);
  const result = evaluateBaselineAccuracy(train, test);

  // All demands are 50, so every baseline predicts 50 → 0 error
  for (const baseline of result.baselines) {
    assert.equal(baseline.demandMAE, 0, `${baseline.label} should have 0 MAE for constant demand.`);
    assert.equal(baseline.demandMAPE, 0, `${baseline.label} should have 0 MAPE for constant demand.`);
  }
  console.log("  ✓ Test 3: Constant demand produces zero baseline error.");
}

// --- Test 4: Empty inputs return available: false ---
{
  const result1 = evaluateBaselineAccuracy([], []);
  assert.equal(result1.available, false, "Empty inputs should return available: false.");

  const result2 = evaluateBaselineAccuracy(strongPriceResponseRecords.slice(0, 5), []);
  assert.equal(result2.available, false, "Empty test set should return available: false.");

  const result3 = evaluateBaselineAccuracy([], strongPriceResponseRecords.slice(0, 5));
  assert.equal(result3.available, false, "Empty train set should return available: false.");
  console.log("  ✓ Test 4: Empty inputs return available: false.");
}

// --- Test 5: Moving average uses available points when fewer than 3 ---
{
  const train = strongPriceResponseRecords.slice(0, 2); // Only 2 training points
  const test = strongPriceResponseRecords.slice(2, 4);
  const result = evaluateBaselineAccuracy(train, test);

  assert.equal(result.available, true, "Should still be available with 2 training points.");
  const movingAvg = result.baselines.find((b) => b.name === "moving_average_3");
  // With only 2 points, window is min(3,2)=2, same as mean of last 2
  const expectedDemand = (100 + 88) / 2; // 94
  // Test actuals: 76, 64; predictions: 94, 94
  // MAE: (|76-94| + |64-94|) / 2 = (18 + 30) / 2 = 24
  assert.ok(Math.abs(movingAvg.demandMAE - 24) < 0.01, `Moving average MAE should be 24, got ${movingAvg.demandMAE}.`);
  console.log("  ✓ Test 5: Moving average handles fewer than 3 training points.");
}

console.log("\nAll baseline comparison tests passed.");
