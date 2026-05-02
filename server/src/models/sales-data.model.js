import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const salesDataSchema = new mongoose.Schema(
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
    excludedFromModel: {
      type: Boolean,
      default: false,
      index: true
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    quantity: {
      type: Number,
      required: true,
      min: 0
    },
    competitorPrice: {
      type: Number,
      min: 0
    },
    cost: {
      type: Number,
      min: 0
    },
    inventory: {
      type: Number,
      min: 0
    },
    revenue: {
      type: Number,
      min: 0
    },
    grossMargin: {
      type: Number
    },
    region: {
      type: String,
      trim: true,
      index: true
    },
    channel: {
      type: String,
      trim: true
    },
    promotion: {
      type: Boolean,
      default: false
    },
    discount: {
      type: Number,
      min: 0
    },
    holiday: {
      type: Boolean,
      default: false
    },
    marketingSpend: {
      type: Number,
      min: 0
    },
    stockoutFlag: {
      type: Boolean,
      default: false,
      index: true
    },
    dateParts: {
      month: Number,
      quarter: Number,
      dayOfWeek: Number,
      isWeekend: Boolean,
      season: String
    },
    customerSegment: {
      type: String,
      required: true,
      index: true
    },
    customerSegmentLabel: {
      type: String,
      required: true,
      trim: true
    },
    productSnapshot: {
      externalProductId: String,
      sku: String,
      name: String,
      category: String
    },
    externalProductId: {
      type: String,
      trim: true,
      index: true
    },
    date: {
      type: Date,
      required: true
    },
    rowFingerprint: {
      type: String,
      index: true
    },
    importBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch",
      index: true
    },
    rawRow: {
      // Kept only for backward compatibility with older imports. New imports store
      // row-level debugging data in ImportRowIssue instead of bloating SalesData.
      type: mongoose.Schema.Types.Mixed
    },
    importMeta: {
      source: String,
      rowNumber: Number
    }
  },
  { timestamps: true }
);

salesDataSchema.index({ productId: 1, date: 1, customerSegment: 1, price: 1 });
salesDataSchema.index({ productId: 1, customerSegment: 1, stockoutFlag: 1, inventory: 1 });
salesDataSchema.index({ "importMeta.source": 1, "importMeta.rowNumber": 1 });
salesDataSchema.index({ workspaceId: 1, productId: 1, date: 1, customerSegment: 1, price: 1 });
salesDataSchema.index({ workspaceId: 1, importBatchId: 1 });
salesDataSchema.index({ workspaceId: 1, datasetStatus: 1, importBatchId: 1 });
salesDataSchema.index({ workspaceId: 1, datasetStatus: 1, excludedFromModel: 1 });
salesDataSchema.index({ workspaceId: 1, date: 1 });
salesDataSchema.index({ workspaceId: 1, customerSegment: 1 });

export const SalesData = mongoose.model("SalesData", salesDataSchema);
