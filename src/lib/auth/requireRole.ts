import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import type { AdminRole } from "@prisma/client";

export async function requireRole(role: AdminRole | "ANY") {
  const session = await getServerSession(authOptions);
  if (!session?.user?.adminUserId || !session.user.active) {
    redirect("/auth/signin");
  }
  if (role !== "ANY" && session.user.role !== role) {
    redirect("/?error=forbidden");
  }
  return session;
}
