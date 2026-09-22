import Link from "next/link";
import { LeadsFilterSelectors } from "@/components/leads-filter-selectors";

import type { FilterType, SortType } from "@/lib/leads/lead-ui";
import {
  leadFilterOptions,
  leadOriginOptions,
  type LeadOriginFilter,
  leadPageSizeOptions,
  leadSortOptions,
} from "@/lib/leads/list-query";

type LeadsListControlsProps = {
  pathname: string;
  enableLeadFilters?: boolean;
  queryState: {
    origin?: LeadOriginFilter;
    q: string;
    filter: FilterType;
    sort: SortType;
  };
  pageSize: number;
  extraParams?: Record<string, string | number | null | undefined>;
};

export function LeadsListControls({
  pathname,
  queryState,
  pageSize,
  extraParams,
  enableLeadFilters = false,
}: LeadsListControlsProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4">
      <form className="space-y-3" method="get" action={pathname}>
        <input type="hidden" name="page" value="1" />
        {Object.entries(extraParams ?? {}).map(([key, value]) =>
          value === null || value === undefined || value === "" ? null : (
            <input key={key} type="hidden" name={key} value={String(value)} />
          )
        )}

        <div className={enableLeadFilters ? "grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4 [&>div]:min-w-0" : "grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_220px_220px_140px_auto]"}>
          <div>
            <label
              htmlFor={`${pathname}-query`}
              className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500"
            >
              Buscar
            </label>
            <input
              id={`${pathname}-query`}
              name="q"
              type="text"
              defaultValue={queryState.q}
              placeholder="Nombre, teléfono, sitio web, estado o nota"
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-500"
            />
          </div>

          {enableLeadFilters ? (
            <>
              <div>
                <label htmlFor={`${pathname}-origin`} className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500">Origen</label>
                <select id={`${pathname}-origin`} name="origin" defaultValue={queryState.origin ?? "all"} className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300">
                  {leadOriginOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <LeadsFilterSelectors key={queryState.filter} pathname={pathname} filter={queryState.filter} />
            </>
          ) : <div>
            <label
              htmlFor={`${pathname}-filter`}
              className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500"
            >
              Filtro
            </label>
            <select
              id={`${pathname}-filter`}
              name="filter"
              defaultValue={queryState.filter}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-900"
            >
              {leadFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>}

          <div>
            <label
              htmlFor={`${pathname}-sort`}
              className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500"
            >
              Orden
            </label>
            <select
              id={`${pathname}-sort`}
              name="sort"
              defaultValue={queryState.sort}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-900"
            >
              {leadSortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor={`${pathname}-page-size`}
              className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500"
            >
              Leads por página
            </label>
            <select
              id={`${pathname}-page-size`}
              name="pageSize"
              defaultValue={String(pageSize)}
              className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-900"
            >
              {leadPageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              type="submit"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-violet-800 bg-violet-600/90 px-5 text-sm font-medium text-white transition hover:bg-violet-500"
            >
              Aplicar
            </button>

            <Link
              href={enableLeadFilters ? `${pathname}?origin=all` : pathname}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
            >
              Limpiar
            </Link>
          </div>
        </div>
      </form>
    </section>
  );
}
