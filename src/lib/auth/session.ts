import "server-only";
import { randomBytes } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { operatorCredentials } from "@/lib/auth/crypto";

export const SESSION_SECONDS = 8 * 60 * 60;
const issuer = "LeadFinder";
const audience = "LeadFinder";

export function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-leadfinder-session" : "leadfinder-session";
}

export function sessionCookieOptions() {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const, path: "/", maxAge: SESSION_SECONDS };
}

function configuration() {
  const { user } = operatorCredentials();
  const secret = process.env.LEADFINDER_SESSION_SECRET;
  // Require a 32-byte random secret encoded as 64 hex characters.
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)) {
    throw new Error("Session authentication is not configured.");
  }
  return { user, key: Buffer.from(secret, "hex") };
}

export async function issueSession() {
  const { user, key } = configuration();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ nonce: randomBytes(32).toString("hex") })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer).setAudience(audience).setSubject(user)
    .setIssuedAt(now).setExpirationTime(now + SESSION_SECONDS).sign(key);
}

export async function verifySession(token: string | undefined) {
  if (!token || token.length > 4096) return null;
  try {
    const { user, key } = configuration();
    const { payload } = await jwtVerify(token, key, {
      algorithms: ["HS256"], issuer, audience, typ: "JWT",
      requiredClaims: ["sub", "iat", "exp", "nonce"], maxTokenAge: SESSION_SECONDS,
    });
    const now = Math.floor(Date.now() / 1000);
    if (payload.sub !== user || typeof payload.iat !== "number" ||
        typeof payload.exp !== "number" || payload.iat > now ||
        payload.exp - payload.iat !== SESSION_SECONDS ||
        typeof payload.nonce !== "string" || !/^[a-f0-9]{64}$/.test(payload.nonce)) return null;
    return { user, expiresAt: payload.exp };
  } catch {
    return null;
  }
}

export function expiredSessionCookieOptions() {
  return { ...sessionCookieOptions(), maxAge: 0, expires: new Date(0) };
}
