import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "@react-email/render";
import {
  EntryCodeConfirmationEmail,
  formatActivationEndDate,
  plainTextFor,
  subjectFor,
} from "../templates/EntryCodeConfirmationEmail";

const PROPS = {
  to: "punter@example.com",
  entryCode: "MRQ-AB12CD",
  activationName: "Wembley Live Test",
  // Pick a deadline that lands inside BST so the test catches Europe/London
  // DST handling, not just UTC fall-through. 2026-07-31T17:00:00Z is 18:00
  // local in London (BST = UTC+1).
  activationEndsAt: new Date("2026-07-31T17:00:00Z"),
  supportEmail: "hello@mrqlive.com",
  cause: "verify" as const,
};

describe("EntryCodeConfirmationEmail", () => {
  it("subject includes the activation name", () => {
    expect(subjectFor(PROPS.activationName)).toBe(
      "Your entry code for Wembley Live Test",
    );
  });

  it("renders the entry code inside a <code> element", async () => {
    const html = await render(React.createElement(EntryCodeConfirmationEmail, PROPS));
    // Must be a real <code> tag — the prompt's test list calls this out
    // explicitly. A monospace <Text> wouldn't satisfy it.
    expect(html).toMatch(/<code[^>]*>[\s\S]*?MRQ-AB12CD[\s\S]*?<\/code>/);
  });

  it("includes the activation end date formatted in Europe/London", async () => {
    const html = await render(React.createElement(EntryCodeConfirmationEmail, PROPS));
    // BST = UTC+1, so 17:00Z renders as 18:00 local on 31 July 2026.
    expect(formatActivationEndDate(PROPS.activationEndsAt)).toContain("31 July 2026");
    expect(formatActivationEndDate(PROPS.activationEndsAt)).toContain("18:00");
    expect(html).toContain(formatActivationEndDate(PROPS.activationEndsAt));
  });

  it("plaintext alternative contains the entry code on its own line", () => {
    const text = plainTextFor(PROPS);
    expect(text).toContain(PROPS.entryCode);
    // The prompt requires the entry code on its own line for easy parsing.
    const lines = text.split("\n");
    expect(lines).toContain(PROPS.entryCode);
  });

  it("plaintext directs the recipient to the support email and warns the inbox is unmonitored", () => {
    const text = plainTextFor(PROPS);
    expect(text).toContain("Contact us at hello@mrqlive.com");
    expect(text.toLowerCase()).toContain("not monitored");
  });

  it("cause: 'verify' renders the initial-confirmation headline (HTML + plaintext)", async () => {
    const props = { ...PROPS, cause: "verify" as const };
    const html = await render(React.createElement(EntryCodeConfirmationEmail, props));
    const text = plainTextFor(props);

    // React injects <!-- --> between text and JSX interpolations, so we
    // can't substring-match across them. The unique discriminators are:
    //   verify  → "registered for"
    //   resend  → "again, as requested"
    expect(html).toContain("registered for");
    expect(html).toContain("Here&#x27;s your entry code:");
    expect(html).not.toContain("again, as requested");

    expect(text).toContain("You're registered for Wembley Live Test");
    expect(text).toContain("Here's your entry code:");
    expect(text).not.toContain("again, as requested");
  });

  it("cause: 'resend' renders the 'again, as requested' headline (HTML + plaintext)", async () => {
    const props = { ...PROPS, cause: "resend" as const };
    const html = await render(EntryCodeConfirmationEmail(props));
    const text = plainTextFor(props);

    expect(html).toContain("again, as requested");
    // Verify-variant lede + subheading must NOT appear in the resend
    // variant — re-using "you're registered" would confuse a participant
    // who clicked Resend.
    expect(html).not.toContain("registered for");
    expect(html).not.toContain("Here&#x27;s your entry code:");

    expect(text).toContain("Here's your entry code again, as requested.");
    expect(text).not.toContain("You're registered for");
    // Entry code itself is still emitted on its own line in both variants.
    expect(text.split("\n")).toContain(PROPS.entryCode);
  });
});
