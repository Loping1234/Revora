import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const workspaceSettingsSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true,
      unique: true
    },
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
