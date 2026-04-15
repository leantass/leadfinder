import {
    getAutomationBadge,
    getBusinessTypeLabel,
    getOutreachChannelBadge,
    getOutreachChannelLabel,
    getOutreachStatusBadge,
    getOutreachStatusLabel,
} from "@/lib/lead-format";
import { getWebsiteTypeBadge, getWebsiteTypeLabel } from "@/lib/leads/lead-ui";

import type { LeadItem } from "./types";

export function CommercialSignalBadges({
    lead,
    compact = false,
}: {
    lead: LeadItem;
    compact?: boolean;
}) {
    const items = [
        {
            className: getWebsiteTypeBadge(lead.websiteType),
            label: getWebsiteTypeLabel(lead.websiteType),
        },
        {
            className: "border border-zinc-800 bg-zinc-900 text-zinc-200",
            label: getBusinessTypeLabel(lead.businessType),
        },
        {
            className: getOutreachStatusBadge(lead.outreachStatus),
            label: getOutreachStatusLabel(lead.outreachStatus),
        },
        {
            className: getOutreachChannelBadge(lead.outreachChannel),
            label: getOutreachChannelLabel(lead.outreachChannel),
        },
        {
            className: getAutomationBadge(lead.readyForAutomation),
            label: lead.readyForAutomation
                ? "Listo para automatización"
                : "Requiere revisión",
        },
    ];
    const visibleItems = compact ? items.slice(0, 3) : items;

    return (
        <div className="flex flex-wrap gap-1.5">
            {visibleItems.map((item) => (
                <span
                    key={`${lead.id}-${item.label}`}
                    className={`inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[11px] leading-4 ${item.className}`}
                >
                    {item.label}
                </span>
            ))}

            {compact && items.length > visibleItems.length ? (
                <span className="inline-flex rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] leading-4 text-zinc-400">
                    +{items.length - visibleItems.length}
                </span>
            ) : null}
        </div>
    );
}
