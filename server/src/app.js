import cors from "cors";
import express from "express";
import morgan from "morgan";
import { env } from "./config/env.js";
import { requireApiKey } from "./middleware/api-key.middleware.js";
import { requireAuth } from "./middleware/auth.middleware.js";
import { errorHandler, notFoundHandler } from "./middleware/error.middleware.js";
import { adminRouter } from "./routes/admin.routes.js";
import { analyticsRouter } from "./routes/analytics.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { healthRouter } from "./routes/health.routes.js";
import { ingestRouter } from "./routes/ingest.routes.js";
import { modelRouter } from "./routes/model.routes.js";
import { productRouter } from "./routes/product.routes.js";
import { recommendationRouter } from "./routes/recommendation.routes.js";
import { reportRouter } from "./routes/report.routes.js";
import { settingsRouter } from "./routes/settings.routes.js";
import { uploadRouter } from "./routes/upload.routes.js";

export const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());
app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Dynamic Pricing & Demand Intelligence API"
  });
});

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/admin", requireApiKey, requireAuth(["admin"]), adminRouter);
app.use("/", modelRouter);
app.use("/analytics", requireApiKey, requireAuth(["admin", "analyst"]), analyticsRouter);
app.use("/api/ingest", requireApiKey, requireAuth(["admin"]), ingestRouter);
app.use("/products", productRouter);
app.use("/recommendations", requireApiKey, requireAuth(["admin", "analyst"]), recommendationRouter);
app.use("/reports", requireApiKey, requireAuth(["admin", "analyst"]), reportRouter);
app.use("/settings", requireApiKey, requireAuth(["admin"]), settingsRouter);
app.use("/upload", requireApiKey, requireAuth(["admin"]), uploadRouter);

app.use(notFoundHandler);
app.use(errorHandler);
