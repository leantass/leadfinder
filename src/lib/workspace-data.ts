import "server-only";
import { requireAuthenticatedOperator } from "@/lib/auth/operator";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import type {
  AutomationSchedule,
  AutomationSchedulerExecution,
  AutomationRun,
  AutomationConfidence,
  AutomationRunItemStatus,
  AutomationRunSource,
  AutomationRunStatus,
  AutomationRunSummary,
  LeadAutoAction,
} from "@/components/leads-panel/types";
import type { FilterType, SortType } from "@/lib/leads/lead-ui";
import {
  isCommercialLeadFilter,
  sanitizeLeadOrigin,
  type LeadOriginFilter,
  sanitizeLeadFilter,
  sanitizeLeadSort,
} from "@/lib/leads/list-query";

type AppMetric = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info";
  helper?: string;
};

type AppActivity = {
  title: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

type AppAlert = {
  title: string;
  description: string;
  tone?: "default" | "warning" | "danger" | "info";
};

type AppFunnel = {
  label: string;
  value: string;
  helper?: string;
};

type LeadListParams = {
  page?: number;
  pageSize?: number;
  q?: string;
  filter?: FilterType;
  sort?: SortType;
};

type LeadForPanelRecord = Prisma.LeadGetPayload<{
  include: {
    activities: true;
    notes: true;
  };
}>;

export const automationRunItemLeadSelect = {
  id: true,
  businessName: true,
  phone: true,
  website: true,
  score: true,
  businessType: true,
  suggestedOffer: true,
  offerReason: true,
} satisfies Prisma.LeadSelect;

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

type AutomationRunSummaryCore = Prisma.AutomationRunGetPayload<{
  select: {
    id: true;
    source: true;
    scheduleId: true;
    query: true;
    filter: true;
    sort: true;
    page: true;
    pageSize: true;
    status: true;
    analyzedCount: true;
    decisionCount: true;
    appliedCount: true;
    failedCount: true;
    createdAt: true;
    updatedAt: true;
  };
}>;

type AutomationRunRecord = Prisma.AutomationRunGetPayload<{
  include: {
    schedule: {
      select: {
        id: true;
        name: true;
      };
    };
    items: {
      include: {
        lead: {
          select: typeof automationRunItemLeadSelect;
        };
      };
    };
  };
}>;

type AutomationScheduleRecord = Prisma.AutomationScheduleGetPayload<{
  select: typeof automationScheduleSelect;
}>;

type AutomationSchedulerExecutionRecord =
  Prisma.AutomationSchedulerExecutionGetPayload<{
    select: typeof automationSchedulerExecutionSelect;
  }>;

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday() {
  const date = startOfToday();
  date.setDate(date.getDate() + 1);
  return date;
}

function normalizeLeadForPanel(lead: LeadForPanelRecord) {
  return {
    ...lead,
    scoreReasons: lead.scoreReasons ?? [],
    activity: (lead.activities ?? []).map((activity) => ({
      id: activity.id,
      leadId: activity.leadId,
      type: activity.type,
      label: activity.label,
      metadata: activity.metadata,
      createdAt: activity.createdAt.toISOString(),
    })),
    notes: (lead.notes ?? []).map((note) => ({
      id: note.id,
      content: note.content,
      createdAt: note.createdAt.toISOString(),
    })),
    followUp: {
      nextAction: lead.followUpNextAction ?? "",
      dueAt: lead.followUpDueAt ? lead.followUpDueAt.toISOString() : null,
    },
  };
}

function normalizeAutomationRunSummary(
  run: Pick<
    AutomationRunSummaryCore,
    | "id"
    | "source"
    | "scheduleId"
    | "query"
    | "filter"
    | "sort"
    | "page"
    | "pageSize"
    | "status"
    | "analyzedCount"
    | "decisionCount"
    | "appliedCount"
    | "failedCount"
    | "createdAt"
    | "updatedAt"
  >
  & {
    schedule?: {
      id: string;
      name: string;
    } | null;
  }
): AutomationRunSummary {
  return {
    id: run.id,
    source: run.source as AutomationRunSource,
    scheduleId: run.scheduleId ?? null,
    scheduleName: run.schedule?.name ?? null,
    query: run.query,
    filter: run.filter,
    sort: run.sort,
    page: run.page,
    pageSize: run.pageSize,
    status: run.status as AutomationRunStatus,
    analyzedCount: run.analyzedCount,
    decisionCount: run.decisionCount,
    appliedCount: run.appliedCount,
    failedCount: run.failedCount,
    pendingCount: Math.max(
      0,
      run.decisionCount - run.appliedCount - run.failedCount
    ),
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export function normalizeAutomationRun(run: AutomationRunRecord): AutomationRun {
  return {
    ...normalizeAutomationRunSummary(run),
    items: run.items.map((item) => ({
      id: item.id,
      runId: item.runId,
      leadId: item.leadId,
      action: item.action as AutomationRun["items"][number]["action"],
      confidence: item.confidence as AutomationRun["items"][number]["confidence"],
      reason: item.reason,
      suggestedStatus: item.suggestedStatus,
      suggestedChannel: item.suggestedChannel,
      suggestedMessagePreview: item.suggestedMessagePreview,
      status: item.status as AutomationRunItemStatus,
      createdAt: item.createdAt.toISOString(),
      appliedAt: item.appliedAt ? item.appliedAt.toISOString() : null,
      failureReason: item.failureReason,
      lead: item.lead
        ? {
            id: item.lead.id,
            businessName: item.lead.businessName,
            phone: item.lead.phone,
            website: item.lead.website,
            score: item.lead.score,
            businessType: item.lead.businessType,
            suggestedOffer: item.lead.suggestedOffer,
            offerReason: item.lead.offerReason,
          }
        : null,
    })),
  };
}

function normalizeAutomationSchedule(
  schedule: AutomationScheduleRecord
): AutomationSchedule {
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
    autoApplyMinConfidence:
      schedule.autoApplyMinConfidence as AutomationConfidence,
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

function normalizeAutomationSchedulerExecution(
  execution: AutomationSchedulerExecutionRecord
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

function buildLeadSearchWhere(query: string): Prisma.LeadWhereInput | null {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return null;
  }

  const searchClauses: Prisma.LeadWhereInput[] = [
    {
      businessName: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      phone: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      website: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      commercialStatus: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      businessType: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      suggestedOffer: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      offerReason: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      outreachStatus: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      outreachChannel: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      followUpNextAction: {
        contains: normalizedQuery,
        mode: "insensitive",
      },
    },
    {
      notes: {
        some: {
          content: {
            contains: normalizedQuery,
            mode: "insensitive",
          },
        },
      },
    },
  ];

  const scoreQuery = Number(normalizedQuery);

  if (Number.isInteger(scoreQuery)) {
    searchClauses.push({
      score: scoreQuery,
    });
  }

  return {
    OR: searchClauses,
  };
}

function buildLeadFilterWhere(filter: FilterType): Prisma.LeadWhereInput | null {
  if (filter === "all") {
    return null;
  }

  if (filter === "no-website") {
    return {
      OR: [{ website: null }, { website: "" }],
    };
  }

  if (isCommercialLeadFilter(filter)) {
    return { commercialStatus: filter };
  }

  if (filter === "with-follow-up") {
    return {
      OR: [
        {
          followUpDueAt: {
            not: null,
          },
        },
        {
          AND: [
            {
              followUpNextAction: {
                not: null,
              },
            },
            {
              NOT: {
                followUpNextAction: "",
              },
            },
          ],
        },
      ],
    };
  }

  if (filter === "without-follow-up") {
    return {
      AND: [
        {
          followUpDueAt: null,
        },
        {
          OR: [{ followUpNextAction: null }, { followUpNextAction: "" }],
        },
      ],
    };
  }

  if (filter === "follow-up-today") {
    return {
      followUpDueAt: {
        gte: startOfToday(),
        lt: endOfToday(),
      },
    };
  }

  if (filter === "follow-up-overdue") {
    return { followUpDueAt: { lt: startOfToday() } };
  }

  return null;
}

function buildLeadListWhere({
  q,
  filter,
  origin,
}: {
  q?: string;
  filter?: string;
  origin?: LeadOriginFilter;
}): Prisma.LeadWhereInput {
  const clauses: Prisma.LeadWhereInput[] = [];
  const searchWhere = buildLeadSearchWhere(q ?? "");
  const filterWhere = buildLeadFilterWhere(sanitizeLeadFilter(filter));

  if (searchWhere) {
    clauses.push(searchWhere);
  }

  if (filterWhere) {
    clauses.push(filterWhere);
  }

  const safeOrigin = sanitizeLeadOrigin(origin);
  if (safeOrigin !== "all") {
    clauses.push({ origin: safeOrigin === "manual" ? "MANUAL" : "SEARCH" });
  }

  if (clauses.length === 0) {
    return {};
  }

  return {
    AND: clauses,
  };
}

function buildLeadOrderBy(sort?: string): Prisma.LeadOrderByWithRelationInput[] {
  const safeSort = sanitizeLeadSort(sort);

  if (safeSort === "recent-desc") {
    return [{ scrapedAt: "desc" }];
  }

  if (safeSort === "name-asc") {
    return [{ businessName: "asc" }, { scrapedAt: "desc" }];
  }

  if (safeSort === "follow-up-asc") {
    return [
      {
        followUpDueAt: {
          sort: "asc",
          nulls: "last",
        },
      },
      { scrapedAt: "desc" },
    ];
  }

  if (safeSort === "follow-up-desc") {
    return [
      {
        followUpDueAt: {
          sort: "desc",
          nulls: "last",
        },
      },
      { scrapedAt: "desc" },
    ];
  }

  return [{ score: "desc" }, { scrapedAt: "desc" }];
}

function normalizeLeadListParams({
  page = 1,
  pageSize = 20,
  q = "",
  filter = "all",
  sort = "score-desc",
}: LeadListParams) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize =
    Number.isFinite(pageSize) && pageSize > 0
      ? Math.min(Math.floor(pageSize), 100)
      : 20;
  const safeFilter = sanitizeLeadFilter(filter);
  const safeSort = sanitizeLeadSort(sort);
  const safeQuery = q.trim();

  return {
    page: safePage,
    pageSize: safePageSize,
    q: safeQuery,
    filter: safeFilter,
    sort: safeSort,
  };
}

export async function getWorkspaceShellData() {
  await requireAuthenticatedOperator();
  const [
    leadCount,
    searchJobCount,
    qualifiedLeadsCount,
    automationReadyLeadsCount,
    whatsappOutreachLeadsCount,
    leadsWithoutWebsiteCount,
    followUpOverdueCount,
  ] = await Promise.all([
    prisma.lead.count(),
    prisma.searchJob.count(),
    prisma.lead.count({
      where: {
        outreachStatus: "qualified",
      },
    }),
    prisma.lead.count({
      where: {
        readyForAutomation: true,
      },
    }),
    prisma.lead.count({
      where: {
        outreachChannel: "whatsapp",
      },
    }),
    prisma.lead.count({
      where: {
        OR: [{ website: null }, { website: "" }],
      },
    }),
    prisma.lead.count({
      where: {
        followUpDueAt: {
          lt: startOfToday(),
        },
      },
    }),
  ]);

  const metrics: AppMetric[] = [
    {
      label: "Leads totales",
      value: String(leadCount),
      helper: `${searchJobCount} búsquedas ejecutadas en la base actual.`,
    },
    {
      label: "Calificados",
      value: String(qualifiedLeadsCount),
      tone: "success",
      helper: "Leads que ya tienen criterio comercial para avanzar.",
    },
    {
      label: "Automatizables",
      value: String(automationReadyLeadsCount),
      tone: "info",
      helper: "Listos para entrar en una secuencia operativa.",
    },
    {
      label: "Outreach WhatsApp",
      value: String(whatsappOutreachLeadsCount),
      tone: "warning",
      helper: "Leads cuyo canal sugerido ya es WhatsApp.",
    },
  ];

  const activity: AppActivity[] = [
    {
      title: "Sistema listo",
      detail: "Scraping, persistencia y panel comercial funcionando correctamente.",
      tone: "success",
    },
    {
      title: "Seguimiento operativo",
      detail:
        followUpOverdueCount > 0
          ? `${followUpOverdueCount} leads tienen seguimiento vencido y requieren atención.`
          : "No hay seguimientos vencidos en este momento.",
      tone: followUpOverdueCount > 0 ? "warning" : "info",
    },
  ];

  const alerts: AppAlert[] = [
    {
      title: "Leads listos para automatización",
      description:
        automationReadyLeadsCount > 0
          ? `${automationReadyLeadsCount} leads ya pueden entrar en flujo automatizado.`
          : "Todavía no hay leads listos para automatización.",
      tone: "info",
    },
    {
      title: "Leads sin web disponibles",
      description:
        leadsWithoutWebsiteCount > 0
          ? `${leadsWithoutWebsiteCount} oportunidades detectadas para venta directa.`
          : "Todavía no hay leads sin website.",
    },
  ];

  const funnel: AppFunnel[] = [
    { label: "Encontrados", value: String(leadCount) },
    { label: "Calificados", value: String(qualifiedLeadsCount) },
    { label: "Automatizables", value: String(automationReadyLeadsCount) },
    { label: "WhatsApp", value: String(whatsappOutreachLeadsCount) },
  ];

  return {
    metrics,
    activity,
    alerts,
    funnel,
    counts: {
      leadCount,
      searchJobCount,
      qualifiedLeadsCount,
      automationReadyLeadsCount,
      whatsappOutreachLeadsCount,
      leadsWithoutWebsiteCount,
      followUpOverdueCount,
    },
  };
}

export async function getLatestSearchJobs(limit = 5) {
  await requireAuthenticatedOperator();
  const jobs = await prisma.searchJob.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    include: {
      _count: {
        select: {
          leads: true,
        },
      },
    },
  });

  return jobs.map((job) => ({
    id: job.id,
    query: job.query,
    status: job.status,
    createdAt: job.createdAt.toISOString(),
    leadCount: job._count.leads,
  }));
}

export async function getPaginatedLeadsForPanel({
  origin,
  page = 1,
  pageSize = 20,
  q = "",
  filter = "all",
  sort = "score-desc",
}: LeadListParams & { origin?: LeadOriginFilter }) {
  await requireAuthenticatedOperator();
  const safeOrigin = sanitizeLeadOrigin(origin);
  const safeParams = normalizeLeadListParams({
    page,
    pageSize,
    q,
    filter,
    sort,
  });
  const where = buildLeadListWhere({
    q: safeParams.q,
    filter: safeParams.filter,
    origin: safeOrigin,
  });
  const orderBy = buildLeadOrderBy(safeParams.sort);
  const totalLeads = await prisma.lead.count({
    where,
  });
  const totalPages = Math.max(1, Math.ceil(totalLeads / safeParams.pageSize));
  const currentPage = Math.min(safeParams.page, totalPages);
  const skip = (currentPage - 1) * safeParams.pageSize;

  const leads = await prisma.lead.findMany({
    where,
    orderBy,
    skip,
    take: safeParams.pageSize,
    include: {
      activities: {
        orderBy: {
          createdAt: "desc",
        },
        take: 20,
      },
      notes: {
        orderBy: {
          createdAt: "desc",
        },
        take: 5,
      },
    },
  });

  return {
    leads: leads.map(normalizeLeadForPanel),
    pagination: {
      page: currentPage,
      pageSize: safeParams.pageSize,
      totalLeads,
      totalPages,
      hasPrevPage: currentPage > 1,
      hasNextPage: currentPage < totalPages,
    },
    queryState: {
      origin: safeOrigin,
      q: safeParams.q,
      filter: safeParams.filter,
      sort: safeParams.sort,
    },
  };
}

export async function getLeadIdsForListContext(params: LeadListParams) {
  // Internal runner query only. Its callers authorize via operator session or
  // runner secret; requiring a human cookie here would break Vercel Cron.
  const safeParams = normalizeLeadListParams(params);
  const where = buildLeadListWhere({
    q: safeParams.q,
    filter: safeParams.filter,
  });
  const orderBy = buildLeadOrderBy(safeParams.sort);
  const skip = (safeParams.page - 1) * safeParams.pageSize;

  const leads = await prisma.lead.findMany({
    where,
    orderBy,
    skip,
    take: safeParams.pageSize + 1,
    select: {
      id: true,
    },
  });

  return {
    leadIds: leads.slice(0, safeParams.pageSize).map((lead) => lead.id),
    hasMore: leads.length > safeParams.pageSize,
    queryState: safeParams,
  };
}

export async function getLatestAutomationRunForContext({
  page = 1,
  pageSize = 20,
  q = "",
  filter = "all",
  sort = "score-desc",
}: LeadListParams) {
  await requireAuthenticatedOperator();
  const safeParams = normalizeLeadListParams({
    page,
    pageSize,
    q,
    filter,
    sort,
  });

  const run = await prisma.automationRun.findFirst({
    where: {
      query: safeParams.q,
      filter: safeParams.filter,
      sort: safeParams.sort,
      page: safeParams.page,
      pageSize: safeParams.pageSize,
    },
    orderBy: {
      createdAt: "desc",
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

  return run ? normalizeAutomationRun(run) : null;
}

export async function getAutomationRunById(runId: string) {
  await requireAuthenticatedOperator();
  if (!runId || runId.trim() === "") {
    return null;
  }

  const run = await prisma.automationRun.findUnique({
    where: {
      id: runId,
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

  return run ? normalizeAutomationRun(run) : null;
}

export async function getRecentAutomationRuns(limit = 6) {
  await requireAuthenticatedOperator();
  const runs = await prisma.automationRun.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    include: {
      schedule: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return runs.map((run) => normalizeAutomationRunSummary(run));
}

export async function getAutomationSchedules() {
  await requireAuthenticatedOperator();
  const schedules = await prisma.automationSchedule.findMany({
    select: automationScheduleSelect,
    orderBy: [
      {
        isEnabled: "desc",
      },
      {
        updatedAt: "desc",
      },
    ],
  });

  return schedules.map((schedule) => normalizeAutomationSchedule(schedule));
}

export async function getLatestAutomationSchedulerExecution() {
  await requireAuthenticatedOperator();
  const execution = await prisma.automationSchedulerExecution.findFirst({
    orderBy: {
      createdAt: "desc",
    },
    select: automationSchedulerExecutionSelect,
  });

  return execution ? normalizeAutomationSchedulerExecution(execution) : null;
}

export async function getRecentAutomationSchedulerExecutions(limit = 6) {
  await requireAuthenticatedOperator();
  const executions = await prisma.automationSchedulerExecution.findMany({
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    select: automationSchedulerExecutionSelect,
  });

  return executions.map((execution) =>
    normalizeAutomationSchedulerExecution(execution)
  );
}

export async function getLatestLeadsForPanel(limit = 20) {
  await requireAuthenticatedOperator();
  const { leads } = await getPaginatedLeadsForPanel({
    page: 1,
    pageSize: limit,
  });

  return leads;
}

export async function getDashboardSummaryData() {
  await requireAuthenticatedOperator();
  const [urgentLeadsCount, hotWithoutRealWebsiteCount, followUpDueTodayCount] =
    await Promise.all([
      prisma.lead.count({
        where: {
          phone: {
            not: null,
          },
          commercialStatus: {
            notIn: ["discarded", "closed", "ready"],
          },
        },
      }),
      prisma.lead.count({
        where: {
          phone: {
            not: null,
          },
          websiteType: {
            not: "real",
          },
          commercialStatus: {
            notIn: ["discarded", "closed"],
          },
        },
      }),
      prisma.lead.count({
        where: {
          followUpDueAt: {
            gte: startOfToday(),
            lt: endOfToday(),
          },
        },
      }),
    ]);

  return {
    urgentLeadsCount,
    hotWithoutRealWebsiteCount,
    followUpDueTodayCount,
  };
}
