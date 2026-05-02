import { Router } from "express";
import mongoose from "mongoose";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireApiKey } from "../middleware/api-key.middleware.js";
import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { logAudit } from "../services/audit.service.js";
import { fitDemandModel, getInsightSummary, isSupportedSegment } from "../services/demand-model.service.js";
import { simulatePrice } from "../services/simulation.service.js";
import { formatSegmentLabel } from "../utils/segments.js";
import { workspaceFilter } from "../utils/workspace.js";

export const modelRouter = Router();

modelRouter.post("/fit-model", requireApiKey, requireAuth(["admin", "analyst"]), async (req, res, next) => {
  try {
    const { productId, segment = "all" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: { message: "productId must be a valid product id", statusCode: 400 }
      });
    }

    if (!isSupportedSegment(segment)) {
      return res.status(400).json({
        success: false,
        error: { message: "segment must be all or an imported customer group", statusCode: 400 }
      });
    }

    const product = await Product.findOne(workspaceFilter(req, { _id: productId, datasetStatus: "active" })).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: "Product not found", statusCode: 404 }
      });
    }

    const summary = await getInsightSummary({ productId, segment });
    const model = await fitDemandModel({ productId, segment });
    await logAudit(req, {
      action: "model.fitted",
      targetType: "DemandModel",
      targetId: model._id,
      summary: `Pricing model fitted for ${product.name}`,
      metadata: { productId, segment, modelType: model.modelType }
    });

    res.json({
      success: true,
      data: {
        ...model,
        resultMode: "Price Response Model",
        canFitModel: true,
        canShowSummary: true,
        blockingReasons: [],
        summaryMetrics: summary.summaryMetrics,
        segmentLabel: formatSegmentLabel(model.segment),
        product: {
          _id: product._id,
          name: product.name,
          sku: product.sku
        }
      }
    });
  } catch (error) {
    if (error.insightSummary && req.body?.productId && mongoose.Types.ObjectId.isValid(req.body.productId)) {
      const product = await Product.findOne(workspaceFilter(req, { _id: req.body.productId, datasetStatus: "active" })).lean();
      return res.json({
        success: true,
        data: {
          ...error.insightSummary,
          segment: req.body.segment || "all",
          segmentLabel: formatSegmentLabel(req.body.segment || "all"),
          message: error.message,
          product: product ? {
            _id: product._id,
            name: product.name,
            sku: product.sku
          } : undefined
        }
      });
    }

    error.statusCode = error.statusCode || 400;
    next(error);
  }
});

modelRouter.get("/models", requireApiKey, requireAuth(["admin", "analyst"]), async (req, res, next) => {
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

    const models = await DemandModel.find(query).sort({ updatedAt: -1 }).lean();

    res.json({
      success: true,
      data: models
    });
  } catch (error) {
    next(error);
  }
});

modelRouter.get("/models/compare", requireApiKey, requireAuth(["admin", "analyst"]), async (req, res, next) => {
  try {
    const { productId, segment = "all" } = req.query;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: { message: "productId must be a valid product id", statusCode: 400 }
      });
    }

    const product = await Product.findOne(workspaceFilter(req, { _id: productId, datasetStatus: "active" })).lean();

    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: "Product not found", statusCode: 404 }
      });
    }

    const model = await fitDemandModel({ productId, segment });

    res.json({
      success: true,
      data: {
        product: {
          _id: product._id,
          name: product.name,
          sku: product.sku,
          category: product.category
        },
        segment,
        segmentLabel: formatSegmentLabel(segment),
        selectedModel: model.modelType,
        modelFamily: model.modelFamily,
        readinessLevel: model.readinessLevel,
        readinessDetails: model.readinessDetails,
        accuracyMetrics: model.accuracyMetrics,
        backtestMetrics: model.backtestMetrics || model.accuracyMetrics,
        dataFitnessScore: model.dataFitnessScore,
        dataFitnessLabel: model.dataFitnessLabel,
        businessRiskLevel: model.businessRiskLevel,
        costQuality: model.costQuality,
        predictionIntervals: model.predictionIntervals,
        blockedReasons: model.blockedReasons,
        mlReadiness: model.mlReadiness,
        featuresUsed: model.featuresUsed,
        featureImportance: model.featureImportance,
        modelComparison: model.modelComparison,
        limitations: model.limitations,
        warnings: model.warnings
      }
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    next(error);
  }
});

modelRouter.post("/simulate", requireApiKey, requireAuth(["admin", "analyst"]), async (req, res, next) => {
  try {
    const { productId, price, competitorPrice, segment = "all" } = req.body;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({
        success: false,
        error: { message: "productId must be a valid product id", statusCode: 400 }
      });
    }

    const product = await Product.findOne(workspaceFilter(req, { _id: productId, datasetStatus: "active" })).lean();
    if (!product) {
      return res.status(404).json({
        success: false,
        error: { message: "Product not found", statusCode: 404 }
      });
    }

    const result = await simulatePrice({ productId, price, competitorPrice, segment });
    await logAudit(req, {
      action: "simulation.run",
      targetType: "Product",
      targetId: productId,
      summary: "Price simulation run",
      metadata: { productId, segment, price, competitorPrice }
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    error.statusCode = error.statusCode || 400;
    next(error);
  }
});
