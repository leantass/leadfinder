import { getWebsiteTypeBadge, getWebsiteTypeLabel } from "@/lib/leads/lead-ui";

export function WebsiteTypeSignalBadge({
    websiteType,
}: {
    websiteType: string | null | undefined;
}) {
    return (
        <span
            className={`inline-flex max-w-full break-words rounded-full px-2 py-0.5 text-[11px] leading-4 ${getWebsiteTypeBadge(
                websiteType
            )}`}
        >
            {getWebsiteTypeLabel(websiteType)}
        </span>
    );
}
