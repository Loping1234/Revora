import crypto from "node:crypto";

const KEY_LENGTH = 64;

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password || ""), salt, KEY_LENGTH).toString("hex");
  return { hash, salt };
}

export function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) return false;

  const { hash } = hashPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
