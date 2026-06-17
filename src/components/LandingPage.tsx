'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

/* ── Theme color sets ── */
const LIGHT_C = {
  bg: '#ffffff',
  navy: '#002868',
  navyDim: 'rgba(0,40,104,0.07)',
  navyBorder: 'rgba(0,40,104,0.15)',
  orange: '#BF5700',
  orangeDim: 'rgba(191,87,0,0.08)',
  orangeBorder: 'rgba(191,87,0,0.2)',
  white: '#ffffff',
  grayBg: '#f7f8fa',
  grayBorder: '#e4e7ed',
  text: '#0a1628',
  muted: '#5a6578',
  navLinkActive: '#ffffff',
  navLinkInactive: 'rgba(255,255,255,0.55)',
  cardBg: '#ffffff',
};

const DARK_C = {
  bg: '#09090b',
  navy: '#60a5fa',
  navyDim: 'rgba(96,165,250,0.1)',
  navyBorder: 'rgba(96,165,250,0.25)',
  orange: '#fb923c',
  orangeDim: 'rgba(251,146,60,0.1)',
  orangeBorder: 'rgba(251,146,60,0.25)',
  white: '#fafafa',
  grayBg: '#111113',
  grayBorder: '#2e2e33',
  text: '#fafafa',
  muted: '#71717a',
  navLinkActive: '#fafafa',
  navLinkInactive: 'rgba(250,250,250,0.5)',
  cardBg: '#111113',
};

/* ── Inline style for responsive step rows (injected as <style>) ── */
const LANDING_CSS = `
  .lp-step-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 52px;
    align-items: center;
  }
  @media (max-width: 768px) {
    .lp-nav { padding: 0 16px !important; gap: 16px !important; }
    .lp-nav-links { display: none !important; }
    .lp-step-row { grid-template-columns: 1fr !important; gap: 28px !important; }
    .lp-step-row-flip { direction: ltr !important; }
    .lp-hero { padding: 40px 20px 36px !important; }
    .lp-section-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .lp-how-section { padding: 48px 20px !important; }
    .lp-cta { padding: 48px 20px !important; }
    .lp-footer { padding: 20px 16px !important; }
    .lp-stats { padding: 24px 20px !important; }
    .lp-pricing-inner { padding: 24px 20px !important; }
    .lp-pricing-header { padding: 24px 20px !important; }
  }
`;

function TextBlock({ n, title, desc, C }: {
  n: string; title: string; desc: string;
  C: typeof LIGHT_C;
}) {
  return (
    <div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 40, fontWeight: 200, color: C.navyBorder, lineHeight: 1, marginBottom: 16 }}>{n}</div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 18, color: C.text, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 14, color: C.muted, lineHeight: 1.7, fontWeight: 300 }}>{desc}</div>
    </div>
  );
}

function StepRow({ n, title, desc, mockup, flip, C }: {
  n: string; title: string; desc: string;
  mockup?: React.ReactNode;
  flip: boolean;
  C: typeof LIGHT_C;
}) {
  return (
    <div className="lp-step-row">
      {flip
        ? <>{mockup}<TextBlock n={n} title={title} desc={desc} C={C} /></>
        : <><TextBlock n={n} title={title} desc={desc} C={C} />{mockup}</>
      }
    </div>
  );
}

/* ── Dark app mockup frames (always dark — showing the app UI) ── */
function LoginMockup() {
  return (
    <div style={{ background: '#09090b', borderRadius: 10, border: '1px solid #2e2e33', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
      <div style={{ height: 42, background: '#111113', borderBottom: '1px solid #2e2e33', display: 'flex', alignItems: 'center', padding: '0 16px' }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>AuriCall</span>
      </div>
      <div style={{ padding: '32px 16px', display: 'flex', justifyContent: 'center' }}>
        <div style={{ background: '#111113', border: '1px solid #2e2e33', borderRadius: 12, padding: '24px 28px', width: '100%', maxWidth: 300 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#f59e0b', marginBottom: 4 }}>AuriCall</div>
          <div style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace', marginBottom: 16, lineHeight: 1.5 }}>ENT Residency Scheduling Platform<br />Sign in to access your call schedule portal.</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
            <div style={{ flex: 1, background: '#f59e0b', color: '#000', borderRadius: 6, padding: '7px 0', fontSize: 11, fontFamily: 'monospace', fontWeight: 700, textAlign: 'center' }}>👑 Chief / Admin</div>
            <div style={{ flex: 1, background: '#27272a', color: '#71717a', borderRadius: 6, padding: '7px 0', fontSize: 11, fontFamily: 'monospace', textAlign: 'center' }}>🩺 Resident</div>
          </div>
          <div style={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Admin Password</div>
          <div style={{ background: '#27272a', border: '1px solid #3f3f46', borderRadius: 6, padding: '8px 10px', fontSize: 11, color: '#52525b', fontFamily: 'monospace', marginBottom: 12 }}>Enter admin password</div>
          <div style={{ background: '#f59e0b', color: '#000', borderRadius: 6, padding: '9px', fontSize: 12, fontWeight: 700, textAlign: 'center', fontFamily: 'monospace' }}>Sign In as Chief →</div>
        </div>
      </div>
    </div>
  );
}

function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: '#09090b', borderRadius: 10, border: '1px solid #2e2e33', overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.18)' }}>
      <div style={{ height: 42, background: '#111113', borderBottom: '1px solid #2e2e33', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 800, color: '#f59e0b' }}>AuriCall</span>
        <div style={{ flex: 1 }} />
        <div style={{ width: 60, height: 18, background: '#27272a', borderRadius: 100 }} />
        <div style={{ width: 44, height: 18, background: '#27272a', borderRadius: 100 }} />
      </div>
      <div style={{ padding: '16px' }}>{children}</div>
    </div>
  );
}

function RequestsMockup() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const rows = [[0,0,0,1,0,0,0],[0,1,1,0,0,0,0],[0,0,0,0,1,0,0],[1,0,0,0,0,0,0]];
  return (
    <AppFrame>
      <div style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>July 2025 — Vacation Requests</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 10 }}>
        {days.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 9, color: '#52525b', fontFamily: 'monospace', padding: '4px 0' }}>{d}</div>)}
        {rows.flat().map((v, i) => (
          <div key={i} style={{ aspectRatio: '1', borderRadius: 4, background: v ? '#f59e0b' : '#18181b', border: `1px solid ${v ? 'rgba(245,158,11,0.4)' : '#2e2e33'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: v ? '#000' : '#3f3f46', fontFamily: 'monospace', fontWeight: 700 }}>{i + 1 <= 28 ? i + 1 : ''}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {['Patel A. · Vacation · Jul 4', 'Kim J. · Conference · Jul 8–9', 'Osei M. · Vacation · Jul 12'].map(r => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: '#111113', border: '1px solid #27272a', borderRadius: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: '#a1a1aa', fontFamily: 'monospace' }}>{r}</span>
            <div style={{ marginLeft: 'auto', fontSize: 9, color: '#34d399', background: 'rgba(52,211,153,0.12)', padding: '2px 6px', borderRadius: 100, fontFamily: 'monospace' }}>Approved</div>
          </div>
        ))}
      </div>
    </AppFrame>
  );
}

function GenerateMockup() {
  return (
    <AppFrame>
      <div style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Schedule Generation</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
        {[{ l: 'Block', v: 'July 2025' }, { l: 'Senior residents', v: '3' }, { l: 'Junior residents', v: '4' }].map(s => (
          <div key={s.l} style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace', textTransform: 'uppercase', marginBottom: 4 }}>{s.l}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#fafafa', fontFamily: 'monospace' }}>{s.v}</div>
          </div>
        ))}
      </div>
      <div style={{ background: '#111113', border: '1px solid #27272a', borderRadius: 6, padding: '10px 12px', marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: '#71717a', fontFamily: 'monospace', marginBottom: 6 }}>Equity preview</div>
        {[{ name: 'Patel A.', pct: 82 }, { name: 'Kim J.', pct: 75 }, { name: 'Osei M.', pct: 68 }].map(r => (
          <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: '#a1a1aa', fontFamily: 'monospace', width: 60 }}>{r.name}</span>
            <div style={{ flex: 1, height: 4, background: '#27272a', borderRadius: 2 }}>
              <div style={{ width: `${r.pct}%`, height: '100%', background: '#f59e0b', borderRadius: 2 }} />
            </div>
            <span style={{ fontSize: 10, color: '#71717a', fontFamily: 'monospace' }}>{r.pct}%</span>
          </div>
        ))}
      </div>
      <div style={{ background: '#f59e0b', color: '#000', borderRadius: 6, padding: '8px 14px', fontSize: 12, fontWeight: 700, textAlign: 'center', fontFamily: 'monospace' }}>⚡ Generate Schedule</div>
    </AppFrame>
  );
}

function ScheduleMockup() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const assignments = [
    ['Patel A.', '', 'Kim J.', '', 'Osei M.', 'Patel A.', 'Kim J.'],
    ['', 'Osei M.', '', 'Patel A.', '', '', ''],
  ];
  return (
    <AppFrame>
      <div style={{ fontSize: 11, color: '#71717a', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>July 2025 — Call Schedule</div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(7, 1fr)', gap: 0, minWidth: 320 }}>
          <div style={{ fontSize: 8, color: '#52525b', padding: '5px 4px', background: '#111113', borderRadius: '4px 0 0 0' }} />
          {days.map(d => (
            <div key={d} style={{ fontSize: 9, color: '#71717a', fontFamily: 'monospace', textAlign: 'center', padding: '5px 2px', background: '#111113', borderBottom: '1px solid #27272a' }}>{d}</div>
          ))}
          {['Week 1', 'Week 2'].map((wk, wi) => [
            <div key={wk} style={{ fontSize: 9, color: '#52525b', fontFamily: 'monospace', padding: '8px 4px', background: '#111113', borderRight: '1px solid #27272a', display: 'flex', alignItems: 'center' }}>{wk}</div>,
            ...assignments[wi].map((name, di) => (
              <div key={di} style={{ border: '1px solid #27272a', minHeight: 36, padding: '4px', background: name ? 'rgba(245,158,11,0.08)' : '#09090b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {name && <span style={{ fontSize: 9, color: '#f59e0b', fontFamily: 'monospace', fontWeight: 600 }}>{name}</span>}
              </div>
            ))
          ])}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <div style={{ flex: 1, background: '#111113', border: '1px solid #27272a', borderRadius: 5, padding: '6px 10px', fontSize: 10, color: '#71717a', fontFamily: 'monospace', textAlign: 'center' }}>Export Excel</div>
        <div style={{ flex: 1, background: '#111113', border: '1px solid #27272a', borderRadius: 5, padding: '6px 10px', fontSize: 10, color: '#71717a', fontFamily: 'monospace', textAlign: 'center' }}>Print View</div>
        <div style={{ flex: 1, background: 'rgba(96,165,250,0.12)', border: '1px solid rgba(96,165,250,0.25)', borderRadius: 5, padding: '6px 10px', fontSize: 10, color: '#60a5fa', fontFamily: 'monospace', textAlign: 'center' }}>My iCal</div>
      </div>
    </AppFrame>
  );
}

const FEATURE_DEFS = [
  { icon: '⚡', title: 'Automated Schedule Generation', desc: 'Intelligent algorithms build fair, conflict-free call schedules in seconds. Handles senior/junior call, weekend coverage, and holiday distribution automatically.', colorKey: 'navy' as const },
  { icon: '📅', title: 'Resident Request Portal', desc: 'Residents submit vacation, conference, and holiday requests through a dedicated portal. Chiefs review and approve with full schedule-impact visibility.', colorKey: 'orange' as const },
  { icon: '📊', title: 'Equity Analytics', desc: 'Real-time call hour tracking with equity bars ensures no resident is overburdened. Visual dashboards surface imbalances before they become problems.', fixed: { color: '#0e7490', dim: 'rgba(14,116,144,0.07)', border: 'rgba(14,116,144,0.18)' } },
  { icon: '🏥', title: 'Multi-Site Support', desc: 'Manage concurrent rotations across multiple hospitals simultaneously. Each site maintains independent scheduling logic and assignments.', fixed: { color: '#6366f1', dim: 'rgba(99,102,241,0.07)', border: 'rgba(99,102,241,0.18)' } },
  { icon: '🔐', title: 'Role-Based Access', desc: 'Chiefs get full administrative control. Residents access only their own schedule and request portal via a secure PIN system.', fixed: { color: '#059669', dim: 'rgba(5,150,105,0.07)', border: 'rgba(5,150,105,0.18)' } },
  { icon: '📤', title: 'Export & Print', desc: 'Export schedules to Excel for archiving or share-out. Print-optimized calendar views for posting in clinic or sending to attending faculty.', fixed: { color: '#9333ea', dim: 'rgba(147,51,234,0.07)', border: 'rgba(147,51,234,0.18)' } },
];

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<'features' | 'pricing'>('features');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const saved = localStorage.getItem('landing-theme');
    const initial = saved === 'dark' || (!saved && mq.matches);
    setIsDark(initial);

    const handler = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem('landing-theme')) setIsDark(e.matches);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = () => {
    setIsDark(d => {
      const next = !d;
      localStorage.setItem('landing-theme', next ? 'dark' : 'light');
      return next;
    });
  };

  const C = isDark ? DARK_C : LIGHT_C;

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: C.bg, fontFamily: "'DM Sans', 'Inter', sans-serif", color: C.text, transition: 'background 0.2s, color 0.2s' }}>
      <style>{LANDING_CSS}</style>

      {/* ── Nav ── */}
      <nav className="lp-nav" style={{ position: 'sticky', top: 0, zIndex: 100, background: isDark ? '#111113' : '#002868', height: 60, display: 'flex', alignItems: 'center', padding: '0 40px', gap: 36 }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 20, color: '#ffffff', letterSpacing: '0.01em', whiteSpace: 'nowrap' }}>
          Auri<span style={{ fontWeight: 600 }}>Call</span>
        </span>

        <div style={{ flex: 1 }} />

        <div className="lp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button onClick={() => setActiveTab('features')} style={{ background: 'none', border: 'none', color: activeTab === 'features' ? C.navLinkActive : C.navLinkInactive, fontSize: 14, fontWeight: 400, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', padding: '4px 2px', transition: 'color 0.15s' }}>Features</button>
          <button onClick={() => setActiveTab('pricing')} style={{ background: 'none', border: 'none', color: activeTab === 'pricing' ? C.navLinkActive : C.navLinkInactive, fontSize: 14, fontWeight: 400, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', padding: '4px 2px', transition: 'color 0.15s' }}>Pricing</button>
        </div>

        <button
          onClick={toggleTheme}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#ffffff', fontSize: 14, padding: '5px 9px', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 6, background: C.orange, color: '#ffffff', fontSize: 14, fontWeight: 500, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', transition: 'opacity 0.15s', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Log In →
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section className="lp-hero" style={{ maxWidth: 820, margin: '0 auto', padding: '80px 40px 72px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 300, letterSpacing: '-0.01em', lineHeight: 1.2, color: C.text, marginBottom: 20 }}>
          Intelligent scheduling for<br />
          <span style={{ color: C.navy, fontWeight: 600 }}>otolaryngology</span> training programs
        </h1>

        <p style={{ fontSize: 16, color: C.muted, lineHeight: 1.7, maxWidth: 520, margin: '0 auto 40px', fontWeight: 300 }}>
          Automate call schedules, manage resident requests, and track equity — all in one platform designed specifically for ENT residency coordinators and program chiefs.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 7, background: C.orange, color: '#ffffff', fontSize: 15, fontWeight: 500, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em' }}>
            Access Your Program →
          </Link>
          <button onClick={() => setActiveTab('pricing')} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 7, background: 'transparent', color: C.navy, border: `1px solid ${C.navyBorder}`, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em' }}>
            View Pricing
          </button>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section className="lp-stats" style={{ borderTop: `1px solid ${C.grayBorder}`, borderBottom: `1px solid ${C.grayBorder}`, background: C.grayBg, padding: '32px 40px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 24, textAlign: 'center' }}>
          {[
            { n: '< 10s', l: 'Schedule Generated' },
            { n: '100%', l: 'Conflict Detection' },
            { n: 'Multiple', l: 'Sites Supported' },
            { n: 'Zero hassle', l: 'Request Collection' },
          ].map(s => (
            <div key={s.l}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 600, color: C.navy, letterSpacing: '-0.02em' }}>{s.n}</div>
              <div style={{ fontSize: 11, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 4, fontWeight: 400 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tab content ── */}
      <section className="lp-section-pad" style={{ maxWidth: 960, margin: '0 auto', padding: '64px 40px' }}>
        <div style={{ display: 'flex', borderBottom: `1px solid ${C.grayBorder}`, marginBottom: 48 }}>
          {(['features', 'pricing'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: '10px 20px', fontSize: 14, fontWeight: 400, color: activeTab === tab ? C.navy : C.muted, borderBottom: `2px solid ${activeTab === tab ? C.navy : 'transparent'}`, marginBottom: -1, background: 'none', border: 'none', borderBottomWidth: 2, borderBottomStyle: 'solid', borderBottomColor: activeTab === tab ? C.navy : 'transparent', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", textTransform: 'capitalize', transition: 'all 0.15s', letterSpacing: '0.01em' }}>
              {tab}
            </button>
          ))}
        </div>

        {/* ── Features tab ── */}
        {activeTab === 'features' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 18 }}>
            {FEATURE_DEFS.map(f => {
              const color = f.fixed?.color ?? C.navy;
              const dim = f.fixed?.dim ?? C.navyDim;
              const border = f.fixed?.border ?? C.navyBorder;
              return (
                <div key={f.title} style={{ background: C.cardBg, border: `1px solid ${C.grayBorder}`, borderRadius: 10, padding: '24px', display: 'flex', flexDirection: 'column', gap: 12, transition: 'border-color 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = border; e.currentTarget.style.boxShadow = `0 4px 16px ${dim}`; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.grayBorder; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: dim, border: `1px solid ${border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {f.icon}
                  </div>
                  <div>
                    <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 500, fontSize: 15, marginBottom: 6, color: C.text }}>{f.title}</div>
                    <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.65, fontWeight: 300 }}>{f.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pricing tab ── */}
        {activeTab === 'pricing' && (
          <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 300, letterSpacing: '-0.01em', color: C.text, marginBottom: 12 }}>
              Pricing built around <span style={{ fontWeight: 600, color: C.navy }}>your program</span>
            </h2>
            <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7, fontWeight: 300, marginBottom: 40 }}>
              Every residency program is different. Pricing is individualized based on the number of residents and the complexity of your call schedule structure.
            </p>

            <div style={{ background: C.cardBg, border: `1px solid ${C.navyBorder}`, borderRadius: 12, overflow: 'hidden', boxShadow: `0 8px 32px ${C.navyDim}` }}>
              <div className="lp-pricing-header" style={{ background: isDark ? '#1e3a5f' : '#002868', padding: '32px 36px', textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>Per Program Subscription</div>
                <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 32, fontWeight: 300, color: '#ffffff', lineHeight: 1.2, marginBottom: 8 }}>Individualized pricing</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 300 }}>Tailored to your program's size and scheduling needs</div>
              </div>

              <div className="lp-pricing-inner" style={{ padding: '32px 36px', textAlign: 'left' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>Everything included</div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 32 }}>
                  {['Unlimited schedule generation', 'All resident & chief accounts', 'Request & approval portal', 'Equity analytics dashboard', 'Multi-site support', 'Excel export & print views', 'Dedicated support'].map(feat => (
                    <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text, fontWeight: 300 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.navyDim, border: `1px solid ${C.navyBorder}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.navy, fontWeight: 600, flexShrink: 0 }}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>
                <a href="mailto:viraj_shah@hotmail.com" style={{ display: 'block', textAlign: 'center', padding: '13px', borderRadius: 7, background: C.orange, color: '#ffffff', fontSize: 14, fontWeight: 500, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', transition: 'opacity 0.15s' }}>
                  Contact us — viraj_shah@hotmail.com
                </a>
                <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5, fontWeight: 300 }}>
                  Reach out to discuss your program's needs. No commitment required.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── How it works (features tab only) ── */}
      {activeTab === 'features' && (
        <section className="lp-how-section" style={{ background: C.grayBg, borderTop: `1px solid ${C.grayBorder}`, borderBottom: `1px solid ${C.grayBorder}`, padding: '72px 40px' }}>
          <div style={{ maxWidth: 1000, margin: '0 auto' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8, textAlign: 'center' }}>How it works</div>
            <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 300, letterSpacing: '-0.01em', textAlign: 'center', marginBottom: 56, color: C.text }}>
              From setup to schedule <span style={{ fontWeight: 600, color: C.navy }}>in minutes</span>
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 56 }}>
              <StepRow n="01" title="Sign in to your program" desc="Every institution gets its own secure login page. Chiefs use a password; residents log in by name and PIN — no email accounts to manage." mockup={<LoginMockup />} flip={false} C={C} />
              <StepRow n="02" title="Residents submit requests" desc="Residents open the request portal and tap vacation, conference, or holiday days directly on the calendar. Chiefs see all requests in one view." mockup={<RequestsMockup />} flip={true} C={C} />
              <StepRow n="03" title="Generate the schedule" desc="One click runs the scheduling algorithm. It checks every constraint — call limits, equity, conflicts, rotations — and produces a ready-to-review schedule." mockup={<GenerateMockup />} flip={false} C={C} />
              <StepRow n="04" title="Review, export & share" desc="Browse the full call calendar, spot any issues, and export to Excel or print for distribution. Residents can also export their personal iCal feed." mockup={<ScheduleMockup />} flip={true} C={C} />
            </div>
          </div>
        </section>
      )}

      {/* ── CTA banner ── */}
      <section className="lp-cta" style={{ maxWidth: 820, margin: '0 auto', padding: '72px 40px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 30, fontWeight: 300, letterSpacing: '-0.01em', marginBottom: 12, color: C.text }}>
          Ready to simplify your program's scheduling?
        </h2>
        <p style={{ fontSize: 15, color: C.muted, marginBottom: 32, fontWeight: 300 }}>
          Log in to access your institution's scheduling platform.
        </p>
        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 7, background: C.orange, color: '#ffffff', fontSize: 15, fontWeight: 500, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em' }}>
          Log In to Your Program →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer" style={{ background: isDark ? '#111113' : '#002868', padding: '28px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 16, color: '#ffffff', letterSpacing: '0.01em' }}>
          Auri<span style={{ fontWeight: 600 }}>Call</span>
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 300 }}>
          © {new Date().getFullYear()} AuriCall. Built for ENT residency programs.
        </span>
      </footer>
    </div>
  );
}
