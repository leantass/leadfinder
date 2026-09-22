"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavigationIcon =
  | "dashboard"
  | "search"
  | "contacts"
  | "sources"
  | "scrapers"
  | "leads"
  | "campaigns"
  | "operations"
  | "reports"
  | "settings";

type NavigationItem = {
  label: string;
  href: string;
  badge?: string;
  icon: NavigationIcon;
};

type MetricCard = {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning" | "info";
  helper?: string;
};

type ActivityItem = {
  title: string;
  detail: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
};

type AlertItem = {
  title: string;
  description: string;
  tone?: "default" | "warning" | "danger" | "info";
};

type FunnelItem = {
  label: string;
  value: string;
  helper?: string;
};

type ContextPanel = {
  eyebrow?: string;
  title: string;
  description: string;
  footer?: string;
};

type AppShellProps = {
  children: React.ReactNode;
  metrics?: MetricCard[];
  activity?: ActivityItem[];
  alerts?: AlertItem[];
  funnel?: FunnelItem[];
  title: string;
  description: string;
  primaryAction?: {
    label: string;
    href: string;
  };
  contextPanel?: ContextPanel;
};

const navigation: NavigationItem[] = [
  { label: "Dashboard", href: "/", icon: "dashboard" },
  { label: "Búsquedas", href: "/searches", icon: "search" },
  { label: "Contactos", href: "/contacts", icon: "contacts" },
  { label: "Leads", href: "/leads", icon: "leads" },
  { label: "Operaciones", href: "/operations", icon: "operations" },
];

function getMetricToneClasses(tone: MetricCard["tone"] = "default") {
  if (tone === "success") {
    return "border-emerald-900/70 bg-emerald-950/30 text-emerald-300";
  }

  if (tone === "warning") {
    return "border-amber-900/70 bg-amber-950/30 text-amber-300";
  }

  if (tone === "info") {
    return "border-cyan-900/70 bg-cyan-950/30 text-cyan-300";
  }

  return "border-zinc-800 bg-zinc-900 text-white";
}

function getDotToneClasses(
  tone: ActivityItem["tone"] | AlertItem["tone"] = "default"
) {
  if (tone === "success") {
    return "bg-emerald-400";
  }

  if (tone === "warning") {
    return "bg-amber-400";
  }

  if (tone === "danger") {
    return "bg-red-400";
  }

  if (tone === "info") {
    return "bg-cyan-400";
  }

  return "bg-zinc-500";
}

function NavIcon({ icon }: { icon: NavigationIcon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (icon === "dashboard") {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="8" height="8" rx="2" />
        <rect x="13" y="3" width="8" height="5" rx="2" />
        <rect x="13" y="10" width="8" height="11" rx="2" />
        <rect x="3" y="13" width="8" height="8" rx="2" />
      </svg>
    );
  }

  if (icon === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    );
  }

  if (icon === "contacts") {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="3" />
        <circle cx="9" cy="10" r="2.5" />
        <path d="M5.5 17c.7-2.1 1.9-3.1 3.5-3.1s2.8 1 3.5 3.1" />
        <path d="M15 9h3" />
        <path d="M15 13h3" />
      </svg>
    );
  }

  if (icon === "sources") {
    return (
      <svg {...common}>
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
        <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }

  if (icon === "scrapers") {
    return (
      <svg {...common}>
        <path d="M8 4h8" />
        <path d="M12 4v6" />
        <path d="M6 10h12" />
        <path d="M9 10v10" />
        <path d="M15 10v10" />
        <path d="M4 14h5" />
        <path d="M15 14h5" />
        <path d="M4 18h5" />
        <path d="M15 18h5" />
      </svg>
    );
  }

  if (icon === "leads") {
    return (
      <svg {...common}>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M18 8h3" />
        <path d="M19.5 6.5v3" />
      </svg>
    );
  }

  if (icon === "campaigns") {
    return (
      <svg {...common}>
        <path d="M3 11v2" />
        <path d="M6 9v6" />
        <path d="M10 7v10" />
        <path d="M14 5v14" />
        <path d="M18 8l3-3" />
        <path d="M18 8l3 3" />
        <path d="M18 8h-4" />
      </svg>
    );
  }

  if (icon === "operations") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.3 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.3l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.7 7.07l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c0 .68.4 1.29 1.03 1.55.16.07.33.1.52.1H21a2 2 0 1 1 0 4h-.09c-.68 0-1.29.4-1.55 1Z" />
      </svg>
    );
  }

  if (icon === "reports") {
    return (
      <svg {...common}>
        <path d="M4 20h16" />
        <path d="M7 16v-5" />
        <path d="M12 16V8" />
        <path d="M17 16v-8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.3 16.92l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.3l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06A2 2 0 1 1 19.7 7.07l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c0 .68.4 1.29 1.03 1.55.16.07.33.1.52.1H21a2 2 0 1 1 0 4h-.09c-.68 0-1.29.4-1.55 1Z" />
    </svg>
  );
}

function isNavigationItemActive(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

function SupportingColumn({
  activity,
  funnel,
}: {
  activity: ActivityItem[];
  funnel: FunnelItem[];
}) {
  return (
    <div className="space-y-6">
      {activity.length > 0 ? (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                Actividad
              </p>
              <h3 className="mt-1 text-lg font-semibold text-white">
                Estado operativo
              </h3>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {activity.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-zinc-800 bg-[#0b1220] p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getDotToneClasses(
                      item.tone
                    )}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white">{item.title}</p>
                    <p className="mt-1 text-sm leading-6 text-zinc-400">
                      {item.detail}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {funnel.length > 0 ? (
        <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
            Embudo
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            Flujo del módulo
          </h3>

          <div className="mt-5 space-y-3">
            {funnel.map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border border-zinc-800 bg-[#0b1220] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-zinc-300">{item.label}</span>
                  <span className="shrink-0 text-sm font-semibold text-white">
                    {item.value}
                  </span>
                </div>

                {item.helper ? (
                  <p className="mt-1 text-xs text-zinc-500">{item.helper}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function AppShell({
  children,
  metrics = [],
  activity = [],
  alerts = [],
  funnel = [],
  title,
  description,
  primaryAction,
  contextPanel,
}: AppShellProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const hasMetrics = metrics.length > 0;
  const hasSupportingColumn = activity.length > 0 || funnel.length > 0;
  const hasContextAside = alerts.length > 0 || Boolean(contextPanel);

  return (
    <main className="min-h-screen bg-[#070b14] text-white">
      <div className="mx-auto min-h-screen max-w-[1800px]">
        <div className="xl:flex xl:min-h-screen">
          <aside
            className={`border-b border-zinc-900 bg-[#090f1a] transition-[width] duration-300 ease-in-out xl:min-h-screen xl:shrink-0 xl:border-b-0 xl:border-r ${
              isSidebarCollapsed ? "xl:w-[92px]" : "xl:w-[280px]"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="border-b border-zinc-900 px-4 py-5 sm:px-6 xl:px-4 xl:py-6">
                <div className="flex min-h-[72px] items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-900/60 bg-cyan-950/40 text-sm font-semibold text-cyan-300 shadow-[0_0_0_1px_rgba(34,211,238,0.08)]">
                    LF
                  </div>

                  <div
                    className={`min-w-0 overflow-hidden transition-all duration-300 ease-in-out ${
                      isSidebarCollapsed
                        ? "max-w-0 opacity-0"
                        : "max-w-[180px] opacity-100"
                    }`}
                  >
                    <p className="truncate text-sm font-medium text-zinc-300">
                      Gestión de leads
                    </p>
                    <h1 className="truncate text-[20px] font-semibold tracking-tight text-white">
                      LeadFinder
                    </h1>
                  </div>
                </div>
              </div>

              <div className="px-3 py-4 sm:px-4 xl:px-3 xl:py-5">
                <div className="px-3">
                  <div className="h-4 overflow-hidden">
                    <p
                      className={`text-xs font-medium uppercase tracking-[0.22em] text-zinc-500 transition-opacity duration-200 ${
                        isSidebarCollapsed ? "opacity-0" : "opacity-100"
                      }`}
                    >
                      Navegación
                    </p>
                  </div>
                </div>

                <nav className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1 xl:gap-2">
                  {navigation.map((item) => {
                    const isActive = isNavigationItemActive(pathname, item.href);

                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        title={item.label}
                        className={`group flex min-h-[54px] items-center rounded-2xl border px-3 py-3 transition-all duration-300 ease-in-out ${
                          isActive
                            ? "border-cyan-900/60 bg-cyan-950/30 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.08)]"
                            : "border-transparent text-zinc-400 hover:border-zinc-800 hover:bg-zinc-900 hover:text-white"
                        } ${
                          isSidebarCollapsed
                            ? "justify-center xl:px-0"
                            : "justify-between"
                        }`}
                      >
                        <div
                          className={`flex items-center transition-all duration-300 ease-in-out ${
                            isSidebarCollapsed ? "justify-center" : "gap-3"
                          }`}
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-300 ${
                              isActive
                                ? "bg-cyan-900/35 text-cyan-200"
                                : "bg-zinc-900 text-zinc-400 group-hover:bg-zinc-800 group-hover:text-zinc-200"
                            }`}
                          >
                            <NavIcon icon={item.icon} />
                          </span>

                          <span
                            className={`overflow-hidden whitespace-nowrap transition-all duration-300 ease-in-out ${
                              isSidebarCollapsed
                                ? "max-w-0 opacity-0"
                                : "max-w-[148px] opacity-100"
                            }`}
                          >
                            {item.label}
                          </span>
                        </div>

                        <span
                          className={`overflow-hidden transition-all duration-300 ease-in-out ${
                            !item.badge || isSidebarCollapsed
                              ? "max-w-0 opacity-0"
                              : "max-w-[60px] opacity-100"
                          }`}
                        >
                          {item.badge ? (
                            <span className="ml-2 shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-zinc-400">
                              {item.badge}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

            </div>
          </aside>

          <section className="min-w-0 flex-1">
            <header className="border-b border-zinc-900 bg-[#070b14]/90 backdrop-blur">
              <div className="px-4 py-5 sm:px-6 xl:px-8 xl:py-6">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,560px)] xl:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setIsSidebarCollapsed((current) => !current)}
                      className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900/90 text-lg text-zinc-300 transition hover:border-zinc-700 hover:bg-zinc-800 hover:text-white xl:inline-flex"
                      title={isSidebarCollapsed ? "Expandir menu" : "Colapsar menu"}
                      aria-label={isSidebarCollapsed ? "Expandir menu" : "Colapsar menu"}
                    >
                      <span
                        className={`transition-transform duration-300 ease-in-out ${
                          isSidebarCollapsed ? "rotate-180" : "rotate-0"
                        }`}
                      >
                        {"<"}
                      </span>
                    </button>

                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                        Espacio de trabajo
                      </p>
                      <h2 className="truncate text-[20px] font-semibold tracking-tight text-white sm:text-[22px] xl:text-[24px]">
                        {title}
                      </h2>
                      <p className="mt-1 text-sm text-zinc-400">{description}</p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] xl:justify-self-end">
                    <div className="min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4 py-3">
                      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                        Área activa
                      </p>
                      <p className="mt-1 truncate text-sm text-zinc-300">{title}</p>
                    </div>

                    {primaryAction ? (
                      <Link
                        href={primaryAction.href}
                        className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-800 bg-cyan-700/90 px-5 text-sm font-medium text-white transition hover:bg-cyan-600"
                      >
                        {primaryAction.label}
                      </Link>
                    ) : (
                      <div />
                    )}

                    <div className="flex h-11 items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/90 px-4">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-semibold text-zinc-200">
                        OP
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">
                          Operador
                        </p>
                        <form action="/api/auth/logout" method="post">
                          <button type="submit" className="text-xs text-zinc-400 hover:text-zinc-100">
                            Cerrar sesión
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <div className="px-4 py-6 sm:px-6 xl:px-8 xl:py-8">
              <div className="space-y-6 xl:space-y-8">
                {hasMetrics ? (
                  <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
                    {metrics.map((metric) => (
                      <div
                        key={metric.label}
                        className={`rounded-3xl border p-5 ${getMetricToneClasses(
                          metric.tone
                        )}`}
                      >
                        <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                          {metric.label}
                        </p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight text-white">
                          {metric.value}
                        </p>
                        <p className="mt-2 text-sm text-zinc-400">
                          {metric.helper ?? "Sin novedades relevantes por ahora."}
                        </p>
                      </div>
                    ))}
                  </section>
                ) : null}

                {hasSupportingColumn ? (
                  <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
                    <div className="min-w-0">{children}</div>
                    <SupportingColumn activity={activity} funnel={funnel} />
                  </section>
                ) : (
                  <div className="min-w-0">{children}</div>
                )}
              </div>
            </div>
          </section>

          {hasContextAside ? (
            <aside className="hidden border-l border-zinc-900 bg-[#090f1a] 2xl:block 2xl:min-h-screen 2xl:w-[320px] 2xl:shrink-0">
              <div className="flex h-full flex-col">
                {contextPanel ? (
                  <div className="border-b border-zinc-900 px-6 py-5">
                    <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                      {contextPanel.eyebrow ?? "Contexto"}
                    </p>
                    <h3 className="mt-1 text-xl font-semibold text-white">
                      {contextPanel.title}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      {contextPanel.description}
                    </p>
                  </div>
                ) : null}

                {alerts.length > 0 ? (
                  <div className="space-y-4 px-6 py-6">
                    {alerts.map((alert) => (
                      <div
                        key={alert.title}
                        className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-5"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getDotToneClasses(
                              alert.tone
                            )}`}
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-white">
                              {alert.title}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-zinc-400">
                              {alert.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {contextPanel?.footer ? (
                  <div className="mt-auto border-t border-zinc-900 px-6 py-6">
                    <div className="rounded-3xl border border-cyan-900/50 bg-cyan-950/20 p-5">
                      <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">
                        Vision del módulo
                      </p>
                      <p className="mt-3 text-sm leading-6 text-zinc-300">
                        {contextPanel.footer}
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </main>
  );
}
