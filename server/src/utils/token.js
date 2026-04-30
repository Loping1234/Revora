import crypto from "node:crypto";
import { env } from "../config/env.js";

export const SESSION_TTL_SECONDS = 60 * 60 * 8;

function base64UrlEncode(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function base64UrlDecode(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

function sign(value) {
  return crypto.createHmac("sha256", env.jwtSecret).update(value).digest("base64url");
}

export function createSessionToken(payload) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + SESSION_TTL_SECONDS;
  const header = base64UrlEncode({ alg: "HS256", typ: "JWT" });
  const body = base64UrlEncode({
    ...payload,
    iat: now,
    exp
  });
  const unsigned = `${header}.${body}`;

  return `${unsigned}.${sign(unsigned)}`;
}

export function verifySessionToken(token) {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [header, body, signature] = parts;
  const unsigned = `${header}.${body}`;
  const expectedSignature = sign(unsigned);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const payload = base64UrlDecode(body);

  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
