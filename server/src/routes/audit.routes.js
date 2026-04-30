import { Router } from "express";
import { AuditLog } from "../models/audit-log.model.js";
import { workspaceFilter } from "../utils/workspace.js";

export const auditRouter = Router();

auditRouter.get("/", async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || "100", 10) || 100, 1), 500);
    const logs = await AuditLog.find(workspaceFilter(req))
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    next(error);
  }
});
