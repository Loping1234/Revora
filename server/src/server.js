import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { env } from "./config/env.js";

connectDatabase();

app.listen(env.port, () => {
  console.log(`API server listening on http://localhost:${env.port}`);
});
