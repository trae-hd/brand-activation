import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { hmac } from "@/lib/crypto/hmac";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const PAGE = 500;

const Body = z.object({
  email: z.string().email().transform((s) => s.toLowerCase()),
  requestRef: z.string().min(1),
});

// POST — email travels in the request body, never in the URL (PII compliance).
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.adminUserId ||
    !session.user.active ||
    session.user.role !== "ADMIN"
  ) {
    return new NextResponse(null, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return new NextResponse(null, { status: 400 });
  }

  const { email, requestRef } = parsed.data;
  const emailHash = hmac.email(email);
  const actorId = session.user.adminUserId;
  const safeRef = requestRef.replace(/[^A-Za-z0-9_\-]/g, "_");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          "id,activationName,activationSlug,status,boothCode,utmSource,utmMedium,utmCampaign,consentVersion,consentAcceptedAt,registeredAt,verifiedAt\n"
        )
      );

      let cursor: string | undefined;
      let rowCount = 0;

      try {
        while (true) {
          const batch = await prisma.registration.findMany({
            where: { email },
            orderBy: { id: "asc" },
            take: PAGE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              status: true,
              boothCode: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
              consentVersion: true,
              consentAcceptedAt: true,
              registeredAt: true,
              verifiedAt: true,
              activation: { select: { name: true, slug: true } },
            },
          });

          if (batch.length === 0) break;

          for (const r of batch) {
            controller.enqueue(
              encoder.encode(
                csvRow([
                  r.id,
                  r.activation.name,
                  r.activation.slug,
                  r.status,
                  r.boothCode ?? "",
                  r.utmSource ?? "",
                  r.utmMedium ?? "",
                  r.utmCampaign ?? "",
                  r.consentVersion,
                  r.consentAcceptedAt.toISOString(),
                  r.registeredAt.toISOString(),
                  r.verifiedAt?.toISOString() ?? "",
                ])
              )
            );
            rowCount++;
          }

          cursor = batch[batch.length - 1]?.id;
          if (batch.length < PAGE) break;
        }

        controller.close();

        await writeAuditLog({
          category: "SECURITY",
          action: "dsar.fulfilled",
          actorId,
          metadata: { emailHash, requestRef, rowCount },
        });
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dsar-${safeRef}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvRow(cols: string[]): string {
  return cols.map(escapeCsv).join(",") + "\n";
}

function escapeCsv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
