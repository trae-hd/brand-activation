"use client";

import { useSearchParams, useRouter, usePathname } from "next/navigation";

export function useTabUrlState() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tab = (sp.get("tab") as "registration" | "success" | "email") ?? "registration";
  const preview = (sp.get("preview") as "registration" | "success" | "email") ?? tab;

  const setTab = (next: "registration" | "success" | "email", withPreview?: "registration" | "success" | "email") => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", next);
    if (withPreview !== undefined) params.set("preview", withPreview);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const setPreview = (next: "registration" | "success" | "email") => {
    const params = new URLSearchParams(sp.toString());
    params.set("preview", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return { tab, preview, setTab, setPreview };
}
