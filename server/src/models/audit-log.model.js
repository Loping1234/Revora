import mongoose from "mongoose";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const auditLogSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: String,
      required: true,
      default: DEFAULT_WORKSPACE_ID,
      index: true
    },
    action: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    actor: {
      name: String,
      role: String
    },
    targetType: String,
    targetId: String,
    summary: String,
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    request: {
      ip: String,
      userAgent: String
    }
  },
  { timestamps: true }
);

auditLogSchema.index({ workspaceId: 1, createdAt: -1 });
auditLogSchema.index({ workspaceId: 1, action: 1, createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
