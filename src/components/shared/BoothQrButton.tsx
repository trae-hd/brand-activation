"use client";
import { trpcReact } from "@/lib/trpc/react";
import { Button } from "@/components/ui/button";

interface Props {
  activationId: string;
  boothCode: string;
  label?: string;
}

export function BoothQrButton({ activationId, boothCode, label = "Download QR" }: Props) {
  const utils = trpcReact.useUtils();

  const onClick = async () => {
    const { filename, base64 } = await utils.booth.getQrPng.fetch({
      activationId,
      boothCode,
    });
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "image/png" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onClick}>
      {label}
    </Button>
  );
}
