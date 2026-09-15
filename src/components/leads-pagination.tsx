import Link from "next/link";

import type { FilterType, SortType } from "@/lib/leads/lead-ui";
import { buildLeadListHref, type LeadOriginFilter } from "@/lib/leads/list-query";

type LeadsPaginationProps = {
  pathname: string;
  queryState: {
    origin?: LeadOriginFilter;
    q: string;
    filter: FilterType;
    sort: SortType;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalLeads: number;
    totalPages: number;
    hasPrevPage: boolean;
    hasNextPage: boolean;
  };
  extraParams?: Record<string, string | number | null | undefined>;
};

export function LeadsPagination({
  pathname,
  queryState,
  pagination,
  extraParams,
}: LeadsPaginationProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-zinc-400">
          Mostrando página{" "}
          <span className="font-semibold text-white">{pagination.page}</span> de{" "}
          <span className="font-semibold text-white">{pagination.totalPages}</span>{" "}
          sobre{" "}
          <span className="font-semibold text-white">{pagination.totalLeads}</span>{" "}
          leads.
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={
              pagination.hasPrevPage
                ? buildLeadListHref({
                    pathname,
                    q: queryState.q,
                    filter: queryState.filter,
                    sort: queryState.sort,
                    page: pagination.page - 1,
                    origin: queryState.origin,
                    pageSize: pagination.pageSize,
                    extraParams,
                  })
                : "#"
            }
            aria-disabled={!pagination.hasPrevPage}
            className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-sm transition ${
              pagination.hasPrevPage
                ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-600"
            }`}
          >
            Anterior
          </Link>

          <span className="rounded-xl border border-zinc-800 bg-[#0b1220] px-3 py-2 text-sm text-zinc-300">
            {pagination.page} / {pagination.totalPages}
          </span>

          <Link
            href={
              pagination.hasNextPage
                ? buildLeadListHref({
                    pathname,
                    q: queryState.q,
                    filter: queryState.filter,
                    sort: queryState.sort,
                    page: pagination.page + 1,
                    origin: queryState.origin,
                    pageSize: pagination.pageSize,
                    extraParams,
                  })
                : "#"
            }
            aria-disabled={!pagination.hasNextPage}
            className={`inline-flex h-9 items-center justify-center rounded-xl border px-4 text-sm transition ${
              pagination.hasNextPage
                ? "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white"
                : "pointer-events-none border-zinc-800 bg-zinc-900 text-zinc-600"
            }`}
          >
            Siguiente
          </Link>
        </div>
      </div>
    </section>
  );
}
