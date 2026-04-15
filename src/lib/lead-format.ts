export function formatTokenLabel(value: string | null | undefined) {
    if (!value) {
        return "—";
    }

    return value
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

export function getBusinessTypeLabel(businessType: string | null) {
    if (businessType === "retail") {
        return "Retail";
    }

    if (businessType === "gastronomia") {
        return "Gastronomía";
    }

    if (businessType === "belleza") {
        return "Belleza";
    }

    if (businessType === "servicios_locales") {
        return "Servicios locales";
    }

    if (businessType === "servicios_profesionales") {
        return "Servicios profesionales";
    }

    if (businessType === "empresa_tecnologica") {
        return "Empresa tecnológica";
    }

    if (businessType === "empresa_operativa") {
        return "Empresa operativa";
    }

    if (businessType === "pyme_general") {
        return "PyME general";
    }

    return formatTokenLabel(businessType);
}

export function getOutreachStatusLabel(status: string) {
    if (status === "pending_review") {
        return "Pendiente de revisión";
    }

    if (status === "qualified") {
        return "Calificado";
    }

    if (status === "in_progress") {
        return "En progreso";
    }

    if (status === "contacted") {
        return "Contactado";
    }

    return formatTokenLabel(status);
}

export function getOutreachStatusBadge(status: string) {
    if (status === "qualified") {
        return "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
    }

    if (status === "pending_review") {
        return "border border-amber-900/50 bg-amber-950/30 text-amber-300";
    }

    if (status === "contacted" || status === "in_progress") {
        return "border border-violet-900/50 bg-violet-950/30 text-violet-300";
    }

    return "border border-zinc-800 bg-zinc-900 text-zinc-400";
}

export function getOutreachChannelLabel(channel: string | null) {
    if (channel === "manual_review") {
        return "Revisión manual";
    }

    if (channel === "whatsapp") {
        return "WhatsApp";
    }

    if (channel === "email") {
        return "Email";
    }

    if (channel === "phone") {
        return "Llamado";
    }

    return formatTokenLabel(channel);
}

export function getOutreachChannelBadge(channel: string | null) {
    if (channel === "whatsapp") {
        return "border border-emerald-900/50 bg-emerald-950/30 text-emerald-300";
    }

    if (channel === "manual_review") {
        return "border border-zinc-700 bg-zinc-900 text-zinc-300";
    }

    return "border border-violet-900/50 bg-violet-950/30 text-violet-300";
}

export function getAutomationBadge(readyForAutomation: boolean) {
    return readyForAutomation
        ? "border border-cyan-900/50 bg-cyan-950/30 text-cyan-300"
        : "border border-zinc-800 bg-zinc-900 text-zinc-400";
}
