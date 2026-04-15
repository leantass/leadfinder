import {
    getOpportunityLevel,
    getPrimaryActionClasses,
    getPrimaryActionLabel,
} from "@/lib/leads/lead-ui";
import { getWhatsAppUrlFromLead } from "@/lib/outreach/whatsapp-message";

import type { LeadItem } from "./types";

export function RowQuickActions({
    lead,
    isPending,
    onMark,
    onSendToSales,
    onOpenDetail,
}: {
    lead: LeadItem;
    isPending: boolean;
    onMark: (id: string) => void;
    onSendToSales: (id: string) => void;
    onOpenDetail: (id: string) => void;
}) {
    const whatsappUrl = getWhatsAppUrlFromLead(lead);
    const isMarked = lead.commercialStatus === "marked";
    const isReady = lead.commercialStatus === "ready";
    const opportunityLevel = getOpportunityLevel(lead);
    const primaryActionLabel = getPrimaryActionLabel(opportunityLevel);

    return (
        <div className="flex flex-wrap gap-1.5">
            {opportunityLevel === "hot" && whatsappUrl ? (
                <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-medium transition ${getPrimaryActionClasses(
                        opportunityLevel
                    )}`}
                >
                    {primaryActionLabel}
                </a>
            ) : (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpenDetail(lead.id);
                    }}
                    className={`inline-flex h-8 items-center justify-center rounded-lg border px-3 text-xs font-medium transition ${getPrimaryActionClasses(
                        opportunityLevel
                    )}`}
                >
                    {primaryActionLabel}
                </button>
            )}

            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onMark(lead.id);
                }}
                disabled={isPending || isMarked}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isMarked ? "Marcado" : "Marcar"}
            </button>

            <button
                type="button"
                onClick={(event) => {
                    event.stopPropagation();
                    onSendToSales(lead.id);
                }}
                disabled={isPending || isReady}
                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
                {isReady ? "En ventas" : "A ventas"}
            </button>

            {whatsappUrl && opportunityLevel !== "hot" ? (
                <a
                    href={whatsappUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex h-8 items-center justify-center rounded-lg border border-emerald-800 bg-emerald-700/80 px-2 text-[11px] text-white transition hover:bg-emerald-600"
                >
                    WhatsApp
                </a>
            ) : null}
        </div>
    );
}
