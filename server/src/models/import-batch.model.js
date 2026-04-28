import mongoose from "mongoose";

const importBatchSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      enum: ["processing", "completed", "completed_with_errors", "failed"],
      default: "processing",
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
    truncated: {
      type: Boolean,
      default: false
    },
    completedAt: Date
  },
  { timestamps: true }
);

export const ImportBatch = mongoose.model("ImportBatch", importBatchSchema);
