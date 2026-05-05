import type { NavItem } from "../types/navigation-type";

export const navMain: NavItem[] = [
  {
    id: "create",
    label: "Create",
    title: "Create",
    href: "#",
    icon: "Zap",
    children: [
      {
        id: "activations",
        label: "Activations",
        title: "Activations",
        href: "/",
        icon: "LayoutList",
        badgeQueryKey: "pendingReview",
        badgeVariant: "amber",
      },
      {
        id: "live-activations",
        label: "Live activations",
        title: "Live activations",
        href: "/?status=LIVE",
        icon: "Radio",
        badgeQueryKey: "liveCount",
        badgeVariant: "green",
      },
    ],
  },
  {
    id: "monitor",
    label: "Monitor",
    title: "Monitor",
    href: "#",
    icon: "Activity",
    children: [
      {
        id: "audit-log",
        label: "Audit Log",
        title: "Audit Log",
        href: "/admin/audit",
        icon: "ScrollText",
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    title: "Admin",
    href: "#",
    icon: "Shield",
    children: [
      {
        id: "users",
        label: "Users & Roles",
        title: "Users & Roles",
        href: "/admin/users",
        icon: "Users",
      },
      {
        id: "dsar",
        label: "Data Requests",
        title: "Data Requests",
        href: "/admin/dsar",
        icon: "ClipboardList",
      },
      {
        id: "erasure",
        label: "Erasure",
        title: "Erasure",
        href: "/admin/erasure",
        icon: "Trash2",
      },
    ],
  },
  {
    id: "help",
    label: "Help",
    title: "Help",
    href: "#",
    icon: "BookOpen",
    children: [
      {
        id: "methodology",
        label: "Methodology",
        title: "Methodology",
        href: "/methodology",
        icon: "GitBranch",
      },

    ],
  },
];
