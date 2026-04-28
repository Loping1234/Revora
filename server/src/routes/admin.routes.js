import { Router } from "express";
import { DemandModel } from "../models/demand-model.model.js";
import { ImportBatch } from "../models/import-batch.model.js";
import { ImportRowIssue } from "../models/import-row-issue.model.js";
import { Product } from "../models/product.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { SalesData } from "../models/sales-data.model.js";

export const adminRouter = Router();

adminRouter.post("/reset-data", async (req, res, next) => {
  try {
    if (req.body?.confirm !== "RESET") {
      return res.status(400).json({
        success: false,
        error: { message: "Reset requires confirmation token RESET", statusCode: 400 }
      });
    }

    const [salesData, products, demandModels, recommendations, recommendationOutcomes, importBatches, importRowIssues] = await Promise.all([
      SalesData.deleteMany({}),
      Product.deleteMany({}),
      DemandModel.deleteMany({}),
      Recommendation.deleteMany({}),
      RecommendationOutcome.deleteMany({}),
      ImportBatch.deleteMany({}),
      ImportRowIssue.deleteMany({})
    ]);

    res.json({
      success: true,
      data: {
        deleted: {
          salesRows: salesData.deletedCount || 0,
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
