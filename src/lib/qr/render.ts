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
}): Promise<Buffer> {
  return renderQrPng(getActivationUrl(opts.activationSlug, { boothCode: opts.boothCode }));
}
