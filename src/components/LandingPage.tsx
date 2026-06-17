'use client';
import { useState } from 'react';
import Link from 'next/link';

const features = [
  {
    icon: '⚡',
    title: 'Automated Schedule Generation',
    desc: 'Intelligent algorithms build fair, conflict-free call schedules in seconds. Handles senior/junior call, weekend coverage, and holiday distribution automatically.',
    color: 'var(--gold)',
    dim: 'var(--gold-dim)',
    border: 'var(--gold-border)',
  },
  {
    icon: '📅',
    title: 'Resident Request Portal',
    desc: 'Residents submit vacation, conference, and holiday requests through a dedicated portal. Chiefs review and approve with full schedule-impact visibility.',
    color: 'var(--blue)',
    dim: 'var(--blue-dim)',
    border: 'rgba(96,165,250,0.25)',
  },
  {
    icon: '📊',
    title: 'Equity Analytics',
    desc: 'Real-time call hour tracking with equity bars ensures no resident is overburdened. Visual dashboards surface imbalances before they become problems.',
    color: 'var(--green)',
    dim: 'var(--green-dim)',
    border: 'rgba(52,211,153,0.25)',
  },
  {
    icon: '🏥',
    title: 'Multi-Site Support',
    desc: 'Manage concurrent rotations across multiple hospitals (e.g. University + VA). Each site maintains independent scheduling logic and assignments.',
    color: 'var(--purple)',
    dim: 'var(--purple-dim)',
    border: 'rgba(167,139,250,0.25)',
  },
  {
    icon: '🔐',
    title: 'Role-Based Access',
    desc: 'Chiefs get full administrative control. Residents access only their own schedule and request portal via a secure PIN system — no passwords to forget.',
    color: 'var(--teal)',
    dim: 'var(--teal-dim)',
    border: 'rgba(45,212,191,0.25)',
  },
  {
    icon: '📤',
    title: 'Export & Print',
    desc: 'Export schedules to Excel for archiving or share-out. Print-optimized calendar views for posting in clinic or sending to attending faculty.',
    color: 'var(--orange)',
    dim: 'var(--orange-dim)',
    border: 'rgba(251,146,60,0.25)',
  },
];

const pricingFeatures = [
  'Unlimited schedule generation',
  'All resident & chief accounts',
  'Request & approval portal',
  'Equity analytics dashboard',
  'Multi-site support',
  'Excel export & print views',
  'Email support',
];

export default function LandingPage() {
  const [annual, setAnnual] = useState(false);
  const [activeTab, setActiveTab] = useState<'features' | 'pricing'>('features');

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflowY: 'auto',
      background: 'var(--bg)',
      fontFamily: "'Inter', sans-serif",
    }}>
      {/* ── Nav ── */}
      <nav style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(9,9,11,0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        height: 56,
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        gap: 32,
      }}>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 18,
          color: 'var(--gold)',
          letterSpacing: '-0.02em',
          whiteSpace: 'nowrap',
        }}>
          OtoScheduler
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setActiveTab('features')}
          style={{
            background: 'none',
            border: 'none',
            color: activeTab === 'features' ? 'var(--text)' : 'var(--muted)',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
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
            color: activeTab === 'pricing' ? 'var(--text)' : 'var(--muted)',
            fontSize: 14,
            cursor: 'pointer',
            fontFamily: "'Inter', sans-serif",
            fontWeight: 500,
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
          padding: '7px 16px',
          borderRadius: 8,
          background: 'var(--gold)',
          color: '#000',
          fontSize: 13,
          fontWeight: 600,
          textDecoration: 'none',
          fontFamily: "'Inter', sans-serif",
          transition: 'opacity 0.15s',
          whiteSpace: 'nowrap',
        }}>
          Log In →
        </Link>
      </nav>

      {/* ── Hero ── */}
      <section style={{
        maxWidth: 780,
        margin: '0 auto',
        padding: '96px 32px 80px',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 100,
          background: 'var(--gold-dim)',
          border: '1px solid var(--gold-border)',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--gold)',
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 24,
        }}>
          Built for ENT Residency Programs
        </div>

        <h1 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 'clamp(36px, 6vw, 58px)',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          lineHeight: 1.08,
          color: 'var(--text)',
          marginBottom: 20,
        }}>
          Intelligent scheduling<br />
          <span style={{ color: 'var(--gold)' }}>for otolaryngology</span><br />
          training programs
        </h1>

        <p style={{
          fontSize: 17,
          color: 'var(--muted)',
          lineHeight: 1.65,
          maxWidth: 560,
          margin: '0 auto 36px',
        }}>
          Automate call schedules, manage resident requests, and track equity — all in one platform designed specifically for ENT residency coordinators and program chiefs.
        </p>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/login" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 28px',
            borderRadius: 10,
            background: 'var(--gold)',
            color: '#000',
            fontSize: 15,
            fontWeight: 700,
            textDecoration: 'none',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '-0.01em',
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
              borderRadius: 10,
              background: 'var(--s2)',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            View Pricing
          </button>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <section style={{
        borderTop: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        background: 'var(--s1)',
        padding: '28px 32px',
      }}>
        <div style={{
          maxWidth: 780,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
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
                fontFamily: "'Syne', sans-serif",
                fontSize: 26,
                fontWeight: 800,
                color: 'var(--gold)',
                letterSpacing: '-0.02em',
              }}>{s.n}</div>
              <div style={{
                fontSize: 11,
                color: 'var(--muted)',
                fontFamily: "'JetBrains Mono', monospace",
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginTop: 4,
              }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Tab content ── */}
      <section style={{ maxWidth: 900, margin: '0 auto', padding: '72px 32px' }}>

        {/* Tab switcher */}
        <div style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          marginBottom: 52,
        }}>
          {(['features', 'pricing'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 18px',
                fontSize: 14,
                fontWeight: 500,
                color: activeTab === tab ? 'var(--gold)' : 'var(--muted)',
                borderBottom: activeTab === tab ? '2px solid var(--gold)' : '2px solid transparent',
                marginBottom: -1,
                background: 'none',
                border: 'none',
                borderBottomWidth: 2,
                borderBottomStyle: 'solid',
                borderBottomColor: activeTab === tab ? 'var(--gold)' : 'transparent',
                cursor: 'pointer',
                fontFamily: "'Inter', sans-serif",
                textTransform: 'capitalize',
                transition: 'all 0.15s',
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
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
          }}>
            {features.map(f => (
              <div key={f.title} style={{
                background: 'var(--s1)',
                border: `1px solid var(--border)`,
                borderRadius: 12,
                padding: '22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = f.color)}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <div style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: f.dim,
                  border: `1px solid ${f.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 20,
                  flexShrink: 0,
                }}>
                  {f.icon}
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    marginBottom: 6,
                    color: 'var(--text)',
                  }}>{f.title}</div>
                  <div style={{
                    fontSize: 13,
                    color: 'var(--muted)',
                    lineHeight: 1.6,
                  }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Pricing tab ── */}
        {activeTab === 'pricing' && (
          <div style={{ maxWidth: 480, margin: '0 auto' }}>

            {/* Toggle */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              marginBottom: 36,
            }}>
              <span style={{ fontSize: 13, color: annual ? 'var(--muted)' : 'var(--text)', fontWeight: 500 }}>Monthly</span>
              <button
                onClick={() => setAnnual(a => !a)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 100,
                  background: annual ? 'var(--gold)' : 'var(--s3)',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                  flexShrink: 0,
                }}
                aria-label="Toggle annual billing"
              >
                <span style={{
                  position: 'absolute',
                  top: 3,
                  left: annual ? 23 : 3,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: annual ? '#000' : 'var(--muted)',
                  transition: 'left 0.2s',
                }} />
              </button>
              <span style={{ fontSize: 13, color: annual ? 'var(--text)' : 'var(--muted)', fontWeight: 500 }}>
                Annual{' '}
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--green)',
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  SAVE $100
                </span>
              </span>
            </div>

            {/* Pricing card */}
            <div style={{
              background: 'var(--s1)',
              border: '1px solid var(--gold-border)',
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 0 0 1px var(--gold-border), 0 24px 48px rgba(0,0,0,0.2)',
            }}>
              <div style={{
                background: 'var(--gold-dim)',
                borderBottom: '1px solid var(--gold-border)',
                padding: '24px 28px 20px',
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--gold)',
                  marginBottom: 12,
                }}>
                  Per Program Subscription
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginBottom: 4 }}>
                  <span style={{
                    fontFamily: "'Syne', sans-serif",
                    fontSize: 52,
                    fontWeight: 800,
                    color: 'var(--text)',
                    lineHeight: 1,
                    letterSpacing: '-0.03em',
                  }}>
                    {annual ? '$500' : '$50'}
                  </span>
                  <span style={{ color: 'var(--muted)', fontSize: 14, paddingBottom: 8 }}>
                    {annual ? '/ year' : '/ month'}
                  </span>
                </div>
                {annual && (
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Billed annually · <span style={{ color: 'var(--green)' }}>$100 savings vs monthly</span>
                  </div>
                )}
              </div>

              <div style={{ padding: '24px 28px' }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--muted)',
                  marginBottom: 14,
                }}>
                  Everything included
                </div>
                <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {pricingFeatures.map(feat => (
                    <li key={feat} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text)' }}>
                      <span style={{
                        width: 18,
                        height: 18,
                        borderRadius: '50%',
                        background: 'var(--green-dim)',
                        border: '1px solid rgba(52,211,153,0.3)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        color: 'var(--green)',
                        flexShrink: 0,
                      }}>✓</span>
                      {feat}
                    </li>
                  ))}
                </ul>

                <div style={{ marginTop: 28 }}>
                  <a
                    href="mailto:contact@otoschedule.com"
                    style={{
                      display: 'block',
                      textAlign: 'center',
                      padding: '13px',
                      borderRadius: 10,
                      background: 'var(--gold)',
                      color: '#000',
                      fontSize: 14,
                      fontWeight: 700,
                      textDecoration: 'none',
                      fontFamily: "'Inter', sans-serif",
                      letterSpacing: '-0.01em',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    Get Started — Contact Us
                  </a>
                  <p style={{
                    textAlign: 'center',
                    fontSize: 11,
                    color: 'var(--muted)',
                    marginTop: 10,
                    lineHeight: 1.5,
                  }}>
                    Email us to set up your program's account.<br />
                    No credit card required to start a trial.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── How it works ── */}
      {activeTab === 'features' && (
        <section style={{
          background: 'var(--s1)',
          borderTop: '1px solid var(--border)',
          borderBottom: '1px solid var(--border)',
          padding: '64px 32px',
        }}>
          <div style={{ maxWidth: 780, margin: '0 auto' }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--muted)',
              marginBottom: 8,
              textAlign: 'center',
            }}>
              How it works
            </div>
            <h2 style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              textAlign: 'center',
              marginBottom: 48,
            }}>
              From setup to schedule in minutes
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 32,
            }}>
              {[
                { n: '01', title: 'Add Residents', desc: 'Enter your residents, their PGY levels, and rotation assignments for the block.' },
                { n: '02', title: 'Collect Requests', desc: 'Residents log in and submit vacation, conference, and holiday requests through the portal.' },
                { n: '03', title: 'Generate Schedule', desc: 'One click runs the scheduling algorithm — conflict-free, equitable, and ready to review.' },
                { n: '04', title: 'Publish & Export', desc: 'Review the schedule, make manual tweaks if needed, then export to Excel or print.' },
              ].map(step => (
                <div key={step.n}>
                  <div style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: 32,
                    fontWeight: 800,
                    color: 'var(--border2)',
                    lineHeight: 1,
                    marginBottom: 12,
                  }}>{step.n}</div>
                  <div style={{
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 700,
                    fontSize: 15,
                    marginBottom: 6,
                  }}>{step.title}</div>
                  <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{step.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA banner ── */}
      <section style={{
        maxWidth: 780,
        margin: '0 auto',
        padding: '72px 32px',
        textAlign: 'center',
      }}>
        <h2 style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: 32,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          marginBottom: 14,
        }}>
          Ready to simplify your program's scheduling?
        </h2>
        <p style={{ fontSize: 15, color: 'var(--muted)', marginBottom: 32 }}>
          Log in to access your institution's scheduling platform.
        </p>
        <Link href="/login" style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '13px 32px',
          borderRadius: 10,
          background: 'var(--gold)',
          color: '#000',
          fontSize: 15,
          fontWeight: 700,
          textDecoration: 'none',
          fontFamily: "'Inter', sans-serif",
          letterSpacing: '-0.01em',
        }}>
          Log In to Your Program →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
      }}>
        <span style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: 15,
          color: 'var(--gold)',
          letterSpacing: '-0.02em',
        }}>
          OtoScheduler
        </span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          © {new Date().getFullYear()} OtoScheduler. Built for ENT residency programs.
        </span>
      </footer>
    </div>
  );
}
