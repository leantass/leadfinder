import "server-only";
import { isIP } from "node:net";

function canonicalIp(value: string | null): string {
  if (!value || value !== value.trim() || value.includes("%") || !isIP(value)) {
    throw new Error("Trusted client IP unavailable");
  }
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
}

export function getLoginClientIp(request: Request): string {
  // These environment variables are deployment configuration, never request input.
  if (process.env.VERCEL === "1") {
    return canonicalIp(request.headers.get("x-vercel-forwarded-for"));
  }
  // The proxy MUST overwrite this header and be the only ingress to the server.
  if (process.env.LEADFINDER_TRUST_PROXY === "true") {
    return canonicalIp(request.headers.get("x-leadfinder-client-ip"));
  }
  const loopback = (url: string) => ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);
  if (process.env.NODE_ENV === "development" && loopback(request.url)
      && process.env.LEADFINDER_APP_ORIGIN && loopback(process.env.LEADFINDER_APP_ORIGIN)) {
    return "local-development";
  }
  throw new Error("Trusted client IP unavailable");
}
