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
          label: "Jobs visibles",
          value: String(latestSearchJobs.length),
          helper: "Historial corto de adquisicion en esta vista.",
        },
        {
          label: "Leads captados",
          value: String(recentLeadVolume),
          tone: "info",
          helper: "Volumen agregado de los jobs listados abajo.",
        },
        {
          label: "Base de jobs",
          value: String(shellData.counts.searchJobCount),
          helper: "Cantidad total de busquedas persistidas.",
        },
      ]}
      alerts={[
        {
          title: "Resultado operativo",
          description:
            "Los resultados completos se operan desde Leads para no mezclar adquisicion con pipeline comercial.",
          tone: "info",
        },
      ]}
      title="Busquedas"
      description="Modulo de adquisicion para crear jobs, revisar historial y pasar resultados al pipeline."
      primaryAction={{
        label: "Abrir Leads",
        href: "/leads",
      }}
      contextPanel={{
        eyebrow: "Adquisicion",
        title: "Entrada de nuevos leads",
        description:
          "Esta area concentra la captura: lanzar scraping, revisar jobs y medir volumen reciente sin invadir la operacion comercial.",
        footer:
          "Cuando un job ya produjo datos, el siguiente paso natural es abrir Leads u Operaciones segun el momento del flujo.",
      }}
    >
      <div className="space-y-6">
        <section
          id="new-search-section"
          className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6"
        >
          <h3 className="text-xl font-semibold text-white">Nueva busqueda</h3>
          <p className="mt-2 text-sm text-zinc-400">
            Ejecuta scraping y genera nuevos leads sin salir del modulo de
            adquisicion.
          </p>

          <SearchForm />
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Flujo actual
            </p>
            <p className="mt-3 text-lg font-semibold text-white">
              Adquisicion separada del pipeline
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Busquedas concentra input y jobs. Leads concentra lectura comercial.
            </p>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5">
            <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
              Jobs ejecutados
            </p>
            <p className="mt-3 text-3xl font-semibold text-white">
              {shellData.counts.searchJobCount}
            </p>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              Base acumulada de adquisicion persistida.
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
                Ir al pipeline
              </Link>
            </div>
          </div>
        </section>

        <SearchJobsSection
          title="Historial de busquedas"
          description="Jobs ejecutados recientemente, con acceso rapido al volumen de leads generado."
          jobs={latestSearchJobs}
          badgeLabel={`${shellData.counts.searchJobCount} jobs`}
          footerHref="/leads"
          footerLabel="Ir a resultados en Leads"
        />
      </div>
    </AppShell>
  );
}
