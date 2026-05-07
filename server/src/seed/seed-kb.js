import mongoose from "mongoose";
import dotenv from "dotenv";
import { KnowledgeBase } from "../models/knowledge-base.model.js";

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/revora";

const seedData = [
  {
    tag: "price_increase_demand_up",
    priceChangeType: "increase",
    demandChange: "up",
    economicPrinciple: "Inelastic demand / pricing power",
    explanation: "Demand rising after a price increase suggests customers are not strongly price-sensitive for this product right now.",
    historicalCase: {
      market: "Fresh fruit retail, Rajasthan",
      year: "2023",
      what_happened: "Mango vendors raised prices during tight summer supply and demand still increased.",
      outcome: "Vendors who increased early captured stronger margins before competitors adjusted."
    },
    recommendation: "Hold the new price and monitor sales for a few days before testing another small increase.",
    risk: "Competitors may undercut you if the price gap becomes too visible.",
    scale: ["small_vendor", "local_shop"]
  },
  {
    tag: "price_increase_demand_down",
    priceChangeType: "increase",
    demandChange: "down",
    economicPrinciple: "Elastic demand",
    explanation: "Demand dropping after a price increase suggests customers are sensitive to this product's price.",
    historicalCase: {
      market: "Dairy retail, Mumbai",
      year: "2022",
      what_happened: "Milk prices increased by Rs 2 and some customers shifted to cheaper loose milk alternatives.",
      outcome: "Profit fell because lost volume outweighed the higher unit price."
    },
    recommendation: "Test a partial rollback or offer a smaller pack at the old entry price.",
    risk: "Repeated sharp increases can push regular customers toward competitors.",
    scale: ["small_vendor", "local_shop"]
  },
  {
    tag: "price_increase_demand_flat",
    priceChangeType: "increase",
    demandChange: "flat",
    economicPrinciple: "Moderate pricing power",
    explanation: "Flat demand after a price increase means customers accepted the change, but there is not enough evidence for a larger jump.",
    historicalCase: {
      market: "Packaged snacks retail",
      year: "2024",
      what_happened: "Retailers raised prices slightly after supplier cost increases while keeping pack size stable.",
      outcome: "Volume stayed mostly stable, but bigger increases later caused switching."
    },
    recommendation: "Keep the price for now and collect more days of sales before increasing again.",
    risk: "A second increase too soon may reveal hidden price sensitivity.",
    scale: ["small_vendor", "local_shop", "supermarket"]
  },
  {
    tag: "price_decrease_demand_up",
    priceChangeType: "decrease",
    demandChange: "up",
    economicPrinciple: "Discount-led demand lift",
    explanation: "Demand increasing after a price decrease shows the lower price attracted more buyers.",
    historicalCase: {
      market: "Apparel clearance",
      year: "2023",
      what_happened: "Shops discounted seasonal shirts near end-of-season to clear stock quickly.",
      outcome: "Sales volume rose, but profit depended on whether the margin loss was controlled."
    },
    recommendation: "Check profit before repeating the discount; use it mainly for stock clearance or customer acquisition.",
    risk: "Customers may wait for discounts if you repeat the cut too often.",
    scale: ["small_vendor", "local_shop"]
  },
  {
    tag: "price_decrease_demand_down",
    priceChangeType: "decrease",
    demandChange: "down",
    economicPrinciple: "Weak product-market fit or low trust signal",
    explanation: "Demand falling even after a price decrease means price may not be the main problem.",
    historicalCase: {
      market: "Local electronics accessories",
      year: "2024",
      what_happened: "A shop reduced prices on older phone covers, but demand fell as newer models became popular.",
      outcome: "Discounting could not fix a product relevance issue."
    },
    recommendation: "Avoid deeper cuts until you check product freshness, display, quality perception, and competitor alternatives.",
    risk: "Further discounting may destroy margin without solving the demand problem.",
    scale: ["small_vendor", "local_shop"]
  },
  {
    tag: "price_decrease_demand_flat",
    priceChangeType: "decrease",
    demandChange: "flat",
    economicPrinciple: "Low price responsiveness",
    explanation: "Flat demand after a discount means customers did not respond strongly to the lower price.",
    historicalCase: {
      market: "Household essentials",
      year: "2023",
      what_happened: "Small discounts on routine products produced little volume change because customers already bought as needed.",
      outcome: "The discount reduced margin without meaningfully increasing units."
    },
    recommendation: "Stop the discount unless it supports a clear goal like clearing old stock.",
    risk: "Margin erosion can happen quietly when discount volume does not rise.",
    scale: ["small_vendor", "local_shop", "supermarket"]
  },
  {
    tag: "price_flat_demand_up",
    priceChangeType: "flat",
    demandChange: "up",
    economicPrinciple: "Non-price demand driver",
    explanation: "Demand increased without a price change, so the driver may be seasonality, display, promotion, shortage elsewhere, or word of mouth.",
    historicalCase: {
      market: "Festival grocery retail",
      year: "2024",
      what_happened: "Demand rose for sweets and dry fruits before festivals even when prices stayed stable.",
      outcome: "Shops benefited by improving stock planning rather than changing price immediately."
    },
    recommendation: "Look for the external cause before changing price; improve stock and consider a small test increase only if demand stays high.",
    risk: "Mistaking a temporary demand spike for permanent pricing power can lead to overpricing later.",
    scale: ["small_vendor", "local_shop"]
  },
  {
    tag: "price_flat_demand_down",
    priceChangeType: "flat",
    demandChange: "down",
    economicPrinciple: "Demand weakness not caused by price change",
    explanation: "Demand fell even though price stayed flat, so the issue is likely outside price: competitor action, seasonality, availability, display, or product relevance.",
    historicalCase: {
      market: "Local stationery retail",
      year: "2023",
      what_happened: "Notebook demand dropped after school reopening season ended while prices were unchanged.",
      outcome: "The right response was stock control, not immediate price cutting."
    },
    recommendation: "Check seasonality and competitor movement before discounting; reduce reorder quantity if the trend continues.",
    risk: "Cutting price too quickly may hide the real cause and reduce margin unnecessarily.",
    scale: ["small_vendor", "local_shop"]
  }
];

async function runSeed() {
  try {
    console.log("Connecting to:", MONGO_URI);
    await mongoose.connect(MONGO_URI);
    await KnowledgeBase.deleteMany({});
    await KnowledgeBase.insertMany(seedData);
    console.log(`Successfully seeded ${seedData.length} pricing knowledge-base cases.`);
    process.exit(0);
  } catch (err) {
    console.error("Seed failed:", err.message);
    process.exit(1);
  }
}

runSeed();
