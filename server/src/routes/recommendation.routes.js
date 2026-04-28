import { Router } from "express";
import mongoose from "mongoose";
import { Recommendation } from "../models/recommendation.model.js";
import { applyRecommendation, getRecommendationOutcome } from "../services/recommendation-outcome.service.js";
import { recommendPrice } from "../services/recommendation.service.js";
import { formatSegmentLabel } from "../utils/segments.js";

export const recommendationRouter = Router();

recommendationRouter.post("/", async (req, res, next) => {
  try {
    const { productId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: { message: "productId must be a valid product id", statusCode: 400 }
      });
    }

    const recommendation = await recommendPrice(req.body);

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
    const query = {};

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

recommendationRouter.post("/:id/apply", async (req, res, next) => {
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
      notes: req.body.notes
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
      data: await getRecommendationOutcome(req.params.id)
    });
  } catch (error) {
    next(error);
  }
});
