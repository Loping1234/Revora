import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const recommendationOutcomeSchema = new mongoose.Schema(
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
    recommendationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Recommendation",
      required: true,
      unique: true,
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
      default: "all"
    },
    appliedPrice: {
      type: Number,
      required: true,
      min: 0
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    expectedTarget: {
      type: Number
    },
    expectedDemand: Number,
    expectedRevenue: Number,
    expectedProfit: Number,
    actualUnits: {
      type: Number,
      default: 0
    },
    actualRevenue: {
      type: Number,
      default: 0
    },
    actualProfit: {
      type: Number,
      default: 0
    },
    baselineProfit: {
      type: Number,
      default: 0
    },
    predictionError: {
      type: Number,
      default: 0
    },
    revenueError: {
      type: Number,
      default: 0
    },
    profitError: {
      type: Number,
      default: 0
    },
    profitLift: {
      type: Number,
      default: 0
    },
    targetHit: {
      type: Boolean,
      default: false
    },
    rowsMeasured: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ["Applied", "Measured", "Missed"],
      default: "Applied"
    },
    notes: String,
    measuredAt: Date
  },
  { timestamps: true }
);

recommendationOutcomeSchema.index({ workspaceId: 1, recommendationId: 1 });
recommendationOutcomeSchema.index({ workspaceId: 1, productId: 1, status: 1 });
recommendationOutcomeSchema.index({ workspaceId: 1, datasetStatus: 1 });

export const RecommendationOutcome = mongoose.model("RecommendationOutcome", recommendationOutcomeSchema);
