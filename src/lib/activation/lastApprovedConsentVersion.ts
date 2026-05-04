import { prisma } from "@/lib/db/prisma";

export async function fetchLastApprovedConsentVersion(activationId: string): Promise<string | null> {
  const row = await prisma.auditLog.findFirst({
    where: {
      action: "activation.review.approved",
      targetType: "Activation",
      targetId: activationId,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });
  if (!row?.metadata) return null;
  const meta = row.metadata as Record<string, unknown>;
  return typeof meta.consentVersionApproved === "string" ? meta.consentVersionApproved : null;
}
