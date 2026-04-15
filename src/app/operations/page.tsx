import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { LeadsListControls } from "@/components/leads-list-controls";
import { LeadsPagination } from "@/components/leads-pagination";
import { OperationsAutomationPanel } from "@/components/operations-automation-panel";
import {
  parsePositiveInt,
  sanitizeLeadFilter,
  sanitizeLeadSort,
} from "@/lib/leads/list-query";
import {
  getAutomationRunById,
  getAutomationSchedules,
  getLatestAutomationSchedulerExecution,
  getLatestAutomationRunForContext,
  getPaginatedLeadsForPanel,
  getRecentAutomationRuns,
  getRecentAutomationSchedulerExecutions,
} from "@/lib/workspace-data";
import { isAutomationScheduleDue } from "@/lib/automation/schedule-utils";

type OperationsPageProps = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
    run?: string;
  }>;
};

export default async function OperationsPage({
  searchParams,
}: OperationsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedQuery = resolvedSearchParams?.q?.trim() ?? "";
  const requestedFilter = sanitizeLeadFilter(resolvedSearchParams?.filter);
  const requestedSort = sanitizeLeadSort(resolvedSearchParams?.sort);
  const requestedPage = parsePositiveInt(resolvedSearchParams?.page, 1);
  const requestedPageSize = parsePositiveInt(resolvedSearchParams?.pageSize, 20);
  const requestedRunId = resolvedSearchParams?.run?.trim() ?? "";

  const [
    paginatedLeads,
    selectedRun,
    latestRun,
    recentRuns,
    schedules,
    latestSchedulerExecution,
    recentSchedulerExecutions,
  ] = await Promise.all([
    getPaginatedLeadsForPanel({
      page: requestedPage,
      pageSize: requestedPageSize,
      q: requestedQuery,
      filter: requestedFilter,
      sort: requestedSort,
    }),
    requestedRunId ? getAutomationRunById(requestedRunId) : Promise.resolve(null),
    getLatestAutomationRunForContext({
      page: requestedPage,
      pageSize: requestedPageSize,
      q: requestedQuery,
      filter: requestedFilter,
      sort: requestedSort,
    }),
    getRecentAutomationRuns(),
    getAutomationSchedules(),
    getLatestAutomationSchedulerExecution(),
    getRecentAutomationSchedulerExecutions(),
  ]);

  const { leads, pagination, queryState } = paginatedLeads;
  const activeRun = selectedRun ?? latestRun;
  const runNotFound = Boolean(requestedRunId) && !selectedRun;
  const activeSchedules = schedules.filter((schedule) => schedule.isEnabled).length;
  const dueSchedules = schedules.filter((schedule) =>
    isAutomationScheduleDue(schedule)
  ).length;

  return (
    <AppShell
      metrics={[
        {
          label: "Schedules activos",
          value: String(activeSchedules),
          helper: "Polizas de automatizacion disponibles hoy.",
        },
        {
          label: "Due ahora",
          value: String(dueSchedules),
          tone: dueSchedules > 0 ? "warning" : "default",
          helper: "Schedules que podrian correr en este momento.",
        },
        {
          label: "Runs recientes",
          value: String(recentRuns.length),
          tone: "info",
          helper: "Historial corto de ejecuciones persistidas.",
        },
        {
          label: "Lote cargado",
          value: String(leads.length),
          helper: "Contexto actual para analisis y supervision.",
        },
      ]}
      alerts={[
        {
          title: "Fuente unica de automatizacion",
          description:
            "Operaciones ya es el lugar correcto para runs, cola, scheduler y ejecucion supervisada.",
          tone: "info",
        },
        latestSchedulerExecution
          ? {
              title: "Ultimo runner",
              description: `${latestSchedulerExecution.schedulesRun} schedules corridos y ${latestSchedulerExecution.runsCreated} runs creados en la ultima ejecucion.`,
              tone:
                latestSchedulerExecution.status === "failed"
                  ? "danger"
                  : latestSchedulerExecution.status === "completed_with_errors"
                    ? "warning"
                    : "info",
            }
          : {
              title: "Runner listo",
              description:
                "Todavia no hay ejecuciones del scheduler, pero la base ya esta preparada.",
              tone: "info",
            },
      ]}
      title="Operaciones"
      description="Centro de automatizacion supervisada, scheduler, cola automatica y ejecucion masiva."
      primaryAction={{
        label: "Ir a Leads",
        href: "/leads",
      }}
      contextPanel={{
        eyebrow: "Automatizacion",
        title: "Control global",
        description:
          "Este modulo concentra la lectura de runs, schedules, ejecuciones del scheduler y la automatizacion supervisada del sistema.",
        footer:
          "Leads sigue siendo la mesa de trabajo por registro. Operaciones es el lugar para mirar el sistema como flujo global.",
      }}
    >
      <div className="space-y-4">
        <LeadsListControls
          pathname="/operations"
          queryState={queryState}
          pageSize={pagination.pageSize}
          extraParams={activeRun ? { run: activeRun.id } : undefined}
        />

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">
                Automatizacion global
              </h3>
              <p className="mt-2 text-sm text-zinc-400">
                Esta vista trabaja sobre el conjunto filtrado actual y concentra
                analisis, scheduler, cola y ejecucion supervisada.
              </p>
            </div>

            <Link
              href="/leads"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            >
              Abrir vista por lead
            </Link>
          </div>
        </section>

        <OperationsAutomationPanel
          leads={leads}
          initialRun={activeRun}
          recentRuns={recentRuns}
          schedules={schedules}
          latestSchedulerExecution={latestSchedulerExecution}
          recentSchedulerExecutions={recentSchedulerExecutions}
          runNotFound={runNotFound}
          queryContext={{
            q: queryState.q,
            filter: queryState.filter,
            sort: queryState.sort,
            page: pagination.page,
            pageSize: pagination.pageSize,
          }}
        />

        <LeadsPagination
          pathname="/operations"
          queryState={queryState}
          pagination={pagination}
          extraParams={activeRun ? { run: activeRun.id } : undefined}
        />
      </div>
    </AppShell>
  );
}
