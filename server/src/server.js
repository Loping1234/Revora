import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { startStagingCleanupScheduler } from "./services/staging-cleanup.service.js";
import { ensureDefaultUsers } from "./services/user.service.js";
import { backfillDefaultWorkspace } from "./services/workspace.service.js";

const databaseConnected = await connectDatabase();
if (databaseConnected && process.env.SKIP_BOOTSTRAP !== "true") {
  try {
    await backfillDefaultWorkspace();
    await ensureDefaultUsers();
  } catch (error) {
    console.error(`Startup bootstrap failed: ${error.message}`);
  }
} else if (!databaseConnected) {
  console.warn("Startup bootstrap skipped because MongoDB is not connected.");
}
startStagingCleanupScheduler();

app.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
});
 
