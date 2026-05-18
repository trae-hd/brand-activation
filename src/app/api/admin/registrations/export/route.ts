import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import type { Prisma } from "@prisma/client";

const PAGE = 500;

function parseConsentItemLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x !== null && typeof x === "object" && typeof (x as { text?: unknown }).text === "string")
    .map((x) => String((x as { text: string }).text));
}

function parseConsentItemsAccepted(raw: unknown): { text: string; accepted: boolean }[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is { text: string; accepted: boolean } =>
      x !== null &&
      typeof x === "object" &&
      typeof (x as { text?: unknown }).text === "string" &&
      typeof (x as { accepted?: unknown }).accepted === "boolean",
  );
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.adminUserId || !session.user.active) {
    return new NextResponse(null, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const activationId = searchParams.get("activationId");
  if (!activationId) return new NextResponse(null, { status: 400 });

  const mrqConsentParam = searchParams.get("mrqContactConsent");
  const mrqContactConsentFilter =
    mrqConsentParam === "true" ? true : mrqConsentParam === "false" ? false : undefined;

  const activation = await prisma.activation.findUnique({
    where: { id: activationId },
    select: { id: true, slug: true, consentItems: true, mrqContactConsentEnabled: true },
  });
  if (!activation) return new NextResponse(null, { status: 404 });

  const consentLabels = parseConsentItemLabels(activation.consentItems);
  const actorId = session.user.adminUserId;

  const baseWhere: Prisma.RegistrationWhereInput = {
    activationId,
    status: "VERIFIED",
    // Test rows (admin-flagged) are never included in exports — they exist
    // to verify the activation flow, not as real participant data.
    isTest: false,
  };
  if (mrqContactConsentFilter !== undefined) {
    baseWhere.mrqContactConsent = mrqContactConsentFilter;
  }

  const consentHeaders = consentLabels.map((_, i) => `consent_${i + 1}`);
  if (activation.mrqContactConsentEnabled) consentHeaders.push("mrq_contact_consent");

  const filenameSuffix = mrqContactConsentFilter === true ? "-mrq-consented" : "";
  const filename = `${activation.slug}-registrations${filenameSuffix}.csv`;

  const headerRow = [
    "email",
    "registeredAt",
    "verifiedAt",
    "boothCode",
    "utmSource",
    "utmMedium",
    "utmCampaign",
    ...consentHeaders,
  ].join(",") + "\n";

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(headerRow));

      let cursor: string | undefined;
      let rowCount = 0;

      try {
        while (true) {
          const batch = await prisma.registration.findMany({
            where: baseWhere,
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
              mrqContactConsent: true,
              consentItemsAccepted: true,
            },
          });
          if (batch.length === 0) break;

          for (const r of batch) {
            const accepted = parseConsentItemsAccepted(r.consentItemsAccepted);
            const consentCols = consentLabels.map((_, i) =>
              accepted[i]?.accepted ? "true" : "false",
            );
            if (activation.mrqContactConsentEnabled) {
              consentCols.push(r.mrqContactConsent ? "true" : "false");
            }
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
                  ...consentCols,
                ]),
              ),
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
          metadata: { rowCount, slug: activation.slug, mrqContactConsentFilter },
        });
      } catch (err) {
        console.error("[export] stream error:", err);
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
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
