"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";

import {
  applyLeadAutomationDecisionAction,
  createAutomationRunAction,
  executeAutomationScheduleAction,
  runDueAutomationSchedulesAction,
  updateAutomationSchedulePolicyAction,
} from "@/app/actions";
import type {
  AutomationAutoApplyPolicy,
  AutomationConfidence,
  AutomationSchedule,
  AutomationSchedulerExecution,
  AutomationRun,
  AutomationRunItem,
  AutomationRunItemStatus,
  AutomationRunSummary,
  LeadAutoAction,
  LeadItem,
} from "@/components/leads-panel/types";
import { buildLeadListHref } from "@/lib/leads/list-query";
import {
  DEFAULT_AUTO_APPLY_ACTIONS,
  getLeadAutomationActionLabel,
  getNormalizedAutomationAutoApplyPolicy,
  isSafeAutoApplicableAutomationRunItem,
} from "@/lib/leads/automation-engine";
import {
  getAutomationScheduleIntervalLabel,
  getAutomationScheduleMaxItemsPerRun,
  getAutomationScheduleNextRunAt,
  getAutomationScheduleRunWindowLabel,
  isAutomationScheduleDue,
  isAutomationScheduleWithinRunWindow,
} from "@/lib/automation/schedule-utils";
import { getOutreachChannelLabel } from "@/lib/lead-format";
import type { FilterType, SortType } from "@/lib/leads/lead-ui";
import { formatDate, getStatusBadge, getStatusLabel } from "@/lib/leads/lead-ui";
import { getWhatsAppUrlFromLead } from "@/lib/outreach/whatsapp-message";

type RunItemFilter = "all" | AutomationRunItemStatus;

function subscribeToHydration() {
  return () => {};
}

function ScheduleNextRunLabel({ schedule }: { schedule: AutomationSchedule }) {
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);

  // Keep SSR and initial hydration identical before reading the clock or locale.
  if (!hydrated) {
    return "Calculando...";
  }

  const nextRunAt = getAutomationScheduleNextRunAt(schedule);
  return nextRunAt ? formatDate(nextRunAt.toISOString()) : "Sin programar";
}

type SchedulePolicyDraft = {
  autoApplySafe: boolean;
  autoApplyMinConfidence: AutomationConfidence;
  autoApplyActions: LeadAutoAction[];
  respectQuietHours: boolean;
  runWindowStart: string;
  runWindowEnd: string;
  timezone: string;
  maxItemsPerRun: number;
};

const AUTO_APPLY_CONFIDENCE_OPTIONS: Array<{
  value: AutomationConfidence;
  label: string;
}> = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
];

const AUTO_APPLY_ACTION_OPTIONS: Array<{
  value: LeadAutoAction;
  label: string;
}> = [
  { value: "contact_now", label: "Contactar ahora" },
  { value: "follow_up", label: "Hacer seguimiento" },
  { value: "send_to_sales", label: "Enviar a ventas" },
  { value: "review_manually", label: "Revisar manualmente" },
  { value: "discard", label: "Descartar" },
  { value: "close", label: "Cerrar" },
];

type OperationsAutomationPanelProps = {
  leads: LeadItem[];
  initialRun: AutomationRun | null;
  recentRuns: AutomationRunSummary[];
  schedules: AutomationSchedule[];
  latestSchedulerExecution: AutomationSchedulerExecution | null;
  recentSchedulerExecutions: AutomationSchedulerExecution[];
  runNotFound?: boolean;
  queryContext: {
    q: string;
    filter: string;
    sort: string;
    page: number;
    pageSize: number;
  };
};

function toRunSummary(run: AutomationRun): AutomationRunSummary {
  return {
    id: run.id,
    source: run.source,
    scheduleId: run.scheduleId ?? null,
    scheduleName: run.scheduleName ?? null,
    query: run.query,
    filter: run.filter,
    sort: run.sort,
    page: run.page,
    pageSize: run.pageSize,
    status: run.status,
    analyzedCount: run.analyzedCount,
    decisionCount: run.decisionCount,
    appliedCount: run.appliedCount,
    failedCount: run.failedCount,
    pendingCount: run.pendingCount,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
  };
}

function getRunStatusClasses(status: AutomationRunSummary["status"]) {
  if (status === "completed") {
    return "border border-emerald-900/50 bg-emerald-950/20 text-emerald-200";
  }

  if (status === "completed_with_failures") {
    return "border border-amber-900/50 bg-amber-950/20 text-amber-200";
  }

  if (status === "in_progress") {
    return "border border-cyan-900/50 bg-cyan-950/20 text-cyan-200";
  }

  return "border border-zinc-700 bg-zinc-900 text-zinc-300";
}

function getRunStatusLabel(status: AutomationRunSummary["status"]) {
  if (status === "completed") {
    return "Completado";
  }

  if (status === "completed_with_failures") {
    return "Completado con fallos";
  }

  if (status === "in_progress") {
    return "En curso";
  }

  return "Pendiente";
}

function getItemFilterLabel(filter: RunItemFilter) {
  if (filter === "pending") {
    return "Pendientes";
  }

  if (filter === "applied") {
    return "Aplicadas";
  }

  if (filter === "failed") {
    return "Fallidas";
  }

  return "Todos";
}

function getRunItemStatusLabel(status: AutomationRunItemStatus) {
  if (status === "pending") {
    return "Pendiente";
  }

  if (status === "applied") {
    return "Aplicada";
  }

  return "Fallida";
}

function getSchedulerExecutionStatusClasses(
  status: AutomationSchedulerExecution["status"]
) {
  if (status === "completed") {
    return "border border-emerald-900/50 bg-emerald-950/20 text-emerald-200";
  }

  if (status === "completed_with_errors") {
    return "border border-amber-900/50 bg-amber-950/20 text-amber-200";
  }

  if (status === "failed") {
    return "border border-rose-900/50 bg-rose-950/20 text-rose-200";
  }

  return "border border-cyan-900/50 bg-cyan-950/20 text-cyan-200";
}

function getSchedulerExecutionStatusLabel(
  status: AutomationSchedulerExecution["status"]
) {
  if (status === "completed") {
    return "Completado";
  }

  if (status === "completed_with_errors") {
    return "Completado con errores";
  }

  if (status === "failed") {
    return "Fallido";
  }

  return "En curso";
}

function upsertRecentRun(
  currentRuns: AutomationRunSummary[],
  nextRun: AutomationRunSummary
) {
  return [nextRun, ...currentRuns.filter((run) => run.id !== nextRun.id)].slice(0, 6);
}

function toSchedulePolicyDraft(schedule: AutomationSchedule): SchedulePolicyDraft {
  return {
    autoApplySafe: schedule.autoApplySafe,
    autoApplyMinConfidence: schedule.autoApplyMinConfidence,
    autoApplyActions: schedule.autoApplyActions,
    respectQuietHours: schedule.respectQuietHours,
    runWindowStart: schedule.runWindowStart,
    runWindowEnd: schedule.runWindowEnd,
    timezone: schedule.timezone,
    maxItemsPerRun: schedule.maxItemsPerRun,
  };
}

function getResolvedAutoApplyPolicy(
  schedule: AutomationSchedule | null | undefined
): AutomationAutoApplyPolicy {
  if (schedule) {
    return getNormalizedAutomationAutoApplyPolicy({
      enabled: schedule.autoApplySafe,
      minConfidence: schedule.autoApplyMinConfidence,
      allowedActions: schedule.autoApplyActions,
    });
  }

  return getNormalizedAutomationAutoApplyPolicy({
    enabled: true,
    minConfidence: "high",
    allowedActions: DEFAULT_AUTO_APPLY_ACTIONS,
  });
}

function getAutoApplyActionsLabel(actions: LeadAutoAction[]) {
  if (actions.length === 0) {
    return "Sin acciones";
  }

  return actions
    .map((action) =>
      AUTO_APPLY_ACTION_OPTIONS.find((option) => option.value === action)?.label ?? action
    )
    .join(", ");
}

export function OperationsAutomationPanel({
  leads,
  initialRun,
  recentRuns,
  schedules,
  latestSchedulerExecution,
  recentSchedulerExecutions,
  runNotFound = false,
  queryContext,
}: OperationsAutomationPanelProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeRun, setActiveRun] = useState<AutomationRun | null>(initialRun);
  const [recentRunsState, setRecentRunsState] =
    useState<AutomationRunSummary[]>(recentRuns);
  const [itemFilter, setItemFilter] = useState<RunItemFilter>("pending");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExecutingQueue, setIsExecutingQueue] = useState(false);
  const [schedulesState, setSchedulesState] = useState<AutomationSchedule[]>(schedules);
  const [isRunningDueSchedules, setIsRunningDueSchedules] = useState(false);
  const [latestSchedulerExecutionState, setLatestSchedulerExecutionState] =
    useState<AutomationSchedulerExecution | null>(latestSchedulerExecution);
  const [recentSchedulerExecutionsState, setRecentSchedulerExecutionsState] =
    useState<AutomationSchedulerExecution[]>(recentSchedulerExecutions);
  const [schedulePolicyDrafts, setSchedulePolicyDrafts] = useState<
    Record<string, SchedulePolicyDraft>
  >(() =>
    Object.fromEntries(schedules.map((schedule) => [schedule.id, toSchedulePolicyDraft(schedule)]))
  );
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [busyScheduleId, setBusyScheduleId] = useState<string | null>(null);
  const [savingScheduleId, setSavingScheduleId] = useState<string | null>(null);

  const itemCounts = useMemo(() => {
    if (!activeRun) {
      return {
        all: 0,
        pending: 0,
        applied: 0,
        failed: 0,
      };
    }

    return activeRun.items.reduce(
      (counts, item) => {
        counts.all += 1;
        counts[item.status] += 1;
        return counts;
      },
      {
        all: 0,
        pending: 0,
        applied: 0,
        failed: 0,
      } satisfies Record<RunItemFilter, number>
    );
  }, [activeRun]);

  const visibleAutomationItems = useMemo(() => {
    if (!activeRun) {
      return [];
    }

    return activeRun.items.filter((item) =>
      itemFilter === "all" ? true : item.status === itemFilter
    );
  }, [activeRun, itemFilter]);

  const pendingItems = useMemo(
    () => (activeRun ? activeRun.items.filter((item) => item.status === "pending") : []),
    [activeRun]
  );
  const activeRunSchedule = useMemo(
    () =>
      activeRun?.scheduleId
        ? schedulesState.find((schedule) => schedule.id === activeRun.scheduleId) ?? null
        : null,
    [activeRun?.scheduleId, schedulesState]
  );
  const activeRunAutoApplyPolicy = useMemo(
    () => getResolvedAutoApplyPolicy(activeRunSchedule),
    [activeRunSchedule]
  );
  const safeAutoApplicableItems = useMemo(
    () =>
      pendingItems.filter((item) =>
        isSafeAutoApplicableAutomationRunItem(item, activeRunAutoApplyPolicy)
      ),
    [activeRunAutoApplyPolicy, pendingItems]
  );
  const pendingReviewCount = Math.max(
    0,
    (activeRun?.pendingCount ?? 0) - safeAutoApplicableItems.length
  );
  const dueSchedulesCount = useMemo(
    () => schedulesState.filter((schedule) => isAutomationScheduleDue(schedule)).length,
    [schedulesState]
  );

  function buildOperationsHref(runId?: string) {
    return buildLeadListHref({
      pathname,
      q: queryContext.q,
      filter: queryContext.filter as FilterType,
      sort: queryContext.sort as SortType,
      page: queryContext.page,
      pageSize: queryContext.pageSize,
      extraParams: runId ? { run: runId } : undefined,
    });
  }

  function syncRun(run: AutomationRun) {
    setActiveRun(run);
    setRecentRunsState((current) => upsertRecentRun(current, toRunSummary(run)));
  }

  function syncSchedule(schedule: AutomationSchedule) {
    setSchedulePolicyDrafts((current) => ({
      ...current,
      [schedule.id]: toSchedulePolicyDraft(schedule),
    }));
    setSchedulesState((current) => {
      const next = [schedule, ...current.filter((item) => item.id !== schedule.id)];
      return next.sort((left, right) => {
        if (left.isEnabled !== right.isEnabled) {
          return Number(right.isEnabled) - Number(left.isEnabled);
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      });
    });
  }

  function syncSchedulerExecution(execution: AutomationSchedulerExecution) {
    setLatestSchedulerExecutionState(execution);
    setRecentSchedulerExecutionsState((current) => [
      execution,
      ...current.filter((item) => item.id !== execution.id),
    ].slice(0, 6));
  }

  function updateSchedulePolicyDraft(
    scheduleId: string,
    nextDraft: Partial<SchedulePolicyDraft>
  ) {
    setSchedulePolicyDrafts((current) => {
      const schedule =
        schedulesState.find((item) => item.id === scheduleId) ??
        schedules.find((item) => item.id === scheduleId) ??
        null;
      const currentDraft = current[scheduleId] ??
        (schedule
          ? toSchedulePolicyDraft(schedule)
          : {
              autoApplySafe: false,
              autoApplyMinConfidence: "high",
              autoApplyActions: DEFAULT_AUTO_APPLY_ACTIONS,
              respectQuietHours: false,
              runWindowStart: "09:00",
              runWindowEnd: "21:00",
              timezone: "America/Buenos_Aires",
              maxItemsPerRun: 20,
            });

      return {
        ...current,
        [scheduleId]: {
          ...currentDraft,
          ...nextDraft,
        },
      };
    });
  }

  async function saveSchedulePolicy(schedule: AutomationSchedule) {
    const draft = schedulePolicyDrafts[schedule.id] ?? toSchedulePolicyDraft(schedule);

    if (savingScheduleId || busyScheduleId || isRunningDueSchedules) {
      return;
    }

    setSavingScheduleId(schedule.id);
    setActionMessage(null);
    setActionError(null);

    const result = await updateAutomationSchedulePolicyAction({
      scheduleId: schedule.id,
      autoApplySafe: draft.autoApplySafe,
      autoApplyMinConfidence: draft.autoApplyMinConfidence,
      autoApplyActions: draft.autoApplyActions,
      respectQuietHours: draft.respectQuietHours,
      runWindowStart: draft.runWindowStart,
      runWindowEnd: draft.runWindowEnd,
      timezone: draft.timezone,
      maxItemsPerRun: draft.maxItemsPerRun,
    });

    setSavingScheduleId(null);

    if (!result.ok || !result.schedule) {
      setActionError(result.error ?? "No se pudo actualizar la política del schedule.");
      return;
    }

    syncSchedule(result.schedule);
    setActionMessage(`Política actualizada para ${result.schedule.name}.`);
  }

  function openLeadWhatsAppWindow(item: AutomationRunItem, delayMs = 0) {
    if (!item.lead) {
      return false;
    }

    const whatsappUrl = getWhatsAppUrlFromLead(item.lead);

    if (!whatsappUrl) {
      return false;
    }

    window.setTimeout(() => {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    }, delayMs);

    return true;
  }

  async function analyzeLoadedLeads() {
    if (leads.length === 0 || isAnalyzing) {
      return;
    }

    setIsAnalyzing(true);
    setActionMessage(null);
    setActionError(null);

    const result = await createAutomationRunAction({
      leadIds: leads.map((lead) => lead.id),
      context: queryContext,
    });

    setIsAnalyzing(false);

    if (!result.ok || !result.run) {
      setActionError(result.error ?? "No se pudo generar el run de automatizacion.");
      return;
    }

    syncRun(result.run);
    setItemFilter("pending");
    router.replace(buildOperationsHref(result.run.id));
    setActionMessage(
      `Run creado con ${result.run.decisionCount} decisiones sobre ${result.run.analyzedCount} leads.`
    );
  }

  async function applyAutomationRunItem(
    item: AutomationRunItem,
    options?: {
      mode?: "single" | "bulk" | "supervised_auto";
      executeWhatsApp?: boolean;
      delayMs?: number;
      suppressFeedback?: boolean;
    }
  ) {
    if (busyItemId) {
      return false;
    }

    const shouldExecuteWhatsApp = options?.executeWhatsApp ?? false;
    const mode = options?.mode ?? "single";

    setBusyItemId(item.id);

    const result = await applyLeadAutomationDecisionAction({
      runItemId: item.id,
      mode,
      executeWhatsApp: shouldExecuteWhatsApp,
    });

    setBusyItemId(null);

    if (result.automationRun) {
      syncRun(result.automationRun);
    }

    if (!result.ok) {
      setActionError(result.error ?? "No se pudo aplicar la sugerencia.");
      return false;
    }

    if (shouldExecuteWhatsApp && item.action === "contact_now") {
      openLeadWhatsAppWindow(item, mode === "bulk" ? options?.delayMs ?? 0 : 0);
    }

    if (!options?.suppressFeedback) {
      setActionError(null);
      setActionMessage(
        `Sugerencia aplicada: ${getLeadAutomationActionLabel(item.action)}.`
      );
    }

    return true;
  }

  async function executeAutomationQueue() {
    if (pendingItems.length === 0 || isExecutingQueue) {
      return;
    }

    setIsExecutingQueue(true);
    setActionMessage(null);
    setActionError(null);

    const counters: Record<string, number> = {};
    let appliedCount = 0;

    for (const [index, item] of pendingItems.entries()) {
      const wasApplied = await applyAutomationRunItem(item, {
        mode: "bulk",
        executeWhatsApp: item.action === "contact_now",
        delayMs: index * 400,
        suppressFeedback: true,
      });

      if (!wasApplied) {
        continue;
      }

      counters[item.action] = (counters[item.action] ?? 0) + 1;
      appliedCount += 1;
    }

    setIsExecutingQueue(false);

    const summary = [
      counters.contact_now
        ? `${counters.contact_now} ${counters.contact_now === 1 ? "preparación" : "preparaciones"} de contacto`
        : null,
      counters.follow_up
        ? `${counters.follow_up} seguimiento${counters.follow_up === 1 ? "" : "s"}`
        : null,
      counters.send_to_sales
        ? `${counters.send_to_sales} venta${counters.send_to_sales === 1 ? "" : "s"}`
        : null,
      counters.discard
        ? `${counters.discard} descarte${counters.discard === 1 ? "" : "s"}`
        : null,
      counters.review_manually
        ? `${counters.review_manually} revision${counters.review_manually === 1 ? "" : "es"}`
        : null,
      counters.close
        ? `${counters.close} cierre${counters.close === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    setActionMessage(
      `Se aplicaron ${appliedCount} sugerencias.${summary ? ` ${summary}.` : ""}`
    );
  }

  async function autoApplySafeItems() {
    if (safeAutoApplicableItems.length === 0 || isExecutingQueue) {
      return;
    }

    setIsExecutingQueue(true);
    setActionMessage(null);
    setActionError(null);

    const counters: Record<string, number> = {};
    let appliedCount = 0;

    for (const item of safeAutoApplicableItems) {
      const wasApplied = await applyAutomationRunItem(item, {
        mode: "supervised_auto",
        executeWhatsApp: false,
        suppressFeedback: true,
      });

      if (!wasApplied) {
        continue;
      }

      counters[item.action] = (counters[item.action] ?? 0) + 1;
      appliedCount += 1;
    }

    setIsExecutingQueue(false);

    const summary = [
      counters.contact_now
        ? `${counters.contact_now} ${counters.contact_now === 1 ? "preparación" : "preparaciones"} de contacto`
        : null,
      counters.follow_up
        ? `${counters.follow_up} seguimiento${counters.follow_up === 1 ? "" : "s"}`
        : null,
      counters.send_to_sales
        ? `${counters.send_to_sales} venta${counters.send_to_sales === 1 ? "" : "s"}`
        : null,
    ]
      .filter(Boolean)
      .join(", ");

    setActionMessage(
      `Se autoaplicaron ${appliedCount} sugerencias seguras.${summary ? ` ${summary}.` : ""}`
    );
  }

  async function runScheduleNow(schedule: AutomationSchedule) {
    if (busyScheduleId || isAnalyzing || isExecutingQueue) {
      return;
    }

    setBusyScheduleId(schedule.id);
    setActionMessage(null);
    setActionError(null);

    const result = await executeAutomationScheduleAction(schedule.id);

    setBusyScheduleId(null);

    if (!result.ok || !result.schedule || !result.run) {
      setActionError(result.error ?? "No se pudo ejecutar el schedule.");
      return;
    }

    syncSchedule(result.schedule);
    syncRun(result.run);
    setItemFilter("pending");
    router.replace(buildOperationsHref(result.run.id));
    setActionMessage(
      `Schedule ejecutado: ${result.schedule.name}. Se genero un nuevo run${result.autoAppliedCount > 0 ? ` y se autoaplicaron ${result.autoAppliedCount} seguras` : ""}.`
    );
  }

  async function runDueSchedulesNow() {
    if (isRunningDueSchedules || isAnalyzing || isExecutingQueue || busyScheduleId) {
      return;
    }

    setIsRunningDueSchedules(true);
    setActionMessage(null);
    setActionError(null);

    try {
      const result = await runDueAutomationSchedulesAction();

      if (!result.ok && !result.execution) {
        setActionError(result.error ?? "No se pudieron correr los schedules listos.");
        return;
      }

      result.schedules.forEach((schedule) => {
        syncSchedule(schedule);
      });

      if (result.execution) {
        syncSchedulerExecution(result.execution);
      }

      if (!result.ok) {
        setActionError(result.error ?? "No se pudieron correr los schedules listos.");
        return;
      }

      if (result.latestRun) {
        syncRun(result.latestRun);
        setItemFilter("pending");
        router.replace(buildOperationsHref(result.latestRun.id));
      }

      setActionMessage(
        result.executedCount > 0
          ? `Runner ejecutado. ${result.executedCount} schedules corridos, ${result.createdRunsCount} runs creados y ${result.autoAppliedCount} items autoaplicados.`
          : result.dueCount > 0
            ? "Se revisaron schedules listos, pero no se pudo crear un run nuevo."
        : "No habia schedules listos para correr en este momento."
      );
    } catch (error) {
      console.error("[operations] runDueSchedulesNow error:", error);
      setActionError("No se pudieron correr los schedules listos.");
    } finally {
      setIsRunningDueSchedules(false);
    }
  }

  return (
    <section className="space-y-4">
      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Schedules</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Base lista para automatización programada supervisada sin cron real.
            </p>
          </div>

          <div className="flex flex-col gap-3 xl:items-end">
            <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-400">
              <span>
                Activos:{" "}
                <span className="font-semibold text-white">
                  {schedulesState.filter((schedule) => schedule.isEnabled).length}
                </span>
              </span>
              <span>
                Due ahora:{" "}
                <span className="font-semibold text-white">{dueSchedulesCount}</span>
              </span>
            </div>

            <button
              type="button"
              onClick={runDueSchedulesNow}
              disabled={
                isRunningDueSchedules ||
                isAnalyzing ||
                isExecutingQueue ||
                busyScheduleId !== null
              }
              className="inline-flex h-9 items-center justify-center rounded-xl border border-amber-800 bg-amber-700/80 px-4 text-sm text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRunningDueSchedules ? "Corriendo runner..." : "Correr schedules due"}
            </button>
          </div>
        </div>

        {latestSchedulerExecutionState ? (
          <div className="mt-4 rounded-2xl border border-amber-900/40 bg-amber-950/10 px-4 py-3 text-sm text-zinc-300">
            <span className="font-medium text-white">Última ejecución:</span>{" "}
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${getSchedulerExecutionStatusClasses(
                latestSchedulerExecutionState.status
              )}`}
            >
              {getSchedulerExecutionStatusLabel(latestSchedulerExecutionState.status)}
            </span>{" "}
            revisó {latestSchedulerExecutionState.schedulesChecked} schedules, corrió{" "}
            {latestSchedulerExecutionState.schedulesRun}, creó{" "}
            {latestSchedulerExecutionState.runsCreated} runs, omitió{" "}
            {latestSchedulerExecutionState.skippedLocked} por lock y{" "}
            {latestSchedulerExecutionState.skippedDuplicate} por duplicado,{" "}
            {latestSchedulerExecutionState.skippedQuietHours} por horario, limitó{" "}
            {latestSchedulerExecutionState.limitedRuns} corridas, y autoaplicó{" "}
            {latestSchedulerExecutionState.safeActionsApplied} acciones seguras.{" "}
            <span className="text-zinc-500">
              {formatDate(
                latestSchedulerExecutionState.finishedAt ??
                  latestSchedulerExecutionState.startedAt
              )}
            </span>
            {latestSchedulerExecutionState.errorSummary ? (
              <span className="mt-1 block text-xs text-amber-300">
                {latestSchedulerExecutionState.errorSummary}
              </span>
            ) : null}
          </div>
        ) : null}

        {schedulesState.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/30 px-4 py-5 text-sm text-zinc-500">
            Todavía no hay schedules configurados. Esta vista no crea schedules automáticamente.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {schedulesState.map((schedule) => {
              const policyDraft =
                schedulePolicyDrafts[schedule.id] ?? toSchedulePolicyDraft(schedule);
              const normalizedDraftPolicy = getNormalizedAutomationAutoApplyPolicy({
                enabled: policyDraft.autoApplySafe,
                minConfidence: policyDraft.autoApplyMinConfidence,
                allowedActions: policyDraft.autoApplyActions,
              });

              return (
                <div
                  key={schedule.id}
                  className="rounded-2xl border border-zinc-800 bg-[#0b1220] px-4 py-3"
                >
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">
                            {schedule.name}
                          </p>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                              schedule.isEnabled
                                ? "border border-emerald-900/50 bg-emerald-950/20 text-emerald-200"
                                : "border border-zinc-700 bg-zinc-900 text-zinc-300"
                            }`}
                          >
                            {schedule.isEnabled ? "Activo" : "Inactivo"}
                          </span>
                          <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                            {schedule.autoApplySafe
                              ? "Autoaplicación activa"
                              : "Solo genera run"}
                          </span>
                          <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                            {getAutomationScheduleIntervalLabel(schedule)}
                          </span>
                          <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                            {policyDraft.respectQuietHours
                              ? "Respeta horario"
                              : "Sin quiet hours"}
                          </span>
                          <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                            Máx. {getAutomationScheduleMaxItemsPerRun(policyDraft)} items
                          </span>
                          {isAutomationScheduleDue(schedule) ? (
                            <span className="inline-flex rounded-full border border-amber-900/50 bg-amber-950/20 px-2 py-0.5 text-[10px] text-amber-200">
                              Due ahora
                            </span>
                          ) : null}
                          {policyDraft.respectQuietHours &&
                          !isAutomationScheduleWithinRunWindow(policyDraft) ? (
                            <span className="inline-flex rounded-full border border-rose-900/50 bg-rose-950/20 px-2 py-0.5 text-[10px] text-rose-200">
                              Fuera de ventana
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm text-zinc-300">
                          Filtro {schedule.filter} · orden {schedule.sort} · página{" "}
                          {schedule.page}/{schedule.pageSize}
                          {schedule.query ? ` · "${schedule.query}"` : ""}
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Último run:{" "}
                          <span className="text-zinc-300">
                            {schedule.lastRunAt
                              ? formatDate(schedule.lastRunAt)
                              : "Todavía no ejecutó"}
                          </span>
                          {" · "}Próximo:{" "}
                          <span className="text-zinc-300">
                            <ScheduleNextRunLabel schedule={schedule} />
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Política actual:{" "}
                          <span className="text-zinc-300">
                            {normalizedDraftPolicy.enabled
                              ? `Desde ${normalizedDraftPolicy.minConfidence} · ${getAutoApplyActionsLabel(
                                  normalizedDraftPolicy.allowedActions
                                )}`
                              : "Autoaplicación desactivada"}
                          </span>
                        </p>
                        <p className="mt-1 text-xs text-zinc-500">
                          Operación:{" "}
                          <span className="text-zinc-300">
                            {getAutomationScheduleRunWindowLabel(policyDraft)} · tope{" "}
                            {Math.max(1, policyDraft.maxItemsPerRun)} items por corrida
                          </span>
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => runScheduleNow(schedule)}
                        disabled={
                          busyScheduleId === schedule.id ||
                          savingScheduleId === schedule.id ||
                          !schedule.isEnabled
                        }
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-cyan-800 bg-cyan-700/80 px-4 text-sm text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {busyScheduleId === schedule.id
                          ? "Ejecutando..."
                          : "Ejecutar ahora"}
                      </button>
                    </div>

                    <div className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3 xl:grid-cols-[220px_180px_minmax(0,1fr)]">
                      <label className="flex items-center gap-2 text-sm text-zinc-300">
                        <input
                          type="checkbox"
                          checked={policyDraft.autoApplySafe}
                          onChange={(event) =>
                            updateSchedulePolicyDraft(schedule.id, {
                              autoApplySafe: event.target.checked,
                            })
                          }
                          disabled={savingScheduleId === schedule.id}
                          className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500"
                        />
                        Autoaplicar cuando cumpla regla
                      </label>

                      <label className="text-xs text-zinc-500">
                        Confianza mínima
                        <select
                          value={policyDraft.autoApplyMinConfidence}
                          onChange={(event) =>
                            updateSchedulePolicyDraft(schedule.id, {
                              autoApplyMinConfidence:
                                event.target.value as AutomationConfidence,
                            })
                          }
                          disabled={
                            savingScheduleId === schedule.id || !policyDraft.autoApplySafe
                          }
                          className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {AUTO_APPLY_CONFIDENCE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div>
                        <p className="text-xs text-zinc-500">Acciones permitidas</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {AUTO_APPLY_ACTION_OPTIONS.map((option) => {
                            const isChecked = policyDraft.autoApplyActions.includes(
                              option.value
                            );

                            return (
                              <label
                                key={option.value}
                                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                                  isChecked
                                    ? "border-cyan-800 bg-cyan-950/20 text-cyan-200"
                                    : "border-zinc-700 bg-zinc-900 text-zinc-300"
                                } ${
                                  savingScheduleId === schedule.id || !policyDraft.autoApplySafe
                                    ? "opacity-60"
                                    : ""
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(event) => {
                                    const nextActions = event.target.checked
                                      ? [...policyDraft.autoApplyActions, option.value]
                                      : policyDraft.autoApplyActions.filter(
                                          (action) => action !== option.value
                                        );

                                    updateSchedulePolicyDraft(schedule.id, {
                                      autoApplyActions: Array.from(new Set(nextActions)),
                                    });
                                  }}
                                  disabled={
                                    savingScheduleId === schedule.id ||
                                    !policyDraft.autoApplySafe
                                  }
                                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500"
                                />
                                {option.label}
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px_220px_220px_auto] xl:col-span-3">
                        <label className="flex items-center gap-2 text-sm text-zinc-300">
                          <input
                            type="checkbox"
                            checked={policyDraft.respectQuietHours}
                            onChange={(event) =>
                              updateSchedulePolicyDraft(schedule.id, {
                                respectQuietHours: event.target.checked,
                              })
                            }
                            disabled={savingScheduleId === schedule.id}
                            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-cyan-500 focus:ring-cyan-500"
                          />
                          Respetar horario operativo
                        </label>

                        <label className="text-xs text-zinc-500">
                          Desde
                          <input
                            type="time"
                            value={policyDraft.runWindowStart}
                            onChange={(event) =>
                              updateSchedulePolicyDraft(schedule.id, {
                                runWindowStart: event.target.value,
                              })
                            }
                            disabled={
                              savingScheduleId === schedule.id ||
                              !policyDraft.respectQuietHours
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <label className="text-xs text-zinc-500">
                          Hasta
                          <input
                            type="time"
                            value={policyDraft.runWindowEnd}
                            onChange={(event) =>
                              updateSchedulePolicyDraft(schedule.id, {
                                runWindowEnd: event.target.value,
                              })
                            }
                            disabled={
                              savingScheduleId === schedule.id ||
                              !policyDraft.respectQuietHours
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <label className="text-xs text-zinc-500">
                          Zona horaria
                          <input
                            type="text"
                            value={policyDraft.timezone}
                            onChange={(event) =>
                              updateSchedulePolicyDraft(schedule.id, {
                                timezone: event.target.value,
                              })
                            }
                            disabled={savingScheduleId === schedule.id}
                            className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <label className="text-xs text-zinc-500">
                          Máximo por corrida
                          <input
                            type="number"
                            min={1}
                            value={policyDraft.maxItemsPerRun}
                            onChange={(event) =>
                              updateSchedulePolicyDraft(schedule.id, {
                                maxItemsPerRun: Math.max(
                                  1,
                                  Number(event.target.value) || 1
                                ),
                              })
                            }
                            disabled={savingScheduleId === schedule.id}
                            className="mt-1 h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => saveSchedulePolicy(schedule)}
                          disabled={savingScheduleId === schedule.id || busyScheduleId !== null}
                          className="inline-flex h-9 items-center justify-center self-start rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {savingScheduleId === schedule.id
                            ? "Guardando..."
                            : "Guardar política"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Ejecuciones del scheduler</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Trazabilidad real del runner automático antes de conectarlo a un cron.
            </p>
          </div>
        </div>

        {recentSchedulerExecutionsState.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/30 px-4 py-5 text-sm text-zinc-500">
            Todavía no hay ejecuciones persistidas del scheduler.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {recentSchedulerExecutionsState.map((execution) => (
              <div
                key={execution.id}
                className="rounded-2xl border border-zinc-800 bg-[#0b1220] px-4 py-3"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${getSchedulerExecutionStatusClasses(
                          execution.status
                        )}`}
                      >
                        {getSchedulerExecutionStatusLabel(execution.status)}
                      </span>
                      <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                        {execution.id.slice(0, 8)}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatDate(execution.startedAt)}
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-zinc-300">
                      {execution.schedulesChecked} revisados · {execution.schedulesRun} corridos ·{" "}
                      {execution.runsCreated} runs · {execution.skippedLocked} lock ·{" "}
                      {execution.skippedDuplicate} duplicados · {execution.skippedQuietHours} horario ·{" "}
                      {execution.limitedRuns} limitados ·{" "}
                      {execution.safeActionsApplied} seguras
                    </p>
                    {execution.errorSummary ? (
                      <p className="mt-1 text-xs text-amber-300">
                        {execution.errorSummary}
                      </p>
                    ) : null}
                  </div>

                  <div className="text-xs text-zinc-500">
                    Fin:{" "}
                    <span className="text-zinc-300">
                      {execution.finishedAt
                        ? formatDate(execution.finishedAt)
                        : "Todavía en curso"}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-4">
        <div className="rounded-3xl border border-cyan-900/40 bg-cyan-950/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">
            Lote cargado
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">{leads.length}</p>
          <p className="mt-2 text-sm text-zinc-400">
            Leads disponibles para analizar con el contexto actual.
          </p>
        </div>

        <div className="rounded-3xl border border-cyan-900/40 bg-cyan-950/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">
            Pendientes
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {activeRun?.pendingCount ?? 0}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Items todavía no aplicados del run activo.
          </p>
        </div>

        <div className="rounded-3xl border border-cyan-900/40 bg-cyan-950/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">
            Aplicadas
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {activeRun?.appliedCount ?? 0}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Decisiones ejecutadas y auditadas en la base.
          </p>
        </div>

        <div className="rounded-3xl border border-cyan-900/40 bg-cyan-950/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-cyan-200">
            Runs recientes
          </p>
          <p className="mt-3 text-3xl font-semibold text-white">
            {recentRunsState.length}
          </p>
          <p className="mt-2 text-sm text-zinc-400">
            Historial corto de ejecuciones persistidas.
          </p>
        </div>
      </div>

      <section className="rounded-3xl border border-cyan-900/40 bg-cyan-950/10 p-4 sm:p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <h3 className="text-xl font-semibold text-white">
              Cola automática persistida
            </h3>
            <p className="mt-1 text-sm text-zinc-400">
              La cola visible trabaja sobre un run especifico y puede compartirse por
              URL.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={analyzeLoadedLeads}
              disabled={isAnalyzing || leads.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-800 bg-cyan-700/80 px-4 text-sm text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isAnalyzing ? "Analizando..." : "Analizar leads"}
            </button>

            {activeRun?.id ? (
              <button
                type="button"
                onClick={autoApplySafeItems}
                disabled={
                  isExecutingQueue ||
                  busyItemId !== null ||
                  safeAutoApplicableItems.length === 0
                }
                className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-800 bg-amber-700/80 px-4 text-sm text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Autoaplicar seguras
              </button>
            ) : null}

            {activeRun?.id ? (
              <button
                type="button"
                onClick={executeAutomationQueue}
                disabled={isExecutingQueue || busyItemId !== null || pendingItems.length === 0}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-emerald-800 bg-emerald-700/80 px-4 text-sm text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isExecutingQueue ? "Ejecutando..." : "Ejecutar cola"}
              </button>
            ) : null}
          </div>
        </div>

        {runNotFound ? (
          <div className="mt-4 rounded-2xl border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
            No se encontró el run solicitado. Se mostró el run disponible más reciente.
          </div>
        ) : null}

        {activeRun ? (
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-[#0b1220] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getRunStatusClasses(
                      activeRun.status
                    )}`}
                  >
                    {getRunStatusLabel(activeRun.status)}
                  </span>
                  <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300">
                    Run {activeRun.id.slice(0, 8)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDate(activeRun.createdAt)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-zinc-400">
                  Origen:{" "}
                  <span className="text-zinc-200">
                    {activeRun.source === "schedule"
                      ? activeRun.scheduleName ?? "Schedule"
                      : "Manual"}
                  </span>{" "}
                  · filtro <span className="text-zinc-200">{activeRun.filter}</span> · orden{" "}
                  <span className="text-zinc-200">{activeRun.sort}</span> · página{" "}
                  <span className="text-zinc-200">
                    {activeRun.page}/{activeRun.pageSize}
                  </span>
                  {activeRun.query ? (
                    <>
                      {" "}· búsqueda{" "}
                      <span className="text-zinc-200">
                        &quot;{activeRun.query}&quot;
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-zinc-400 md:grid-cols-4 xl:grid-cols-7">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Analizados</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {activeRun.analyzedCount}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Decisiones</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {activeRun.decisionCount}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Pendientes</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {activeRun.pendingCount}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Autoaplicable</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {safeAutoApplicableItems.length}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Revisión</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {pendingReviewCount}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Aplicadas</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {activeRun.appliedCount}
                  </span>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                  <span className="block text-zinc-500">Fallidas</span>
                  <span className="mt-1 block text-base font-semibold text-white">
                    {activeRun.failedCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-cyan-900/40 bg-zinc-950/30 px-4 py-5 text-sm text-zinc-500">
            Todavía no hay un run persistido para este contexto. Podés analizar el
            lote cargado para crear la primera ejecución.
          </div>
        )}

        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
            {actionMessage}
          </div>
        ) : null}

        {actionError ? (
          <div className="mt-4 rounded-2xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
            {actionError}
          </div>
        ) : null}

        {activeRun ? (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {(["all", "pending", "applied", "failed"] as RunItemFilter[]).map(
                (filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setItemFilter(filter)}
                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs transition ${
                      itemFilter === filter
                        ? "border-white bg-white text-black"
                        : "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    {getItemFilterLabel(filter)} ({itemCounts[filter]})
                  </button>
                )
              )}
            </div>

            {visibleAutomationItems.length > 0 ? (
              <div className="mt-4 space-y-2">
                {visibleAutomationItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl border border-zinc-800 bg-[#0b1220] px-3 py-3"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-white">
                            {item.lead?.businessName ?? `Lead ${item.leadId.slice(0, 8)}`}
                          </p>
                          <span className="inline-flex rounded-full border border-cyan-900/50 bg-cyan-950/30 px-2 py-0.5 text-[10px] text-cyan-200">
                            {getLeadAutomationActionLabel(item.action)}
                          </span>
                          <span className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                            {item.confidence === "high"
                              ? "Alta"
                              : item.confidence === "medium"
                                ? "Media"
                                : "Baja"}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${
                              item.status === "applied"
                                ? "border border-emerald-900/50 bg-emerald-950/20 text-emerald-200"
                                : item.status === "failed"
                                  ? "border border-rose-900/50 bg-rose-950/20 text-rose-200"
                                  : "border border-zinc-700 bg-zinc-900 text-zinc-300"
                            }`}
                          >
                            {getRunItemStatusLabel(item.status)}
                          </span>
                          {item.action !== "contact_now" && item.suggestedStatus ? (
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${getStatusBadge(
                                item.suggestedStatus
                              )}`}
                            >
                              {getStatusLabel(item.suggestedStatus)}
                            </span>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm text-zinc-300">{item.reason}</p>

                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                          <span>{formatDate(item.createdAt)}</span>
                          {item.appliedAt ? (
                            <span>Aplicado: {formatDate(item.appliedAt)}</span>
                          ) : null}
                          {item.suggestedChannel ? (
                            <span>
                              Canal sugerido:{" "}
                              <span className="text-zinc-300">
                                {getOutreachChannelLabel(item.suggestedChannel)}
                              </span>
                            </span>
                          ) : null}
                        </div>

                        {item.failureReason ? (
                          <p className="mt-1 text-xs text-rose-300">
                            Fallo: {item.failureReason}
                          </p>
                        ) : null}
                      </div>

                      {item.status === "pending" ? (
                        <div className="flex shrink-0 items-center gap-2">
                          {item.action === "contact_now" &&
                          item.suggestedChannel === "whatsapp" &&
                          item.lead?.phone ? (
                            <button
                              type="button"
                              onClick={() =>
                                applyAutomationRunItem(item, {
                                  mode: "single",
                                  executeWhatsApp: true,
                                })
                              }
                              disabled={busyItemId === item.id || isExecutingQueue}
                              className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-800 bg-emerald-700/80 px-3 text-xs text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Abrir WhatsApp
                            </button>
                          ) : null}

                          <button
                            type="button"
                            onClick={() =>
                              applyAutomationRunItem(item, {
                                mode: "single",
                                executeWhatsApp: false,
                              })
                            }
                            disabled={busyItemId === item.id || isExecutingQueue}
                            className="inline-flex h-8 items-center justify-center rounded-lg border border-cyan-800 bg-cyan-700/80 px-3 text-xs text-white transition hover:bg-cyan-600 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Aplicar sugerencia
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-cyan-900/40 bg-zinc-950/30 px-4 py-5 text-sm text-zinc-500">
                Este run no tiene items para el filtro visual seleccionado.
              </div>
            )}
          </>
        ) : null}
      </section>

      <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Runs recientes</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Historial corto de ejecuciones para seguimiento y auditoria.
            </p>
          </div>
        </div>

        {recentRunsState.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/30 px-4 py-5 text-sm text-zinc-500">
            Todavía no hay ejecuciones persistidas de automatización.
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {recentRunsState.map((run) => {
              const isActive = activeRun?.id === run.id;

              return (
                <div
                  key={run.id}
                  className={`rounded-2xl border px-4 py-3 ${
                    isActive
                      ? "border-cyan-800 bg-cyan-950/10"
                      : "border-zinc-800 bg-[#0b1220]"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${getRunStatusClasses(
                            run.status
                          )}`}
                        >
                          {getRunStatusLabel(run.status)}
                        </span>
                        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-300">
                          {run.id.slice(0, 8)}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {formatDate(run.createdAt)}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-zinc-300">
                        {run.analyzedCount} analizados · {run.decisionCount} decisiones ·{" "}
                        {run.pendingCount} pendientes · {run.appliedCount} aplicados ·{" "}
                        {run.failedCount} fallidos
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Filtro {run.filter} · orden {run.sort} · pagina {run.page}/
                        {run.pageSize}
                        {run.query ? ` · "${run.query}"` : ""}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {isActive ? (
                        <span className="inline-flex rounded-full border border-cyan-900/50 bg-cyan-950/20 px-2 py-0.5 text-[10px] text-cyan-200">
                          Run activo
                        </span>
                      ) : null}

                      <Link
                        href={buildOperationsHref(run.id)}
                        className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                      >
                        Abrir run
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}


