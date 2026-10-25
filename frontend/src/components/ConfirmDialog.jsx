// One confirmation dialog for every risky action. Optional: a reason box, "type this to confirm", the owner's password,
// and any extra fields (children). onConfirm receives { reason, password } and may throw — the error message is shown inline.
import { useEffect, useRef, useState } from 'react';

export default function ConfirmDialog({
  title, children, confirmLabel = 'Confirm', danger = false,
  reason = false, reasonRequired = false, reasonLabel = 'Reason', reasonHint,
  typeToConfirm, typeLabel, typeExact = false, password = false, canConfirm = true, onConfirm, onClose,
}) {
  const [reasonText, setReasonText] = useState('');
  const [typed, setTyped] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // emails are matched ignoring case; words like DELETE / TERMINATE must be typed exactly as shown
  const typedOk = !typeToConfirm || (typeExact ? typed.trim() === String(typeToConfirm) : typed.trim().toLowerCase() === String(typeToConfirm).toLowerCase());
  const reasonOk = !reasonRequired || reasonText.trim().length >= 3;
  const ready = typedOk && reasonOk && (!password || pw.length > 0) && canConfirm && !busy;

  const submit = async (e) => {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setError('');
    try { await onConfirm({ reason: reasonText.trim(), password: pw }); } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.');
      setBusy(false);
    }
  };

  return (
    <div className="rc-modal-back" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <form className="rc-modal rc-small cd-dialog" role="alertdialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <h3 className="section-title" style={{ marginTop: 0 }}>{title}</h3>
        <div className="cd-body">{children}</div>
        {reason && (
          <div className="tool-field">
            <label htmlFor="cd-reason">{reasonLabel}{reasonRequired ? '' : ' (optional)'}</label>
            <input id="cd-reason" ref={first} value={reasonText} maxLength={300} onChange={(e) => setReasonText(e.target.value)} placeholder={reasonHint} />
          </div>
        )}
        {typeToConfirm && (
          <div className="tool-field">
            <label htmlFor="cd-type">{typeLabel || `Type ${typeToConfirm} to confirm`}</label>
            <input id="cd-type" ref={reason ? undefined : first} value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} placeholder={typeToConfirm} />
          </div>
        )}
        {password && (
          <div className="tool-field">
            <label htmlFor="cd-pw">Your current password</label>
            <input id="cd-pw" ref={reason || typeToConfirm ? undefined : first} type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          </div>
        )}
        {error && <p className="error-text" role="alert" style={{ margin: '10px 0 0' }}>{error}</p>}
        <div className="rc-actions" style={{ marginTop: 16, paddingBottom: 0 }}>
          <button type="button" className="btn-sm ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn-sm ${danger ? 'reject' : 'primary'}`} disabled={!ready}>{busy ? 'Working…' : confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
