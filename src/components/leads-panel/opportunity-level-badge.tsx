import {
    getOpportunityBadge,
    getOpportunityDescription,
    getOpportunityLabel,
    getOpportunityLevel,
} from "@/lib/leads/lead-ui";

import type { LeadItem } from "./types";

export function OpportunityLevelBadge({ lead }: { lead: LeadItem }) {
    const opportunityLevel = getOpportunityLevel(lead);

    return (
        <div className="flex min-w-0 items-center gap-2">
            <span
                className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] ${getOpportunityBadge(
                    opportunityLevel
                )}`}
            >
                {getOpportunityLabel(opportunityLevel)}
            </span>
            <span className="truncate text-[11px] text-zinc-500">
                {getOpportunityDescription(opportunityLevel)}
            </span>
        </div>
    );
}
