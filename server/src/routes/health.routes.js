import { Router } from "express";
import { getDatabaseStatus } from "../config/db.js";

export const healthRouter = Router();

healthRouter.get("/", (req, res) => {
  const database = getDatabaseStatus();

  res.json({
    success: true,
    service: "dynamic-pricing-api",
    environment: process.env.NODE_ENV || "development",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database
  });
});
