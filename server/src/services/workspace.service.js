import { AuditLog } from "../models/audit-log.model.js";
import { DemandModel } from "../models/demand-model.model.js";
import { ImportBatch } from "../models/import-batch.model.js";
import { ImportRowIssue } from "../models/import-row-issue.model.js";
import { Product } from "../models/product.model.js";
import { RecommendationOutcome } from "../models/recommendation-outcome.model.js";
import { Recommendation } from "../models/recommendation.model.js";
import { SalesData } from "../models/sales-data.model.js";
import { WorkspaceSettings } from "../models/workspace-settings.model.js";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";

const WORKSPACE_MODELS = [
  Product,
  SalesData,
  DemandModel,
  Recommendation,
  RecommendationOutcome,
  ImportBatch,
  ImportRowIssue,
  WorkspaceSettings,
  AuditLog
];

export async function backfillDefaultWorkspace() {
  await Promise.all(
    WORKSPACE_MODELS.map((model) =>
      model.updateMany(
        {
          $or: [
            { workspaceId: { $exists: false } },
            { workspaceId: null },
            { workspaceId: "" }
          ]
        },
        { $set: { workspaceId: DEFAULT_WORKSPACE_ID } }
      )
    )
  );
}
