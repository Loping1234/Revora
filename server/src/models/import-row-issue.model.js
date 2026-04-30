import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const importRowIssueSchema = new mongoose.Schema(
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
    severity: {
      type: String,
      enum: ["warning", "error"],
      default: "error"
    },
    reason: {
      type: String,
      required: true
    },
    rawRow: {
      type: mongoose.Schema.Types.Mixed
    }
  },
  { timestamps: true }
);

importRowIssueSchema.index({ workspaceId: 1, importBatchId: 1 });

export const ImportRowIssue = mongoose.model("ImportRowIssue", importRowIssueSchema);
