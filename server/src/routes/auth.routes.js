import { Router } from "express";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { createSessionToken } from "../utils/token.js";

export const authRouter = Router();

const users = {
  admin: {
    name: "Admin User",
    role: "admin",
    passwordHash: env.auth.adminPasswordHash || hashPassword(env.auth.adminPassword, "admin")
  },
  analyst: {
    name: "Analyst User",
    role: "analyst",
    passwordHash: env.auth.analystPasswordHash || hashPassword(env.auth.analystPassword, "analyst")
  }
};

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password || ""), `dp-di-${salt}`, 32).toString("hex");
}

function verifyPassword(password, salt, expectedHash) {
  const actualHash = hashPassword(password, salt);
  const actual = Buffer.from(actualHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

authRouter.post("/login", (req, res) => {
  const role = String(req.body?.role || "").toLowerCase();
  const password = String(req.body?.password || "");
  const user = users[role];

  if (!user || !verifyPassword(password, role, user.passwordHash)) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Invalid role or password",
        statusCode: 401
      }
    });
  }

  const token = createSessionToken({
    name: user.name,
    role: user.role
  });

  return res.json({
    success: true,
    data: {
      token,
      user: {
        name: user.name,
        role: user.role
      }
    }
  });
});
