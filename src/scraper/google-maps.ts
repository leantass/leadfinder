import { chromium, Locator, Page } from "playwright";

export type GoogleMapsScraperOptions = {
  headless?: boolean;
};

export type GoogleMapsLead = {
  name: string | null;
  category: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewsCount: number | null;
  sourceUrl: string | null;
  visibleResultsCount: number;
};

export type GoogleMapsVisibleResult = {
  index: number;
  name: string | null;
  sourceUrl: string | null;
};

async function openGoogleMapsAndSearch(page: Page, query: string) {
  await page.goto("https://www.google.com/maps", {
    waitUntil: "domcontentloaded",
  });

  await page.waitForTimeout(5000);

  await page.fill('input[name="q"]', query);
  await page.keyboard.press("Enter");

  await page.waitForSelector('div[role="article"] a.hfpxzc', {
    timeout: 20000,
  });
}

async function getVisibleResultsCount(page: Page): Promise<number> {
  const resultLinks = page.locator('div[role="article"] a.hfpxzc');
  return resultLinks.count();
}

async function getVisibleResultsList(
  page: Page
): Promise<GoogleMapsVisibleResult[]> {
  const cards = page.locator('div[role="article"]');

  const count = await cards.count();
  const results: GoogleMapsVisibleResult[] = [];

  for (let i = 0; i < count; i++) {
    const card = cards.nth(i);

    const nameLocator = card.locator(".qBF1Pd.fontHeadlineSmall").first();
    const linkLocator = card.locator("a.hfpxzc").first();

    const nameCount = await nameLocator.count();
    const linkCount = await linkLocator.count();

    const name =
      nameCount > 0 ? ((await nameLocator.textContent())?.trim() ?? null) : null;

    const sourceUrl =
      linkCount > 0 ? await linkLocator.getAttribute("href") : null;

    results.push({
      index: i,
      name,
      sourceUrl,
    });
  }

  return results;
}

async function openResultDetail(page: Page, resultIndex: number) {
  const resultLinks = page.locator('div[role="article"] a.hfpxzc');
  const resultLink = resultLinks.nth(resultIndex);

  await resultLink.click();

  await page.waitForSelector("h1", {
    timeout: 20000,
  });

  await page.waitForTimeout(2000);
}

async function openResultDetailByUrl(page: Page, sourceUrl: string) {
  await page.goto(sourceUrl, {
    waitUntil: "domcontentloaded",
  });

  await page.waitForSelector("h1", {
    timeout: 20000,
  });

  await page.waitForTimeout(2000);
}

async function getFirstText(locator: Locator): Promise<string | null> {
  if ((await locator.count()) === 0) {
    return null;
  }

  const text = await locator.first().textContent();
  return text?.trim() || null;
}

async function getFirstAttribute(
  locator: Locator,
  attribute: string
): Promise<string | null> {
  if ((await locator.count()) === 0) {
    return null;
  }

  const value = await locator.first().getAttribute(attribute);
  return value?.trim() || null;
}

function cleanLabeledValue(
  value: string | null,
  labels: string[]
): string | null {
  if (!value) {
    return null;
  }

  let normalized = value.trim();

  for (const label of labels) {
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${safeLabel}\\s*:?\\s*`, "i");
  normalized = normalized.replace(pattern, "").trim();
}

  return normalized || null;
}

function parseRatingValue(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const match =
    raw.match(/(\d+[.,]\d+|\d+)(?=\s*(estrellas|stars|\())/i) ??
    raw.match(/^(\d+[.,]\d+|\d+)/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseReviewsCountValue(raw: string | null): number | null {
  if (!raw) {
    return null;
  }

  const match =
    raw.match(/\(?\s*([\d.,]+)\s*(reseñas|reseña|reviews|review)/i) ??
    raw.match(/\(([\d.,]+)\)/);

  if (!match) {
    return null;
  }

  const digitsOnly = match[1].replace(/[^\d]/g, "");
  const parsed = Number.parseInt(digitsOnly, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function inferCityFromAddress(address: string | null): string | null {
  if (!address) {
    return null;
  }

  const parts = address
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const locality = parts[1]
    ?.replace(/\b[cC]\d+\b/g, "")
    .replace(/\b\d{4,}\b/g, "")
    .trim();

  return locality || null;
}

async function extractCategory(page: Page): Promise<string | null> {
  const categoryFromButton = await getFirstText(
    page.locator('button[jsaction*="pane.rating.category"]')
  );

  if (categoryFromButton) {
    return categoryFromButton;
  }

  const categoryFromMeta = await getFirstText(
    page.locator('button[aria-label*="Categoría"], button[aria-label*="Category"]')
  );

  return categoryFromMeta;
}

async function extractAddress(page: Page): Promise<string | null> {
  const addressButton = page.locator('button[data-item-id^="address:"]').first();

  const ariaAddress = cleanLabeledValue(
    await getFirstAttribute(addressButton, "aria-label"),
    ["Dirección", "Address"]
  );

  if (ariaAddress) {
    return ariaAddress;
  }

  return cleanLabeledValue(await getFirstText(addressButton), [
    "Dirección",
    "Address",
  ]);
}

async function extractRatingAndReviews(page: Page): Promise<{
  rating: number | null;
  reviewsCount: number | null;
}> {
  const candidates = [
    await getFirstAttribute(
      page.locator('button[aria-label*="reseñas"], button[aria-label*="reviews"]'),
      "aria-label"
    ),
    await getFirstText(page.locator("div.F7nice").first()),
    await getFirstText(
      page.locator('span[role="img"][aria-label*="estrellas"], span[role="img"][aria-label*="stars"]')
    ),
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    const rating = parseRatingValue(candidate);
    const reviewsCount = parseReviewsCountValue(candidate);

    if (rating !== null || reviewsCount !== null) {
      return {
        rating,
        reviewsCount,
      };
    }
  }

  return {
    rating: null,
    reviewsCount: null,
  };
}

async function extractLeadDetail(
  page: Page,
  visibleResultsCount: number
): Promise<GoogleMapsLead> {
  const sourceUrl = page.url();

  const name = await page.locator("h1").evaluateAll((elements) =>
    elements
      .map((el) => el.textContent?.trim() || "")
      .find(
        (text) =>
          text &&
          text !== "Resultados" &&
          !text.toLowerCase().includes("patrocinado")
      ) || null
  );

  const phoneButton = page.locator('button[data-item-id^="phone:"]').first();
  const phoneButtonCount = await phoneButton.count();

  let phone: string | null = null;

  if (phoneButtonCount > 0) {
    const phoneAriaLabel = await phoneButton.getAttribute("aria-label");
    phone = cleanLabeledValue(phoneAriaLabel, ["Teléfono", "Phone"]);
  }

  const websiteLink = page.locator('a[data-item-id="authority"]').first();
  const websiteLinkCount = await websiteLink.count();

  let website: string | null = null;

  if (websiteLinkCount > 0) {
    website = await websiteLink.getAttribute("href");
  }

  const category = await extractCategory(page);
  const address = await extractAddress(page);
  const city = inferCityFromAddress(address);
  const { rating, reviewsCount } = await extractRatingAndReviews(page);

  return {
    name,
    category,
    address,
    city,
    phone,
    website,
    rating,
    reviewsCount,
    sourceUrl,
    visibleResultsCount,
  };
}

export async function scrapeSingleGoogleMapsLead(
  query: string,
  resultIndex = 1,
  options: GoogleMapsScraperOptions = {}
): Promise<GoogleMapsLead> {
  const totalStart = Date.now();

  const browser = await chromium.launch({
    headless: options.headless ?? false,
  });

  try {
    const page = await browser.newPage();

    const searchStart = Date.now();
    await openGoogleMapsAndSearch(page, query);
    console.log(
      `[timing] openGoogleMapsAndSearch: ${Date.now() - searchStart}ms`
    );

    const countStart = Date.now();
    const visibleResultsCount = await getVisibleResultsCount(page);
    console.log(
      `[timing] getVisibleResultsCount: ${Date.now() - countStart}ms`
    );

    if (visibleResultsCount === 0) {
      throw new Error(`No se encontraron resultados visibles para la búsqueda: ${query}`);
    }

    if (resultIndex < 0 || resultIndex >= visibleResultsCount) {
      throw new Error(
        `resultIndex fuera de rango. Valor recibido: ${resultIndex}. Resultados visibles: ${visibleResultsCount}`
      );
    }

    const detailStart = Date.now();
    await openResultDetail(page, resultIndex);
    console.log(`[timing] openResultDetail: ${Date.now() - detailStart}ms`);

    const extractStart = Date.now();
    const lead = await extractLeadDetail(page, visibleResultsCount);
    console.log(`[timing] extractLeadDetail: ${Date.now() - extractStart}ms`);

    return lead;
  } finally {
    const closeStart = Date.now();
    await browser.close();
    console.log(`[timing] browser.close: ${Date.now() - closeStart}ms`);
    console.log(`[timing] total: ${Date.now() - totalStart}ms`);
  }
}

export async function scrapeGoogleMapsVisibleResults(
  query: string,
  options: GoogleMapsScraperOptions = {}
): Promise<GoogleMapsVisibleResult[]> {
  const totalStart = Date.now();

  const browser = await chromium.launch({
    headless: options.headless ?? false,
  });

  try {
    const page = await browser.newPage();

    const searchStart = Date.now();
    await openGoogleMapsAndSearch(page, query);
    console.log(
      `[timing] openGoogleMapsAndSearch: ${Date.now() - searchStart}ms`
    );

    const listStart = Date.now();
    const results = await getVisibleResultsList(page);
    console.log(`[timing] getVisibleResultsList: ${Date.now() - listStart}ms`);

    return results;
  } finally {
    const closeStart = Date.now();
    await browser.close();
    console.log(`[timing] browser.close: ${Date.now() - closeStart}ms`);
    console.log(`[timing] total: ${Date.now() - totalStart}ms`);
  }
}

export async function scrapeGoogleMapsMultipleLeads(
  query: string,
  maxResults = 3,
  options: GoogleMapsScraperOptions = {}
): Promise<GoogleMapsLead[]> {
  const totalStart = Date.now();

  const browser = await chromium.launch({
    headless: options.headless ?? false,
  });

  try {
    const page = await browser.newPage();

    const searchStart = Date.now();
    await openGoogleMapsAndSearch(page, query);
    console.log(
      `[timing] openGoogleMapsAndSearch: ${Date.now() - searchStart}ms`
    );

    const countStart = Date.now();
    const visibleResultsCount = await getVisibleResultsCount(page);
    console.log(
      `[timing] getVisibleResultsCount: ${Date.now() - countStart}ms`
    );

    if (visibleResultsCount === 0) {
      console.log("[scrape] No se encontraron resultados visibles.");
      return [];
    }

    const listStart = Date.now();
    const visibleResults = await getVisibleResultsList(page);
    console.log(`[timing] getVisibleResultsList: ${Date.now() - listStart}ms`);

    const selectedResults = visibleResults
      .filter((result) => result.sourceUrl)
      .slice(0, maxResults);

    if (selectedResults.length === 0) {
      console.log("[scrape] No hubo resultados visibles con sourceUrl utilizable.");
      return [];
    }

    const leads: GoogleMapsLead[] = [];

    for (const result of selectedResults) {
      console.log(
        `[scrape] Procesando índice ${result.index}: ${result.name ?? "sin nombre"}`
      );

      const detailStart = Date.now();
      await openResultDetailByUrl(page, result.sourceUrl!);
      console.log(
        `[timing] openResultDetailByUrl(${result.index}): ${Date.now() - detailStart}ms`
      );

      const extractStart = Date.now();
      const lead = await extractLeadDetail(page, visibleResultsCount);
      console.log(
        `[timing] extractLeadDetail(${result.index}): ${Date.now() - extractStart}ms`
      );

      leads.push(lead);
    }

    return leads;
  } finally {
    const closeStart = Date.now();
    await browser.close();
    console.log(`[timing] browser.close: ${Date.now() - closeStart}ms`);
    console.log(`[timing] total: ${Date.now() - totalStart}ms`);
  }
}
