import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const salesDataStagingSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    importBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      required: true,
      index: true
    },
    source: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    rowNumber: {
      type: Number,
      required: true,
      index: true
    },
    rowStatus: {
      type: String,
      enum: ["accepted", "warning", "excluded_from_model", "error"],
      required: true,
      default: "accepted",
      index: true
    },
    excludedFromModel: {
      type: Boolean,
      default: false,
      index: true
    },
    issueCodes: {
      type: [String],
      default: []
    },
    issueReasons: {
      type: [String],
      default: []
    },
    productIdentityKey: {
      type: String,
      trim: true,
      index: true
    },
    externalProductId: String,
    productSnapshot: {
      externalProductId: String,
      sku: String,
      name: String,
      category: String
    },
    price: Number,
    quantity: Number,
    competitorPrice: Number,
    cost: Number,
    inventory: Number,
    revenue: Number,
    grossMargin: Number,
    region: String,
    channel: String,
    promotion: Boolean,
    discount: Number,
    holiday: Boolean,
    marketingSpend: Number,
    stockoutFlag: Boolean,
    dateParts: {
      month: Number,
      quarter: Number,
      dayOfWeek: Number,
      isWeekend: Boolean,
      season: String
    },
    customerSegment: String,
    customerSegmentLabel: String,
    date: Date,
    rowFingerprint: {
      type: String,
      index: true
    },
    rawRow: {
      type: mongoose.Schema.Types.Mixed
    },
    expiresAt: {
      type: Date,
      required: true
    }
  },
  { timestamps: true }
);

salesDataStagingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
salesDataStagingSchema.index({ workspaceId: 1, importBatchId: 1, rowStatus: 1 });
salesDataStagingSchema.index({ workspaceId: 1, importBatchId: 1, productIdentityKey: 1 });

export const SalesDataStaging = mongoose.model("SalesDataStaging", salesDataStagingSchema);
