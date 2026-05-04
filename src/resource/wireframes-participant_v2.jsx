/* MrQ Live Wireframes — curated cut.
 * Participant: Landing (hero + email) → Verify (V2) → Success (check email). Plus edge states.
 * Admin: wrapped in shared PageLayout chrome (HQ header · AppSidebar · breadcrumb).
 *
 * No gambling references — this is a brand activation tool. Rewards are tickets / passes / experiences.
 */

const { useState, useEffect } = React;

/* ── shared atoms ─────────────────────────── */
const Note = ({ children }) => <div className="note">{children}</div>;
const Boost = ({ children }) => <span className="vtag">{children}</span>;

const PhoneShell = ({ children }) => (
  <div className="phone">
    <div className="notch"></div>
    <div className="status"><span>9:41</span><span>· · ·</span></div>
    <div className="body-area">{children}</div>
    <div className="home-bar"></div>
  </div>
);

/* ── PARTICIPANT SCREENS ─────────────────────────── */

const Landing = {
  title: 'Landing & registration',
  subtitle: 'Single screen — hero, then email + consent. Replaces the old Landing+Register split (they did the same job).',
  variations: [
    {
      id: 'landing', label: 'Hero · email · consent', width: 360, height: 760,
      render: () => (<>
        <Boost>Form-led · hero image above</Boost>
        <PhoneShell>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="mrq">MrQ <span className="lbl">live</span></div>
            <span className="small">Booth #14</span>
          </div>
          <div style={{ height: 12 }}></div>
          <div className="sk sk-soft" style={{ height: 150, marginBottom: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div className="lbl">HERO IMAGE</div>
            <div className="small" style={{ marginTop: 4 }}>activation.heroImageUrl</div>
            <div className="small" style={{ color: 'var(--ink-3)' }}>e.g. Wembley boxing match</div>
          </div>
          <div className="h h1" style={{ marginBottom: 4 }}>Win tickets to the title fight</div>
          <div className="body" style={{ marginBottom: 14 }}>Pop your email in. We'll send a code.</div>
          <div className="lbl">Email</div>
          <div className="input lg" style={{ marginTop: 4 }}>you@email.com</div>
          <div style={{ height: 12 }}></div>
          <div className="row" style={{ alignItems: 'flex-start' }}>
            <span className="check"></span>
            <div className="small" style={{ marginLeft: 8 }}>I'm 18+ and accept the <span className="squig">consent notice</span></div>
          </div>
          <div style={{ height: 14 }}></div>
          <div className="btn btn-primary" style={{ width: '100%' }}>Send me a code</div>
          <div className="rule"></div>
          <div className="small">T&Cs apply.</div>
        </PhoneShell>
        <Note>One screen, one job. Hero anchors the offer · everything else is form + consent.</Note>
      </>),
    },
  ],
};

const Verify = {
  title: 'Verify · OTP',
  subtitle: '6-digit code. Hero countdown reassures — drop-off here is the #1 risk.',
  variations: [
    {
      id: 'verify', label: 'Countdown hero + helper text', width: 360, height: 760,
      render: () => (<>
        <Boost>Timer is the hero · generous helper copy</Boost>
        <PhoneShell>
          <div style={{ textAlign: 'center', paddingTop: 14 }}>
            <div className="counter">10:00</div>
            <div className="lbl" style={{ marginTop: -6 }}>code valid for</div>
          </div>
          <div style={{ height: 18 }}></div>
          <div className="otp" style={{ justifyContent: 'center' }}>
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="otp-slot"></div>)}
          </div>
          <div style={{ height: 16 }}></div>
          <div className="body" style={{ textAlign: 'center' }}>Check your email — including spam.<br />Code is 6 digits.</div>
          <div style={{ height: 8 }}></div>
          <div className="row" style={{ justifyContent: 'center', gap: 16 }}>
            <span className="small" style={{ color: 'var(--accent)' }}>Resend</span>
            <span className="small">Wrong email?</span>
          </div>
          <div style={{ height: 18 }}></div>
          <div className="btn btn-primary" style={{ width: '100%' }}>Verify</div>
        </PhoneShell>
        <Note>Reassures anxious users — "did the email send?" is the top failure mode.</Note>
      </>),
    },
  ],
};

const Success = {
  title: 'Success',
  subtitle: "Verified. Confirmation email is on the way — and a promo slot the brand owns. The ad is a configurable slot on the activation, served from a CMS or admin upload (image + headline + CTA URL). House MrQ ad is the fallback.",
  variations: [
    {
      id: 'success-banner', label: 'Below-fold banner · MrQ house ad', width: 360, height: 880,
      render: () => (<>
        <Boost>Clean confirm + single banner ad below</Boost>
        <PhoneShell>
          <div style={{ paddingTop: 50, textAlign: 'center' }}>
            <div className="sk sk-fill-accent" style={{ width: 72, height: 72, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32 }}>✓</div>
            <div style={{ height: 16 }}></div>
            <div className="h h1">You're in.</div>
            <div className="body" style={{ marginTop: 4 }}>Confirmation on the way.</div>
          </div>
          <div style={{ height: 18 }}></div>
          <div className="sk sk-soft" style={{ padding: 10 }}>
            <div className="row"><span style={{ marginRight: 8, fontSize: 16 }}>📩</span><div className="small">Check your inbox for what's next.</div></div>
          </div>
          <div style={{ height: 16 }}></div>
          <div className="btn btn-primary" style={{ width: '100%' }}>Open my email</div>
          <div className="rule with-or" style={{ marginTop: 22 }}><span>while you're here</span></div>
          <div className="lbl" style={{ marginTop: 4 }}>PROMO SLOT · activation.adSlot</div>
          <div className="sk sk-thin" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
            <div className="sk-soft" style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1.5px solid var(--line)' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="lbl" style={{ marginTop: 0 }}>AD IMAGE 16:9</div>
                <div className="small">adSlot.imageUrl</div>
              </div>
            </div>
            <div style={{ padding: '10px 12px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="mrq" style={{ fontSize: 14 }}>MrQ</div>
                <span className="pill">SPONSORED</span>
              </div>
              <div className="h h3" style={{ marginTop: 4 }}>£10 free on us — no deposit needed</div>
              <div className="small" style={{ color: 'var(--ink-3)' }}>18+ · BeGambleAware</div>
              <div className="btn btn-soft" style={{ width: '100%', marginTop: 8 }}>Claim at mrq.com →</div>
            </div>
          </div>
          <div className="small" style={{ textAlign: 'center', marginTop: 10, color: 'var(--ink-3)' }}>You won't see this on the .live signup form — only here, post-consent.</div>
        </PhoneShell>
        <Note>Default = MrQ house ad. Activation owner can override per-activation (image, headline, CTA, tracking URL).</Note>
      </>),
    },
    {
      id: 'success-card', label: '✓ SELECTED · Sponsor card · brand-led', width: 360, height: 880,
      render: () => (<>
        <Boost>Sponsor of the activation gets the slot</Boost>
        <PhoneShell>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="mrq" style={{ fontSize: 16 }}>MrQ <span className="lbl">live</span></div>
            <span className="pill p-verified">VERIFIED</span>
          </div>
          <div className="h h1">You're on the list, Jamie.</div>
          <div className="body" style={{ marginTop: 4 }}>We've sent a confirmation to <u>j…@example.co.uk</u>.</div>
          <div className="sk" style={{ padding: 12, marginTop: 14, background: '#fef4a8' }}>
            <div className="lbl" style={{ marginTop: 0 }}>YOUR ENTRY CODE</div>
            <div className="counter lg mono">QF-7K2X</div>
            <div className="small" style={{ marginTop: 4 }}>Keep this handy — you'll need it later.</div>
          </div>

          <div className="lbl" style={{ marginTop: 18 }}>BROUGHT TO YOU BY</div>
          <div className="sk" style={{ padding: 14 }}>
            <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
              <div className="sk sk-soft sk-thin" style={{ width: 64, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 64px' }}>
                <div className="lbl" style={{ marginTop: 0 }}>LOGO</div>
              </div>
              <div style={{ flex: 1 }}>
                <div className="h h3">Sponsor headline goes here</div>
                <div className="small">A short message — 90 chars max.</div>
              </div>
            </div>
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <div className="btn btn-primary" style={{ flex: 1 }}>Sponsor CTA →</div>
              <div className="btn btn-ghost" style={{ flex: '0 0 auto' }}>↗</div>
            </div>
          </div>
          <div className="small" style={{ textAlign: 'center', marginTop: 14 }}>Not interested? <span className="squig">Hide promos</span></div>
        </PhoneShell>
        <Note>Sponsor = top of the success page. MrQ house ad is the fallback when activation has no sponsor.</Note>
      </>),
    },
    {
      id: 'success-stack', label: 'Carousel · multi-promo stack', width: 360, height: 980,
      render: () => (<>
        <Boost>Up to 3 promos · swipe carousel · activation can mix MrQ + sponsor + cross-sell</Boost>
        <PhoneShell>
          <div style={{ textAlign: 'center', paddingTop: 24 }}>
            <div className="h h1">Confirmed ✓</div>
            <div className="body" style={{ marginTop: 4 }}>Email's on the way.</div>
          </div>
          <div className="lbl" style={{ marginTop: 22 }}>PROMOS · activation.adSlots[]</div>
          <div className="sk sk-thin" style={{ padding: 10 }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <span className="pill">1 / 3</span>
              <div className="row" style={{ gap: 4 }}>
                <span className="check on" style={{ width: 8, height: 8, borderRadius: '50%' }}></span>
                <span className="check" style={{ width: 8, height: 8, borderRadius: '50%' }}></span>
                <span className="check" style={{ width: 8, height: 8, borderRadius: '50%' }}></span>
              </div>
            </div>
            <div className="sk sk-soft" style={{ height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="lbl" style={{ marginTop: 0 }}>SLOT 1 · MRQ HOUSE</div>
            </div>
            <div className="h h3" style={{ marginTop: 8 }}>£10 free at MrQ</div>
            <div className="btn btn-soft" style={{ width: '100%', marginTop: 6 }}>Claim →</div>
          </div>
          <div style={{ height: 10 }}></div>
          <div className="sk sk-thin sk-dash" style={{ padding: 10, opacity: 0.6 }}>
            <span className="pill">2 / 3</span>
            <div className="sk sk-ghost" style={{ height: 50, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="small">SLOT 2 · SPONSOR</div>
            </div>
          </div>
          <div style={{ height: 8 }}></div>
          <div className="sk sk-thin sk-dash" style={{ padding: 10, opacity: 0.4 }}>
            <span className="pill">3 / 3</span>
            <div className="sk sk-ghost" style={{ height: 50, marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="small">SLOT 3 · CROSS-SELL</div>
            </div>
          </div>
          <div className="small" style={{ textAlign: 'center', marginTop: 12, color: 'var(--ink-3)' }}>Admin sets order + how many slots show.</div>
        </PhoneShell>
        <Note>Heaviest variant. Best when sponsor + MrQ both want airtime — but watch attention drop-off.</Note>
      </>),
    },
    {
      id: 'success-takeover', label: 'Full-bleed takeover · sponsor-first', width: 360, height: 880,
      render: () => (<>
        <Boost>Bold · the sponsor IS the page · confirmation collapses</Boost>
        <PhoneShell>
          <div className="sk sk-soft" style={{ margin: '-6px -14px 0', padding: '40px 14px 20px', borderRadius: 0, borderLeft: 0, borderRight: 0, borderTop: 0, position: 'relative' }}>
            <span className="pill" style={{ position: 'absolute', top: 10, right: 10 }}>AD</span>
            <div className="lbl" style={{ marginTop: 0 }}>FULL-BLEED · 9:16</div>
            <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div className="small">adSlot.heroImage</div>
            </div>
            <div className="h h1" style={{ textAlign: 'center', marginTop: 8 }}>SPONSOR HEADLINE</div>
            <div className="body" style={{ textAlign: 'center', marginTop: 4 }}>One-liner positioning.</div>
            <div className="btn btn-primary" style={{ width: '100%', marginTop: 14 }}>Sponsor CTA →</div>
          </div>

          <div style={{ padding: 14, textAlign: 'center' }}>
            <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
              <span className="pill p-verified">✓</span>
              <span className="small">You're confirmed — check your email.</span>
            </div>
          </div>
        </PhoneShell>
        <Note>Most aggressive. Only use when activation owner has bought the takeover — otherwise it feels off-brand.</Note>
      </>),
    },
  ],
};

const States = {
  title: 'Edge states',
  subtitle: 'Apologetic + recovery-first. Now includes a NOT YET OPEN state for SCHEDULED activations.',
  variations: [
    {
      id: 'states', label: 'Expired · Ended · Not yet open', width: 360, height: 980,
      render: () => (<>
        <Boost>All three states · recovery-first tone</Boost>
        <PhoneShell>
          <div className="lbl">/ EXPIRED</div>
          <div className="sk sk-warn" style={{ padding: 14 }}>
            <div className="h h2" style={{ color: 'var(--warn)' }}>Code expired</div>
            <div className="body">10 minutes is short — sorry. Want a new one?</div>
            <div style={{ height: 8 }}></div>
            <div className="lbl">EMAIL</div>
            <div className="input">jamie@example.co.uk</div>
            <div className="btn btn-primary" style={{ marginTop: 10, width: '100%' }}>Send a fresh code</div>
            <div className="small" style={{ marginTop: 8 }}>Or <u>change email</u> — typo? happens.</div>
          </div>

          <div className="lbl" style={{ marginTop: 14 }}>/ NOT YET OPEN</div>
          <div className="sk" style={{ padding: 14 }}>
            <div className="lbl" style={{ marginTop: 0, color: 'var(--accent)' }}>OPENS · 04 MAY · 18:00 BST</div>
            <div className="h h2">Doors aren't open yet</div>
            <div className="body">Pop back at 18:00 — or drop your email and we'll text you the moment it opens.</div>
            <div style={{ height: 8 }}></div>
            <div className="input">jamie@example.co.uk</div>
            <div className="btn btn-soft" style={{ width: '100%', marginTop: 6 }}>Notify me</div>
          </div>

          <div className="lbl" style={{ marginTop: 14 }}>/ ENDED</div>
          <div className="sk sk-ghost" style={{ padding: 14 }}>
            <div className="h h2">This event has wrapped</div>
            <div className="body">Catch the next one — find us at <u>mrq.com/live</u>.</div>
          </div>
        </PhoneShell>
        <Note>Each state offers an action — no dead-ends. Not-open captures intent before LIVE.</Note>
      </>),
    },
  ],
};

window.ParticipantScreens = {
  landing: Landing,
  verify: Verify,
  success: Success,
  states: States,
};
