import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  getNormalizedAutomationAutoApplyPolicy,
  getLeadAutomationActionLabel,
  getLeadAutomationDecision,
  isSafeAutoApplicableAutomationRunItem,
} from "@/lib/leads/automation-engine";
import { getStatusLabel } from "@/lib/leads/lead-ui";
import {
  automationRunItemLeadSelect,
  getLeadIdsForListContext,
  normalizeAutomationRun,
} from "@/lib/workspace-data";
import {
  getAutomationScheduleMaxItemsPerRun,
  isAutomationScheduleDue,
  isAutomationScheduleWithinRunWindow,
  isValidAutomationScheduleTimeValue,
  isValidAutomationScheduleTimezone,
} from "@/lib/automation/schedule-utils";

import type {
  AutomationSchedule,
  AutomationConfidence,
  AutomationSchedulerExecution,
  AutomationRun,
  LeadAutoAction,
  LeadActivityItem,
} from "@/components/leads-panel/types";

type LeadActivityInput = {
  type: string;
  label: string;
  metadata?: string | null;
};

type LeadFollowUpInput = {
  nextAction: string;
  dueAt: string | null;
};

type AutomationRunContextInput = {
  q?: string;
  filter?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

type CreateAutomationRunInput = {
  leadIds: string[];
  context?: AutomationRunContextInput;
  source?: "manual" | "schedule";
  scheduleId?: string | null;
  executionKey?: string | null;
};

type ApplyAutomationRunItemInput = {
  runItemId: string;
  mode?: "single" | "bulk" | "supervised_auto";
  executeWhatsApp?: boolean;
};

type UpdateAutomationSchedulePolicyInput = {
  scheduleId: string;
  autoApplySafe: boolean;
  autoApplyMinConfidence: AutomationConfidence;
  autoApplyActions: LeadAutoAction[];
  respectQuietHours: boolean;
  runWindowStart: string;
  runWindowEnd: string;
  timezone: string;
  maxItemsPerRun: number;
};

type PersistLeadChangesInput = {
  leadId: string;
  commercialStatus?: string | null;
  followUp?: LeadFollowUpInput | null;
  activities?: LeadActivityInput[];
};

type PersistLeadChangesResult = {
  commercialStatus: string;
  followUp: {
    nextAction: string;
    dueAt: string | null;
  };
  activities: LeadActivityItem[];
};

type ScheduleRecord = Prisma.AutomationScheduleGetPayload<{
  select: typeof automationScheduleSelect;
}>;

type SchedulerExecutionRecord = Prisma.AutomationSchedulerExecutionGetPayload<{
  select: typeof automationSchedulerExecutionSelect;
}>;

const automationScheduleSelect = {
  id: true,
  name: true,
  isEnabled: true,
  runEveryMinutes: true,
  query: true,
  filter: true,
  sort: true,
  page: true,
  pageSize: true,
  autoApplySafe: true,
  autoApplyMinConfidence: true,
  autoApplyActions: true,
  respectQuietHours: true,
  runWindowStart: true,
  runWindowEnd: true,
  timezone: true,
  maxItemsPerRun: true,
  lastRunAt: true,
  lockedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AutomationScheduleSelect;

const automationSchedulerExecutionSelect = {
  id: true,
  status: true,
  schedulesChecked: true,
  schedulesRun: true,
  runsCreated: true,
  skippedLocked: true,
  skippedDuplicate: true,
  skippedQuietHours: true,
  limitedRuns: true,
  safeActionsApplied: true,
  errorSummary: true,
  createdAt: true,
  startedAt: true,
  finishedAt: true,
} satisfies Prisma.AutomationSchedulerExecutionSelect;

const SCHEDULE_LOCK_STALE_MS = 15 * 60 * 1000;

export type ExecuteAutomationScheduleResult = {
  ok: boolean;
  error: string | null;
  schedule: AutomationSchedule | null;
  run: AutomationRun | null;
  autoAppliedCount: number;
};

export type RunDueAutomationSchedulesResult = {
  ok: boolean;
  error: string | null;
  execution: AutomationSchedulerExecution | null;
  checkedCount: number;
  dueCount: number;
  executedCount: number;
  createdRunsCount: number;
  autoAppliedCount: number;
  latestRun: AutomationRun | null;
  schedules: AutomationSchedule[];
  executionResults: Array<{
    scheduleId: string;
    scheduleName: string;
    status:
      | "executed"
      | "skipped_locked"
      | "skipped_duplicate"
      | "skipped_quiet_hours"
      | "failed";
    ok: boolean;
    error: string | null;
    runId: string | null;
    autoAppliedCount: number;
    processedLeadCount: number;
    limitedByMaxItems: boolean;
  }>;
};

function parseFollowUpDate(value: string | null) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toLeadActivityItem(activity: {
  id: string;
  leadId: string;
  type: string;
  label: string;
  metadata: string | null;
  createdAt: Date;
}): LeadActivityItem {
  return {
    id: activity.id,
    leadId: activity.leadId,
    type: activity.type,
    label: activity.label,
    metadata: activity.metadata,
    createdAt: activity.createdAt.toISOString(),
  };
}

function formatFollowUpMetadata(followUp: LeadFollowUpInput) {
  const metadata = [
    followUp.nextAction ? `Proxima accion: ${followUp.nextAction}` : null,
    followUp.dueAt ? `Fecha: ${followUp.dueAt}` : null,
  ].filter(Boolean);

  return metadata.length > 0 ? metadata.join(" · ") : null;
}

function buildStatusChangedActivity(status: string): LeadActivityInput {
  return {
    type: "status_changed",
    label: `Estado cambiado a "${getStatusLabel(status)}"`,
  };
}

function getAutomationRunStatusFromCounts(
  decisionCount: number,
  appliedCount: number,
  failedCount: number
) {
  const pendingCount = Math.max(0, decisionCount - appliedCount - failedCount);

  if (pendingCount === decisionCount) {
    return "pending";
  }

  if (pendingCount > 0) {
    return "in_progress";
  }

  if (failedCount > 0) {
    return "completed_with_failures";
  }

  return "completed";
}

function normalizeAutomationScheduleRecord(schedule: ScheduleRecord): AutomationSchedule {
  return {
    id: schedule.id,
    name: schedule.name,
    isEnabled: schedule.isEnabled,
    runEveryMinutes: schedule.runEveryMinutes,
    query: schedule.query,
    filter: schedule.filter,
    sort: schedule.sort,
    page: schedule.page,
    pageSize: schedule.pageSize,
    autoApplySafe: schedule.autoApplySafe,
    autoApplyMinConfidence: schedule.autoApplyMinConfidence as AutomationConfidence,
    autoApplyActions: schedule.autoApplyActions as LeadAutoAction[],
    respectQuietHours: schedule.respectQuietHours,
    runWindowStart: schedule.runWindowStart,
    runWindowEnd: schedule.runWindowEnd,
    timezone: schedule.timezone,
    maxItemsPerRun: schedule.maxItemsPerRun,
    lastRunAt: schedule.lastRunAt ? schedule.lastRunAt.toISOString() : null,
    createdAt: schedule.createdAt.toISOString(),
    updatedAt: schedule.updatedAt.toISOString(),
  };
}

function normalizeAutomationSchedulerExecutionRecord(
  execution: SchedulerExecutionRecord
): AutomationSchedulerExecution {
  return {
    id: execution.id,
    status: execution.status as AutomationSchedulerExecution["status"],
    schedulesChecked: execution.schedulesChecked,
    schedulesRun: execution.schedulesRun,
    runsCreated: execution.runsCreated,
    skippedLocked: execution.skippedLocked,
    skippedDuplicate: execution.skippedDuplicate,
    skippedQuietHours: execution.skippedQuietHours,
    limitedRuns: execution.limitedRuns,
    safeActionsApplied: execution.safeActionsApplied,
    errorSummary: execution.errorSummary,
    createdAt: execution.createdAt.toISOString(),
    startedAt: execution.startedAt.toISOString(),
    finishedAt: execution.finishedAt ? execution.finishedAt.toISOString() : null,
  };
}

function getScheduleLockCutoff(now = new Date()) {
  return new Date(now.getTime() - SCHEDULE_LOCK_STALE_MS);
}

function getScheduleExecutionWindowAt(schedule: ScheduleRecord) {
  if (schedule.lastRunAt) {
    return new Date(
      schedule.lastRunAt.getTime() + schedule.runEveryMinutes * 60 * 1000
    );
  }

  return new Date(schedule.createdAt.getTime());
}

function buildScheduleExecutionKey(schedule: ScheduleRecord) {
  return `schedule:${schedule.id}:${getScheduleExecutionWindowAt(schedule).toISOString()}`;
}

async function syncAutomationRunCounts(
  tx: Prisma.TransactionClient,
  runId: string
) {
  const groupedStatuses = await tx.automationRunItem.groupBy({
    by: ["status"],
    where: {
      runId,
    },
    _count: {
      _all: true,
    },
  });

  const run = await tx.automationRun.findUniqueOrThrow({
    where: { id: runId },
    select: {
      decisionCount: true,
    },
  });

  const appliedCount =
    groupedStatuses.find((item) => item.status === "applied")?._count._all ?? 0;
  const failedCount =
    groupedStatuses.find((item) => item.status === "failed")?._count._all ?? 0;

  await tx.automationRun.update({
    where: { id: runId },
    data: {
      appliedCount,
      failedCount,
      status: getAutomationRunStatusFromCounts(
        run.decisionCount,
        appliedCount,
        failedCount
      ),
    },
  });
}

async function persistLeadChanges(
  tx: Prisma.TransactionClient,
  { leadId, commercialStatus, followUp, activities = [] }: PersistLeadChangesInput
): Promise<PersistLeadChangesResult> {
  const leadData: Prisma.LeadUpdateInput = {};

  if (typeof commercialStatus === "string" && commercialStatus.trim() !== "") {
    leadData.commercialStatus = commercialStatus;
  }

  if (followUp) {
    leadData.followUpNextAction = followUp.nextAction || null;
    leadData.followUpDueAt = parseFollowUpDate(followUp.dueAt);
  }

  if (Object.keys(leadData).length > 0) {
    await tx.lead.update({
      where: { id: leadId },
      data: leadData,
    });
  }

  const createdActivities: LeadActivityItem[] = [];

  for (const activity of activities) {
    const createdActivity = await tx.leadActivity.create({
      data: {
        leadId,
        type: activity.type,
        label: activity.label,
        metadata: activity.metadata ?? null,
      },
    });

    createdActivities.push(toLeadActivityItem(createdActivity));
  }

  const updatedLead = await tx.lead.findUniqueOrThrow({
    where: { id: leadId },
    select: {
      commercialStatus: true,
      followUpNextAction: true,
      followUpDueAt: true,
    },
  });

  return {
    commercialStatus: updatedLead.commercialStatus,
    followUp: {
      nextAction: updatedLead.followUpNextAction ?? "",
      dueAt: updatedLead.followUpDueAt
        ? updatedLead.followUpDueAt.toISOString()
        : null,
    },
    activities: createdActivities,
  };
}

async function getAutomationRunWithItems(
  runId: string,
  tx: Prisma.TransactionClient = prisma
) {
  return tx.automationRun.findUnique({
    where: { id: runId },
    include: {
      schedule: {
        select: {
          id: true,
          name: true,
        },
      },
      items: {
        include: {
          lead: {
            select: automationRunItemLeadSelect,
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });
}

async function createSchedulerExecutionRecord() {
  const execution = await prisma.automationSchedulerExecution.create({
    data: {
      status: "running",
    },
    select: automationSchedulerExecutionSelect,
  });

  return normalizeAutomationSchedulerExecutionRecord(execution);
}

async function updateSchedulerExecutionRecord(
  executionId: string,
  data: Prisma.AutomationSchedulerExecutionUpdateInput
) {
  const execution = await prisma.automationSchedulerExecution.update({
    where: {
      id: executionId,
    },
    data,
    select: automationSchedulerExecutionSelect,
  });

  return normalizeAutomationSchedulerExecutionRecord(execution);
}

async function tryLockAutomationSchedule(scheduleId: string, now = new Date()) {
  const lockResult = await prisma.automationSchedule.updateMany({
    where: {
      id: scheduleId,
      isEnabled: true,
      OR: [
        {
          lockedAt: null,
        },
        {
          lockedAt: {
            lt: getScheduleLockCutoff(now),
          },
        },
      ],
    },
    data: {
      lockedAt: now,
    },
  });

  if (lockResult.count === 0) {
    return null;
  }

  return prisma.automationSchedule.findUniqueOrThrow({
    where: {
      id: scheduleId,
    },
    select: automationScheduleSelect,
  });
}

async function releaseAutomationScheduleLock(
  scheduleId: string,
  options?: {
    lastRunAt?: Date | null | undefined;
  }
) {
  await prisma.automationSchedule.update({
    where: {
      id: scheduleId,
    },
    data: {
      lockedAt: null,
      lastRunAt:
        options && options.lastRunAt !== undefined ? options.lastRunAt ?? null : undefined,
    },
  });
}

export async function createAutomationRunRecord({
  leadIds,
  context,
  source = "manual",
  scheduleId = null,
  executionKey = null,
}: CreateAutomationRunInput) {
  const normalizedLeadIds = Array.isArray(leadIds)
    ? leadIds.filter((leadId) => typeof leadId === "string" && leadId.trim() !== "")
    : [];

  if (normalizedLeadIds.length === 0) {
    return {
      ok: false,
      error: "No hay leads cargados para analizar.",
      run: null,
    };
  }

  const leads = await prisma.lead.findMany({
    where: {
      id: {
        in: normalizedLeadIds,
      },
    },
    select: {
      id: true,
      businessName: true,
      phone: true,
      website: true,
      websiteType: true,
      commercialStatus: true,
      businessType: true,
      suggestedOffer: true,
      offerReason: true,
      readyForAutomation: true,
      outreachStatus: true,
      outreachChannel: true,
      scrapedAt: true,
      score: true,
      scoreReasons: true,
      followUpNextAction: true,
      followUpDueAt: true,
    },
  });

  const leadsById = new Map(leads.map((lead) => [lead.id, lead]));
  const orderedLeads = normalizedLeadIds
    .map((leadId) => leadsById.get(leadId) ?? null)
    .filter((lead): lead is NonNullable<(typeof leads)[number]> => Boolean(lead));

  if (orderedLeads.length === 0) {
    return {
      ok: false,
      error: "No se encontraron leads validos para analizar.",
      run: null,
    };
  }

  const decisions = orderedLeads.map((lead) =>
    getLeadAutomationDecision({
      ...lead,
      notes: [],
      scoreReasons: lead.scoreReasons ?? [],
      followUp: {
        nextAction: lead.followUpNextAction ?? "",
        dueAt: lead.followUpDueAt ? lead.followUpDueAt.toISOString() : null,
      },
    })
  );

  const safeQuery = context?.q?.trim() ?? "";
  const safeFilter = context?.filter?.trim() || "all";
  const safeSort = context?.sort?.trim() || "score-desc";
  const safePage =
    typeof context?.page === "number" && context.page > 0
      ? Math.floor(context.page)
      : 1;
  const safePageSize =
    typeof context?.pageSize === "number" && context.pageSize > 0
      ? Math.floor(context.pageSize)
      : normalizedLeadIds.length;

  try {
    const run = await prisma.automationRun.create({
      data: {
        source,
        scheduleId,
        executionKey,
        query: safeQuery,
        filter: safeFilter,
        sort: safeSort,
        page: safePage,
        pageSize: safePageSize,
        status: decisions.length > 0 ? "pending" : "completed",
        analyzedCount: orderedLeads.length,
        decisionCount: decisions.length,
        items: {
          create: decisions.map((decision) => ({
            leadId: decision.leadId,
            action: decision.action,
            confidence: decision.confidence,
            reason: decision.reason,
            suggestedStatus: decision.suggestedStatus,
            suggestedChannel: decision.suggestedChannel,
            suggestedMessagePreview: decision.suggestedMessagePreview ?? null,
          })),
        },
      },
      include: {
        schedule: {
          select: {
            id: true,
            name: true,
          },
        },
        items: {
          include: {
            lead: {
              select: automationRunItemLeadSelect,
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
      },
    });

    return {
      ok: true,
      error: null,
      run: normalizeAutomationRun(run),
      wasDuplicate: false,
    };
  } catch (error) {
    if (
      executionKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existingRun = await prisma.automationRun.findUnique({
        where: {
          executionKey,
        },
        include: {
          schedule: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            include: {
              lead: {
                select: automationRunItemLeadSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      return {
        ok: true,
        error: null,
        run: existingRun ? normalizeAutomationRun(existingRun) : null,
        wasDuplicate: true,
      };
    }

    throw error;
  }
}

// All item transitions (including failures) acquire this parent lock first.
// Tagged SQL binds runId as a value; it is never interpolated into SQL text.
async function lockAutomationRun(tx: Prisma.TransactionClient, runId: string) {
  await tx.$queryRaw`SELECT "id" FROM "AutomationRun" WHERE "id" = ${runId} FOR UPDATE`;
}

export async function applyAutomationRunItemRecord({
  runItemId,
  mode = "single",
  executeWhatsApp = false,
}: ApplyAutomationRunItemInput) {
  let runItemContext: { id: string; runId: string } | null = null;

  try {
    // This lookup locates the parent only; eligibility is re-read under its lock.
    runItemContext = await prisma.automationRunItem.findUnique({
      where: { id: runItemId },
      select: { id: true, runId: true },
    });
    const context = runItemContext;
    if (!context) {
      return {
        ok: false,
        error: "No se encontro el item de automatizacion.",
        commercialStatus: null,
        followUp: null,
        activities: [] as LeadActivityItem[],
        automationRun: null,
      };
    }
    return await prisma.$transaction(async (tx) => {
      await lockAutomationRun(tx, context.runId);
      const runItem = await tx.automationRunItem.findUnique({
        where: { id: runItemId, runId: context.runId },
        select: {
          id: true,
          runId: true,
          leadId: true,
          action: true,
          reason: true,
          suggestedStatus: true,
          suggestedChannel: true,
          status: true,
        },
      });

      if (!runItem) {
        return {
          ok: false,
          error: "No se encontro el item de automatizacion.",
          commercialStatus: null,
          followUp: null,
          activities: [] as LeadActivityItem[],
          automationRun: null,
        };
      }

      runItemContext = {
        id: runItem.id,
        runId: runItem.runId,
      };

      if (runItem.status !== "pending") {
        const currentRun = await getAutomationRunWithItems(runItem.runId, tx);

        return {
          ok: false,
          error: "El item de automatizacion ya no esta pendiente.",
          commercialStatus: null,
          followUp: null,
          activities: [] as LeadActivityItem[],
          automationRun: currentRun ? normalizeAutomationRun(currentRun) : null,
        };
      }

      const action = runItem.action as LeadAutoAction;
      const reason = runItem.reason;
      const suggestedStatus = runItem.suggestedStatus ?? null;
      const suggestedChannel = runItem.suggestedChannel ?? null;

      const lead = await tx.lead.findUnique({
        where: { id: runItem.leadId },
        select: {
          id: true,
          phone: true,
          commercialStatus: true,
          followUpDueAt: true,
        },
      });

      if (!lead) {
        return {
          ok: false,
          error: "No se encontro el lead.",
          commercialStatus: null,
          followUp: null,
          activities: [] as LeadActivityItem[],
          automationRun: null,
        };
      }

      let nextStatus = suggestedStatus;
      let nextFollowUp: LeadFollowUpInput | null = null;

      if (action === "review_manually" && lead.commercialStatus !== "new") {
        nextStatus = null;
      }

      if (action === "discard") {
        nextStatus = "discarded";
      }

      if (action === "close") {
        nextStatus = "closed";
      }

      if (action === "send_to_sales") {
        nextStatus = "ready";
      }

      if (action === "follow_up") {
        nextStatus = "follow-up";

        const today = new Date();
        const baseDate = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate()
        );

        if (!lead.followUpDueAt) {
          baseDate.setDate(baseDate.getDate() + 1);
        }

        nextFollowUp = {
          nextAction: lead.phone ? "Escribir por WhatsApp" : "Hacer seguimiento",
          dueAt: baseDate.toISOString().slice(0, 10),
        };
      }

      if (action === "contact_now") {
        // Preparing contact is not confirmation, including for legacy suggestions.
        nextStatus = null;
      }

      const activities: LeadActivityInput[] = [];

      if (nextStatus && nextStatus !== lead.commercialStatus) {
        activities.push(buildStatusChangedActivity(nextStatus));
      }

      if (action === "send_to_sales" && lead.commercialStatus !== "ready") {
        activities.push({
          type: "sent_to_sales",
          label: "Lead enviado a ventas",
        });
      }

      if (nextFollowUp) {
        activities.push({
          type: "follow_up_updated",
          label: "Seguimiento actualizado desde automatizacion",
          metadata: formatFollowUpMetadata(nextFollowUp),
        });
      }

      activities.push({
        type: "automation_applied",
        label: `Automatizacion aplicada: ${getLeadAutomationActionLabel(action)}`,
        metadata: [
          nextStatus ? `Estado: ${getStatusLabel(nextStatus)}` : null,
          suggestedChannel ? `Canal: ${suggestedChannel}` : null,
          `Motivo: ${reason}`,
          `Modo: ${mode}`,
        ]
          .filter(Boolean)
          .join(" · "),
      });

      if (action === "contact_now") {
        activities.push({
          type: "contact_prepared",
          label: "Contacto preparado desde automatizacion",
        });
      }

      if (executeWhatsApp && action === "contact_now") {
        activities.push({
          type: "whatsapp_open_requested",
          label: "Apertura de WhatsApp solicitada desde automatizacion",
        });
      }

      const result = await persistLeadChanges(tx, {
        leadId: lead.id,
        commercialStatus: nextStatus,
        followUp: nextFollowUp,
        activities,
      });
      const currentRunItemContext = runItem;

      const transition = await tx.automationRunItem.updateMany({
        where: { id: currentRunItemContext.id, status: "pending" },
        data: {
          status: "applied",
          appliedAt: new Date(),
          failureReason: null,
        },
      });

      if (transition.count !== 1) {
        throw new Error("Automation item is no longer pending.");
      }

      await syncAutomationRunCounts(tx, currentRunItemContext.runId);

      const updatedRun = await tx.automationRun.findUniqueOrThrow({
        where: { id: currentRunItemContext.runId },
        include: {
          schedule: {
            select: {
              id: true,
              name: true,
            },
          },
          items: {
            include: {
              lead: {
                select: automationRunItemLeadSelect,
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });

      return {
        ok: true,
        error: null,
        commercialStatus: result.commercialStatus,
        followUp: result.followUp,
        activities: result.activities,
        automationRun: normalizeAutomationRun(updatedRun),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    console.error("[automation] applyAutomationRunItemRecord error:", error);

    if (runItemContext) {
      try {
        const currentRunItemContext = runItemContext;

        const updatedRun = await prisma.$transaction(async (tx) => {
          await lockAutomationRun(tx, currentRunItemContext.runId);
          const currentItem = await tx.automationRunItem.findUnique({
            where: { id: currentRunItemContext.id, runId: currentRunItemContext.runId },
            select: { status: true },
          });
          if (currentItem?.status === "pending") {
            const transition = await tx.automationRunItem.updateMany({
              where: { id: currentRunItemContext.id, status: "pending" },
              data: {
                status: "failed",
                failureReason:
                  error instanceof Error
                    ? error.message.slice(0, 300)
                    : "Error al aplicar la automatizacion.",
              },
            });

            if (transition.count === 1) {
              await syncAutomationRunCounts(tx, currentRunItemContext.runId);
            }
          }

          return tx.automationRun.findUniqueOrThrow({
            where: { id: currentRunItemContext.runId },
            include: {
              schedule: {
                select: {
                  id: true,
                  name: true,
                },
              },
              items: {
                include: {
                  lead: {
                    select: automationRunItemLeadSelect,
                  },
                },
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
          });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

        return {
          ok: false,
          error: "No se pudo aplicar la automatizacion.",
          commercialStatus: null,
          followUp: null,
          activities: [] as LeadActivityItem[],
          automationRun: normalizeAutomationRun(updatedRun),
        };
      } catch (runUpdateError) {
        console.error(
          "[automation] applyAutomationRunItemRecord run update error:",
          runUpdateError
        );
      }
    }

    return {
      ok: false,
      error: "No se pudo aplicar la automatizacion.",
      commercialStatus: null,
      followUp: null,
      activities: [] as LeadActivityItem[],
      automationRun: null,
    };
  }
}

async function executeAutomationScheduleRecord(
  schedule: ScheduleRecord,
  options?: {
    executionKey?: string | null;
  }
): Promise<
  ExecuteAutomationScheduleResult & {
    wasDuplicate?: boolean;
    limitedByMaxItems?: boolean;
    processedLeadCount?: number;
  }
> {
  const autoApplyPolicy = getNormalizedAutomationAutoApplyPolicy({
    enabled: schedule.autoApplySafe,
    minConfidence: schedule.autoApplyMinConfidence as AutomationConfidence,
    allowedActions: schedule.autoApplyActions as LeadAutoAction[],
  });
  const maxItemsPerRun = Math.min(
    schedule.pageSize,
    getAutomationScheduleMaxItemsPerRun({
      maxItemsPerRun: schedule.maxItemsPerRun,
    })
  );
  const { leadIds, hasMore } = await getLeadIdsForListContext({
    q: schedule.query,
    filter: schedule.filter as Parameters<typeof getLeadIdsForListContext>[0]["filter"],
    sort: schedule.sort as Parameters<typeof getLeadIdsForListContext>[0]["sort"],
    page: schedule.page,
    pageSize: maxItemsPerRun,
  });

  const runResult = await createAutomationRunRecord({
    leadIds,
    context: {
      q: schedule.query,
      filter: schedule.filter,
      sort: schedule.sort,
      page: schedule.page,
      pageSize: schedule.pageSize,
    },
    source: "schedule",
    scheduleId: schedule.id,
    executionKey: options?.executionKey ?? null,
  });

  if (!runResult.ok || !runResult.run) {
    return {
      ok: false,
      error: runResult.error ?? "No se pudo ejecutar el schedule.",
      schedule: normalizeAutomationScheduleRecord(schedule),
      run: null,
      autoAppliedCount: 0,
      wasDuplicate: false,
      limitedByMaxItems: false,
      processedLeadCount: 0,
    };
  }

  let latestRun = runResult.run;
  let autoAppliedCount = 0;

  if (autoApplyPolicy.enabled) {
    const autoApplicableItems = latestRun.items.filter((item) =>
      isSafeAutoApplicableAutomationRunItem(item, autoApplyPolicy)
    );

    for (const item of autoApplicableItems) {
      const applyResult = await applyAutomationRunItemRecord({
        runItemId: item.id,
        mode: "supervised_auto",
        executeWhatsApp: false,
      });

      if (applyResult.automationRun) {
        latestRun = applyResult.automationRun;
      }

      if (applyResult.ok) {
        autoAppliedCount += 1;
      }
    }
  }

  const refreshedSchedule = await prisma.automationSchedule.findUniqueOrThrow({
    where: {
      id: schedule.id,
    },
    select: automationScheduleSelect,
  });

  return {
    ok: true,
    error: null,
    schedule: normalizeAutomationScheduleRecord(refreshedSchedule),
    run: latestRun,
    autoAppliedCount,
    wasDuplicate: runResult.wasDuplicate ?? false,
    limitedByMaxItems: hasMore,
    processedLeadCount: leadIds.length,
  };
}

export async function executeAutomationScheduleById(scheduleId: string) {
  if (!scheduleId || scheduleId.trim() === "") {
    return {
      ok: false,
      error: "Falta el schedule para ejecutar.",
      schedule: null,
      run: null,
      autoAppliedCount: 0,
    } satisfies ExecuteAutomationScheduleResult;
  }

  let lockedSchedule: ScheduleRecord | null = null;

  try {
    lockedSchedule = await tryLockAutomationSchedule(scheduleId);

    if (!lockedSchedule) {
      return {
        ok: false,
        error: "El schedule ya se esta ejecutando o no esta disponible.",
        schedule: null,
        run: null,
        autoAppliedCount: 0,
      } satisfies ExecuteAutomationScheduleResult;
    }

    if (!isAutomationScheduleWithinRunWindow(lockedSchedule)) {
      await releaseAutomationScheduleLock(lockedSchedule.id);

      return {
        ok: false,
        error: "El schedule esta fuera de su ventana horaria.",
        schedule: normalizeAutomationScheduleRecord(lockedSchedule),
        run: null,
        autoAppliedCount: 0,
      } satisfies ExecuteAutomationScheduleResult;
    }

    const result = await executeAutomationScheduleRecord(lockedSchedule);

    await releaseAutomationScheduleLock(lockedSchedule.id, {
      lastRunAt: result.ok ? new Date() : undefined,
    });

    if (result.ok) {
      const refreshedSchedule = await prisma.automationSchedule.findUniqueOrThrow({
        where: {
          id: lockedSchedule.id,
        },
        select: automationScheduleSelect,
      });

      return {
        ...result,
        schedule: normalizeAutomationScheduleRecord(refreshedSchedule),
      };
    }

    return result;
  } catch (error) {
    console.error("[automation] executeAutomationScheduleById error:", error);

    if (lockedSchedule) {
      await releaseAutomationScheduleLock(lockedSchedule.id);
    }

    return {
      ok: false,
      error: "No se pudo ejecutar el schedule.",
      schedule: null,
      run: null,
      autoAppliedCount: 0,
    } satisfies ExecuteAutomationScheduleResult;
  }
}

export async function updateAutomationSchedulePolicy({
  scheduleId,
  autoApplySafe,
  autoApplyMinConfidence,
  autoApplyActions,
  respectQuietHours,
  runWindowStart,
  runWindowEnd,
  timezone,
  maxItemsPerRun,
}: UpdateAutomationSchedulePolicyInput) {
  if (!scheduleId || scheduleId.trim() === "") {
    return {
      ok: false,
      error: "Falta el schedule para actualizar.",
      schedule: null,
    };
  }

  const normalizedPolicy = getNormalizedAutomationAutoApplyPolicy({
    enabled: autoApplySafe,
    minConfidence: autoApplyMinConfidence,
    allowedActions: autoApplyActions,
  });
  const normalizedTimezone = timezone.trim();
  const normalizedMaxItemsPerRun = Math.max(1, Math.floor(maxItemsPerRun || 0));

  if (!isValidAutomationScheduleTimeValue(runWindowStart)) {
    return {
      ok: false,
      error: "La hora inicial no es válida.",
      schedule: null,
    };
  }

  if (!isValidAutomationScheduleTimeValue(runWindowEnd)) {
    return {
      ok: false,
      error: "La hora final no es válida.",
      schedule: null,
    };
  }

  if (!isValidAutomationScheduleTimezone(normalizedTimezone)) {
    return {
      ok: false,
      error: "La zona horaria no es válida.",
      schedule: null,
    };
  }

  try {
    const schedule = await prisma.automationSchedule.update({
      where: {
        id: scheduleId,
      },
      data: {
        autoApplySafe: normalizedPolicy.enabled,
        autoApplyMinConfidence: normalizedPolicy.minConfidence,
        autoApplyActions: normalizedPolicy.allowedActions,
        respectQuietHours,
        runWindowStart,
        runWindowEnd,
        timezone: normalizedTimezone,
        maxItemsPerRun: normalizedMaxItemsPerRun,
      },
      select: automationScheduleSelect,
    });

    return {
      ok: true,
      error: null,
      schedule: normalizeAutomationScheduleRecord(schedule),
    };
  } catch (error) {
    console.error("[automation] updateAutomationSchedulePolicy error:", error);

    return {
      ok: false,
      error: "No se pudo actualizar la politica del schedule.",
      schedule: null,
    };
  }
}

async function processDueAutomationSchedule(
  schedule: ScheduleRecord,
  now: Date
): Promise<{
  schedule: AutomationSchedule | null;
  run: AutomationRun | null;
  autoAppliedCount: number;
  executionResult: RunDueAutomationSchedulesResult["executionResults"][number];
}> {
  const lockedSchedule = await tryLockAutomationSchedule(schedule.id, now);

  if (!lockedSchedule) {
    return {
      schedule: normalizeAutomationScheduleRecord(schedule),
      run: null,
      autoAppliedCount: 0,
      executionResult: {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        status: "skipped_locked",
        ok: true,
        error: "Omitido por lock activo.",
        runId: null,
        autoAppliedCount: 0,
        processedLeadCount: 0,
        limitedByMaxItems: false,
      },
    };
  }

  try {
    const normalizedLockedSchedule = normalizeAutomationScheduleRecord(lockedSchedule);

    if (!isAutomationScheduleDue(normalizedLockedSchedule, now)) {
      await releaseAutomationScheduleLock(lockedSchedule.id);

      return {
        schedule: normalizedLockedSchedule,
        run: null,
        autoAppliedCount: 0,
        executionResult: {
          scheduleId: lockedSchedule.id,
          scheduleName: lockedSchedule.name,
          status: "skipped_duplicate",
          ok: true,
          error: "Omitido porque la ventana ya fue cubierta.",
          runId: null,
          autoAppliedCount: 0,
          processedLeadCount: 0,
          limitedByMaxItems: false,
        },
      };
    }

    if (!isAutomationScheduleWithinRunWindow(normalizedLockedSchedule, now)) {
      await releaseAutomationScheduleLock(lockedSchedule.id);

      return {
        schedule: normalizedLockedSchedule,
        run: null,
        autoAppliedCount: 0,
        executionResult: {
          scheduleId: lockedSchedule.id,
          scheduleName: lockedSchedule.name,
          status: "skipped_quiet_hours",
          ok: true,
          error: "Omitido por ventana horaria.",
          runId: null,
          autoAppliedCount: 0,
          processedLeadCount: 0,
          limitedByMaxItems: false,
        },
      };
    }

    const executionKey = buildScheduleExecutionKey(lockedSchedule);
    const result = await executeAutomationScheduleRecord(lockedSchedule, {
      executionKey,
    });

    if (!result.ok) {
      await releaseAutomationScheduleLock(lockedSchedule.id);

      return {
        schedule: result.schedule,
        run: result.run,
        autoAppliedCount: 0,
        executionResult: {
          scheduleId: lockedSchedule.id,
          scheduleName: lockedSchedule.name,
          status: "failed",
          ok: false,
          error: result.error,
          runId: result.run?.id ?? null,
          autoAppliedCount: 0,
          processedLeadCount: result.processedLeadCount ?? 0,
          limitedByMaxItems: result.limitedByMaxItems ?? false,
        },
      };
    }

    const coveredAt = result.run?.createdAt ? new Date(result.run.createdAt) : now;

    await releaseAutomationScheduleLock(lockedSchedule.id, {
      lastRunAt: coveredAt,
    });

    const refreshedSchedule = await prisma.automationSchedule.findUniqueOrThrow({
      where: {
        id: lockedSchedule.id,
      },
      select: automationScheduleSelect,
    });

    return {
      schedule: normalizeAutomationScheduleRecord(refreshedSchedule),
      run: result.run,
      autoAppliedCount: result.wasDuplicate ? 0 : result.autoAppliedCount,
      executionResult: {
        scheduleId: lockedSchedule.id,
        scheduleName: lockedSchedule.name,
        status: result.wasDuplicate ? "skipped_duplicate" : "executed",
        ok: true,
        error: result.wasDuplicate
          ? "Omitido por run duplicado en la misma ventana."
          : null,
        runId: result.run?.id ?? null,
        autoAppliedCount: result.wasDuplicate ? 0 : result.autoAppliedCount,
        processedLeadCount: result.processedLeadCount ?? 0,
        limitedByMaxItems: result.limitedByMaxItems ?? false,
      },
    };
  } catch (error) {
    console.error("[automation] processDueAutomationSchedule error:", error);
    await releaseAutomationScheduleLock(lockedSchedule.id);

    return {
      schedule: normalizeAutomationScheduleRecord(lockedSchedule),
      run: null,
      autoAppliedCount: 0,
      executionResult: {
        scheduleId: lockedSchedule.id,
        scheduleName: lockedSchedule.name,
        status: "failed",
        ok: false,
        error:
          error instanceof Error
            ? error.message.slice(0, 300)
            : "Error al ejecutar el schedule.",
        runId: null,
        autoAppliedCount: 0,
        processedLeadCount: 0,
        limitedByMaxItems: false,
      },
    };
  }
}

export async function runDueAutomationSchedules(): Promise<RunDueAutomationSchedulesResult> {
  const startedAt = new Date();
  const execution = await createSchedulerExecutionRecord();

  try {
    const schedules = await prisma.automationSchedule.findMany({
      where: {
        isEnabled: true,
      },
      orderBy: [
        {
          lastRunAt: "asc",
        },
        {
          updatedAt: "desc",
        },
      ],
      select: automationScheduleSelect,
    });

    const now = new Date();
    const dueSchedules = schedules.filter((schedule) =>
      isAutomationScheduleDue(normalizeAutomationScheduleRecord(schedule), now)
    );

    let latestRun: AutomationRun | null = null;
    let createdRunsCount = 0;
    let autoAppliedCount = 0;
    let skippedLockedCount = 0;
    let skippedDuplicateCount = 0;
    let skippedQuietHoursCount = 0;
    let limitedRunsCount = 0;
    const updatedSchedules: AutomationSchedule[] = [];
    const executionResults: RunDueAutomationSchedulesResult["executionResults"] = [];

    for (const schedule of dueSchedules) {
      const result = await processDueAutomationSchedule(schedule, now);

      if (result.schedule) {
        updatedSchedules.push(result.schedule);
      }

      if (result.executionResult.status === "executed" && result.run) {
        latestRun = result.run;
        createdRunsCount += 1;
      }

      if (result.executionResult.status === "executed") {
        autoAppliedCount += result.autoAppliedCount;
      }

      if (result.executionResult.status === "skipped_locked") {
        skippedLockedCount += 1;
      }

      if (result.executionResult.status === "skipped_duplicate") {
        skippedDuplicateCount += 1;
      }

      if (result.executionResult.status === "skipped_quiet_hours") {
        skippedQuietHoursCount += 1;
      }

      if (
        result.executionResult.status === "executed" &&
        result.executionResult.limitedByMaxItems
      ) {
        limitedRunsCount += 1;
      }

      executionResults.push(result.executionResult);
    }

    const errorSummaryParts = executionResults
      .flatMap((result) => {
        const parts: string[] = [];

        if (result.status !== "executed" && result.error) {
          parts.push(`${result.scheduleName}: ${result.error}`);
        }

        if (result.status === "executed" && result.limitedByMaxItems) {
          parts.push(
            `${result.scheduleName}: limitado a ${result.processedLeadCount} items por maxItemsPerRun`
          );
        }

        return parts;
      });

    return {
      ok: true,
      error: null,
      execution: await updateSchedulerExecutionRecord(execution.id, {
        status:
          executionResults.some((result) => !result.ok) && executionResults.length > 0
            ? "completed_with_errors"
            : "completed",
        schedulesChecked: schedules.length,
        schedulesRun: executionResults.filter(
          (result) => result.status === "executed"
        ).length,
        runsCreated: createdRunsCount,
        skippedLocked: skippedLockedCount,
        skippedDuplicate: skippedDuplicateCount,
        skippedQuietHours: skippedQuietHoursCount,
        limitedRuns: limitedRunsCount,
        safeActionsApplied: autoAppliedCount,
        errorSummary:
          errorSummaryParts.length > 0 ? errorSummaryParts.join(" | ") : null,
        startedAt,
        finishedAt: new Date(),
      }),
      checkedCount: schedules.length,
      dueCount: dueSchedules.length,
      executedCount: executionResults.filter(
        (result) => result.status === "executed"
      ).length,
      createdRunsCount,
      autoAppliedCount,
      latestRun,
      schedules: updatedSchedules,
      executionResults,
    };
  } catch (error) {
    console.error("[automation] runDueAutomationSchedules error:", error);

    return {
      ok: false,
      error: "No se pudieron ejecutar los schedules listos.",
      execution: await updateSchedulerExecutionRecord(execution.id, {
        status: "failed",
        schedulesChecked: 0,
        schedulesRun: 0,
        runsCreated: 0,
        skippedLocked: 0,
        skippedDuplicate: 0,
        skippedQuietHours: 0,
        limitedRuns: 0,
        safeActionsApplied: 0,
        errorSummary:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Error al ejecutar el runner de schedules.",
        startedAt,
        finishedAt: new Date(),
      }),
      checkedCount: 0,
      dueCount: 0,
      executedCount: 0,
      createdRunsCount: 0,
      autoAppliedCount: 0,
      latestRun: null,
      schedules: [],
      executionResults: [],
    };
  }
}
