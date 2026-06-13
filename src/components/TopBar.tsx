'use client';

import type { Block, Role, Step } from '@/types';

interface Props {
  role: Role;
  step: Step;
  residentName: string | null;
  block: Block | null;
  onGoStep: (s: Step) => void;
  onSignOut: () => void;
}

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Block Setup' },
  { n: 2, label: 'Requests' },
  { n: 3, label: 'Generate' },
  { n: 4, label: 'Schedule' },
];

export default function TopBar({ role, step, residentName, onGoStep, onSignOut }: Props) {
  return (
    <div className="topbar">
      <div className="brand">
        SHAH
      </div>
      <div className="topbar-spacer" />

      {role === 'chief' && (
        <div className="step-indicator">
          {STEPS.map((s, idx) => {
            const isDone = s.n < step;
            const isActive = s.n === step;
            return (
              <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {idx > 0 && <div className="step-divider" />}
                <div
                  className={`step${isActive ? ' active' : ''}${isDone ? ' done' : ''}`}
                  onClick={() => onGoStep(s.n)}
                >
                  <div className="step-num">{s.n}</div>
                  {s.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="topbar-right">
        <div
          className="res-badge"
          style={{
            fontSize: 11,
            color: role === 'chief' ? 'var(--gold)' : 'var(--blue)',
            padding: '4px 10px',
            background: 'var(--s2)',
            border: '1px solid var(--border)',
            borderRadius: 100,
          }}
        >
          {role === 'chief' ? '👑 Chief / Admin' : `🩺 ${residentName ?? 'Resident'}`}
        </div>
        <button className="mode-btn" onClick={onSignOut}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
