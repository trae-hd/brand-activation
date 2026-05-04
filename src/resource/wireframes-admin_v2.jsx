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
            <div key={i.id} className={`hq-nav-item small-pad ${active === i.id ? 'on' : ''}`} style={ active === i.id ? { paddingLeft: 11 } : null }>
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

/* ── Settings · workspace + branding + integrations ─────── */
const Settings = {
  title: 'Settings',
  subtitle: "Workspace-level admin: brand defaults (carries into new activations), email sender identity, integrations, danger zone.",
  variations: [
    {
      id: 'settings-tabs', label: '✓ SELECTED · Tabbed · profile · workspace · brand · integrations', width: 1180, height: 760,
      render: () => (<>
        <Boost>Top-tab layout · matches existing HQ density</Boost>
        <Shell active="settings" crumbs={['Settings', 'Workspace']}>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
            <div>
              <div className="h h1">Settings</div>
              <div className="body">MrQ Live · workspace</div>
            </div>
            <span className="pill">SAVED · 2 min ago</span>
          </div>
          <div className="row" style={{ gap: 4, marginTop: 18, borderBottom: '1.5px solid var(--line)', paddingBottom: 0 }}>
            {['Profile', 'Workspace', 'Brand defaults', 'Email sender', 'Integrations', 'Danger zone'].map((t, i) => (
              <div key={t} className="btn btn-ghost" style={{ borderRadius: '4px 4px 0 0', borderBottom: i === 1 ? '3px solid var(--accent)' : '2px solid transparent', background: i === 1 ? 'var(--paper)' : 'transparent', fontWeight: i === 1 ? 700 : 400 }}>{t}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 18 }}>
            <div>
              <div className="lbl">WORKSPACE NAME</div>
              <div className="input">MrQ Live</div>
              <div className="lbl">DEFAULT TIMEZONE</div>
              <div className="input">Europe/London</div>
              <div className="lbl">DEFAULT OTP TTL (min)</div>
              <div className="input">10</div>
              <div className="lbl">DEFAULT GEOFENCE</div>
              <div className="input">UK only · 5 ip per email per hour</div>
            </div>
            <div>
              <div className="lbl">DATA RETENTION (DAYS)</div>
              <div className="input">90</div>
              <div className="small" style={{ color: 'var(--ink-3)' }}>Registrations auto-purged after this — emails hashed to suppression.</div>
              <div className="lbl">REQUIRE 2FA FOR ADMINS</div>
              <div className="row" style={{ gap: 8 }}><span className="check on"></span><span className="small">Enforced</span></div>
              <div className="lbl">SESSION TIMEOUT</div>
              <div className="input">8 hours</div>
            </div>
          </div>
          <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 22, borderTop: '1.5px dashed var(--ink-3)', paddingTop: 14 }}>
            <span className="btn btn-ghost">Discard</span>
            <span className="btn btn-primary">Save changes</span>
          </div>
        </Shell>
        <Note>Tabbed = familiar, scales to new sections. Workspace tab is the most-used — start here.</Note>
      </>),
    },
    {
      id: 'settings-sectioned', label: 'Single scroll · sectioned cards', width: 1180, height: 900,
      render: () => (<>
        <Boost>One long page · scannable · GitHub-style</Boost>
        <Shell active="settings" crumbs={['Settings']}>
          <div className="h h1">Settings</div>
          <div className="body" style={{ marginBottom: 18 }}>Everything workspace-wide. Per-activation overrides live in the builder.</div>

          {[
            { t: 'Profile', d: 'Your account · name, email, password, 2FA' },
            { t: 'Workspace', d: 'Name, timezone, retention, session policy' },
            { t: 'Brand defaults', d: 'Logo, colours, fonts — pre-fills new activations' },
            { t: 'Email sender', d: 'From address · DKIM · SendGrid template ids' },
            { t: 'Integrations', d: 'Slack alerts · Webhook URLs · API keys' },
          ].map(s => (
            <div key={s.t} className="sk" style={{ marginBottom: 10, padding: '14px 18px' }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="h h3">{s.t}</div>
                  <div className="small" style={{ color: 'var(--ink-3)' }}>{s.d}</div>
                </div>
                <span className="btn btn-ghost">Configure →</span>
              </div>
            </div>
          ))}

          <div className="sk sk-warn" style={{ marginTop: 18, padding: '14px 18px' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div>
                <div className="h h3" style={{ color: 'var(--crit)' }}>Danger zone</div>
                <div className="small">Transfer ownership · purge workspace · revoke all sessions</div>
              </div>
              <span className="btn btn-ghost" style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}>Open →</span>
            </div>
          </div>
        </Shell>
        <Note>Scroll layout makes coverage obvious — every concern has a card. Easy to add new sections without re-shuffling tabs.</Note>
      </>),
    },
    {
      id: 'settings-split', label: 'Split nav · category list + detail', width: 1180, height: 760,
      render: () => (<>
        <Boost>Linear-style settings · sticky category nav</Boost>
        <Shell active="settings" crumbs={['Settings', 'Brand defaults']}>
          <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 18 }}>
            <aside>
              <div className="lbl">ACCOUNT</div>
              <div className="hq-nav-item small-pad">Profile</div>
              <div className="hq-nav-item small-pad">Notifications</div>
              <div className="lbl" style={{ marginTop: 12 }}>WORKSPACE</div>
              <div className="hq-nav-item small-pad">General</div>
              <div className="hq-nav-item small-pad on" style={{ paddingLeft: 11 }}>Brand defaults</div>
              <div className="hq-nav-item small-pad">Email sender</div>
              <div className="hq-nav-item small-pad">Integrations</div>
              <div className="hq-nav-item small-pad">Members</div>
              <div className="lbl" style={{ marginTop: 12 }}>SECURITY</div>
              <div className="hq-nav-item small-pad">Sessions</div>
              <div className="hq-nav-item small-pad">Audit retention</div>
              <div className="hq-nav-item small-pad" style={{ color: 'var(--crit)' }}>Danger zone</div>
            </aside>
            <div>
              <div className="h h1">Brand defaults</div>
              <div className="body" style={{ marginBottom: 14 }}>Used as starting point for new activations. Per-activation overrides live in the builder.</div>
              <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'center' }}>
                <div className="lbl">LOGO</div>
                <div className="row" style={{ gap: 10 }}>
                  <div className="sk sk-soft" style={{ width: 80, height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span className="lbl" style={{ marginTop: 0 }}>SVG</span></div>
                  <div><span className="btn btn-ghost">Replace</span><div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>SVG · 200×80 · 50KB max</div></div>
                </div>
                <div className="lbl">PRIMARY</div>
                <div className="row" style={{ gap: 6 }}>
                  <div className="sk" style={{ width: 28, height: 28, padding: 0, background: '#3B5BFF' }}></div>
                  <div className="input" style={{ flex: 1, marginBottom: 0 }}>#3B5BFF</div>
                </div>
                <div className="lbl">ACCENT</div>
                <div className="row" style={{ gap: 6 }}>
                  <div className="sk" style={{ width: 28, height: 28, padding: 0, background: '#FFB800' }}></div>
                  <div className="input" style={{ flex: 1, marginBottom: 0 }}>#FFB800</div>
                </div>
                <div className="lbl">DISPLAY FONT</div>
                <div className="input" style={{ marginBottom: 0 }}>Archivo Black ▾</div>
                <div className="lbl">BODY FONT</div>
                <div className="input" style={{ marginBottom: 0 }}>Inter ▾</div>
              </div>

              <div className="lbl" style={{ marginTop: 18 }}>LIVE PREVIEW</div>
              <div className="sk sk-soft" style={{ height: 100, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="h h2" style={{ color: '#3B5BFF' }}>Win tickets — drop your email</div>
                  <div className="small">Preview reflects all values above.</div>
                </div>
                <div className="btn btn-primary">Continue</div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 14 }}>
                <span className="btn btn-ghost">Discard</span>
                <span className="btn btn-primary">Save</span>
              </div>
            </div>
          </div>
        </Shell>
        <Note>Best for power users · clearest IA · scales to dozens of sub-pages without clutter.</Note>
      </>),
    },
    {
      id: 'settings-cards', label: 'Hub · jump-to cards', width: 1180, height: 760,
      render: () => (<>
        <Boost>Landing-style hub · 6 big cards · for non-technical operators</Boost>
        <Shell active="settings" crumbs={['Settings']}>
          <div className="h h1">Settings</div>
          <div className="body" style={{ marginBottom: 22 }}>What do you need to change?</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {[
              { i: '👤', t: 'Profile', d: 'Your name, password, 2FA' },
              { i: '🏢', t: 'Workspace', d: 'Timezone · retention · sessions' },
              { i: '🎨', t: 'Brand defaults', d: 'Logo · colours · fonts' },
              { i: '✉️', t: 'Email sender', d: 'From-address · DKIM · templates' },
              { i: '🔌', t: 'Integrations', d: 'Slack · webhooks · API keys' },
              { i: '👥', t: 'Members', d: 'Invite · roles · revoke' },
            ].map(c => (
              <div key={c.t} className="sk" style={{ padding: 18, cursor: 'pointer' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>{c.i}</div>
                <div className="h h3">{c.t}</div>
                <div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>{c.d}</div>
                <div className="small squig" style={{ marginTop: 12 }}>Open →</div>
              </div>
            ))}
          </div>
          <div style={{ height: 22 }}></div>
          <div className="sk sk-warn" style={{ padding: 14 }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 22 }}>⚠</span>
                <div>
                  <div className="h h3" style={{ color: 'var(--crit)' }}>Danger zone</div>
                  <div className="small">Transfer · purge · revoke all sessions</div>
                </div>
              </div>
              <span className="btn btn-ghost" style={{ borderColor: 'var(--crit)', color: 'var(--crit)' }}>Open →</span>
            </div>
          </div>
        </Shell>
        <Note>Friendly, low-density. Worth it if non-technical brand managers are the primary audience.</Note>
      </>),
    },
  ],
};

/* ── Feedback · single form ─────────────────── */
const Feedback = {
  title: 'Feedback',
  subtitle: "A FORM the operator fills out — bug, idea, or rant. Posts into the team's intake (Slack / Linear / GH Issues — TBD).",
  variations: [
    {
      id: 'feedback-form', label: '✓ SELECTED · Long-form · type-rate-attach-submit', width: 1180, height: 800,
      render: () => (<>
        <Boost>Single column · plenty of room to vent</Boost>
        <Shell active="feedback" crumbs={['Feedback']}>
          <div style={{ maxWidth: 640 }}>
            <div className="h h1">Got something to say?</div>
            <div className="body" style={{ marginBottom: 18 }}>Bugs, gripes, "wouldn't it be cool if…" — all welcome. Goes straight to the team.</div>

            <div className="lbl">TYPE</div>
            <div className="row" style={{ gap: 8, marginBottom: 14 }}>
              {['🐛 Bug', '💡 Idea', '😤 Pain', '🙌 Praise'].map((t, i) => (
                <div key={t} className={`btn ${i === 0 ? 'btn-soft' : 'btn-ghost'}`}>{t}</div>
              ))}
            </div>

            <div className="lbl">SUBJECT</div>
            <div className="input">OTP email took 4 minutes at the booth tonight</div>

            <div className="lbl">WHAT HAPPENED?</div>
            <div className="sk sk-soft" style={{ padding: 12, minHeight: 110 }}>
              <div className="scrib long"></div><div className="scrib long"></div><div className="scrib med"></div>
              <div className="scrib long"></div><div className="scrib short"></div>
            </div>

            <div className="lbl">SEVERITY</div>
            <div className="row" style={{ gap: 10, marginBottom: 14 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} className="sk" style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', background: n === 4 ? '#fef4a8' : 'var(--paper)' }}>{n}</div>
              ))}
              <div className="small" style={{ color: 'var(--ink-3)' }}>1 = nit · 5 = on fire</div>
            </div>

            <div className="lbl">SCREENSHOT (optional)</div>
            <div className="sk sk-dash" style={{ padding: 22, textAlign: 'center', color: 'var(--ink-3)' }}>
              <div className="small">Drop a screenshot or paste from clipboard</div>
              <div className="lbl" style={{ marginTop: 4 }}>PNG · JPG · 5MB</div>
            </div>

            <div className="row" style={{ alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
              <span className="check on"></span>
              <div className="small">Attach context: my email + URL + browser. Helps us debug.</div>
            </div>

            <div className="row" style={{ justifyContent: 'space-between', marginTop: 22 }}>
              <span className="small" style={{ color: 'var(--ink-3)' }}>Posts to <u>#mrq-live-feedback</u> · auto-creates Linear ticket if SEV ≥ 4</span>
              <div className="row" style={{ gap: 6 }}>
                <span className="btn btn-ghost">Cancel</span>
                <span className="btn btn-primary">Send feedback →</span>
              </div>
            </div>
          </div>
        </Shell>
        <Note>One screen, no tabs. Severity is the most useful field — it routes the ticket.</Note>
      </>),
    },
    {
      id: 'feedback-quick', label: 'Quick rating · one-tap NPS + box', width: 1180, height: 700,
      render: () => (<>
        <Boost>Low friction · NPS first · type if you want</Boost>
        <Shell active="feedback" crumbs={['Feedback']}>
          <div style={{ maxWidth: 720, margin: '40px auto' }}>
            <div className="h h1" style={{ textAlign: 'center' }}>How's MrQ Live treating you?</div>
            <div className="body" style={{ textAlign: 'center', marginBottom: 22 }}>Anonymous unless you tick the box at the bottom.</div>

            <div className="row" style={{ justifyContent: 'center', gap: 6, marginBottom: 6 }}>
              {Array.from({ length: 11 }).map((_, n) => (
                <div key={n} className="sk" style={{ width: 44, height: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', background: n === 8 ? 'var(--accent)' : 'var(--paper)', color: n === 8 ? '#fff' : 'var(--ink)', fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, cursor: 'pointer' }}>{n}</div>
              ))}
            </div>
            <div className="row" style={{ justifyContent: 'space-between', maxWidth: 540, margin: '0 auto', color: 'var(--ink-3)' }}>
              <span className="small">Not a chance</span>
              <span className="small">Hell yes</span>
            </div>

            <div style={{ height: 28 }}></div>
            <div className="lbl">WHAT'S THE ONE THING WE SHOULD FIX?</div>
            <div className="sk sk-soft" style={{ padding: 12, minHeight: 90 }}>
              <div className="scrib long"></div><div className="scrib med"></div>
            </div>

            <div className="row" style={{ alignItems: 'flex-start', gap: 8, marginTop: 12 }}>
              <span className="check"></span>
              <div className="small">OK to follow up with me · jamie@mrq.com</div>
            </div>

            <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 18 }}>
              <span className="btn btn-primary">Send →</span>
            </div>
          </div>
        </Shell>
        <Note>Best for ongoing pulse-checks. Bury the deep form behind "more details" link.</Note>
      </>),
    },
    {
      id: 'feedback-split', label: 'Form + recent submissions feed', width: 1180, height: 800,
      render: () => (<>
        <Boost>Form + your recent submissions · status visible</Boost>
        <Shell active="feedback" crumbs={['Feedback']}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 22 }}>
            <div>
              <div className="h h1">Send feedback</div>
              <div className="body" style={{ marginBottom: 14 }}>Goes to the product team · expect a reply within 2 business days.</div>
              <div className="lbl">TYPE</div>
              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                {['Bug', 'Idea', 'Question', 'Other'].map((t, i) => (<span key={t} className={`pill ${i === 1 ? 'on' : ''}`}>{t}</span>))}
              </div>
              <div className="lbl">SUBJECT</div>
              <div className="input">Idea: bulk-import registrations from CSV</div>
              <div className="lbl">DETAILS</div>
              <div className="sk sk-soft" style={{ padding: 12, minHeight: 100 }}>
                <div className="scrib long"></div><div className="scrib long"></div><div className="scrib med"></div>
              </div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
                <span className="btn btn-ghost">Save draft</span>
                <span className="btn btn-primary">Send →</span>
              </div>
            </div>
            <div>
              <div className="h h2">Your recent</div>
              <div className="rule"></div>
              {[
                { t: 'OTP email slow at booth', s: 'IN PROGRESS', c: 'p-pending' },
                { t: 'Add Spanish copy preset', s: 'TRIAGED', c: 'p-scheduled' },
                { t: 'Wrong status pill colour', s: 'SHIPPED', c: 'p-verified' },
                { t: 'CSV export missing UTM', s: "WON'T FIX", c: 'p-ended' },
              ].map(r => (
                <div key={r.t} className="sk sk-thin" style={{ marginBottom: 8, padding: 10 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <div className="body" style={{ fontWeight: 600 }}>{r.t}</div>
                    <span className={`pill ${r.c}`}>{r.s}</span>
                  </div>
                  <div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>2 weeks ago · 3 replies</div>
                </div>
              ))}
              <div className="small squig" style={{ textAlign: 'center', marginTop: 10 }}>See all →</div>
            </div>
          </div>
        </Shell>
        <Note>Closes the loop — operators see status of past requests · reduces "did you get my message?" pings.</Note>
      </>),
    },
    {
      id: 'feedback-modal', label: 'Inline modal · launched from anywhere', width: 1180, height: 760,
      render: () => (<>
        <Boost>Modal · accessible from any page via "Feedback" sidebar item</Boost>
        <Shell active="feedback" crumbs={['Activations']}>
          <div className="h h1">Activations</div>
          <div className="body">List of activations, dimmed because the feedback modal is open over the top.</div>
          <div className="sk sk-soft" style={{ height: 280, marginTop: 18, opacity: .35 }}></div>

          {/* modal */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(26,26,26,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="card" style={{ width: 460 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="h h2">Send feedback</div>
                <span className="btn btn-ghost" style={{ padding: '2px 8px' }}>×</span>
              </div>
              <div className="rule"></div>
              <div className="lbl">TYPE</div>
              <div className="row" style={{ gap: 6, marginBottom: 10 }}>
                {['Bug', 'Idea', 'Other'].map((t, i) => <span key={t} className={`pill ${i === 0 ? 'on' : ''}`}>{t}</span>)}
              </div>
              <div className="lbl">WHAT'S UP?</div>
              <div className="sk sk-soft" style={{ padding: 12, minHeight: 110 }}>
                <div className="scrib long"></div><div className="scrib med"></div>
              </div>
              <div className="small" style={{ color: 'var(--ink-3)', marginTop: 8 }}>We auto-attach: current page · your email · browser.</div>
              <div className="row" style={{ justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
                <span className="btn btn-ghost">Cancel</span>
                <span className="btn btn-primary">Send →</span>
              </div>
            </div>
          </div>
        </Shell>
        <Note>Lowest friction — never leaves the page · context auto-attached · best for quick bug reports.</Note>
      </>),
    },
  ],
};

/* ── Support · help & contact ─────────────────── */
const Support = {
  title: 'Support',
  subtitle: "Help docs, contact options, status. Triggered from the sidebar 'Help' button. Self-serve first.",
  variations: [
    {
      id: 'support-hub', label: '✓ SELECTED · Hub · search · top articles · email-only contact', width: 1180, height: 800,
      render: () => (<>
        <Boost>Intercom-style help centre · search-led</Boost>
        <Shell active="help" crumbs={['Support']}>
          <div style={{ textAlign: 'center', maxWidth: 720, margin: '20px auto 30px' }}>
            <div className="h h1" style={{ fontSize: 36 }}>How can we help?</div>
            <div className="body" style={{ marginTop: 6 }}>Most answers live in the docs — try a search.</div>
            <div className="sk" style={{ marginTop: 18, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 18 }}>🔍</span>
              <span className="body" style={{ flex: 1, color: 'var(--ink-3)' }}>How do I publish an activation?</span>
              <span className="pill">⌘K</span>
            </div>
          </div>

          <div className="lbl">POPULAR</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
            {[
              { c: 'Getting started', n: 8, t: 'Build your first activation in 5 min' },
              { c: 'Builder', n: 12, t: 'Geofencing · throttling · OTP TTL' },
              { c: 'Compliance', n: 6, t: 'GDPR · DSAR · erasure flow' },
              { c: 'Admin', n: 5, t: 'Inviting your team · roles · 2FA' },
              { c: 'Branding', n: 4, t: 'Brand defaults vs activation overrides' },
              { c: 'Integrations', n: 3, t: 'Slack alerts · webhooks · API keys' },
            ].map(c => (
              <div key={c.t} className="sk" style={{ padding: 14, cursor: 'pointer' }}>
                <div className="lbl" style={{ marginTop: 0 }}>{c.c} · {c.n} ARTICLES</div>
                <div className="h h3" style={{ marginTop: 4 }}>{c.t}</div>
                <div className="small squig" style={{ marginTop: 8, color: 'var(--accent)' }}>Read →</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 26 }}>
            <div className="sk" style={{ padding: 14 }}>
              <div className="row" style={{ gap: 10 }}>
                <span style={{ fontSize: 22 }}>✉</span>
                <div style={{ flex: 1 }}>
                  <div className="h h3">Email support</div>
                  <div className="small" style={{ color: 'var(--ink-3)' }}>live-support@mrq.com · reply within 1 business day</div>
                </div>
                <span className="btn btn-primary">Compose →</span>
              </div>
            </div>
          </div>
        </Shell>
        <Note>Self-serve first, contact second. Inline chat keeps the user in the page — best for SaaS feel.</Note>
      </>),
    },
    {
      id: 'support-doc', label: 'Sidebar TOC · article view', width: 1180, height: 800,
      render: () => (<>
        <Boost>Doc reader · TOC + article · for known issues</Boost>
        <Shell active="help" crumbs={['Support', 'Builder', 'Geofencing']}>
          <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 200px', gap: 22 }}>
            <aside>
              <div className="lbl">GETTING STARTED</div>
              <div className="hq-nav-item small-pad">Quickstart</div>
              <div className="hq-nav-item small-pad">Roles & access</div>
              <div className="lbl" style={{ marginTop: 12 }}>BUILDER</div>
              <div className="hq-nav-item small-pad">Form fields</div>
              <div className="hq-nav-item small-pad on" style={{ paddingLeft: 11 }}>Geofencing</div>
              <div className="hq-nav-item small-pad">Throttling</div>
              <div className="hq-nav-item small-pad">OTP TTL</div>
              <div className="lbl" style={{ marginTop: 12 }}>COMPLIANCE</div>
              <div className="hq-nav-item small-pad">DSAR</div>
              <div className="hq-nav-item small-pad">Erasure</div>
              <div className="hq-nav-item small-pad">Audit log</div>
            </aside>
            <article>
              <div className="lbl">BUILDER · GEOFENCING</div>
              <div className="h h1">Geofencing your activation</div>
              <div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>Updated 2 weeks ago · 3 min read</div>
              <div className="rule"></div>
              <div className="body">Geofencing limits who can enter the activation, by IP country or by GPS radius.</div>
              <div className="scrib long"></div><div className="scrib long"></div><div className="scrib med"></div>
              <div className="h h3" style={{ marginTop: 14 }}>Choosing a strategy</div>
              <div className="scrib long"></div><div className="scrib long"></div><div className="scrib short"></div>
              <div className="sk sk-soft" style={{ padding: 12, marginTop: 12 }}>
                <div className="lbl" style={{ marginTop: 0 }}>EXAMPLE · UK ONLY</div>
                <div className="mono" style={{ marginTop: 4 }}>geofence: {`{ country: ['GB'] }`}</div>
              </div>
              <div className="rule"></div>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div className="small">Was this helpful?</div>
                <div className="row" style={{ gap: 6 }}>
                  <span className="btn btn-ghost">👍</span>
                  <span className="btn btn-ghost">👎</span>
                </div>
              </div>
            </article>
            <aside>
              <div className="lbl">ON THIS PAGE</div>
              <div className="small" style={{ marginTop: 6, lineHeight: 1.8 }}>· What it does<br />· Choosing a strategy<br />· UK example<br />· Common pitfalls</div>
              <div className="rule"></div>
              <div className="lbl">RELATED</div>
              <div className="small squig" style={{ display: 'block', marginTop: 4 }}>Throttling rules</div>
              <div className="small squig" style={{ display: 'block', marginTop: 4 }}>OTP TTL</div>
            </aside>
          </div>
        </Shell>
        <Note>3-column doc reader · best when you have lots of content. Heavier to maintain — needs a docs site.</Note>
      </>),
    },
    {
      id: 'support-status', label: 'Status + contact-only', width: 1180, height: 700,
      render: () => (<>
        <Boost>Honest · "we're a small team" · status + contact</Boost>
        <Shell active="help" crumbs={['Support']}>
          <div style={{ maxWidth: 720, margin: '20px auto' }}>
            <div className="h h1">Need a hand?</div>
            <div className="body" style={{ marginBottom: 18 }}>We're a small team — fastest path is email.</div>

            <div className="sk" style={{ padding: 16 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <div className="lbl" style={{ marginTop: 0 }}>SYSTEM STATUS</div>
                  <div className="row" style={{ gap: 8, marginTop: 4 }}>
                    <span className="check on" style={{ width: 12, height: 12, background: 'var(--ok)', borderColor: 'var(--ok)' }}></span>
                    <div className="h h3">All systems operational</div>
                  </div>
                  <div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>API · OTP delivery · CSV export · uptime 99.97% / 30d</div>
                </div>
                <span className="btn btn-ghost">status.mrq.com →</span>
              </div>
            </div>

            <div style={{ height: 14 }}></div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="sk" style={{ padding: 16 }}>
                <div className="h h3">Email</div>
                <div className="mono" style={{ marginTop: 6 }}>live-support@mrq.com</div>
                <div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>Reply within 1 business day · 24/7 if SEV1</div>
              </div>
              <div className="sk" style={{ padding: 16 }}>
                <div className="h h3">Slack Connect</div>
                <div className="small" style={{ marginTop: 6 }}>For workspaces on Pro+. We'll add you to a shared channel.</div>
                <div className="small squig" style={{ marginTop: 6 }}>Request access →</div>
              </div>
            </div>

            <div className="rule" style={{ marginTop: 22 }}></div>
            <div className="lbl">USEFUL LINKS</div>
            <div className="row" style={{ gap: 12, marginTop: 6 }}>
              <span className="small squig">Docs</span>
              <span className="small squig">Changelog</span>
              <span className="small squig">API reference</span>
              <span className="small squig">Privacy & DPA</span>
            </div>
          </div>
        </Shell>
        <Note>Lean. No fake "AI assistant" · trust through honesty. Status block doubles as the first answer to "is it me?"</Note>
      </>),
    },
    {
      id: 'support-context', label: 'Contextual · pinned to current page', width: 1180, height: 760,
      render: () => (<>
        <Boost>Drawer · auto-shows articles for the page you came from</Boost>
        <Shell active="help" crumbs={['Activations', 'Builder']}>
          <div className="h h1">Activation builder</div>
          <div className="body">…page content dimmed behind the help drawer.</div>
          <div className="sk sk-soft" style={{ height: 320, marginTop: 14, opacity: .35 }}></div>

          {/* drawer */}
          <div style={{ position: 'absolute', top: 90, right: 24, bottom: 24, width: 380, background: 'var(--paper)', border: '2px solid var(--line)', borderRadius: 6, boxShadow: '4px 4px 0 var(--line)', padding: 16, overflow: 'hidden' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="h h2">Help · Builder</div>
              <span className="btn btn-ghost" style={{ padding: '2px 8px' }}>×</span>
            </div>
            <div className="small" style={{ color: 'var(--ink-3)', marginTop: 4 }}>Articles for the page you're on.</div>
            <div className="rule"></div>
            <div className="lbl">RELEVANT</div>
            {[
              'Form fields · what each one does',
              'Geofencing 101',
              'Throttling rules · per-IP, per-email',
              'OTP TTL · pick a sensible window',
              'Publishing — dry-run vs live',
            ].map(t => (
              <div key={t} className="sk sk-thin" style={{ marginTop: 6, padding: '8px 10px', cursor: 'pointer' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <div className="body">{t}</div>
                  <span style={{ color: 'var(--ink-3)' }}>→</span>
                </div>
              </div>
            ))}
            <div className="rule"></div>
            <div className="lbl">STILL STUCK?</div>
            <div className="row" style={{ gap: 6, marginTop: 6 }}>
              <span className="btn btn-soft" style={{ flex: 1 }}>Chat</span>
              <span className="btn btn-ghost" style={{ flex: 1 }}>Email</span>
            </div>
          </div>
        </Shell>
        <Note>Best DX — surfaces articles by route. Implementation: docs tagged with route patterns.</Note>
      </>),
    },
  ],
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
  settings: Settings,
  feedback: Feedback,
  support: Support,
};
