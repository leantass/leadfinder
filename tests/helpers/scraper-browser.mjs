export function fakeScraperBrowser({ blockDetail = 0, blockSearch = false, missingBrowser = false, results = 20 } = {}) {
  const state = { launches: [], pageClosed: false, browserClosed: false, detail: 0, extracted: 0 };
  const blocked = () => new Promise(() => {});
  function locator(selector, index = 0) {
    return {
      first() { return this; }, nth(i) { return locator(selector, i); }, filter() { return this; },
      locator(child) { return locator(child, index); },
      async waitFor() { if (blockSearch && selector.includes('hfpxzc')) await blocked(); },
      async count() { return selector.includes('role="article"') ? results : selector === 'a.hfpxzc' || selector.includes('qBF1Pd') ? 1 : 0; },
      async textContent() { return `Cafe ${index}`; },
      async getAttribute() { return `https://www.google.com/maps/place/Cafe${index}`; },
      async evaluateAll() { state.extracted++; return `Cafe ${state.detail}`; },
      async click() { state.detail++; },
    };
  }
  const page = {
    locator, keyboard: { async press() {} }, async fill() {},
    async goto(url) { if (url.includes('/place/')) { state.detail++; if (state.detail === blockDetail) await blocked(); } },
    url: () => `https://www.google.com/maps/place/Cafe${state.detail}`,
    setDefaultTimeout(value) { state.selectorTimeout = value; }, setDefaultNavigationTimeout(value) { state.navigationTimeout = value; },
    isClosed: () => state.pageClosed, async close() { state.pageClosed = true; },
  };
  const browser = { async newPage() { return page; }, async close() { state.browserClosed = true; state.pageClosed = true; } };
  return { state, browser, playwright: { chromium: { async launch(options) { state.launches.push(options); if (missingBrowser) throw Error('Executable unavailable'); return browser; } } } };
}
