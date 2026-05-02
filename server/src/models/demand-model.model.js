import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const demandModelSchema = new mongoose.Schema(
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
    a: {
      type: Number,
      required: true
    },
    b: {
      type: Number,
      required: true
    },
    modelType: {
      type: String,
      enum: ["linear", "log-log", "context-adjusted"],
      required: true,
      default: "linear"
    },
    modelFamily: {
      type: String,
      enum: ["simple_price_response", "context_adjusted"],
      required: true,
      default: "simple_price_response"
    },
    formulaText: {
      type: String,
      required: true,
      default: "Estimated demand = baseline demand - price response x price"
    },
    featuresUsed: {
      type: [String],
      default: []
    },
    featureImportance: {
      type: [
        {
          feature: String,
          label: String,
          coefficient: Number,
          direction: String,
          impact: Number
        }
      ],
      default: []
    },
    seasonalityUsed: {
      type: Boolean,
      default: false
    },
    promotionUsed: {
      type: Boolean,
      default: false
    },
    competitorUsed: {
      type: Boolean,
      default: false
    },
    contextModel: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    modelComparison: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    readinessLevel: {
      type: String,
      enum: ["Not enough data", "Summary only", "Simple model ready", "Context model ready", "ML model ready"],
      default: "Not enough data",
      index: true
    },
    readinessDetails: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    accuracyMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    mlReadiness: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    limitations: {
      type: [String],
      default: []
    },
    stdErr: {
      type: Number,
      required: true,
      min: 0
    },
    rSquared: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    recordsUsed: {
      type: Number,
      required: true,
      min: 0
    },
    rawRowsUsed: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    groupedDemandPoints: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    distinctPriceCount: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    reliabilityScore: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100
    },
    reliabilityLabel: {
      type: String,
      enum: ["Strong", "Usable", "Usable, not backtested", "Weak"],
      required: true,
      default: "Weak"
    },
    reliabilityReasons: {
      type: [String],
      default: []
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
    aggregationSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    activeImportBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      index: true
    },
    dataFitnessScore: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100
    },
    dataFitnessLabel: {
      type: String,
      enum: ["Summary only", "Model usable", "Model risky", "Recommendation blocked"],
      required: true,
      default: "Recommendation blocked",
      index: true
    },
    businessRiskLevel: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "High"
    },
    costQuality: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    backtestMetrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    predictionIntervals: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    blockedReasons: {
      type: [String],
      default: []
    },
    dataFitnessWarnings: {
      type: [String],
      default: []
    },
    excludedRows: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    priceRangeMin: {
      type: Number,
      min: 0
    },
    priceRangeMax: {
      type: Number,
      min: 0
    },
    averagePrice: {
      type: Number,
      min: 0
    },
    averageDemand: {
      type: Number,
      min: 0
    },
    demandRangeMin: {
      type: Number,
      min: 0
    },
    demandRangeMax: {
      type: Number,
      min: 0
    },
    dataStartDate: {
      type: Date
    },
    dataEndDate: {
      type: Date
    },
    modelWarnings: {
      type: [String],
      default: []
    },
    trainingSummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    lastUpdated: {
      type: Date,
      required: true,
      default: Date.now
    }
  },
  { timestamps: true }
);

demandModelSchema.index({ productId: 1, segment: 1 }, { unique: true });
demandModelSchema.index({ workspaceId: 1, productId: 1, segment: 1 });
demandModelSchema.index({ workspaceId: 1, activeImportBatchId: 1 });
demandModelSchema.index({ workspaceId: 1, datasetStatus: 1 });

export const DemandModel = mongoose.model("DemandModel", demandModelSchema);
