import mongoose from "mongoose";

const importRowIssueSchema = new mongoose.Schema(
  {
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

export const ImportRowIssue = mongoose.model("ImportRowIssue", importRowIssueSchema);
