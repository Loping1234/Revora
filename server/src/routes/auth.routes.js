import { Router } from "express";
import { logAudit } from "../services/audit.service.js";
import { verifyPassword } from "../services/password.service.js";
import { findLoginUser } from "../services/user.service.js";
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "../utils/token.js";

export const authRouter = Router();

function publicUser(user) {
  return {
    id: String(user._id || user.id || ""),
    name: user.name,
    role: user.role,
    workspaceId: user.workspaceId
  };
}

authRouter.post("/login", async (req, res, next) => {
  try {
    const role = String(req.body?.role || "").toLowerCase();
    const password = String(req.body?.password || "");
    const user = await findLoginUser(role);

    if (!user || !verifyPassword(password, user.passwordSalt, user.passwordHash)) {
      await logAudit(req, {
        action: "auth.login_failed",
        targetType: "User",
        summary: `Failed login attempt for role ${role || "unknown"}`,
        metadata: { role }
      });
      return res.status(401).json({
        success: false,
        error: {
          message: "Invalid role or password",
          statusCode: 401
        }
      });
    }

    const token = createSessionToken({
      id: String(user._id),
      name: user.name,
      role: user.role,
      workspaceId: user.workspaceId
    });
    const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();

    user.lastLoginAt = new Date();
    await user.save();
    req.user = publicUser(user);
    req.workspaceId = user.workspaceId;
    await logAudit(req, {
      action: "auth.login_success",
      targetType: "User",
      targetId: user._id,
      summary: `${user.name} signed in as ${user.role}`
    });

    return res.json({
      success: true,
      data: {
        token,
        expiresAt,
        user: publicUser(user)
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", (req, res) => {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const user = verifySessionToken(token);

  if (!user) {
    return res.status(401).json({
      success: false,
      error: {
        message: "Login expired",
        statusCode: 401
      }
    });
  }

  return res.json({
    success: true,
    data: {
      user: publicUser(user),
      expiresAt: user.exp ? new Date(user.exp * 1000).toISOString() : null
    }
  });
});
