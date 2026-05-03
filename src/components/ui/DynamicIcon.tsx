"use client";

import { HelpCircle } from "lucide-react";
import type { LucideProps } from "lucide-react";
import { icons, type IconName } from "@/config/IconMapping";
import { cn } from "@/lib/utils";

interface DynamicIconProps extends LucideProps {
  /** Icon name from the IconMapping registry. Renders a HelpCircle fallback if not found. */
  name?: string;
}

export function DynamicIcon({ name, className, ...props }: DynamicIconProps) {
  if (!name) return null;

  const IconComponent = icons[name as IconName];

  if (!IconComponent) {
    console.warn(`[DynamicIcon] Icon "${name}" not found in registry.`);
    return (
      <HelpCircle
        className={cn("text-muted-foreground", className)}
        {...props}
      />
    );
  }

  return <IconComponent className={className} {...props} />;
}
