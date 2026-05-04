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

export interface InviteEmailProps {
  name: string;
  setPasswordUrl: string;
  issuerName: string;
  workspaceName: string;
  role: "ADMIN" | "MEMBER";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function roleLabel(role: "ADMIN" | "MEMBER"): string {
  return role === "ADMIN" ? "Administrator" : "Member";
}

const PREVIEW_DEFAULTS: InviteEmailProps = {
  name: "Jordan",
  setPasswordUrl: "#",
  issuerName: "Priya Shah",
  workspaceName: "MrQ Live",
  role: "ADMIN",
};

export function InviteEmail({
  name = PREVIEW_DEFAULTS.name,
  setPasswordUrl = PREVIEW_DEFAULTS.setPasswordUrl,
  issuerName = PREVIEW_DEFAULTS.issuerName,
  workspaceName = PREVIEW_DEFAULTS.workspaceName,
  role = PREVIEW_DEFAULTS.role,
}: InviteEmailProps) {
  const sentDate = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const expiryTime = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(new Date(Date.now() + 60 * 60 * 1000));

  return (
    <Html lang="en">
      <Head />
      <Preview>
        {issuerName} invited you to join {workspaceName}. Set your password to get started.
      </Preview>
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
              {/* Top accent strip */}
              <Row>
                <Column>
                  <div
                    style={{
                      height: 4,
                      backgroundColor: "#3B5BFF",
                      borderRadius: "12px 12px 0 0",
                      lineHeight: "4px",
                      fontSize: 1,
                    }}
                  >
                    &nbsp;
                  </div>
                </Column>
              </Row>

              {/* Header */}
              <Row>
                <Column style={{ padding: "24px 32px 4px" }}>
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
                        Team invitation
                      </Text>
                    </Column>
                  </Row>
                </Column>
              </Row>

              {/* Inviter row */}
              <Row>
                <Column style={{ padding: "24px 32px 0" }}>
                  <Row>
                    <Column
                      style={{
                        width: 52,
                        verticalAlign: "middle",
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: "50%",
                          backgroundColor: "#3B5BFF",
                          color: "#ffffff",
                          fontSize: 14,
                          fontWeight: 700,
                          letterSpacing: "0.3px",
                          textAlign: "center",
                          lineHeight: "40px",
                          fontFamily: FONT,
                        }}
                      >
                        {initials(issuerName)}
                      </div>
                    </Column>
                    <Column style={{ verticalAlign: "middle" }}>
                      <Text
                        style={{
                          margin: "0 0 2px",
                          fontSize: 13,
                          color: "#78716c",
                          lineHeight: "1.3",
                          fontFamily: FONT,
                        }}
                      >
                        {issuerName}
                      </Text>
                      <Text
                        style={{
                          margin: 0,
                          fontSize: 12,
                          color: "#a8a29e",
                          lineHeight: "1.3",
                          fontFamily: FONT,
                        }}
                      >
                        Workspace owner
                      </Text>
                    </Column>
                  </Row>
                </Column>
              </Row>

              {/* Body copy */}
              <Row>
                <Column style={{ padding: "18px 32px 8px" }}>
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
                    Hi {name} — you&apos;re on the team.
                  </Text>
                  <Text
                    style={{
                      margin: "0 0 8px",
                      fontSize: 15,
                      lineHeight: "1.6",
                      color: "#57534e",
                      fontFamily: FONT,
                    }}
                  >
                    {issuerName} invited you to{" "}
                    <strong style={{ color: "#1c1917", fontWeight: 600 }}>{workspaceName}</strong>{" "}
                    on MrQ Live as{" "}
                    <strong style={{ color: "#1c1917", fontWeight: 600 }}>
                      {role === "ADMIN" ? "an Administrator" : "a Member"}
                    </strong>
                    . You&apos;ll be able to build activations, manage the team and review live data.
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
                    Set a password to activate your account.
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
                          Set my password &nbsp;→
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

              {/* Meta grid */}
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
                        <Row>
                          <Column style={{ width: "50%", paddingBottom: 4 }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: "#a8a29e",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                                fontFamily: FONT,
                              }}
                            >
                              Workspace
                            </Text>
                          </Column>
                          <Column style={{ width: "50%", paddingBottom: 4 }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: "#a8a29e",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                                fontFamily: FONT,
                              }}
                            >
                              Role
                            </Text>
                          </Column>
                        </Row>
                        <Row>
                          <Column style={{ width: "50%", paddingBottom: 10 }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 13,
                                color: "#1c1917",
                                fontWeight: 500,
                                fontFamily: FONT,
                              }}
                            >
                              {workspaceName}
                            </Text>
                          </Column>
                          <Column style={{ width: "50%", paddingBottom: 10 }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 13,
                                color: "#1c1917",
                                fontWeight: 500,
                                fontFamily: FONT,
                              }}
                            >
                              {roleLabel(role)}
                            </Text>
                          </Column>
                        </Row>
                        <Row>
                          <Column style={{ width: "50%", paddingBottom: 4 }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: "#a8a29e",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                                fontFamily: FONT,
                              }}
                            >
                              Invite expires
                            </Text>
                          </Column>
                          <Column style={{ width: "50%", paddingBottom: 4 }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 11,
                                color: "#a8a29e",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                                fontFamily: FONT,
                              }}
                            >
                              Sent
                            </Text>
                          </Column>
                        </Row>
                        <Row>
                          <Column style={{ width: "50%" }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 13,
                                color: "#1c1917",
                                fontWeight: 500,
                                fontFamily: FONT,
                              }}
                            >
                              In 1 hour · {expiryTime} UTC
                            </Text>
                          </Column>
                          <Column style={{ width: "50%" }}>
                            <Text
                              style={{
                                margin: 0,
                                fontSize: 13,
                                color: "#1c1917",
                                fontWeight: 500,
                                fontFamily: FONT,
                              }}
                            >
                              {sentDate}
                            </Text>
                          </Column>
                        </Row>
                      </Column>
                    </Row>
                  </Section>
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
                    Not expecting an invite? You can ignore this email — no account is created until you accept.
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

export default InviteEmail;
