'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Block, Resident, Request, AnyScheduleData, Schedule, Step, Role } from '@/types';
import LoginGate from './LoginGate';
import TopBar from './TopBar';
import BlockSetup from './steps/BlockSetup';
import Requests from './steps/Requests';
import Generate from './steps/Generate';
import ScheduleView from './steps/ScheduleView';
import Toast from './Toast';

export interface AppState {
  role: Role | null;
  currentResId: string | null;
  currentResidentFull: Resident | null;
  block: Block | null;
  residents: Resident[];
  allRequests: Request[];
  schedule: AnyScheduleData | null;
  schedules: Schedule[];       // list of all schedule metadata
  activeScheduleId: string | null; // which schedule the chief is viewing
  activeScheduleType: string | null;
  step: Step;
}

async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const opts: RequestInit = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api' + path, opts);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error((e as { error?: string }).error ?? 'Request failed');
  }
  return r.json() as Promise<T>;
}

export { api };

export default function App() {
  const [state, setState] = useState<AppState>({
    role: null,
    currentResId: null,
    currentResidentFull: null,
    block: null,
    residents: [],
    allRequests: [],
    schedule: null,
    schedules: [],
    activeScheduleId: null,
    activeScheduleType: null,
    step: 1,
  });

  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('theme') as 'dark' | 'light' | null;
    const initial = saved ?? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
    document.documentElement.style.colorScheme = initial;
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      const next = t === 'dark' ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      document.documentElement.dataset.theme = next;
      document.documentElement.style.colorScheme = next;
      return next;
    });
  }, []);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), 2800);
  }, []);

  const loadData = useCallback(async () => {
    const [block, residents, allRequests, schedule, schedules] = await Promise.all([
      api<Block | null>('/block').catch(() => null),
      api<Resident[]>('/residents').catch(() => [] as Resident[]),
      api<Request[]>('/requests').catch(() => [] as Request[]),
      api<AnyScheduleData | null>('/schedule').catch(() => null),
      api<Schedule[]>('/schedules').catch(() => [] as Schedule[]),
    ]);
    setState((s) => ({ ...s, block: block ?? s.block, residents, allRequests, schedule, schedules }));
  }, []);

  // Check existing session on mount
  useEffect(() => {
    (async () => {
      try {
        const me = await api<{ role: Role | null; resident?: Resident }>('/auth/me');
        if (me.role === 'chief') {
          setState((s) => ({ ...s, role: 'chief', step: 1 }));
          await loadData();
        } else if (me.role === 'resident' && me.resident) {
          setState((s) => ({
            ...s,
            role: 'resident',
            currentResId: me.resident!.id,
            currentResidentFull: me.resident!,
          }));
          await loadData();
        } else {
          // Load residents for the login dropdown even when not authed
          const residents = await api<Resident[]>('/residents').catch(() => [] as Resident[]);
          setState((s) => ({ ...s, residents }));
        }
      } catch {
        const residents = await api<Resident[]>('/residents').catch(() => [] as Resident[]);
        setState((s) => ({ ...s, residents }));
      }
    })();
  }, [loadData]);

  const handleLogin = useCallback(
    async (mode: 'chief' | 'resident', resId?: string, residentFull?: Resident) => {
      if (mode === 'chief') {
        setState((s) => ({ ...s, role: 'chief', step: 1 }));
      } else {
        setState((s) => ({
          ...s,
          role: 'resident',
          currentResId: resId ?? null,
          currentResidentFull: residentFull ?? null,
        }));
      }
      await loadData();
    },
    [loadData],
  );

  const handleSignOut = useCallback(async () => {
    await api('/auth/signout', 'POST');
    location.reload();
  }, []);

  const goStep = useCallback((step: Step) => {
    if (state.role !== 'chief') return;
    setState((s) => ({ ...s, step }));
  }, [state.role]);

  const setResidents = useCallback((residents: Resident[]) => {
    setState((s) => ({ ...s, residents }));
  }, []);

  const setAllRequests = useCallback((allRequests: Request[]) => {
    setState((s) => ({ ...s, allRequests }));
  }, []);

  const setBlock = useCallback((block: Block | null) => {
    setState((s) => ({ ...s, block }));
  }, []);

  const setSchedule = useCallback((schedule: AnyScheduleData | null) => {
    setState((s) => ({ ...s, schedule }));
  }, []);

  const loadScheduleById = useCallback(async (id: string) => {
    try {
      const sched = await api<AnyScheduleData | null>(`/schedule?id=${id}`);
      setState((s) => ({ ...s, schedule: sched, activeScheduleId: id }));
    } catch {
      // ignore
    }
  }, []);

  const reloadScheduleList = useCallback(async () => {
    const schedules = await api<Schedule[]>('/schedules').catch(() => [] as Schedule[]);
    setState((s) => ({ ...s, schedules }));
  }, []);

  const deleteSchedule = useCallback(async (id: string) => {
    await api(`/schedules/${id}`, 'DELETE');
    const schedules = await api<Schedule[]>('/schedules').catch(() => [] as Schedule[]);
    setState((s) => ({
      ...s,
      schedules,
      schedule: s.activeScheduleId === id ? null : s.schedule,
      activeScheduleId: s.activeScheduleId === id ? null : s.activeScheduleId,
    }));
  }, []);

  const isLoggedIn = Boolean(state.role);

  return (
    <>
      {!isLoggedIn && (
        <LoginGate
          residents={state.residents}
          onLogin={handleLogin}
          showToast={showToast}
        />
      )}

      {isLoggedIn && (
        <>
          <TopBar
            role={state.role!}
            step={state.step}
            residentName={state.currentResidentFull?.name ?? null}
            block={state.block}
            theme={theme}
            onGoStep={goStep}
            onSignOut={handleSignOut}
            onToggleTheme={toggleTheme}
          />
          <div className="app-body">
            <div className="main">
              {state.role === 'chief' && state.step === 1 && (
                <BlockSetup
                  block={state.block}
                  residents={state.residents}
                  onBlockSaved={setBlock}
                  onResidentsChanged={async () => {
                    const residents = await api<Resident[]>('/residents');
                    const allRequests = await api<Request[]>('/requests');
                    setResidents(residents);
                    setAllRequests(allRequests);
                  }}
                  onNext={() => goStep(2)}
                  showToast={showToast}
                />
              )}
              {(state.role === 'chief' ? state.step === 2 : true) && state.role === 'chief' && (
                <Requests
                  block={state.block}
                  residents={state.residents}
                  allRequests={state.allRequests}
                  role={state.role}
                  currentResId={null}
                  currentResidentFull={null}
                  onRequestsChanged={setAllRequests}
                  onBack={() => goStep(1)}
                  onNext={() => goStep(3)}
                  showToast={showToast}
                />
              )}
              {state.role === 'resident' && (
                <Requests
                  block={state.block}
                  residents={state.residents}
                  allRequests={state.allRequests}
                  role="resident"
                  currentResId={state.currentResId}
                  currentResidentFull={state.currentResidentFull}
                  onRequestsChanged={setAllRequests}
                  onBack={null}
                  onNext={null}
                  showToast={showToast}
                  schedule={state.schedule}
                  schedules={state.schedules}
                  onScheduleSelected={loadScheduleById}
                />
              )}
              {state.role === 'chief' && state.step === 3 && (
                <Generate
                  block={state.block}
                  residents={state.residents}
                  allRequests={state.allRequests}
                  schedule={state.schedule}
                  onScheduleGenerated={async (sched, scheduleId) => {
                    setSchedule(sched);
                    setState((s) => ({ ...s, activeScheduleId: scheduleId, activeScheduleType: (sched as { type?: string }).type ?? 'cuh_pmh' }));
                    await reloadScheduleList();
                    goStep(4);
                  }}
                  onBack={() => goStep(2)}
                  showToast={showToast}
                />
              )}
              {state.role === 'chief' && state.step === 4 && (
                <ScheduleView
                  schedule={state.schedule}
                  schedules={state.schedules}
                  activeScheduleId={state.activeScheduleId}
                  residents={state.residents}
                  allRequests={state.allRequests}
                  block={state.block}
                  role="chief"
                  onScheduleChanged={setSchedule}
                  onBlockChanged={setBlock}
                  onScheduleSelected={loadScheduleById}
                  onScheduleListChanged={reloadScheduleList}
                  onScheduleDeleted={deleteSchedule}
                  onRegenerate={() => goStep(3)}
                  showToast={showToast}
                />
              )}
            </div>
          </div>
        </>
      )}

      <Toast msg={toast?.msg ?? null} err={toast?.err ?? false} />
    </>
  );
}
