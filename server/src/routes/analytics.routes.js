import { Router } from "express";
import {
  getCompetitorMarketSummary,
  getCustomerSegmentSummary,
  getDashboardSummary,
  getDataQualitySummary,
  getInsightReadiness,
  getProductIntelligence,
  getProductRelationships,
  getRecommendationPerformance,
  getSeasonalitySummary
} from "../services/dashboard.service.js";
import { listImportBatches, setActiveImportBatch } from "../services/import-batch.service.js";
import { simulatePrice } from "../services/simulation.service.js";
import { logAudit } from "../services/audit.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";

export const analyticsRouter = Router();

analyticsRouter.get("/dashboard", async (req, res, next) => {
  try {
    const summary = await getDashboardSummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/insight-readiness", async (req, res, next) => {
  try {
    const readiness = await getInsightReadiness();

    res.json({
      success: true,
      data: readiness
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/data-quality", async (req, res, next) => {
  try {
    const summary = await getDataQualitySummary();

    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/import-batches", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: await listImportBatches()
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.put("/active-import-batch", requireAuth(["admin", "analyst"]), async (req, res, next) => {
  try {
    const settings = await setActiveImportBatch(req.body?.importBatchId || null);
    await logAudit(req, {
      action: "import_batch.active_changed",
      targetType: "ImportBatch",
      targetId: settings.activeImportBatchId,
      summary: settings.activeImportBatchId ? "Active import batch selected" : "Active import batch cleared",
      metadata: { activeImportBatchId: settings.activeImportBatchId || null }
    });

    res.json({
      success: true,
      data: {
        activeImportBatchId: settings.activeImportBatchId || null,
        message: settings.activeImportBatchId
          ? "Modeling will use the selected import batch."
          : "Modeling will use all imported sales rows."
      }
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/product-intelligence", async (req, res, next) => {
  try {
    const intelligence = await getProductIntelligence();

    res.json({
      success: true,
      data: intelligence
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/customer-segments", async (req, res, next) => {
  try {
    const segments = await getCustomerSegmentSummary();

    res.json({
      success: true,
      data: segments
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/competitor-market", async (req, res, next) => {
  try {
    const market = await getCompetitorMarketSummary();

    res.json({
      success: true,
      data: market
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/seasonality", async (req, res, next) => {
  try {
    const seasonality = await getSeasonalitySummary();

    res.json({
      success: true,
      data: seasonality
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/product-relationships", async (req, res, next) => {
  try {
    const relationships = await getProductRelationships();

    res.json({
      success: true,
      data: relationships
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.get("/recommendation-performance", async (req, res, next) => {
  try {
    const performance = await getRecommendationPerformance();

    res.json({
      success: true,
      data: performance
    });
  } catch (error) {
    next(error);
  }
});

analyticsRouter.post("/scenario-planner", requireAuth(["admin", "analyst"]), async (req, res, next) => {
  try {
    const { productId, segment = "all", prices = [], competitorPrice } = req.body || {};
    const parsedPrices = prices
      .map((price) => Number(price))
      .filter((price) => Number.isFinite(price) && price > 0)
      .slice(0, 3);

    if (!productId) {
      throw new Error("Choose a product before planning scenarios.");
    }

    if (!parsedPrices.length) {
      throw new Error("Enter at least one scenario price greater than zero.");
    }

    const scenarios = await Promise.all(parsedPrices.map((price) => simulatePrice({ productId, segment, price, competitorPrice })));

    res.json({
      success: true,
      data: {
        product: scenarios[0]?.product || null,
        segment,
        segmentLabel: scenarios[0]?.segmentLabel,
        scenarios: scenarios.map((scenario, index) => ({
          label: `Scenario ${index + 1}`,
          price: scenario.inputPrice,
          expectedDemand: scenario.expectedDemand,
          expectedRevenue: scenario.expectedRevenue,
          expectedProfit: scenario.expectedProfit,
          priceSensitivity: scenario.priceSensitivity,
          confidence: scenario.confidence,
          modelReliabilityLabel: scenario.modelReliabilityLabel,
          modelReliabilityReasons: scenario.modelReliabilityReasons,
          evidenceSummary: scenario.evidenceSummary,
          profitUsesEstimatedCost: scenario.profitUsesEstimatedCost,
          recommendationStatus: scenario.recommendationStatus,
          decisionLabel: scenario.decisionLabel,
          resultReliability: scenario.resultReliability,
          warnings: scenario.warnings || [],
          calculationBreakdown: scenario.calculationBreakdown,
          demandWorking: scenario.demandWorking,
          predictionRange: scenario.predictionRange,
          modelBased: scenario.modelBased !== false,
          resultMode: scenario.resultMode || "Price Response Model"
        })),
        decisionSupported: "Compare a few possible prices side by side before choosing which one deserves a formal recommendation."
      }
    });
  } catch (error) {
    next(error);
  }
});
