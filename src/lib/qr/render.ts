import QRCode from "qrcode";
import { getActivationUrl } from "@/lib/url/activationUrl";

export async function renderQrPng(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "Q",
  });
}

export async function renderBoothQrPng(opts: {
  activationSlug: string;
  boothCode: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
}): Promise<Buffer> {
  return renderQrPng(
    getActivationUrl(opts.activationSlug, {
      boothCode: opts.boothCode,
      utmSource: opts.utmSource,
      utmMedium: opts.utmMedium,
      utmCampaign: opts.utmCampaign,
    }),
  );
}
