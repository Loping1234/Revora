import { Router } from "express";
import { Recommendation } from "../models/recommendation.model.js";
import { logAudit } from "../services/audit.service.js";
import {
  buildDashboardWorkbook,
  buildExaminerWorkbook,
  buildPricingInsightsWorkbook,
  buildProductsWorkbook,
  buildRecommendationsWorkbook,
  buildSalesDataWorkbook,
  sendWorkbook
} from "../services/excel-report.service.js";
import { workspaceFilter } from "../utils/workspace.js";

export const reportRouter = Router();

function escapeCsv(value) {
  const text = value === undefined || value === null ? "" : String(value);

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }

  return text;
}

reportRouter.get("/recommendations.csv", async (req, res, next) => {
  try {
    const recommendations = await Recommendation.find(workspaceFilter(req, { datasetStatus: "active" })).sort({ createdAt: -1 }).limit(500).populate("productId", "name sku category").lean();
    const headers = [
      "Created At",
      "Product",
      "SKU",
      "Category",
      "Customer Segment",
      "Goal",
      "Current Price",
      "Recommended Price",
      "Estimated Demand",
      "Estimated Revenue",
      "Estimated Profit",
      "Estimated Improvement Range",
      "Model Reliability",
      "Profit Uses Estimated Cost",
      "Warnings",
      "Guardrails",
      "Calculation Steps",
      "Explanation"
    ];
    const rows = recommendations.map((item) => [
      item.createdAt?.toISOString?.() || item.createdAt,
      item.productId?.name,
      item.productId?.sku,
      item.productId?.category,
      item.segment,
      item.objective,
      item.basePrice,
      item.recommendedPrice,
      item.expectedDemand,
      item.expectedRevenue,
      item.expectedProfit,
      item.estimatedImprovementRange ? `${item.estimatedImprovementRange.low}% to ${item.estimatedImprovementRange.high}%` : item.improvementPercent,
      item.modelReliabilityLabel || item.confidence,
      item.profitUsesEstimatedCost ? "Yes" : "No",
      item.warnings?.join(" | "),
      item.guardrailWarnings?.join(" | "),
      item.calculationSteps?.join(" | "),
      item.explanation
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=pricing-recommendations.csv");
    await logAudit(req, {
      action: "report.exported",
      targetType: "Report",
      summary: "Recommendation CSV exported",
      metadata: { reportType: "recommendations.csv", rows: recommendations.length }
    });
    res.send(csv);
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/import-summary.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildSalesDataWorkbook(req.query.source);
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Upload intelligence workbook exported", metadata: { reportType: "import-summary.xlsx" } });
    await sendWorkbook(res, workbook, "upload-intelligence-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/dashboard.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildDashboardWorkbook();
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Dashboard workbook exported", metadata: { reportType: "dashboard.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-dashboard-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/products.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildProductsWorkbook();
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Products workbook exported", metadata: { reportType: "products.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-products-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/sales-data.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildSalesDataWorkbook();
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Sales data workbook exported", metadata: { reportType: "sales-data.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-sales-data-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/pricing-insights.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildPricingInsightsWorkbook();
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Pricing insights workbook exported", metadata: { reportType: "pricing-insights.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-insights-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/recommendations.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildRecommendationsWorkbook(false);
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Recommendations workbook exported", metadata: { reportType: "recommendations.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-recommendations-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/recommendation-history.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildRecommendationsWorkbook(true);
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Recommendation history workbook exported", metadata: { reportType: "recommendation-history.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-recommendation-history-report.xlsx");
  } catch (error) {
    next(error);
  }
});

reportRouter.get("/examiner-workbook.xlsx", async (req, res, next) => {
  try {
    const workbook = await buildExaminerWorkbook();
    await logAudit(req, { action: "report.exported", targetType: "Report", summary: "Examiner workbook exported", metadata: { reportType: "examiner-workbook.xlsx" } });
    await sendWorkbook(res, workbook, "pricing-examiner-workbook.xlsx");
  } catch (error) {
    next(error);
  }
});
