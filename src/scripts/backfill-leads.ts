import { prisma } from "../lib/prisma";
import { enrichLeadCommercialData } from "../lib/lead-commercial";

const BATCH_SIZE = 100;

async function run() {
  console.log("[backfill] Iniciando backfill de leads...");

  let processed = 0;

  while (true) {
    const leads = await prisma.lead.findMany({
      orderBy: {
        scrapedAt: "asc",
      },
      skip: processed,
      take: BATCH_SIZE,
      select: {
        id: true,
        businessName: true,
        category: true,
        website: true,
        phone: true,
        rating: true,
        reviewsCount: true,
        searchJob: {
          select: {
            query: true,
          },
        },
      },
    });

    if (leads.length === 0) {
      break;
    }

    for (const lead of leads) {
      const commercialData = enrichLeadCommercialData({
        query: lead.searchJob.query,
        businessName: lead.businessName,
        category: lead.category,
        website: lead.website,
        phone: lead.phone,
        rating: lead.rating,
        reviewsCount: lead.reviewsCount,
      });

      await prisma.lead.update({
        where: {
          id: lead.id,
        },
        data: {
          websiteType: commercialData.websiteType,
          score: commercialData.score,
          scoreReasons: commercialData.scoreReasons,
          businessType: commercialData.businessType,
          suggestedOffer: commercialData.suggestedOffer,
          offerReason: commercialData.offerReason,
          readyForAutomation: commercialData.readyForAutomation,
          outreachStatus: commercialData.outreachStatus,
          outreachChannel: commercialData.outreachChannel,
        } as never,
      });
    }

    processed += leads.length;
    console.log(`[backfill] Leads procesados: ${processed}`);
  }

  console.log("[backfill] Backfill completado.");
}

run()
  .catch((error) => {
    console.error("[backfill] Error:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
