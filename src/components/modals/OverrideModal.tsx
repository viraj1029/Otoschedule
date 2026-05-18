'use client';

import { useState, useEffect } from 'react';
import type { Resident, ScheduleData } from '@/types';
import { HOLIDAYS, parseDate, dk } from '@/lib/scheduler';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Props {
  open: boolean;
  dateKey: string | null;
  schedule: ScheduleData;
  residents: Resident[];
  onSave: (updated: ScheduleData) => void;
  onClose: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

export default function OverrideModal({ open, dateKey, schedule, residents, onSave, onClose, showToast }: Props) {
  const [srId, setSrId] = useState('');
  const [jrId, setJrId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) { setSrId(''); setJrId(''); setNote(''); }
  }, [open, dateKey]);

  function saveOverride() {
    if (!dateKey || !schedule) return;
    const updated = JSON.parse(JSON.stringify(schedule)) as ScheduleData;

    if (srId) {
      const res = residents.find((r) => r.id === srId);
      if (res) {
        updated.seniorWeeks.forEach((w) => {
          if (dateKey >= w.wS && dateKey <= w.wE) {
            w.res = res;
            w.override = true;
          }
        });
      }
    }
    if (jrId) {
      const res = residents.find((r) => r.id === jrId);
      if (res) {
        const jd = updated.juniorDays.find((d) => d.dateKey === dateKey);
        if (jd) { jd.res = res; jd.override = true; }
      }
    }
    onSave(updated);
    showToast('Override saved');
    onClose();
  }

  if (!open || !dateKey) return null;

  const d = parseDate(dateKey);
  const srs = residents.filter((r) => r.pgy >= 4 && r.status !== 'away');
  const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');

  function fmtDate(s: string) {
    const d = parseDate(s);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="mh">
          <div>
            <div className="mt">Override Assignment</div>
            <div className="ms">
              {DOW[d.getDay()]}, {MONTHS[d.getMonth()]} {d.getDate()} —{' '}
              {fmtDate(dateKey)}
              {HOLIDAYS.has(dateKey) ? ' 🎉 Holiday' : ''}
            </div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div className="fg f2">
            <div className="fl">
              <label className="flb">Senior on Call</label>
              <select value={srId} onChange={(e) => setSrId(e.target.value)}>
                <option value="">— no change —</option>
                {srs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (PGY-{r.pgy})
                  </option>
                ))}
              </select>
            </div>
            <div className="fl">
              <label className="flb">Junior on Call</label>
              <select value={jrId} onChange={(e) => setJrId(e.target.value)}>
                <option value="">— no change —</option>
                {jrs.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} (PGY-{r.pgy})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="fl">
            <label className="flb">Note</label>
            <input
              type="text"
              placeholder="e.g. coverage swap"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <div className="mf">
          <button className="btn bgh" onClick={onClose}>Cancel</button>
          <button className="btn bg" onClick={saveOverride}>Save Override</button>
        </div>
      </div>
    </div>
  );
}
