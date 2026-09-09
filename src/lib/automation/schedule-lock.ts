import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const SCHEDULE_LOCK_TTL_MS = 15 * 60 * 1000;
const RENEW_INTERVAL_MS = SCHEDULE_LOCK_TTL_MS / 3;

export class ScheduleLockLostError extends Error {
  constructor() {
    super("Schedule lock ownership lost.");
    this.name = "ScheduleLockLostError";
  }
}

// Server-side only. Never serialize this object into a run or UI response.
export class ScheduleLease {
  private lost = false;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private renewing: Promise<void> | undefined;

  constructor(readonly scheduleId: string, private readonly token: string) {}

  assertActive() {
    if (this.lost || this.stopped) throw new ScheduleLockLostError();
  }

  start() {
    this.assertActive();
    if (this.timer || this.renewing) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.renewing = this.renew().catch(() => {
        this.lost = true;
      }).finally(() => {
        this.renewing = undefined;
        if (!this.stopped && !this.lost) this.start();
      });
    }, RENEW_INTERVAL_MS);
    this.timer.unref();
  }

  async stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await this.renewing;
  }

  async renew() {
    this.assertActive();
    try {
      const now = new Date();
      const result = await prisma.automationSchedule.updateMany({
        where: {
          id: this.scheduleId, lockToken: this.token,
          lockedAt: { gt: new Date(now.getTime() - SCHEDULE_LOCK_TTL_MS) },
        },
        data: { lockedAt: now },
      });
      if (result.count !== 1) throw new ScheduleLockLostError();
    } catch {
      this.lost = true;
      throw new ScheduleLockLostError();
    }
  }

  // Fence each sensitive transaction: schedule lock first, then run lock.
  // Hold the row until commit so a takeover cannot race the protected writes.
  async guard(tx: Prisma.TransactionClient) {
    this.assertActive();
    const rows = await tx.$queryRaw<Array<{ lockToken: string | null; lockedAt: Date | null }>>`
      SELECT "lockToken", "lockedAt" FROM "AutomationSchedule"
      WHERE "id" = ${this.scheduleId} FOR UPDATE
    `;
    this.assertActive();
    const row = rows[0];
    if (!row || row.lockToken !== this.token || !row.lockedAt ||
        row.lockedAt.getTime() <= Date.now() - SCHEDULE_LOCK_TTL_MS) {
      this.lost = true;
      throw new ScheduleLockLostError();
    }
  }

  async release(lastRunAt?: Date | null) {
    await this.stop();
    if (this.lost) return false;
    const result = await prisma.automationSchedule.updateMany({
      where: {
        id: this.scheduleId, lockToken: this.token,
        lockedAt: { gt: new Date(Date.now() - SCHEDULE_LOCK_TTL_MS) },
      },
      data: { lockedAt: null, lockToken: null, lastRunAt },
    });
    if (result.count !== 1) this.lost = true;
    return result.count === 1;
  }
}

export async function acquireScheduleLease(scheduleId: string) {
  const now = new Date();
  const token = randomBytes(32).toString("hex");
  const result = await prisma.automationSchedule.updateMany({
    where: {
      id: scheduleId, isEnabled: true,
      OR: [{ lockedAt: null }, { lockedAt: { lte: new Date(now.getTime() - SCHEDULE_LOCK_TTL_MS) } }],
    },
    data: { lockedAt: now, lockToken: token },
  });
  return result.count === 1 ? new ScheduleLease(scheduleId, token) : null;
}
