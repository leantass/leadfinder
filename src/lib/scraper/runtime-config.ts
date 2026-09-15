import "server-only";
import { isAbsolute } from "node:path";

export const MAX_SEARCH_RESULTS = 20;

export function validateSearchMaxResults(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > MAX_SEARCH_RESULTS) {
    throw new Error(`La cantidad de resultados debe ser un entero entre 1 y ${MAX_SEARCH_RESULTS}.`);
  }
}

export function scraperRuntimeConfig(options: { headless?: boolean } = {}) {
  const rawTimeout = process.env.LEADFINDER_SCRAPER_TIMEOUT_MS;
  const timeoutMs = rawTimeout === undefined ? 90000 : Number(rawTimeout);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 90000) {
    throw new Error("LEADFINDER_SCRAPER_TIMEOUT_MS debe estar entre 1000 y 90000 ms.");
  }
  const executablePath = process.env.LEADFINDER_CHROMIUM_EXECUTABLE_PATH?.trim() || undefined;
  // Playwright checks availability at launch; dynamic filesystem reads here
  // would make the bundler trace unrelated project files into the deployment.
  if (executablePath && !isAbsolute(executablePath)) {
    throw new Error("LEADFINDER_CHROMIUM_EXECUTABLE_PATH debe ser una ruta absoluta.");
  }
  return {
    headless: process.env.NODE_ENV === "production" ? true : options.headless ?? false,
    executablePath, timeoutMs, selectorTimeoutMs: Math.min(20000, timeoutMs),
  };
}
