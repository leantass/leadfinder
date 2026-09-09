import "server-only";
import type { Prisma } from "@prisma/client";
import { enrichLeadCommercialData } from "@/lib/lead-commercial";
import type { NormalizedManualLeadInput } from "./manual-lead";

export async function persistManualLead(tx: Prisma.TransactionClient, normalized: NormalizedManualLeadInput, metadata: Record<string, unknown> = {}) {
  const commercial = enrichLeadCommercialData({ query: "", ...normalized, rating: null, reviewsCount: null });
  const lead = await tx.lead.create({
    data: { ...normalized, searchJobId: null, sourceUrl: null, sourcePlatform: null, origin: "MANUAL",
      rating: null, reviewsCount: null, commercialStatus: "new", outreachStatus: "pending_review",
      websiteType: commercial.websiteType, score: commercial.score, scoreReasons: commercial.scoreReasons,
      businessType: commercial.businessType, suggestedOffer: commercial.suggestedOffer, offerReason: commercial.offerReason,
      outreachChannel: commercial.outreachChannel, readyForAutomation: commercial.readyForAutomation },
    select: { id: true, businessName: true, phone: true, website: true, searchJobId: true, origin: true,
      sourcePlatform: true, sourceUrl: true, commercialStatus: true, outreachStatus: true },
  });
  const activity = await tx.leadActivity.create({ data: {
    leadId: lead.id, type: "manual_created", label: "Lead manual creado",
    metadata: JSON.stringify({ ...metadata, origin: "MANUAL" }),
  } });
  return { lead, activity };
}
