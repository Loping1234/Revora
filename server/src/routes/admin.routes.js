import { Router } from "express";
import { DemandModel } from "../models/demand-model.model.js";
import { ImportBatch } from "../models/import-batch.model.js";
import { ImportRowIssue } from "../models/import-row-issue.model.js";
import { Product } from "../models/product.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { SalesDataStaging } from "../models/sales-data-staging.model.js";
import { logAudit } from "../services/audit.service.js";
import { workspaceFilter } from "../utils/workspace.js";

export const adminRouter = Router();

async function getResetCounts(req) {
  const filter = workspaceFilter(req);
  const [salesRows, stagingRows, products, pricingInsights, recommendations, recommendationOutcomes, importBatches, importRowIssues] = await Promise.all([
    SalesData.countDocuments(filter),
    SalesDataStaging.countDocuments(filter),
    Product.countDocuments(filter),
    DemandModel.countDocuments(filter),
    Recommendation.countDocuments(filter),
    RecommendationOutcome.countDocuments(filter),
    ImportBatch.countDocuments(filter),
    ImportRowIssue.countDocuments(filter)
  ]);

  return {
    salesRows,
    stagingRows,
    products,
    pricingInsights,
    recommendations,
    recommendationOutcomes,
    importBatches,
    importRowIssues
  };
}

adminRouter.get("/reset-preview", async (req, res, next) => {
  try {
    res.json({
      success: true,
      data: {
        willDelete: await getResetCounts(req)
      }
    });
  } catch (error) {
    next(error);
  }
});

adminRouter.post("/reset-data", async (req, res, next) => {
  try {
    if (req.body?.confirm !== "RESET") {
      return res.status(400).json({
        success: false,
        error: { message: "Reset requires confirmation token RESET", statusCode: 400 }
      });
    }

    const preview = await getResetCounts(req);
    await logAudit(req, {
      action: "admin.reset_data",
      targetType: "Workspace",
      summary: "Workspace data reset requested",
      metadata: { willDelete: preview }
    });

    const filter = workspaceFilter(req);
    const [salesData, stagingData, products, demandModels, recommendations, recommendationOutcomes, importBatches, importRowIssues] = await Promise.all([
      SalesData.deleteMany(filter),
      SalesDataStaging.deleteMany(filter),
      Product.deleteMany(filter),
      DemandModel.deleteMany(filter),
      Recommendation.deleteMany(filter),
      RecommendationOutcome.deleteMany(filter),
      ImportBatch.deleteMany(filter),
      ImportRowIssue.deleteMany(filter)
    ]);

    res.json({
      success: true,
      data: {
        deleted: {
          salesRows: salesData.deletedCount || 0,
          stagingRows: stagingData.deletedCount || 0,
          products: products.deletedCount || 0,
          pricingInsights: demandModels.deletedCount || 0,
          recommendations: recommendations.deletedCount || 0,
          recommendationOutcomes: recommendationOutcomes.deletedCount || 0,
          importBatches: importBatches.deletedCount || 0,
          importRowIssues: importRowIssues.deletedCount || 0
        }
      }
    });
  } catch (error) {
    next(error);
  }
});
