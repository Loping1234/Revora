import { Router } from "express";
import mongoose from "mongoose";
import { Recommendation } from "../models/recommendation.model.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { logAudit } from "../services/audit.service.js";
import { applyRecommendation, getRecommendationOutcome } from "../services/recommendation-outcome.service.js";
import { recommendPrice } from "../services/recommendation.service.js";
import { formatSegmentLabel } from "../utils/segments.js";
import { workspaceFilter } from "../utils/workspace.js";

export const recommendationRouter = Router();

recommendationRouter.post("/", requireAuth(["admin", "analyst"]), async (req, res, next) => {
  try {
    const { productId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: { message: "productId must be a valid product id", statusCode: 400 }
      });
    }

    const recommendation = await recommendPrice({ ...req.body, workspaceId: req.workspaceId });
    await logAudit(req, {
      action: "recommendation.created",
      targetType: "Recommendation",
      targetId: recommendation._id,
      summary: `Recommendation created for ${recommendation.product?.name || "product"}`,
      metadata: {
        productId,
        objective: recommendation.objective,
        recommendedPrice: recommendation.recommendedPrice
      }
    });

    res.status(201).json({
      success: true,
      data: recommendation
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    next(error);
  }
});

recommendationRouter.get("/", async (req, res, next) => {
  try {
    const query = workspaceFilter(req, { datasetStatus: "active" });

    if (req.query.productId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.productId)) {
        return res.status(400).json({
          success: false,
          error: { message: "productId must be a valid product id", statusCode: 400 }
        });
      }
      query.productId = req.query.productId;
    }

    if (req.query.segment) {
      query.segment = req.query.segment;
    }

    const recommendations = await Recommendation.find(query).sort({ createdAt: -1 }).limit(100).populate("productId", "name sku category").lean();

    res.json({
      success: true,
      data: recommendations.map((item) => ({
        ...item,
        segmentLabel: formatSegmentLabel(item.segment),
        product: item.productId,
        productId: item.productId?._id || item.productId
      }))
    });
  } catch (error) {
    next(error);
  }
});

recommendationRouter.post("/:id/apply", requireAuth(["admin", "manager"]), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: { message: "recommendation id must be valid", statusCode: 400 }
      });
    }

    const outcome = await applyRecommendation({
      recommendationId: req.params.id,
      appliedPrice: req.body.appliedPrice,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      expectedTarget: req.body.expectedTarget,
      notes: req.body.notes,
      workspaceId: req.workspaceId
    });
    await logAudit(req, {
      action: "recommendation.applied",
      targetType: "Recommendation",
      targetId: req.params.id,
      summary: "Recommendation applied/measured",
      metadata: {
        appliedPrice: req.body.appliedPrice,
        startDate: req.body.startDate,
        endDate: req.body.endDate
      }
    });

    res.json({
      success: true,
      data: outcome
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    next(error);
  }
});

recommendationRouter.get("/:id/outcome", async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        error: { message: "recommendation id must be valid", statusCode: 400 }
      });
    }

    res.json({
      success: true,
      data: await getRecommendationOutcome(req.params.id, req.workspaceId)
    });
  } catch (error) {
    next(error);
  }
});
