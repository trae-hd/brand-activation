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

export interface OtpEmailProps {
  otp: string;
  to: string;
}

export function OtpEmail({ otp = "482619", to = "you@example.com" }: OtpEmailProps) {
  // Render OTP as a single contiguous 6-digit string (no space). Two reasons:
  //   1. The previous "XXX XXX" formatting wrapped to two lines on narrow
  //      mobile email clients (the space is a line-break opportunity).
  //   2. The space made copy-paste fail — pasting "482 619" into the
  //      OtpInput stops at the space because the slot pattern is digits-only.
  // OtpInput is also defensively sanitised to strip non-digits on paste,
  // belt-and-braces against any other source of formatted codes.
  const formatted = otp.replace(/\D/g, "");

  return (
    <Html lang="en">
      <Head />
      <Preview>Your MrQ Activation verification code is {otp}. Expires in 10 minutes.</Preview>
      <Body
        style={{ margin: 0, padding: 0, backgroundColor: "#f5f4f0", fontFamily: FONT }}
      >
        {/* Outer centring wrapper */}
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
                        Sign-in
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
                      margin: "0 0 8px",
                      fontSize: 26,
                      lineHeight: "1.2",
                      fontWeight: 700,
                      color: "#1c1917",
                      letterSpacing: "-0.4px",
                      fontFamily: FONT,
                    }}
                  >
                    Verify it&apos;s you.
                  </Text>
                  <Text
                    style={{
                      margin: "0 0 24px",
                      fontSize: 15,
                      lineHeight: "1.55",
                      color: "#57534e",
                      fontFamily: FONT,
                    }}
                  >
                    Enter this code in MrQ Activation to finish signing in. It works once and
                    expires shortly.
                  </Text>
                </Column>
              </Row>

              {/* OTP block */}
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
                      <Column style={{ textAlign: "center", padding: "24px 16px 22px" }}>
                        <Text
                          style={{
                            margin: 0,
                            fontFamily: MONO,
                            fontSize: 44,
                            fontWeight: 700,
                            color: "#1c1917",
                            // Tighter spacing than before (was 14px) so 6
                            // digits fit on one line in narrower email
                            // clients and the digits read as one chunk.
                            letterSpacing: "8px",
                            lineHeight: "1",
                            paddingLeft: "8px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatted}
                        </Text>
                        <Text
                          style={{
                            margin: "10px 0 0",
                            fontSize: 12,
                            color: "#a8a29e",
                            letterSpacing: "0.4px",
                            fontFamily: FONT,
                          }}
                        >
                          Expires in 10 minutes
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
                    Didn&apos;t try to join? You can safely ignore this email — your
                    account stays locked.
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
                    MrQ Activation · Brand activations, in real time
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
                    Sent to <span style={{ color: "#57534e" }}>{to}</span> · This is a
                    transactional security email.
                  </Text>
                </Column>
              </Row>
            </Section>
            {/* ── End card ─────────────────────────────────────── */}

            {/* Outer disclaimer */}
            <Text
              style={{
                textAlign: "center",
                fontSize: 11,
                color: "#a8a29e",
                lineHeight: "1.6",
                padding: "18px 32px 0",
                fontFamily: FONT,
              }}
            >
              We will never ask for this code over email, chat or phone.
            </Text>
          </Container>
        </Section>
      </Body>
    </Html>
  );
}

export default OtpEmail;
