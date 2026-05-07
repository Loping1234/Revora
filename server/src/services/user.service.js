import { env } from "../config/env.js";
import { assertDatabaseConnected } from "../config/db.js";
import { User } from "../models/user.model.js";
import { DEFAULT_WORKSPACE_ID } from "../utils/workspace.js";
import { hashPassword } from "./password.service.js";

const DEFAULT_USERS = [
  { role: "admin", name: "Admin User", password: () => env.auth.adminPassword || "admin123" },
  { role: "analyst", name: "Analyst User", password: () => env.auth.analystPassword || "analyst123" },
  { role: "manager", name: "Manager User", password: () => env.auth.managerPassword || "manager123" }
];

export async function ensureDefaultUsers() {
  assertDatabaseConnected();

  for (const item of DEFAULT_USERS) {
    const existing = await User.findOne({ workspaceId: DEFAULT_WORKSPACE_ID, role: item.role }).lean();
    if (existing) continue;

    const { hash, salt } = hashPassword(item.password());
    await User.create({
      workspaceId: DEFAULT_WORKSPACE_ID,
      role: item.role,
      name: item.name,
      passwordHash: hash,
      passwordSalt: salt
    });
  }
}

export async function findLoginUser(role) {
  assertDatabaseConnected();
  await ensureDefaultUsers();
  return User.findOne({ workspaceId: DEFAULT_WORKSPACE_ID, role, active: true });
}
