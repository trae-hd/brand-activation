// @vitest-environment happy-dom
/**
 * Phase 5 component test for the success-page Resend button rewire.
 *
 * Two assertions per the prompt §10:
 *   1. Resend button POSTs to `/api/resend-confirmation-email` (NOT
 *      `/api/register`) — the wire-level proof that Phase 5 happened.
 *   2. Button surface state cycles: idle → "Sending…" → "Sent!" → idle on
 *      a subsequent click attempt (the "subsequent click" doesn't refire
 *      because the button is `disabled` once `resent` is true).
 *
 * Uses @testing-library/react under happy-dom — first React-component test
 * in the codebase, so happy-dom + @testing-library/react were added as dev
 * deps for this file.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuccessSessionData } from "../SuccessSessionData";

const SLUG = "wembley";

function seedSessionStorage() {
  sessionStorage.setItem(`mrq:activationId:${SLUG}`, "act-1");
  sessionStorage.setItem(`mrq:email:${SLUG}`, "punter@example.com");
  sessionStorage.setItem(`mrq:consentVersion:${SLUG}`, "consent-v1");
  sessionStorage.setItem(`mrq:entryCode:${SLUG}`, "WEM-AB12CD");
}

function renderComponent() {
  return render(
    <SuccessSessionData
      activationSlug={SLUG}
      successCtaLabel="Open MrQ"
      successCtaUrl={null}
      showEntryCode={false}
      showResend
      showCta={false}
    />,
  );
}

describe("SuccessSessionData — Resend button", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
    seedSessionStorage();
  });

  it("POSTs to /api/resend-confirmation-email (NOT /api/register) with the canonical body shape", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    renderComponent();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /resend/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/resend-confirmation-email");
    expect(url).not.toBe("/api/register");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      activationId: "act-1",
      email: "punter@example.com",
      consentVersion: "consent-v1",
    });
  });

  it("button surface state cycles: idle (Resend) → Sending… → Sent! and stays Sent on a subsequent click", async () => {
    // Hold the fetch open so we can observe the in-flight "Sending…" state.
    let resolveFetch!: (r: Response) => void;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderComponent();
    const user = userEvent.setup();
    const button = screen.getByRole("button", { name: /resend/i }) as HTMLButtonElement;

    // Direct DOM assertions (textContent, .disabled) — keeps the test
    // dependency-light: no @testing-library/jest-dom required.
    expect(button.textContent).toContain("Resend");
    expect(button.disabled).toBe(false);

    await user.click(button);

    // In-flight: button reads "Sending…" and is disabled.
    await waitFor(() => expect(button.textContent).toContain("Sending"));
    expect(button.disabled).toBe(true);

    // Fetch returns 202 → setResent(true) → "Sent!" + still disabled.
    await act(async () => {
      resolveFetch(new Response(JSON.stringify({ ok: true }), { status: 202 }));
    });
    await waitFor(() => expect(button.textContent).toContain("Sent!"));
    expect(button.disabled).toBe(true);

    // Subsequent click attempt — button is disabled so the handler never
    // fires; fetch count must stay at 1.
    await user.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(button.textContent).toContain("Sent!");
  });
});
