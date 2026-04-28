import { Router } from "express";
import { WorkspaceSettings } from "../models/workspace-settings.model.js";

export const settingsRouter = Router();

const DEFAULT_SETTINGS = {
  companyName: "Pricing Manager",
  currency: "USD",
  themeColor: "#020617",
  appearanceMode: "light",
  defaultObjective: "profit",
  reportName: "Pricing Recommendation Report"
};

async function getSettings() {
  const existing = await WorkspaceSettings.findOne().lean();

  if (existing) {
    return existing;
  }

  const created = await WorkspaceSettings.create(DEFAULT_SETTINGS);
  return created.toObject();
}

settingsRouter.get("/", async (req, res, next) => {
  try {
    const settings = await getSettings();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put("/", async (req, res, next) => {
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

    const settings = await WorkspaceSettings.findOneAndUpdate({}, updates, {
      new: true,
      upsert: true,
      runValidators: true
    }).lean();

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    next(error);
  }
});
