"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { TIMEZONE_GROUPS } from "@/lib/i18n/timezones";
import { SectionLabel } from "./form-section";

interface Props {
  primaryColor: string;
  timezone: string;
  entryCodePrefix: string;
  onPrimaryColorChange: (v: string) => void;
  onTimezoneChange: (v: string) => void;
  onEntryCodePrefixChange: (v: string) => void;
}

export function ActivationFormBranding({
  primaryColor,
  timezone,
  entryCodePrefix,
  onPrimaryColorChange,
  onTimezoneChange,
  onEntryCodePrefixChange,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <SectionLabel>Branding</SectionLabel>
      <div className="grid grid-cols-3 gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="primaryColor" className="text-muted-foreground text-xs font-normal">
            Primary colour
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="primaryColor"
              value={primaryColor}
              onChange={(e) => onPrimaryColorChange(e.target.value)}
              placeholder="#FF3366"
              className="font-mono text-sm"
              maxLength={7}
            />
            {primaryColor.match(/^#[0-9a-fA-F]{6}$/) && (
              <span
                className="h-9 w-9 shrink-0 rounded-md border"
                style={{ backgroundColor: primaryColor }}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone" className="text-muted-foreground text-xs font-normal">
            Timezone
          </Label>
          <NativeSelect
            id="timezone"
            value={timezone}
            onChange={(e) => onTimezoneChange(e.target.value)}
          >
            {TIMEZONE_GROUPS.map((g) => (
              <NativeSelectOptGroup key={g.group} label={g.group}>
                {g.options.map((tz) => (
                  <NativeSelectOption key={tz.value} value={tz.value}>
                    {tz.label}
                  </NativeSelectOption>
                ))}
              </NativeSelectOptGroup>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label
            htmlFor="entryCodePrefix"
            className="text-muted-foreground text-xs font-normal"
          >
            Entry code prefix
          </Label>
          <Input
            id="entryCodePrefix"
            value={entryCodePrefix}
            onChange={(e) =>
              onEntryCodePrefixChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
            }
            placeholder="WEMBLEY"
            maxLength={10}
            className="font-mono text-sm"
          />
          {entryCodePrefix && (
            <span className="text-muted-foreground font-mono text-xs">
              e.g. {entryCodePrefix}-K7QX
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
