import { AppShell } from "@/components/app-shell";
import { LeadsListControls } from "@/components/leads-list-controls";
import { LeadsPagination } from "@/components/leads-pagination";
import { LeadsPanel } from "@/components/leads-panel";
import {
  parsePositiveInt,
  sanitizeLeadFilter,
  sanitizeLeadSort,
} from "@/lib/leads/list-query";
import { getPaginatedLeadsForPanel, getWorkspaceShellData } from "@/lib/workspace-data";

type LeadsPageProps = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    sort?: string;
    page?: string;
    pageSize?: string;
  }>;
};

export default async function LeadsPage({ searchParams }: LeadsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedQuery = resolvedSearchParams?.q?.trim() ?? "";
  const requestedFilter = sanitizeLeadFilter(resolvedSearchParams?.filter);
  const requestedSort = sanitizeLeadSort(resolvedSearchParams?.sort);
  const requestedPage = parsePositiveInt(resolvedSearchParams?.page, 1);
  const requestedPageSize = parsePositiveInt(resolvedSearchParams?.pageSize, 20);

  const [shellData, paginatedLeads] = await Promise.all([
    getWorkspaceShellData(),
    getPaginatedLeadsForPanel({
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
          label: "Leads en pagina",
          value: String(leads.length),
          helper: "Lote cargado actualmente en la vista core.",
        },
        {
          label: "Total filtrado",
          value: String(pagination.totalLeads),
          tone: "info",
          helper: "Resultado server-side para query, filtro y orden actual.",
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
          title: "Vista core del sistema",
          description:
            "Todo lo operativo por lead vive aca: filtros, drawer, seguimiento, notas, historial y estados.",
          tone: "info",
        },
      ]}
      title="Leads"
      description="Vista core de operacion comercial con lectura, seguimiento, historial y detalle por lead."
      primaryAction={{
        label: "Ir a Operaciones",
        href: "/operations",
      }}
      contextPanel={{
        eyebrow: "Pipeline comercial",
        title: "Operacion por lead",
        description:
          "Este modulo concentra el trabajo fino: priorizar, abrir detalle, cambiar estado, cargar notas y sostener seguimiento sin salir del flujo.",
        footer:
          "Operaciones queda como centro de automatizacion global. Leads queda como la mesa de trabajo por registro.",
      }}
    >
      <div className="space-y-4">
        <LeadsListControls
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
