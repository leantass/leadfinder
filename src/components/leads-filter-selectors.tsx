"use client";

import { useState } from "react";
import type { FilterType } from "@/lib/leads/lead-ui";
import { isCommercialLeadFilter, leadCommercialFilterOptions, leadFilterOptions } from "@/lib/leads/list-query";

export function LeadsFilterSelectors({ pathname, filter }: { pathname: string; filter: FilterType }) {
  const [activeFilter, setActiveFilter] = useState(filter);
  const commercial = isCommercialLeadFilter(activeFilter);
  const selectClass = "h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-900";
  const labelClass = "mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500";

  return (
    <>
      <input type="hidden" name="filter" value={activeFilter} />
      <div>
        <label htmlFor={`${pathname}-commercial-filter`} className={labelClass}>Estado comercial</label>
        <select id={`${pathname}-commercial-filter`} value={commercial ? activeFilter : "all"} onChange={(event) => setActiveFilter(event.target.value as FilterType)} className={selectClass}>
          <option value="all">Todos</option>
          {leadCommercialFilterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor={`${pathname}-other-filter`} className={labelClass}>Otros filtros</label>
        <select id={`${pathname}-other-filter`} value={commercial ? "all" : activeFilter} onChange={(event) => setActiveFilter(event.target.value as FilterType)} className={selectClass}>
          {leadFilterOptions.filter((option) => !isCommercialLeadFilter(option.value)).map((option) => (
            <option key={option.value} value={option.value}>{option.value === "no-website" ? "Sin sitio web" : option.label}</option>
          ))}
        </select>
      </div>
    </>
  );
}
