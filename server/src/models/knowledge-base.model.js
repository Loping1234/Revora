import mongoose from "mongoose";

const knowledgeBaseSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    unique: true
  },
  concept: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  // These tags allow the bot to find the right entry instantly
  tags: [{
    type: String,
    enum: [
      "price_increase", 
      "price_decrease", 
      "demand_up", 
      "demand_down", 
      "high_stock", 
      "competitor_pressure", 
      "premium_positioning",
      "loss_leader"
    ]
  }],
  historicalCase: {
    summary: String,
    outcome: String,
    lesson: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export const KnowledgeBase = mongoose.model("KnowledgeBase", knowledgeBaseSchema);
