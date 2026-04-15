"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { getStatusLabel } from "@/lib/leads/lead-ui";
import {
  applyAutomationRunItemRecord,
  createAutomationRunRecord,
  executeAutomationScheduleById,
  runDueAutomationSchedules,
  updateAutomationSchedulePolicy,
} from "@/lib/automation/schedule-runner";
import { runGoogleMapsSearchJob } from "@/services/search-jobs";

import type {
  AutomationSchedule,
  AutomationConfidence,
  LeadActivityItem,
  LeadAutoAction,
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

type ApplyAutomationDecisionInput = {
  mode?: "single" | "bulk" | "supervised_auto";
  executeWhatsApp?: boolean;
  runItemId?: string;
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

type SearchActionState = {
  ok: boolean;
  error: string | null;
  jobId: string | null;
};

function revalidateLeadWorkspacePaths() {
  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/operations");
}

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

async function persistLeadChanges({
  leadId,
  commercialStatus,
  followUp,
  activities = [],
}: PersistLeadChangesInput): Promise<PersistLeadChangesResult> {
  return prisma.$transaction(async (tx) => {
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
  });
}

export async function createAutomationRunAction(
  input: CreateAutomationRunInput
) {
  try {
    const result = await createAutomationRunRecord({
      leadIds: input.leadIds,
      context: input.context,
      source: input.source,
      scheduleId: input.scheduleId,
    });

    if (!result.ok) {
      return result;
    }

    revalidateLeadWorkspacePaths();

    return result;
  } catch (error) {
    console.error("[action] createAutomationRunAction error:", error);

    return {
      ok: false,
      error: "No se pudo guardar la ejecucion de automatizacion.",
      run: null,
    };
  }
}

export async function executeAutomationScheduleAction(scheduleId: string) {
  try {
    const result = await executeAutomationScheduleById(scheduleId);

    revalidateLeadWorkspacePaths();

    return result;
  } catch (error) {
    console.error("[action] executeAutomationScheduleAction error:", error);

    return {
      ok: false,
      error: "No se pudo ejecutar el schedule.",
      schedule: null as AutomationSchedule | null,
      run: null,
      autoAppliedCount: 0,
    };
  }
}

export async function runDueAutomationSchedulesAction() {
  try {
    const result = await runDueAutomationSchedules();

    revalidateLeadWorkspacePaths();

    return result;
  } catch (error) {
    console.error("[action] runDueAutomationSchedulesAction error:", error);

    return {
      ok: false,
      error: "No se pudieron ejecutar los schedules listos.",
      execution: null,
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

export async function updateAutomationSchedulePolicyAction(input: {
  scheduleId: string;
  autoApplySafe: boolean;
  autoApplyMinConfidence: AutomationConfidence;
  autoApplyActions: LeadAutoAction[];
  respectQuietHours: boolean;
  runWindowStart: string;
  runWindowEnd: string;
  timezone: string;
  maxItemsPerRun: number;
}) {
  try {
    const result = await updateAutomationSchedulePolicy(input);

    revalidateLeadWorkspacePaths();

    return result;
  } catch (error) {
    console.error("[action] updateAutomationSchedulePolicyAction error:", error);

    return {
      ok: false,
      error: "No se pudo actualizar la politica del schedule.",
      schedule: null as AutomationSchedule | null,
    };
  }
}

export async function runGoogleMapsSearchAction(
  _prevState: SearchActionState,
  formData: FormData
): Promise<SearchActionState> {
  const rawQuery = formData.get("query");
  const rawMaxResults = formData.get("maxResults");

  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const maxResults =
    typeof rawMaxResults === "string" && rawMaxResults.trim() !== ""
      ? Number(rawMaxResults)
      : 3;

  if (!query) {
    return {
      ok: false,
      error: "La busqueda no puede estar vacia.",
      jobId: null,
    };
  }

  if (!Number.isInteger(maxResults) || maxResults <= 0) {
    return {
      ok: false,
      error: "La cantidad maxima de resultados debe ser un entero mayor a 0.",
      jobId: null,
    };
  }

  try {
    const savedJob = await runGoogleMapsSearchJob(query, maxResults);

    revalidateLeadWorkspacePaths();

    return {
      ok: true,
      error: null,
      jobId: savedJob?.id ?? null,
    };
  } catch (error) {
    console.error("[action] runGoogleMapsSearchAction error:", error);

    return {
      ok: false,
      error:
        "Ocurrio un error al ejecutar la busqueda. Revisa el servidor e intenta nuevamente.",
      jobId: null,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function markLeadsAsReadyForSalesAction(leadIds: string[]) {
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return {
      ok: false,
      error: "No se recibieron leads para actualizar.",
      updatedCount: 0,
      activities: [] as LeadActivityItem[],
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.lead.updateMany({
        where: {
          id: {
            in: leadIds,
          },
        },
        data: {
          commercialStatus: "ready",
        },
      });

      const createdActivities = await Promise.all(
        leadIds.map((leadId) =>
          tx.leadActivity.create({
            data: {
              leadId,
              type: "sent_to_sales",
              label: "Lead enviado a ventas",
            },
          })
        )
      );

      return {
        updatedCount: updateResult.count,
        activities: createdActivities.map(toLeadActivityItem),
      };
    });

    revalidateLeadWorkspacePaths();

    return {
      ok: true,
      error: null,
      updatedCount: result.updatedCount,
      activities: result.activities,
    };
  } catch (error) {
    console.error("[action] markLeadsAsReadyForSalesAction error:", error);

    return {
      ok: false,
      error: "No se pudo actualizar el estado comercial de los leads.",
      updatedCount: 0,
      activities: [] as LeadActivityItem[],
    };
  }
}

export async function markLeadsAsMarkedAction(leadIds: string[]) {
  if (!Array.isArray(leadIds) || leadIds.length === 0) {
    return {
      ok: false,
      error: "No se recibieron leads para marcar.",
      updatedCount: 0,
      activities: [] as LeadActivityItem[],
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const updateResult = await tx.lead.updateMany({
        where: {
          id: {
            in: leadIds,
          },
        },
        data: {
          commercialStatus: "marked",
        },
      });

      const createdActivities = await Promise.all(
        leadIds.map((leadId) =>
          tx.leadActivity.create({
            data: {
              leadId,
              type: "marked",
              label: "Lead marcado",
            },
          })
        )
      );

      return {
        updatedCount: updateResult.count,
        activities: createdActivities.map(toLeadActivityItem),
      };
    });

    revalidateLeadWorkspacePaths();

    return {
      ok: true,
      error: null,
      updatedCount: result.updatedCount,
      activities: result.activities,
    };
  } catch (error) {
    console.error("[action] markLeadsAsMarkedAction error:", error);

    return {
      ok: false,
      error: "No se pudo marcar el estado comercial de los leads.",
      updatedCount: 0,
      activities: [] as LeadActivityItem[],
    };
  }
}

export async function addLeadNoteAction(leadId: string, content: string) {
  if (!leadId || !content || content.trim() === "") {
    return {
      ok: false,
      error: "La nota no puede estar vacia.",
      note: null,
      activity: null as LeadActivityItem | null,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const note = await tx.leadNote.create({
        data: {
          leadId,
          content: content.trim(),
        },
      });

      const activity = await tx.leadActivity.create({
        data: {
          leadId,
          type: "note_added",
          label: "Se agrego una observacion",
        },
      });

      return {
        note,
        activity: toLeadActivityItem(activity),
      };
    });

    revalidateLeadWorkspacePaths();

    return {
      ok: true,
      error: null,
      note: {
        ...result.note,
        createdAt: result.note.createdAt.toISOString(),
      },
      activity: result.activity,
    };
  } catch (error) {
    console.error("[action] addLeadNoteAction error:", error);

    return {
      ok: false,
      error: "No se pudo guardar la nota.",
      note: null,
      activity: null as LeadActivityItem | null,
    };
  }
}

export async function updateLeadCommercialStatusAction(
  leadId: string,
  status: string
) {
  if (!leadId || !status) {
    return {
      ok: false,
      error: "Faltan datos para actualizar el estado.",
      commercialStatus: null,
      activity: null as LeadActivityItem | null,
    };
  }

  try {
    const result = await persistLeadChanges({
      leadId,
      commercialStatus: status,
      activities: [buildStatusChangedActivity(status)],
    });

    revalidateLeadWorkspacePaths();

    return {
      ok: true,
      error: null,
      commercialStatus: result.commercialStatus,
      activity: result.activities[0] ?? null,
    };
  } catch (error) {
    console.error("[action] updateLeadCommercialStatusAction error:", error);

    return {
      ok: false,
      error: "No se pudo actualizar el estado comercial.",
      commercialStatus: null,
      activity: null as LeadActivityItem | null,
    };
  }
}

export async function saveLeadFollowUpAction(
  leadId: string,
  followUp: LeadFollowUpInput
) {
  if (!leadId) {
    return {
      ok: false,
      error: "Falta el lead para guardar seguimiento.",
      followUp: null,
      activity: null as LeadActivityItem | null,
    };
  }

  try {
    const result = await persistLeadChanges({
      leadId,
      followUp,
      activities: [
        {
          type: "follow_up_updated",
          label: "Seguimiento actualizado",
          metadata: formatFollowUpMetadata(followUp),
        },
      ],
    });

    revalidateLeadWorkspacePaths();

    return {
      ok: true,
      error: null,
      followUp: result.followUp,
      activity: result.activities[0] ?? null,
    };
  } catch (error) {
    console.error("[action] saveLeadFollowUpAction error:", error);

    return {
      ok: false,
      error: "No se pudo guardar el seguimiento.",
      followUp: null,
      activity: null as LeadActivityItem | null,
    };
  }
}

export async function applyLeadAutomationDecisionAction(
  input: ApplyAutomationDecisionInput
) {
  try {
    if (!input.runItemId) {
      return {
        ok: false,
        error: "Falta el item de automatizacion para aplicar.",
        commercialStatus: null,
        followUp: null,
        activities: [] as LeadActivityItem[],
        automationRun: null,
      };
    }

    const result = await applyAutomationRunItemRecord({
      runItemId: input.runItemId,
      mode: input.mode,
      executeWhatsApp: input.executeWhatsApp,
    });

    revalidateLeadWorkspacePaths();

    return result;
  } catch (error) {
    console.error("[action] applyLeadAutomationDecisionAction error:", error);

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
