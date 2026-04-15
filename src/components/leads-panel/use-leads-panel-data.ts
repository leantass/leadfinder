import { useMemo } from "react";

import {
    OpportunityLevel,
    SortType,
    getLeadFollowUpSortTime,
    getOpportunityLevel,
    getStatusLabel,
    hasLeadFollowUp,
    isLeadFollowUpOverdue,
    isLeadFollowUpToday,
} from "@/lib/leads/lead-ui";
import {
    formatTokenLabel,
    getBusinessTypeLabel,
    getOutreachChannelLabel,
    getOutreachStatusLabel,
} from "@/lib/lead-format";
import { getWhatsAppUrlFromLead } from "@/lib/outreach/whatsapp-message";

import type { FilterType } from "@/lib/leads/lead-ui";
import type { LeadItem } from "@/components/leads-panel/types";

type UseLeadsPanelDataParams = {
    leadsWithResolvedNotes: LeadItem[];
    filter: FilterType;
    sortBy: SortType;
    searchTerm: string;
    selectedLeadIds: string[];
};

export function useLeadsPanelData({
    leadsWithResolvedNotes,
    filter,
    sortBy,
    searchTerm,
    selectedLeadIds,
}: UseLeadsPanelDataParams) {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const filteredLeads = useMemo(() => {
        let baseLeads = leadsWithResolvedNotes;

        if (filter === "no-website") {
            baseLeads = baseLeads.filter(
                (lead) => !lead.website || lead.website.trim() === ""
            );
        }

        if (filter === "marked") {
            baseLeads = baseLeads.filter(
                (lead) => lead.commercialStatus === "marked"
            );
        }

        if (filter === "ready") {
            baseLeads = baseLeads.filter((lead) => lead.commercialStatus === "ready");
        }

        if (filter === "with-follow-up") {
            baseLeads = baseLeads.filter((lead) => hasLeadFollowUp(lead));
        }

        if (filter === "without-follow-up") {
            baseLeads = baseLeads.filter((lead) => !hasLeadFollowUp(lead));
        }

        if (filter === "follow-up-today") {
            baseLeads = baseLeads.filter((lead) => isLeadFollowUpToday(lead));
        }

        if (filter === "follow-up-overdue") {
            baseLeads = baseLeads.filter((lead) => isLeadFollowUpOverdue(lead));
        }

        if (normalizedSearch) {
            baseLeads = baseLeads.filter((lead) => {
                const searchable = [
                    lead.businessName,
                    lead.phone ?? "",
                    lead.website ?? "",
                    String(lead.score),
                    getStatusLabel(lead.commercialStatus),
                    lead.commercialStatus,
                    getBusinessTypeLabel(lead.businessType),
                    lead.businessType ?? "",
                    formatTokenLabel(lead.suggestedOffer),
                    lead.suggestedOffer ?? "",
                    lead.offerReason ?? "",
                    getOutreachStatusLabel(lead.outreachStatus),
                    lead.outreachStatus,
                    getOutreachChannelLabel(lead.outreachChannel),
                    lead.outreachChannel ?? "",
                    lead.readyForAutomation ? "automatizable listo automatizacion" : "revision manual",
                    lead.followUp?.nextAction ?? "",
                    lead.followUp?.dueAt ? String(lead.followUp.dueAt) : "",
                    ...(lead.scoreReasons ?? []),
                    ...(lead.notes?.map((note) => note.content) ?? []),
                ]
                    .join(" ")
                    .toLowerCase();

                return searchable.includes(normalizedSearch);
            });
        }

        return [...baseLeads];
    }, [leadsWithResolvedNotes, filter, normalizedSearch]);

    const groupedLeads = useMemo(() => {
        const groups: Record<OpportunityLevel, LeadItem[]> = {
            hot: [],
            warm: [],
            cold: [],
        };

        for (const lead of filteredLeads) {
            groups[getOpportunityLevel(lead)].push(lead);
        }

        const sortWithinGroup = (a: LeadItem, b: LeadItem) => {
            if (sortBy === "follow-up-asc" || sortBy === "follow-up-desc") {
                const aFollowUpTime = getLeadFollowUpSortTime(a);
                const bFollowUpTime = getLeadFollowUpSortTime(b);

                if (aFollowUpTime === null && bFollowUpTime !== null) {
                    return 1;
                }

                if (aFollowUpTime !== null && bFollowUpTime === null) {
                    return -1;
                }

                if (aFollowUpTime !== null && bFollowUpTime !== null && aFollowUpTime !== bFollowUpTime) {
                    return sortBy === "follow-up-asc"
                        ? aFollowUpTime - bFollowUpTime
                        : bFollowUpTime - aFollowUpTime;
                }
            }

            if (b.score !== a.score) {
                return b.score - a.score;
            }

            if (sortBy === "recent-desc") {
                return (
                    new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()
                );
            }

            if (sortBy === "name-asc") {
                return a.businessName.localeCompare(b.businessName, "es", {
                    sensitivity: "base",
                });
            }

            return (
                new Date(b.scrapedAt).getTime() - new Date(a.scrapedAt).getTime()
            );
        };

        groups.hot.sort(sortWithinGroup);
        groups.warm.sort(sortWithinGroup);
        groups.cold.sort(sortWithinGroup);

        return groups;
    }, [filteredLeads, sortBy]);

    const selectedLeads = useMemo(() => {
        return leadsWithResolvedNotes.filter((lead) =>
            selectedLeadIds.includes(lead.id)
        );
    }, [leadsWithResolvedNotes, selectedLeadIds]);

    const selectedLeadsWithWhatsApp = useMemo(() => {
        return selectedLeads
            .map((lead) => ({
                ...lead,
                whatsappUrl: getWhatsAppUrlFromLead(lead),
            }))
            .filter(
                (
                    lead
                ): lead is LeadItem & {
                    whatsappUrl: string;
                } => Boolean(lead.whatsappUrl)
            );
    }, [selectedLeads]);

    const allSelectedAreMarked =
        selectedLeads.length > 0 &&
        selectedLeads.every((lead) => lead.commercialStatus === "marked");

    const allSelectedAreReady =
        selectedLeads.length > 0 &&
        selectedLeads.every((lead) => lead.commercialStatus === "ready");

    const filteredLeadIds = filteredLeads.map((lead) => lead.id);

    const allVisibleSelected =
        filteredLeadIds.length > 0 &&
        filteredLeadIds.every((id) => selectedLeadIds.includes(id));

    return {
        normalizedSearch,
        filteredLeads,
        groupedLeads,
        selectedLeads,
        selectedLeadsWithWhatsApp,
        allSelectedAreMarked,
        allSelectedAreReady,
        filteredLeadIds,
        allVisibleSelected,
    };
}
