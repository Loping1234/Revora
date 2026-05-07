import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const assistantDecisionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    rawMessage: {
      type: String,
      required: true,
      trim: true
    },
    product: {
      type: String,
      required: true,
      trim: true
    },
    oldPrice: Number,
    newPrice: Number,
    currentPrice: Number,
    cost: Number,
    competitorPrice: Number,
    goal: {
      type: String,
      trim: true,
      default: ""
    },
    priceChangeType: {
      type: String,
      enum: ["increase", "decrease", "flat", "unchanged", "unknown"],
      default: "unknown",
      index: true
    },
    demandChange: {
      type: String,
      enum: ["up", "down", "flat", "unknown"],
      default: "unknown",
      index: true
    },
    stockContext: {
      type: String,
      enum: ["high", "low", "normal", "unknown"],
      default: "unknown"
    },
    competitorContext: {
      type: String,
      enum: ["cheaper", "expensive", "same", "unknown"],
      default: "unknown"
    },
    context: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    advice: {
      title: String,
      recommendation: String,
      rationale: String,
      nextStep: String,
      severity: {
        type: String,
        enum: ["positive", "caution", "warning"],
        default: "caution"
      },
      theoreticalRoot: {
        economicPrinciple: String,
        explanation: String,
        recommendation: String,
        risk: String,
        title: String,
        concept: String,
        description: String
      },
      historicalPrecedent: {
        market: String,
        year: String,
        what_happened: String,
        summary: String,
        outcome: String,
        lesson: String
      },
      aiJustification: String
    },
    precisionAnalytics: {
      optimalPriceFormula: String,
      elasticityEstimate: Number,
      confidenceInterval: {
        low: Number,
        high: Number
      },
      dataSources: [String]
    },
    shadowPrediction: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    extractionConfidence: {
      type: Number,
      default: 0
    },
    missingFields: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      enum: ["pending_feedback", "resolved", "snoozed"],
      default: "pending_feedback",
      index: true
    },
    actualOutcome: {
      type: String,
      default: null
    }
  },
  { timestamps: true }
);

assistantDecisionSchema.index({ workspaceId: 1, createdAt: -1 });
assistantDecisionSchema.index({ workspaceId: 1, product: 1, createdAt: -1 });
assistantDecisionSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });

export const AssistantDecision = mongoose.model("AssistantDecision", assistantDecisionSchema);
