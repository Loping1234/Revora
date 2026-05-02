import assert from "node:assert/strict";
import { applyMisleadingDataChecks, buildQualitySummary } from "../routes/upload.routes.js";

function row(overrides = {}) {
  return {
    rowStatus: "accepted",
    excludedFromModel: false,
    issueCodes: [],
    issueReasons: [],
    productIdentityKey: "sku-1",
    price: 100,
    quantity: 10,
    revenue: 1000,
    cost: 60,
    customerSegment: "retail",
    customerSegmentLabel: "Retail",
    productSnapshot: { sku: "SKU-1", name: "Test Product", category: "Test" },
    date: new Date("2026-01-01"),
    ...overrides
  };
}

const rows = [
  row({ quantity: 8 }),
  row({ quantity: 9 }),
  row({ quantity: 10 }),
  row({ quantity: 11 }),
  row({ quantity: 12 }),
  row({ quantity: 500, customerSegment: "b2b", customerSegmentLabel: "B2B" }),
  row({ price: 40, cost: 60 }),
  row({ date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) })
];

const warnings = applyMisleadingDataChecks(rows, ["Date", "SKU", "Unit Price USD", "Quantity Sold", "Revenue"]);

assert.deepEqual(warnings, []);
assert.equal(rows[5].rowStatus, "excluded_from_model");
assert.ok(rows[5].issueCodes.includes("EXTREME_BULK_ROW"));
assert.equal(rows[6].rowStatus, "excluded_from_model");
assert.ok(rows[6].issueCodes.includes("PRICE_BELOW_COST"));
assert.equal(rows[7].rowStatus, "error");
assert.ok(rows[7].issueCodes.includes("FUTURE_DATE"));

const summary = buildQualitySummary(
  rows,
  { detectedColumns: ["Unit Price USD", "Quantity Sold"], mappedFields: { price: "Unit Price USD", quantity: "Quantity Sold" } },
  rows.length,
  false
);

assert.equal(summary.error, 1);
assert.equal(summary.excluded_from_model, 2);
assert.equal(summary.commitEligibleRows, 7);
assert.equal(summary.modelEligibleRows, 5);
assert.equal(summary.productsDetected, 1);

console.log("Data quality gate tests passed.");
process.exit(0);
