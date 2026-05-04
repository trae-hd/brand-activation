import archiver from "archiver";
import { prisma } from "@/lib/db/prisma";
import { renderQrPng } from "@/lib/qr/render";
import { getActivationUrl } from "@/lib/url/activationUrl";

export async function streamBoothQrZip(activationId: string): Promise<{
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
          for (const booth of activation.booths) {
            const url = getActivationUrl(activation.slug, { boothCode: booth.code });
            const png = await renderQrPng(url);
            archive.append(png, { name: `${activation.slug}-${booth.code}.png` });
          }
          await archive.finalize();
        } catch (err) {
          controller.error(err);
        }
      })();
    },
  });

  return { stream, filename: `${activation.slug}-qrs.zip` };
}
