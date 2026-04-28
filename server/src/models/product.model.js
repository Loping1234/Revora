import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
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

productSchema.pre("save", function normalizeIdentity(next) {
  this.normalizedSku = normalizeProductKey(this.sku);
  this.normalizedName = normalizeProductKey(this.name);
  this.aliases = [...new Set([...(this.aliases || []), this.name, this.sku].filter(Boolean))];
  next();
});

export const Product = mongoose.model("Product", productSchema);
