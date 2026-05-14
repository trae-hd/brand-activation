import { AdminShell } from "@/components/shared/layouts/AdminShell";
import { env } from "@/lib/env";
import type { ReactNode } from "react";

// ── Inline primitives ─────────────────────────────────────────────────────────

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-20 space-y-4">
      <div className="border-b pb-2">
        <h2 className="text-xl font-semibold">{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </section>
  );
}

function SubSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-base font-medium text-foreground">{title}</h3>
      <div className="space-y-2 text-sm text-muted-foreground leading-relaxed">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground leading-relaxed">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function Callout({
  type,
  children,
}: {
  type: "tip" | "warning" | "info";
  children: ReactNode;
}) {
  const styles = {
    tip: "border-green-500/30 bg-green-500/5 text-green-800 dark:text-green-300",
    warning: "border-amber-500/30 bg-amber-500/5 text-amber-800 dark:text-amber-300",
    info: "border-blue-500/30 bg-blue-500/5 text-blue-800 dark:text-blue-300",
  };
  const labels = { tip: "Tip", warning: "Warning", info: "Info" };
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${styles[type]}`}>
      <span className="font-semibold">{labels[type]}: </span>
      {children}
    </div>
  );
}

function Formula({ children }: { children: ReactNode }) {
  return (
    <pre className="rounded-md bg-muted px-4 py-3 text-xs font-mono overflow-x-auto">
      {children}
    </pre>
  );
}

// ── TOC ───────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: "overview", label: "Overview & terminology" },
  { id: "roles", label: "Roles & permissions" },
  { id: "creating", label: "Creating an activation" },
  { id: "registration-page", label: "Designing the registration page" },
  { id: "success-page", label: "Designing the success page" },
  { id: "booths-qr", label: "Booths & QR codes" },
  { id: "utm", label: "UTM tracking" },
  { id: "peer-review", label: "Peer review process" },
  { id: "lifecycle", label: "Status lifecycle & archiving" },
  { id: "going-live", label: "Going live" },
  { id: "dashboard", label: "Reading the dashboard" },
  { id: "mrq-enrichment", label: "MRQ account enrichment" },
  { id: "winner-picking", label: "Picking winners" },
  { id: "data-retention", label: "Data, retention & DSAR" },
  { id: "glossary", label: "Glossary" },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function MethodologyPage() {
  return (
    <AdminShell>
      <div className="mx-auto max-w-4xl space-y-2">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Methodology</h1>
          <p className="mt-2 text-muted-foreground text-sm">
            How the MrQ Activation Platform works — from creating an event through to reading
            the final numbers.
          </p>
        </div>

        {/* TOC */}
        <nav className="mb-10 rounded-md border bg-muted/30 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Contents
          </p>
          <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2 text-sm">
            {SECTIONS.map(({ id, label }, i) => (
              <li key={id}>
                <a href={`#${id}`} className="hover:underline underline-offset-4 text-foreground">
                  {i + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-12">
          {/* 1 */}
          <Section id="overview" title="1. Overview & terminology">
            <p>
              The MrQ Activation Platform lets the operations team run in-venue promotional
              sign-up events — boxing nights, sports broadcasts, fan experiences — and capture
              verified email registrations from participants. Every registration is double-confirmed
              via a one-time-passcode (OTP) sent to the participant&apos;s inbox before it counts.
            </p>
            <SubSection title="Core concepts">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Activation</strong> — a single promotional event with its own landing
                  page, success page, booth layout, and date window.
                </li>
                <li>
                  <strong>Booth</strong> — a named physical location within the venue (e.g.
                  RINGSIDE, BAR-1). Participants scan a booth QR code which pre-fills{" "}
                  <code>?booth=CODE</code> on the landing page. Booth attribution survives through to
                  the registration record.
                </li>
                <li>
                  <strong>Registration</strong> — a participant&apos;s sign-up attempt. Starts in
                  PENDING state when the email form is submitted, transitions to VERIFIED after a
                  successful OTP check.
                </li>
                <li>
                  <strong>Verification</strong> — the participant enters the 6-digit OTP from their
                  email. A verified registration is the authoritative count used in KPIs.
                </li>
                <li>
                  <strong>Entry code</strong> — an optional short code (e.g. <code>ABC-123</code>)
                  assigned at verification and shown on the success page. Used for on-the-night
                  prize draws or queue management.
                </li>
                <li>
                  <strong>Peer review</strong> — before an activation can go live, a second team
                  member (not the creator) must approve it. This enforces segregation of duties.
                  Both ADMIN and MEMBER users can act as reviewers.
                </li>
                <li>
                  <strong>Archive</strong> — a soft-delete flag on an activation. Archived
                  activations are hidden from the main list but remain fully accessible via the
                  Archived filter and are never permanently deleted. Any activation at any status
                  can be archived or restored at any time.
                </li>
                <li>
                  <strong>MRQ enrichment</strong> — a silent cross-check that determines whether a
                  verified participant already has an active account on MRQ.com. Results are stored
                  against the registration record and are only run for VERIFIED registrations where
                  consent has been captured. See §12 for full details.
                </li>
              </ul>
            </SubSection>
          </Section>

          {/* 2 */}
          <Section id="roles" title="2. Roles & permissions">
            <p>
              The platform has two roles: <strong>ADMIN</strong> and <strong>MEMBER</strong>. Every
              authenticated user can create and manage activations; the distinction is around
              sensitive administrative functions.
            </p>
            <SubSection title="What both roles can do">
              <ul className="list-disc list-inside space-y-1">
                <li>Create, edit, and delete activations.</li>
                <li>Add and manage booths.</li>
                <li>Submit an activation for peer review.</li>
                <li>
                  Review and approve another user&apos;s activation (but not their own — the
                  creator cannot approve their own work).
                </li>
                <li>Trigger status transitions (DRAFT → SCHEDULED → LIVE → ENDED).</li>
                <li>Archive and restore activations.</li>
                <li>View the dashboard, registrations table, and audit log.</li>
                <li>Export the registrations CSV.</li>
                <li>Run the MRQ account enrichment check.</li>
                <li>Update their own profile and password in Settings.</li>
              </ul>
            </SubSection>
            <SubSection title="ADMIN-only functions">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Users &amp; Roles</strong> — invite new team members, change roles, deactivate
                  accounts.
                </li>
                <li>
                  <strong>Data Requests (DSAR)</strong> — generate Data Subject Access Request
                  exports.
                </li>
                <li>
                  <strong>Erasure</strong> — execute the right-to-erasure flow for a participant.
                </li>
                <li>
                  <strong>Workspace settings</strong> — configure workspace name, timezone, OTP TTL,
                  data retention, geofence, 2FA policy, and session timeout.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Accessing admin pages as a MEMBER">
              <p>
                If a MEMBER navigates to an ADMIN-only page (Users &amp; Roles, Data Requests, or
                Erasure), they see an &ldquo;Access denied&rdquo; panel rather than a redirect or
                error. In Settings, only the Profile tab is editable; other tabs display the same
                access-denied message. Contact your workspace admin if you need elevated access.
              </p>
            </SubSection>
            <SubSection title="Google sign-in provisioning">
              <p>
                Any user with a valid <code>@mrq.com</code> Google Workspace account who signs in
                for the first time is automatically provisioned as a MEMBER. They are not required
                to have received an invite link. An ADMIN can later upgrade their role via Users
                &amp; Roles.
              </p>
            </SubSection>
            <Callout type="info">
              The sidebar badge on Activations shows the number of activations pending review that
              the current user can act on (i.e. submitted by someone else). The Live activations
              badge shows the count of currently-live activations. Badge colours: amber = needs
              review, green = live.
            </Callout>
          </Section>

          {/* 3 */}
          <Section id="creating" title="3. Creating an activation">
            <p>
              Any authenticated user (ADMIN or MEMBER) can create activations.
            </p>
            <Steps
              items={[
                'Navigate to Activations → New activation.',
                "Fill in the Registration page tab: name, slug, dates, marketing copy, consent notice, T&Cs, CTA text, and hero image.",
                "After saving, you are redirected to the Success page tab to customise what participants see after verification.",
                "Add booths in the Booths section (available once the activation is saved).",
                "Optionally configure UTM tracking parameters.",
                "Submit for peer review when the activation is ready. A second team member (any role) who did not create the activation will approve or request changes.",
                "Once approved, schedule the activation (DRAFT → SCHEDULED) or transition it live (SCHEDULED → LIVE) using the status transition dialog.",
              ]}
            />
            <Callout type="info">
              You cannot schedule or go live without peer approval. An activation in DRAFT_EDITED
              state (approved but subsequently edited) must be resubmitted and re-approved before it
              can be scheduled.
            </Callout>
          </Section>

          {/* 4 */}
          <Section id="registration-page" title="4. Designing the registration page">
            <p>
              The registration page is the landing page participants visit, typically via a booth QR
              code or a UTM-tagged link from a campaign.
            </p>
            <SubSection title="Editable fields">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Hero image</strong> — full-width banner at the top of the page. Hosted
                  externally; supply a direct image URL.
                </li>
                <li>
                  <strong>Marketing copy</strong> — rich text (Tiptap editor). Rendered as the main
                  body above the email form. Supports bold, italic, links, and lists.
                </li>
                <li>
                  <strong>Consent notice</strong> — the privacy/opt-in statement the participant
                  must agree to before submitting. Hashed to a <code>consentVersion</code> string so
                  the platform can detect when the wording changes between review cycles.
                </li>
                <li>
                  <strong>Consent items</strong> — optional additional tick-box items (e.g.
                  &ldquo;If selected as a winner or contacted for follow-up, I agree to be contacted
                  by a member of the MRQ team (mrq.com).&rdquo;). Each item has a label and an
                  optional required flag. The MRQ contact consent item must be present on any
                  activation where MRQ account enrichment will be used.
                </li>
                <li>
                  <strong>CTA text</strong> — the label on the submit button (default: "Register").
                </li>
                <li>
                  <strong>Terms &amp; Conditions</strong> — optional rich text rendered below the
                  form in a collapsible block.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Hero image specifications">
              <p>
                The hero image renders full-width inside a mobile-first container at a{" "}
                <strong>fixed 2:1 aspect ratio</strong>. Anything outside the 2:1 frame gets cropped
                (<code>object-cover</code>) so the image fills its slot cleanly across phone widths.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Aspect ratio:</strong> 2 : 1 (must be exact — anything else gets cropped
                  on participant phones)
                </li>
                <li>
                  <strong>Recommended export size:</strong> 1200 × 600 px
                </li>
                <li>
                  <strong>Minimum acceptable:</strong> 800 × 400 px
                </li>
                <li>
                  <strong>Maximum useful:</strong> 1600 × 800 px (more than this is wasted bytes)
                </li>
                <li>
                  <strong>File format:</strong> JPG for photography, PNG for graphics with text or
                  sharp edges
                </li>
                <li>
                  <strong>Colour space:</strong> sRGB
                </li>
                <li>
                  <strong>Max file size:</strong> ≤ 300 KB after compression — participants are
                  often on event Wi-Fi or 4G
                </li>
              </ul>
              <p className="mt-2">
                <strong>Composition rules:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Keep critical content (logos, faces, text) inside the central 80% of the frame.
                  Edges may get cropped on narrow phones.
                </li>
                <li>
                  Avoid baked-in text overlays. Text rendering on top of the image is fragile across
                  screen widths — use the activation name and rich-text content fields for copy
                  instead.
                </li>
                <li>
                  Avoid pure-white backgrounds — they look cropped against the page card&apos;s
                  subtle borders.
                </li>
              </ul>
            </SubSection>
            <Callout type="warning">
              Editing any audited content field on an APPROVED activation (including the consent
              notice) transitions the activation to DRAFT_EDITED and requires re-approval.
            </Callout>
          </Section>

          {/* 5 */}
          <Section id="success-page" title="5. Designing the success page">
            <p>
              After a participant verifies their OTP, they land on the success page. Every field has
              a sensible fallback so activations created before the success-page customiser shipped
              still render correctly.
            </p>
            <SubSection title="Editable fields">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Hero image</strong> — optional. Displayed above the heading.
                </li>
                <li>
                  <strong>Heading</strong> — defaults to &ldquo;You&apos;re on the list.&rdquo;
                </li>
                <li>
                  <strong>Subheading</strong> — optional short paragraph below the heading.
                </li>
                <li>
                  <strong>Content</strong> — rich text block. Marketing copy rendered beneath the
                  heading.
                </li>
                <li>
                  <strong>CTA label / URL</strong> — the button label (defaults to &ldquo;Open my
                  email&rdquo;) and an optional destination URL (e.g. a sponsor landing page).
                </li>
                <li>
                  <strong>Sponsor / promo block</strong> — rich text shown below a &ldquo;while
                  you&apos;re here&rdquo; divider. Use this for partner promotions.
                </li>
                <li>
                  <strong>Show entry code</strong> — toggle (default: on). Displays the
                  participant&apos;s entry code in a highlighted box.
                </li>
                <li>
                  <strong>Show resend link</strong> — toggle (default: on). Displays a
                  &ldquo;Didn&apos;t get it? Resend&rdquo; link.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Sponsor logo specifications">
              <p>
                The sponsor logo renders inside a fixed 120 × 40 px slot in the success-page sponsor
                block, scaled with <code>object-contain</code> so the logo is preserved at any
                aspect ratio (no cropping). Aspect ratios significantly wider or taller than 3:1
                will leave whitespace beside the logo.
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Display size:</strong> 120 × 40 px
                </li>
                <li>
                  <strong>Recommended export size:</strong> 480 × 160 px (4× retina)
                </li>
                <li>
                  <strong>Minimum acceptable:</strong> 360 × 120 px (3× retina)
                </li>
                <li>
                  <strong>Best aspect ratio:</strong> 3 : 1 (matches the slot exactly)
                </li>
                <li>
                  <strong>Acceptable aspect range:</strong> 2 : 1 to 4 : 1
                </li>
                <li>
                  <strong>File format:</strong> PNG with transparent background (preferred). SVG
                  works too. JPG only if the logo has no transparency.
                </li>
                <li>
                  <strong>Colour space:</strong> sRGB
                </li>
                <li>
                  <strong>Max file size:</strong> ≤ 50 KB
                </li>
              </ul>
              <p className="mt-2">
                <strong>Composition rules:</strong>
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Use a transparent background, not white. The sponsor block sits on a bordered card
                  with a subtle background; a white logo box will clip awkwardly.
                </li>
                <li>
                  Leave at least 8 px of padding inside the logo&apos;s bounding box. Logos that
                  bleed to the edge can look cut off when scaled.
                </li>
                <li>
                  For monochrome logos, supply the dark-on-light variant — the page is light-themed.
                </li>
                <li>
                  Avoid effects that depend on a specific background colour (drop shadows blending
                  into white, gradients matching the page bg, etc.).
                </li>
              </ul>
            </SubSection>
            <Callout type="tip">
              The entry code and masked email address are injected client-side from{" "}
              <code>sessionStorage</code>. They are not server-rendered, so they only appear for
              participants who verified in the same browser session.
            </Callout>
          </Section>

          {/* 6 */}
          <Section id="booths-qr" title="6. Booths & QR codes">
            <p>
              Each booth is a physical scanning station in the venue. Participants scan the booth QR
              and the code travels through the funnel as a URL query parameter, ending up on the
              registration record.
            </p>
            <SubSection title="Adding booths">
              <p>
                Booths can only be added after the activation is saved (in edit mode). Each booth
                needs a code (uppercase, no spaces — e.g. <code>BAR-1</code>, <code>VIP</code>) and
                a human-readable label. Codes must be unique within an activation.
              </p>
            </SubSection>
            <SubSection title="QR codes">
              <p>
                Each booth has a &ldquo;QR ↓&rdquo; button that downloads a 1024×1024 PNG QR code.
                The encoded URL is <code>{env.PUBLIC_BASE_URL}/[slug]?booth=CODE</code>.
              </p>
              <p>
                Use &ldquo;Download all QRs (zip)&rdquo; to download all booth QRs for the
                activation as a single ZIP file. Each PNG is named{" "}
                <code>[slug]-[code].png</code>.
              </p>
            </SubSection>
            <Callout type="info">
              The UTM section (below) can also generate a campaign QR that encodes UTM parameters
              alongside the slug.
            </Callout>
          </Section>

          {/* 7 */}
          <Section id="utm" title="7. UTM tracking">
            <p>
              UTM parameters (<code>utm_source</code>, <code>utm_medium</code>,{" "}
              <code>utm_campaign</code>) are captured from the landing page URL at registration time
              and stored on the registration record. No extra configuration is needed — they flow
              through automatically.
            </p>
            <SubSection title="Building a tracked link">
              <p>
                Use the UTM builder in the activation form to compose a pre-tagged URL for each
                campaign channel (email, paid social, QR, etc.). The builder shows a preview URL and
                provides two actions:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Copy</strong> — copies the URL to the clipboard for use in an email or
                  social post.
                </li>
                <li>
                  <strong>QR ↓</strong> — downloads a PNG QR code encoding the full UTM-tagged URL.
                  Use this for printed materials.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Reading UTM data">
              <p>
                The dashboard&apos;s &ldquo;By UTM source&rdquo; chart shows the breakdown of
                verified registrations by <code>utm_source</code>. Registrations with no UTM source
                appear as &ldquo;(no source)&rdquo;.
              </p>
            </SubSection>
            <Formula>{`drop-off %  =  (scans − verified) / scans × 100`}</Formula>
          </Section>

          {/* 8 */}
          <Section id="peer-review" title="8. Peer review process">
            <p>
              Every activation must be approved by a second team member before it can be scheduled.
              This is a two-pair-eyes control — the creator cannot approve their own activation.
              Both ADMIN and MEMBER users may act as reviewers; the only constraint is that the
              reviewer must not be the creator.
            </p>
            <SubSection title="State machine">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>DRAFT</strong> — creator is editing; not yet submitted for review.
                </li>
                <li>
                  <strong>SUBMITTED</strong> — creator submitted; awaiting review by another team
                  member.
                </li>
                <li>
                  <strong>APPROVED</strong> — peer-approved; activation can now be scheduled.
                </li>
                <li>
                  <strong>CHANGES_REQUESTED</strong> — reviewer requested changes with notes;
                  creator must address them before resubmitting.
                </li>
                <li>
                  <strong>DRAFT_EDITED</strong> — activation was APPROVED but the creator has since
                  edited an audited content field. The prior approval is preserved in the audit log
                  for diffing, but the activation must be resubmitted.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Submitting for review">
              <p>
                The creator opens the status dialog from the activation edit page and selects
                &ldquo;Submit for review&rdquo;. This action is only available to the creator while
                the activation is in a submittable review state (DRAFT or CHANGES_REQUESTED). The
                sidebar badge on Activations reflects the number of activations awaiting review
                that the current user is eligible to act on.
              </p>
            </SubSection>
            <SubSection title="Side-by-side diff">
              <p>
                When reviewing a resubmitted activation (DRAFT_EDITED → SUBMITTED), the reviewer
                sees a side-by-side preview: the previously-approved version on the left and the
                current pending version on the right. This is reconstructed from the audit log at
                the time of the last approval.
              </p>
            </SubSection>
            <SubSection title="Consent notice changes">
              <p>
                If the consent notice wording changed since the last approval, the reviewer must
                tick &ldquo;I have reviewed the consent notice changes&rdquo; before the Approve
                button becomes active. This is enforced server-side — the tRPC mutation rejects
                approval without the acknowledgement flag.
              </p>
            </SubSection>
            <Callout type="warning">
              The sidebar badge on Activations shows only activations the current user can review
              — i.e. submitted by someone else. It does not include the user&apos;s own pending
              submissions.
            </Callout>
          </Section>

          {/* 9 */}
          <Section id="lifecycle" title="9. Status lifecycle & archiving">
            <p>
              An activation moves through four statuses: DRAFT → SCHEDULED → LIVE → ENDED. Any
              authenticated user can trigger transitions.
            </p>
            <SubSection title="Transitions and gates">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>DRAFT → SCHEDULED</strong> — requires{" "}
                  <code>reviewStatus === APPROVED</code>. The operator enters the phrase{" "}
                  <code>SCHEDULE ACTIVATION</code> to confirm.
                </li>
                <li>
                  <strong>SCHEDULED → LIVE</strong> — confirmation phrase <code>GO LIVE</code>.
                </li>
                <li>
                  <strong>LIVE → ENDED</strong> — confirmation phrase{" "}
                  <code>END ACTIVATION</code>. Registrations are immediately closed.
                </li>
                <li>
                  <strong>LIVE → SCHEDULED</strong> — rollback phrase{" "}
                  <code>REVERT TO SCHEDULED</code>.
                </li>
                <li>
                  <strong>ENDED → LIVE</strong> — reopen phrase{" "}
                  <code>REOPEN ACTIVATION</code>.
                </li>
              </ul>
            </SubSection>
            <Callout type="info">
              Activations in DRAFT_EDITED cannot be scheduled. The prior approval is no longer
              current — the activation must be resubmitted and re-approved.
            </Callout>
            <SubSection title="Archiving">
              <p>
                Any activation at any status can be archived using the Archive icon (📁) in the
                activations table. Archiving does not delete data — it soft-hides the activation
                from the main list. Archived activations:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  Appear only when the <strong>Archived</strong> filter pill is active.
                </li>
                <li>
                  Can be restored at any time using the Restore action in the same row.
                </li>
                <li>
                  Are excluded from all status-based filter counts (Live, Scheduled, Needs review,
                  etc.).
                </li>
                <li>
                  Retain all registration records, audit logs, and configuration.
                </li>
                <li>Cannot be edited while archived — restore first.</li>
              </ul>
              <p>
                Archiving is audit-logged under <code>activation.archived</code> and{" "}
                <code>activation.unarchived</code>.
              </p>
            </SubSection>
          </Section>

          {/* 10 */}
          <Section id="going-live" title="10. Going live — pre-flight checklist">
            <Steps
              items={[
                "Registration page content is finalised and spell-checked.",
                "Success page is configured (heading, entry code toggle, resend toggle).",
                "Consent notice accurately reflects the data you are collecting and how it will be used. If the MRQ account enrichment check will be used, include the MRQ contact consent item.",
                "All booths are added and QR codes downloaded / printed.",
                "Activation has been submitted for peer review and approved (reviewStatus = APPROVED).",
                "Start and end dates are correct for the local venue timezone.",
                "Entry code prefix is set if you are using physical draw mechanics.",
                "Test registration and OTP flow using a personal email address.",
                "Confirm the dashboard is accessible and the Live Counter is at zero.",
              ]}
            />
          </Section>

          {/* 11 */}
          <Section id="dashboard" title="11. Reading the dashboard">
            <p>
              The dashboard polls every 30 seconds. All counts are live and reflect the current
              state of the database.
            </p>
            <SubSection title="KPI tiles">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Verified</strong> — registrations that completed OTP verification. This is
                  the headline number. The sub-label shows how many verified in the last 5 minutes.
                </li>
                <li>
                  <strong>Pending</strong> — registrations that submitted the form but have not yet
                  verified. The sub-label shows the average time from registration to verification
                  (last 200 completions).
                </li>
                <li>
                  <strong>Scans</strong> — registrations that arrived via a booth QR code (i.e.{" "}
                  <code>boothCode</code> is set). The sub-label shows the number of distinct booths
                  seen.
                </li>
                <li>
                  <strong>Drop-off %</strong> — the percentage of booth scans that did not result in
                  a verified registration. High drop-off suggests friction in the OTP step or
                  participants who scanned but did not intend to register.
                </li>
              </ul>
            </SubSection>
            <Formula>{`drop-off %  =  (scans − verified) / scans × 100`}</Formula>
            <SubSection title="Charts">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Verifications · last 60m</strong> — sparkline of verified registrations
                  bucketed by minute. Useful for spotting when activity peaks during an event.
                </li>
                <li>
                  <strong>By booth</strong> — horizontal bar chart of scan counts per booth, sorted
                  descending. Identifies which physical locations drove the most engagement.
                </li>
                <li>
                  <strong>By UTM source</strong> — horizontal bar chart of verified registrations
                  grouped by <code>utm_source</code>. Use this to attribute which campaign channels
                  drove sign-ups.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Registrations table">
              <p>
                Below the charts, the registrations table lists all sign-ups for the activation with
                the following columns:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Verified at</strong> — time (HH:MM, London) the OTP was verified.
                </li>
                <li>
                  <strong>Email</strong> — masked by default (<code>j***@domain.com</code>). Click
                  &ldquo;reveal&rdquo; to see the full address; this action is audit-logged.
                </li>
                <li>
                  <strong>Booth</strong> — the booth code from the QR scan, or &ldquo;—&rdquo; if
                  the participant arrived directly.
                </li>
                <li>
                  <strong>UTM</strong> — the <code>utm_source</code> from the landing page URL.
                </li>
                <li>
                  <strong>IP hash</strong> — first 8 characters of the SHA-256 IP hash. Used for
                  deduplication investigation without storing the raw IP address.
                </li>
                <li>
                  <strong>Status</strong> — VERIFIED (green), PENDING (accent), or EXPIRED (muted).
                </li>
                <li>
                  <strong>MRQ account</strong> — result of the MRQ enrichment check. Active (green),
                  Inactive, No account, or &ldquo;—&rdquo; if not yet checked. See §12.
                </li>
                <li>
                  <strong>MRQ joined</strong> — the date the participant registered their MRQ
                  account, as returned by the MRQ account API.
                </li>
                <li>
                  <strong>MRQ last login</strong> — the participant&apos;s most recent MRQ login
                  date, as returned by the MRQ account API.
                </li>
              </ul>
              <p>
                Use the status filter pills (All / Verified / Pending / Expired) and the search box
                to narrow the list. The table paginates in batches of 50; click &ldquo;Load
                more&rdquo; to fetch the next page.
              </p>
            </SubSection>
            <SubSection title="CSV export">
              <p>
                The &ldquo;CSV ↓&rdquo; link in the registrations header exports all registrations
                for the activation. The CSV contains email addresses, verification status, booth
                code, UTM parameters, consent version, timestamps, and MRQ enrichment results. The
                export is audit-logged.
              </p>
            </SubSection>
          </Section>

          {/* 12 */}
          <Section id="mrq-enrichment" title="12. MRQ account enrichment">
            <p>
              The MRQ enrichment check is a silent server-side lookup that determines whether a
              verified participant already holds an active account on MRQ.com. It is designed to
              be fully compliant and PII-safe.
            </p>
            <SubSection title="How it works">
              <Steps
                items={[
                  'Click “Check MRQ accounts” in the registrations table header.',
                  "The platform sends only VERIFIED registrations for the check.",
                  "Email addresses are hashed (SHA-256) server-side before being sent to the MRQ account API. Raw email addresses never leave the server.",
                  "The API returns an account status (Active / Inactive / Not found) and, if an account exists, the MRQ registration date and last login date.",
                  "Results are stored on each registration record. The three MRQ columns in the table update immediately.",
                  "The check is audit-logged under registration.mrq_enrich with a count of registrations processed.",
                ]}
              />
            </SubSection>
            <SubSection title="MRQ account status values">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  <strong>Active</strong> (green) — the participant has a verified, active MRQ
                  account.
                </li>
                <li>
                  <strong>Inactive</strong> — the participant has an MRQ account but it is
                  deactivated or unverified.
                </li>
                <li>
                  <strong>No account</strong> — no matching MRQ account was found.
                </li>
                <li>
                  <strong>—</strong> (dash) — the enrichment check has not yet been run for this
                  registration.
                </li>
              </ul>
            </SubSection>
            <SubSection title="Consent requirement">
              <p>
                The enrichment check may only be run on activations where the registration form
                includes a consent item informing participants that, if selected as a winner or
                contacted for follow-up, they agree to be contacted by a member of the MRQ team.
                This consent must be captured before the enrichment check is triggered. The
                recommended consent item wording is:
              </p>
              <Formula>{`"If selected as a winner or contacted for follow-up, I agree to be contacted
by a member of the MrQ team (mrq.com)."`}</Formula>
            </SubSection>
            <Callout type="warning">
              MRQ enrichment data reflects a point-in-time snapshot. Re-run the check after the
              event to refresh account status before any winner contact or follow-up campaign.
              Results older than 24 hours should be considered potentially stale.
            </Callout>
            <Callout type="info">
              The MRQ account API integration is currently being wired. The &ldquo;Check MRQ
              accounts&rdquo; button is available and logs the enrichment request to the audit
              trail. Account status columns will populate once the API endpoint is live.
            </Callout>
          </Section>

          {/* 13 */}
          <Section id="winner-picking" title="13. Picking winners">
            <p>
              For activations that hand out prizes, ADMINs can run a randomised, auditable
              draw from the dashboard. The draw uses a cryptographic seed and a Postgres-side
              shuffle so the result is reproducible for audit. Each draw produces a set of
              <strong> winners</strong> plus a small set of <strong>reserves</strong> (next-in-line)
              in a single shuffle, so winner replacement when needed doesn&apos;t require a fresh draw.
            </p>

            <SubSection title="Eligibility — who can be picked">
              <p>
                A registration is eligible for selection only if <strong>all</strong> of the following are true:
              </p>
              <ul className="list-disc list-inside space-y-1">
                <li>Registration status is <code>VERIFIED</code> (pending and expired entries never participate).</li>
                <li>The participant ticked <strong>&ldquo;agree to be contacted by MrQ&rdquo;</strong> at registration. We can&apos;t legally contact someone about winning if they didn&apos;t consent.</li>
                <li>The registration is <strong>not excluded</strong> (the <code>excluded</code> flag on the registration row, set manually by an admin via Prisma Studio in v1).</li>
                <li>The registration was verified <strong>before the eligibility cutoff</strong> for the draw. ENDED activations default to <code>endsAt</code>; LIVE activations default to the timestamp the draw was triggered.</li>
                <li>The registration <strong>has not been on a previous draw for this activation</strong>, regardless of status. Disqualified registrations cannot be re-picked in a later draw — this prevents redrawing until a preferred outcome.</li>
              </ul>
              <p>
                Optionally, the draw can be filtered to <strong>only registrations with an active MrQ account</strong>
                (a toggle in the Pick Winners modal, default off).
              </p>
            </SubSection>

            <SubSection title="The algorithm">
              <p>
                The draw is <strong>deterministic given the seed</strong>. When you click &ldquo;Draw winners&rdquo;,
                the system:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Generates a fresh 32-byte cryptographic seed (one-time, server-side, never returned to the browser).</li>
                <li>Snapshots the eligible-pool registration IDs at draw time (preserved even if a participant is later erased — see Audit trail below).</li>
                <li>Computes a SHA-256 hash over <code>seed + drawId + registrationId</code> for every eligible row.</li>
                <li>Sorts by that hash and takes the top N+M rows.</li>
                <li>Positions 1..N are <strong>winners</strong>; positions N+1..N+M are <strong>reserves</strong>.</li>
              </ol>
              <p>
                Because the seed is stored alongside the draw, an auditor can re-run the same hash over the
                snapshotted pool and confirm the result. The seed itself is server-side audit material —
                not exposed to admins through the UI.
              </p>
            </SubSection>

            <SubSection title="Reserves">
              <p>
                Reserves are drawn at the same time as winners, in the same shuffle. They&apos;re ranked
                (position N+1 = topmost, etc.). When a winner is later disqualified, the topmost reserve
                is automatically promoted to winner (their type flips, their position is preserved).
                The original randomness is preserved without a new draw event.
              </p>
              <p>
                <strong>Default reserve count:</strong> <code>max(2, ceil(winners × 0.2))</code>. Admins can
                override it in the modal — set to 0 for no reserves at all, or higher for more cushion on
                large draws.
              </p>
            </SubSection>

            <SubSection title="Disqualification + promotion">
              <p>
                Each row in the persistent Winners section has a Disqualify button (ADMIN-only).
                Disqualifying a winner runs in a single transaction:
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>The selection is marked <code>DISQUALIFIED</code> with the actor + reason + timestamp recorded.</li>
                <li>If the disqualified row was a <strong>winner</strong>, the topmost <code>SELECTED</code> reserve in the same draw is promoted (its type changes from <code>RESERVE</code> to <code>WINNER</code> and a <code>promotedFromReserveAt</code> timestamp is set).</li>
                <li>If no eligible reserve exists, the slot stays unfilled — start a fresh draw to backfill.</li>
                <li>If the disqualified row was a <strong>reserve</strong>, no promotion happens. Reserves don&apos;t auto-shuffle each other in v1.</li>
              </ol>
              <p>
                A required reason field on the dialog forces a brief explanation that lands in the audit
                log. The disqualified row stays visible on the Winners view with its actor + relative
                timestamp inline beneath the action column.
              </p>
            </SubSection>

            <SubSection title="Notification log">
              <p>
                Both ADMIN and MEMBER users can mark a winner as <strong>notified</strong> after they&apos;ve made
                contact (called, emailed, spoken in person). Each notification records the actor + timestamp.
                Notes can be edited after the initial mark via the Edit notes button — the audit log
                captures the length-delta on every edit (we store length only, not content, because notes
                may contain participant PII like phone numbers and call summaries).
              </p>
              <p>
                Notes use a <strong>Last Write Wins</strong> model. If two admins edit the same row at the
                same time, the second save overwrites the first. Recovery path: query the audit log for
                <code>winner.selection.notes_updated</code> entries, which preserve the length-deltas
                so you can spot &ldquo;47 chars became 23 chars&rdquo; collisions.
              </p>
            </SubSection>

            <SubSection title="Permissions">
              <p>Who can do what:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>Pick winners (start a draw)</strong> — ADMIN only.</li>
                <li><strong>Disqualify a selection</strong> — ADMIN only.</li>
                <li><strong>Promote a reserve</strong> — Automatic on winner disqualification. There&apos;s no manual promote action.</li>
                <li><strong>Mark notified, edit notification notes</strong> — ADMIN + MEMBER. Marketing-ops MEMBERs typically run the outreach.</li>
                <li><strong>View previous draws + selections</strong> — ADMIN + MEMBER.</li>
                <li><strong>Reveal individual emails</strong> — ADMIN + MEMBER, audit-logged on each reveal.</li>
                <li><strong>Bulk-copy winner emails</strong> — ADMIN only. Bulk copy is the leakiest action surface; restricting it to ADMINs forces MEMBERs to reveal-and-copy individually, which adds friction that meaningfully reduces data-exfiltration risk.</li>
              </ul>
            </SubSection>

            <SubSection title="Audit trail">
              <p>Every winner-picking action writes a SECURITY-class or ADMIN-class row to the audit log:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><code>winner.draw.created</code> — when a draw is run. Captures activationId, counts, MrQ-only flag, eligible pool size, eligibility cutoff. Seed is on the WinnerDraw row itself, queryable via join.</li>
                <li><code>winner.selection.disqualified</code> — when a row is disqualified. Captures the reason.</li>
                <li><code>winner.selection.promoted</code> — when a reserve is auto-promoted following disqualification. Captures the from/to positions and the replaced selection&apos;s ID.</li>
                <li><code>winner.selection.notified</code> — when a row is marked as notified.</li>
                <li><code>winner.selection.notes_updated</code> — when notes are edited. Captures previous length and new length. <strong>Never the content.</strong></li>
                <li><code>winner.draw.bulk_email_copied</code> — when an admin clicks &ldquo;Copy winner emails&rdquo;.</li>
              </ul>
              <p>
                <strong>Reproducibility under erasure:</strong> if a participant exercises right to erasure
                after a draw, the WinnerDrawSelection and WinnerDrawPoolEntry rows have their
                <code> registrationId</code> set to NULL — the position in the shuffle is preserved
                so the audit narrative becomes &ldquo;position 4 was an eligible registration that has
                since been erased&rdquo; rather than the position disappearing.
              </p>
            </SubSection>

            <SubSection title="What's not yet supported">
              <p>The following are deliberate v1 trade-offs. Each is on the roadmap if it becomes useful.</p>
              <ul className="list-disc list-inside space-y-1">
                <li><strong>UI for excluding participants</strong> — the <code>excluded</code> flag exists on the registration row but there&apos;s no button to flip it. Use Prisma Studio for now. A 🚫 indicator on the registrations table confirms the flag is set.</li>
                <li><strong>Auto-emailing winners</strong> — admin-driven for v1 (the &ldquo;Copy winner emails&rdquo; button gives you a clean newline-separated list to paste into your mail tool of choice). Auto-email needs a templating story we&apos;ve not yet scoped.</li>
                <li><strong>Cross-activation rules</strong> — &ldquo;exclude past winners across activations&rdquo; isn&apos;t enforced. A previous winner is eligible for a fresh activation; if the team wants to enforce that across activations, surface it as a feature request.</li>
                <li><strong>Real-time conflict detection on note edits</strong> — Last Write Wins. Conflict resolution becomes worth building when we observe friction.</li>
              </ul>
            </SubSection>

            <Callout type="warning">
              Once a registration is on a draw for an activation — winner, reserve, or disqualified —
              they cannot be picked in a later draw on the same activation. This prevents
              &ldquo;redrawing until a preferred outcome&rdquo; and is enforced at two layers
              (the eligibility filter + a database unique constraint).
            </Callout>
          </Section>

          {/* 14 */}
          <Section id="data-retention" title="14. Data, retention & DSAR">
            <p>
              The platform captures only the minimum data required for a promotional sign-up:
              email address, booth code, UTM parameters, consent version, and timestamps. Email
              addresses are stored in plaintext for operational use; they are also stored as an HMAC
              hash for deduplication and right-to-erasure lookups. MRQ enrichment results
              (account status, MRQ registration date, MRQ last login) are stored separately and
              are included in any DSAR export or erasure request for the participant.
            </p>
            <SubSection title="Retention windows">
              <ul className="list-disc list-inside space-y-1">
                <li>
                  VERIFIED registrations are retained for the activation lifecycle plus 90 days.
                </li>
                <li>
                  PENDING registrations older than 24 hours are purged by the hourly retention cron.
                </li>
                <li>Audit log entries are retained for two years.</li>
                <li>
                  Password reset tokens are purged after 24 hours; invite tokens after 7 days.
                </li>
              </ul>
            </SubSection>
            <SubSection title="DSAR (Data Subject Access Request)">
              <p>
                Navigate to <strong>Admin → Data Requests</strong> (ADMIN only). Enter the
                participant&apos;s email and request reference, then click Download DSAR CSV. The
                export includes all registration records, MRQ enrichment data, and consent version.
                The export is audit-logged with <code>action = dsar.fulfilled</code>.
              </p>
            </SubSection>
            <SubSection title="Erasure (Right to Be Forgotten)">
              <p>
                Navigate to <strong>Admin → Erasure</strong> (ADMIN only). Enter the email, preview
                the scope, supply a reason, type the confirmation phrase{" "}
                <code>ERASE PARTICIPANT DATA</code>, and confirm. The audit log entry is written
                before the deletion so a post-erasure query proves the action occurred. MRQ
                enrichment fields are cleared alongside the plaintext email. Audit log rows
                referencing the participant by email hash are not erased — this is permitted under
                GDPR Art. 17(3)(e).
              </p>
            </SubSection>
            <Callout type="warning">
              The right to rectification is not in scope. Registration records capture only email,
              booth, and UTM parameters. Correcting these post-hoc would invalidate the audit trail.
            </Callout>
          </Section>

          {/* 15 */}
          <Section id="glossary" title="15. Glossary">
            <dl className="space-y-2">
              {[
                ["Activation", "A single promotional event managed by the platform."],
                [
                  "Archive",
                  "A soft-delete flag on an activation. Archived activations are hidden from the main list but retain all data and can be restored at any time.",
                ],
                [
                  "Audited content field",
                  "A form field whose change triggers a soft invalidation of the peer-review approval. Defined in lib/activation/auditedFields.ts.",
                ],
                [
                  "Booth",
                  "A named physical scanning station in the venue, identified by an uppercase alphanumeric code.",
                ],
                [
                  "consentVersion",
                  "An HMAC hash of the consent notice text at the time the participant registered. Used to detect consent wording changes between review cycles.",
                ],
                [
                  "DRAFT_EDITED",
                  "Review status: the activation was previously APPROVED but an audited field was edited. The prior approval metadata is preserved; the activation must be resubmitted.",
                ],
                [
                  "Drop-off %",
                  "Percentage of booth scans that did not result in a verified registration: (scans − verified) / scans × 100.",
                ],
                [
                  "Entry code",
                  "A short alphanumeric code assigned at verification, optionally shown on the success page for draw mechanics.",
                ],
                [
                  "MRQ enrichment",
                  "A server-side account lookup that cross-references a verified participant's hashed email against MRQ.com accounts. Results are stored as mrqAccountStatus, mrqRegisteredAt, and mrqLastLoginAt on the registration record.",
                ],
                [
                  "MrqAccountStatus",
                  "Enum stored on a Registration after enrichment: UNKNOWN (not yet checked) | ACTIVE | INACTIVE | NOT_FOUND.",
                ],
                [
                  "OTP",
                  "One-time passcode — a 6-digit code sent to the participant's email to verify ownership. Valid for 10 minutes.",
                ],
                [
                  "Peer review",
                  "The two-pair-eyes approval process: an activation must be approved by any team member who did not create it before it can be scheduled.",
                ],
                [
                  "Registration",
                  "A participant's sign-up record. PENDING until OTP verification; VERIFIED after.",
                ],
                [
                  "reviewStatus",
                  "The peer-review state of an activation: DRAFT | SUBMITTED | APPROVED | CHANGES_REQUESTED | DRAFT_EDITED.",
                ],
                [
                  "Soft invalidation",
                  "When an audited field changes on an APPROVED activation, the review status transitions to DRAFT_EDITED rather than hard-clearing the approval. The prior approval metadata is preserved for diffing.",
                ],
                [
                  "UTM",
                  "Urchin Tracking Module — standard query parameters (utm_source, utm_medium, utm_campaign) used to attribute registration source.",
                ],
              ].map(([term, def]) => (
                <div key={term} className="grid grid-cols-[200px_1fr] gap-2">
                  <dt className="font-medium text-foreground text-sm">{term}</dt>
                  <dd className="text-sm">{def}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </div>
    </AdminShell>
  );
}
