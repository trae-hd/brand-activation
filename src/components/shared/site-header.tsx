"use client";

import Link from "next/link";
import { useSidebar } from "../ui/sidebar";
import { Button } from "../ui/button";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { ModeToggle } from "./mode-toggle";
import { UserProfile } from "./user-profile";
import type { User } from "../../types/user-type";

interface SiteHeaderProps {
  appName: string;
  user?: User | null;
}

export function SiteHeader({ appName, user }: SiteHeaderProps) {
  const { toggleSidebar } = useSidebar();
  return (
    <header className="drop-blur border-border bg-sidebar supports-[backdrop-filter]:bg-sidebar sticky top-0 z-50 flex w-full items-center border-b px-4 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
      <div className="flex h-(--header-height) w-full items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="cursor-pointer"
            onClick={toggleSidebar}
            aria-label="Toggle sidebar"
          >
            <DynamicIcon name="PanelLeftClose" className="size-4" />
          </Button>
          <Link href="/" className="flex flex-col gap-0 leading-none">
            <span className="text-foreground text-xl font-bold tracking-tight">
              HQ
            </span>
            <span className="text-muted-foreground text-xs font-medium">
              {appName}
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden md:flex">
            <ModeToggle />
          </div>
          <UserProfile user={user} />
        </div>
      </div>
    </header>
  );
}
