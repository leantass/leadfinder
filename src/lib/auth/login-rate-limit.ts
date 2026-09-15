import "server-only";
import { createHmac } from "node:crypto";
import { prisma } from "@/lib/prisma";

const WINDOW_MS = 15 * 60 * 1000;

export function normalizeLoginUsername(username: string): string {
  return username.normalize("NFC").trim().toLowerCase();
}

export async function reserveLoginAttempt({ ip, normalizedUsername }: {
  ip: string; normalizedUsername: string;
}): Promise<{ allowed: boolean; retryAfterSeconds: number | null }> {
  const secret = process.env.LEADFINDER_RATE_LIMIT_SECRET;
  if (!secret || !/^[a-f0-9]{64}$/i.test(secret)
      || secret.toLowerCase() === process.env.LEADFINDER_SESSION_SECRET?.toLowerCase()) {
    throw new Error("Login rate limit configuration unavailable");
  }
  const key = (scope: string, parts: string[]) => createHmac("sha256", Buffer.from(secret, "hex"))
    .update(JSON.stringify(["leadfinder-login-v1", scope, ...parts])).digest("hex");
  const ipKey = key("ip", [ip]);
  const pairKey = key("ip_user", [ip, normalizedUsername]);
  const result = await prisma.$transaction(async tx => {
    // Serialize this IP across instances, including absent/expired rows. The lock
    // is transaction-scoped and released BEFORE the caller can execute scrypt.
    const lock = BigInt.asIntN(64, BigInt(`0x${ipKey.slice(0, 16)}`));
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lock})`;
    // Prisma DateTime is timestamp without time zone; explicitly use UTC so the
    // adapter and cleanup do not depend on the PostgreSQL session time zone.
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AT TIME ZONE 'UTC' AS now`;
    const buckets = await tx.loginRateLimit.findMany({ where: { keyHash: { in: [ipKey, pairKey] } } });
    const blocked = buckets.filter(bucket => bucket.expiresAt > now && bucket.count >= (bucket.scope === "ip" ? 20 : 5));
    if (blocked.length) return {
      allowed: false,
      retryAfterSeconds: Math.max(1, ...blocked.map(bucket => Math.ceil((bucket.expiresAt.getTime() - now.getTime()) / 1000))),
    };
    for (const [keyHash, scope] of [[ipKey, "ip"], [pairKey, "ip_user"]]) {
      const existing = buckets.find(bucket => bucket.keyHash === keyHash);
      const fresh = { count: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + WINDOW_MS) };
      await tx.loginRateLimit.upsert({
        where: { keyHash }, create: { keyHash, scope, ...fresh },
        update: existing && existing.expiresAt > now ? { count: { increment: 1 } } : fresh,
      });
    }
    return { allowed: true, retryAfterSeconds: null };
  }, { maxWait: 5000, timeout: 5000 });
  // One bounded batch. Cleanup is independent of admission and never exposes data.
  try {
    await prisma.$executeRaw`DELETE FROM "LoginRateLimit" WHERE "keyHash" IN (
      SELECT "keyHash" FROM "LoginRateLimit" WHERE "expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC')
      ORDER BY "expiresAt" LIMIT 100 FOR UPDATE SKIP LOCKED
    )`;
  } catch { /* A successful reservation remains valid if maintenance fails. */ }
  return result;
}
