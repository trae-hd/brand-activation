import "dotenv/config";
import React from "react";
import { Resend } from "resend";
import { render } from "@react-email/render";
import { OtpEmail } from "../src/lib/email/templates/OtpEmail";

const TO = "trae@mrq.com";
const OTP = "482 619";

const key = process.env.RESEND_API_KEY;
if (!key) throw new Error("RESEND_API_KEY not set");

// Use Resend's test sender until mrq.com domain is verified in the Resend dashboard.
const from = "MrQ Live <onboarding@resend.dev>";

const resend = new Resend(key);

async function main() {
  const html = await render(React.createElement(OtpEmail, { otp: OTP, to: TO }));

  const { data, error } = await resend.emails.send({
    from,
    to: [TO],
    subject: `Your MrQ Live code: ${OTP}`,
    html,
  });

  if (error) {
    console.error("Send failed:", error);
    process.exit(1);
  }

  console.log("Sent!", data?.id);
}

main();
