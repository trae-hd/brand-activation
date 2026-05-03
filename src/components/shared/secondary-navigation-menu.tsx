/**
 * SecondaryNavigationMenu — secondary sidebar navigation in the footer area.
 *
 * Renders a smaller set of navigation items (e.g. settings, help) at the
 * bottom of the sidebar. Supports collapsible sub-menus like the main menu.
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
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "../ui/sidebar";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { NavItem } from "../../types/navigation-type";

interface SecondaryNavigationMenuProps {
  items: NavItem[];
  className?: string;
}

/**
 * Secondary navigation rendered in the sidebar footer.
 *
 * Uses smaller text and button size than the main navigation.
 * Supports collapsible sub-items.
 *
 * @param items - Array of NavItem objects
 */
export function SecondaryNavigationMenu({
  items,
  className,
}: SecondaryNavigationMenuProps) {
  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => {
            const hasChildren =
              item.children !== undefined && item.children.length > 0;

            if (hasChildren) {
              return (
                <SidebarMenuItem key={item.id}>
                  <Collapsible
                    defaultOpen={false}
                    className="group/collapsible"
                  >
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip={item.title}>
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
                <SidebarMenuButton asChild>
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
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
