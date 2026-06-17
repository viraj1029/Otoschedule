'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';

const LIGHT_C = {
  bg: '#ffffff', navy: '#002868', navyDim: 'rgba(0,40,104,0.07)', navyBorder: 'rgba(0,40,104,0.15)',
  orange: '#BF5700', grayBorder: '#e4e7ed', text: '#0a1628', muted: '#5a6578',
  navLinkActive: '#ffffff', navLinkInactive: 'rgba(255,255,255,0.55)', cardBg: '#ffffff',
};
const DARK_C = {
  bg: '#09090b', navy: '#60a5fa', navyDim: 'rgba(96,165,250,0.1)', navyBorder: 'rgba(96,165,250,0.25)',
  orange: '#fb923c', grayBorder: '#2e2e33', text: '#fafafa', muted: '#71717a',
  navLinkActive: '#fafafa', navLinkInactive: 'rgba(250,250,250,0.5)', cardBg: '#111113',
};

export default function PricingPage() {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const saved = localStorage.getItem('landing-theme');
    setIsDark(saved === 'dark' || (!saved && mq.matches));
    const handler = (e: MediaQueryListEvent) => { if (!localStorage.getItem('landing-theme')) setIsDark(e.matches); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const toggleTheme = () => {
    setIsDark(d => { const next = !d; localStorage.setItem('landing-theme', next ? 'dark' : 'light'); return next; });
  };

  const C = isDark ? DARK_C : LIGHT_C;

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', background: C.bg, fontFamily: "'DM Sans', 'Inter', sans-serif", color: C.text, transition: 'background 0.2s, color 0.2s' }}>
      {/* ── Nav ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: isDark ? '#111113' : '#002868', height: 60, display: 'flex', alignItems: 'center', padding: '0 40px', gap: 36 }}>
        <Link href="/" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 300, fontSize: 20, color: '#ffffff', letterSpacing: '0.01em', whiteSpace: 'nowrap', textDecoration: 'none' }}>
          Auri<span style={{ fontWeight: 600 }}>Call</span>
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <Link href="/" style={{ color: C.navLinkInactive, fontSize: 14, fontWeight: 400, fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', padding: '4px 2px', textDecoration: 'none' }}>Features</Link>
          <Link href="/pricing" style={{ color: C.navLinkActive, fontSize: 14, fontWeight: 400, fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', padding: '4px 2px', textDecoration: 'none' }}>Pricing</Link>
        </div>
        <button
          onClick={toggleTheme}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#ffffff', fontSize: 14, padding: '5px 9px', cursor: 'pointer', transition: 'background 0.15s', flexShrink: 0 }}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <Link href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 6, background: C.orange, color: '#ffffff', fontSize: 14, fontWeight: 500, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Log In →
        </Link>
      </nav>

      {/* ── Pricing content ── */}
      <section style={{ maxWidth: 540, margin: '0 auto', padding: '80px 40px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 28, fontWeight: 300, letterSpacing: '-0.01em', color: C.text, marginBottom: 12 }}>
          Pricing built around <span style={{ fontWeight: 600, color: C.navy }}>your program</span>
        </h2>
        <p style={{ fontSize: 15, color: C.muted, lineHeight: 1.7, fontWeight: 300, marginBottom: 40 }}>
          Every residency program is different. Pricing is individualized based on the number of residents and the complexity of your call schedule structure.
        </p>

        <div style={{ background: C.cardBg, border: `1px solid ${C.navyBorder}`, borderRadius: 12, overflow: 'hidden', boxShadow: `0 8px 32px ${C.navyDim}` }}>
          <div style={{ padding: '32px 36px', textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 16 }}>
              Everything included
            </div>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column' as const, gap: 11, marginBottom: 32 }}>
              {[
                'Unlimited schedule generation',
                'All resident & chief accounts',
                'Request & approval portal',
                'Equity analytics dashboard',
                'Multi-site support',
                'Excel export & print views',
                'Dedicated support',
              ].map(feat => (
                <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: C.text, fontWeight: 300 }}>
                  <span style={{ width: 18, height: 18, borderRadius: '50%', background: C.navyDim, border: `1px solid ${C.navyBorder}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: C.navy, fontWeight: 600, flexShrink: 0 }}>✓</span>
                  {feat}
                </li>
              ))}
            </ul>
            <a href="mailto:viraj_shah@hotmail.com" style={{ display: 'block', textAlign: 'center', padding: '13px', borderRadius: 7, background: C.orange, color: '#ffffff', fontSize: 14, fontWeight: 500, textDecoration: 'none', fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.01em' }}>
              Contact us — viraj_shah@hotmail.com
            </a>
            <p style={{ textAlign: 'center', fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 1.5, fontWeight: 300 }}>
              Reach out to discuss your program&apos;s needs. No commitment required.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
