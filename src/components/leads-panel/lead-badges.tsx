import {
    getLeadPriority,
    getPriorityBadge,
    getPriorityLabel,
    getScoreLabel,
    getScoreTone,
    getStatusBadge,
    getStatusLabel,
} from "@/lib/leads/lead-ui";

import type { LeadItem } from "./types";

export function LeadBadges({
    lead,
    compact = false,
}: {
    lead: LeadItem;
    compact?: boolean;
}) {
    const priority = getLeadPriority(lead);
    const items = [
        {
            className: getPriorityBadge(priority),
            label: `Prioridad ${getPriorityLabel(priority)}`,
        },
        {
            className: getStatusBadge(lead.commercialStatus),
            label: getStatusLabel(lead.commercialStatus),
        },
        {
            className: getScoreTone(lead.score),
            label: `Score ${lead.score} · ${getScoreLabel(lead.score)}`,
        },
        ...(!compact && (!lead.website || lead.website.trim() === "")
            ? [
                  {
                      className:
                          "border border-amber-900/50 bg-amber-950/30 text-amber-300",
                      label: "Sin web",
                  },
              ]
            : []),
        ...(!compact && lead.phone && lead.phone.trim() !== ""
            ? [
                  {
                      className:
                          "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300",
                      label: "Teléfono",
                  },
              ]
            : []),
    ];

    return (
        <div className="flex flex-wrap gap-1.5">
            {items.map((item) => (
                <span
                    key={`${lead.id}-${item.label}`}
                    className={`inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[11px] leading-4 ${item.className}`}
                >
                    {item.label}
                </span>
            ))}
        </div>
    );
}
