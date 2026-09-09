import type { NormalizedManualLeadInput } from "./manual-lead";
import { classifyWebsiteType } from "../website-type";

export type DuplicateStatus = "NEW" | "POSSIBLE_DUPLICATE" | "DUPLICATE";
export type DuplicateMatch = { reference: string; businessName: string; reason: string };
export type ContactCandidate = NormalizedManualLeadInput & { reference: string };
const normalize = (value: string | null) => (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export function phoneKey(value: string | null) {
  const raw = (value ?? "").trim();
  const international = raw.startsWith("+") || raw.startsWith("00");
  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("00")) digits = digits.slice(2);
  return { digits, international };
}
export function websiteKey(value: string | null) {
  try {
    if (!value) return null;
    const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid", "msclkid"].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    const type = classifyWebsiteType(url.toString());
    return { host, profile: `${host}${path}${url.search}`, shared: type === "social" || type === "aggregator" };
  } catch { return null; }
}
export function contactKeys(candidate: ContactCandidate) {
  return { candidate, phone: phoneKey(candidate.phone), website: websiteKey(candidate.website),
    name: normalize(candidate.businessName), city: normalize(candidate.city), address: normalize(candidate.address),
    exact: JSON.stringify([normalize(candidate.businessName), phoneKey(candidate.phone), websiteKey(candidate.website)?.profile ?? null,
      normalize(candidate.category), normalize(candidate.address), normalize(candidate.city)]) };
}
export function classifyContact(candidate: ReturnType<typeof contactKeys>, existing: ReturnType<typeof contactKeys>[], withinBatch = false) {
  let status: DuplicateStatus = "NEW";
  const matches: DuplicateMatch[] = [];
  for (const other of existing) {
    const samePhone = Boolean(candidate.phone.digits) && candidate.phone.digits === other.phone.digits;
    const contradiction = Boolean(candidate.city && other.city && candidate.city !== other.city) || Boolean(candidate.address && other.address && candidate.address !== other.address);
    const duplicate = (withinBatch && candidate.exact === other.exact) || (samePhone && candidate.phone.international && other.phone.international && candidate.name === other.name && !contradiction);
    const sameWebsite = candidate.website && other.website && (candidate.website.profile === other.website.profile ||
      (!candidate.website.shared && !other.website.shared && candidate.website.host === other.website.host));
    const sameNameCity = candidate.name === other.name && Boolean(candidate.city) && candidate.city === other.city;
    if (!duplicate && !samePhone && !sameWebsite && !sameNameCity) continue;
    if (duplicate) status = "DUPLICATE";
    else if (status === "NEW") status = "POSSIBLE_DUPLICATE";
    // Keep strong matches first so the blocking reason is always visible.
    const match = { reference: other.candidate.reference, businessName: other.candidate.businessName,
      reason: duplicate ? "Mismo contacto" : samePhone ? "Teléfono coincidente" : sameWebsite ? "Web o dominio coincidente" : "Nombre y ciudad coincidentes" };
    if (duplicate) matches.unshift(match); else matches.push(match);
  }
  return { status, matches: matches.slice(0, 5) };
}
