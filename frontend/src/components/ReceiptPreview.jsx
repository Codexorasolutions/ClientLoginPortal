// Modal that shows a saved receipt's PDF with Download / Print / Close. The PDF comes from the server record.
import { useEffect, useRef, useState } from 'react';
import { fetchReceiptPdf, downloadReceipt, printReceipt, inr, STATUS } from '../utils/receiptApi.js';

export default function ReceiptPreview({ receipt, onClose }) {
  const [url, setUrl] = useState('');
  const [state, setState] = useState('loading'); // loading | ready | error
  const [msg, setMsg] = useState('');
  const closeRef = useRef(null);

  useEffect(() => {
    let revoke = '';
    let cancelled = false;
    setState('loading');
    fetchReceiptPdf(receipt._id)
      .then((blob) => { if (cancelled) return; revoke = URL.createObjectURL(blob); setUrl(revoke); setState('ready'); })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; if (revoke) URL.revokeObjectURL(revoke); };
  }, [receipt._id]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = async (fn, okText) => {
    setMsg('');
    try { await fn(receipt); if (okText) setMsg(okText); } catch { setMsg('Something went wrong. Please try again.'); }
  };

  const st = STATUS[receipt.statusKey] || STATUS.part_payment;
  return (
    <div className="rc-modal-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rc-modal" role="dialog" aria-modal="true" aria-label={`Receipt ${receipt.receiptNumber}`}>
        <div className="rc-modal-head">
          <div>
            <strong>{receipt.receiptNumber}</strong>
            <span className={`tag ${st.tag}`} style={{ marginLeft: 8 }}>{st.label}</span>
            <div className="muted" style={{ fontSize: 12.5 }}>{receipt.clientBusiness || receipt.clientName} · ₹{inr(receipt.amountReceived)}</div>
          </div>
          <div className="rc-modal-actions">
            <button type="button" className="btn-sm primary" onClick={() => act(downloadReceipt)}>Download PDF</button>
            <button type="button" className="btn-sm ghost" onClick={() => act(printReceipt, 'Opening the print dialog…')}>Print</button>
            <button type="button" className="btn-sm ghost" ref={closeRef} onClick={onClose}>Close</button>
          </div>
        </div>
        {msg && <p className="rc-modal-msg" role="status">{msg}</p>}
        <div className="rc-modal-body">
          {state === 'loading' && <p className="muted rc-center">Loading receipt…</p>}
          {state === 'error' && <p className="error-text rc-center">Could not load this receipt. Close and try again.</p>}
          {state === 'ready' && <iframe title={`Receipt ${receipt.receiptNumber}`} src={url} className="rc-frame" />}
        </div>
      </div>
    </div>
  );
}
