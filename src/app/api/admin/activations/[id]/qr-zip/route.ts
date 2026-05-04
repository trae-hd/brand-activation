import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { streamBoothQrZip } from "@/lib/qr/zipStream";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.adminUserId ||
    !session.user.active ||
    session.user.role !== "ADMIN"
  ) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await ctx.params;
  const result = await streamBoothQrZip(id);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await writeAuditLog({
    category: "ADMIN",
    action: "activation.qr.bulk_export",
    actorId: session.user.adminUserId,
    targetType: "Activation",
    targetId: id,
  });

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
