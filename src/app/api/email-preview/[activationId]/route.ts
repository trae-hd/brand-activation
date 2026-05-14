import React from "react";
import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { prisma } from "@/lib/db/prisma";
import { verifyPreviewToken } from "@/lib/preview/token";
import { EntryCodeConfirmationEmail } from "@/lib/email/templates/EntryCodeConfirmationEmail";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ activationId: string }> },
) {
  const { activationId } = await params;
  const { searchParams } = new URL(req.url);
  const pt = searchParams.get("pt") ?? "";

  if (!verifyPreviewToken(activationId, pt)) {
    return new NextResponse("Preview link expired or invalid.", { status: 403 });
  }

  const activation = await prisma.activation.findUnique({
    where: { id: activationId },
    select: {
      name: true,
      endsAt: true,
      emailSubject: true,
      emailPreheader: true,
      emailHeading: true,
      emailBodyContent: true,
      emailBodyCopy: true,
      emailShowEntryCode: true,
      emailShowEndDate: true,
      emailTermsContent: true,
      emailFooter: true,
      primaryColor: true,
    },
  });

  if (!activation) {
    return new NextResponse("Activation not found.", { status: 404 });
  }

  const html = await render(
    React.createElement(EntryCodeConfirmationEmail, {
      to: "participant@example.com",
      entryCode: "PREVIEW-0001",
      activationName: activation.name,
      activationEndsAt: activation.endsAt,
      supportEmail: "hello@activation.mrq.com",
      cause: "verify",
      emailSubject: activation.emailSubject,
      emailPreheader: activation.emailPreheader,
      emailHeading: activation.emailHeading,
      emailBodyContent: activation.emailBodyContent,
      emailBodyCopy: activation.emailBodyCopy,
      emailShowEntryCode: activation.emailShowEntryCode,
      emailShowEndDate: activation.emailShowEndDate,
      emailTermsContent: activation.emailTermsContent,
      emailFooter: activation.emailFooter,
      primaryColor: activation.primaryColor,
    }),
  );

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
