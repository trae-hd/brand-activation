"use client";
import { trpcReact } from "@/lib/trpc/react";

interface Props {
  activationId: string;
  boothCode: string;
}

export function BoothQrButton({ activationId, boothCode }: Props) {
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
    <button type="button" onClick={onClick} className="text-sm underline">
      Download QR
    </button>
  );
}
