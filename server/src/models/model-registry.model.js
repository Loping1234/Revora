import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const modelRegistrySchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    modelType: {
      type: String,
      required: true,
      enum: ["chatbot", "enterprise"],
      index: true
    },
    modelPath: {
      type: String,
      required: true
    },
    trainedAt: {
      type: Date,
      default: Date.now
    },
    decisionCount: {
      type: Number,
      default: 0
    },
    accuracy: {
      type: Number,
      default: null
    }
  },
  { timestamps: true }
);

modelRegistrySchema.index({ workspaceId: 1, modelType: 1 }, { unique: true });

export const ModelRegistry = mongoose.model("ModelRegistry", modelRegistrySchema);
