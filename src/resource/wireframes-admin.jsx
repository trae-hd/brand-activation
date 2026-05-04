/* Admin wireframes — wrapped in shared PageLayout chrome (HQ header · AppSidebar · breadcrumb). */

const Boost = ({ children }) => <span className="vtag">{children}</span>;
const Note = ({ children }) => <div className="note">{children}</div>;

/* PageLayout-style shell — mirrors src/components/shared/layouts/page-layout.tsx */
const Shell = ({ active, crumbs, children }) => {
  const NAV = [
    { group: 'OPERATIONS', icon: '⚡', items: [
      { id: 'activations', label: 'Activations' },
    ]},
    { group: 'OBSERVABILITY', icon: '📡', items: [
      { id: 'audit', label: 'Audit Log' },
    ]},
    { group: 'ADMINISTRATION', icon: '🛡', items: [
      { id: 'users', label: 'Users & Roles' },
    ]},
    { group: 'COMPLIANCE', icon: '✅', items: [
      { id: 'dsar', label: 'Data Subject Requests' },
      { id: 'erasure', label: 'Erasure Requests' },
    ]},
  ];
  const SECONDARY = [
    { id: 'settings', label: 'Settings', icon: '⚙' },
    { id: 'help', label: 'Help', icon: '?' },
    { id: 'feedback', label: 'Feedback', icon: '💬' },
  ];

  return (
    <div className="hq-shell">
      <div className="hq-header">
        <div className="row">
          <div className="hq-icon-btn">⌘</div>
          <div className="hq-brand">
            <div className="hq-brand-1">HQ</div>
            <div className="hq-brand-2">MrQ Live · Admin</div>
          </div>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <div className="hq-icon-btn">☾</div>
          <div className="hq-avatar">JH</div>
        </div>
      </div>
      <div className="hq-body">
        <aside className="hq-sidebar">
          <div className="lbl" style={{ padding: '12px 14px 6px' }}>PAGES</div>
          {NAV.map(g => (
            <div key={g.group} className="hq-nav-group">
              <div className="hq-nav-grouphead">
                <span style={{ marginRight: 8 }}>{g.icon}</span>
                {g.group}
                <span style={{ marginLeft: 'auto', opacity: .5 }}>⌄</span>
              </div>
              {g.items.map(i => (
                <div key={i.id} className={`hq-nav-item ${active === i.id ? 'on' : ''}`}>
                  · {i.label}
                </div>
              ))}
            </div>
          ))}
          <div style={{ flex: 1 }}></div>
          <div className="rule"></div>
          {SECONDARY.map(i => (
            <div key={i.id} className="hq-nav-item small-pad">
              <span style={{ marginRight: 8 }}>{i.icon}</span>{i.label}
            </div>
          ))}
        </aside>
        <main className="hq-main">
          <div className="hq-crumbs">
            {crumbs.map((c, i) => (
              <React.Fragment key={i}>
                <span className={i === crumbs.length - 1 ? 'on' : ''}>{c}</span>
                {i < crumbs.length - 1 && <span className="sep">/</span>}
              </React.Fragment>
            ))}
          </div>
          <div className="hq-content">{children}</div>
        </main>
      </div>
    </div>
  );
};

/* ── Sign-in (no chrome — pre-auth) ─────────────── */
const Signin = {
  title: 'Sign-in',
  subtitle: 'NextAuth v4 · Google SSO + email/password · @mrq.com only.',
  variations: [{
    id: 'signin', label: 'Centred card · SSO primary', width: 1280, height: 800,
    render: () => (<>
      <Boost>Pre-auth · no shell yet</Boost>
      <div className="signin-stage">
        <div className="card narrow">
          <div className="hq-brand-1" style={{ fontSize: 28 }}>HQ</div>
          <div className="hq-brand-2" style={{ marginBottom: 14 }}>MrQ Live · Admin</div>
          <div className="h h2">Sign in</div>
          <div className="body" style={{ marginBottom: 14 }}>@mrq.com only.</div>
          <div className="btn btn-primary" style={{ width: '100%' }}>Continue with Google</div>
          <div className="rule with-or"><span>or</span></div>
          <div className="lbl">Email</div><div className="input"></div>
          <div className="lbl">Password</div><div className="input"></div>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="small squig">Forgot password?</span>
            <div className="btn btn-soft">Sign in</div>
          </div>
        </div>
      </div>
      <Note>No HQ chrome until authenticated.</Note>
    </>),
  }],
};

/* ── Activation list ──────────────────── */
const ActList = {
  title: 'Activations · list',
  subtitle: 'Operations · Activations. Status pills, key counts, edit access for ADMIN.',
  variations: [{
    id: 'list', label: 'Table-first', width: 1280, height: 820,
    render: () => (<>
      <Boost>Default table · status as pill</Boost>
      <Shell active="activations" crumbs={['Admin', 'Activations']}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="h h2">Activations</div>
          <div className="btn btn-primary">+ New activation</div>
        </div>
        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          {['All', 'Live', 'Scheduled', 'Draft', 'Ended'].map((t, i) => (
            <span key={t} className={`pill ${i === 0 ? 'on' : ''}`}>{t}</span>
          ))}
          <div style={{ flex: 1 }}></div>
          <div className="input" style={{ width: 200, padding: '6px 10px' }}>🔍 search…</div>
        </div>
        <div className="sk sk-thin">
          <table className="tbl">
            <thead><tr>
              <th>Name</th><th>Slug</th><th>Status</th><th>Booths</th>
              <th>Verified</th><th>Pending</th><th>Window</th><th></th>
            </tr></thead>
            <tbody>
              {[
                ['Wembley title fight', 'wembley-fight', 'LIVE', 6, 137, 12, '04 May · 18:00–23:00'],
                ['Manchester Pride pass', 'mcr-pride', 'SCHEDULED', 4, 0, 0, '18 May · 14:00–22:00'],
                ['Brighton Beach experience', 'brighton-beach', 'DRAFT', 2, '—', '—', 'not set'],
                ['Edinburgh Fringe pass', 'fringe-25', 'ENDED', 8, 1842, 0, '02 Aug · 12:00–24:00'],
              ].map((r, i) => (
                <tr key={i}>
                  <td><b>{r[0]}</b></td>
                  <td><span className="mono">{r[1]}</span></td>
                  <td><span className={`pill p-${String(r[2]).toLowerCase()}`}>{r[2]}</span></td>
                  {r.slice(3).map((c, j) => <td key={j}>{c}</td>)}
                  <td className="squig">edit</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Shell>
      <Note>ADMIN sees edit · MEMBER doesn't.</Note>
    </>),
  }],
};

/* ── Builder · two-pane ──────────── */
const Builder = {
  title: 'Activation builder',
  subtitle: 'Two-pane: form on the left, always-visible mobile preview on the right.',
  variations: [{
    id: 'builder', label: 'Form + live preview', width: 1280, height: 920,
    render: () => (<>
      <Boost>Always-visible mobile preview · catches consent overflow live</Boost>
      <Shell active="activations" crumbs={['Admin', 'Activations', 'Wembley title fight']}>
        <div style={{ display: 'flex', gap: 20 }}>
          <div style={{ flex: 1.4 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="h h2">Wembley title fight</div>
              <div className="row" style={{ gap: 6 }}>
                <span className="btn btn-ghost">Cancel</span>
                <span className="btn btn-primary">Save</span>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 4 }}>
              <span className="pill p-draft">DRAFT</span>
              <span className="small" style={{ color: 'var(--ink-3)' }}>last edited 4m ago by ellie@mrq.com</span>
            </div>
            <div className="rule"></div>
            <div className="row" style={{ gap: 12 }}>
              <div style={{ flex: 1 }}><div className="lbl">Slug</div><div className="input"><span className="mono">mrqlive.co.uk/wembley-fight</span></div></div>
              <div style={{ flex: 1 }}><div className="lbl">Starts</div><div className="input">04 May · 18:00 BST</div></div>
              <div style={{ flex: 1 }}><div className="lbl">Ends</div><div className="input">04 May · 23:00 BST</div></div>
            </div>
            <div className="lbl">Hero image</div>
            <div className="sk sk-thin sk-dash" style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-3)' }}>drop image · 2:1 ratio</div>
            <div className="lbl">Marketing copy <span style={{ color: 'var(--ink-3)' }}>(loose Tiptap allowlist)</span></div>
            <div className="sk sk-thin">
              <div className="row" style={{ borderBottom: '1px dashed #d8d3c5', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 11 }}>B I U H1 H2 ¶ • 1. ↺ ↻ 🔗 🖼</div>
              <div style={{ padding: 12, height: 140 }}>
                <div className="h h3">Win tickets to the title fight</div>
                <div className="scrib long"></div><div className="scrib med"></div><div className="scrib long"></div>
              </div>
            </div>
            <div className="lbl">Consent notice <span style={{ color: 'var(--crit)' }}>(tight allowlist · ADMIN only)</span></div>
            <div className="sk sk-thin">
              <div className="row" style={{ borderBottom: '1px dashed #d8d3c5', padding: '4px 8px', fontFamily: 'var(--mono)', fontSize: 11 }}>B ¶ 🔗</div>
              <div style={{ padding: 12, height: 90 }}><div className="scrib long"></div><div className="scrib short"></div></div>
            </div>
            <div className="lbl">Booths</div>
            <div className="sk sk-thin" style={{ padding: 12 }}>
              {['main-entry', 'bar-1', 'bar-2', 'merch'].map((c, i) => (
                <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '6px 0', borderBottom: i < 3 ? '1px dashed #ebe7dc' : 'none' }}>
                  <span className="mono">{c}</span>
                  <div className="row" style={{ gap: 6 }}>
                    <span className="small">137 scans</span>
                    <span className="btn btn-soft" style={{ padding: '4px 10px' }}>QR ↓</span>
                  </div>
                </div>
              ))}
              <div className="btn btn-ghost" style={{ marginTop: 8 }}>+ Add booth</div>
            </div>
            <div className="rule"></div>
            <div className="row"><span className="check on"></span><div className="small" style={{ marginLeft: 8 }}>Legal approved <span style={{ color: 'var(--ink-3)' }}>· required to go LIVE · ADMIN only</span></div></div>
          </div>
          <div style={{ width: 280, position: 'sticky', top: 20 }}>
            <div className="lbl">PREVIEW · /wembley-fight</div>
            <div className="sk sk-thin" style={{ padding: 16, background: '#fafaf6' }}>
              <div className="phone" style={{ width: 220, margin: '0 auto', boxShadow: 'none' }}>
                <div className="status"><span>9:41</span><span>· · ·</span></div>
                <div className="body-area">
                  <div className="sk sk-soft" style={{ height: 70, marginBottom: 6 }}></div>
                  <div className="h h3">Win tickets to the title fight</div>
                  <div className="body">Pop your email in.</div>
                  <div className="input lg" style={{ marginTop: 8 }}></div>
                  <div className="btn btn-primary" style={{ width: '100%', marginTop: 8 }}>Send code</div>
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 6, justifyContent: 'center', marginTop: 8 }}>
              <span className="pill on">Mobile</span>
              <span className="pill">Desktop</span>
            </div>
          </div>
        </div>
      </Shell>
      <Note>Preview always-visible — feels like a dev tool, makes content overflow obvious.</Note>
    </>),
  }],
};

/* ── Live dashboard · KPI grid ─────── */
const Dashboard = {
  title: 'Live dashboard',
  subtitle: '4 KPI tiles + 60-min trend + per-booth split.',
  variations: [{
    id: 'dashboard', label: 'KPI grid', width: 1280, height: 820,
    render: () => (<>
      <Boost>KPI tiles · funnel sparkline · booth bars</Boost>
      <Shell active="activations" crumbs={['Admin', 'Activations', 'Wembley title fight', 'Dashboard']}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div><div className="lbl">DASHBOARD · LIVE</div><div className="h h2">Wembley title fight</div></div>
          <span className="pill p-live">● LIVE · 4h 12m left</span>
        </div>
        <div style={{ height: 14 }}></div>
        <div className="row" style={{ gap: 12 }}>
          {[
            { k: 'Verified', v: '137', sub: '+8 last 5m' },
            { k: 'Pending', v: '12', sub: 'avg 42s to verify' },
            { k: 'Scans', v: '321', sub: 'across 6 booths' },
            { k: 'Drop-off', v: '57%', sub: 'scan→verify' },
          ].map((t, i) => (
            <div key={i} className="sk sk-thin" style={{ flex: 1, padding: 14 }}>
              <div className="lbl">{t.k}</div>
              <div className="counter lg">{t.v}</div>
              <div className="small">{t.sub}</div>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 12, marginTop: 14, alignItems: 'stretch' }}>
          <div className="sk sk-thin" style={{ flex: 2, padding: 14 }}>
            <div className="lbl">Verifications · last 60m</div>
            <svg viewBox="0 0 400 100" style={{ width: '100%', height: 100 }}>
              <path d="M0,80 Q40,70 80,60 T160,40 T240,30 T320,28 T400,15" stroke="var(--accent)" strokeWidth="2" fill="none" strokeLinecap="round" />
              <path d="M0,80 Q40,70 80,60 T160,40 T240,30 T320,28 T400,15 L400,100 L0,100Z" fill="var(--accent)" opacity="0.12" />
            </svg>
          </div>
          <div className="sk sk-thin" style={{ flex: 1, padding: 14 }}>
            <div className="lbl">By booth</div>
            {['main-entry', 'bar-1', 'bar-2', 'merch'].map((b, i) => (
              <div key={i} className="row" style={{ justifyContent: 'space-between', padding: '4px 0' }}>
                <span className="mono small">{b}</span>
                <div style={{ flex: 1, height: 8, margin: '0 8px', background: '#eee', borderRadius: 2 }}>
                  <div style={{ width: `${[80, 60, 40, 20][i]}%`, height: '100%', background: 'var(--accent)', borderRadius: 2 }}></div>
                </div>
                <span className="mono small">{[42, 31, 21, 10][i]}</span>
              </div>
            ))}
          </div>
        </div>
      </Shell>
      <Note>Working KPIs first · TV mode comes later as a route param.</Note>
    </>),
  }],
};

/* ── Registrations · masked + filterable ─────── */
const Regs = {
  title: 'Registrations',
  subtitle: 'Streaming list. Email partly masked unless reveal is clicked (audited).',
  variations: [{
    id: 'registrations', label: 'Masked + filterable', width: 1280, height: 820,
    render: () => (<>
      <Boost>Mask + reveal · audit-logged on reveal</Boost>
      <Shell active="activations" crumbs={['Admin', 'Activations', 'Wembley title fight', 'Registrations']}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="h h2">Registrations · 137</div>
          <div className="row" style={{ gap: 6 }}>
            <span className="btn btn-ghost">Filters</span>
            <span className="btn btn-soft">CSV ↓</span>
          </div>
        </div>
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <span className="pill on">All</span>
          <span className="pill">Verified</span>
          <span className="pill">Pending</span>
          <span className="pill">Suppressed</span>
          <div style={{ flex: 1 }}></div>
          <div className="input" style={{ width: 220, padding: '6px 10px' }}>🔍 search email or hash</div>
        </div>
        <div className="sk sk-thin" style={{ marginTop: 10 }}>
          <table className="tbl">
            <thead><tr>
              <th>Verified at</th><th>Email</th><th>Booth</th><th>UTM</th><th>IP hash</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {[
                ['21:14', 'j***@email.com', 'main-entry', 'tiktok_summer', 'a3f1…', 'VERIFIED'],
                ['21:14', 'm***@gmail.com', 'bar-1', 'org', '7d2e…', 'VERIFIED'],
                ['21:13', 's***@hotmail.com', 'main-entry', 'tiktok', 'a3f1…', 'PENDING'],
                ['21:11', 'a***@gmail.com', 'main-entry', '—', 'b5e0…', 'EXPIRED'],
              ].map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{j === 5 ? <span className={`pill p-${c.toLowerCase()}`}>{c}</span> : c}</td>)}<td className="squig">reveal</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small" style={{ marginTop: 8, color: 'var(--ink-3)' }}>Reveal logs to audit with reason. Showing 4 of 137. <span className="squig">load more →</span></div>
      </Shell>
      <Note>Mask + reveal is the safer pattern · every reveal = an audit row.</Note>
    </>),
  }],
};

/* ── Status transition · modal + preflight ─────── */
const Trans = {
  title: 'Status transition',
  subtitle: 'Modal confirm with the inline preflight checklist baked in.',
  variations: [{
    id: 'transitions', label: 'Modal + preflight checklist', width: 1280, height: 820,
    render: () => (<>
      <Boost>Type-to-confirm + checklist all in one</Boost>
      <Shell active="activations" crumbs={['Admin', 'Activations', 'Wembley title fight']}>
        <div style={{ position: 'relative', minHeight: 600 }}>
          <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
            <div className="h h2">Wembley title fight</div>
            <div className="body">…activation form behind the modal…</div>
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: 520 }}>
              <div className="lbl">CONFIRM · TRANSITION</div>
              <div className="h h2" style={{ marginBottom: 6 }}>Go LIVE?</div>
              <div className="body">Once LIVE, <b>activation content & consent are frozen</b>. Booths can be added but text can't change.</div>
              <div className="rule"></div>
              <div className="lbl">PRE-FLIGHT · GO LIVE</div>
              {[
                ['Legal approved', true, 'jamie@mrq.com · 12m ago'],
                ['Marketing copy ≥ 1 paragraph', true, '4 paragraphs'],
                ['Consent notice ≥ 1 paragraph', true, '2 paragraphs'],
                ['At least 1 booth', true, '4 booths configured'],
                ['Resend domain verified', true, 'noreply@mrqlive.co.uk'],
                ['Suppression list synced', true, '12 entries · 4m ago'],
              ].map((c, i) => (
                <div key={i} className="row" style={{ alignItems: 'flex-start', padding: '4px 0', borderBottom: i < 5 ? '1px dashed #ebe7dc' : 'none' }}>
                  <span className={`check ${c[1] ? 'on' : ''}`}></span>
                  <div style={{ marginLeft: 8, flex: 1 }}>
                    <div className="small">{c[0]}</div>
                    <div className="small" style={{ color: 'var(--ink-3)' }}>{c[2]}</div>
                  </div>
                </div>
              ))}
              <div className="rule"></div>
              <div className="lbl">Type the slug to confirm</div>
              <div className="input">wembley-fight</div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 14 }}>
                <span className="btn btn-ghost">Cancel</span>
                <span className="btn btn-primary">Go LIVE in 8m</span>
              </div>
            </div>
          </div>
        </div>
      </Shell>
      <Note>Preflight inline · slug-typing protects against fat-fingers · audit-logged.</Note>
    </>),
  }],
};

/* ── Users & roles ─────────────── */
const Users = {
  title: 'Users & Roles',
  subtitle: 'Invite/list/role-change for ADMIN/MEMBER. Tied to invite-token HMAC class.',
  variations: [{
    id: 'users', label: 'Table — invite by row', width: 1280, height: 820,
    render: () => (<>
      <Boost>Role pill is a dropdown for ADMIN</Boost>
      <Shell active="users" crumbs={['Admin', 'Users & Roles']}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <div className="h h2">Team · 8 active</div>
          <div className="btn btn-primary">+ Invite</div>
        </div>
        <div className="sk sk-thin" style={{ marginTop: 14 }}>
          <table className="tbl">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last seen</th><th>2FA</th><th></th></tr></thead>
            <tbody>
              {[
                ['Jamie Hill', 'jamie@mrq.com', 'ADMIN', '2m ago', '✓'],
                ['Ellie Park', 'ellie@mrq.com', 'ADMIN', '4h ago', '✓'],
                ['Morgan Lee', 'morgan@mrq.com', 'MEMBER', '2d ago', '✓'],
                ['Inv: tom@mrq.com', '—', 'MEMBER', 'pending invite', '—'],
              ].map((r, i) => (
                <tr key={i}>
                  <td><b>{r[0]}</b></td><td>{r[1]}</td>
                  <td><span className={`pill ${r[2] === 'ADMIN' ? 'p-live' : ''}`}>{r[2]} ▾</span></td>
                  <td>{r[3]}</td><td>{r[4]}</td><td className="squig small">⋯</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Shell>
      <Note>Click role to demote/promote (separate confirm dialog).</Note>
    </>),
  }],
};

/* ── Audit log ─────────────── */
const Audit = {
  title: 'Audit Log',
  subtitle: 'Append-only mutation history. Filter chips + queryable table.',
  variations: [{
    id: 'audit', label: 'Table with filters', width: 1280, height: 820,
    render: () => (<>
      <Boost>Default · table by recency · filter chips</Boost>
      <Shell active="audit" crumbs={['Admin', 'Audit Log']}>
        <div className="h h2">Audit · last 7 days</div>
        <div className="row" style={{ gap: 6, marginTop: 10 }}>
          {['All', 'Activation', 'User', 'Legal', 'Erasure', 'Reveal'].map((t, i) => (
            <span key={t} className={`pill ${i === 0 ? 'on' : ''}`}>{t}</span>
          ))}
          <div style={{ flex: 1 }}></div>
          <div className="input" style={{ width: 200, padding: '6px 10px' }}>🔍 search…</div>
        </div>
        <div className="sk sk-thin" style={{ marginTop: 12 }}>
          <table className="tbl">
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Diff</th></tr></thead>
            <tbody>
              {[
                ['21:14', 'jamie@mrq.com', 'STATUS_TRANSITION', 'wembley-fight', 'SCHEDULED → LIVE'],
                ['21:02', 'jamie@mrq.com', 'LEGAL_APPROVED', 'wembley-fight', 'false → true'],
                ['20:55', 'ellie@mrq.com', 'EDIT', 'wembley-fight', 'consentNotice (-2/+4 lines)'],
                ['20:40', 'morgan@mrq.com', 'EMAIL_REVEAL', 'reg #4421', 'reason: DSAR'],
                ['20:14', 'jamie@mrq.com', 'INVITE', 'tom@mrq.com', 'role: MEMBER'],
              ].map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j} className={j === 4 ? 'mono small' : ''}>{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </Shell>
      <Note>Clear · queryable · CSV-exportable.</Note>
    </>),
  }],
};

/* ── DSAR / erasure · destructive confirm ─────── */
const Comp = {
  title: 'Erasure request',
  subtitle: 'Destructive confirm with reason + type-to-confirm. DSAR is the sibling read-only flow.',
  variations: [{
    id: 'compliance', label: 'Erasure modal · type-to-confirm', width: 1280, height: 820,
    render: () => (<>
      <Boost>ERASE typed · reason logged · suppression added</Boost>
      <Shell active="erasure" crumbs={['Admin', 'Compliance', 'Erasure Requests']}>
        <div style={{ position: 'relative', minHeight: 600 }}>
          <div style={{ opacity: 0.45, pointerEvents: 'none' }}>
            <div className="h h2">Erasure requests</div>
            <div className="body">…queue behind the modal…</div>
          </div>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: 500 }}>
              <div className="lbl" style={{ color: 'var(--crit)' }}>DESTRUCTIVE</div>
              <div className="h h2">Erase 1 record</div>
              <div className="body">Email · <span className="mono">jamie@example.co.uk</span></div>
              <div className="rule"></div>
              <div className="small">This will:</div>
              <div className="small" style={{ lineHeight: 1.8 }}>· delete the registration row<br />· add the email's HMAC hash to <b>suppression</b><br />· write an erasure entry to audit (visible)<br />· remove from any future CSV export</div>
              <div className="rule"></div>
              <div className="lbl">Reason (required)</div>
              <div className="input">User requested · ticket #2401</div>
              <div className="lbl">Type ERASE to confirm</div>
              <div className="input">ERASE</div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 14 }}>
                <span className="btn btn-ghost">Cancel</span>
                <span className="btn btn-primary" style={{ background: 'var(--crit)' }}>Erase</span>
              </div>
            </div>
          </div>
        </div>
      </Shell>
      <Note>Friction + audit + suppression · GDPR-defensible.</Note>
    </>),
  }],
};

window.AdminScreens = {
  signin: Signin,
  list: ActList,
  builder: Builder,
  dashboard: Dashboard,
  registrations: Regs,
  transitions: Trans,
  users: Users,
  audit: Audit,
  compliance: Comp,
};
