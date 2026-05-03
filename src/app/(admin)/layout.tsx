import type { ReactNode } from "react";
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { SessionProvider } from "@/components/admin/SessionProvider";
import { TRPCReactProvider } from "@/lib/trpc/react";

export const metadata: Metadata = {
  title: "MrQ Live — Admin",
  description: "MrQ Live Activation Admin Console",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <SessionProvider>
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
