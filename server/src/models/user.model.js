import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    role: {
      type: String,
      enum: ["admin", "analyst", "manager"],
      required: true,
      index: true
    },
    passwordHash: {
      type: String,
      required: true
    },
    passwordSalt: {
      type: String,
      required: true
    },
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    active: {
      type: Boolean,
      default: true,
      index: true
    },
    lastLoginAt: Date
  },
  { timestamps: true }
);

userSchema.index({ workspaceId: 1, role: 1 }, { unique: true });

export const User = mongoose.model("User", userSchema);
