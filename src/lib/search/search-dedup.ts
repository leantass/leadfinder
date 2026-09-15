export type SearchCandidate = {
  businessName: string;
  phone: string | null;
  website: string | null;
  sourceUrl: string | null;
  sourcePlatform: string | null;
  address: string | null;
  city: string | null;
};
export type SearchDuplicateStatus = "NEW" | "POSSIBLE_DUPLICATE" | "DUPLICATE";
const textKey = (value: string | null) => (value ?? "").normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

export function mapsIdentity(value: string | null, platform: string | null) {
  const none = { tokens: [] as string[], url: null as string | null };
  if (!value || platform !== "google_maps") return none;
  try {
    const url = new URL(value);
    // Only the observed Google Maps host and concrete place routes are trusted.
    if (url.protocol !== "https:" || !["www.google.com", "maps.google.com", "google.com"].includes(url.hostname) ||
        url.username || url.password || !url.pathname.startsWith("/maps/place/")) return none;
    const decoded = decodeURIComponent(url.pathname);
    const place = [...decoded.matchAll(/!19s(ChIJ[A-Za-z0-9_-]{10,})(?=!|\/|$)/g)].map(m => `google_maps:place:${m[1]}`);
    const feature = [...decoded.matchAll(/!1s(0x[\da-f]+:0x[\da-f]+)(?=!|\/|$)/gi)].map(m => `google_maps:feature:${m[1].toLowerCase()}`);
    const tokens = [...new Set([...place, ...feature])];
    // Multiple IDs of one kind may describe a route or ambiguous page, not one place.
    if (new Set(place).size > 1 || new Set(feature).size > 1) return none;
    // A name-only /place/ URL is NOT an identity. The observed !16s entity token
    // permits exact-URL fallback without interpreting that undocumented token.
    const concrete = tokens.length > 0 || /!16s\/g\/[A-Za-z0-9_-]+(?=!|\/|$)/.test(decoded);
    if (!concrete) return none;
    for (const key of ["hl", "authuser", "g_ep", "rclk"]) url.searchParams.delete(key);
    url.searchParams.sort();
    return { tokens, url: `google_maps:url:${url.toString()}` };
  } catch { return none; }
}

function phoneKey(value: string | null) {
  const raw = (value ?? "").trim();
  if (!/^(?:\+|00)?[\d\s().-]+$/.test(raw)) return { digits: "", international: false };
  const digits = raw.replace(/\D/g, "").replace(raw.startsWith("00") ? /^00/ : /^$/, "");
  return { digits: digits.length >= 6 && digits.length <= 15 ? digits : "", international: raw.startsWith("+") || raw.startsWith("00") };
}
function websiteKey(value: string | null) {
  try {
    if (!value) return null;
    const url = new URL(value.includes("://") ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    for (const key of [...url.searchParams.keys()]) if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
  } catch { return null; }
}
export function searchCandidateKeys(candidate: SearchCandidate) {
  const name = textKey(candidate.businessName);
  return { maps: mapsIdentity(candidate.sourceUrl, candidate.sourcePlatform), name: name === "sin nombre" ? "" : name,
    phone: phoneKey(candidate.phone), website: websiteKey(candidate.website), address: textKey(candidate.address), city: textKey(candidate.city) };
}
export function classifySearchPair(a: ReturnType<typeof searchCandidateKeys>, b: ReturnType<typeof searchCandidateKeys>): SearchDuplicateStatus {
  const sharedMaps = a.maps.tokens.some(token => b.maps.tokens.includes(token));
  if (sharedMaps || (a.maps.url && a.maps.url === b.maps.url)) return "DUPLICATE";
  const differentMaps = ["google_maps:place:", "google_maps:feature:"].some(prefix =>
    a.maps.tokens.some(t => t.startsWith(prefix)) && b.maps.tokens.some(t => t.startsWith(prefix)));
  const sameName = Boolean(a.name) && a.name === b.name;
  const samePhone = Boolean(a.phone.digits) && a.phone.digits === b.phone.digits;
  const contradiction = Boolean(a.address && b.address && a.address !== b.address) || Boolean(a.city && b.city && a.city !== b.city);
  if (samePhone && a.phone.international && b.phone.international && sameName && !contradiction && !differentMaps) return "DUPLICATE";
  // Suffix overlap is only a warning: never infer country/area codes for identity.
  const ambiguousPhone = Boolean(a.phone.digits && b.phone.digits) && a.phone.international !== b.phone.international &&
    (a.phone.digits.endsWith(b.phone.digits.replace(/^0+/, "")) || b.phone.digits.endsWith(a.phone.digits.replace(/^0+/, "")));
  if (samePhone || ambiguousPhone || (a.website && a.website === b.website) ||
      (sameName && ((a.address && a.address === b.address) || (a.city && a.city === b.city)))) return "POSSIBLE_DUPLICATE";
  return "NEW";
}
