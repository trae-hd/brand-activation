"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DynamicIcon } from "@/components/ui/DynamicIcon";
import type { ConsentItem } from "@/types/activation";
import { SectionLabel } from "./form-section";

interface Props {
  consentItems: ConsentItem[];
  onChange: (items: ConsentItem[]) => void;
}

export function ActivationFormConsent({ consentItems, onChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Consent items</SectionLabel>
      <p className="text-muted-foreground text-xs">
        Each item appears as a required checkbox on the registration form. Add one per consent
        statement.
      </p>
      {consentItems.length > 0 && (
        <div className="flex flex-col gap-2">
          {consentItems.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <div className="border-foreground/30 h-4 w-4 shrink-0 rounded-sm border" />
              <Input
                value={item.text}
                onChange={(e) =>
                  onChange(
                    consentItems.map((ci, idx) =>
                      idx === i ? { ...ci, text: e.target.value } : ci,
                    ),
                  )
                }
                placeholder="Type consent text…"
                className="h-8 flex-1 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive h-8 w-8 shrink-0 p-0"
                onClick={() => onChange(consentItems.filter((_, idx) => idx !== i))}
                aria-label="Remove consent item"
              >
                <DynamicIcon name="X" className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1 h-8 w-fit text-xs"
        onClick={() => onChange([...consentItems, { id: `item-${Date.now()}`, text: "" }])}
      >
        + Add consent item
      </Button>
    </div>
  );
}
