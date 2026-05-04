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
  subtitle: 'Verified. Tells the user a confirmation email is on the way and asks them to check it.',
  variations: [
    {
      id: 'success', label: 'Plain confirmation · check your email', width: 360, height: 760,
      render: () => (<>
        <Boost>Clean check · single CTA pointing to inbox</Boost>
        <PhoneShell>
          <div style={{ paddingTop: 60, textAlign: 'center' }}>
            <div className="sk sk-fill-accent" style={{ width: 80, height: 80, borderRadius: '50%', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38 }}>✓</div>
            <div style={{ height: 22 }}></div>
            <div className="h h1">You're in.</div>
            <div className="body" style={{ marginTop: 6 }}>Confirmation on the way.</div>
          </div>
          <div style={{ height: 28 }}></div>
          <div className="sk sk-soft" style={{ padding: 12 }}>
            <div className="row"><span style={{ marginRight: 8, fontSize: 18 }}>📩</span><div className="small">We've emailed your registration confirmation. Open it to see what happens next.</div></div>
          </div>
          <div style={{ height: 14 }}></div>
          <div className="btn btn-primary" style={{ width: '100%' }}>Check your email</div>
          <div className="small" style={{ textAlign: 'center', marginTop: 10 }}>Didn't get it? <span className="squig">Resend</span></div>
        </PhoneShell>
        <Note>The follow-up email is the real handoff — this screen just routes the user to it.</Note>
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
