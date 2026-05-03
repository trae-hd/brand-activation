import { PrismaClient } from "@prisma/client";
import { randomBytes, createHmac } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const inviteKey = process.env.INVITE_TOKEN_HMAC_KEY;
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  if (!email) throw new Error("BOOTSTRAP_ADMIN_EMAIL not set");
  if (!inviteKey) throw new Error("INVITE_TOKEN_HMAC_KEY not set");

  const user = await prisma.adminUser.upsert({
    where: { email: email.toLowerCase() },
    update: {},
    create: {
      email: email.toLowerCase(),
      name: email.split("@")[0],
      role: "ADMIN",
      active: true,
      passwordHash: null,
    },
  });

  // Invalidate any prior un-consumed invites for this user (§7.7.4).
  await prisma.adminInvite.updateMany({
    where: {
      subjectId: user.id,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  // Mint a fresh invite. Re-running the seed regenerates the link.
  const raw = randomBytes(32).toString("base64url");
  const tokenHash = createHmac("sha256", inviteKey).update(raw).digest("hex");
  await prisma.adminInvite.create({
    data: {
      tokenHash,
      subjectId: user.id,
      issuerId: user.id, // Self-issued by the seed.
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  const url = `${baseUrl}/auth/set-password?type=invite&token=${raw}`;
  console.log("\n========================================");
  console.log("Bootstrap admin invite (1-hour TTL):");
  console.log(url);
  console.log("========================================\n");
}

main().finally(() => prisma.$disconnect());
