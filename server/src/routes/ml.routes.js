import { Router } from "express";
import { getMlDecisionQualitySummary, predictMlDecisionQuality } from "../services/ml-decision.service.js";

export const mlRouter = Router();

mlRouter.get("/decision-quality/summary", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await getMlDecisionQualitySummary()
    });
  } catch (error) {
    next(error);
  }
});

mlRouter.post("/decision-quality/predict", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await predictMlDecisionQuality(req.body || {})
    });
  } catch (error) {
    next(error);
  }
});
