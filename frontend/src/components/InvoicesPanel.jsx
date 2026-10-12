import { useState } from 'react';
import downloadInvoicePdf from '../utils/downloadInvoicePdf.js';
import downloadReceiptPdf from '../utils/downloadReceiptPdf.js';
import { formatINR, invoiceLabel, invoiceTotals, isOverdue, isHttpUrl } from '../utils/format.js';
import { downloadInvoicesCsv } from '../utils/exportCsv.js';
import EmptyState from './EmptyState.jsx';

const date = (d) => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

// The client's Invoices section: running totals, one row per invoice with
// status, a PDF download, and a "Pay now" button while something is owed.
export default function InvoicesPanel({ invoices }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const totals = invoiceTotals(invoices);

  const download = async (inv) => {
    setBusyId(inv._id);
    setError('');
    try {
      await downloadInvoicePdf('client', inv);
    } catch {
      setError('Could not download that invoice. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const downloadReceipt = async (inv) => {
    setBusyId(`r-${inv._id}`);
    setError('');
    try {
      await downloadReceiptPdf('client', inv);
    } catch {
      setError('Could not download that receipt. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="panel" style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ fontFamily: 'Poppins', fontSize: 18, margin: 0 }}>Invoices</h3>
        {invoices.length > 0 && (
          <button
            className="btn-sm ghost"
            onClick={() => downloadInvoicesCsv(invoices, `codexora-invoices-${new Date().toISOString().slice(0, 10)}.csv`)}
          >
            Export CSV
          </button>
        )}
      </div>

      {invoices.length === 0 ? (
        <EmptyState icon="🧾" title="No invoices yet" hint="Invoices Codexora sends you will show up here." />
      ) : (
        <>
          <div className="inv-summary">
            <div>
              <div className="inv-sum-num">{formatINR(totals.invoiced)}</div>
              <div className="inv-sum-lab">Total invoiced</div>
            </div>
            <div>
              <div className="inv-sum-num paid">{formatINR(totals.paid)}</div>
              <div className="inv-sum-lab">Paid</div>
            </div>
            <div>
              <div className={`inv-sum-num ${totals.due > 0 ? 'due' : ''}`}>{formatINR(totals.due)}</div>
              <div className="inv-sum-lab">Balance due</div>
            </div>
          </div>

          {error && <p className="error-text" style={{ marginTop: 0 }}>{error}</p>}

          <table className="inv-table">
            <thead>
              <tr><th>Invoice</th><th>Issued</th><th>Due</th><th>Amount</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const overdue = isOverdue(inv);
                const label = overdue ? 'overdue' : inv.status;
                return (
                  <tr key={inv._id}>
                    <td>
                      <div className="inv-num">{invoiceLabel(inv)}</div>
                      <div className="muted">{inv.description}</div>
                    </td>
                    <td>{date(inv.createdAt)}</td>
                    <td>{inv.dueDate ? date(inv.dueDate) : '—'}</td>
                    <td className="inv-amt">{formatINR(inv.amount)}</td>
                    <td>
                      <span className={`tag ${label}`}>{label}</span>
                      {inv.status === 'paid' && inv.paidAt && <div className="muted">on {date(inv.paidAt)}</div>}
                    </td>
                    <td className="inv-actions">
                      {inv.status === 'due' && isHttpUrl(inv.paymentLink) && (
                        <a className="pay-btn" href={inv.paymentLink} target="_blank" rel="noopener noreferrer">Pay now</a>
                      )}
                      <button className="btn-sm ghost" disabled={busyId === inv._id} onClick={() => download(inv)}>
                        {busyId === inv._id ? '…' : 'PDF'}
                      </button>
                      {inv.status === 'paid' && (
                        <button className="btn-sm ghost" disabled={busyId === `r-${inv._id}`} onClick={() => downloadReceipt(inv)}>
                          {busyId === `r-${inv._id}` ? '…' : 'Receipt'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
