/**
 * SidebarNav — composes the main navigation group within the sidebar content area.
 *
 * Wraps MainNavigationMenu in a SidebarGroup to ensure proper spacing
 * and layout within the Sidebar component.
 */

import { MainNavigationMenu } from "./main-navigation-menu";
import type { NavItem } from "../../types/navigation-type";
import { SecondaryNavigationMenu } from "./secondary-navigation-menu";

export interface SidebarNavProps {
  /** The main navigation items to render. */
  mainNavigationMenuItems: NavItem[];
  /** The secondary navigation items to render (optional). */
  secondaryNavigationMenuItems: NavItem[];
}

/**
 * Renders the primary navigation items within a sidebar group container.
 *
 * @param mainNavigationMenuItems - Array of NavItem objects for the main navigation
 */
export function SidebarNav({
  mainNavigationMenuItems,
  secondaryNavigationMenuItems,
}: SidebarNavProps) {
  return (
    <>
      <MainNavigationMenu items={mainNavigationMenuItems} />
      <SecondaryNavigationMenu
        className="mt-auto"
        items={secondaryNavigationMenuItems}
      />
    </>
  );
}
