import mongoose from "mongoose";
import { ImportBatch } from "../models/import-batch.model.js";
import { WorkspaceSettings } from "../models/workspace-settings.model.js";

const DEFAULT_SETTINGS = {
  companyName: "Pricing Manager",
  currency: "USD",
  themeColor: "#020617",
  appearanceMode: "light",
  defaultObjective: "profit",
  reportName: "Pricing Recommendation Report"
};

function normalizeBatchId(value) {
  if (!value) return null;
  const id = String(value);
  return mongoose.Types.ObjectId.isValid(id) ? id : null;
}

export async function getActiveImportBatchId() {
  const settings = await WorkspaceSettings.findOne().select("activeImportBatchId").lean();
  return normalizeBatchId(settings?.activeImportBatchId);
}

export async function getActiveImportBatchFilter() {
  const activeImportBatchId = await getActiveImportBatchId();
  return activeImportBatchId ? { importBatchId: new mongoose.Types.ObjectId(activeImportBatchId) } : {};
}

export async function setActiveImportBatch(importBatchId) {
  const normalizedId = normalizeBatchId(importBatchId);

  if (importBatchId && !normalizedId) {
    const error = new Error("active import batch id must be valid");
    error.statusCode = 400;
    throw error;
  }

  if (normalizedId) {
    const batch = await ImportBatch.findById(normalizedId).lean();

    if (!batch) {
      const error = new Error("Import batch not found");
      error.statusCode = 404;
      throw error;
    }
  }

  const settings = await WorkspaceSettings.findOneAndUpdate(
    {},
    {
      $set: { activeImportBatchId: normalizedId ? new mongoose.Types.ObjectId(normalizedId) : null },
      $setOnInsert: DEFAULT_SETTINGS
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  return settings;
}

export async function setLatestImportBatchActive(importBatchId) {
  const normalizedId = normalizeBatchId(importBatchId);

  if (!normalizedId) return null;

  await WorkspaceSettings.findOneAndUpdate(
    {},
    {
      $set: { activeImportBatchId: new mongoose.Types.ObjectId(normalizedId) },
      $setOnInsert: DEFAULT_SETTINGS
    },
    { new: true, upsert: true, runValidators: true }
  );

  return normalizedId;
}

export async function listImportBatches() {
  const [activeImportBatchId, batches] = await Promise.all([
    getActiveImportBatchId(),
    ImportBatch.find().sort({ createdAt: -1 }).limit(25).lean()
  ]);

  return {
    activeImportBatchId,
    batches: batches.map((batch) => ({
      _id: batch._id,
      source: batch.source,
      status: batch.status,
      createdAt: batch.createdAt,
      completedAt: batch.completedAt,
      rowCounts: batch.rowCounts || {},
      productSummary: batch.productSummary || {},
      dataFitnessScore: batch.dataFitnessScore,
      dataFitnessLabel: batch.dataFitnessLabel,
      datasetWarnings: batch.datasetWarnings || [],
      active: activeImportBatchId ? String(batch._id) === String(activeImportBatchId) : false
    }))
  };
}
