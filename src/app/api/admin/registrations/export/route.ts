import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const PAGE = 500;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.adminUserId || !session.user.active) {
    return new NextResponse(null, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const activationId = searchParams.get("activationId");
  if (!activationId) return new NextResponse(null, { status: 400 });

  const activation = await prisma.activation.findUnique({
    where: { id: activationId },
    select: { id: true, slug: true },
  });
  if (!activation) return new NextResponse(null, { status: 404 });

  const actorId = session.user.adminUserId;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(
        encoder.encode(
          "email,registeredAt,verifiedAt,boothCode,utmSource,utmMedium,utmCampaign\n"
        )
      );

      let cursor: string | undefined;
      let rowCount = 0;

      try {
        while (true) {
          const batch = await prisma.registration.findMany({
            where: { activationId, status: "VERIFIED" },
            orderBy: { id: "asc" },
            take: PAGE,
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            select: {
              id: true,
              email: true,
              registeredAt: true,
              verifiedAt: true,
              boothCode: true,
              utmSource: true,
              utmMedium: true,
              utmCampaign: true,
            },
          });
          if (batch.length === 0) break;
          for (const r of batch) {
            controller.enqueue(
              encoder.encode(
                csvRow([
                  r.email,
                  r.registeredAt.toISOString(),
                  r.verifiedAt?.toISOString() ?? "",
                  r.boothCode ?? "",
                  r.utmSource ?? "",
                  r.utmMedium ?? "",
                  r.utmCampaign ?? "",
                ])
              )
            );
            rowCount++;
          }
          cursor = batch[batch.length - 1]?.id;
          if (batch.length < PAGE) break;
        }

        controller.close();

        // Audit AFTER stream closes so transport failures don't produce a false success row.
        await writeAuditLog({
          category: "ADMIN",
          action: "registration.export",
          actorId,
          targetType: "Activation",
          targetId: activationId,
          metadata: { rowCount, slug: activation.slug },
        });
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${activation.slug}-registrations.csv"`,
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
