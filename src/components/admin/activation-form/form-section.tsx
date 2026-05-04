import React from "react";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground text-[11px] font-medium tracking-wider uppercase">
      {children}
    </p>
  );
}

export function Rule() {
  return <hr className="border-muted-foreground/20 border-dashed" />;
}
