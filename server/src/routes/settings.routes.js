import { Router } from "express";
import { requireAuth } from "../middleware/auth.middleware.js";
import { WorkspaceSettings } from "../models/workspace-settings.model.js";
import { logAudit } from "../services/audit.service.js";
import { getWorkspaceId, workspaceFilter } from "../utils/workspace.js";

export const settingsRouter = Router();

const DEFAULT_SETTINGS = {
  companyName: "Pricing Manager",
  currency: "USD",
  themeColor: "#020617",
  appearanceMode: "light",
  defaultObjective: "profit",
  reportName: "Pricing Recommendation Report"
};

async function getSettings(req) {
  const existing = await WorkspaceSettings.findOne(workspaceFilter(req)).lean();

  if (existing) {
    return existing;
  }

  const created = await WorkspaceSettings.create({
    ...DEFAULT_SETTINGS,
    workspaceId: getWorkspaceId(req)
  });
  return created.toObject();
}

settingsRouter.get("/", async (req, res, next) => {
  try {
    const settings = await getSettings(req);

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put("/", requireAuth(["admin"]), async (req, res, next) => {
  try {
    const updates = {
      companyName: req.body.companyName || DEFAULT_SETTINGS.companyName,
      currency: (req.body.currency || DEFAULT_SETTINGS.currency).toUpperCase(),
      themeColor: req.body.themeColor || DEFAULT_SETTINGS.themeColor,
      appearanceMode: req.body.appearanceMode || DEFAULT_SETTINGS.appearanceMode,
      defaultObjective: req.body.defaultObjective || DEFAULT_SETTINGS.defaultObjective,
      reportName: req.body.reportName || DEFAULT_SETTINGS.reportName
    };

    if (!["light", "dark"].includes(updates.appearanceMode)) {
      return res.status(400).json({
        success: false,
        error: { message: "appearanceMode must be light or dark", statusCode: 400 }
      });
    }

    if (!["profit", "revenue"].includes(updates.defaultObjective)) {
      return res.status(400).json({
        success: false,
        error: { message: "defaultObjective must be profit or revenue", statusCode: 400 }
      });
    }

    const settings = await WorkspaceSettings.findOneAndUpdate(workspaceFilter(req), {
      ...updates,
      workspaceId: getWorkspaceId(req)
    }, {
      new: true,
      upsert: true,
      runValidators: true
    }).lean();
    await logAudit(req, {
      action: "settings.updated",
      targetType: "WorkspaceSettings",
      targetId: settings?._id,
      summary: "Workspace settings updated",
      metadata: updates
    });

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});
