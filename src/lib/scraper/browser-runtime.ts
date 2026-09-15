import "server-only";
import { chromium, type Browser, type Page } from "playwright";
import { scraperRuntimeConfig } from "@/lib/scraper/runtime-config";

export async function withScraperPage<T>(options: { headless?: boolean }, scrape: (page: Page) => Promise<T>): Promise<T> {
  const config = scraperRuntimeConfig(options);
  let browser: Browser | undefined;
  let page: Page | undefined;
  let expired = false;
  let failed = false;
  let closing: Promise<void> | undefined;
  const closeBrowser = () => {
    if (!browser) return Promise.resolve();
    return closing ??= browser.close();
  };
  const timeoutError = new Error(`Google Maps excedió el presupuesto total de ${config.timeoutMs} ms. Búsqueda cancelada.`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(timeoutError);
      // Actively cancel Playwright operations, not just the awaiting promise.
      void closeBrowser().catch(() => undefined);
    }, config.timeoutMs);
  });
  const work = async () => {
    try {
      browser = await chromium.launch({ headless: config.headless, executablePath: config.executablePath, timeout: config.selectorTimeoutMs });
    } catch (cause) {
      throw new Error("No se pudo iniciar Chromium. Verificá el browser de Playwright y las dependencias del runtime.", { cause });
    }
    // A launch that completes after cancellation must not leak a browser.
    if (expired) { await closeBrowser(); throw timeoutError; }
    page = await browser.newPage();
    if (expired) { await closeBrowser(); throw timeoutError; }
    page.setDefaultTimeout(config.selectorTimeoutMs);
    page.setDefaultNavigationTimeout(config.selectorTimeoutMs);
    return scrape(page);
  };
  try {
    return await Promise.race([work(), deadline]);
  } catch (error) {
    failed = true;
    if (expired) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timer);
    try {
      try {
        if (page && !page.isClosed()) await page.close();
      } finally {
        await closeBrowser();
      }
    } catch (error) {
      // Preserve the original timeout/navigation error if closing an already
      // interrupted page also rejects. Successful work must report cleanup failure.
      if (!failed) throw error;
    }
  }
}
