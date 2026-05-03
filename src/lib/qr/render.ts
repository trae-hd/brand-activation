import QRCode from "qrcode";

export async function renderBoothQrPng(opts: {
  baseUrl: string;
  activationSlug: string;
  boothCode: string;
}): Promise<Buffer> {
  const url = new URL(`/${opts.activationSlug}`, opts.baseUrl);
  url.searchParams.set("booth", opts.boothCode);
  return QRCode.toBuffer(url.toString(), {
    width: 1024,
    margin: 2,
    errorCorrectionLevel: "Q",
  });
}
