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
});
