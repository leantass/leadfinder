import type { LeadOrigin } from "@prisma/client";
import type { CommercialStatus } from "@/lib/leads/lead-ui";

export type LeadNoteItem = {
    id: string;
    content: string;
    createdAt: Date | string;
};

export type LeadActivityItem = {
    id: string;
    leadId: string;
    type: string;
    label: string;
    createdAt: Date | string;
    metadata?: string | null;
};

export type LeadFollowUpItem = {
    nextAction: string;
    dueAt: Date | string | null;
};

export type LeadAutoAction =
    | "contact_now"
    | "follow_up"
    | "review_manually"
    | "discard"
    | "close"
    | "send_to_sales";

export type AutomationConfidence = "high" | "medium" | "low";

export type LeadAutomationDecision = {
    leadId: string;
    action: LeadAutoAction;
    confidence: AutomationConfidence;
    reason: string;
    suggestedStatus: string | null;
    suggestedChannel: string | null;
    suggestedMessagePreview?: string | null;
};

export type AutomationRunItemLead = {
    id: string;
    businessName: string;
    phone: string | null;
    website: string | null;
    score: number;
    businessType: string | null;
    suggestedOffer: string | null;
    offerReason: string | null;
};

export type AutomationRunItemStatus = "pending" | "applied" | "failed";
export type AutomationRunStatus =
    | "pending"
    | "in_progress"
    | "completed"
    | "completed_with_failures";

export type AutomationRunSource = "manual" | "schedule";

export type AutomationRunItem = LeadAutomationDecision & {
    id: string;
    runId: string;
    status: AutomationRunItemStatus;
    createdAt: Date | string;
    appliedAt?: Date | string | null;
    failureReason?: string | null;
    lead?: AutomationRunItemLead | null;
};

export type AutomationAutoApplyPolicy = {
    enabled: boolean;
    minConfidence: AutomationConfidence;
    allowedActions: LeadAutoAction[];
};

export type AutomationRunSummary = {
    id: string;
    source: AutomationRunSource;
    scheduleId?: string | null;
    scheduleName?: string | null;
    query: string;
    filter: string;
    sort: string;
    page: number;
    pageSize: number;
    status: AutomationRunStatus;
    analyzedCount: number;
    decisionCount: number;
    appliedCount: number;
    failedCount: number;
    pendingCount: number;
    createdAt: Date | string;
    updatedAt: Date | string;
};

export type AutomationRun = AutomationRunSummary & {
    items: AutomationRunItem[];
};

export type AutomationSchedule = {
    id: string;
    name: string;
    isEnabled: boolean;
    runEveryMinutes: number;
    query: string;
    filter: string;
    sort: string;
    page: number;
    pageSize: number;
    autoApplySafe: boolean;
    autoApplyMinConfidence: AutomationConfidence;
    autoApplyActions: LeadAutoAction[];
    respectQuietHours: boolean;
    runWindowStart: string;
    runWindowEnd: string;
    timezone: string;
    maxItemsPerRun: number;
    lastRunAt?: Date | string | null;
    createdAt: Date | string;
    updatedAt: Date | string;
};

export type AutomationSchedulerExecutionStatus =
    | "running"
    | "completed"
    | "completed_with_errors"
    | "failed";

export type AutomationSchedulerExecution = {
    id: string;
    status: AutomationSchedulerExecutionStatus;
    schedulesChecked: number;
    schedulesRun: number;
    runsCreated: number;
    skippedLocked: number;
    skippedDuplicate: number;
    skippedQuietHours: number;
    limitedRuns: number;
    safeActionsApplied: number;
    errorSummary?: string | null;
    createdAt: Date | string;
    startedAt: Date | string;
    finishedAt?: Date | string | null;
};

export type LeadItem = {
    id: string;
    origin: LeadOrigin;
    businessName: string;
    phone: string | null;
    website: string | null;
    websiteType?: string | null;
    commercialStatus: CommercialStatus | string;
    businessType: string | null;
    suggestedOffer: string | null;
    offerReason: string | null;
    readyForAutomation: boolean;
    outreachStatus: string;
    outreachChannel: string | null;
    scrapedAt: Date | string;
    score: number;
    scoreReasons: string[];
    notes: LeadNoteItem[];
    followUp?: LeadFollowUpItem;
    activity?: LeadActivityItem[];
};
