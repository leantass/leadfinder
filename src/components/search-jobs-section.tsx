import Link from "next/link";

type SearchJobListItem = {
  id: string;
  query: string;
  status: string;
  createdAt: Date | string;
  leadCount: number;
  foundCount?: number | null;
  createdCount?: number | null;
  duplicateSkippedCount?: number | null;
  possibleDuplicateCount?: number | null;
};

type SearchJobsSectionProps = {
  title: string;
  description: string;
  jobs: SearchJobListItem[];
  badgeLabel?: string;
  emptyLabel?: string;
  footerHref?: string;
  footerLabel?: string;
};

export function getSearchStatusLabel(status: string) {
  switch (status) {
    case "completed": return "Completada";
    case "failed": return "Fallida";
    case "pending": return "Pendiente";
    case "running": return "En curso";
    default: return "Estado no disponible";
  }
}

function formatJobDate(value: Date | string) {
  return new Date(value).toLocaleString("es-AR");
}

export function SearchJobsSection({
  title,
  description,
  jobs,
  badgeLabel,
  emptyLabel = "Todavía no hay búsquedas registradas.",
  footerHref,
  footerLabel,
}: SearchJobsSectionProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm text-zinc-400">{description}</p>
        </div>

        {badgeLabel ? (
          <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
            {badgeLabel}
          </span>
        ) : null}
      </div>

      {jobs.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-zinc-800 bg-zinc-950/40 px-4 py-6 text-sm text-zinc-500">
          {emptyLabel}
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-white">{job.query}</p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {job.leadCount} leads · {formatJobDate(job.createdAt)}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {job.foundCount == null || job.createdCount == null || job.duplicateSkippedCount == null || job.possibleDuplicateCount == null
                      ? "Desglose no disponible"
                      : `Resultados encontrados: ${job.foundCount} · Leads nuevos: ${job.createdCount} · Duplicados omitidos: ${job.duplicateSkippedCount}`}
                  </p>
                  {job.possibleDuplicateCount != null && job.possibleDuplicateCount > 0 ? (
                    <p className="mt-1 text-sm text-amber-300">Posibles coincidencias: {job.possibleDuplicateCount}</p>
                  ) : null}
                </div>

                <span className="rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1 text-xs uppercase tracking-[0.18em] text-zinc-400">
                  {getSearchStatusLabel(job.status)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {footerHref && footerLabel ? (
        <div className="mt-4">
          <Link
            href={footerHref}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
          >
            {footerLabel}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
