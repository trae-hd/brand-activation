import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const result = await prisma.registration.deleteMany({
    where: {
      status: "PENDING",
      registeredAt: { lt: cutoff },
    },
  });

  if (result.count > 0) {
    await prisma.auditLog.create({
      data: {
        category: "SECURITY",
        action: "retention.purge.pending",
        metadata: { count: result.count, cutoffIso: cutoff.toISOString() },
      },
    });
  }
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ event: "pending.purge.failed", error: String(e) }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
