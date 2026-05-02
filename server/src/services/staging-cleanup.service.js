import { ImportBatch } from "../models/import-batch.model.js";
import { SalesDataStaging } from "../models/sales-data-staging.model.js";

const STALE_STATUSES = ["mapping_pending", "staged", "quality_review"];

export async function cleanupAbandonedStagingBatches(now = new Date()) {
  const staleBatches = await ImportBatch.find({
    status: { $in: STALE_STATUSES },
    expiresAt: { $lte: now }
  }).select("_id workspaceId source status").lean();

  if (!staleBatches.length) {
    return { abandonedBatches: 0, deletedRows: 0 };
  }

  const ids = staleBatches.map((batch) => batch._id);
  const [batchUpdate, stagingDelete] = await Promise.all([
    ImportBatch.updateMany(
      { _id: { $in: ids }, status: { $in: STALE_STATUSES } },
      {
        $set: {
          status: "abandoned",
          abandonedAt: now
        }
      }
    ),
    SalesDataStaging.deleteMany({ importBatchId: { $in: ids } })
  ]);

  return {
    abandonedBatches: batchUpdate.modifiedCount || 0,
    deletedRows: stagingDelete.deletedCount || 0
  };
}

export function startStagingCleanupScheduler() {
  cleanupAbandonedStagingBatches().catch((error) => {
    console.error(`Staging cleanup failed: ${error.message}`);
  });

  const interval = setInterval(() => {
    cleanupAbandonedStagingBatches().catch((error) => {
      console.error(`Staging cleanup failed: ${error.message}`);
    });
  }, 60 * 60 * 1000);

  interval.unref?.();
  return interval;
}
