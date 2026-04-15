export type WebsiteType = "real" | "aggregator" | "social" | "unknown";

const AGGREGATOR_HOSTS = [
  "linktr.ee",
  "bio.link",
  "beacons.ai",
  "solo.to",
  "taplink.cc",
  "campsite.bio",
  "flow.page",
  "msha.ke",
];

const SOCIAL_HOSTS = [
  "instagram.com",
  "facebook.com",
  "fb.com",
  "tiktok.com",
  "x.com",
  "twitter.com",
  "linkedin.com",
  "youtube.com",
];

function normalizeHostname(value: string) {
  return value.replace(/^www\./, "").toLowerCase();
}

function matchesKnownHost(hostname: string, knownHosts: string[]) {
  return knownHosts.some(
    (knownHost) =>
      hostname === knownHost || hostname.endsWith(`.${knownHost}`)
  );
}

export function classifyWebsiteType(website: string | null | undefined): WebsiteType {
  if (!website || website.trim() === "") {
    return "unknown";
  }

  try {
    const hostname = normalizeHostname(new URL(website).hostname);

    if (!hostname) {
      return "unknown";
    }

    if (matchesKnownHost(hostname, AGGREGATOR_HOSTS)) {
      return "aggregator";
    }

    if (matchesKnownHost(hostname, SOCIAL_HOSTS)) {
      return "social";
    }

    return "real";
  } catch {
    return "unknown";
  }
}
