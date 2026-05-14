import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

  // Audit logs are purged separately (they can't be inside the same transaction
  // that also writes an audit row, as the delete + write would be circular).
  const auditResult = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: twoYearsAgo } },
  });

  // Wrap registrations + tokens + audit write in a single transaction so the
  // audit row is always present if and only if the deletions committed. A crash
  // between deletes and the audit write previously left the purge unrecorded.
  const [regResult, inviteResult, resetResult] = await prisma.$transaction([
    prisma.registration.deleteMany({
      where: { activation: { endsAt: { lt: ninetyDaysAgo } } },
    }),
    // Password tokens: hard-delete anything older than 30 days regardless of
    // consumed/expired status. Brief retention for post-incident forensics.
    prisma.adminInvite.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { createdAt: { lt: thirtyDaysAgo } },
    }),
  ]);

  await prisma.auditLog.create({
    data: {
      category: "SECURITY",
      action: "retention.purge",
      metadata: {
        registrationsPurged: regResult.count,
        invitesPurged: inviteResult.count,
        resetTokensPurged: resetResult.count,
        auditLogsPurged: auditResult.count,
      },
    },
  });
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ event: "retention.purge.failed", error: String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
