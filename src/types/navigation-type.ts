import { IconName } from "../config/IconMapping";

/** A single navigation item, optionally with children for sub-menus. */
export interface NavItem {
  /** Unique identifier for this nav item */
  id: string;
  /** Display label shown in the navigation */
  label: string;
  /** Display title (may differ from label — used in sidebar buttons) */
  title: string;
  /** The href to navigate to when clicked */
  href: string;
  /** Optional Lucide icon name from the IconMapping registry */
  icon?: IconName;
  /** Optional child items for collapsible sub-menus */
  children?: NavItem[];
  /** Optional badge text rendered next to the label (e.g. "Beta", "New"). */
  badge?: string;
}
