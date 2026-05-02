import { Router } from "express";
import { DemandModel } from "../models/demand-model.model.js";
import { Product } from "../models/product.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { requireApiKey } from "../middleware/api-key.middleware.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { assessReadinessSummary } from "../services/dashboard.service.js";
import { logAudit } from "../services/audit.service.js";
import { getDuplicateEvidence } from "../utils/product-matching.js";
import { getWorkspaceId, workspaceFilter } from "../utils/workspace.js";

export const productRouter = Router();

function findDuplicateProducts(products) {
  const duplicates = [];

  for (let leftIndex = 0; leftIndex < products.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < products.length; rightIndex += 1) {
      const left = products[leftIndex];
      const right = products[rightIndex];
      const match = getDuplicateEvidence(left, right);

      if (!match) continue;

      const evidence = {
        sharedIdentity: match.exactIdentityMatch,
        sameCategory: true,
        nameSimilarity: Number(match.textScore.toFixed(3)),
        tokenOverlap: Number(match.overlap.toFixed(3)),
        priceRangeSimilarity: Number(match.priceScore.toFixed(3)),
        sharedTokens: match.sharedNameTokens
      };
      const confidenceReasons = [
        "Same category",
        ...(match.exactIdentityMatch ? ["Exact SKU or external product ID match"] : []),
        ...(match.textScore >= 0.94 ? ["Very similar product name"] : []),
        ...(match.overlap >= 0.75 && match.sharedNameTokens.length > 0 ? [`Shared token${match.sharedNameTokens.length === 1 ? "" : "s"}: ${match.sharedNameTokens.join(", ")}`] : []),
        ...(match.priceScore > 0 ? ["Similar base price range (supporting evidence only)"] : [])
      ];

      duplicates.push({
        masterCandidate: left,
        duplicateCandidate: right,
        reviewScore: Number(match.reviewScore.toFixed(3)),
        score: Number(match.reviewScore.toFixed(3)),
        decision: match.exactIdentityMatch ? "Exact identity match" : "Manual review only",
        reason: match.exactIdentityMatch ? "Exact identity match" : "Manual review only",
        evidence,
        confidenceReasons
      });
    }
  }

  return duplicates.sort((left, right) => right.reviewScore - left.reviewScore).slice(0, 50);
}

productRouter.get("/", async (req, res, next) => {
  try {
    const filter = workspaceFilter(req, { datasetStatus: "active" });
    const products = await Product.find(filter).sort({ name: 1 }).lean();
    const salesCounts = await SalesData.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$productId",
          salesRecords: { $sum: 1 },
          distinctPrices: { $addToSet: "$price" },
          zeroQuantityRows: { $sum: { $cond: [{ $eq: ["$quantity", 0] }, 1, 0] } },
          costRows: { $sum: { $cond: [{ $ne: ["$cost", null] }, 1, 0] } },
          competitorRows: { $sum: { $cond: [{ $ne: ["$competitorPrice", null] }, 1, 0] } },
          belowCostRows: { $sum: { $cond: [{ $lt: ["$price", "$cost"] }, 1, 0] } },
          stockoutRows: { $sum: { $cond: [{ $or: [{ $eq: ["$inventory", 0] }, { $eq: ["$stockoutFlag", true] }] }, 1, 0] } }
        }
      }
    ]);
    const modelCounts = await DemandModel.aggregate([
      { $match: filter },
      { $group: { _id: "$productId", fittedModels: { $sum: 1 } } }
    ]);
    const countMap = new Map(salesCounts.map((item) => [String(item._id), item]));
    const modelCountMap = new Map(modelCounts.map((item) => [String(item._id), item.fittedModels]));

    res.json({
      success: true,
      data: products.map((product) => ({
        ...product,
        salesRecords: countMap.get(String(product._id))?.salesRecords || 0,
        readiness: assessReadinessSummary({
          records: countMap.get(String(product._id))?.salesRecords || 0,
          distinctPrices: countMap.get(String(product._id))?.distinctPrices?.length || 0,
          zeroQuantityRows: countMap.get(String(product._id))?.zeroQuantityRows || 0,
          costRows: countMap.get(String(product._id))?.costRows || 0,
          competitorRows: countMap.get(String(product._id))?.competitorRows || 0,
          belowCostRows: countMap.get(String(product._id))?.belowCostRows || 0,
          stockoutRows: countMap.get(String(product._id))?.stockoutRows || 0
        }),
        fittedModels: modelCountMap.get(String(product._id)) || 0
      }))
    });
  } catch (error) {
    next(error);
  }
});

productRouter.get("/duplicates", async (req, res, next) => {
  try {
    const products = await Product.find(workspaceFilter(req, { datasetStatus: "active" })).sort({ category: 1, name: 1 }).lean();

    res.json({
      success: true,
      data: {
        duplicates: findDuplicateProducts(products),
        totalProducts: products.length
      }
    });
  } catch (error) {
    next(error);
  }
});

productRouter.post("/merge", requireApiKey, requireAuth(["admin"]), async (req, res, next) => {
  try {
    const { masterProductId, duplicateProductId } = req.body || {};

    if (!masterProductId || !duplicateProductId || masterProductId === duplicateProductId) {
      return res.status(400).json({
        success: false,
        error: { message: "Provide different masterProductId and duplicateProductId values.", statusCode: 400 }
      });
    }

    const [master, duplicate] = await Promise.all([
      Product.findOne({ _id: masterProductId, workspaceId: getWorkspaceId(req), datasetStatus: "active" }),
      Product.findOne({ _id: duplicateProductId, workspaceId: getWorkspaceId(req), datasetStatus: "active" })
    ]);

    if (!master || !duplicate) {
      return res.status(404).json({
        success: false,
        error: { message: "Master or duplicate product not found.", statusCode: 404 }
      });
    }

    await SalesData.updateMany(workspaceFilter(req, { productId: duplicate._id }), {
      productId: master._id,
      "productSnapshot.sku": master.sku,
      "productSnapshot.name": master.name,
      "productSnapshot.category": master.category
    });
    await DemandModel.updateMany(workspaceFilter(req, { productId: duplicate._id }), { productId: master._id });
    await Recommendation.updateMany(workspaceFilter(req, { productId: duplicate._id }), { productId: master._id });
    await RecommendationOutcome.updateMany(workspaceFilter(req, { productId: duplicate._id }), { productId: master._id });
    master.aliases = [...new Set([...(master.aliases || []), duplicate.name, duplicate.sku, ...(duplicate.aliases || [])].filter(Boolean))];
    master.externalProductIds = [...new Set([...(master.externalProductIds || []), ...(duplicate.externalProductIds || [])].filter(Boolean))];
    master.matchConfidence = Math.max(Number(master.matchConfidence || 0), Number(duplicate.matchConfidence || 0), 0.95);
    await master.save();
    await Product.findByIdAndDelete(duplicate._id);
    await logAudit(req, {
      action: "product.merged",
      targetType: "Product",
      targetId: master._id,
      summary: `Merged ${duplicate.name} into ${master.name}`,
      metadata: { duplicateProductId }
    });

    res.json({
      success: true,
      data: {
        masterProduct: master,
        mergedProductId: duplicateProductId,
        message: "Duplicate product merged into master product."
      }
    });
  } catch (error) {
    next(error);
  }
});

productRouter.post("/", requireApiKey, requireAuth(["admin"]), async (req, res, next) => {
  try {
    const product = await Product.create({
      name: req.body.name,
      sku: req.body.sku,
      category: req.body.category,
      basePrice: req.body.basePrice,
      cost: req.body.cost,
      inventory: req.body.inventory,
      workspaceId: getWorkspaceId(req),
      datasetStatus: "active"
    });
    await logAudit(req, {
      action: "product.created",
      targetType: "Product",
      targetId: product._id,
      summary: `Product created: ${product.name}`
    });

    res.status(201).json({
      success: true,
      data: product
    });
  } catch (error) {
    next(error);
  }
});

productRouter.get("/:productId/sales", async (req, res, next) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page || "1", 10), 1);
    const requestedLimit = Number.parseInt(req.query.limit || "100", 10);
    const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? requestedLimit : 100, 1), 500);
    const skip = (page - 1) * limit;
    const query = workspaceFilter(req, { productId: req.params.productId, datasetStatus: "active" });
    const sales = await SalesData.find(query)
      .sort({ date: 1, customerSegment: 1 })
      .skip(skip)
      .limit(limit)
      .lean();
    const totalCount = await SalesData.countDocuments(query);

    res.json({
      success: true,
      data: sales,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / limit)),
        hasNextPage: skip + sales.length < totalCount,
        hasPreviousPage: page > 1
      }
    });
  } catch (error) {
    next(error);
  }
});
