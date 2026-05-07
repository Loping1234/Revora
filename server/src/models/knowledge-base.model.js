import mongoose from "mongoose";

const knowledgeBaseSchema = new mongoose.Schema({
  tag: {
    type: String,
    required: true,
    unique: true,
    enum: [
      "price_increase_demand_up",
      "price_increase_demand_down",
      "price_increase_demand_flat",
      "price_decrease_demand_up",
      "price_decrease_demand_down",
      "price_decrease_demand_flat",
      "price_flat_demand_down",
      "price_flat_demand_up"
    ]
  },
  priceChangeType: {
    type: String,
    enum: ["increase", "decrease", "flat"],
    required: true
  },
  demandChange: {
    type: String,
    enum: ["up", "down", "flat"],
    required: true
  },
  economicPrinciple: {
    type: String,
    required: true
  },
  explanation: {
    type: String,
    required: true
  },
  historicalCase: {
    market: String,
    year: String,
    what_happened: String,
    outcome: String
  },
  recommendation: {
    type: String,
    required: true
  },
  risk: {
    type: String,
    required: true
  },
  scale: [{
    type: String,
    enum: ["small_vendor", "local_shop", "supermarket"]
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const KnowledgeBase = mongoose.model("KnowledgeBase", knowledgeBaseSchema);
