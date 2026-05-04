import { env } from "@/lib/env";

export interface ActivationUrlOptions {
  boothCode?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}

export function getActivationUrl(
  activationSlug: string,
  options: ActivationUrlOptions = {},
): string {
  const url = new URL(`/${activationSlug}`, env.PUBLIC_BASE_URL);
  if (options.boothCode) url.searchParams.set("booth", options.boothCode);
  if (options.utmSource) url.searchParams.set("utm_source", options.utmSource);
  if (options.utmMedium) url.searchParams.set("utm_medium", options.utmMedium);
  if (options.utmCampaign) url.searchParams.set("utm_campaign", options.utmCampaign);
  return url.toString();
}
