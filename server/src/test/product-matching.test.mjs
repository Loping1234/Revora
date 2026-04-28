import assert from "node:assert/strict";
import { getDuplicateEvidence } from "../utils/product-matching.js";

function product(overrides) {
  return {
    name: "",
    sku: "",
    category: "Electronics",
    basePrice: 1000,
    externalProductIds: [],
    aliases: [],
    ...overrides
  };
}

assert.equal(
  getDuplicateEvidence(
    product({ name: "Bluetooth Speaker Mini", sku: "SPK-1", basePrice: 999 }),
    product({ name: "USB C Hub 7 Port", sku: "HUB-1", basePrice: 990 })
  ),
  null,
  "Speaker and hub must not be flagged just because category and price are similar."
);

assert.ok(
  getDuplicateEvidence(
    product({ name: "Nike AirMax", sku: "N-AIR-1", category: "Shoes" }),
    product({ name: "Nike Air Max", sku: "N-AIR-2", category: "Shoes" })
  ),
  "Tiny spacing/name variants should appear for manual review."
);

assert.equal(
  getDuplicateEvidence(
    product({ name: "Wireless Mouse", sku: "SKU-100", category: "Electronics" }),
    product({ name: "Gaming Keyboard", sku: "SKU-100", category: "Electronics" })
  )?.exactIdentityMatch,
  true,
  "Same SKU should be treated as an exact identity candidate."
);

assert.equal(
  getDuplicateEvidence(
    product({ name: "Nike AirMax", sku: "N-AIR-1", category: "Shoes" }),
    product({ name: "Nike Air Max", sku: "N-AIR-2", category: "Collectibles" })
  ),
  null,
  "Same name in different category should not appear as a duplicate candidate."
);

console.log("Product matching tests passed.");
