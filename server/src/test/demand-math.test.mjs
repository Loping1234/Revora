import assert from "node:assert/strict";
import {
  fitLinearDemand,
  fitLogLogDemand,
  fitContextAdjustedDemand,
  predictDemandFromModel
} from "../services/demand-model.service.js";

// --- Test 1: Linear Regression ---
{
  // Perfect linear relationship: Q = 200 - 10 * P
  const linearRecords = [
    { price: 10, quantity: 100 },
    { price: 12, quantity: 80 },
    { price: 14, quantity: 60 },
    { price: 16, quantity: 40 }
  ];

  const result = fitLinearDemand(linearRecords);
  
  assert.equal(result.modelType, "linear");
  assert.equal(result.b, 10, "Slope coefficient 'b' should be exactly 10 (since formula is a - b * p)");
  assert.equal(result.a, 200, "Intercept 'a' should be exactly 200");
  assert.equal(result.rSquared, 1.0, "Perfectly correlated data should yield rSquared of 1");
  
  // Test prediction
  const prediction = predictDemandFromModel(result, 15);
  assert.equal(prediction, 50, "Prediction at P=15 should be 50");
  
  console.log("  ✓ Test 1: Linear demand math is correct.");
}

// --- Test 2: Linear Regression Error Cases ---
{
  // Insufficient data
  assert.throws(
    () => fitLinearDemand([{ price: 10, quantity: 100 }, { price: 12, quantity: 80 }]),
    /At least 3 grouped demand points are required/
  );

  // Zero variance
  assert.throws(
    () => fitLinearDemand([
      { price: 10, quantity: 100 },
      { price: 10, quantity: 90 },
      { price: 10, quantity: 80 }
    ]),
    /needs at least 2 different prices/
  );

  console.log("  ✓ Test 2: Linear demand handles bad data correctly.");
}

// --- Test 3: Log-Log Elasticity ---
{
  // Constant elasticity: Q = 1000 * P^(-2) => ln(Q) = ln(1000) - 2 * ln(P)
  // We need at least 8 positive points and 3 distinct prices
  const logLogRecords = [
    { price: 10, quantity: 1000 * Math.pow(10, -2) }, // 10
    { price: 10, quantity: 1000 * Math.pow(10, -2) }, 
    { price: 10, quantity: 1000 * Math.pow(10, -2) },
    { price: 15, quantity: 1000 * Math.pow(15, -2) }, // 4.444...
    { price: 15, quantity: 1000 * Math.pow(15, -2) }, 
    { price: 20, quantity: 1000 * Math.pow(20, -2) }, // 2.5
    { price: 20, quantity: 1000 * Math.pow(20, -2) },
    { price: 20, quantity: 1000 * Math.pow(20, -2) }
  ];

  const result = fitLogLogDemand(logLogRecords);
  
  assert.equal(result.modelType, "log-log");
  assert.ok(Math.abs(result.b - (-2)) < 0.001, "Elasticity 'b' should be approximately -2");
  assert.ok(Math.abs(result.a - Math.log(1000)) < 0.001, "Intercept 'a' should be approximately ln(1000)");
  assert.ok(Math.abs(result.rSquared - 1.0) < 0.001, "Perfectly correlated data should yield rSquared near 1");
  
  // Test prediction
  const prediction = predictDemandFromModel(result, 25);
  const expectedPrediction = 1000 * Math.pow(25, -2); // 1.6
  assert.ok(Math.abs(prediction - expectedPrediction) < 0.001, "Prediction should match the Q = 1000 * P^(-2) formula");

  console.log("  ✓ Test 3: Log-Log elasticity math is correct.");
}

// --- Test 4: Context-Adjusted Ridge Regression ---
{
  // Data with multiple features (price, holiday)
  const contextRecords = [
    { price: 10, quantity: 100, holidayShare: 1 },
    { price: 10, quantity: 80, holidayShare: 0 },
    { price: 12, quantity: 80, holidayShare: 1 },
    { price: 12, quantity: 60, holidayShare: 0 },
    { price: 14, quantity: 60, holidayShare: 1 },
    { price: 14, quantity: 40, holidayShare: 0 },
    { price: 16, quantity: 40, holidayShare: 1 },
    { price: 16, quantity: 20, holidayShare: 0 },
    { price: 18, quantity: 20, holidayShare: 1 },
    { price: 18, quantity: 10, holidayShare: 0 },
    { price: 20, quantity: 10, holidayShare: 1 },
    { price: 20, quantity: 5, holidayShare: 0 }
  ];

  const result = fitContextAdjustedDemand(contextRecords);
  
  assert.equal(result.modelType, "context-adjusted");
  assert.ok(Number.isFinite(result.rSquared), "Should return a finite rSquared");
  
  // Because of ridge penalty, exact slope won't be -10, but the price effect must be negative
  const priceFeature = result.contextModel.features.find(f => f.name === "price");
  assert.ok(priceFeature, "Model should include price feature");
  assert.ok(priceFeature.coefficient < 0, "Price effect should be negative (higher price = lower demand)");
  
  // Ensure the model correctly captures that holiday increases demand
  const holidayFeature = result.contextModel.features.find(f => f.name === "holidayShare");
  assert.ok(holidayFeature, "Model should include holiday feature");
  assert.ok(holidayFeature.coefficient > 0, "Holiday effect should be positive");
  
  // Test prediction
  const baselinePrediction = predictDemandFromModel(result, 15, { holiday: false });
  const holidayPrediction = predictDemandFromModel(result, 15, { holiday: true });
  assert.ok(holidayPrediction > baselinePrediction, "Prediction with holiday=true should be higher than holiday=false");

  console.log("  ✓ Test 4: Context-adjusted ridge regression math is correct.");
}

console.log("\nAll math validation tests passed.");
