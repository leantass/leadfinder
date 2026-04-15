import { getOpportunityLevel, hasLeadFollowUp, isLeadFollowUpOverdue, isLeadFollowUpToday } from "@/lib/leads/lead-ui";
import { buildWhatsAppMessage } from "@/lib/outreach/whatsapp-message";

import type {
    AutomationAutoApplyPolicy,
    AutomationConfidence,
    AutomationRunItem,
    LeadAutoAction,
    LeadAutomationDecision,
    LeadItem,
} from "@/components/leads-panel/types";

export const DEFAULT_AUTO_APPLY_ACTIONS: LeadAutoAction[] = [
    "contact_now",
    "follow_up",
    "send_to_sales",
];

export const DEFAULT_AUTO_APPLY_POLICY: AutomationAutoApplyPolicy = {
    enabled: false,
    minConfidence: "high",
    allowedActions: DEFAULT_AUTO_APPLY_ACTIONS,
};

export function getLeadAutomationActionLabel(action: LeadAutoAction) {
    if (action === "contact_now") {
        return "Contactar ahora";
    }

    if (action === "follow_up") {
        return "Hacer seguimiento";
    }

    if (action === "discard") {
        return "Descartar";
    }

    if (action === "close") {
        return "Cerrar";
    }

    if (action === "send_to_sales") {
        return "Enviar a ventas";
    }

    return "Revisar manualmente";
}

export function getLeadAutomationDecisions(leads: LeadItem[]) {
    return leads.map((lead) => getLeadAutomationDecision(lead));
}

function getConfidenceRank(confidence: AutomationConfidence) {
    if (confidence === "high") {
        return 3;
    }

    if (confidence === "medium") {
        return 2;
    }

    return 1;
}

export function getNormalizedAutomationAutoApplyPolicy(
    policy?: Partial<AutomationAutoApplyPolicy> | null
): AutomationAutoApplyPolicy {
    const minConfidence = policy?.minConfidence ?? DEFAULT_AUTO_APPLY_POLICY.minConfidence;
    const allowedActions = Array.isArray(policy?.allowedActions)
        ? policy.allowedActions.filter((action): action is LeadAutoAction =>
              DEFAULT_AUTO_APPLY_ACTIONS.includes(action) ||
              action === "review_manually" ||
              action === "discard" ||
              action === "close"
          )
        : DEFAULT_AUTO_APPLY_POLICY.allowedActions;

    return {
        enabled: policy?.enabled ?? DEFAULT_AUTO_APPLY_POLICY.enabled,
        minConfidence,
        allowedActions: Array.from(new Set(allowedActions)),
    };
}

export function isAutomationConfidenceAllowed(
    confidence: AutomationConfidence,
    minConfidence: AutomationConfidence
) {
    return getConfidenceRank(confidence) >= getConfidenceRank(minConfidence);
}

export function isSafeAutoApplicableAutomationDecision(
    decision: {
        action: LeadAutoAction;
        confidence: AutomationConfidence;
    },
    policy?: Partial<AutomationAutoApplyPolicy> | null
) {
    const normalizedPolicy = getNormalizedAutomationAutoApplyPolicy(policy);

    if (!normalizedPolicy.enabled) {
        return false;
    }

    return (
        isAutomationConfidenceAllowed(
            decision.confidence,
            normalizedPolicy.minConfidence
        ) && normalizedPolicy.allowedActions.includes(decision.action)
    );
}

export function isSafeAutoApplicableAutomationRunItem(
    item: AutomationRunItem,
    policy?: Partial<AutomationAutoApplyPolicy> | null
) {
    return item.status === "pending" && isSafeAutoApplicableAutomationDecision(item, policy);
}

export function getLeadAutomationDecision(lead: LeadItem): LeadAutomationDecision {
    const hasPhone = Boolean(lead.phone && lead.phone.trim() !== "");
    const hasRealWebsite = lead.websiteType === "real";
    const opportunityLevel = getOpportunityLevel(lead);
    const isClosed = lead.commercialStatus === "closed";
    const isDiscarded = lead.commercialStatus === "discarded";
    const isReady = lead.commercialStatus === "ready";
    const followUpDue = isLeadFollowUpOverdue(lead) || isLeadFollowUpToday(lead);
    const hasFollowUp = hasLeadFollowUp(lead);
    const hasQualifiedOutreach =
        lead.outreachStatus === "qualified" ||
        lead.outreachStatus === "contacted" ||
        lead.commercialStatus === "interested" ||
        lead.commercialStatus === "responded";

    if (isClosed) {
        return {
            leadId: lead.id,
            action: "close",
            confidence: "high",
            reason: "El lead ya figura como cerrado y no requiere una nueva acción operativa.",
            suggestedStatus: "closed",
            suggestedChannel: null,
            suggestedMessagePreview: null,
        };
    }

    if (followUpDue && !isDiscarded) {
        return {
            leadId: lead.id,
            action: "follow_up",
            confidence: "high",
            reason: isLeadFollowUpOverdue(lead)
                ? "Tiene un seguimiento vencido y conviene retomarlo cuanto antes."
                : "Tiene seguimiento para hoy y requiere una acción operativa inmediata.",
            suggestedStatus: "follow-up",
            suggestedChannel: hasPhone ? "whatsapp" : "manual_review",
            suggestedMessagePreview: hasPhone ? buildWhatsAppMessage(lead) : null,
        };
    }

    if ((lead.readyForAutomation || hasQualifiedOutreach || isReady) && !isDiscarded) {
        return {
            leadId: lead.id,
            action: "send_to_sales",
            confidence: lead.readyForAutomation ? "high" : "medium",
            reason: lead.readyForAutomation
                ? "Ya está marcado como listo para automatización y puede avanzar a ventas."
                : "Muestra señales comerciales de avance y conviene escalarlo a ventas.",
            suggestedStatus: "ready",
            suggestedChannel: lead.outreachChannel ?? "manual_review",
            suggestedMessagePreview: null,
        };
    }

    if (
        hasPhone &&
        !hasRealWebsite &&
        lead.score >= 50 &&
        !isDiscarded &&
        !isReady &&
        !hasFollowUp &&
        opportunityLevel === "hot"
    ) {
        return {
            leadId: lead.id,
            action: "contact_now",
            confidence: lead.score >= 80 ? "high" : "medium",
            reason: "Tiene teléfono, no muestra una web propia útil y el score indica prioridad comercial.",
            suggestedStatus: "contacted",
            suggestedChannel: "whatsapp",
            suggestedMessagePreview: buildWhatsAppMessage(lead),
        };
    }

    if ((!hasPhone && hasRealWebsite && lead.score < 50) || (isDiscarded && lead.score < 50)) {
        return {
            leadId: lead.id,
            action: "discard",
            confidence: "high",
            reason: "No tiene un canal de contacto claro y el valor comercial aparente es bajo.",
            suggestedStatus: "discarded",
            suggestedChannel: null,
            suggestedMessagePreview: null,
        };
    }

    return {
        leadId: lead.id,
        action: "review_manually",
        confidence: hasFollowUp || lead.score >= 50 ? "medium" : "low",
        reason: "Necesita revisión humana para definir el siguiente paso con mejor criterio comercial.",
        suggestedStatus: lead.commercialStatus === "new" ? "reviewed" : null,
        suggestedChannel: lead.outreachChannel ?? "manual_review",
        suggestedMessagePreview: null,
    };
}
