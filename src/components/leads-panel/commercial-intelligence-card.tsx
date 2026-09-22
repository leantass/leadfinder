import {
    formatTokenLabel,
    getAutomationBadge,
    getBusinessTypeLabel,
    getOutreachChannelLabel,
} from "@/lib/lead-format";

import type { LeadItem } from "./types";

export function CommercialIntelligenceCard({
    lead,
    compact = false,
}: {
    lead: LeadItem;
    compact?: boolean;
}) {
    return (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                        Inteligencia comercial
                    </p>
                    <p className="mt-1 break-words text-sm font-medium text-white">
                        {formatTokenLabel(lead.suggestedOffer)}
                    </p>
                </div>

                <span
                    className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] ${getAutomationBadge(
                        lead.readyForAutomation
                    )}`}
                >
                    {lead.readyForAutomation ? "Automatizable" : "Requiere revisión"}
                </span>
            </div>

            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                        Tipo de negocio
                    </p>
                    <p className="mt-0.5 break-words text-xs text-zinc-200">
                        {getBusinessTypeLabel(lead.businessType)}
                    </p>
                </div>

                <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                        Canal de contacto
                    </p>
                    <p className="mt-0.5 break-words text-xs text-zinc-200">
                        {getOutreachChannelLabel(lead.outreachChannel)}
                    </p>
                </div>
            </div>

            {!compact ? (
                <p className="mt-2 break-words text-xs leading-5 text-zinc-400">
                    {lead.offerReason ?? "Todavía no hay motivo comercial visible para este lead."}
                </p>
            ) : null}
        </div>
    );
}
