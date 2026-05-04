import { Prisma, type AuditCategory } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface Args {
  category: AuditCategory;
  action: string;
  actorId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  /**
   * Structured detail. Never raw PII — pass emailHash, ipHash, etc.
   * Defaults to JSON null (not SQL NULL) when omitted.
   */
  metadata?: Prisma.InputJsonValue;
  ipHash?: string | null;
  /**
   * Optional transaction client. Pass when the audit row must commit
   * atomically with surrounding writes — status transitions, review state
   * changes, user deactivations. Omit for stand-alone events.
   */
  tx?: Prisma.TransactionClient;
}

export async function writeAuditLog(args: Args): Promise<void> {
  const client = args.tx ?? prisma;
  await client.auditLog.create({
    data: {
      category: args.category,
      action: args.action,
      actorId: args.actorId ?? null,
      targetType: args.targetType ?? null,
      targetId: args.targetId ?? null,
      metadata: args.metadata ?? Prisma.JsonNull,
      ipHash: args.ipHash ?? null,
    },
  });
}
