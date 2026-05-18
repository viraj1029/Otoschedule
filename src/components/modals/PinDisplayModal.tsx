'use client';

interface Props {
  open: boolean;
  title: string;
  residentName: string;
  pin: string;
  onClose: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

export default function PinDisplayModal({ open, title, residentName, pin, onClose, showToast }: Props) {
  function copyPin() {
    navigator.clipboard
      .writeText(pin)
      .then(() => showToast('PIN copied!'))
      .catch(() => showToast('Copy failed', true));
  }

  if (!open) return null;

  return (
    <div className="modal-bg open">
      <div className="modal" style={{ width: 380 }}>
        <div className="mh">
          <div>
            <div className="mt">{title}</div>
            <div className="ms">Share this PIN privately with the resident</div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{residentName}</div>
            <div className="pin-big" onClick={copyPin} style={{ cursor: 'pointer' }}>
              {pin}
            </div>
            <div className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
              Click PIN to copy. Reveal anytime from the pool table.
            </div>
          </div>
        </div>
        <div className="mf">
          <button
            className="btn bg"
            onClick={() => { copyPin(); onClose(); }}
          >
            Copy & Close
          </button>
        </div>
      </div>
    </div>
  );
}
