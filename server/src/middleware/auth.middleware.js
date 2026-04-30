import { verifySessionToken } from "../utils/token.js";

export function requireAuth(allowedRoles = ["admin", "analyst"]) {
  return (req, res, next) => {
    const header = req.header("authorization") || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const user = verifySessionToken(token);

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message: "Login required",
          statusCode: 401
        }
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          message: "You do not have permission for this action",
          statusCode: 403
        }
      });
    }

    req.user = user;
    req.workspaceId = user.workspaceId || "default-workspace";
    return next();
  };
}
