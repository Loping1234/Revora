import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const testedPriceSchema = new mongoose.Schema(
  {
    price: {
      type: Number,
      required: true,
      min: 0
    },
    expectedDemand: {
      type: Number,
      required: true,
      min: 0
    },
    expectedRevenue: {
      type: Number,
      required: true
    },
    expectedProfit: {
      type: Number,
      required: true
    },
    competitorDistance: {
      type: Number
    }
  },
  { _id: false }
);

const recommendationSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    datasetStatus: {
      type: String,
      enum: ["active", "archived"],
      required: true,
      default: "active",
      index: true
    },
    archivedAt: Date,
    archiveReason: String,
    sourceImportBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    segment: {
      type: String,
      required: true,
      default: "all",
      index: true
    },
    objective: {
      type: String,
      enum: ["profit", "revenue", "clear_inventory", "match_competitor"],
      required: true,
      default: "profit"
    },
    status: {
      type: String,
      enum: ["Draft", "Applied", "Measured", "Missed", "Archived"],
      required: true,
      default: "Draft",
      index: true
    },
    appliedPrice: {
      type: Number,
      min: 0
    },
    appliedStartDate: {
      type: Date
    },
    appliedEndDate: {
      type: Date
    },
    expectedTarget: {
      type: Number
    },
    outcomeSummary: {
      actualUnits: Number,
      actualRevenue: Number,
      actualProfit: Number,
      predictionError: Number,
      profitLift: Number,
      targetHit: Boolean,
      measuredAt: Date
    },
    minPrice: {
      type: Number,
      required: true,
      min: 0
    },
    maxPrice: {
      type: Number,
      required: true,
      min: 0
    },
    step: {
      type: Number,
      required: true,
      min: 0.01
    },
    competitorPrice: {
      type: Number,
      min: 0
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    recommendedPrice: {
      type: Number,
      required: true,
      min: 0
    },
    expectedDemand: {
      type: Number,
      required: true,
      min: 0
    },
    expectedRevenue: {
      type: Number,
      required: true
    },
    expectedProfit: {
      type: Number,
      required: true
    },
    baselineRevenue: {
      type: Number,
      required: true
    },
    baselineProfit: {
      type: Number,
      required: true
    },
    improvementAmount: {
      type: Number,
      required: true
    },
    improvementPercent: {
      type: Number,
      required: true
    },
    confidence: {
      type: String,
      required: true
    },
    priceSensitivity: {
      type: String,
      required: true
    },
    optimizationMethod: {
      type: String,
      enum: ["analytic", "hill_climb", "grid_fallback"],
      default: "grid_fallback"
    },
    modelType: {
      type: String,
      default: ""
    },
    modelFamily: {
      type: String,
      default: ""
    },
    featuresUsed: {
      type: [String],
      default: []
    },
    recordsUsed: {
      type: Number,
      required: true,
      min: 0
    },
    rawRowsUsed: {
      type: Number,
      default: 0,
      min: 0
    },
    groupedDemandPoints: {
      type: Number,
      default: 0,
      min: 0
    },
    distinctPriceCount: {
      type: Number,
      default: 0,
      min: 0
    },
    resultReliability: {
      label: String,
      score: Number,
      reasons: [String]
    },
    readinessLevel: {
      type: String,
      default: ""
    },
    accuracyMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    mlReadiness: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    decisionLabel: {
      type: String,
      enum: ["Recommended", "Use with caution", "Not reliable", "Not enough evidence"],
      default: "Use with caution"
    },
    objectiveExplanation: {
      type: String,
      default: ""
    },
    nearbyPriceComparison: {
      type: [
        {
          price: Number,
          expectedDemand: Number,
          expectedRevenue: Number,
          expectedProfit: Number,
          reason: String
        }
      ],
      default: []
    },
    warnings: {
      type: [String],
      default: []
    },
    guardrailWarnings: {
      type: [String],
      default: []
    },
    testedPriceCount: {
      type: Number,
      default: 0,
      min: 0
    },
    goodPriceRange: {
      min: Number,
      max: Number
    },
    avoidPriceRange: {
      min: Number,
      max: Number
    },
    calculationSteps: {
      type: [String],
      default: []
    },
    assumptions: {
      type: [String],
      default: []
    },
    relatedProductWarnings: {
      type: [String],
      default: []
    },
    modelLimitations: {
      type: [String],
      default: []
    },
    recommendationReliability: {
      label: String,
      score: Number,
      reasons: [String]
    },
    recommendationStatus: {
      type: String,
      enum: ["recommended", "use_with_caution", "not_enough_evidence"],
      default: "use_with_caution",
      index: true
    },
    safePriceBand: {
      min: Number,
      max: Number
    },
    predictionRange: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    estimatedImprovementRange: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    modelReliabilityLabel: {
      type: String,
      default: ""
    },
    modelReliabilityReasons: {
      type: [String],
      default: []
    },
    evidenceSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    profitUsesEstimatedCost: {
      type: Boolean,
      default: false
    },
    businessRiskLevel: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "High"
    },
    modelErrorSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    dataFitnessScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    dataFitnessLabel: {
      type: String,
      default: ""
    },
    costQuality: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    explanation: {
      type: String,
      required: true
    },
    testedPrices: {
      type: [testedPriceSchema],
      default: []
    }
  },
  { timestamps: true }
);

recommendationSchema.index({ productId: 1, createdAt: -1 });
recommendationSchema.index({ workspaceId: 1, productId: 1, createdAt: -1 });
recommendationSchema.index({ workspaceId: 1, status: 1, createdAt: -1 });
recommendationSchema.index({ workspaceId: 1, datasetStatus: 1, createdAt: -1 });

export const Recommendation = mongoose.model("Recommendation", recommendationSchema);
