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

const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif';
const MONO = '"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace';

export interface EntryCodeConfirmationEmailProps {
  to: string;
  entryCode: string;
  activationName: string;
  activationEndsAt: Date;
  supportEmail: string;
  /**
   * `'verify'` — initial post-OTP-verification send (default).
   *   Headline: "You're registered for {activationName}." / "Here's your entry code:"
   * `'resend'` — on-demand resend triggered from the success-page Resend
   *   button (or the resend endpoint).
   *   Headline: "Here's your entry code again, as requested."
   *
   * Body otherwise identical between the two — the only difference is the
   * top headline + subheading, so a participant who clicked Resend isn't
   * confused by a "you're registered" lede.
   */
  cause: "verify" | "resend";
}

const END_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  dateStyle: "long",
  timeStyle: "short",
});

export function formatActivationEndDate(d: Date): string {
  return END_DATE_FORMATTER.format(d);
}

export function subjectFor(activationName: string): string {
  return `Your entry code for ${activationName}`;
}

export function plainTextFor(args: EntryCodeConfirmationEmailProps): string {
  const { entryCode, activationName, activationEndsAt, cause, supportEmail: _supportEmail } = args;
  const headline =
    cause === "resend"
      ? `Here's your entry code again, as requested.`
      : `You're registered for ${activationName}. Here's your entry code:`;
  return [
    `Hi,`,
    ``,
    headline,
    ``,
    entryCode,
    ``,
    `Show this at the booth to claim your reward. Keep this email — it's the only place you'll find your code if you close the page.`,
    ``,
    `The activation runs until ${formatActivationEndDate(activationEndsAt)}.`,
    ``,
    // `Need help? Contact us at ${supportEmail}.`,
    ``,
    `— The MrQ Activation team`,
  ].join("\n");
}

export function EntryCodeConfirmationEmail({
  to = "you@example.com",
  entryCode = "MRQ-0001",
  activationName = "Demo Activation",
  activationEndsAt = new Date("2026-12-31T23:59:00Z"),
  supportEmail: _supportEmail = "hello@activation.mrq.com",
  cause = "verify",
}: EntryCodeConfirmationEmailProps) {
  const formattedEndDate = formatActivationEndDate(activationEndsAt);
  const isResend = cause === "resend";
  const previewText = isResend
    ? `Here's your entry code again for ${activationName}: ${entryCode}. Keep this email.`
    : `Your entry code for ${activationName}: ${entryCode}. Keep this email.`;

  return (
    <Html lang="en">
      <Head />
      <Preview>{previewText}</Preview>
      <Body
        style={{ margin: 0, padding: 0, backgroundColor: "#f5f4f0", fontFamily: FONT }}
      >
        <Section style={{ padding: "32px 16px" }}>
          <Container style={{ maxWidth: 560 }}>
            {/* ── Card ──────────────────────────────────────────── */}
            <Section
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e7e5e4",
                borderRadius: 12,
              }}
            >
              {/* Header */}
              <Row>
                <Column style={{ padding: "28px 32px 8px" }}>
                  <Row>
                    <Column>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#1c1917",
                          letterSpacing: "-0.3px",
                          lineHeight: "1",
                          verticalAlign: "middle",
                        }}
                      >
                        MrQ
                      </span>
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#3B5BFF",
                          letterSpacing: "1.6px",
                          textTransform: "uppercase",
                          marginLeft: 8,
                          verticalAlign: "middle",
                          lineHeight: "1",
                        }}
                      >
                        Activation
                      </span>
                    </Column>
                    <Column align="right">
                      <Text
                        style={{
                          margin: 0,
                          fontFamily: MONO,
                          fontSize: 11,
                          color: "#a8a29e",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Entry code
                      </Text>
                    </Column>
                  </Row>
                </Column>
              </Row>

              {/* Body copy — heading + subheading branch on cause. */}
              <Row>
                <Column style={{ padding: "24px 32px 8px" }}>
                  <Text
                    style={{
                      margin: "0 0 8px",
                      fontSize: 26,
                      lineHeight: "1.2",
                      fontWeight: 700,
                      color: "#1c1917",
                      letterSpacing: "-0.4px",
                      fontFamily: FONT,
                    }}
                  >
                    {isResend ? (
                      <>Here&apos;s your entry code again, as requested.</>
                    ) : (
                      <>You&apos;re registered for {activationName}.</>
                    )}
                  </Text>
                  {!isResend && (
                    <Text
                      style={{
                        margin: "0 0 24px",
                        fontSize: 15,
                        lineHeight: "1.55",
                        color: "#57534e",
                        fontFamily: FONT,
                      }}
                    >
                      Here&apos;s your entry code:
                    </Text>
                  )}
                </Column>
              </Row>

              {/* Entry code block */}
              <Row>
                <Column style={{ padding: "0 32px 8px" }}>
                  <Section
                    style={{
                      backgroundColor: "#fafaf9",
                      border: "1px solid #e7e5e4",
                      borderRadius: 10,
                    }}
                  >
                    <Row>
                      <Column style={{ textAlign: "center", padding: "26px 16px 24px" }}>
                        <code
                          style={{
                            fontFamily: MONO,
                            fontSize: 32,
                            fontWeight: 700,
                            color: "#1c1917",
                            letterSpacing: "2px",
                            lineHeight: "1",
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                        >
                          {entryCode}
                        </code>
                      </Column>
                    </Row>
                  </Section>
                </Column>
              </Row>

              {/* Helper copy */}
              <Row>
                <Column style={{ padding: "20px 32px 0" }}>
                  <Text
                    style={{
                      margin: "0 0 12px",
                      fontSize: 14,
                      lineHeight: "1.55",
                      color: "#57534e",
                      fontFamily: FONT,
                    }}
                  >
                    Show this at the booth to claim your reward. Keep this email — it&apos;s
                    the only place you&apos;ll find your code if you close the page.
                  </Text>
                  <Text
                    style={{
                      margin: "0 0 12px",
                      fontSize: 14,
                      lineHeight: "1.55",
                      color: "#57534e",
                      fontFamily: FONT,
                    }}
                  >
                    The activation runs until {formattedEndDate}.
                  </Text>
                  {/* <Text
                    style={{
                      margin: "0 0 4px",
                      fontSize: 14,
                      lineHeight: "1.55",
                      color: "#57534e",
                      fontFamily: FONT,
                    }}
                  >
                    Need help? Contact us at hello@activation.mrq.com.
                  </Text> */}
                  <Text
                    style={{
                      margin: "0 0 4px",
                      fontSize: 12,
                      lineHeight: "1.5",
                      color: "#a8a29e",
                      fontFamily: FONT,
                    }}
                  >
                    This mailbox isn&apos;t monitored — please don&apos;t reply.
                  </Text>
                </Column>
              </Row>

              {/* Divider */}
              <Row>
                <Column style={{ padding: "24px 32px 0" }}>
                  <Hr
                    style={{ border: "none", borderTop: "1px solid #e7e5e4", margin: 0 }}
                  />
                </Column>
              </Row>

              {/* Footer */}
              <Row>
                <Column style={{ padding: "18px 32px 28px" }}>
                  <Text
                    style={{
                      margin: "0 0 4px",
                      fontSize: 12,
                      color: "#a8a29e",
                      lineHeight: "1.5",
                      fontFamily: FONT,
                    }}
                  >
                    — The MrQ Activation team
                  </Text>
                  <Text
                    style={{
                      margin: 0,
                      fontSize: 12,
                      color: "#a8a29e",
                      lineHeight: "1.5",
                      fontFamily: FONT,
                    }}
                  >
                    Sent to <span style={{ color: "#57534e" }}>{to}</span> · Transactional
                    receipt for your registration.
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
