import mongoose from "mongoose";
import dotenv from "dotenv";
import { KnowledgeBase } from "../models/knowledge-base.model.js";

dotenv.config({ path: "server/.env" });

const principles = [
  {
    title: "Price Elasticity of Demand (PED)",
    concept: "The Fundamental Law of Pricing",
    description: "Measures how sensitive your customers are to price changes. If demand drops significantly after a small increase, your product is 'Elastic'. If demand stays stable, it is 'Inelastic'.",
    tags: ["price_increase", "demand_down"],
    historicalCase: {
      summary: "Netflix 2011 Price Hike",
      outcome: "Netflix split its DVD and streaming services, effectively raising prices by 60%.",
      lesson: "They lost 800,000 subscribers instantly. Lesson: Even strong brands have a 'breaking point' for elasticity."
    }
  },
  {
    title: "Loss Leader Strategy",
    concept: "Sacrifice Margin for Footfall",
    description: "Selling a popular product at or below cost to lure customers into the shop, where they will buy other, more profitable items.",
    tags: ["price_decrease", "demand_up"],
    historicalCase: {
      summary: "Costco's $4.99 Rotisserie Chicken",
      outcome: "Costco loses millions on chickens but makes billions on the groceries people buy while picking them up.",
      lesson: "A price drop isn't a failure if it drives 'Basket Size' growth elsewhere."
    }
  },
  {
    title: "Veblen Goods / Premium Positioning",
    concept: "Higher Price = Higher Status",
    description: "For luxury items, a price increase can actually INCREASE demand because it makes the product seem more exclusive and desirable.",
    tags: ["price_increase", "demand_up", "premium_positioning"],
    historicalCase: {
      summary: "BMW and Mercedes Pricing",
      outcome: "Consistent price hikes reinforced their status as symbols of success.",
      lesson: "If your brand is built on status, lowering the price can actually kill demand by making it seem 'cheap'."
    }
  },
  {
    title: "Inventory Clearance (Liquidity First)",
    concept: "Cash is King",
    description: "When stock isn't moving, the 'holding cost' (shelf space and wasted capital) becomes more expensive than the loss of margin.",
    tags: ["price_decrease", "high_stock"],
    historicalCase: {
      summary: "Fashion Retail Seasonal Sales",
      outcome: "Stores like Zara slash prices by 70% at the end of a season.",
      lesson: "It is better to get 30% of the value now than 0% of the value when the stock becomes obsolete."
    }
  },
  {
    title: "The Price War Trap",
    concept: "Race to the Bottom",
    description: "When you drop prices solely to match a competitor, they drop theirs further, destroying the profit for the entire industry.",
    tags: ["price_decrease", "competitor_pressure"],
    historicalCase: {
      summary: "1992 American Airlines Price War",
      outcome: "Major airlines engaged in a 50% discount war.",
      lesson: "The industry lost billions. Lesson: Match on value or service, not just on the raw number."
    }
  }
];

async function seedKB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding...");

    // Clear existing
    await KnowledgeBase.deleteMany({});
    
    // Insert new
    await KnowledgeBase.insertMany(principles);
    
    console.log("Successfully seeded 5 core Knowledge Base entries!");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
}

seedKB();
