// Owner dashboard → "Invoices" tab: create, preview, download, print, search and cancel payment receipts.
// Every receipt is saved on the server first; Preview / Download / Print all use that saved record's PDF.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import api from '../api/axios.js';
import ReceiptPreview from './ReceiptPreview.jsx';
import { downloadReceipt, printReceipt, inr, fmtDate, STATUS } from '../utils/receiptApi.js';

const MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'];
const SUGGESTIONS = [
  'Website development — advance payment', 'Website development — milestone payment', 'Website development — final payment',
  'Domain and hosting charges', 'Maintenance charges', 'Custom service charges',
];
const MAX_ROWS = 10;

const paise = (n) => Math.round(Number(n) * 100);
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const newKey = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2, 12)}`);
const isAmount = (v) => v !== '' && Number.isFinite(Number(v)) && Number(v) > 0 && Math.abs(Number(v) * 100 - Math.round(Number(v) * 100)) < 1e-6;
const emptyForm = () => ({
  clientName: '', clientBusiness: '', clientPhone: '', clientEmail: '', paymentMode: 'UPI', transactionId: '', paymentDate: todayIST(),
  projectPlan: '', totalProjectCost: '', notes: '', invoiceId: '', allowOverpayment: false,
});

// ================= create form =================
function ReceiptForm({ clients, presetClientId, onCancel, onSaved }) {
  const [clientId, setClientId] = useState(presetClientId || '');
  const [ctx, setCtx] = useState(null);
  const [ctxState, setCtxState] = useState(presetClientId ? 'loading' : 'idle'); // idle | loading | ready | error
  const [form, setForm] = useState(emptyForm());
  const [items, setItems] = useState([{ description: '', amount: '' }]);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null); // { type: 'error' | 'warn', text, code }
  const [busy, setBusy] = useState(false);
  const key = useRef(newKey());

  const loadContext = useCallback(async (id) => {
    if (!id) { setCtx(null); setCtxState('idle'); return; }
    setCtxState('loading'); setBanner(null);
    try {
      const { data } = await api.get(`/owner/clients/${id}/receipt-context`);
      setCtx(data);
      setForm({
        ...emptyForm(),
        clientName: data.client.fullName || '', clientBusiness: data.client.businessName || '', clientPhone: data.client.phone || '', clientEmail: data.client.email || '',
        projectPlan: data.project?.planLabel || '', notes: data.defaults?.notes || '',
        totalProjectCost: data.project?.totalCost ? String(data.project.totalCost) : (data.summary.totalCostSet ? String(data.summary.totalCost) : ''),
      });
      setItems([{ description: '', amount: '' }]); setErrors({}); setCtxState('ready');
    } catch (err) {
      setCtx(null); setCtxState('error');
      setBanner({ type: 'error', text: err.response?.data?.message || 'Could not load this client. Try again.' });
    }
  }, []);
  useEffect(() => { if (presetClientId) loadContext(presetClientId); }, [presetClientId, loadContext]);

  const clearErr = (...paths) => setErrors((e) => { const n = { ...e }; paths.forEach((p) => delete n[p]); return n; });
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })); clearErr(k, k === 'totalProjectCost' ? 'amountReceived' : k); setBanner(null); };
  const setItem = (i, k, v) => { setItems((rows) => rows.map((r, j) => (j === i ? { ...r, [k]: v } : r))); clearErr(`items.${i}.${k}`, 'items', 'amountReceived'); setBanner(null); };
  const addRow = () => setItems((rows) => (rows.length < MAX_ROWS ? [...rows, { description: '', amount: '' }] : rows));
  const removeRow = (i) => setItems((rows) => (rows.length > 1 ? rows.filter((_, j) => j !== i) : rows));

  const pickInvoice = (e) => {
    const id = e.target.value;
    setForm((f) => ({ ...f, invoiceId: id }));
    const inv = ctx?.dueInvoices.find((x) => x._id === id);
    if (inv) setItems([{ description: inv.description, amount: String(inv.amount) }]);
    clearErr('items', 'amountReceived');
  };

  // live figures (the server repeats every one of these checks)
  const thisPaise = items.reduce((s, r) => s + (isAmount(r.amount) ? paise(r.amount) : 0), 0);
  const totalOk = isAmount(form.totalProjectCost);
  const totalPaise = totalOk ? paise(form.totalProjectCost) : 0;
  const beforePaise = paise(ctx?.summary.received || 0);
  const balancePaise = totalPaise - beforePaise - thisPaise;
  const statusKey = balancePaise <= 0 ? 'paid_in_full' : 'part_payment';
  const invoice = ctx?.dueInvoices.find((x) => x._id === form.invoiceId);
  const overpaid = totalOk && thisPaise > 0 && balancePaise < 0;

  const submit = async (confirmDuplicate = false) => {
    setBusy(true); setBanner(null); setErrors({});
    const payload = {
      ...form, clientId,
      items: items.map((r) => ({ description: r.description, amount: r.amount === '' ? '' : Number(r.amount) })),
      totalProjectCost: totalOk ? Number(form.totalProjectCost) : undefined,
      invoiceId: form.invoiceId || undefined, idempotencyKey: key.current, confirmDuplicate,
    };
    try {
      const { data } = await api.post('/owner/receipts', payload);
      onSaved(data.receipt);
    } catch (err) {
      const d = err.response?.data;
      if (d?.errors) setErrors(d.errors);
      setBanner({ type: d?.code === 'possible_duplicate' ? 'warn' : 'error', code: d?.code, text: d?.message || 'Could not save the receipt. Check your connection and try again.' });
    } finally { setBusy(false); }
  };

  const fe = (path) => errors[path] && <em className="rc-err" role="alert">{errors[path]}</em>;
  const noProject = ctxState === 'ready' && !ctx.project;
  const canSubmit = ctxState === 'ready' && !noProject && !busy;

  return (
    <form className="rc-form" onSubmit={(e) => { e.preventDefault(); if (canSubmit) submit(false); }} noValidate>
      <div className="panel">
        <h3 className="section-title">1 · Received from</h3>
        <div className="form-row">
          <div style={{ flex: '1 1 100%' }}>
            <label htmlFor="rc-client">Client</label>
            <select id="rc-client" value={clientId} onChange={(e) => { setClientId(e.target.value); loadContext(e.target.value); }}>
              <option value="">Select a client…</option>
              {clients.map((c) => <option key={c._id} value={c._id}>{c.businessName || c.fullName}{c.clientId ? ` (${c.clientId})` : ''}</option>)}
            </select>
          </div>
        </div>
        {ctxState === 'loading' && <p className="muted">Loading client…</p>}
        {noProject && <p className="error-text" role="alert">This client has no project yet. Go to Clients → select the client → Project → Save project, then come back.</p>}
        {ctxState === 'ready' && (
          <div className="form-row">
            <div><label htmlFor="rc-cn">Client name</label><input id="rc-cn" value={form.clientName} maxLength={80} onChange={set('clientName')} aria-invalid={!!errors.clientName} />{fe('clientName')}</div>
            <div><label htmlFor="rc-cb">Business / institution</label><input id="rc-cb" value={form.clientBusiness} maxLength={100} onChange={set('clientBusiness')} />{fe('clientBusiness')}</div>
            <div><label htmlFor="rc-cp">Phone / WhatsApp</label><input id="rc-cp" value={form.clientPhone} maxLength={30} onChange={set('clientPhone')} />{fe('clientPhone')}</div>
            <div><label htmlFor="rc-ce">Email</label><input id="rc-ce" type="email" value={form.clientEmail} maxLength={120} onChange={set('clientEmail')} aria-invalid={!!errors.clientEmail} />{fe('clientEmail')}</div>
          </div>
        )}
      </div>

      {ctxState === 'ready' && !noProject && (
        <>
          <div className="panel">
            <h3 className="section-title">2 · Payment details</h3>
            <div className="form-row">
              <div>
                <label htmlFor="rc-mode">Payment mode</label>
                <select id="rc-mode" value={form.paymentMode} onChange={set('paymentMode')}>{MODES.map((m) => <option key={m}>{m}</option>)}</select>
                {fe('paymentMode')}
              </div>
              <div><label htmlFor="rc-ref">Transaction / reference ID</label><input id="rc-ref" value={form.transactionId} maxLength={60} onChange={set('transactionId')} placeholder="UPI / bank reference" />{fe('transactionId')}</div>
              <div><label htmlFor="rc-date">Payment date</label><input id="rc-date" type="date" value={form.paymentDate} max={todayIST()} onChange={set('paymentDate')} aria-invalid={!!errors.paymentDate} />{fe('paymentDate')}</div>
              <div><label htmlFor="rc-plan">Project / plan</label><input id="rc-plan" value={form.projectPlan} maxLength={80} onChange={set('projectPlan')} />{fe('projectPlan')}</div>
            </div>
            {ctx.dueInvoices.length > 0 && (
              <div className="form-row">
                <div style={{ flex: '1 1 100%' }}>
                  <label htmlFor="rc-inv">Settles invoice (optional) — marks that invoice paid</label>
                  <select id="rc-inv" value={form.invoiceId} onChange={pickInvoice}>
                    <option value="">None — a normal payment against the project</option>
                    {ctx.dueInvoices.map((i) => <option key={i._id} value={i._id}>{i.label} · {i.description} · ₹{inr(i.amount)}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="panel">
            <h3 className="section-title">3 · What this payment covers</h3>
            {fe('items')}
            <datalist id="rc-suggest">{SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
            <div className="rc-items" role="group" aria-label="Payment description rows">
              <div className="rc-items-head" aria-hidden="true"><span>#</span><span>Description</span><span>Amount (₹)</span><span /></div>
              {items.map((r, i) => (
                <div className="rc-item" key={i}>
                  <span className="rc-n">{i + 1}</span>
                  <div>
                    <input aria-label={`Description ${i + 1}`} list="rc-suggest" maxLength={120} value={r.description} onChange={(e) => setItem(i, 'description', e.target.value)} placeholder="e.g. Website development — advance payment" aria-invalid={!!errors[`items.${i}.description`]} />
                    {fe(`items.${i}.description`)}
                  </div>
                  <div>
                    <input aria-label={`Amount ${i + 1}`} inputMode="decimal" value={r.amount} onChange={(e) => setItem(i, 'amount', e.target.value)} placeholder="0" aria-invalid={!!errors[`items.${i}.amount`]} />
                    {fe(`items.${i}.amount`)}
                  </div>
                  <button type="button" className="btn-sm ghost" aria-label={`Remove row ${i + 1}`} onClick={() => removeRow(i)} disabled={items.length === 1}>✕</button>
                </div>
              ))}
            </div>
            <button type="button" className="btn-sm ghost" onClick={addRow} disabled={items.length >= MAX_ROWS}>+ Add row</button>
            <span className="muted" style={{ marginLeft: 8, fontSize: 12.5 }}>up to {MAX_ROWS} rows</span>
            {invoice && thisPaise !== paise(invoice.amount) && thisPaise > 0 && (
              <p className="error-text" role="alert" style={{ marginTop: 10 }}>Rows must total exactly ₹{inr(invoice.amount)} to settle {invoice.label}.</p>
            )}
          </div>

          <div className="panel">
            <h3 className="section-title">4 · Summary</h3>
            <div className="rc-sum">
              <div className="rc-sum-row">
                <label htmlFor="rc-total">Total project cost (₹)</label>
                <input id="rc-total" inputMode="decimal" value={form.totalProjectCost} onChange={set('totalProjectCost')} placeholder="e.g. 20000" aria-invalid={!!errors.totalProjectCost} />
                {fe('totalProjectCost')}
              </div>
              <div className="rc-sum-row"><span>Received earlier on this project</span><strong>₹{inr(ctx.summary.received)}</strong></div>
              <div className="rc-sum-row"><span>Amount received (this receipt)</span><strong>₹{inr(thisPaise / 100)}</strong></div>
              <div className={`rc-sum-row rc-balance${balancePaise < 0 ? ' credit' : ''}`}>
                <span>{balancePaise < 0 ? 'Credit (overpaid)' : 'Balance due'}</span><strong>{totalOk && thisPaise > 0 ? `₹${inr(Math.abs(balancePaise) / 100)}` : '—'}</strong>
              </div>
              {totalOk && thisPaise > 0 && <div className="rc-sum-row"><span>Status on this receipt</span><span className={`tag ${STATUS[statusKey].tag}`}>{STATUS[statusKey].label}</span></div>}
            </div>
            {!totalOk && <p className="muted">Enter the total project cost to see the balance. It is saved on the project for next time.</p>}
            {overpaid && (
              <label className="rc-check">
                <input type="checkbox" checked={form.allowOverpayment} onChange={set('allowOverpayment')} /> Allow overpayment (credit) — this receipt is ₹{inr(Math.abs(balancePaise) / 100)} more than the balance due
              </label>
            )}
            {fe('amountReceived')}

            <div className="form-row" style={{ marginTop: 14 }}>
              <div style={{ flex: '1 1 100%' }}>
                <label htmlFor="rc-notes">Notes (optional, printed on the receipt)</label>
                <textarea id="rc-notes" rows={2} maxLength={300} value={form.notes} onChange={set('notes')} className="rc-textarea" />
                {fe('notes')}
              </div>
            </div>
          </div>
        </>
      )}

      {banner && (
        <div className={`rc-banner ${banner.type}`} role="alert">
          <span>{banner.text}</span>
          {banner.code === 'possible_duplicate' && <button type="button" className="btn-sm primary" onClick={() => submit(true)} disabled={busy}>Create anyway</button>}
        </div>
      )}

      <div className="rc-actions">
        <span className="muted">The receipt is saved first — then you can preview, download or print it.</span>
        <button type="button" className="btn-sm ghost" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="submit" className="btn-sm primary" disabled={!canSubmit}>{busy ? 'Saving…' : 'Create receipt'}</button>
      </div>
    </form>
  );
}

// ================= the tab =================
const EMPTY_FILTERS = { q: '', mode: '', status: '', from: '', to: '' };

export default function ReceiptsTab({ initialClientId, onInitialClientUsed, onChanged }) {
  const [view, setView] = useState(initialClientId ? 'create' : 'list');
  const [presetClient, setPresetClient] = useState(initialClientId || '');
  const [clients, setClients] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1, totals: { count: 0, amount: 0 } });
  const [state, setState] = useState('loading'); // loading | ready | error
  const [preview, setPreview] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [reason, setReason] = useState('');
  const [voidErr, setVoidErr] = useState('');
  const [voidBusy, setVoidBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => { api.get('/owner/clients').then((r) => setClients(r.data.clients || [])).catch(() => {}); }, []);
  // the client chosen from a profile only applies to this visit: forget it when the owner leaves the tab
  useEffect(() => () => { if (initialClientId) onInitialClientUsed?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 6000); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    const t = setTimeout(() => { setApplied(filters); setPage(1); }, filters.q === applied.q ? 0 : 350);
    return () => clearTimeout(t);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    setState('loading');
    const params = { ...Object.fromEntries(Object.entries(applied).filter(([, v]) => v)), page, limit: 15 };
    api.get('/owner/receipts', { params }).then((r) => { setData(r.data); setState('ready'); }).catch(() => setState('error'));
  }, [applied, page]);
  useEffect(() => { if (view === 'list') load(); }, [load, view]);

  const filtered = useMemo(() => Object.values(applied).some(Boolean), [applied]);
  const setF = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const run = async (fn, r) => { try { await fn(r); } catch { setToast({ type: 'error', text: 'Could not open that receipt. Please try again.' }); } };

  const saved = (receipt) => {
    setView('list'); setPresetClient('');
    setToast({ type: 'ok', text: `Receipt ${receipt.receiptNumber} created.` });
    setPreview(receipt);
    onChanged?.();
  };

  const confirmVoid = async () => {
    setVoidBusy(true); setVoidErr('');
    try {
      await api.post(`/owner/receipts/${voiding._id}/void`, { reason });
      setToast({ type: 'ok', text: `Receipt ${voiding.receiptNumber} cancelled.` });
      setVoiding(null); setReason(''); load(); onChanged?.();
    } catch (err) { setVoidErr(err.response?.data?.message || 'Could not cancel this receipt.'); } finally { setVoidBusy(false); }
  };

  if (view === 'create') {
    return (
      <div className="rc-wrap">
        <ReceiptForm clients={clients} presetClientId={presetClient} onCancel={() => { setView('list'); setPresetClient(''); }} onSaved={saved} />
      </div>
    );
  }

  return (
    <div className="rc-wrap">
      <div className="rc-top">
        <div className="rc-total-strip" aria-live="polite">
          {state === 'ready' ? <><strong>{data.totals.count}</strong> receipt{data.totals.count === 1 ? '' : 's'} · <strong>₹{inr(data.totals.amount)}</strong> received{filtered ? ' (filtered)' : ''}</> : ' '}
        </div>
        <button type="button" className="btn-sm primary" onClick={() => setView('create')}>+ Create receipt</button>
      </div>
      {toast && <p className={`rc-toast ${toast.type}`} role="status">{toast.text}</p>}

      <div className="rc-filters">
        <div className="rc-f-search"><label htmlFor="rc-q">Search</label><input id="rc-q" type="search" placeholder="Receipt no., client, reference or verification ID" value={filters.q} onChange={setF('q')} /></div>
        <div><label htmlFor="rc-fm">Payment mode</label><select id="rc-fm" value={filters.mode} onChange={setF('mode')}><option value="">All modes</option>{MODES.map((m) => <option key={m}>{m}</option>)}</select></div>
        <div><label htmlFor="rc-fs">Status</label><select id="rc-fs" value={filters.status} onChange={setF('status')}><option value="">All statuses</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        <div><label htmlFor="rc-ff">Paid from</label><input id="rc-ff" type="date" value={filters.from} max={filters.to || undefined} onChange={setF('from')} /></div>
        <div><label htmlFor="rc-ft">Paid to</label><input id="rc-ft" type="date" value={filters.to} min={filters.from || undefined} onChange={setF('to')} /></div>
        {filtered && <button type="button" className="btn-sm ghost" onClick={() => { setFilters(EMPTY_FILTERS); setApplied(EMPTY_FILTERS); setPage(1); }}>Clear filters</button>}
      </div>

      {state === 'error' && <p className="error-text" role="alert">Could not load receipts. <button type="button" className="btn-sm ghost" onClick={load}>Try again</button></p>}
      {state === 'loading' && !data.items.length && <p className="muted rc-center">Loading receipts…</p>}
      {state === 'ready' && !data.items.length && (
        <div className="panel rc-empty">
          <p>{filtered ? 'No receipts match these filters.' : 'No receipts yet.'}</p>
          {!filtered && <button type="button" className="btn-sm primary" onClick={() => setView('create')}>Create your first receipt</button>}
        </div>
      )}

      {data.items.length > 0 && (
        <ul className={`rc-list${state === 'loading' ? ' busy' : ''}`}>
          {data.items.map((r) => {
            const st = STATUS[r.statusKey] || STATUS.part_payment;
            return (
              <li key={r._id} className={`rc-row${r.voided ? ' void' : ''}`}>
                <div className="rc-c1"><strong>{r.receiptNumber}</strong><span className="muted">{fmtDate(r.paymentDate)}</span></div>
                <div className="rc-c2"><span>{r.clientBusiness || r.clientName}</span><span className="muted">{r.paymentMode}{r.transactionId ? ` · ${r.transactionId}` : ''}</span></div>
                <div className="rc-c3"><strong>₹{inr(r.amountReceived)}</strong><span className="muted">{r.balanceDue < 0 ? `Credit ₹${inr(-r.balanceDue)}` : `Balance ₹${inr(r.balanceDue)}`}</span></div>
                <div className="rc-c4"><span className={`tag ${st.tag}`}>{st.label}</span></div>
                <div className="rc-c5">
                  <button type="button" className="btn-sm ghost" onClick={() => setPreview(r)}>Preview</button>
                  <button type="button" className="btn-sm ghost" onClick={() => run(downloadReceipt, r)}>PDF</button>
                  <button type="button" className="btn-sm ghost" onClick={() => run(printReceipt, r)}>Print</button>
                  {!r.voided && <button type="button" className="btn-sm reject" onClick={() => { setVoiding(r); setReason(''); setVoidErr(''); }}>Cancel</button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data.total > 0 && (
        <div className="rc-pager">
          <span>{data.total} {data.total === 1 ? 'receipt' : 'receipts'}</span>
          <button type="button" className="btn-sm ghost" disabled={page <= 1 || state === 'loading'} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {data.page || page} of {data.pages}</span>
          <button type="button" className="btn-sm ghost" disabled={page >= data.pages || state === 'loading'} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}

      {preview && <ReceiptPreview receipt={preview} onClose={() => setPreview(null)} />}

      {voiding && (
        <div className="rc-modal-back" role="presentation">
          <div className="rc-modal rc-small" role="dialog" aria-modal="true" aria-label={`Cancel receipt ${voiding.receiptNumber}`}>
            <h3 className="section-title" style={{ marginTop: 0 }}>Cancel {voiding.receiptNumber}?</h3>
            <p className="muted">The receipt stays on record as <strong>Cancelled</strong> and its ₹{inr(voiding.amountReceived)} is removed from the project's payments{voiding.invoice ? '; the linked invoice becomes unpaid again' : ''}. This cannot be undone — create a new receipt if needed.</p>
            <label htmlFor="rc-reason">Reason</label>
            <input id="rc-reason" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Entered twice" autoFocus />
            {voidErr && <p className="error-text" role="alert">{voidErr}</p>}
            <div className="rc-actions">
              <button type="button" className="btn-sm ghost" onClick={() => setVoiding(null)} disabled={voidBusy}>Keep receipt</button>
              <button type="button" className="btn-sm reject" onClick={confirmVoid} disabled={voidBusy || reason.trim().length < 3}>{voidBusy ? 'Cancelling…' : 'Cancel receipt'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
