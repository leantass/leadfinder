import type { WebsiteType } from "./website-type.ts";

export type LeadScoreResult = {
  score: number;
  reasons: string[];
};

export function calculateLeadScore(lead: {
  phone?: string | null;
  website?: string | null;
  websiteType?: WebsiteType | null;
  rating?: number | null;
  reviewsCount?: number | null;
}): LeadScoreResult {
  let score = 0;
  const reasons: string[] = [];

  const hasPhone = !!lead.phone && lead.phone.trim() !== "";
  const hasWebsite = !!lead.website && lead.website.trim() !== "";
  const hasRealWebsite = lead.websiteType === "real";

  if (hasPhone) {
    score += 40;
    reasons.push("Tiene teléfono");
  } else {
    reasons.push("Sin teléfono");
  }

  if (!hasWebsite || !hasRealWebsite) {
    score += 40;

    if (lead.websiteType === "aggregator") {
      reasons.push("Tiene agregador, pero no web propia");
    } else if (lead.websiteType === "social") {
      reasons.push("Tiene red social, pero no web propia");
    } else {
      reasons.push("No tiene web (oportunidad directa)");
    }
  } else {
    reasons.push("Tiene web propia");
  }

  if (lead.rating && lead.rating >= 4) {
    score += 10;
    reasons.push("Buen rating");
  }

  if (lead.reviewsCount && lead.reviewsCount > 50) {
    score += 10;
    reasons.push("Muchas reseñas");
  }

  return {
    score,
    reasons,
  };
}
