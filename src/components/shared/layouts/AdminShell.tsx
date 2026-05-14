import type { ReactNode } from "react";
import { getSession } from "@/lib/auth/session";
import { navMain } from "@/config/MainNavigationMenuItems";
import { PagesLayout } from "./page-layout";
import type { User } from "@/types/user-type";

function deriveInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export async function AdminShell({ children }: { children: ReactNode }) {
  const session = await getSession();

  const user: User | null = session?.user
    ? {
        name: session.user.name ?? "Admin",
        email: session.user.email ?? "",
        avatar: session.user.image ?? "",
        initials: deriveInitials(session.user.name ?? "AD"),
        role: session.user.role,
      }
    : null;

  return (
    <PagesLayout appName="MrQ Activation · Admin" navItems={navMain} user={user}>
      {children}
    </PagesLayout>
  );
}
