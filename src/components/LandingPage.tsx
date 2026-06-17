'use client';
import { useState } from 'react';
import Link from 'next/link';

const NAVY = '#002868';
const NAVY_LIGHT = '#003580';
const NAVY_DIM = 'rgba(0,40,104,0.07)';
const NAVY_BORDER = 'rgba(0,40,104,0.15)';
const ORANGE = '#BF5700';
const ORANGE_DIM = 'rgba(191,87,0,0.08)';
const ORANGE_BORDER = 'rgba(191,87,0,0.2)';
const WHITE = '#ffffff';
const GRAY_BG = '#f7f8fa';
const GRAY_BORDER = '#e4e7ed';
const TEXT = '#0a1628';
const MUTED = '#5a6578';

const features = [
  {
    icon: '⚡',
    title: 'Automated Schedule Generation',
    desc: 'Intelligent algorithms build fair, conflict-free call schedules in seconds. Handles senior/junior call, weekend coverage, and holiday distribution automatically.',
    color: NAVY,
    dim: NAVY_DIM,
    border: NAVY_BORDER,
  },
  {
    icon: '📅',
    title: 'Resident Request Portal',
    desc: 'Residents submit vacation, conference, and holiday requests through a dedicated portal. Chiefs review and approve with full schedule-impact visibility.',
    color: ORANGE,
    dim: ORANGE_DIM,
    border: ORANGE_BORDER,
  },
  {
    icon: '📊',
    title: 'Equity Analytics',
    desc: 'Real-time call hour tracking with equity bars ensures no resident is overburdened. Visual dashboards surface imbalances before they become problems.',
    color: '#0e7490',
    dim: 'rgba(14,116,144,0.07)',
    border: 'rgba(14,116,144,0.18)',
  },
  {
    icon: '🏥',
    title: 'Multi-Site Support',
    desc: 'Manage concurrent rotations across multiple hospitals simultaneously. Each site maintains independent scheduling logic and assignments.',
    color: '#6366f1',
    dim: 'rgba(99,102,241,0.07)',
    border: 'rgba(99,102,241,0.18)',
  },
  {
    icon: '🔐',
    title: 'Role-Based Access',
    desc: 'Chiefs get full administrative control. Residents access only their own schedule and request portal via a secure PIN system.',
    color: '#059669',
    dim: 'rgba(5,150,105,0.07)',
    border: 'rgba(5,150,105,0.18)',
  },
  {
    icon: '📤',
    title: 'Export & Print',
    desc: 'Export schedules to Excel for archiving or share-out. Print-optimized calendar views for posting in clinic or sending to attending faculty.',
    color: '#9333ea',
    dim: 'rgba(147,51,234,0.07)',
    border: 'rgba(147,51,234,0.18)',
  },
];

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState<'features' | 'pricing'>('features');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflowY: 'auto',
      background: WHITE,
      fontFamily: "'DM Sans', 'Inter', sans-serif",
      color: TEXT,
    }}>
      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: NAVY,
        height: 60,
        display: 'flex',
        alignItems: 'center',
        padding: '0 40px',
        gap: 36,
      }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 300,
          fontSize: 20,
          color: WHITE,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
        }}>
          Oto<span style={{ fontWeight: 600 }}>Scheduler</span>
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setActiveTab('features')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'features' ? WHITE : 'rgba(255,255,255,0.55)',
            fontSize: 14,
            fontWeight: 400,
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: '0.01em',
            padding: '4px 2px',
            transition: 'color 0.15s',
          }}
        >
          Features
        </button>

        <button
          onClick={() => setActiveTab('pricing')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'pricing' ? WHITE : 'rgba(255,255,255,0.55)',
            fontSize: 14,
            fontWeight: 400,
            cursor: 'pointer',
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: '0.01em',
            padding: '4px 2px',
            transition: 'color 0.15s',
          }}
        >
          Pricing
        </button>

        <Link href="/login" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '8px 20px',
          borderRadius: 6,
          background: ORANGE,
          color: WHITE,
          fontSize: 14,
          fontWeight: 500,
          textDecoration: 'none',
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '0.01em',
          transition: 'opacity 0.15s',
          whiteSpace: 'nowrap',
        }}>
          Log In →
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 820,
        margin: '0 auto',
        padding: '80px 40px 72px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 14px',
          borderRadius: 100,
          background: NAVY_DIM,
          border: `1px solid ${NAVY_BORDER}`,
          fontSize: 11,
          fontWeight: 500,
          color: NAVY,
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 28,
        }}>
          Built for ENT Residency Programs
        </div>

        <h1 style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 'clamp(28px, 4vw, 42px)',
          fontWeight: 300,
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
          color: TEXT,
          marginBottom: 20,
        }}>
          Intelligent scheduling for<br />
          <span style={{ color: NAVY, fontWeight: 600 }}>otolaryngology</span> training programs
        </h1>

        <p style={{
          fontSize: 16,
          color: MUTED,
          lineHeight: 1.7,
          maxWidth: 520,
          margin: '0 auto 40px',
          fontWeight: 300,
        }}>
          Automate call schedules, manage resident requests, and track equity — all in one platform designed specifically for ENT residency coordinators and program chiefs.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 28px',
            borderRadius: 7,
            background: ORANGE,
            color: WHITE,
            fontSize: 15,
            fontWeight: 500,
            textDecoration: 'none',
            fontFamily: "'DM Sans', sans-serif",
            letterSpacing: '0.01em',
          }}>
            Access Your Program →
          </Link>
          <button
            onClick={() => setActiveTab('pricing')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '12px 28px',
              borderRadius: 7,
              background: WHITE,
              color: NAVY,
              border: `1px solid ${NAVY_BORDER}`,
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              letterSpacing: '0.01em',
            }}
          >
            View Pricing
          </button>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section style={{
        borderTop: `1px solid ${GRAY_BORDER}`,
        borderBottom: `1px solid ${GRAY_BORDER}`,
        background: GRAY_BG,
        padding: '32px 40px',
      }}>
        <div style={{
          maxWidth: 820,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 32,
          textAlign: 'center',
        }}>
          {[
            { n: '< 10s', l: 'Schedule Generated' },
            { n: '100%', l: 'Conflict Detection' },
            { n: '2 sites', l: 'Simultaneous Coverage' },
            { n: '0 emails', l: 'Needed to Collect Requests' },
          ].map(s => (
            <div key={s.l}>
              <div style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 28,
                fontWeight: 600,
                color: NAVY,
                letterSpacing: '-0.02em',
              }}>{s.n}</div>
              <div style={{
                fontSize: 11,
                color: MUTED,
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
                marginTop: 4,
                fontWeight: 400,
              }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tab content ── */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '64px 40px' }}>

        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${GRAY_BORDER}`,
          marginBottom: 48,
        }}>
          {(['features', 'pricing'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 400,
                color: activeTab === tab ? NAVY : MUTED,
                borderBottom: activeTab === tab ? `2px solid ${NAVY}` : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab ? NAVY : 'transparent',
                cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
                textTransform: 'capitalize',
                transition: 'all 0.15s',
                letterSpacing: '0.01em',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ── Features tab ── */}
        {activeTab === 'features' && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
            gap: 18,
          }}>
            {features.map(f => (
              <div key={f.title} style={{
                background: WHITE,
                border: `1px solid ${GRAY_BORDER}`,
                borderRadius: 10,
                padding: '24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = f.border;
                e.currentTarget.style.boxShadow = `0 4px 16px ${f.dim}`;
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = GRAY_BORDER;
                e.currentTarget.style.boxShadow = 'none';
              }}
              >
                <div style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: f.dim,
                  border: `1px solid ${f.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                    fontSize: 15,
                    marginBottom: 6,
                    color: TEXT,
                  }}>{f.title}</div>
                  <div style={{
                    fontSize: 13,
                    color: MUTED,
                    lineHeight: 1.65,
                    fontWeight: 300,
                  }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pricing tab ── */}
        {activeTab === 'pricing' && (
          <div style={{ maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
            <h2 style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 28,
              fontWeight: 300,
              letterSpacing: '-0.01em',
              color: TEXT,
              marginBottom: 12,
            }}>
              Pricing built around <span style={{ fontWeight: 600, color: NAVY }}>your program</span>
            </h2>
            <p style={{
              fontSize: 15,
              color: MUTED,
              lineHeight: 1.7,
              fontWeight: 300,
              marginBottom: 40,
            }}>
              Every residency program is different. Pricing is individualized based on the number of residents and the complexity of your call schedule structure.
            </p>

            <div style={{
              background: WHITE,
              border: `1px solid ${NAVY_BORDER}`,
              borderRadius: 12,
              overflow: 'hidden',
              boxShadow: `0 8px 32px ${NAVY_DIM}`,
            }}>
              <div style={{
                background: NAVY,
                padding: '32px 36px',
                textAlign: 'left',
              }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.55)',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}>
                  Per Program Subscription
                </div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 32,
                  fontWeight: 300,
                  color: WHITE,
                  lineHeight: 1.2,
                  marginBottom: 8,
                }}>
                  Individualized pricing
                </div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', fontWeight: 300 }}>
                  Tailored to your program's size and scheduling needs
                </div>
              </div>

              <div style={{ padding: '32px 36px', textAlign: 'left' }}>
                <div style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: MUTED,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                }}>
                  Everything included
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11, marginBottom: 32 }}>
                  {[
                    'Unlimited schedule generation',
                    'All resident & chief accounts',
                    'Request & approval portal',
                    'Equity analytics dashboard',
                    'Multi-site support',
                    'Excel export & print views',
                    'Dedicated support',
                  ].map(feat => (
                    <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: TEXT, fontWeight: 300 }}>
                      <span style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: NAVY_DIM,
                        border: `1px solid ${NAVY_BORDER}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color: NAVY,
                        fontWeight: 600,
                        flexShrink: 0,
                      }}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <a
                  href="mailto:viraj_shah@hotmail.com"
                  style={{
                    display: 'block',
                    textAlign: 'center',
                    padding: '13px',
                    borderRadius: 7,
                    background: ORANGE,
                    color: WHITE,
                    fontSize: 14,
                    fontWeight: 500,
                    textDecoration: 'none',
                    fontFamily: "'DM Sans', sans-serif",
                    letterSpacing: '0.01em',
                    transition: 'opacity 0.15s',
                  }}
                >
                  Contact us — viraj_shah@hotmail.com
                </a>
                <p style={{
                  textAlign: 'center',
                  fontSize: 12,
                  color: MUTED,
                  marginTop: 10,
                  lineHeight: 1.5,
                  fontWeight: 300,
                }}>
                  Reach out to discuss your program's needs. No commitment required.
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── How it works (features tab only) ── */}
      {activeTab === 'features' && (
        <section style={{
          background: GRAY_BG,
          borderTop: `1px solid ${GRAY_BORDER}`,
          borderBottom: `1px solid ${GRAY_BORDER}`,
          padding: '64px 40px',
        }}>
          <div style={{ maxWidth: 820, margin: '0 auto' }}>
            <div style={{
              fontSize: 11,
              fontWeight: 500,
              color: MUTED,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              marginBottom: 8,
              textAlign: 'center',
            }}>
              How it works
            </div>
            <h2 style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 28,
              fontWeight: 300,
              letterSpacing: '-0.01em',
              textAlign: 'center',
              marginBottom: 52,
              color: TEXT,
            }}>
              From setup to schedule <span style={{ fontWeight: 600, color: NAVY }}>in minutes</span>
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 36,
            }}>
              {[
                { n: '01', title: 'Add Residents', desc: 'Enter your residents, PGY levels, and rotation assignments for the block.' },
                { n: '02', title: 'Collect Requests', desc: 'Residents log in and submit vacation, conference, and holiday requests.' },
                { n: '03', title: 'Generate Schedule', desc: 'One click runs the algorithm — conflict-free, equitable, ready to review.' },
                { n: '04', title: 'Publish & Export', desc: 'Review, make tweaks if needed, then export to Excel or print.' },
              ].map(step => (
                <div key={step.n}>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 36,
                    fontWeight: 200,
                    color: NAVY_BORDER,
                    lineHeight: 1,
                    marginBottom: 14,
                  }}>{step.n}</div>
                  <div style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 500,
                    fontSize: 15,
                    marginBottom: 6,
                    color: TEXT,
                  }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, fontWeight: 300 }}>{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA banner ── */}
      <section style={{
        maxWidth: 820,
        margin: '0 auto',
        padding: '72px 40px',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 30,
          fontWeight: 300,
          letterSpacing: '-0.01em',
          marginBottom: 12,
          color: TEXT,
        }}>
          Ready to simplify your program's scheduling?
        </h2>
        <p style={{ fontSize: 15, color: MUTED, marginBottom: 32, fontWeight: 300 }}>
          Log in to access your institution's scheduling platform.
        </p>
        <Link href="/login" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 28px',
          borderRadius: 7,
          background: ORANGE,
          color: WHITE,
          fontSize: 15,
          fontWeight: 500,
          textDecoration: 'none',
          fontFamily: "'DM Sans', sans-serif",
          letterSpacing: '0.01em',
        }}>
          Log In to Your Program →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        background: NAVY,
        padding: '28px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 300,
          fontSize: 16,
          color: WHITE,
          letterSpacing: '0.01em',
        }}>
          Oto<span style={{ fontWeight: 600 }}>Scheduler</span>
        </span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: 300 }}>
          © {new Date().getFullYear()} OtoScheduler. Built for ENT residency programs.
        </span>
      </footer>
    </div>
  );
}
