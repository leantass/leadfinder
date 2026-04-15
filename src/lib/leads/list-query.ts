import type { FilterType, SortType } from "@/lib/leads/lead-ui";

export const leadFilterOptions: Array<{ value: FilterType; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "no-website", label: "Sin web" },
  { value: "marked", label: "Marcados" },
  { value: "ready", label: "Listos para ventas" },
  { value: "with-follow-up", label: "Con seguimiento" },
  { value: "without-follow-up", label: "Sin seguimiento" },
  { value: "follow-up-today", label: "Seguimiento hoy" },
  { value: "follow-up-overdue", label: "Seguimiento vencido" },
];

export const leadSortOptions: Array<{ value: SortType; label: string }> = [
  { value: "score-desc", label: "Mayor score" },
  { value: "recent-desc", label: "Más recientes" },
  { value: "name-asc", label: "Nombre A-Z" },
  { value: "follow-up-asc", label: "Seguimiento más urgente" },
  { value: "follow-up-desc", label: "Seguimiento más lejano" },
];

export const leadPageSizeOptions = [20, 50, 100];

export function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function sanitizeLeadFilter(value: string | undefined): FilterType {
  return leadFilterOptions.some((option) => option.value === value)
    ? (value as FilterType)
    : "all";
}

export function sanitizeLeadSort(value: string | undefined): SortType {
  return leadSortOptions.some((option) => option.value === value)
    ? (value as SortType)
    : "score-desc";
}

export function buildLeadListHref(params: {
  pathname: string;
  q: string;
  filter: FilterType;
  sort: SortType;
  page: number;
  pageSize: number;
  extraParams?: Record<string, string | number | null | undefined>;
}) {
  const query = new URLSearchParams();

  if (params.q.trim() !== "") {
    query.set("q", params.q.trim());
  }

  if (params.filter !== "all") {
    query.set("filter", params.filter);
  }

  if (params.sort !== "score-desc") {
    query.set("sort", params.sort);
  }

  query.set("page", String(params.page));
  query.set("pageSize", String(params.pageSize));

  Object.entries(params.extraParams ?? {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === "") {
      return;
    }

    query.set(key, String(value));
  });

  return `${params.pathname}?${query.toString()}`;
}
