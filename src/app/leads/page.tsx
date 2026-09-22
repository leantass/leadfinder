import { AppShell } from "@/components/app-shell";
import { LeadsListControls } from "@/components/leads-list-controls";
import { LeadsPagination } from "@/components/leads-pagination";
import { LeadsPanel } from "@/components/leads-panel";
import {
  parsePositiveInt,
  sanitizeLeadFilter,
  sanitizeLeadOrigin,
  sanitizeLeadSort,
} from "@/lib/leads/list-query";
import { getPaginatedLeadsForPanel, getWorkspaceShellData } from "@/lib/workspace-data";

type LeadsPageProps = {
  searchParams?: Promise<{
    origin?: string;
    q?: string;
    filter?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedOrigin = sanitizeLeadOrigin(resolvedSearchParams?.origin);
  const requestedQuery = resolvedSearchParams?.q?.trim() ?? "";
  const requestedFilter = sanitizeLeadFilter(resolvedSearchParams?.filter);
  const requestedSort = sanitizeLeadSort(resolvedSearchParams?.sort);
  const requestedPage = parsePositiveInt(resolvedSearchParams?.page, 1);
  const requestedPageSize = parsePositiveInt(resolvedSearchParams?.pageSize, 20);

  const [shellData, paginatedLeads] = await Promise.all([
    getWorkspaceShellData(),
    getPaginatedLeadsForPanel({
      origin: requestedOrigin,
      page: requestedPage,
      pageSize: requestedPageSize,
      q: requestedQuery,
      filter: requestedFilter,
      sort: requestedSort,
    }),
  ]);

  const { leads, pagination, queryState } = paginatedLeads;

  return (
    <AppShell
      metrics={[
        {
          label: "Leads en página",
          value: String(leads.length),
          helper: "Leads cargados en esta página.",
        },
        {
          label: "Total filtrado",
          value: String(pagination.totalLeads),
          tone: "info",
          helper: "Leads que coinciden con la búsqueda y los filtros aplicados.",
        },
        {
          label: "Seguimiento vencido",
          value: String(shellData.counts.followUpOverdueCount),
          tone: "warning",
          helper: "Leads que merecen retoma operativa.",
        },
        {
          label: "Automatizables",
          value: String(shellData.counts.automationReadyLeadsCount),
          helper: "Base candidata a pasar por Operaciones.",
        },
      ]}
      alerts={[
        {
          title: "Gestión comercial",
          description:
            "Todo lo operativo por lead vive acá: filtros, detalle, seguimiento, notas, historial y estados.",
          tone: "info",
        },
      ]}
      title="Leads"
      description="Vista de operación comercial con lectura, seguimiento, historial y detalle por lead."
      primaryAction={{
        label: "Ir a Operaciones",
        href: "/operations",
      }}
      contextPanel={{
        eyebrow: "Proceso comercial",
        title: "Operación por lead",
        description:
          "Este módulo concentra el trabajo fino: priorizar, abrir detalle, cambiar estado, cargar notas y sostener seguimiento sin salir del flujo.",
        footer:
          "Operaciones queda como centro de automatización global. Leads queda como la mesa de trabajo por registro.",
      }}
    >
      <div className="space-y-4">
        <LeadsListControls
          key={JSON.stringify(queryState) + pagination.pageSize}
          enableLeadFilters
          pathname="/leads"
          queryState={queryState}
          pageSize={pagination.pageSize}
        />

        <LeadsPagination
          pathname="/leads"
          queryState={queryState}
          pagination={pagination}
        />

        <LeadsPanel
          leads={leads}
          initialFilter={queryState.filter}
          initialSortBy={queryState.sort}
          initialSearchTerm={queryState.q}
          showListingControls={false}
        />
      </div>
    </AppShell>
  );
}
