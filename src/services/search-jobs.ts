import { prisma } from "@/lib/prisma";
import { scrapeGoogleMapsMultipleLeads } from "@/scraper/google-maps";
import { enrichLeadCommercialData } from "@/lib/lead-commercial";
import { classifySearchPair, searchCandidateKeys, type SearchDuplicateStatus } from "@/lib/search/search-dedup";

export async function runGoogleMapsSearchJob(query: string, maxResults = 3) {
  console.log(`[job] Iniciando búsqueda: ${query}`);

  const searchJob = await prisma.searchJob.create({
    data: {
      query,
      status: "running",
    },
  });

  console.log(`[job] SearchJob creado: ${searchJob.id}`);

  try {
    const scrapedLeads = await scrapeGoogleMapsMultipleLeads(query, maxResults);

    console.log(`[job] Leads scrapeados: ${scrapedLeads.length}`);

    // Scraping and enrichment stay outside the persistence lock.
    const candidates = scrapedLeads.map((lead) => {
      if ((lead.rating != null && !Number.isFinite(lead.rating)) ||
          (lead.reviewsCount != null && (!Number.isInteger(lead.reviewsCount) || lead.reviewsCount < 0))) {
        throw new Error("Invalid Search candidate rating/reviews; no candidates persisted");
      }
      const commercialData = enrichLeadCommercialData({
        query,
        businessName: lead.name,
        category: lead.category,
        website: lead.website,
        phone: lead.phone,
        rating: lead.rating,
        reviewsCount: lead.reviewsCount,
      });

      return {
        searchJobId: searchJob.id,
        businessName: lead.name ?? "Sin nombre",
        category: lead.category,
        address: lead.address,
        city: lead.city,
        phone: lead.phone,
        website: lead.website,
        websiteType: commercialData.websiteType,
        rating: lead.rating,
        reviewsCount: lead.reviewsCount,
        sourceUrl: lead.sourceUrl,
        sourcePlatform: "google_maps",
        origin: "SEARCH" as const,
        score: commercialData.score,
        scoreReasons: commercialData.scoreReasons,
        businessType: commercialData.businessType,
        suggestedOffer: commercialData.suggestedOffer,
        offerReason: commercialData.offerReason,
        readyForAutomation: commercialData.readyForAutomation,
        outreachStatus: commercialData.outreachStatus,
        outreachChannel: commercialData.outreachChannel,
      };
    });
    // Reserved advisory key (LF, SEARCH). Every Search persistence uses this
    // transaction-scoped lock; MANUAL/Bulk writers deliberately do not participate.
    return await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(1279677254, 1397047634)`;
      const keys = candidates.map(searchCandidateKeys);
      const statuses: SearchDuplicateStatus[] = candidates.map(() => "NEW");
      let cursor: string | undefined;
      do {
        const existing = await tx.lead.findMany({
          select: { id: true, origin: true, businessName: true, phone: true, website: true, sourceUrl: true,
            address: true, city: true, sourcePlatform: true },
          orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const lead of existing) {
          const other = searchCandidateKeys(lead);
          for (let i = 0; i < keys.length; i++) {
            const match = classifySearchPair(keys[i], other);
            if (match === "DUPLICATE" || (match === "POSSIBLE_DUPLICATE" && statuses[i] === "NEW")) statuses[i] = match;
          }
        }
        cursor = existing.length === 500 ? existing[existing.length - 1].id : undefined;
      } while (cursor);
      const accepted: typeof candidates = [];
      const acceptedKeys: typeof keys = [];
      let possibleDuplicateCount = 0;
      for (let i = 0; i < candidates.length; i++) {
        for (const other of acceptedKeys) {
          const match = classifySearchPair(keys[i], other);
          if (match === "DUPLICATE" || (match === "POSSIBLE_DUPLICATE" && statuses[i] === "NEW")) statuses[i] = match;
        }
        if (statuses[i] === "DUPLICATE") continue;
        accepted.push(candidates[i]); acceptedKeys.push(keys[i]);
        if (statuses[i] === "POSSIBLE_DUPLICATE") possibleDuplicateCount++;
      }
      // Invalid/non-persistible candidates fail the whole transaction. Never
      // silently drop them or report completed with partial inserts/counters.
      const createdCount = accepted.length ? (await tx.lead.createMany({ data: accepted })).count : 0;
      if (createdCount !== accepted.length) throw new Error("Incomplete Search persistence");
      return tx.searchJob.update({ where: { id: searchJob.id }, data: {
        status: "completed", finishedAt: new Date(), foundCount: candidates.length, createdCount,
        duplicateSkippedCount: candidates.length - createdCount, possibleDuplicateCount,
      }, include: { leads: true } });
    }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 60000 });

  } catch (error) {
    await prisma.searchJob.update({
      where: {
        id: searchJob.id,
      },
      data: {
        status: "failed",
        finishedAt: new Date(),
      },
    });

    throw error;
  }
}
