'use client';

import { useState } from 'react';
import { api } from '../App';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string, pin: string, name: string) => void;
  showToast: (msg: string, err?: boolean) => void;
}

export default function AddResidentModal({ open, onClose, onAdded, showToast }: Props) {
  const [name, setName] = useState('');
  const [pgy, setPgy] = useState('4');
  const [hospital, setHospital] = useState('CUH');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(false);

  async function doAdd() {
    const trimmed = name.trim();
    if (!trimmed) { showToast('Enter a name', true); return; }
    setLoading(true);
    try {
      const { id, pin } = await api<{ id: string; pin: string; name: string }>(
        '/residents',
        'POST',
        { name: trimmed, pgy: parseInt(pgy), hospital, status },
      );
      onAdded(id, pin, trimmed);
      setName('');
      setPgy('4');
      setHospital('CUH');
      setStatus('active');
      onClose();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="mh">
          <div>
            <div className="mt">Add Resident to Pool</div>
            <div className="ms">A unique PIN will be generated and shown — share it privately</div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div className="fl">
            <label className="flb">Full Name</label>
            <input
              type="text"
              placeholder="e.g. Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doAdd()}
            />
          </div>
          <div className="fg f3">
            <div className="fl">
              <label className="flb">PGY Level</label>
              <select value={pgy} onChange={(e) => setPgy(e.target.value)}>
                <option value="2">PGY-2</option>
                <option value="3">PGY-3</option>
                <option value="4">PGY-4</option>
                <option value="5">PGY-5</option>
              </select>
            </div>
            <div className="fl">
              <label className="flb">Hospital</label>
              <select value={hospital} onChange={(e) => setHospital(e.target.value)}>
                <option value="CUH">CUH</option>
                <option value="PMH">PMH</option>
              </select>
            </div>
            <div className="fl">
              <label className="flb">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="research">Research (1 bkp wk + wknd)</option>
                <option value="away">Away / Excused</option>
              </select>
            </div>
          </div>
        </div>
        <div className="mf">
          <button className="btn bgh" onClick={onClose}>Cancel</button>
          <button className="btn bg" onClick={doAdd} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Add & Generate PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}
