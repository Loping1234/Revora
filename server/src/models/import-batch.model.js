import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const importBatchSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    source: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      enum: [
        "processing",
        "completed",
        "completed_with_errors",
        "mapping_pending",
        "staged",
        "quality_review",
        "committed",
        "rejected",
        "abandoned",
        "archived",
        "failed"
      ],
      default: "mapping_pending",
      index: true
    },
    detectedColumns: [String],
    mappedFields: {
      type: Map,
      of: String,
      default: {}
    },
    detectedOptionalFields: {
      type: Map,
      of: String,
      default: {}
    },
    rowCounts: {
      totalRows: { type: Number, default: 0 },
      processedRows: { type: Number, default: 0 },
      importedRows: { type: Number, default: 0 },
      skippedRows: { type: Number, default: 0 },
      duplicateRowsSkipped: { type: Number, default: 0 },
      invalidRowsSkipped: { type: Number, default: 0 }
    },
    productSummary: {
      productsDetected: { type: Number, default: 0 },
      externalProductIdsDetected: { type: Number, default: 0 },
      productIdentityMode: String,
      newProductsCreated: { type: Number, default: 0 },
      existingProductsMatched: { type: Number, default: 0 },
      productsReady: { type: Number, default: 0 },
      productsLimited: { type: Number, default: 0 },
      productsNotReady: { type: Number, default: 0 }
    },
    segmentCounts: {
      type: Map,
      of: Number,
      default: {}
    },
    conflicts: {
      type: Map,
      of: Number,
      default: {}
    },
    datasetWarnings: [String],
    dataFitnessScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    dataFitnessLabel: {
      type: String,
      enum: ["Summary only", "Model usable", "Model risky", "Recommendation blocked"],
      default: "Summary only",
      index: true
    },
    costQualitySummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    qualitySummary: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    expiresAt: {
      type: Date,
      index: true
    },
    committedAt: Date,
    rejectedAt: Date,
    abandonedAt: Date,
    archivedAt: Date,
    committedBy: {
      id: String,
      name: String,
      role: String
    },
    replacedImportBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      index: true
    },
    rollbackOfImportBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      index: true
    },
    truncated: {
      type: Boolean,
      default: false
    },
    completedAt: Date
  },
  { timestamps: true }
);

importBatchSchema.index({ workspaceId: 1, createdAt: -1 });
importBatchSchema.index({ workspaceId: 1, status: 1 });

export const ImportBatch = mongoose.model("ImportBatch", importBatchSchema);
