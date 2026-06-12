'use client';

import { useState, useEffect } from 'react';
import type { Resident, ScheduleData, Request } from '@/types';
import { HOLIDAYS, parseDate, dk, addDays } from '@/lib/scheduler';
import { api } from '../App';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

interface Props {
  open: boolean;
  dateKeys: string[];
  schedule: ScheduleData;
  residents: Resident[];
  allRequests: Request[];
  onSave: (updated: ScheduleData) => void;
  onClose: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

function removeSeniorDays(updated: ScheduleData, keys: string[]) {
  const sorted = [...keys].sort();
  const ranges: { start: string; end: string }[] = [];
  let rStart = sorted[0], rEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDate(sorted[i - 1]);
    const curr = parseDate(sorted[i]);
    if ((curr.getTime() - prev.getTime()) / 86400000 === 1) {
      rEnd = sorted[i];
    } else {
      ranges.push({ start: rStart, end: rEnd });
      rStart = rEnd = sorted[i];
    }
  }
  ranges.push({ start: rStart, end: rEnd });

  for (const range of ranges) {
    const newWeeks: ScheduleData['seniorWeeks'] = [];
    for (const w of updated.seniorWeeks) {
      if (w.wE < range.start || w.wS > range.end) { newWeeks.push(w); continue; }
      if (w.wS < range.start) newWeeks.push({ ...w, wE: dk(addDays(parseDate(range.start), -1)) });
      if (w.wE > range.end) newWeeks.push({ ...w, wS: dk(addDays(parseDate(range.end), 1)) });
    }
    updated.seniorWeeks = newWeeks.sort((a, b) => a.wS.localeCompare(b.wS));
  }
}

function applyMultiDayOverride(updated: ScheduleData, keys: string[], newRes: Resident) {
  const sorted = [...keys].sort();

  const ranges: { start: string; end: string }[] = [];
  let rStart = sorted[0], rEnd = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDate(sorted[i - 1]);
    const curr = parseDate(sorted[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) {
      rEnd = sorted[i];
    } else {
      ranges.push({ start: rStart, end: rEnd });
      rStart = rEnd = sorted[i];
    }
  }
  ranges.push({ start: rStart, end: rEnd });

  for (const range of ranges) {
    const newWeeks: ScheduleData['seniorWeeks'] = [];
    for (const w of updated.seniorWeeks) {
      if (w.wE < range.start || w.wS > range.end) {
        newWeeks.push(w);
        continue;
      }
      if (w.wS < range.start) {
        newWeeks.push({ ...w, wE: dk(addDays(parseDate(range.start), -1)) });
      }
      const overS = w.wS > range.start ? w.wS : range.start;
      const overE = w.wE < range.end ? w.wE : range.end;
      newWeeks.push({ wS: overS, wE: overE, res: newRes, isBackup: w.isBackup, override: true });
      if (w.wE > range.end) {
        newWeeks.push({ ...w, wS: dk(addDays(parseDate(range.end), 1)) });
      }
    }
    updated.seniorWeeks = newWeeks.sort((a, b) => a.wS.localeCompare(b.wS));
  }
}

export default function OverrideModal({ open, dateKeys, schedule, residents, allRequests, onSave, onClose, showToast }: Props) {
  const [srId, setSrId] = useState('');
  const [jrId, setJrId] = useState('');
  const [note, setNote] = useState('');
  const [liveRequests, setLiveRequests] = useState<Request[]>(allRequests);

  // Fetch fresh requests every time the modal opens so availability is current
  useEffect(() => {
    if (!open) return;
    setSrId(''); setJrId(''); setNote('');
    api<Request[]>('/requests')
      .then(setLiveRequests)
      .catch(() => setLiveRequests(allRequests));
  }, [open, dateKeys.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  function saveOverride() {
    if (!dateKeys.length || !schedule) return;
    const updated = JSON.parse(JSON.stringify(schedule)) as ScheduleData;

    if (srId === '__remove__') {
      removeSeniorDays(updated, dateKeys);
    } else if (srId) {
      const res = residents.find((r) => r.id === srId);
      if (res) applyMultiDayOverride(updated, dateKeys, res);
    }
    if (jrId === '__remove__') {
      updated.juniorDays = updated.juniorDays.filter((d) => !dateKeys.includes(d.dateKey));
    } else if (jrId) {
      const res = residents.find((r) => r.id === jrId);
      if (res) {
        dateKeys.forEach((key) => {
          const jd = updated.juniorDays.find((d) => d.dateKey === key);
          if (jd) { jd.res = res; jd.override = true; }
        });
      }
    }
    onSave(updated);
    showToast('Override saved');
    onClose();
  }

  if (!open || !dateKeys.length) return null;

  const offOnSelectedDates = new Set(
    liveRequests
      .filter((req) => (req.type === 'vacation_official' || req.type === 'vacation') && dateKeys.includes(req.date))
      .map((req) => req.resident_id),
  );
  const srs = residents.filter((r) => r.pgy >= 4 && r.status !== 'away' && !offOnSelectedDates.has(r.id));
  const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active' && !offOnSelectedDates.has(r.id));
  const offResidents = residents.filter((r) => offOnSelectedDates.has(r.id));

  // Debug: show raw data so we can identify the mismatch
  const vacReqsForDates = liveRequests.filter((req) =>
    (req.type === 'vacation_official' || req.type === 'vacation') && dateKeys.includes(req.date)
  );

  function fmtDateKey(s: string) {
    const d = parseDate(s);
    return `${DOW[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }

  const subtitle = dateKeys.length === 1
    ? `${fmtDateKey(dateKeys[0])}${HOLIDAYS.has(dateKeys[0]) ? ' 🎉 Holiday' : ''}`
    : `${dateKeys.length} days selected (${fmtDateKey(dateKeys[0])} – ${fmtDateKey(dateKeys[dateKeys.length - 1])})`;

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="mh">
          <div>
            <div className="mt">Override Assignment</div>
            <div className="ms">{subtitle}</div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ fontSize: 10, color: '#888', marginBottom: 8, padding: '5px 8px', background: 'rgba(0,0,0,0.05)', borderRadius: 6, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            DEBUG: liveRequests={liveRequests.length} | dateKeys={JSON.stringify(dateKeys)}{'\n'}
            sampleDates={JSON.stringify(liveRequests.slice(0,3).map(r=>r.date))}{'\n'}
            vacReqs={JSON.stringify(vacReqsForDates.map(r=>({rid:r.resident_id,date:r.date,type:r.type})))}{'\n'}
            offSet={JSON.stringify([...offOnSelectedDates])}
          </div>
          {offResidents.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--orange)', marginBottom: 10, padding: '5px 8px', background: 'rgba(251,146,60,0.1)', borderRadius: 6, border: '1px solid rgba(251,146,60,0.25)' }}>
              ⚠ Excluded (requested off): {offResidents.map((r) => r.name).join(', ')}
            </div>
          )}
          <div className="fg f2">
            <div className="fl">
              <label className="flb">Senior on Call</label>
              <select value={srId} onChange={(e) => setSrId(e.target.value)}>
                <option value="">— no change —</option>
                <option value="__remove__">✕ Remove (no coverage)</option>
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
                <option value="__remove__">✕ Remove (no coverage)</option>
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
