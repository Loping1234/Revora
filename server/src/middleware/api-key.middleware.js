import { env } from "../config/env.js";

export function requireApiKey(req, res, next) {
  if (!env.apiKey) {
    return next();
  }

  const providedKey = req.header("x-api-key");

  if (providedKey !== env.apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Valid API key required",
        statusCode: 401
      }
    });
  }

  return next();
}
