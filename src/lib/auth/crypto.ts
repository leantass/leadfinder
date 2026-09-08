import "server-only";
import { createHash, scrypt, timingSafeEqual } from "node:crypto";

export function secretsEqual(left: string, right: string) {
  return timingSafeEqual(
    createHash("sha256").update(left).digest(),
    createHash("sha256").update(right).digest(),
  );
}

// Format: scrypt$131072$8$1$<32 hex salt chars>$<128 hex hash chars>
export function operatorCredentials() {
  const user = process.env.LEADFINDER_ADMIN_USER;
  const encoded = process.env.LEADFINDER_ADMIN_PASSWORD_HASH;
  const parts = encoded?.split("$");
  if (!user || !parts || parts.length !== 6 ||
      parts[0] !== "scrypt" || parts[1] !== "131072" ||
      parts[2] !== "8" || parts[3] !== "1" ||
      !/^[a-f0-9]{32}$/i.test(parts[4]) || !/^[a-f0-9]{128}$/i.test(parts[5])) {
    throw new Error("Operator authentication is not configured.");
  }
  return { user, salt: Buffer.from(parts[4], "hex"), hash: Buffer.from(parts[5], "hex") };
}

export async function verifyOperatorPassword(user: string, password: string) {
  const configured = operatorCredentials();
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, configured.salt, 64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
  // Always derive and compare, including when the username is wrong.
  const passwordMatches = timingSafeEqual(derived, configured.hash);
  const userMatches = secretsEqual(user, configured.user);
  return passwordMatches && userMatches;
}

export function hasTrustedOrigin(request: Request) {
  const configured = process.env.LEADFINDER_APP_ORIGIN;
  if (!configured) return false;
  try {
    const url = new URL(configured);
    return url.origin === configured &&
      (url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:")) &&
      request.headers.get("origin") === configured;
  } catch {
    return false;
  }
}
