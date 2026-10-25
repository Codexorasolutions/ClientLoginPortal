// Client profile → "Payments & receipts": totals, full receipt history, and a shortcut to create a receipt.
import { useState } from 'react';
import ReceiptPreview from './ReceiptPreview.jsx';
import { downloadReceipt, printReceipt, inr, fmtDate, STATUS } from '../utils/receiptApi.js';

export default function ClientPaymentsPanel({ payments, receipts = [], hasProject, onCreate, onViewAll }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');

  const run = async (fn, r) => {
    setError('');
    try { await fn(r); } catch { setError('Could not open that receipt. Please try again.'); }
  };
  const balance = payments?.balance ?? 0;

  return (
    <div className="panel" style={{ marginBottom: 22 }}>
      <div className="rc-panel-head">
        <h3 className="section-title" style={{ margin: 0 }}>💳 Payments &amp; receipts</h3>
        <div>
          <button type="button" className="btn-sm primary" onClick={onCreate}>Create receipt</button>
          <button type="button" className="btn-sm ghost" onClick={onViewAll}>Receipt history</button>
        </div>
      </div>

      {payments && (
        <div className="rc-mini-stats">
          <div><span>Total project cost</span><strong>{payments.totalCost > 0 ? `₹${inr(payments.totalCost)}` : '—'}</strong></div>
          <div><span>Received so far</span><strong>₹{inr(payments.received)}</strong></div>
          <div><span>{balance < 0 ? 'Credit (overpaid)' : 'Balance due'}</span><strong>₹{inr(Math.abs(balance))}</strong></div>
        </div>
      )}
      {!hasProject && <p className="muted" style={{ margin: '0 0 10px' }}>Create this client's project above before recording a payment — receipts are saved against the project.</p>}
      {payments && !payments.totalCostSet && payments.totalCost > 0 && (
        <p className="muted" style={{ margin: '0 0 10px' }}>No total project cost is saved, so the total shown is everything invoiced so far. Set it under Project for exact balances.</p>
      )}
      {error && <p className="error-text">{error}</p>}

      {receipts.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>No receipts yet.</p>
      ) : (
        <ul className="rc-mini-list">
          {receipts.map((r) => {
            const st = STATUS[r.statusKey] || STATUS.part_payment;
            return (
              <li key={r._id} className={r.voided ? 'void' : ''}>
                <div>
                  <strong>{r.receiptNumber}</strong>
                  <span className="muted"> · {fmtDate(r.paymentDate)} · {r.paymentMode}{r.transactionId ? ` · ${r.transactionId}` : ''}</span>
                </div>
                <div className="rc-mini-amt">₹{inr(r.amountReceived)} <span className={`tag ${st.tag}`}>{st.label}</span></div>
                <div className="rc-mini-actions">
                  <button type="button" className="btn-sm ghost" onClick={() => setPreview(r)}>Preview</button>
                  <button type="button" className="btn-sm ghost" onClick={() => run(downloadReceipt, r)}>PDF</button>
                  <button type="button" className="btn-sm ghost" onClick={() => run(printReceipt, r)}>Print</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {preview && <ReceiptPreview receipt={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
