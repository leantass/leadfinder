import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { getSearchStatusLabel } from "@/components/search-jobs-section";
import {
  getDashboardSummaryData,
  getLatestSearchJobs,
  getWorkspaceShellData,
} from "@/lib/workspace-data";

function formatJobDate(value: Date | string) {
  return new Date(value).toLocaleString("es-AR");
}

export default async function Home() {
  const [shellData, latestSearchJobs, dashboardSummary] = await Promise.all([
    getWorkspaceShellData(),
    getLatestSearchJobs(4),
    getDashboardSummaryData(),
  ]);

  const focusCards = [
    {
      label: "Leads con teléfono por gestionar",
      value: String(dashboardSummary.urgentLeadsCount),
      detail: "Con teléfono registrado; excluye cerrados, descartados y listos para ventas.",
      href: "/leads",
      tone:
        dashboardSummary.urgentLeadsCount > 0
          ? "border-red-900/40 bg-red-950/10"
          : "border-zinc-800 bg-zinc-900/90",
    },
    {
      label: "Seguimientos hoy",
      value: String(dashboardSummary.followUpDueTodayCount),
      detail: "Bloque del día para no perder trazabilidad comercial.",
      href: "/leads?filter=follow-up-today",
      tone:
        dashboardSummary.followUpDueTodayCount > 0
          ? "border-amber-900/40 bg-amber-950/10"
          : "border-zinc-800 bg-zinc-900/90",
    },
    {
      label: "Candidatos a automatización",
      value: String(shellData.counts.automationReadyLeadsCount),
      detail: "Marcados como aptos; sujetos a las reglas de ejecución.",
      href: "/operations",
      tone:
        shellData.counts.automationReadyLeadsCount > 0
          ? "border-cyan-900/40 bg-cyan-950/10"
          : "border-zinc-800 bg-zinc-900/90",
    },
  ];

  const quickLinks = [
    {
      title: "Búsquedas",
      description: "Lanzar nuevas búsquedas y revisar adquisición reciente.",
      href: "/searches",
    },
    {
      title: "Leads",
      description: "Operar el proceso comercial, seguimiento y detalle.",
      href: "/leads",
    },
    {
      title: "Operaciones",
      description: "Revisar ejecuciones, programaciones y automatización supervisada.",
      href: "/operations",
    },
  ];

  return (
    <AppShell
      metrics={[
        {
          label: "Leads con teléfono por gestionar",
          value: String(dashboardSummary.urgentLeadsCount),
          tone: "warning",
          helper: "Con teléfono registrado; excluye cerrados, descartados y listos para ventas.",
        },
        {
          label: "Búsquedas totales",
          value: String(shellData.counts.searchJobCount),
          tone: "info",
          helper: "Adquisición ya separada de la operación comercial.",
        },
        {
          label: "Leads totales",
          value: String(shellData.counts.leadCount),
          helper: "Base total disponible para lectura ejecutiva.",
        },
      ]}
      alerts={[
        {
          title: "Seguimiento vencido",
          description:
            shellData.counts.followUpOverdueCount > 0
              ? `${shellData.counts.followUpOverdueCount} leads necesitan retomar seguimiento.`
              : "No hay seguimientos vencidos en este momento.",
          tone: shellData.counts.followUpOverdueCount > 0 ? "warning" : "info",
        },
        {
          title: "Candidatos a automatización",
          description:
            shellData.counts.automationReadyLeadsCount > 0
              ? `${shellData.counts.automationReadyLeadsCount} leads marcados como aptos; sujetos a las reglas de ejecución.`
              : "Todavía no hay candidatos a automatización.",
          tone: "info",
        },
      ]}
      title="Dashboard"
      description="Punto de arranque del día con foco ejecutivo, alertas y accesos rápidos."
      primaryAction={{
        label: "Abrir operaciones",
        href: "/operations",
      }}
      contextPanel={{
        eyebrow: "Centro de control",
        title: "Tablero ejecutivo",
        description:
          "Esta vista resume prioridad, riesgo y próximos movimientos sin mezclar adquisición, operación por lead y automatización en una sola pantalla.",
        footer:
          "La idea es empezar acá, detectar foco y luego entrar al módulo correcto para trabajar.",
      }}
    >
      <div className="space-y-6">
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Foco del día
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Tres frentes para arrancar sin perder contexto
              </h3>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
                El dashboard ya no intenta operar toda la plataforma. Solo marca
                prioridad, expone alertas reales y te empuja al módulo correcto.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-3">
            {focusCards.map((card) => (
              <div
                key={card.label}
                className={`rounded-3xl border p-5 ${card.tone}`}
              >
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  {card.label}
                </p>
                <p className="mt-3 text-3xl font-semibold text-white">
                  {card.value}
                </p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  {card.detail}
                </p>
                <div className="mt-4">
                  <Link
                    href={card.href}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                  >
                    Abrir módulo
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-white">Accesos rápidos</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Entradas claras a cada frente de trabajo principal.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {quickLinks.map((link) => (
                <Link
                  key={link.title}
                  href={link.href}
                  className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4 transition hover:border-zinc-700 hover:bg-zinc-900"
                >
                  <p className="text-sm font-semibold text-white">{link.title}</p>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {link.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
            <h3 className="text-xl font-semibold text-white">Resumen ejecutivo</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-400">
              El sistema ya está separado en adquisición, proceso comercial y operación
              automatizada. Desde acá solo ves la lectura corta para empezar.
            </p>

            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-zinc-300">Calificados para contacto</span>
                  <span className="text-sm font-semibold text-white">
                    {shellData.counts.qualifiedLeadsCount}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-zinc-300">Sin URL web registrada</span>
                  <span className="text-sm font-semibold text-white">
                    {shellData.counts.leadsWithoutWebsiteCount}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-zinc-300">WhatsApp sugerido</span>
                  <span className="text-sm font-semibold text-white">
                    {shellData.counts.whatsappOutreachLeadsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold text-white">Últimas búsquedas</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Lectura corta de adquisición para detectar si hace falta volver a
                Búsquedas.
              </p>
            </div>

            <Link
              href="/searches"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            >
              Ver Búsquedas
            </Link>
          </div>

          {latestSearchJobs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500">
              Todavía no hay búsquedas registradas.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {latestSearchJobs.map((job) => (
                <div
                  key={job.id}
                  className="rounded-2xl border border-zinc-800 bg-[#0b1220] px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {job.query}
                      </p>
                      <p className="mt-1 text-sm text-zinc-400">
                        {job.leadCount} leads - {formatJobDate(job.createdAt)}
                      </p>
                    </div>

                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                      {getSearchStatusLabel(job.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
