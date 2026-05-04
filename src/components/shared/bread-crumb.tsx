"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "../ui/breadcrumb";

const LABELS: Record<string, string> = {
  activations: "Activations",
  new: "New",
  edit: "Edit",
  audit: "Audit Log",
  users: "Users & Roles",
  dsar: "Data Requests",
  erasure: "Erasure",
  dashboard: "Dashboard",
  settings: "Settings",
};

// Segments that are navigation parents with no page of their own — skip from display.
const SKIP = new Set(["admin"]);

// Override the href a segment links to (when its natural /a/b/c path doesn't exist).
const HREF_OVERRIDES: Record<string, string> = {
  activations: "/",
};

function label(segment: string): string {
  return (
    LABELS[segment] ??
    segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// cuid / uuid / numeric IDs — not meaningful to display.
function isId(segment: string): boolean {
  return segment.length > 12 && !(segment in LABELS);
}

export function StickyBreadcrumb() {
  const pathname = usePathname();
  const raw = pathname.split("/").filter(Boolean);

  // Root path — show the top-level section label directly.
  if (raw.length === 0) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbPage>Activations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  // Build display segments: skip nav-parent segments and opaque IDs.
  const visible = raw
    .map((seg, idx) => ({ seg, idx }))
    .filter(({ seg }) => !SKIP.has(seg) && !isId(seg));

  if (visible.length === 0) return null;

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {visible.map(({ seg, idx }, i) => {
          const isLast = i === visible.length - 1;
          const naturalHref = "/" + raw.slice(0, idx + 1).join("/");
          const href = HREF_OVERRIDES[seg] ?? naturalHref;

          return (
            <React.Fragment key={`${seg}-${i}`}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{label(seg)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>{label(seg)}</BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
