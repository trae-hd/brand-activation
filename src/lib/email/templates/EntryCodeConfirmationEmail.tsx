import React from "react";
import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { tiptapToPlainText } from "@/lib/tiptap/toPlainText";

const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif';
const MONO = '"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace';

// ── Tiptap → React Email helpers ───────────────────────────────────

type TNode = { type?: string; text?: string; content?: unknown[]; marks?: { type: string }[]; attrs?: Record<string, unknown> };

function emailInline(nodes: unknown[]): React.ReactNode {
  return (nodes as TNode[]).map((n, i) => {
    if (n.type === "text") {
      let el: React.ReactNode = n.text ?? "";
      const marks = n.marks ?? [];
      if (marks.some((m) => m.type === "bold")) el = <strong key={i} style={{ fontWeight: 700 }}>{el}</strong>;
      if (marks.some((m) => m.type === "italic")) el = <em key={i}>{el}</em>;
      if (marks.some((m) => m.type === "underline")) el = <span key={i} style={{ textDecoration: "underline" }}>{el}</span>;
      return <React.Fragment key={i}>{el}</React.Fragment>;
    }
    if (n.content) return <React.Fragment key={i}>{emailInline(n.content)}</React.Fragment>;
    return null;
  });
}

// Renders body copy paragraphs — normal body text colour, supports bold/italic.
function renderBodyDoc(doc: unknown): React.ReactNode[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return [];
  const result: React.ReactNode[] = [];
  (root.content as TNode[]).forEach((node, i) => {
    if (node.type === "paragraph") {
      const children = emailInline(node.content ?? []);
      const hasText = (node.content ?? []).some(
        (n) => (n as TNode).type === "text" && (n as TNode).text?.trim(),
      );
      if (!hasText) return;
      result.push(
        <Text
          key={i}
          style={{ margin: "0 0 16px", fontSize: 15, lineHeight: "1.6", color: "#57534e", fontFamily: FONT }}
        >
          {children}
        </Text>,
      );
    }
  });
  return result;
}

// Renders T&Cs — smaller text, headings styled, lists rendered with number/bullet prefixes.
function renderTermsDoc(doc: unknown): React.ReactNode[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return [];
  const result: React.ReactNode[] = [];
  (root.content as TNode[]).forEach((node, i) => {
    if (node.type === "heading") {
      const level = (node.attrs?.level as number) ?? 2;
      const fs = level <= 2 ? 13 : 12;
      result.push(
        <Text key={i} style={{ margin: "0 0 6px", fontSize: fs, fontWeight: 700, lineHeight: "1.5", color: "#57534e", fontFamily: FONT }}>
          {emailInline(node.content ?? [])}
        </Text>,
      );
    } else if (node.type === "paragraph") {
      const hasText = (node.content ?? []).some((n) => (n as TNode).type === "text" && (n as TNode).text?.trim());
      if (!hasText) return;
      result.push(
        <Text key={i} style={{ margin: "0 0 6px", fontSize: 11, lineHeight: "1.7", color: "#78716c", fontFamily: FONT }}>
          {emailInline(node.content ?? [])}
        </Text>,
      );
    } else if (node.type === "orderedList") {
      (node.content ?? []).forEach((item, j) => {
        const li = item as TNode;
        const textNodes = (li.content ?? []).flatMap((p) => (p as TNode).content ?? []);
        result.push(
          <Text key={`${i}-${j}`} style={{ margin: "0 0 4px", fontSize: 11, lineHeight: "1.7", color: "#78716c", fontFamily: FONT }}>
            {j + 1}.{"  "}{emailInline(textNodes)}
          </Text>,
        );
      });
    } else if (node.type === "bulletList") {
      (node.content ?? []).forEach((item, j) => {
        const li = item as TNode;
        const textNodes = (li.content ?? []).flatMap((p) => (p as TNode).content ?? []);
        result.push(
          <Text key={`${i}-${j}`} style={{ margin: "0 0 4px", fontSize: 11, lineHeight: "1.7", color: "#78716c", fontFamily: FONT }}>
            •{"  "}{emailInline(textNodes)}
          </Text>,
        );
      });
    }
  });
  return result;
}

function hasDocContent(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const root = doc as { content?: unknown[] };
  if (!Array.isArray(root.content)) return false;
  return root.content.some((n) => {
    const node = n as TNode;
    const walk = (nodes: unknown[]): boolean =>
      nodes.some((c) => {
        const cn = c as TNode;
        return (cn.type === "text" && !!cn.text?.trim()) || walk(cn.content ?? []);
      });
    return walk(node.content ?? []);
  });
}

// ── Public interface ───────────────────────────────────────────────

export interface EntryCodeConfirmationEmailProps {
  to: string;
  /** Null when the activation has no `entryCodePrefix` — the email renders
   * without the code block and subject/heading shift to a generic
   * "you're registered" confirmation. */
  entryCode: string | null;
  activationName: string;
  activationEndsAt: Date;
  supportEmail: string;
  /**
   * `'verify'` — initial post-OTP-verification send (default).
   * `'resend'` — on-demand resend from the success-page Resend button.
   */
  cause: "verify" | "resend";
  // Per-activation email customisation (all optional — null/undefined falls back to defaults)
  emailSubject?: string | null;
  emailPreheader?: string | null;
  emailHeading?: string | null;
  /** Raw Tiptap JSON for the intro body copy (between heading and entry code). */
  emailBodyContent?: unknown | null;
  emailBodyCopy?: string | null;
  emailShowEntryCode?: boolean | null;
  emailShowEndDate?: boolean | null;
  /** Raw Tiptap JSON for the T&Cs section above the footer. */
  emailTermsContent?: unknown | null;
  emailFooter?: string | null;
  primaryColor?: string | null;
}

const END_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "long",
  timeStyle: "short",
});

export function formatActivationEndDate(d: Date): string {
  return END_DATE_FORMATTER.format(d);
}

export function subjectFor(activationName: string, entryCode: string | null = null): string {
  return entryCode
    ? `Your entry code for ${activationName}`
    : `You're registered for ${activationName}`;
}

const DEFAULT_BODY_COPY = `Keep this email — it's the only place you'll find your code if you close the page.`;

export function plainTextFor(args: EntryCodeConfirmationEmailProps): string {
  const {
    entryCode,
    activationName,
    activationEndsAt,
    cause,
    emailHeading,
    emailBodyContent,
    emailBodyCopy,
    emailShowEntryCode = true,
    emailShowEndDate = true,
    emailTermsContent,
    emailFooter,
  } = args;

  // The entry-code block only renders when there's a code to show AND the
  // admin hasn't hidden it. Without a code (activation has no prefix) the
  // email still sends — just without the code section and with a generic
  // "you're registered" heading.
  const showEntryCode = !!entryCode && emailShowEntryCode !== false;
  const showEndDate = emailShowEndDate !== false;

  const defaultHeading =
    cause === "resend"
      ? `Here's your entry code again, as requested.`
      : showEntryCode
        ? `You're registered for ${activationName}. Here's your entry code:`
        : `You're registered for ${activationName}.`;
  const heading = cause !== "resend" && emailHeading?.trim() ? emailHeading.trim() : defaultHeading;
  const bodyCopy = emailBodyCopy?.trim() || DEFAULT_BODY_COPY;
  const footer = emailFooter?.trim() || `— The MrQ Activation team`;

  const bodyPlainText = tiptapToPlainText(emailBodyContent);
  const termsPlainText = tiptapToPlainText(emailTermsContent);

  const lines: string[] = [`Hi,`, ``, heading, ``];

  if (bodyPlainText) lines.push(bodyPlainText, ``);

  if (showEntryCode && entryCode) lines.push(entryCode, ``, bodyCopy, ``);

  if (showEndDate) lines.push(`The activation runs until ${formatActivationEndDate(activationEndsAt)}.`, ``);

  if (termsPlainText) lines.push(`Terms & Conditions`, ``, termsPlainText, ``);

  lines.push(``, footer);

  return lines.join("\n");
}

export function EntryCodeConfirmationEmail({
  to = "you@example.com",
  entryCode = "MRQ-0001",
  activationName = "Demo Activation",
  activationEndsAt = new Date("2026-12-31T23:59:00Z"),
  supportEmail: _supportEmail = "hello@activation.mrq.com",
  cause = "verify",
  emailSubject: _emailSubject,
  emailPreheader,
  emailHeading,
  emailBodyContent,
  emailBodyCopy,
  emailShowEntryCode = true,
  emailShowEndDate = true,
  emailTermsContent,
  emailFooter,
  primaryColor,
}: EntryCodeConfirmationEmailProps) {
  const formattedEndDate = formatActivationEndDate(activationEndsAt);
  const isResend = cause === "resend";

  // Mirrors `plainTextFor`: hide the code section when there's no code OR
  // the admin opted out. Keeps the email send unconditional on verification.
  const showEntryCode = !!entryCode && emailShowEntryCode !== false;
  const showEndDate = emailShowEndDate !== false;

  const defaultHeading = isResend
    ? `Here's your entry code again, as requested.`
    : `You're registered for ${activationName}.`;
  const heading = !isResend && emailHeading?.trim() ? emailHeading.trim() : defaultHeading;

  const bodyCopy = emailBodyCopy?.trim() || DEFAULT_BODY_COPY;
  const footer = emailFooter?.trim() || `— The MrQ Activation team`;

  const defaultPreviewText = isResend && entryCode
    ? `Here's your entry code again for ${activationName}: ${entryCode}. Keep this email.`
    : entryCode
      ? `Your entry code for ${activationName}: ${entryCode}. Keep this email.`
      : `You're registered for ${activationName}. Keep this email.`;
  const previewText = emailPreheader?.trim() || defaultPreviewText;

  const bodyNodes = renderBodyDoc(emailBodyContent);
  const hasBody = hasDocContent(emailBodyContent);
  const termsNodes = renderTermsDoc(emailTermsContent);
  const hasTerms = hasDocContent(emailTermsContent);

  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: "#f5f4f0", fontFamily: FONT }}>
        <Section style={{ padding: "32px 16px" }}>
          <Container style={{ maxWidth: 560 }}>
            <Section
              style={{ backgroundColor: "#ffffff", border: "1px solid #e7e5e4", borderRadius: 12 }}
            >
              {/* Header */}
              <Row>
                <Column style={{ padding: "28px 32px 8px" }}>
                  <Row>
                    <Column>
                      <span style={{ display: "inline-block", fontSize: 18, fontWeight: 800, color: "#1c1917", letterSpacing: "-0.3px", lineHeight: "1", verticalAlign: "middle" }}>
                        MrQ
                      </span>
                      <span style={{ display: "inline-block", fontSize: 11, fontWeight: 600, color: "#3B5BFF", letterSpacing: "1.6px", textTransform: "uppercase", marginLeft: 8, verticalAlign: "middle", lineHeight: "1" }}>
                        Activation
                      </span>
                    </Column>
                    <Column align="right">
                      {showEntryCode && (
                        <Text style={{ margin: 0, fontFamily: MONO, fontSize: 11, color: "#a8a29e", letterSpacing: "0.5px" }}>
                          Entry code
                        </Text>
                      )}
                    </Column>
                  </Row>
                </Column>
              </Row>

              {/* Heading */}
              <Row>
                <Column style={{ padding: "24px 32px 8px" }}>
                  <Text style={{ margin: 0, fontSize: 26, lineHeight: "1.2", fontWeight: 700, color: "#1c1917", letterSpacing: "-0.4px", fontFamily: FONT }}>
                    {heading}
                  </Text>
                </Column>
              </Row>

              {/* Body copy — rich text, supports bold/italic */}
              {hasBody && (
                <Row>
                  <Column style={{ padding: "16px 32px 0" }}>
                    {bodyNodes}
                  </Column>
                </Row>
              )}

              {/* "Here's your entry code:" — always below body, above the block */}
              {!isResend && showEntryCode && (
                <Row>
                  <Column style={{ padding: "16px 32px 0" }}>
                    <Text style={{ margin: 0, fontSize: 15, lineHeight: "1.55", color: "#57534e", fontFamily: FONT }}>
                      Here&apos;s your entry code:
                    </Text>
                  </Column>
                </Row>
              )}

              {/* Entry code block */}
              {showEntryCode && (
                <Row>
                  <Column style={{ padding: "16px 32px 8px" }}>
                    <Section style={{ backgroundColor: primaryColor ?? "#1c1917", borderRadius: 10 }}>
                      <Row>
                        <Column style={{ textAlign: "center", padding: "26px 16px 24px" }}>
                          <code style={{ fontFamily: MONO, fontSize: 32, fontWeight: 700, color: "#ffffff", letterSpacing: "2px", lineHeight: "1", whiteSpace: "nowrap", display: "inline-block" }}>
                            {entryCode}
                          </code>
                        </Column>
                      </Row>
                    </Section>
                  </Column>
                </Row>
              )}

              {/* Helper copy + end date */}
              <Row>
                <Column style={{ padding: "24px 32px 0" }}>
                  {showEntryCode && (
                    <Text style={{ margin: "0 0 12px", fontSize: 14, lineHeight: "1.55", color: "#57534e", fontFamily: FONT }}>
                      {bodyCopy}
                    </Text>
                  )}
                  {showEndDate && (
                    <Text style={{ margin: "0 0 12px", fontSize: 14, lineHeight: "1.55", color: "#57534e", fontFamily: FONT }}>
                      The activation runs until {formattedEndDate}.
                    </Text>
                  )}
                  <Text style={{ margin: "0 0 4px", fontSize: 12, lineHeight: "1.5", color: "#a8a29e", fontFamily: FONT }}>
                    This mailbox isn&apos;t monitored — please don&apos;t reply.
                  </Text>
                </Column>
              </Row>

              {/* T&Cs block — tinted section above footer */}
              {hasTerms && (
                <Row>
                  <Column>
                    <Section style={{ backgroundColor: "#fafaf9", borderTop: "1px solid #e7e5e4", padding: "16px 32px" }}>
                      {termsNodes}
                    </Section>
                  </Column>
                </Row>
              )}

              {/* Divider */}
              <Row>
                <Column style={{ padding: "24px 32px 0" }}>
                  <Hr style={{ border: "none", borderTop: "1px solid #e7e5e4", margin: 0 }} />
                </Column>
              </Row>

              {/* Footer */}
              <Row>
                <Column style={{ padding: "18px 32px 28px" }}>
                  <Text style={{ margin: "0 0 4px", fontSize: 12, color: "#a8a29e", lineHeight: "1.5", fontFamily: FONT }}>
                    {footer}
                  </Text>
                  <Text style={{ margin: 0, fontSize: 12, color: "#a8a29e", lineHeight: "1.5", fontFamily: FONT }}>
                    Sent to <span style={{ color: "#57534e" }}>{to}</span> · Transactional receipt for your registration.
                  </Text>
                </Column>
              </Row>
            </Section>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

export default EntryCodeConfirmationEmail;
