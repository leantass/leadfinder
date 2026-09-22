import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { SearchForm } from "@/components/search-form";
import { SearchJobsSection } from "@/components/search-jobs-section";
import { getLatestSearchJobs, getWorkspaceShellData } from "@/lib/workspace-data";

export default async function SearchesPage() {
  const [shellData, latestSearchJobs] = await Promise.all([
    getWorkspaceShellData(),
    getLatestSearchJobs(12),
  ]);

  const recentLeadVolume = latestSearchJobs.reduce(
    (total, job) => total + job.leadCount,
    0
  );

  return (
    <AppShell
      metrics={[
        {
          label: "Búsquedas recientes",
          value: String(latestSearchJobs.length),
          helper: "Historial corto de adquisición en esta vista.",
        },
        {
          label: "Leads captados",
          value: String(recentLeadVolume),
          tone: "info",
          helper: "Volumen agregado de las búsquedas listadas abajo.",
        },
        {
          label: "Búsquedas totales",
          value: String(shellData.counts.searchJobCount),
          helper: "Cantidad total de búsquedas persistidas.",
        },
      ]}
      alerts={[
        {
          title: "Resultado operativo",
          description:
            "Los resultados completos se operan desde Leads para no mezclar adquisición con proceso comercial.",
          tone: "info",
        },
      ]}
      title="Búsquedas"
      description="Módulo de adquisición para crear búsquedas, revisar historial y pasar resultados al proceso comercial."
      primaryAction={{
        label: "Abrir Leads",
        href: "/leads",
      }}
      contextPanel={{
        eyebrow: "Adquisición",
        title: "Entrada de nuevos leads",
        description:
          "Esta área concentra la captura: buscar en Google Maps, revisar búsquedas y medir volumen reciente sin invadir la operación comercial.",
        footer:
          "Cuando una búsqueda ya produjo datos, el siguiente paso natural es abrir Leads u Operaciones según el momento del flujo.",
      }}
    >
      <div className="space-y-6">
        <section
          id="new-search-section"
          className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6"
        >
          <h3 className="text-xl font-semibold text-white">Nueva búsqueda</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Busca en Google Maps y genera nuevos leads sin salir del módulo de
            adquisición.
          </p>

          <SearchForm />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Flujo actual
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              Adquisición separada del proceso comercial
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Búsquedas concentra datos de búsqueda e historial. Leads concentra lectura comercial.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Búsquedas registradas
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {shellData.counts.searchJobCount}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Base acumulada de adquisición persistida.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Siguiente paso
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              Revisar resultados en Leads
            </p>
            <div className="mt-4">
              <Link
                href="/leads"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-cyan-800 bg-cyan-700/90 px-4 text-sm text-white transition hover:bg-cyan-600"
              >
                Ir al proceso comercial
              </Link>
            </div>
          </div>
        </section>

        <SearchJobsSection
          title="Historial de búsquedas"
          description="Búsquedas registradas recientemente, con acceso rapido al volumen de leads generado."
          jobs={latestSearchJobs}
          badgeLabel={`${shellData.counts.searchJobCount} búsquedas`}
          footerHref="/leads"
          footerLabel="Ir a resultados en Leads"
        />
      </div>
    </AppShell>
  );
}
