"use client";

import Link from "next/link";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "../ui/sidebar";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import { SidebarBadge } from "@/components/shared/SidebarBadge";
import { useBadgeCounts } from "@/lib/admin/sidebarBadgeCounts";
import type { NavItem } from "../../types/navigation-type";

interface MainNavigationMenuProps {
  items: NavItem[];
}

export function MainNavigationMenu({ items }: MainNavigationMenuProps) {
  const badgeCounts = useBadgeCounts();

  return (
    <>
      {items.map((section) => (
        <SidebarGroup key={section.id}>
          <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
          <SidebarMenu>
            {(section.children ?? []).map((item) => {
              const badgeCount = item.badgeQueryKey ? (badgeCounts[item.badgeQueryKey] ?? 0) : 0;
              return (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton tooltip={item.label} asChild>
                    <Link href={item.href}>
                      {item.icon && (
                        <DynamicIcon name={item.icon} className="size-4" />
                      )}
                      <span>{item.title}</span>
                      <SidebarBadge count={badgeCount} variant={item.badgeVariant} />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      ))}
    </>
  );
}
