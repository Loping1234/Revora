import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";
import { startStagingCleanupScheduler } from "./services/staging-cleanup.service.js";
import { ensureDefaultUsers } from "./services/user.service.js";
import { backfillDefaultWorkspace } from "./services/workspace.service.js";

await connectDatabase();
if (process.env.SKIP_BOOTSTRAP !== "true") {
  try {
    await backfillDefaultWorkspace();
    await ensureDefaultUsers();
  } catch (error) {
    console.error(`Startup bootstrap failed: ${error.message}`);
  }
}
startStagingCleanupScheduler();

app.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
});
 
