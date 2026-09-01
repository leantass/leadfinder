import { prisma } from "@/lib/prisma";
import { scrapeGoogleMapsMultipleLeads } from "@/scraper/google-maps";
import { enrichLeadCommercialData } from "@/lib/lead-commercial";

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

    if (scrapedLeads.length > 0) {
      await prisma.lead.createMany({
        data: scrapedLeads.map((lead) => {
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
            origin: "SEARCH",
            score: commercialData.score,
            scoreReasons: commercialData.scoreReasons,
            businessType: commercialData.businessType,
            suggestedOffer: commercialData.suggestedOffer,
            offerReason: commercialData.offerReason,
            readyForAutomation: commercialData.readyForAutomation,
            outreachStatus: commercialData.outreachStatus,
            outreachChannel: commercialData.outreachChannel,
          };
        }),
      });
    }

    await prisma.searchJob.update({
      where: {
        id: searchJob.id,
      },
      data: {
        status: "completed",
        finishedAt: new Date(),
      },
    });

    const savedJob = await prisma.searchJob.findUnique({
      where: {
        id: searchJob.id,
      },
      include: {
        leads: true,
      },
    });

    return savedJob;
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
