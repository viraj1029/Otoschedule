'use client';

import { useState } from 'react';
import type { Resident, Role } from '@/types';
import { api } from './App';

interface Props {
  residents: Resident[];
  onLogin: (mode: Role, resId?: string, resident?: Resident) => void;
  showToast: (msg: string, err?: boolean) => void;
}

export default function LoginGate({ residents, onLogin, showToast }: Props) {
  const [tab, setTab] = useState<'chief' | 'resident'>('chief');
  const [chiefPw, setChiefPw] = useState('');
  const [resLoginId, setResLoginId] = useState('');
  const [resPin, setResPin] = useState('');
  const [loginErr, setLoginErr] = useState(false);
  const [loading, setLoading] = useState(false);

  async function doLogin() {
    setLoginErr(false);
    setLoading(true);
    try {
      if (tab === 'chief') {
        await api('/auth/chief', 'POST', { password: chiefPw });
        onLogin('chief');
      } else {
        if (!resLoginId) { showToast('Select your name', true); setLoading(false); return; }
        const { resident } = await api<{ resident: Resident }>('/auth/resident', 'POST', {
          residentId: resLoginId,
          pin: resPin,
        });
        onLogin('resident', resident.id, resident);
      }
    } catch {
      setLoginErr(true);
      setResPin('');
    } finally {
      setLoading(false);
    }
  }

  const sorted = [...residents].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--bg)',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          height: 52,
          background: 'var(--s1)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 24px',
        }}
      >
        <div className="brand">
          OTO Scheduler <span>UTSW · CUH / PMH Block</span>
        </div>
      </div>

      <div className="login-wrap">
        <div className="login-card">
          <div className="login-logo">OTO Scheduler</div>
          <div className="login-sub">
            UTSW · CUH/PMH Block
            <br />
            Sign in to access your call schedule portal.
          </div>

          <div className="login-tabs">
            <button
              className={`ltab${tab === 'chief' ? ' active' : ''}`}
              onClick={() => { setTab('chief'); setLoginErr(false); }}
            >
              👑 Chief / Admin
            </button>
            <button
              className={`ltab${tab === 'resident' ? ' active' : ''}`}
              onClick={() => { setTab('resident'); setLoginErr(false); }}
            >
              🩺 Resident
            </button>
          </div>

          {tab === 'chief' && (
            <div>
              <div className="fl" style={{ marginBottom: 14 }}>
                <label className="flb">Admin Password</label>
                <input
                  type="password"
                  placeholder="Enter admin password"
                  value={chiefPw}
                  onChange={(e) => setChiefPw(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                />
              </div>
              <button className="btn bg" style={{ width: '100%' }} onClick={doLogin} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Sign In as Chief →'}
              </button>
            </div>
          )}

          {tab === 'resident' && (
            <div>
              <div className="fg" style={{ marginBottom: 14 }}>
                <div className="fl">
                  <label className="flb">Your Name</label>
                  <select value={resLoginId} onChange={(e) => setResLoginId(e.target.value)}>
                    <option value="">— Select your name —</option>
                    {sorted.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (PGY-{r.pgy})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="fl">
                  <label className="flb">Your PIN</label>
                  <input
                    type="password"
                    placeholder="4-digit PIN"
                    maxLength={4}
                    value={resPin}
                    onChange={(e) => setResPin(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doLogin()}
                  />
                </div>
              </div>
              <button className="btn bblue" style={{ width: '100%' }} onClick={doLogin} disabled={loading}>
                {loading ? <span className="spinner" /> : 'Access My Requests →'}
              </button>
            </div>
          )}

          {loginErr && (
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: 'var(--red)',
                textAlign: 'center',
              }}
            >
              Incorrect credentials. Please try again.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
