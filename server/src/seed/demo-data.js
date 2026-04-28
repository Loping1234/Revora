import mongoose from "mongoose";
import { connectDatabase } from "../config/db.js";
import { Product } from "../models/product.model.js";
import { SalesData } from "../models/sales-data.model.js";

const segments = [
  { name: "bulk", label: "Bulk Buyers", demandMultiplier: 1.9, priceSensitivity: 1.35 },
  { name: "retail", label: "Retail Customers", demandMultiplier: 1, priceSensitivity: 1 },
  { name: "premium", label: "Premium Segment", demandMultiplier: 0.48, priceSensitivity: 0.68 }
];

const products = [
  { name: "Widget A", sku: "WIDGET-A", category: "Consumer Goods", basePrice: 10, cost: 4, inventory: 240 },
  { name: "Widget B", sku: "WIDGET-B", category: "Consumer Goods", basePrice: 25, cost: 9, inventory: 18 },
  { name: "Smart Bottle", sku: "SMART-BOTTLE", category: "Lifestyle", basePrice: 32, cost: 12, inventory: 86 },
  { name: "Desk Lamp Pro", sku: "DESK-LAMP-PRO", category: "Home Office", basePrice: 48, cost: 19, inventory: 52 },
  { name: "Travel Pack", sku: "TRAVEL-PACK", category: "Accessories", basePrice: 76, cost: 31, inventory: 135 }
];

function createSalesRows(product, productId) {
  const rows = [];
  const startDate = new Date("2026-01-01T00:00:00.000Z");

  segments.forEach((segment, segmentIndex) => {
    for (let point = 0; point < 30; point += 1) {
      const priceShift = point - 14;
      const price = Number((product.basePrice * (0.7 + point * 0.025)).toFixed(2));
      const baseDemand = 210 * segment.demandMultiplier + product.basePrice * 2.2;
      const slope = 4.6 * segment.priceSensitivity;
      const seasonalLift = Math.sin((point + segmentIndex) / 4) * 6;
      const quantity = Math.max(4, Math.round(baseDemand - slope * price + seasonalLift));
      const competitorPrice = Number((price * (1 + (segmentIndex - 1) * 0.035 + priceShift * 0.002)).toFixed(2));
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + point);

      rows.push({
        productId,
        price,
        quantity,
        competitorPrice,
        customerSegment: segment.name,
        customerSegmentLabel: segment.label,
        date
      });
    }
  });

  return rows;
}

async function seedDemoData() {
  await connectDatabase();

  await Product.deleteMany({});
  await SalesData.deleteMany({});

  const createdProducts = await Product.insertMany(products);
  const salesRows = createdProducts.flatMap((product) => createSalesRows(product, product._id));
  await SalesData.insertMany(salesRows);

  console.log(`Seeded ${createdProducts.length} products`);
  console.log(`Seeded ${salesRows.length} sales records`);

  await mongoose.disconnect();
}

seedDemoData().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
