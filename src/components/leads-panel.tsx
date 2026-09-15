"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
    addLeadNoteAction,
    markLeadsAsMarkedAction,
    markLeadsAsReadyForSalesAction,
    saveLeadFollowUpAction,
    updateLeadCommercialStatusAction,
} from "@/app/actions";
import {
    formatTokenLabel,
    getAutomationBadge,
    getBusinessTypeLabel,
    getOutreachChannelBadge,
    getOutreachChannelLabel,
    getOutreachStatusBadge,
    getOutreachStatusLabel,
} from "@/lib/lead-format";
import {
    COMMERCIAL_STATUS_OPTIONS,
    CommercialStatus,
    FilterType,
    OpportunityLevel,
    SortType,
    formatDate,
    formatLeadId,
    getDomainLabel,
    getLeadOriginLabel,
    getFilterLabel,
    getLeadFollowUpTone,
    getLeadPreviewReasons,
    getOpportunityBadge,
    getOpportunityLabel,
    getOpportunityLevel,
    getOpportunityPanelTone,
    getPrimaryActionClasses,
    getPrimaryActionLabel,
    getScoreLabel,
    getScoreTone,
    getStatusBadge,
    getStatusLabel,
    getSortLabel,
    getWebsiteTypeBadge,
    getWebsiteTypeLabel,
    hasLeadFollowUp,
} from "@/lib/leads/lead-ui";
import {
    buildWhatsAppMessage,
    getWhatsAppUrlFromLead,
} from "@/lib/outreach/whatsapp-message";
import { CommercialIntelligenceCard } from "@/components/leads-panel/commercial-intelligence-card";
import { CommercialSignalBadges } from "@/components/leads-panel/commercial-signal-badges";
import { LeadBadges } from "@/components/leads-panel/lead-badges";
import { OpportunityLevelBadge } from "@/components/leads-panel/opportunity-level-badge";
import { RowQuickActions } from "@/components/leads-panel/row-quick-actions";
import type {
    LeadActivityItem,
    LeadFollowUpItem,
    LeadItem,
    LeadNoteItem,
} from "@/components/leads-panel/types";
import { useLeadsPanelData } from "@/components/leads-panel/use-leads-panel-data";
import { WebsiteTypeSignalBadge } from "@/components/leads-panel/website-type-signal-badge";

type LeadsPanelProps = {
    leads: LeadItem[];
    initialFilter?: FilterType;
    initialSortBy?: SortType;
    initialSearchTerm?: string;
    showListingControls?: boolean;
};


export function LeadsPanel({
    leads,
    initialFilter = "all",
    initialSortBy = "score-desc",
    initialSearchTerm = "",
    showListingControls = true,
}: LeadsPanelProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const activityCounterRef = useRef(0);
    const followUpOptions = [
        "Llamar",
        "Escribir por WhatsApp",
        "Revisar sitio",
        "Enviar propuesta",
        "Hacer seguimiento",
        "Esperar respuesta",
        "Cerrar",
        "Descartar",
    ];

    const [filter, setFilter] = useState<FilterType>(initialFilter);
    const [sortBy, setSortBy] = useState<SortType>(initialSortBy);
    const [searchTerm, setSearchTerm] = useState(initialSearchTerm);
    const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
    const [expandedLeadIds, setExpandedLeadIds] = useState<string[]>([]);
    const [activeLeadId, setActiveLeadId] = useState<string | null>(null);
    const [localCommercialStatusByLeadId, setLocalCommercialStatusByLeadId] = useState<
        Record<string, CommercialStatus | string>
    >(() =>
        Object.fromEntries(leads.map((lead) => [lead.id, lead.commercialStatus]))
    );
    const [localActivityByLeadId, setLocalActivityByLeadId] = useState<
        Record<string, LeadActivityItem[]>
    >(() =>
        Object.fromEntries(leads.map((lead) => [lead.id, lead.activity ?? []]))
    );
    const [localFollowUpByLeadId, setLocalFollowUpByLeadId] = useState<
        Record<string, LeadFollowUpItem>
    >(() =>
        Object.fromEntries(
            leads.map((lead) => [
                lead.id,
                lead.followUp ?? { nextAction: "", dueAt: null },
            ])
        )
    );
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const [noteContent, setNoteContent] = useState("");
    const [noteMessage, setNoteMessage] = useState<string | null>(null);
    const [noteError, setNoteError] = useState<string | null>(null);
    const [isNotesHistoryOpen, setIsNotesHistoryOpen] = useState(false);
    const [isWhatsAppPreviewOpen, setIsWhatsAppPreviewOpen] = useState(false);
    const [whatsAppPreviewMessage, setWhatsAppPreviewMessage] = useState<string | null>(null);
    const [followUpNextAction, setFollowUpNextAction] = useState("");
    const [followUpDueAt, setFollowUpDueAt] = useState("");
    const [localNotesByLeadId, setLocalNotesByLeadId] = useState<
        Record<string, LeadNoteItem[]>
    >(() =>
        Object.fromEntries(leads.map((lead) => [lead.id, lead.notes ?? []]))
    );
    const resolvedCommercialStatusByLeadId = useMemo(
        () => ({
            ...Object.fromEntries(leads.map((lead) => [lead.id, lead.commercialStatus])),
            ...localCommercialStatusByLeadId,
        }),
        [leads, localCommercialStatusByLeadId]
    );
    const resolvedFollowUpByLeadId = useMemo(
        () => ({
            ...Object.fromEntries(
                leads.map((lead) => [
                    lead.id,
                    lead.followUp ?? { nextAction: "", dueAt: null },
                ])
            ),
            ...localFollowUpByLeadId,
        }),
        [leads, localFollowUpByLeadId]
    );

    function mergeActivityItems(
        currentItems: LeadActivityItem[],
        incomingItems: LeadActivityItem[]
    ) {
        const byId = new Map<string, LeadActivityItem>();

        [...incomingItems, ...currentItems]
            .sort(
                (a, b) =>
                    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )
            .forEach((activity) => {
                if (!byId.has(activity.id)) {
                    byId.set(activity.id, activity);
                }
            });

        return Array.from(byId.values());
    }

    const resolvedActivityByLeadId = useMemo(
        () =>
            Object.fromEntries(
                leads.map((lead) => [
                    lead.id,
                    mergeActivityItems(
                        lead.activity ?? [],
                        localActivityByLeadId[lead.id] ?? []
                    ),
                ])
            ),
        [leads, localActivityByLeadId]
    );

    const leadsWithResolvedNotes = useMemo(() => {
        return leads.map((lead) => ({
            ...lead,
            commercialStatus:
                resolvedCommercialStatusByLeadId[lead.id] ?? lead.commercialStatus,
            notes: localNotesByLeadId[lead.id] ?? lead.notes ?? [],
            followUp:
                resolvedFollowUpByLeadId[lead.id] ?? { nextAction: "", dueAt: null },
            activity: resolvedActivityByLeadId[lead.id] ?? lead.activity ?? [],
        }));
    }, [
        leads,
        localNotesByLeadId,
        resolvedActivityByLeadId,
        resolvedCommercialStatusByLeadId,
        resolvedFollowUpByLeadId,
    ]);

    useEffect(() => {
        setFilter(initialFilter);
    }, [initialFilter]);

    useEffect(() => {
        setSortBy(initialSortBy);
    }, [initialSortBy]);

    useEffect(() => {
        setSearchTerm(initialSearchTerm);
    }, [initialSearchTerm]);

    const effectiveFilter = showListingControls ? filter : "all";
    const effectiveSortBy = showListingControls ? sortBy : initialSortBy;
    const effectiveSearchTerm = showListingControls ? searchTerm : "";
    const displayFilter = showListingControls ? filter : initialFilter;
    const displaySortBy = showListingControls ? sortBy : initialSortBy;
    const displaySearchTerm = showListingControls ? searchTerm : initialSearchTerm;

    const {
        normalizedSearch,
        filteredLeads,
        groupedLeads,
        selectedLeadsWithWhatsApp,
        allSelectedAreMarked,
        allSelectedAreReady,
        filteredLeadIds,
        allVisibleSelected,
    } = useLeadsPanelData({
        leadsWithResolvedNotes,
        filter: effectiveFilter,
        sortBy: effectiveSortBy,
        searchTerm: effectiveSearchTerm,
        selectedLeadIds,
    });
    const hasDisplaySearch = showListingControls
        ? Boolean(normalizedSearch)
        : displaySearchTerm.trim() !== "";

    const activeLead =
        filteredLeads.find((lead) => lead.id === activeLeadId) ??
        leadsWithResolvedNotes.find((lead) => lead.id === activeLeadId) ??
        null;

    function toggleLeadSelection(id: string) {
        setSelectedLeadIds((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id]
        );
    }

    function toggleSelectAllVisible() {
        setSelectedLeadIds((current) => {
            if (allVisibleSelected) {
                return current.filter((id) => !filteredLeadIds.includes(id));
            }

            const merged = new Set([...current, ...filteredLeadIds]);
            return Array.from(merged);
        });
    }

    function clearSelection() {
        setSelectedLeadIds([]);
        setActionMessage(null);
        setActionError(null);
    }

    function addLeadActivity(
        leadId: string,
        activity: Omit<LeadActivityItem, "id" | "leadId" | "createdAt">
    ) {
        activityCounterRef.current += 1;
        const nextActivity: LeadActivityItem = {
            id: `activity-${leadId}-${activityCounterRef.current}`,
            leadId,
            createdAt: new Date().toISOString(),
            ...activity,
        };

        setLocalActivityByLeadId((current) => ({
            ...current,
            [leadId]: [nextActivity, ...(current[leadId] ?? [])],
        }));
    }

    function mergePersistedActivities(leadId: string, activities: LeadActivityItem[]) {
        if (activities.length === 0) {
            return;
        }

        setLocalActivityByLeadId((current) => ({
            ...current,
            [leadId]: mergeActivityItems(current[leadId] ?? [], activities),
        }));
    }

    function syncPersistedLeadData(
        leadId: string,
        nextState?: {
            commercialStatus?: string | null;
            followUp?: LeadFollowUpItem | null;
            activities?: LeadActivityItem[];
        }
    ) {
        const persistedStatus = nextState?.commercialStatus;

        if (typeof persistedStatus === "string") {
            setLocalCommercialStatusByLeadId((current) => ({
                ...current,
                [leadId]: persistedStatus,
            }));
        }

        if (nextState?.followUp) {
            setLocalFollowUpByLeadId((current) => ({
                ...current,
                [leadId]: nextState.followUp ?? { nextAction: "", dueAt: null },
            }));
        }

        if (nextState?.activities?.length) {
            mergePersistedActivities(leadId, nextState.activities);
        }
    }

    function formatFollowUpDate(value: Date | string | null) {
        if (!value) {
            return null;
        }

        if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [year, month, day] = value.split("-");
            return `${day}/${month}/${year}`;
        }

        return new Date(value).toLocaleDateString("es-AR");
    }

    function updateLeadCommercialStatus(id: string, status: string) {
        const currentStatus =
            leadsWithResolvedNotes.find((lead) => lead.id === id)?.commercialStatus ?? null;

        if (currentStatus === status) {
            return;
        }

        setActionError(null);
        setLocalCommercialStatusByLeadId((current) => ({
            ...current,
            [id]: status,
        }));

        startTransition(async () => {
            const result = await updateLeadCommercialStatusAction(id, status);

            if (!result.ok) {
                setLocalCommercialStatusByLeadId((current) => ({
                    ...current,
                    [id]: currentStatus ?? "new",
                }));
                setActionError(result.error ?? "No se pudo actualizar el estado.");
                return;
            }

            syncPersistedLeadData(id, {
                commercialStatus: result.commercialStatus,
                activities: result.activity ? [result.activity] : [],
            });
        });
    }

    function toggleLeadExpansion(id: string) {
        setExpandedLeadIds((current) =>
            current.includes(id)
                ? current.filter((item) => item !== id)
                : [...current, id]
        );
    }

    function clearSearch() {
        setSearchTerm("");
    }

    function openLeadDetail(id: string) {
        const followUp = resolvedFollowUpByLeadId[id] ?? {
            nextAction: "",
            dueAt: null,
        };

        setActiveLeadId(id);
        setNoteContent("");
        setNoteMessage(null);
        setNoteError(null);
        setIsNotesHistoryOpen(false);
        setIsWhatsAppPreviewOpen(false);
        setWhatsAppPreviewMessage(null);
        setFollowUpNextAction(followUp.nextAction);
        setFollowUpDueAt(
            typeof followUp.dueAt === "string"
                ? followUp.dueAt.slice(0, 10)
                : followUp.dueAt
                  ? new Date(followUp.dueAt).toISOString().slice(0, 10)
                  : ""
        );
        addLeadActivity(id, {
            type: "detail_opened",
            label: "Se abrio el detalle",
        });
    }

    function closeLeadDetail() {
        setActiveLeadId(null);
        setNoteContent("");
        setNoteMessage(null);
        setNoteError(null);
        setIsNotesHistoryOpen(false);
        setIsWhatsAppPreviewOpen(false);
        setWhatsAppPreviewMessage(null);
        setFollowUpNextAction("");
        setFollowUpDueAt("");
    }

    function saveLeadFollowUp() {
        if (!activeLead) {
            return;
        }

        const previousFollowUp = resolvedFollowUpByLeadId[activeLead.id] ?? {
            nextAction: "",
            dueAt: null,
        };
        const nextFollowUp: LeadFollowUpItem = {
            nextAction: followUpNextAction,
            dueAt: followUpDueAt || null,
        };

        setActionError(null);
        setLocalFollowUpByLeadId((current) => ({
            ...current,
            [activeLead.id]: nextFollowUp,
        }));

        startTransition(async () => {
            const result = await saveLeadFollowUpAction(activeLead.id, {
                nextAction: nextFollowUp.nextAction,
                dueAt:
                    typeof nextFollowUp.dueAt === "string"
                        ? nextFollowUp.dueAt
                        : null,
            });

            if (!result.ok) {
                setLocalFollowUpByLeadId((current) => ({
                    ...current,
                    [activeLead.id]: previousFollowUp,
                }));
                setActionError(result.error ?? "No se pudo guardar el seguimiento.");
                return;
            }

            syncPersistedLeadData(activeLead.id, {
                followUp: result.followUp,
                activities: result.activity ? [result.activity] : [],
            });
            setActionMessage("Seguimiento guardado correctamente.");
        });
    }

    function openBulkWhatsApp() {
        setActionMessage(null);
        setActionError(null);

        if (selectedLeadIds.length === 0) {
            setActionError("Seleccioná al menos un lead para abrir WhatsApp.");
            return;
        }

        if (selectedLeadsWithWhatsApp.length === 0) {
            setActionError("Ningún lead seleccionado tiene teléfono usable.");
            return;
        }

        selectedLeadsWithWhatsApp.forEach((lead, index) => {
            window.setTimeout(() => {
                window.open(lead.whatsappUrl, "_blank", "noopener,noreferrer");
            }, index * 400);
        });

        setActionMessage(
            `Abriendo ${selectedLeadsWithWhatsApp.length} chat${
                selectedLeadsWithWhatsApp.length === 1 ? "" : "s"
            } de WhatsApp.`
        );
    }

    async function markSelectedLeads() {
        if (selectedLeadIds.length === 0 || isPending || allSelectedAreMarked) {
            return;
        }

        setActionMessage(null);
        setActionError(null);
        const leadIdsToUpdate = [...selectedLeadIds];

        startTransition(async () => {
            const result = await markLeadsAsMarkedAction(leadIdsToUpdate);

            if (!result.ok) {
                setActionError(result.error ?? "No se pudo actualizar el estado.");
                return;
            }

            setActionMessage(
                `${result.updatedCount} lead${result.updatedCount === 1 ? "" : "s"
                } marcado${result.updatedCount === 1 ? "" : "s"}.`
            );
            setLocalCommercialStatusByLeadId((current) => ({
                ...current,
                ...Object.fromEntries(leadIdsToUpdate.map((id) => [id, "marked"])),
            }));
            leadIdsToUpdate.forEach((id) => {
                mergePersistedActivities(
                    id,
                    result.activities.filter((activity) => activity.leadId === id)
                );
            });
            setSelectedLeadIds([]);
            router.refresh();
        });
    }

    async function sendSelectedToSales() {
        if (selectedLeadIds.length === 0 || isPending || allSelectedAreReady) {
            return;
        }

        setActionMessage(null);
        setActionError(null);
        const leadIdsToUpdate = [...selectedLeadIds];

        startTransition(async () => {
            const result = await markLeadsAsReadyForSalesAction(leadIdsToUpdate);

            if (!result.ok) {
                setActionError(result.error ?? "No se pudo actualizar el estado.");
                return;
            }

            setActionMessage(
                `${result.updatedCount} lead${result.updatedCount === 1 ? "" : "s"
                } enviado${result.updatedCount === 1 ? "" : "s"} a ventas.`
            );
            setLocalCommercialStatusByLeadId((current) => ({
                ...current,
                ...Object.fromEntries(leadIdsToUpdate.map((id) => [id, "ready"])),
            }));
            leadIdsToUpdate.forEach((id) => {
                mergePersistedActivities(
                    id,
                    result.activities.filter((activity) => activity.leadId === id)
                );
            });
            setSelectedLeadIds([]);
            router.refresh();
        });
    }

    async function markSingleLead(id: string) {
        if (isPending) {
            return;
        }

        setActionMessage(null);
        setActionError(null);

        startTransition(async () => {
            const result = await markLeadsAsMarkedAction([id]);

            if (!result.ok) {
                setActionError(result.error ?? "No se pudo actualizar el estado.");
                return;
            }

            setActionMessage("Lead marcado correctamente.");
            setLocalCommercialStatusByLeadId((current) => ({
                ...current,
                [id]: "marked",
            }));
            mergePersistedActivities(id, result.activities);
            router.refresh();
        });
    }

    async function sendSingleLeadToSales(id: string) {
        if (isPending) {
            return;
        }

        setActionMessage(null);
        setActionError(null);

        startTransition(async () => {
            const result = await markLeadsAsReadyForSalesAction([id]);

            if (!result.ok) {
                setActionError(result.error ?? "No se pudo actualizar el estado.");
                return;
            }

            setActionMessage("Lead enviado a ventas correctamente.");
            setLocalCommercialStatusByLeadId((current) => ({
                ...current,
                [id]: "ready",
            }));
            mergePersistedActivities(id, result.activities);
            router.refresh();
        });
    }

    async function saveLeadNote() {
        if (!activeLead || isPending) {
            return;
        }

        const trimmedContent = noteContent.trim();

        if (!trimmedContent) {
            setNoteMessage(null);
            setNoteError("La observación no puede estar vacía.");
            return;
        }

        setNoteMessage(null);
        setNoteError(null);

        startTransition(async () => {
            const result = await addLeadNoteAction(activeLead.id, trimmedContent);

            if (!result.ok) {
                setNoteError(result.error ?? "No se pudo guardar la observación.");
                return;
            }

            setLocalNotesByLeadId((current) => ({
                ...current,
                [activeLead.id]: result.note
                    ? [result.note, ...(current[activeLead.id] ?? [])]
                    : current[activeLead.id] ?? [],
            }));
            if (result.activity) {
                mergePersistedActivities(activeLead.id, [result.activity]);
            }

            setNoteContent("");
            setNoteMessage("Observación guardada correctamente.");
            router.refresh();
        });
    }

    async function copyWhatsAppMessage() {
        if (!activeLead) {
            return;
        }

        try {
            await navigator.clipboard.writeText(buildWhatsAppMessage(activeLead));
            setWhatsAppPreviewMessage("Mensaje copiado.");
        } catch {
            setWhatsAppPreviewMessage("No se pudo copiar el mensaje.");
        }
    }

    const baseBtn =
        "inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition";
    const ghostBtn =
        "h-9 rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300 transition hover:bg-zinc-700";
    const actionBtn =
        "h-9 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60";

    const notesCount = activeLead?.notes.length ?? 0;
    const activeLeadActivity = activeLead
        ? resolvedActivityByLeadId[activeLead.id] ?? activeLead.activity ?? []
        : [];
    const activeLeadFollowUp = activeLead
        ? resolvedFollowUpByLeadId[activeLead.id] ?? { nextAction: "", dueAt: null }
        : { nextAction: "", dueAt: null };
    const scoreReasons = activeLead?.scoreReasons ?? [];
    const activeLeadWhatsAppUrl = activeLead ? getWhatsAppUrlFromLead(activeLead) : null;
    const activeLeadWhatsAppMessage = activeLead ? buildWhatsAppMessage(activeLead) : null;
    const hotCount = groupedLeads.hot.length;
    const warmCount = groupedLeads.warm.length;
    const coldCount = groupedLeads.cold.length;
    const getActivityBadgeClasses = (type: string) => {
        if (type === "status_changed") {
            return "border border-sky-900/50 bg-sky-950/30 text-sky-300";
        }

        if (type === "marked") {
            return "border border-amber-900/50 bg-amber-950/30 text-amber-300";
        }

        if (type === "sent_to_sales") {
            return "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
        }

        if (type === "note_added") {
            return "border border-violet-900/50 bg-violet-950/30 text-violet-300";
        }

        if (type === "detail_opened") {
            return "border border-zinc-700 bg-zinc-900 text-zinc-300";
        }

        if (type === "whatsapp_opened") {
            return "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
        }

        if (type === "follow_up_updated") {
            return "border border-indigo-900/50 bg-indigo-950/30 text-indigo-300";
        }

        if (type === "automation_applied") {
            return "border border-cyan-900/50 bg-cyan-950/30 text-cyan-300";
        }

        return "border border-zinc-800 bg-zinc-900 text-zinc-400";
    };
    const getActivityTypeLabel = (type: string) => {
        if (type === "status_changed") {
            return "Estado";
        }

        if (type === "marked") {
            return "Marcado";
        }

        if (type === "sent_to_sales") {
            return "Ventas";
        }

        if (type === "note_added") {
            return "Nota";
        }

        if (type === "detail_opened") {
            return "Detalle";
        }

        if (type === "whatsapp_opened") {
            return "WhatsApp";
        }

        if (type === "follow_up_updated") {
            return "Seguimiento";
        }

        if (type === "automation_applied") {
            return "Automatización";
        }

        return "Actividad";
    };
    const sections: Array<{
        level: OpportunityLevel;
        title: string;
        description: string;
        leads: LeadItem[];
    }> = [
            {
                level: "hot",
                title: "Oportunidades inmediatas",
                description: "Con teléfono y sin web propia: prioridad máxima de contacto.",
                leads: groupedLeads.hot,
            },
            {
                level: "warm",
                title: "Para trabajar",
                description: "Bloque intermedio reservado. Con la regla actual no recibe leads.",
                leads: groupedLeads.warm,
            },
            {
                level: "cold",
                title: "Bajo impacto",
                description: "Con web real o sin teléfono: menor urgencia operativa.",
                leads: groupedLeads.cold,
            },
        ];

    return (
        <>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-900/90 p-4 sm:p-5">
                <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
                    <div className="min-w-0">
                        <h3 className="text-xl font-semibold text-white">Leads</h3>
                        <p className="text-sm text-zinc-400">
                            Vista operativa para detectar oportunidades reales.
                        </p>
                    </div>

                    {showListingControls ? (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            onClick={() => setFilter("all")}
                            className={`${baseBtn} ${filter === "all"
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                }`}
                        >
                            Todos
                        </button>

                        <button
                            type="button"
                            onClick={() => setFilter("no-website")}
                            className={`${baseBtn} ${filter === "no-website"
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                }`}
                        >
                            Sin web
                        </button>

                        <button
                            type="button"
                            onClick={() => setFilter("marked")}
                            className={`${baseBtn} ${filter === "marked"
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                }`}
                        >
                            Marcados
                        </button>

                        <button
                            type="button"
                            onClick={() => setFilter("ready")}
                            className={`${baseBtn} ${filter === "ready"
                                ? "border-white bg-white text-black"
                                : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                                }`}
                        >
                            Listos para ventas
                        </button>

                        <select
                            id="lead-follow-up-filter"
                            name="lead-follow-up-filter"
                            value={
                                filter === "with-follow-up" ||
                                filter === "without-follow-up" ||
                                filter === "follow-up-today" ||
                                filter === "follow-up-overdue"
                                    ? filter
                                    : "all"
                            }
                            onChange={(event) =>
                                setFilter(event.target.value as FilterType)
                            }
                            className="h-10 rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-700"
                        >
                            <option value="all">Seguimiento</option>
                            <option value="with-follow-up">Con seguimiento</option>
                            <option value="without-follow-up">Sin seguimiento</option>
                            <option value="follow-up-today">Para hoy</option>
                            <option value="follow-up-overdue">Vencido</option>
                        </select>
                    </div>
                    ) : null}
                </div>

                <div className="mt-3 rounded-2xl border border-zinc-800 bg-[#0b1220] p-3.5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-500">
                            <span>
                                Mostrando{" "}
                                <span className="font-semibold text-white">
                                    {filteredLeads.length}
                                </span>{" "}
                                leads
                            </span>

                            <span>
                                Seleccionados:{" "}
                                <span className="font-semibold text-white">
                                    {selectedLeadIds.length}
                                </span>
                            </span>

                            <span>
                                Filtro:{" "}
                                <span className="text-zinc-300">{getFilterLabel(displayFilter)}</span>
                            </span>

                            <span>
                                Orden:{" "}
                                <span className="text-zinc-300">{getSortLabel(displaySortBy)}</span>
                            </span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            {showListingControls ? (
                            <select
                                id="lead-sort"
                                name="lead-sort"
                                value={sortBy}
                                onChange={(event) => setSortBy(event.target.value as SortType)}
                                className="h-9 rounded-xl border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-300 outline-none transition hover:bg-zinc-700"
                            >
                                <option value="score-desc">Mayor score</option>
                                <option value="recent-desc">Más recientes</option>
                                <option value="name-asc">Nombre A-Z</option>
                                <option value="follow-up-asc">Seguimiento más urgente</option>
                                <option value="follow-up-desc">Seguimiento más lejano</option>
                            </select>
                            ) : null}

                            <button
                                type="button"
                                onClick={toggleSelectAllVisible}
                                className={ghostBtn}
                            >
                                {allVisibleSelected
                                    ? "Deseleccionar visibles"
                                    : "Seleccionar visibles"}
                            </button>

                            <button type="button" onClick={clearSelection} className={ghostBtn}>
                                Limpiar selección
                            </button>
                        </div>
                    </div>

                    {showListingControls ? (
                    <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                        <div className="w-full xl:max-w-[520px]">
                            <label
                                htmlFor="lead-search"
                                className="mb-2 block text-[11px] uppercase tracking-[0.18em] text-zinc-500"
                            >
                                Buscar dentro de leads
                            </label>
                            <div className="flex gap-2">
                                <input
                                    id="lead-search"
                                    name="lead-search"
                                    type="text"
                                    value={searchTerm}
                                    onChange={(event) => setSearchTerm(event.target.value)}
                                    placeholder="Nombre, teléfono, website, score, estado, motivo o nota"
                                    className="h-11 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-500"
                                />
                                <button
                                    type="button"
                                    onClick={clearSearch}
                                    className="shrink-0 rounded-xl border border-zinc-700 bg-zinc-800 px-4 text-sm text-zinc-300 transition hover:bg-zinc-700"
                                >
                                    Limpiar
                                </button>
                            </div>
                        </div>

                        {normalizedSearch ? (
                            <div className="text-sm text-zinc-400">
                                Buscando: <span className="text-white">{searchTerm}</span>
                            </div>
                        ) : (
                            <div className="text-sm text-zinc-500">
                                Filtrado en vivo sin recargar.
                            </div>
                        )}
                    </div>
                    ) : displaySearchTerm ? (
                        <div className="mt-3 text-sm text-zinc-400">
                            Búsqueda activa en servidor:{" "}
                            <span className="text-white">{displaySearchTerm}</span>
                        </div>
                    ) : null}
                </div>

                <div className="mt-3 grid gap-2.5 lg:grid-cols-3">
                    <div className="rounded-2xl border border-red-900/40 bg-red-950/10 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-red-200">
                            HOT
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">{hotCount}</p>
                        <p className="mt-2 text-sm text-zinc-400">
                            Leads para contactar primero.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-amber-900/40 bg-amber-950/10 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-200">
                            WARM
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">{warmCount}</p>
                        <p className="mt-2 text-sm text-zinc-400">
                            Franja intermedia reservada para una regla futura.
                        </p>
                    </div>

                    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/50 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
                            COLD
                        </p>
                        <p className="mt-2 text-3xl font-semibold text-white">{coldCount}</p>
                        <p className="mt-2 text-sm text-zinc-400">
                            Menor urgencia operativa.
                        </p>
                    </div>
                </div>

                {selectedLeadIds.length > 0 ? (
                    <div className="mt-3 flex flex-col gap-3 rounded-2xl border border-violet-900/50 bg-violet-950/20 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-sm text-violet-200">
                            {selectedLeadIds.length} seleccionados
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={markSelectedLeads}
                                disabled={isPending || allSelectedAreMarked}
                                className={actionBtn}
                            >
                                {isPending
                                    ? "Procesando..."
                                    : allSelectedAreMarked
                                        ? "Ya marcados"
                                        : "Marcar"}
                            </button>

                            <button
                                type="button"
                                onClick={sendSelectedToSales}
                                disabled={isPending || allSelectedAreReady}
                                className={actionBtn}
                            >
                                {isPending
                                    ? "Enviando..."
                                    : allSelectedAreReady
                                        ? "Ya en ventas"
                                        : "Enviar a ventas"}
                            </button>

                            <button
                                type="button"
                                onClick={openBulkWhatsApp}
                                disabled={selectedLeadIds.length === 0}
                                className="h-9 rounded-xl border border-emerald-800 bg-emerald-700/80 px-3 text-sm text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                WhatsApp
                            </button>
                        </div>
                    </div>
                ) : null}

                {actionMessage ? (
                    <div className="mt-4 rounded-2xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                        {actionMessage}
                    </div>
                ) : null}

                {actionError ? (
                    <div className="mt-4 rounded-2xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                        {actionError}
                    </div>
                ) : null}

                {filteredLeads.length === 0 ? (
                    <div className="mt-4 rounded-2xl border border-zinc-800 bg-[#0b1220] px-4 py-8 text-center text-sm text-zinc-500">
                        {hasDisplaySearch
                            ? "No hay leads que coincidan con esta búsqueda."
                            : "No hay leads para este filtro."}
                    </div>
                ) : (
                    <>
                        <div className="mt-4 space-y-4">
                            {sections.map((section) => (
                                <section
                                    key={section.level}
                                    className={`rounded-2xl border p-3 ${getOpportunityPanelTone(
                                        section.level
                                    )}`}
                                >
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span
                                                    className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold tracking-[0.18em] ${getOpportunityBadge(
                                                        section.level
                                                    )}`}
                                                >
                                                    {getOpportunityLabel(section.level)}
                                                </span>
                                                <span className="text-sm text-zinc-400">
                                                    {section.leads.length} lead
                                                    {section.leads.length === 1 ? "" : "s"}
                                                </span>
                                            </div>
                                            <h4 className="mt-3 text-lg font-semibold text-white">
                                                {section.title}
                                            </h4>
                                            <p className="mt-1 text-sm text-zinc-400">
                                                {section.description}
                                            </p>
                                        </div>
                                    </div>

                                    {section.leads.length === 0 ? (
                                        <div className="mt-3 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/30 px-4 py-5 text-sm text-zinc-500">
                                            No hay leads en esta prioridad con el filtro actual.
                                        </div>
                                    ) : (
                                        <div className="mt-3 grid gap-2.5">
                                            {section.leads.map((lead) => {
                                                const isSelected = selectedLeadIds.includes(lead.id);
                                                const isExpanded = expandedLeadIds.includes(lead.id);
                                                const previewReasons = getLeadPreviewReasons(lead);
                                                const opportunityLevel = getOpportunityLevel(lead);
                                                const primaryWhatsappUrl = getWhatsAppUrlFromLead(lead);
                                                const leadFollowUp = lead.followUp ?? {
                                                    nextAction: "",
                                                    dueAt: null,
                                                };
                                                const followUpLead = {
                                                    ...lead,
                                                    followUp: leadFollowUp,
                                                };
                                                const hasFollowUp = hasLeadFollowUp(followUpLead);
                                                const followUpSummary = [
                                                    leadFollowUp.nextAction || null,
                                                    formatFollowUpDate(leadFollowUp.dueAt),
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ");
                                                const compactSignalItems = [
                                                    {
                                                        className: getWebsiteTypeBadge(lead.websiteType),
                                                        label: getWebsiteTypeLabel(lead.websiteType),
                                                    },
                                                    {
                                                        className: getOutreachStatusBadge(lead.outreachStatus),
                                                        label: getOutreachStatusLabel(lead.outreachStatus),
                                                    },
                                                ];
                                                const extraSignalCount = 5 - compactSignalItems.length;

                                                return (
                                                    <article
                                                        key={`${section.level}-${lead.id}`}
                                                        onClick={() => toggleLeadSelection(lead.id)}
                                                        className={`cursor-pointer overflow-hidden rounded-2xl border p-3 transition ${isSelected
                                                            ? "border-violet-800 bg-violet-950/20"
                                                            : "border-zinc-800 bg-[#0b1220] hover:bg-zinc-900/70"
                                                            }`}
                                                    >
                                                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                                                            <div className="min-w-0 flex-1">
                                                                <div className="flex items-start justify-between gap-3">
                                                                    <div className="min-w-0 flex-1">
                                                                        <div className="flex min-w-0 items-start gap-2">
                                                                            <div className="min-w-0 flex-1">
                                                                                <h4 className="line-clamp-2 text-base font-semibold leading-5 text-white">
                                                                                    {lead.businessName}
                                                                                </h4>
                                                                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                                                                                    <span className="rounded border border-zinc-700 px-1.5 py-0.5 text-[11px] text-zinc-400">
                                                                                        {getLeadOriginLabel(lead.origin)}
                                                                                    </span>
                                                                                    <span className="truncate">
                                                                                        ID: {formatLeadId(lead.id)}
                                                                                    </span>
                                                                                    <span className="truncate">
                                                                                        {formatDate(lead.scrapedAt)}
                                                                                    </span>
                                                                                </div>
                                                                            </div>

                                                                            <div
                                                                                onClick={(event) => event.stopPropagation()}
                                                                                className="flex shrink-0 items-start pt-0.5"
                                                                            >
                                                                                <input
                                                                                    id={`select-lead-${lead.id}`}
                                                                                    name={`select-lead-${lead.id}`}
                                                                                    type="checkbox"
                                                                                    checked={isSelected}
                                                                                    onChange={() => toggleLeadSelection(lead.id)}
                                                                                    className="h-4 w-4 cursor-pointer rounded border-zinc-700 bg-zinc-900 text-violet-500 focus:ring-violet-500"
                                                                                />
                                                                            </div>
                                                                        </div>

                                                                        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
                                                                            <OpportunityLevelBadge lead={lead} />
                                                                            <span
                                                                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${getScoreTone(
                                                                                    lead.score
                                                                                )}`}
                                                                            >
                                                                                Score {lead.score} · {getScoreLabel(lead.score)}
                                                                            </span>
                                                                            <span
                                                                                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] ${getStatusBadge(
                                                                                    lead.commercialStatus
                                                                                )}`}
                                                                            >
                                                                                {getStatusLabel(lead.commercialStatus)}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    <div
                                                                        onClick={(event) => event.stopPropagation()}
                                                                        className="shrink-0"
                                                                    >
                                                                        {opportunityLevel === "hot" && primaryWhatsappUrl ? (
                                                                            <a
                                                                                href={primaryWhatsappUrl}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition ${getPrimaryActionClasses(
                                                                                    opportunityLevel
                                                                                )}`}
                                                                            >
                                                                                {getPrimaryActionLabel(opportunityLevel)}
                                                                            </a>
                                                                        ) : (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => openLeadDetail(lead.id)}
                                                                                className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-medium transition ${getPrimaryActionClasses(
                                                                                    opportunityLevel
                                                                                )}`}
                                                                            >
                                                                                {getPrimaryActionLabel(opportunityLevel)}
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                <div className="mt-2.5 flex flex-wrap items-start gap-x-4 gap-y-1.5 text-xs text-zinc-300">
                                                                    <div className="min-w-0 max-w-full">
                                                                        <span className="text-zinc-500">Tel:</span>{" "}
                                                                        <span className="break-words">{lead.phone ?? "—"}</span>
                                                                    </div>
                                                                    <div className="min-w-0 max-w-full">
                                                                        <span className="text-zinc-500">Web:</span>{" "}
                                                                        <span className="break-words font-medium text-zinc-200">
                                                                            {lead.website ? getDomainLabel(lead.website) : "—"}
                                                                        </span>
                                                                    </div>
                                                                    <div className="flex min-w-0 flex-wrap gap-1.5">
                                                                        {compactSignalItems.map((item) => (
                                                                            <span
                                                                                key={`${lead.id}-${item.label}`}
                                                                                className={`inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[11px] leading-4 ${item.className}`}
                                                                            >
                                                                                {item.label}
                                                                            </span>
                                                                        ))}
                                                                        {extraSignalCount > 0 ? (
                                                                            <span className="inline-flex rounded-full border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[11px] leading-4 text-zinc-400">
                                                                                +{extraSignalCount}
                                                                            </span>
                                                                        ) : null}
                                                                    </div>
                                                                </div>

                                                                {hasFollowUp ? (
                                                                    <div className="mt-2">
                                                                        <span
                                                                            className={`inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[11px] leading-4 ${getLeadFollowUpTone(
                                                                                followUpLead
                                                                            )}`}
                                                                        >
                                                                            Seguimiento: {followUpSummary}
                                                                        </span>
                                                                    </div>
                                                                ) : null}

                                                                {isExpanded ? (
                                                                    <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-950/40 p-2.5">
                                                                        <div className="flex flex-wrap gap-1.5">
                                                                            <LeadBadges lead={lead} compact />
                                                                        </div>
                                                                        {previewReasons.length > 0 ? (
                                                                            <div className="mt-2">
                                                                                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                                                    Motivos visibles
                                                                                </p>
                                                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                                                    {previewReasons.map((reason, index) => (
                                                                                        <span
                                                                                            key={`${lead.id}-reason-${index}`}
                                                                                            className="inline-flex max-w-full break-words rounded-full border border-violet-900/40 bg-violet-950/20 px-2 py-0.5 text-[11px] leading-4 text-violet-200"
                                                                                            title={reason}
                                                                                        >
                                                                                            {reason}
                                                                                        </span>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : null}
                                                                        <div className="mt-2">
                                                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                                                Senales comerciales
                                                                            </p>
                                                                            <div className="mt-1.5">
                                                                                <CommercialSignalBadges lead={lead} />
                                                                            </div>
                                                                        </div>
                                                                        <div className="mt-2 border-t border-zinc-800 pt-2">
                                                                            <CommercialIntelligenceCard lead={lead} compact />
                                                                        </div>
                                                                    </div>
                                                                ) : null}

                                                                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                                                    <div
                                                                        onClick={(event) => event.stopPropagation()}
                                                                        className="min-w-0 flex-1"
                                                                    >
                                                                        <RowQuickActions
                                                                            lead={lead}
                                                                            isPending={isPending}
                                                                            onMark={markSingleLead}
                                                                            onSendToSales={sendSingleLeadToSales}
                                                                            onOpenDetail={openLeadDetail}
                                                                        />
                                                                    </div>

                                                                    <div
                                                                        onClick={(event) => event.stopPropagation()}
                                                                        className="flex shrink-0 flex-wrap items-center gap-2"
                                                                    >
                                                                        <select
                                                                            id={`commercial-status-${lead.id}`}
                                                                            name={`commercial-status-${lead.id}`}
                                                                            value={lead.commercialStatus}
                                                                            onChange={(event) =>
                                                                                updateLeadCommercialStatus(
                                                                                    lead.id,
                                                                                    event.target.value
                                                                                )
                                                                            }
                                                                            className="h-8 max-w-[140px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-300 outline-none transition hover:bg-zinc-800"
                                                                        >
                                                                            {!COMMERCIAL_STATUS_OPTIONS.some(
                                                                                (option) =>
                                                                                    option.value ===
                                                                                    lead.commercialStatus
                                                                            ) ? (
                                                                                <option value={lead.commercialStatus}>
                                                                                    {getStatusLabel(
                                                                                        lead.commercialStatus
                                                                                    )}
                                                                                </option>
                                                                            ) : null}
                                                                            {COMMERCIAL_STATUS_OPTIONS.map((option) => (
                                                                                <option
                                                                                    key={option.value}
                                                                                    value={option.value}
                                                                                >
                                                                                    {option.label}
                                                                                </option>
                                                                            ))}
                                                                        </select>

                                                                        <button
                                                                            type="button"
                                                                            onClick={() => openLeadDetail(lead.id)}
                                                                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[11px] text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                                                        >
                                                                            Detalle
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleLeadExpansion(lead.id)}
                                                                            className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-[11px] text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                                                        >
                                                                            {isExpanded ? "Menos" : "Más info"}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </article>
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            ))}
                        </div>

                    </>
                )}
            </section>

            {activeLead ? (
                <div className="fixed inset-0 z-50">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={closeLeadDetail}
                    />

                    <aside className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-zinc-800 bg-[#0b1220] shadow-2xl">
                        <div className="flex min-h-full flex-col">
                            <div className="sticky top-0 z-10 border-b border-zinc-800 bg-[#0b1220]/95 px-4 py-3 backdrop-blur">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                        <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                                            Detalle del lead
                                        </p>
                                        <h3 className="mt-1.5 truncate text-xl font-semibold text-white">
                                            {activeLead.businessName}
                                        </h3>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                                            <span>Origen: {getLeadOriginLabel(activeLead.origin)}</span>
                                            <span>ID: {activeLead.id}</span>
                                            <span>{formatDate(activeLead.scrapedAt)}</span>
                                        </div>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={closeLeadDetail}
                                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                        aria-label="Cerrar detalle"
                                        title="Cerrar detalle"
                                    >
                                        ×
                                    </button>
                                </div>
                            </div>

                            <div className="flex-1 space-y-4 px-4 py-4">
                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Score del lead
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Prioridad automática según datos encontrados.
                                            </p>
                                        </div>

                                        <span
                                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getScoreTone(
                                                activeLead.score
                                            )}`}
                                        >
                                            {getScoreLabel(activeLead.score)}
                                        </span>
                                    </div>

                                    <div className="mt-3 flex items-end justify-between gap-4">
                                        <p className="text-2xl font-semibold tracking-tight text-white">
                                            {activeLead.score}
                                        </p>

                                        <div className="h-2 w-full max-w-[220px] overflow-hidden rounded-full bg-zinc-800">
                                            <div
                                                className={`h-full rounded-full ${activeLead.score >= 80
                                                    ? "bg-emerald-400"
                                                    : activeLead.score >= 50
                                                        ? "bg-amber-400"
                                                        : "bg-zinc-500"
                                                    }`}
                                                style={{
                                                    width: `${Math.max(8, Math.min(activeLead.score, 100))}%`,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                    Motivos del score
                                                </p>
                                                <p className="mt-1 text-xs text-zinc-400">
                                                    Por qué este lead vale lo que vale.
                                                </p>
                                            </div>

                                            <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                                                {scoreReasons.length}{" "}
                                                {scoreReasons.length === 1 ? "motivo" : "motivos"}
                                            </span>
                                        </div>

                                        {scoreReasons.length === 0 ? (
                                            <div className="mt-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-5 text-sm text-zinc-400">
                                                Este lead todavía no tiene motivos de score visibles.
                                            </div>
                                        ) : (
                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {scoreReasons.map((reason, index) => (
                                                    <span
                                                        key={`${reason}-${index}`}
                                                        className="inline-flex max-w-full rounded-full border border-violet-900/50 bg-violet-950/30 px-2.5 py-1 text-[11px] text-violet-200"
                                                    >
                                                        {reason}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Estado actual
                                            </p>
                                            <div className="mt-2">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] ${getStatusBadge(
                                                        activeLead.commercialStatus
                                                    )}`}
                                                >
                                                    {getStatusLabel(activeLead.commercialStatus)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="min-w-[170px]">
                                            <label
                                                htmlFor="active-lead-commercial-status"
                                                className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-zinc-500"
                                            >
                                                Cambiar estado
                                            </label>
                                            <select
                                                id="active-lead-commercial-status"
                                                name="active-lead-commercial-status"
                                                value={activeLead.commercialStatus}
                                                onChange={(event) =>
                                                    updateLeadCommercialStatus(
                                                        activeLead.id,
                                                        event.target.value
                                                    )
                                                }
                                                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 outline-none transition hover:bg-zinc-800"
                                            >
                                                {!COMMERCIAL_STATUS_OPTIONS.some(
                                                    (option) =>
                                                        option.value === activeLead.commercialStatus
                                                ) ? (
                                                    <option value={activeLead.commercialStatus}>
                                                        {getStatusLabel(activeLead.commercialStatus)}
                                                    </option>
                                                ) : null}
                                                {COMMERCIAL_STATUS_OPTIONS.map((option) => (
                                                    <option
                                                        key={option.value}
                                                        value={option.value}
                                                    >
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-2">
                                        <LeadBadges lead={activeLead} />
                                    </div>
                                    <div className="mt-2">
                                        <CommercialSignalBadges lead={activeLead} />
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Inteligencia comercial
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Contexto listo para decidir oferta y canal.
                                            </p>
                                        </div>

                                        <span
                                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getAutomationBadge(
                                                activeLead.readyForAutomation
                                            )}`}
                                        >
                                            {activeLead.readyForAutomation
                                                ? "Listo para automatización"
                                                : "Operación manual"}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Tipo de negocio
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-white">
                                                {getBusinessTypeLabel(activeLead.businessType)}
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Oferta sugerida
                                            </p>
                                            <p className="mt-1 text-sm font-semibold text-white">
                                                {formatTokenLabel(activeLead.suggestedOffer)}
                                            </p>
                                        </div>

                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Estado de outreach
                                            </p>
                                            <div className="mt-1.5">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getOutreachStatusBadge(
                                                        activeLead.outreachStatus
                                                    )}`}
                                                >
                                                    {getOutreachStatusLabel(activeLead.outreachStatus)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Canal sugerido
                                            </p>
                                            <div className="mt-1.5">
                                                <span
                                                    className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${getOutreachChannelBadge(
                                                        activeLead.outreachChannel
                                                    )}`}
                                                >
                                                    {getOutreachChannelLabel(activeLead.outreachChannel)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3">
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                            Motivo de la oferta
                                        </p>
                                        <p className="mt-2 break-words text-sm leading-6 text-zinc-300">
                                            {activeLead.offerReason ??
                                                "Todavía no hay una explicación comercial visible para este lead."}
                                        </p>
                                    </div>
                                </section>

                                <section className="grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                            Teléfono
                                        </p>
                                        <p className="mt-1 text-sm font-semibold text-white">
                                            {activeLead.phone ?? "—"}
                                        </p>
                                    </div>

                                    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:col-span-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Website
                                            </p>
                                            <WebsiteTypeSignalBadge
                                                websiteType={activeLead.websiteType}
                                            />
                                        </div>
                                        {activeLead.website ? (
                                            <>
                                                <p className="mt-1 text-sm font-semibold text-white">
                                                    {getDomainLabel(activeLead.website)}
                                                </p>
                                                <a
                                                    href={activeLead.website}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="mt-1 block break-all text-xs text-violet-300 underline-offset-4 hover:underline"
                                                >
                                                    {activeLead.website}
                                                </a>
                                            </>
                                        ) : (
                                            <p className="mt-1 text-sm font-semibold text-white">—</p>
                                        )}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Nueva observación
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Guardá contexto comercial sin salir del flujo.
                                            </p>
                                        </div>

                                        <span className="rounded-full border border-violet-900/50 bg-violet-950/30 px-2.5 py-1 text-[11px] font-medium text-violet-300">
                                            Lead activo
                                        </span>
                                    </div>

                                    <div className="mt-3 space-y-2.5">
                                        <textarea
                                            id="lead-note"
                                            name="lead-note"
                                            value={noteContent}
                                            onChange={(event) => setNoteContent(event.target.value)}
                                            placeholder="Ej: Tiene Instagram activo, no tiene web y parece buen candidato para contacto rápido."
                                            rows={3}
                                            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-zinc-500 focus:border-zinc-500"
                                        />

                                        <div className="flex items-center justify-between gap-3">
                                            <p className="text-xs text-zinc-500">
                                                Máximo sugerido: 1000 caracteres.
                                            </p>

                                            <button
                                                type="button"
                                                onClick={saveLeadNote}
                                                disabled={isPending}
                                                className="inline-flex h-9 items-center justify-center rounded-xl border border-violet-800 bg-violet-600/90 px-4 text-sm font-medium text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {isPending ? "Guardando..." : "Guardar observación"}
                                            </button>
                                        </div>

                                        {noteMessage ? (
                                            <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                                                {noteMessage}
                                            </div>
                                        ) : null}

                                        {noteError ? (
                                            <div className="rounded-xl border border-red-900/50 bg-red-950/20 px-4 py-3 text-sm text-red-300">
                                                {noteError}
                                            </div>
                                        ) : null}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Historial de observaciones
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Contexto acumulado para operar mejor el lead.
                                            </p>
                                        </div>

                                        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                                            {notesCount} {notesCount === 1 ? "nota" : "notas"}
                                        </span>
                                    </div>

                                    {activeLead.notes.length === 0 ? (
                                        <div className="mt-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-5 text-sm text-zinc-400">
                                            Todavía no hay observaciones para este lead.
                                        </div>
                                    ) : (
                                        <>
                                            <div className="mt-3 flex">
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setIsNotesHistoryOpen((current) => !current)
                                                    }
                                                    className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                                >
                                                    {isNotesHistoryOpen
                                                        ? "Ocultar historial"
                                                        : "Ver historial"}
                                                </button>
                                            </div>

                                            {isNotesHistoryOpen ? (
                                                <div className="mt-3 space-y-2.5">
                                                    {activeLead.notes.map((note, index) => (
                                                        <div
                                                            key={note.id}
                                                            className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"
                                                        >
                                                            <div className="flex items-center justify-between gap-3">
                                                                <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-zinc-400">
                                                                    Nota {notesCount - index}
                                                                </span>
                                                                <span className="text-xs text-zinc-500">
                                                                    {formatDate(note.createdAt)}
                                                                </span>
                                                            </div>

                                                            <p className="mt-2 break-words text-sm leading-6 text-zinc-200">
                                                                {note.content}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </>
                                    )}
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Próxima acción
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Definí el siguiente paso operativo para este lead.
                                            </p>
                                        </div>

                                        {activeLeadFollowUp.nextAction || activeLeadFollowUp.dueAt ? (
                                            <span className="rounded-full border border-indigo-900/50 bg-indigo-950/20 px-2.5 py-1 text-[11px] font-medium text-indigo-200">
                                                Seguimiento activo
                                            </span>
                                        ) : null}
                                    </div>

                                    <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_160px]">
                                        <div>
                                            <label
                                                htmlFor="lead-follow-up-action"
                                                className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-zinc-500"
                                            >
                                                Próxima acción
                                            </label>
                                            <select
                                                id="lead-follow-up-action"
                                                name="lead-follow-up-action"
                                                value={followUpNextAction}
                                                onChange={(event) =>
                                                    setFollowUpNextAction(event.target.value)
                                                }
                                                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 outline-none transition hover:bg-zinc-800"
                                            >
                                                <option value="">Sin definir</option>
                                                {followUpOptions.map((option) => (
                                                    <option key={option} value={option}>
                                                        {option}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label
                                                htmlFor="lead-follow-up-date"
                                                className="mb-1 block text-[10px] uppercase tracking-[0.14em] text-zinc-500"
                                            >
                                                Fecha
                                            </label>
                                            <input
                                                id="lead-follow-up-date"
                                                name="lead-follow-up-date"
                                                type="date"
                                                value={followUpDueAt}
                                                onChange={(event) =>
                                                    setFollowUpDueAt(event.target.value)
                                                }
                                                className="h-9 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 outline-none transition hover:bg-zinc-800"
                                            />
                                        </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                                        <div className="text-xs text-zinc-500">
                                            {activeLeadFollowUp.nextAction || activeLeadFollowUp.dueAt ? (
                                                <span>
                                                    Actual:{" "}
                                                    <span className="text-zinc-300">
                                                        {[
                                                            activeLeadFollowUp.nextAction || null,
                                                            formatFollowUpDate(activeLeadFollowUp.dueAt),
                                                        ]
                                                            .filter(Boolean)
                                                            .join(" · ")}
                                                    </span>
                                                </span>
                                            ) : (
                                                <span>Todavía no hay seguimiento cargado para este lead.</span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            onClick={saveLeadFollowUp}
                                            className="inline-flex h-8 items-center justify-center rounded-lg border border-indigo-800 bg-indigo-700/80 px-3 text-xs text-white transition hover:bg-indigo-600"
                                        >
                                            Guardar seguimiento
                                        </button>
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Historial operativo
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Trazabilidad local de acciones sobre el lead.
                                            </p>
                                        </div>

                                        <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[11px] font-medium text-zinc-300">
                                            {activeLeadActivity.length}{" "}
                                            {activeLeadActivity.length === 1
                                                ? "evento"
                                                : "eventos"}
                                        </span>
                                    </div>

                                    {activeLeadActivity.length === 0 ? (
                                        <div className="mt-3 rounded-xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-5 text-sm text-zinc-400">
                                            Todavía no hay actividad operativa registrada para este lead.
                                        </div>
                                    ) : (
                                        <div className="mt-3 space-y-2">
                                            {activeLeadActivity.map((activity) => (
                                                <div
                                                    key={activity.id}
                                                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <span
                                                                className={`inline-flex rounded-full px-2 py-0.5 text-[10px] ${getActivityBadgeClasses(
                                                                    activity.type
                                                                )}`}
                                                            >
                                                                {getActivityTypeLabel(activity.type)}
                                                            </span>
                                                            <p className="mt-2 break-words text-sm text-zinc-200">
                                                                {activity.label}
                                                            </p>
                                                            {activity.metadata ? (
                                                                <p className="mt-1 break-words text-xs text-zinc-500">
                                                                    {activity.metadata}
                                                                </p>
                                                            ) : null}
                                                        </div>

                                                        <span className="shrink-0 text-xs text-zinc-500">
                                                            {formatDate(activity.createdAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                        Acciones rápidas
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => markSingleLead(activeLead.id)}
                                            disabled={isPending}
                                            className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Marcar
                                        </button>

                                        <button
                                            type="button"
                                            onClick={() => sendSingleLeadToSales(activeLead.id)}
                                            disabled={isPending}
                                            className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-sm text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Enviar a ventas
                                        </button>

                                        {activeLeadWhatsAppUrl ? (
                                            <a
                                                href={activeLeadWhatsAppUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex h-9 items-center justify-center rounded-xl border border-emerald-800 bg-emerald-700/80 px-4 text-sm text-white transition hover:bg-emerald-600"
                                            >
                                                Abrir WhatsApp
                                            </a>
                                        ) : (
                                            <button
                                                type="button"
                                                disabled
                                                className="inline-flex h-9 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-900 px-4 text-sm text-zinc-500 opacity-70"
                                            >
                                                Sin WhatsApp usable
                                            </button>
                                        )}
                                    </div>
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                                Mensaje sugerido para WhatsApp
                                            </p>
                                            <p className="mt-1 text-xs text-zinc-400">
                                                Preview exacta del mensaje generado con la lógica actual.
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2">
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setIsWhatsAppPreviewOpen((current) => !current)
                                                }
                                                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                            >
                                                {isWhatsAppPreviewOpen
                                                    ? "Ocultar preview"
                                                    : "Ver preview"}
                                            </button>

                                            <button
                                                type="button"
                                                onClick={copyWhatsAppMessage}
                                                className="inline-flex h-8 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs text-zinc-300 transition hover:bg-zinc-800 hover:text-white"
                                            >
                                                Copiar mensaje
                                            </button>
                                        </div>
                                    </div>

                                    {isWhatsAppPreviewOpen ? (
                                        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                                            <p className="break-words whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                                                {activeLeadWhatsAppMessage}
                                            </p>
                                        </div>
                                    ) : null}

                                    {whatsAppPreviewMessage ? (
                                        <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-300">
                                            {whatsAppPreviewMessage}
                                        </div>
                                    ) : null}
                                </section>

                                <section className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3">
                                    <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                                        Próximo paso del producto
                                    </p>
                                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                                        Este lead ya no se ve solo como dato scrapeado: ahora tenés
                                        tipo de negocio, oferta sugerida, motivo comercial y canal
                                        recomendado para decidir la siguiente acción.
                                    </p>
                                </section>
                            </div>
                        </div>
                    </aside>
                </div>
            ) : null}
        </>
    );
}
