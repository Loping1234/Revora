import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const productSchema = new mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true
    },
    sku: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    category: {
      type: String,
      required: true,
      trim: true
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0
    },
    cost: {
      type: Number,
      required: true,
      min: 0
    },
    inventory: {
      type: Number,
      required: true,
      min: 0
    },
    normalizedSku: {
      type: String,
      trim: true,
      index: true
    },
    normalizedName: {
      type: String,
      trim: true,
      index: true
    },
    externalProductIds: {
      type: [String],
      default: []
    },
    aliases: {
      type: [String],
      default: []
    },
    costQuality: {
      type: String,
      enum: ["real", "estimated", "missing", "inconsistent"],
      required: true,
      default: "real",
      index: true
    },
    matchConfidence: {
      type: Number,
      default: 1,
      min: 0,
      max: 1
    }
  },
  { timestamps: true }
);

function normalizeProductKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

productSchema.index({ workspaceId: 1, normalizedSku: 1 });
productSchema.index({ workspaceId: 1, normalizedName: 1 });
productSchema.index({ workspaceId: 1, category: 1, name: 1 });
productSchema.index({ workspaceId: 1, datasetStatus: 1 });

productSchema.pre("save", function normalizeIdentity(next) {
  this.normalizedSku = normalizeProductKey(this.sku);
  this.normalizedName = normalizeProductKey(this.name);
  this.aliases = [...new Set([...(this.aliases || []), this.name, this.sku].filter(Boolean))];
  next();
});

export const Product = mongoose.model("Product", productSchema);
