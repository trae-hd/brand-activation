"use client";

import { SidebarProvider, SidebarInset } from "../../ui/sidebar";
import { AppSidebar } from "../app-sidebar";
import { SiteHeader } from "../site-header";
import type React from "react";
import type { NavItem } from "../../../types/navigation-type";
import type { User } from "../../../types/user-type";
import { StickyBreadcrumb } from "../bread-crumb";
import { navSecondary } from "../../../config/SecondaryNavigationMenuItems";

interface PagesLayoutProps {
  children: React.ReactNode;
  /** Display name for the current app, shown in the header. */
  appName: string;
  /** Primary navigation items for this app's sidebar. */
  navItems: NavItem[];
  /** Optional secondary navigation items (shown below a divider). */
  secondaryNavItems?: NavItem[];
  /**
   * Authenticated user data — passed from the consuming app's server layout.
   * Pass null to show an unauthenticated shell (rare).
   */
  user?: User | null;
}

export function PagesLayout({
  children,
  appName,
  navItems,
  secondaryNavItems = navSecondary,
  user,
}: PagesLayoutProps) {
  return (
    <div className="[--header-height:3.5rem]">
      <SidebarProvider className="flex flex-col">
        <SiteHeader appName={appName} user={user} />

        <div className="flex flex-1">
          <AppSidebar
            mainNavItems={navItems}
            secondaryNavItems={secondaryNavItems}
          />

          <SidebarInset className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
            <main className="mt-4 flex min-w-0 flex-1 flex-col gap-4 p-6 pt-0">
              <StickyBreadcrumb />
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
