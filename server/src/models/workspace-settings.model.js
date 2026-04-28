import mongoose from "mongoose";

const workspaceSettingsSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      required: true,
      trim: true,
      default: "Pricing Manager"
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: "USD"
    },
    themeColor: {
      type: String,
      required: true,
      trim: true,
      default: "#020617"
    },
    appearanceMode: {
      type: String,
      enum: ["light", "dark"],
      required: true,
      default: "light"
    },
    defaultObjective: {
      type: String,
      enum: ["profit", "revenue"],
      required: true,
      default: "profit"
    },
    reportName: {
      type: String,
      required: true,
      trim: true,
      default: "Pricing Recommendation Report"
    },
    activeImportBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportBatch"
    }
  },
  { timestamps: true }
);

export const WorkspaceSettings = mongoose.model("WorkspaceSettings", workspaceSettingsSchema);
