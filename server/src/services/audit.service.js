import { AuditLog } from "../models/audit-log.model.js";
import { getWorkspaceId } from "../utils/workspace.js";

export async function logAudit(req, { action, targetType, targetId, summary, metadata } = {}) {
  if (!action) return null;

  try {
    return await AuditLog.create({
      workspaceId: getWorkspaceId(req),
      action,
      actor: {
        name: req?.user?.name || "Anonymous",
        role: req?.user?.role || "anonymous"
      },
      targetType,
      targetId: targetId ? String(targetId) : undefined,
      summary,
      metadata: metadata || {},
      request: {
        ip: req?.ip,
        userAgent: req?.get?.("user-agent")
      }
    });
  } catch (error) {
    console.error("Audit log failed", error);
    return null;
  }
}
