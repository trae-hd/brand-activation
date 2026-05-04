import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

const FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Helvetica,Arial,sans-serif';
const MONO = '"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace';

export interface PasswordResetEmailProps {
  setPasswordUrl: string;
  to: string;
}

export function PasswordResetEmail({
  setPasswordUrl = "#",
  to = "you@example.com",
}: PasswordResetEmailProps) {
  const expiryTime = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date(Date.now() + 60 * 60 * 1000));

  const sentDate = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date());

  return (
    <Html lang="en">
      <Head />
      <Preview>Reset your MrQ Live password. This link expires in 60 minutes.</Preview>
      <Body style={{ margin: 0, padding: 0, backgroundColor: "#f5f4f0", fontFamily: FONT }}>

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
                        Live
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
                        Account security
                      </Text>
                    </Column>
                  </Row>
                </Column>
              </Row>

              {/* Body copy */}
              <Row>
                <Column style={{ padding: "24px 32px 8px" }}>
                  <Text
                    style={{
                      margin: "0 0 12px",
                      fontSize: 26,
                      lineHeight: "1.2",
                      fontWeight: 700,
                      color: "#1c1917",
                      letterSpacing: "-0.4px",
                      fontFamily: FONT,
                    }}
                  >
                    Reset your password.
                  </Text>
                  <Text
                    style={{
                      margin: "0 0 24px",
                      fontSize: 15,
                      lineHeight: "1.6",
                      color: "#57534e",
                      fontFamily: FONT,
                    }}
                  >
                    We received a request to reset the password on your MrQ Live account. Click the button below to choose a new one.
                  </Text>
                </Column>
              </Row>

              {/* CTA button */}
              <Row>
                <Column style={{ padding: "0 32px 8px" }}>
                  <table
                    role="presentation"
                    cellSpacing={0}
                    cellPadding={0}
                    border={0}
                  >
                    <tr>
                      <td
                        style={{
                          backgroundColor: "#1c1917",
                          borderRadius: 8,
                        }}
                      >
                        <Link
                          href={setPasswordUrl}
                          style={{
                            display: "inline-block",
                            padding: "14px 28px",
                            fontFamily: FONT,
                            fontSize: 14,
                            fontWeight: 600,
                            color: "#ffffff",
                            letterSpacing: "0.2px",
                            lineHeight: "1",
                            borderRadius: 8,
                            textDecoration: "none",
                          }}
                        >
                          Choose a new password &nbsp;→
                        </Link>
                      </td>
                    </tr>
                  </table>
                </Column>
              </Row>

              {/* Fallback URL */}
              <Row>
                <Column style={{ padding: "20px 32px 0" }}>
                  <Text
                    style={{
                      margin: "0 0 6px",
                      fontSize: 12,
                      color: "#a8a29e",
                      lineHeight: "1.4",
                      fontFamily: FONT,
                    }}
                  >
                    Or paste this link in your browser:
                  </Text>
                  <Text
                    style={{
                      margin: 0,
                      fontFamily: MONO,
                      fontSize: 12,
                      color: "#3B5BFF",
                      lineHeight: "1.5",
                      wordBreak: "break-all",
                    }}
                  >
                    {setPasswordUrl}
                  </Text>
                </Column>
              </Row>

              {/* Detail strip */}
              <Row>
                <Column style={{ padding: "24px 32px 0" }}>
                  <Section
                    style={{
                      backgroundColor: "#fafaf9",
                      border: "1px solid #e7e5e4",
                      borderRadius: 8,
                    }}
                  >
                    <Row>
                      <Column style={{ padding: "14px 16px" }}>
                        <Text
                          style={{
                            margin: "0 0 4px",
                            fontSize: 11,
                            color: "#a8a29e",
                            letterSpacing: "1px",
                            textTransform: "uppercase",
                            fontFamily: FONT,
                          }}
                        >
                          Requested
                        </Text>
                        <Text
                          style={{
                            margin: "0 0 10px",
                            fontSize: 13,
                            color: "#1c1917",
                            fontWeight: 500,
                            lineHeight: "1.5",
                            fontFamily: FONT,
                          }}
                        >
                          {sentDate} UTC · Sent to{" "}
                          <span style={{ color: "#57534e" }}>{to}</span>
                        </Text>
                        <Text
                          style={{
                            margin: "0 0 4px",
                            fontSize: 11,
                            color: "#a8a29e",
                            letterSpacing: "1px",
                            textTransform: "uppercase",
                            fontFamily: FONT,
                          }}
                        >
                          Link expires
                        </Text>
                        <Text
                          style={{
                            margin: 0,
                            fontSize: 13,
                            color: "#1c1917",
                            fontWeight: 500,
                            lineHeight: "1.5",
                            fontFamily: FONT,
                          }}
                        >
                          In 60 minutes · {expiryTime} UTC — request a new one if you miss it
                        </Text>
                      </Column>
                    </Row>
                  </Section>
                </Column>
              </Row>

              {/* Security note */}
              <Row>
                <Column
                  style={{
                    padding: "20px 32px 4px",
                    borderLeft: "3px solid #e7e5e4",
                    paddingLeft: "14px",
                    marginLeft: "32px",
                    marginRight: "32px",
                  }}
                >
                  <Text
                    style={{
                      margin: 0,
                      fontSize: 13,
                      lineHeight: "1.55",
                      color: "#78716c",
                      fontFamily: FONT,
                    }}
                  >
                    Didn&apos;t request this? You can ignore this email — your password won&apos;t change. If you&apos;re worried, sign in and review recent activity.
                  </Text>
                </Column>
              </Row>

              {/* Divider */}
              <Row>
                <Column style={{ padding: "24px 32px 0" }}>
                  <Hr style={{ border: "none", borderTop: "1px solid #e7e5e4", margin: 0 }} />
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
                    MrQ Live · Brand activations, in real time
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
                    Sent to{" "}
                    <span style={{ color: "#57534e" }}>{to}</span>
                    {" "}· This is a transactional security email.
                  </Text>
                </Column>
              </Row>

            </Section>
            {/* ── End card ─────────────────────────────────────── */}

          </Container>
        </Section>

      </Body>
    </Html>
  );
}

export default PasswordResetEmail;
