/**
 * MainNavigationMenu — primary sidebar navigation with collapsible sub-menus.
 *
 * Renders a list of NavItems. Items with children render as collapsible groups
 * using the Radix Collapsible primitive. Leaf items render as direct links.
 *
 * Import path: relative imports only — no @/ aliases.
 */

"use client";

import Link from "next/link";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "../ui/sidebar";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { NavItem } from "../../types/navigation-type";

interface MainNavigationMenuProps {
  /** The navigation items to render. */
  items: NavItem[];
}

/**
 * Renders the primary sidebar navigation.
 *
 * Items with children become collapsible groups with an expand/collapse chevron.
 * Leaf items render directly as clickable links.
 *
 * @param items - Array of NavItem objects (optionally with children)
 */
export function MainNavigationMenu({ items }: MainNavigationMenuProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="py-5">Pages</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasChildren =
            item.children !== undefined && item.children.length > 0;

          if (hasChildren) {
            return (
              <SidebarMenuItem key={item.id}>
                <Collapsible defaultOpen={true} className="group/collapsible">
                  <CollapsibleTrigger asChild>
                    <SidebarMenuButton tooltip={item.label}>
                      {item.icon && (
                        <DynamicIcon name={item.icon} className="size-4" />
                      )}
                      <span>{item.title}</span>
                      <DynamicIcon
                        name="ChevronRight"
                        className="ml-auto size-4 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90"
                      />
                    </SidebarMenuButton>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.children?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.id}>
                          <SidebarMenuSubButton asChild>
                            <Link href={subItem.href}>
                              {subItem.icon && (
                                <DynamicIcon
                                  name={subItem.icon}
                                  className="size-4"
                                />
                              )}
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.id}>
              <SidebarMenuButton tooltip={item.label} asChild>
                <Link href={item.href}>
                  {item.icon && (
                    <DynamicIcon name={item.icon} className="size-4" />
                  )}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
