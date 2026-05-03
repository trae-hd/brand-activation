import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);

  const regResult = await prisma.registration.deleteMany({
    where: { activation: { endsAt: { lt: ninetyDaysAgo } } },
  });

  // Password tokens: hard-delete anything created more than 30 days ago,
  // regardless of consumed/expired status. Brief retention for post-incident
  // forensics; no business value beyond that.
  const inviteResult = await prisma.adminInvite.deleteMany({
    where: { createdAt: { lt: thirtyDaysAgo } },
  });
  const resetResult = await prisma.passwordResetToken.deleteMany({
    where: { createdAt: { lt: thirtyDaysAgo } },
  });

  const auditResult = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: twoYearsAgo } },
  });

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
