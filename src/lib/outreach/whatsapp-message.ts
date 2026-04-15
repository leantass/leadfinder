import { formatTokenLabel } from "@/lib/lead-format";

export type WhatsAppMessageLead = {
    businessName: string;
    website: string | null;
    score: number;
    phone: string | null;
    businessType: string | null;
    suggestedOffer: string | null;
    offerReason: string | null;
};

function normalizePhoneForWhatsApp(phone: string | null) {
    if (!phone) {
        return null;
    }

    const digits = phone.replace(/\D/g, "");

    if (!digits) {
        return null;
    }

    if (digits.startsWith("54")) {
        return digits;
    }

    if (digits.startsWith("0")) {
        return `54${digits.slice(1)}`;
    }

    return `54${digits}`;
}

export function buildWhatsAppMessage(lead: WhatsAppMessageLead) {
    const hasWebsite = !!lead.website && lead.website.trim() !== "";
    const highScore = lead.score >= 80;
    const businessName = lead.businessName.trim() || "equipo";
    const compactOfferReason = lead.offerReason?.trim()
        ? lead.offerReason.trim().replace(/\s+/g, " ").slice(0, 120)
        : null;

    if (lead.suggestedOffer === "web_turnos_catalogo") {
        return `Hola ${businessName}, ¿cómo están? Vi una oportunidad para tener web propia con catálogo, reservas o turnos y ordenar mejor las consultas. Si quieren, les comparto una idea concreta.`;
    }

    if (lead.suggestedOffer === "ecommerce_catalogo_estokia") {
        return `Hola ${businessName}, ¿cómo están? Creo que hay una buena oportunidad para armar un catálogo online o ecommerce y ordenar mejor la venta. Si les sirve, les comparto una propuesta concreta.`;
    }

    if (lead.suggestedOffer === "estokia_automatizacion_comercial") {
        return `Hola ${businessName}, ¿cómo están? Vi margen para mejorar stock, orden comercial y tareas administrativas con automatización. Si quieren, les cuento una idea puntual.`;
    }

    if (lead.suggestedOffer === "web_institucional_captacion") {
        return `Hola ${businessName}, ¿cómo están? Creo que una web institucional bien armada les puede ayudar a verse más profesionales y captar más consultas. Si les interesa, les comparto una propuesta simple.`;
    }

    if (lead.suggestedOffer === "automatizacion_marketing_ia") {
        return `Hola ${businessName}, ¿cómo están? Hay una oportunidad para automatizar seguimiento, atención y consultas para convertir mejor. Si les sirve, les cuento cómo lo encararía.`;
    }

    if (lead.suggestedOffer === "automatizacion_comercial_ia") {
        return `Hola ${businessName}, ¿cómo están? Creo que pueden mejorar mucho el seguimiento comercial, las respuestas y la captación con automatización. Si quieren, les comparto una idea concreta.`;
    }

    if (lead.suggestedOffer === "web_institucional_catalogo") {
        return `Hola ${businessName}, ¿cómo están? Veo una buena oportunidad para tener web propia con catálogo y una presencia digital más sólida. Si les interesa, les comparto una propuesta corta.`;
    }

    if (lead.suggestedOffer === "automatizacion_atencion_y_leads") {
        return `Hola ${businessName}, ¿cómo están? Hay margen para automatizar atención, ordenar consultas y captar mejor los leads que ya les llegan. Si quieren, les comparto una idea puntual.`;
    }

    if (lead.suggestedOffer === "estokia_automatizacion_operativa") {
        return `Hola ${businessName}, ¿cómo están? Creo que hay una oportunidad para ordenar procesos, stock y trazabilidad con una solución más operativa. Si les sirve, les cuento una propuesta concreta.`;
    }

    if (lead.suggestedOffer === "synfive_infraestructura_y_backend") {
        return `Hola ${businessName}, ¿cómo están? Vi un perfil interesante para trabajar infraestructura, backend y escalabilidad con soporte técnico serio. Si quieren, les comparto una idea concreta.`;
    }

    if (lead.suggestedOffer === "desarrollo_software_a_medida") {
        return `Hola ${businessName}, ¿cómo están? Creo que una solución de software a medida puede ayudarles a resolver algo muy puntual del negocio. Si les interesa, les comparto una idea concreta.`;
    }

    if (lead.suggestedOffer === "web_presencia_digital") {
        return `Hola ${businessName}, ¿cómo están? Vi una oportunidad clara para mejorar presencia digital con web propia y generar más consultas. Si quieren, les comparto una propuesta simple.`;
    }

    if (lead.suggestedOffer === "automatizacion_y_mejora_comercial") {
        return `Hola ${businessName}, ¿cómo están? Creo que pueden mejorar eficiencia y resultado comercial con automatización bien aplicada. Si les sirve, les comparto una idea puntual.`;
    }

    if (lead.suggestedOffer && compactOfferReason) {
        return `Hola ${businessName}, ¿cómo están? Vi una oportunidad concreta vinculada a ${formatTokenLabel(
            lead.suggestedOffer
        ).toLowerCase()}. ${compactOfferReason}${compactOfferReason.endsWith(".") ? "" : "."}`;
    }

    if (!hasWebsite && highScore) {
        return `Hola ${businessName}, ¿cómo están? Vi una oportunidad clara para mejorar presencia digital y captar más consultas. Si les interesa, les comparto una idea concreta.`;
    }

    if (!hasWebsite) {
        return `Hola ${businessName}, ¿cómo están? Creo que una presencia digital más sólida les puede ayudar a generar más consultas y ordenar mejor el contacto. Si quieren, les comparto una propuesta simple.`;
    }

    if (highScore) {
        return `Hola ${businessName}, ¿cómo están? Vi margen para mejorar ventas, seguimiento y orden comercial con una solución bien enfocada. Si les sirve, les comparto una idea puntual.`;
    }

    if (lead.businessType === "servicios_profesionales") {
        return `Hola ${businessName}, ¿cómo están? Creo que hay una oportunidad para mejorar captación y seguimiento comercial con una solución simple y profesional. Si quieren, les comparto una idea concreta.`;
    }

    if (lead.businessType === "empresa_operativa" || lead.businessType === "empresa_tecnologica") {
        return `Hola ${businessName}, ¿cómo están? Vi una oportunidad para ordenar procesos y ganar eficiencia con una solución más específica para la operación. Si les interesa, les cuento una idea puntual.`;
    }

    return `Hola ${businessName}, ¿cómo están? Vi una oportunidad para mejorar presencia digital, orden comercial o atención según cómo hoy están operando. Si quieren, les comparto una idea concreta.`;
}

export function getWhatsAppUrlFromLead(lead: WhatsAppMessageLead) {
    const phone = normalizePhoneForWhatsApp(lead.phone);
    if (!phone) {
        return null;
    }

    const message = encodeURIComponent(buildWhatsAppMessage(lead));
    return `https://wa.me/${phone}?text=${message}`;
}
