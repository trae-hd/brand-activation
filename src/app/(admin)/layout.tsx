import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import { SessionProvider } from "@/components/admin/SessionProvider";
import { TRPCReactProvider } from "@/lib/trpc/react";
import { SidebarBadgeFetcher } from "@/components/shared/SidebarBadgeFetcher";
import type { AdminRole } from "@prisma/client";

export const metadata: Metadata = {
  title: "MrQ Activation — Admin",
  description: "MrQ Activation Admin Console",
};

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await getServerSession(authOptions);
  const userRole: AdminRole = session?.user?.role ?? "MEMBER";

  return (
    <SessionProvider>
      <TRPCReactProvider>
        <SidebarBadgeFetcher userRole={userRole}>{children}</SidebarBadgeFetcher>
      </TRPCReactProvider>
    </SessionProvider>
  );
}
