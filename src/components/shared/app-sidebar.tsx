/**
 * AppSidebar — the main application sidebar.
 *
 * Composes the Sidebar primitive with the SidebarNav (main navigation)
 * and an optional SecondaryNavigationMenu in the footer area.
 * Extends the Sidebar's props for full customisation from the consuming app.
 */

"use client";

import * as React from "react";
import { Sidebar, SidebarContent, SidebarRail } from "../ui/sidebar";
import { SidebarNav } from "./sidebar-nav";
import type { NavItem } from "../../types/navigation-type";

export interface AppSidebarProps extends React.ComponentProps<typeof Sidebar> {
  /** Primary navigation items shown in the main content area. */
  mainNavItems: NavItem[];
  /** Optional secondary items shown in the footer area (e.g. settings, help). */
  secondaryNavItems?: NavItem[];
}

/**
 * The composed application sidebar.
 *
 * Renders main navigation via SidebarNav and optional secondary navigation
 * in the footer. Includes a SidebarRail for drag-to-resize affordance.
 *
 * @param mainNavItems - Primary navigation items
 * @param secondaryNavItems - Optional footer navigation items
 */
export function AppSidebar({
  mainNavItems,
  secondaryNavItems = [],
  ...props
}: AppSidebarProps) {
  return (
    <Sidebar {...props}>
      <SidebarContent>
        <SidebarNav
          mainNavigationMenuItems={mainNavItems}
          secondaryNavigationMenuItems={secondaryNavItems}
        />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}
