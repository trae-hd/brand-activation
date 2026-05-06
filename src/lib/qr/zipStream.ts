import archiver from "archiver";
import { prisma } from "@/lib/db/prisma";
import { renderQrPng } from "@/lib/qr/render";
import { getActivationUrl } from "@/lib/url/activationUrl";

interface UtmOpts {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

export async function streamBoothQrZip(activationId: string, utm: UtmOpts = {}): Promise<{
  stream: ReadableStream;
  filename: string;
} | null> {
  const activation = await prisma.activation.findUnique({
    where: { id: activationId },
    select: {
      slug: true,
      booths: { select: { code: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!activation) return null;

  const archive = archiver("zip", { zlib: { level: 9 } });

  const stream = new ReadableStream({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(chunk));
      archive.on("end", () => controller.close());
      archive.on("error", (err: Error) => controller.error(err));

      (async () => {
        try {
          const utmSuffix = [utm.utmSource, utm.utmMedium, utm.utmCampaign]
            .filter(Boolean)
            .join("__");
          for (const booth of activation.booths) {
            const url = getActivationUrl(activation.slug, {
              boothCode: booth.code,
              utmSource: utm.utmSource,
              utmMedium: utm.utmMedium,
              utmCampaign: utm.utmCampaign,
            });
            const png = await renderQrPng(url);
            const name = utmSuffix
              ? `${activation.slug}-${booth.code}__${utmSuffix}.png`
              : `${activation.slug}-${booth.code}.png`;
            archive.append(png, { name });
          }
          await archive.finalize();
        } catch (err) {
          controller.error(err);
        }
      })();
    },
  });

  const utmSuffix = [utm.utmSource, utm.utmMedium, utm.utmCampaign].filter(Boolean).join("__");
  const filename = utmSuffix
    ? `${activation.slug}__${utmSuffix}-qrs.zip`
    : `${activation.slug}-qrs.zip`;
  return { stream, filename };
}
