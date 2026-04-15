export type FilterType =
    | "all"
    | "no-website"
    | "marked"
    | "ready"
    | "with-follow-up"
    | "without-follow-up"
    | "follow-up-today"
    | "follow-up-overdue";
export type LeadPriority = "high" | "medium" | "low";
export type SortType =
    | "score-desc"
    | "recent-desc"
    | "name-asc"
    | "follow-up-asc"
    | "follow-up-desc";
export type OpportunityLevel = "hot" | "warm" | "cold";
export type CommercialStatus =
    | "new"
    | "reviewed"
    | "contacted"
    | "responded"
    | "interested"
    | "follow-up"
    | "closed"
    | "discarded"
    | "marked"
    | "ready";

export const COMMERCIAL_STATUS_OPTIONS: Array<{
    value: CommercialStatus;
    label: string;
}> = [
    { value: "new", label: "Nuevo" },
    { value: "reviewed", label: "Revisado" },
    { value: "contacted", label: "Contactado" },
    { value: "responded", label: "Respondió" },
    { value: "interested", label: "Interesado" },
    { value: "follow-up", label: "Seguimiento" },
    { value: "closed", label: "Cerrado" },
    { value: "discarded", label: "Descartado" },
];

type LeadWithBasics = {
    phone: string | null;
    website: string | null;
};

type LeadWithWebsiteType = LeadWithBasics & {
    websiteType?: string | null;
};

type LeadWithScoreReasons = {
    scoreReasons: string[];
};

type LeadWithFollowUp = {
    followUp?: {
        nextAction?: string;
        dueAt?: Date | string | null;
    } | null;
};

function parseFollowUpDate(value: Date | string | null | undefined) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split("-").map(Number);
        return new Date(year, month - 1, day);
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function getStatusBadge(status: string) {
    if (status === "new") {
        return "border border-zinc-700 bg-zinc-800 text-zinc-200";
    }

    if (status === "reviewed" || status === "marked") {
        return "border border-amber-900/50 bg-amber-950/30 text-amber-300";
    }

    if (status === "contacted") {
        return "border border-violet-900/50 bg-violet-950/30 text-violet-300";
    }

    if (status === "responded") {
        return "border border-sky-900/50 bg-sky-950/30 text-sky-300";
    }

    if (status === "interested") {
        return "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
    }

    if (status === "follow-up") {
        return "border border-indigo-900/50 bg-indigo-950/30 text-indigo-300";
    }

    if (status === "closed" || status === "ready") {
        return "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
    }

    if (status === "discarded") {
        return "border border-rose-900/50 bg-rose-950/30 text-rose-300";
    }

    return "border border-zinc-800 bg-zinc-900 text-zinc-400";
}

export function getStatusLabel(status: string) {
    if (status === "new") {
        return "Nuevo";
    }

    if (status === "reviewed") {
        return "Revisado";
    }

    if (status === "contacted") {
        return "Contactado";
    }

    if (status === "responded") {
        return "Respondió";
    }

    if (status === "interested") {
        return "Interesado";
    }

    if (status === "follow-up") {
        return "Seguimiento";
    }

    if (status === "closed") {
        return "Cerrado";
    }

    if (status === "discarded") {
        return "Descartado";
    }

    if (status === "marked") {
        return "Marcado";
    }

    if (status === "ready") {
        return "Listo para ventas";
    }

    return status;
}

export function getLeadPriority(lead: LeadWithBasics): LeadPriority {
    const hasPhone = !!lead.phone && lead.phone.trim() !== "";
    const hasWebsite = !!lead.website && lead.website.trim() !== "";

    if (hasPhone && !hasWebsite) {
        return "high";
    }

    if (hasPhone || !hasWebsite) {
        return "medium";
    }

    return "low";
}

export function getPriorityLabel(priority: LeadPriority) {
    if (priority === "high") {
        return "Alta";
    }

    if (priority === "medium") {
        return "Media";
    }

    return "Baja";
}

export function getPriorityBadge(priority: LeadPriority) {
    if (priority === "high") {
        return "border border-red-900/50 bg-red-950/30 text-red-300";
    }

    if (priority === "medium") {
        return "border border-amber-900/50 bg-amber-950/30 text-amber-300";
    }

    return "border border-zinc-800 bg-zinc-900 text-zinc-400";
}

export function getFilterLabel(filter: FilterType) {
    if (filter === "all") {
        return "Todos";
    }

    if (filter === "no-website") {
        return "Sin web";
    }

    if (filter === "marked") {
        return "Marcados";
    }

    if (filter === "with-follow-up") {
        return "Con seguimiento";
    }

    if (filter === "without-follow-up") {
        return "Sin seguimiento";
    }

    if (filter === "follow-up-today") {
        return "Seguimiento hoy";
    }

    if (filter === "follow-up-overdue") {
        return "Seguimiento vencido";
    }

    return "Listos para ventas";
}

export function getSortLabel(sort: SortType) {
    if (sort === "score-desc") {
        return "Mayor score";
    }

    if (sort === "recent-desc") {
        return "Más recientes";
    }

    if (sort === "follow-up-asc") {
        return "Seguimiento más urgente";
    }

    if (sort === "follow-up-desc") {
        return "Seguimiento más lejano";
    }

    return "Nombre A-Z";
}

export function formatDate(value: Date | string) {
    return new Date(value).toLocaleString("es-AR");
}

export function formatLeadId(id: string) {
    if (id.length <= 14) {
        return id;
    }

    return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

export function getDomainLabel(website: string | null) {
    if (!website) {
        return "—";
    }

    try {
        return new URL(website).hostname.replace(/^www\./, "");
    } catch {
        return website;
    }
}

export function getWebsiteTypeLabel(websiteType: string | null | undefined) {
    if (websiteType === "real") {
        return "Web propia";
    }

    if (websiteType === "aggregator") {
        return "Agregador";
    }

    if (websiteType === "social") {
        return "Red social";
    }

    return "Sin web útil";
}

export function getWebsiteTypeBadge(websiteType: string | null | undefined) {
    if (websiteType === "real") {
        return "border border-sky-900/50 bg-sky-950/30 text-sky-300";
    }

    if (websiteType === "aggregator") {
        return "border border-amber-900/50 bg-amber-950/30 text-amber-300";
    }

    if (websiteType === "social") {
        return "border border-fuchsia-900/50 bg-fuchsia-950/30 text-fuchsia-300";
    }

    return "border border-zinc-700 bg-zinc-900 text-zinc-300";
}

export function getScoreTone(score: number) {
    if (score >= 80) {
        return "border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
    }

    if (score >= 50) {
        return "border-amber-900/50 bg-amber-950/30 text-amber-300";
    }

    return "border-zinc-800 bg-zinc-900 text-zinc-300";
}

export function getScoreLabel(score: number) {
    if (score >= 80) {
        return "Alto";
    }

    if (score >= 50) {
        return "Medio";
    }

    return "Bajo";
}

export function getLeadPreviewReasons(lead: LeadWithScoreReasons, limit = 2) {
    return (lead.scoreReasons ?? [])
        .filter((reason) => reason && reason.trim() !== "")
        .slice(0, limit);
}

export function hasLeadFollowUp(lead: LeadWithFollowUp) {
    const nextAction = lead.followUp?.nextAction?.trim() ?? "";
    return nextAction !== "" || Boolean(lead.followUp?.dueAt);
}

export function isLeadFollowUpToday(lead: LeadWithFollowUp) {
    const dueDate = parseFollowUpDate(lead.followUp?.dueAt);

    if (!dueDate) {
        return false;
    }

    const today = startOfDay(new Date());
    const target = startOfDay(dueDate);
    return target.getTime() === today.getTime();
}

export function isLeadFollowUpOverdue(lead: LeadWithFollowUp) {
    const dueDate = parseFollowUpDate(lead.followUp?.dueAt);

    if (!dueDate) {
        return false;
    }

    const today = startOfDay(new Date());
    const target = startOfDay(dueDate);
    return target.getTime() < today.getTime();
}

export function getLeadFollowUpSortTime(lead: LeadWithFollowUp) {
    const dueDate = parseFollowUpDate(lead.followUp?.dueAt);
    return dueDate ? startOfDay(dueDate).getTime() : null;
}

export function getLeadFollowUpTone(lead: LeadWithFollowUp) {
    if (isLeadFollowUpOverdue(lead)) {
        return "border-red-900/50 bg-red-950/20 text-red-200";
    }

    if (isLeadFollowUpToday(lead)) {
        return "border-amber-900/50 bg-amber-950/25 text-amber-200";
    }

    return "border-indigo-900/50 bg-indigo-950/20 text-indigo-200";
}

export function getOpportunityLevel(lead: LeadWithWebsiteType): OpportunityLevel {
    const hasPhone = !!lead.phone && lead.phone.trim() !== "";
    const websiteType = lead.websiteType ?? "unknown";

    if (!hasPhone) {
        return "cold";
    }

    if (websiteType === "real") {
        return "cold";
    }

    return "hot";
}

export function getOpportunityLabel(level: OpportunityLevel) {
    if (level === "hot") {
        return "HOT";
    }

    if (level === "warm") {
        return "WARM";
    }

    return "COLD";
}

export function getOpportunityDescription(level: OpportunityLevel) {
    if (level === "hot") {
        return "Oportunidad inmediata";
    }

    if (level === "warm") {
        return "Para trabajar";
    }

    return "Bajo impacto";
}

export function getOpportunityBadge(level: OpportunityLevel) {
    if (level === "hot") {
        return "border border-red-800/60 bg-red-500/15 text-red-200";
    }

    if (level === "warm") {
        return "border border-amber-800/60 bg-amber-500/15 text-amber-200";
    }

    return "border border-zinc-700 bg-zinc-900 text-zinc-300";
}

export function getOpportunityPanelTone(level: OpportunityLevel) {
    if (level === "hot") {
        return "border-red-900/50 bg-red-950/10";
    }

    if (level === "warm") {
        return "border-amber-900/40 bg-amber-950/10";
    }

    return "border-zinc-800 bg-[#0b1220]";
}

export function getPrimaryActionLabel(level: OpportunityLevel) {
    if (level === "hot") {
        return "Contactar ahora";
    }

    if (level === "warm") {
        return "Revisar oportunidad";
    }

    return "Baja prioridad";
}

export function getPrimaryActionClasses(level: OpportunityLevel) {
    if (level === "hot") {
        return "border-red-700 bg-red-600 text-white hover:bg-red-500";
    }

    if (level === "warm") {
        return "border-amber-700 bg-amber-500 text-black hover:bg-amber-400";
    }

    return "border-zinc-700 bg-zinc-900 text-zinc-300 hover:bg-zinc-800";
}
