const MODE: "single" | "multiple" = "single";
const QUERY = "pizzerias en lanus";
const RESULT_INDEX = 0;
const MAX_RESULTS = 3;
const HEADLESS = false;

function printHeader(title: string) {
  console.log(`\n=== ${title} ===`);
}

async function run() {
  const scraperModuleUrl = new URL("./google-maps.ts", import.meta.url).href;
  const { scrapeGoogleMapsMultipleLeads, scrapeSingleGoogleMapsLead } =
    await import(scraperModuleUrl);

  printHeader("Google Maps Scraper Test");
  console.log(
    JSON.stringify(
      {
        mode: MODE,
        query: QUERY,
        resultIndex: RESULT_INDEX,
        maxResults: MAX_RESULTS,
        headless: HEADLESS,
      },
      null,
      2
    )
  );

  try {
    if (MODE === "single") {
      const lead = await scrapeSingleGoogleMapsLead(QUERY, RESULT_INDEX, {
        headless: HEADLESS,
      });

      printHeader("Single Lead Result");
      console.log(JSON.stringify(lead, null, 2));
      return;
    }

    const leads = await scrapeGoogleMapsMultipleLeads(QUERY, MAX_RESULTS, {
      headless: HEADLESS,
    });

    printHeader(`Multiple Leads Result (${leads.length})`);
    console.log(JSON.stringify(leads, null, 2));
  } catch (error) {
    printHeader("Scraper Error");
    console.error(error);
    process.exitCode = 1;
  }
}

run();
