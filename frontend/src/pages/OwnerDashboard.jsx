import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import NotificationBell from '../components/NotificationBell.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import FileRow from '../components/FileRow.jsx';
import groupDeliverables from '../utils/groupDeliverables.js';
import downloadInvoicePdf from '../utils/downloadInvoicePdf.js';
import { formatINR, invoiceLabel, isOverdue, initials } from '../utils/format.js';
import TicketThread from '../components/TicketThread.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { SkeletonStatGrid, SkeletonRows } from '../components/Skeleton.jsx';
import timeAgo from '../utils/timeAgo.js';
import downloadReceiptPdf from '../utils/downloadReceiptPdf.js';
import SettingsTab from '../components/SettingsTab.jsx';
import AuditLogTab from '../components/AuditLogTab.jsx';
import '../styles/theme.css';
import '../styles/dashboard.css';
import '../styles/owner-tools.css';

const STAGE_OPTIONS = ['discovery', 'design', 'development', 'review', 'live'];

const PAYMENT_MODES = ['UPI', 'Bank transfer', 'Cash', 'Cheque', 'Card', 'Other'];

export default function OwnerDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [overview, setOverview] = useState(null);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const [clients, setClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientSort, setClientSort] = useState('name'); // 'name' | 'balance'
  const [detail, setDetail] = useState(null);
  const [projectForm, setProjectForm] = useState({ name: '', planLabel: '', stage: 'discovery', nextMilestoneLabel: '', nextMilestoneDate: '', stagingUrl: '', statusNote: '' });
  const emptyFileForm = { file: null, name: '', type: 'Document', versionLabel: '' };
  const [fileForm, setFileForm] = useState(emptyFileForm);
  const [fileInputKey, setFileInputKey] = useState(0); // bumping this clears the native file input
  const [uploading, setUploading] = useState(false);
  const [invoiceForm, setInvoiceForm] = useState({ description: '', amount: '', dueDate: '', paymentLink: '' });
  const [payingId, setPayingId] = useState(null); // which invoice's payment-details form is open
  const [payDraft, setPayDraft] = useState({ paymentMode: 'UPI', transactionId: '', markPaid: false });
  const [editingLinkId, setEditingLinkId] = useState(null); // which invoice's payment link is being edited
  const [linkDraft, setLinkDraft] = useState('');

  const [leads, setLeads] = useState([]);
  const [tickets, setTickets] = useState([]); // all tickets across every client
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [leadsLoading, setLeadsLoading] = useState(true);

  const loadOverview = async () => {
    try {
      const { data } = await api.get('/owner/overview');
      setOverview(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadActivity = async () => {
    setActivityLoading(true);
    try {
      const { data } = await api.get('/owner/activity');
      setActivity(data.activity);
    } finally {
      setActivityLoading(false);
    }
  };

  const loadPending = async () => {
    setPendingLoading(true);
    try {
      const { data } = await api.get('/owner/pending-requests');
      setPending(data.requests);
    } finally {
      setPendingLoading(false);
    }
  };

  const loadClients = async () => {
    setClientsLoading(true);
    try {
      const { data } = await api.get('/owner/clients');
      setClients(data.clients);
    } finally {
      setClientsLoading(false);
    }
  };

  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      const { data } = await api.get('/owner/tickets');
      setTickets(data.tickets);
    } finally {
      setTicketsLoading(false);
    }
  };

  const loadLeads = async () => {
    setLeadsLoading(true);
    try {
      const { data } = await api.get('/owner/leads');
      setLeads(data.leads);
    } finally {
      setLeadsLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    loadActivity();
    loadPending();
    loadClients();
    loadLeads();
    loadTickets();
  }, []);

  const closeClient = () => {
    setSelectedId(null);
    setDetail(null);
  };

  const openClient = async (id) => {
    setSelectedId(id);
    setFileForm(emptyFileForm);
    setFileInputKey((k) => k + 1);
    const { data } = await api.get(`/owner/clients/${id}`);
    setDetail(data);
    setProjectForm({
      name: data.project?.name || `${data.client.businessName || data.client.fullName} — Website`,
      planLabel: data.project?.planLabel || '',
      stage: data.project?.stage || 'discovery',
      nextMilestoneLabel: data.project?.nextMilestoneLabel || '',
      nextMilestoneDate: data.project?.nextMilestoneDate ? data.project.nextMilestoneDate.slice(0, 10) : '',
      stagingUrl: data.project?.stagingUrl || '',
      statusNote: data.project?.statusNote || '',
    });
  };

  const handleApprove = async (id) => {
    setActingId(id);
    try {
      await api.post(`/owner/approve/${id}`);
      setPending((prev) => prev.filter((r) => r._id !== id));
      loadOverview();
      loadClients();
    } catch (err) {
      alert(err.response?.data?.message || 'Approval failed');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!window.confirm('Reject this request?')) return;
    setActingId(id);
    try {
      await api.post(`/owner/reject/${id}`);
      setPending((prev) => prev.filter((r) => r._id !== id));
      loadOverview();
    } catch (err) {
      alert(err.response?.data?.message || 'Rejection failed');
    } finally {
      setActingId(null);
    }
  };

  const saveProject = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post(`/owner/clients/${selectedId}/project`, projectForm);
      setDetail((prev) => ({ ...prev, project: data.project }));
      loadClients();
      loadOverview();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save project');
    }
  };

  const addInvoice = async (e) => {
    e.preventDefault();
    if (!invoiceForm.description || !invoiceForm.amount) return;
    try {
      const { data } = await api.post(`/owner/clients/${selectedId}/invoices`, {
        ...invoiceForm,
        amount: Number(invoiceForm.amount),
      });
      setDetail((prev) => ({ ...prev, invoices: [data.invoice, ...prev.invoices] }));
      setInvoiceForm({ description: '', amount: '', dueDate: '', paymentLink: '' });
      loadClients();
      loadOverview();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not add invoice');
    }
  };

  const replaceInvoice = (updated) =>
    setDetail((prev) => ({ ...prev, invoices: prev.invoices.map((inv) => (inv._id === updated._id ? updated : inv)) }));

  // "Mark paid" now asks how it was paid first — that is what gets printed on the receipt.
  const toggleInvoicePaid = async (invoice) => {
    if (invoice.status === 'due') {
      setPayingId(invoice._id);
      setPayDraft({ paymentMode: invoice.paymentMode || 'UPI', transactionId: invoice.transactionId || '', markPaid: true });
      return;
    }
    try {
      const { data } = await api.patch(`/owner/invoices/${invoice._id}`, { status: 'due' });
      replaceInvoice(data.invoice);
      loadClients();
      loadOverview();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update invoice');
    }
  };

  const editPaymentDetails = (invoice) => {
    setPayingId(invoice._id);
    setPayDraft({ paymentMode: invoice.paymentMode || 'UPI', transactionId: invoice.transactionId || '', markPaid: false });
  };

  const savePayment = async (invoice) => {
    try {
      const body = { paymentMode: payDraft.paymentMode, transactionId: payDraft.transactionId.trim() };
      if (payDraft.markPaid) body.status = 'paid';
      const { data } = await api.patch(`/owner/invoices/${invoice._id}`, body);
      replaceInvoice(data.invoice);
      setPayingId(null);
      loadClients();
      loadOverview();
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save the payment details');
    }
  };

  const downloadOwnerReceipt = async (invoice) => {
    try {
      await downloadReceiptPdf('owner', invoice);
    } catch {
      alert('Could not download that receipt.');
    }
  };

  const saveInvoiceLink = async (invoice) => {
    try {
      const { data } = await api.patch(`/owner/invoices/${invoice._id}`, { paymentLink: linkDraft.trim() });
      setDetail((prev) => ({
        ...prev,
        invoices: prev.invoices.map((inv) => (inv._id === invoice._id ? data.invoice : inv)),
      }));
      setEditingLinkId(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Could not save the payment link');
    }
  };

  const downloadOwnerPdf = async (invoice) => {
    try {
      await downloadInvoicePdf('owner', invoice);
    } catch {
      alert('Could not download that invoice PDF.');
    }
  };

  const updateLead = async (id, status) => {
    try {
      await api.patch(`/owner/leads/${id}`, { status });
      setLeads((prev) => prev.map((l) => (l._id === id ? { ...l, status } : l)));
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update lead');
    }
  };

  const uploadFile = async (e) => {
    e.preventDefault();
    if (!fileForm.file) return;
    if (fileForm.file.size > 10 * 1024 * 1024) {
      alert('That file is over the 10 MB limit.');
      return;
    }

    const body = new FormData();
    body.append('file', fileForm.file);
    if (fileForm.name.trim()) body.append('name', fileForm.name.trim());
    body.append('type', fileForm.type);
    if (fileForm.versionLabel.trim()) body.append('versionLabel', fileForm.versionLabel.trim());

    setUploading(true);
    try {
      const { data } = await api.post(`/owner/clients/${selectedId}/deliverables`, body);
      setDetail((prev) => ({ ...prev, deliverables: [data.deliverable, ...prev.deliverables] }));
      setFileForm(emptyFileForm);
      setFileInputKey((k) => k + 1);
    } catch (err) {
      alert(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const replyToTicket = async (id, message) => {
    const { data } = await api.post(`/owner/tickets/${id}/reply`, { message });
    setTickets((prev) => prev.map((t) => (t._id === id ? data.ticket : t)));
  };

  const toggleTicketStatus = async (ticket) => {
    const next = ticket.status === 'closed' ? 'open' : 'closed';
    try {
      const { data } = await api.patch(`/owner/tickets/${ticket._id}`, { status: next });
      setTickets((prev) => prev.map((t) => (t._id === ticket._id ? data.ticket : t)));
    } catch (err) {
      alert(err.response?.data?.message || 'Could not update ticket');
    }
  };

  const getHeader = () => {
    switch (tab) {
      case 'overview':
        return { title: 'Studio overview', sub: "Everything moving across Codexora's active client base." };
      case 'pending':
        return { title: 'Pending approval requests', sub: 'Review new client sign-ups before granting portal access.', pill: `${pending.length} awaiting review` };
      case 'clients':
        return { title: 'Clients', sub: 'Select a client to manage their project and invoices.' };
      case 'support':
        return { title: 'Support tickets', sub: 'Replies here notify the client and update their dashboard immediately.', pill: `${tickets.filter((t) => t.status === 'open').length} open` };
      case 'leads':
        return { title: 'Website leads', sub: 'Contact-form submissions from codexorasolutions.online.' };
      case 'audit':
        return { title: 'Audit log', sub: 'A record of who approved, changed or deleted what, and when.' };
      case 'settings':
        return { title: 'Settings', sub: 'Business details, receipts and the wording of client emails.' };
      default:
        return { title: '', sub: '' };
    }
  };

  const signOut = () => {
    localStorage.removeItem('cx_token');
    localStorage.removeItem('cx_user');
    navigate('/login');
  };

  return (
    <div className="app">
      <div className={`mobile-backdrop ${mobileNavOpen ? 'show' : ''}`} onClick={() => setMobileNavOpen(false)}></div>
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand" style={{ marginBottom: 0 }}>
          <div className="mark">CX</div>
          <div className="name" style={{ color: '#F5F6F1' }}>Codexora</div>
        </div>
        <nav>
          <a className={tab === 'overview' ? 'on' : ''} onClick={() => { setTab('overview'); setMobileNavOpen(false); }}>
            <span className="nav-icon">📊</span>Overview
          </a>
          <a className={tab === 'pending' ? 'on' : ''} onClick={() => { setTab('pending'); setMobileNavOpen(false); }}>
            <span className="nav-icon">⏳</span>Pending approvals{pending.length > 0 && <span className="badge">{pending.length}</span>}
          </a>
          <a className={tab === 'clients' ? 'on' : ''} onClick={() => { setTab('clients'); setMobileNavOpen(false); }}>
            <span className="nav-icon">👥</span>Clients
          </a>
          <a className={tab === 'support' ? 'on' : ''} onClick={() => { setTab('support'); setMobileNavOpen(false); }}>
            <span className="nav-icon">💬</span>Support{tickets.filter((t) => t.status === 'open').length > 0 && <span className="badge">{tickets.filter((t) => t.status === 'open').length}</span>}
          </a>
          <a className={tab === 'leads' ? 'on' : ''} onClick={() => { setTab('leads'); setMobileNavOpen(false); }}>
            <span className="nav-icon">📬</span>Website leads
          </a>
          <a className={tab === 'audit' ? 'on' : ''} onClick={() => { setTab('audit'); setMobileNavOpen(false); }}>
            <span className="nav-icon">🧾</span>Audit log
          </a>
          <a className={tab === 'settings' ? 'on' : ''} onClick={() => { setTab('settings'); setMobileNavOpen(false); }}>
            <span className="nav-icon">⚙️</span>Settings
          </a>
        </nav>
        <div className="idbox owner-idbox">
          <div className="owner-avatar">CX</div>
          <div>
            <div className="owner-idbox-label">Owner access</div>
            <a href="#" className="owner-signout" onClick={(e) => { e.preventDefault(); signOut(); }}>Sign out</a>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topline owner-topline">
          <button className="mobile-menu-btn" onClick={() => setMobileNavOpen((o) => !o)} aria-label="Menu">☰</button>
          <div>
            <h2>{getHeader().title}</h2>
            <div className="sub">{getHeader().sub}</div>
          </div>
          <div className="owner-topline-right">
            {getHeader().pill && <span className="pill">{getHeader().pill}</span>}
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>

        {tab === 'overview' && (
          <>
            {overview ? (
              <div className="stat-grid">
                <div className="stat"><div className="stat-icon">👥</div><div className="num">{overview.activeClients}</div><div className="lab">Active clients</div></div>
                <div className="stat"><div className="stat-icon">⏳</div><div className="num">{overview.pendingApprovals}</div><div className="lab">Pending approvals</div></div>
                <div className="stat"><div className="stat-icon">🛠️</div><div className="num">{overview.activeProjects}</div><div className="lab">Projects in progress</div></div>
                <div className="stat"><div className="stat-icon">💰</div><div className="num">₹{overview.outstandingInvoices.toLocaleString()}</div><div className="lab">Outstanding invoices</div></div>
              </div>
            ) : <SkeletonStatGrid />}

            <div className="row2" style={{ marginTop: 22 }}>
              <div className="panel">
                <h3 className="section-title">Active projects</h3>
                {clientsLoading ? (
                  <SkeletonRows count={3} columns={3} />
                ) : clients.filter((c) => c.projectStage && c.projectStage !== 'live').length === 0 ? (
                  <EmptyState icon="🛠️" title="No projects in progress" hint="Projects you set up from the Clients tab will show up here." />
                ) : (
                  <ul className="list">
                    {clients.filter((c) => c.projectStage && c.projectStage !== 'live').slice(0, 5).map((c) => (
                      <li key={c._id} className="client-row" onClick={() => { setTab('clients'); openClient(c._id); }}>
                        <span>{c.businessName || c.fullName}</span>
                        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <span className="tag wip">{c.projectStage}</span>
                          {c.balanceDue > 0 && <span className="muted">₹{c.balanceDue.toLocaleString()} due</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {clients.length > 5 && (
                  <button className="show-earlier" onClick={() => setTab('clients')}>View all clients →</button>
                )}
              </div>

              <div className="panel">
                <h3 className="section-title">Recent activity</h3>
                {activityLoading ? (
                  <SkeletonRows count={4} columns={1} />
                ) : activity.length === 0 ? (
                  <EmptyState icon="🕘" title="No activity yet" hint="Approvals, invoices, and file shares will show up here." />
                ) : (
                  <ul className="activity-feed">
                    {activity.map((a) => (
                      <li key={a._id}>
                        <span className={`activity-dot ${a.type}`}></span>
                        <div>
                          <div className="activity-msg">
                            <b>{a.client?.businessName || a.client?.fullName || 'A client'}</b> — {a.message}
                          </div>
                          <div className="activity-time">{timeAgo(a.createdAt)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}

        {tab === 'pending' && (
          <>
            <div className="panel">
              {pendingLoading && <SkeletonRows count={3} columns={4} />}
              {!pendingLoading && pending.length === 0 && <EmptyState icon="✅" title="No pending requests" hint="New client sign-ups will show up here for review." />}
              {!pendingLoading && pending.length > 0 && (
                <table>
                  <thead><tr><th>Business</th><th>Type</th><th>Contact</th><th>Email</th><th>Requested</th><th></th></tr></thead>
                  <tbody>
                    {pending.map((r) => (
                      <tr key={r._id}>
                        <td>{r.businessName || '—'}</td>
                        <td>{r.businessType}</td>
                        <td>{r.fullName}<br /><span className="muted">{r.phone}</span></td>
                        <td>{r.email}</td>
                        <td>{timeAgo(r.createdAt)}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn-sm approve" disabled={actingId === r._id} onClick={() => handleApprove(r._id)}>Approve</button>
                          <button className="btn-sm reject" disabled={actingId === r._id} onClick={() => handleReject(r._id)}>Reject</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'clients' && (
          <div className="clients-layout">
            <div className="clients-list-col">
              <input
                className="client-search"
                placeholder="Search by name or client ID…"
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
              />
              <div className="client-sort-row">
                <span className="muted" style={{ fontSize: 11.5 }}>Sort by</span>
                <button className={`sort-chip ${clientSort === 'name' ? 'on' : ''}`} onClick={() => setClientSort('name')}>Name</button>
                <button className={`sort-chip ${clientSort === 'balance' ? 'on' : ''}`} onClick={() => setClientSort('balance')}>Balance due</button>
              </div>
              <div className="panel client-list-panel">
                {clientsLoading && <SkeletonRows count={4} columns={1} />}
                {!clientsLoading && clients.length === 0 && <EmptyState icon="🧑\u200d💼" title="No approved clients yet" hint="Approve a pending request and they\u2019ll show up here." />}
                {!clientsLoading && clients.length > 0 && (() => {
                  const q = clientSearch.trim().toLowerCase();
                  const filtered = !q ? [...clients] : clients.filter((c) =>
                    (c.businessName || '').toLowerCase().includes(q) ||
                    (c.fullName || '').toLowerCase().includes(q) ||
                    (c.clientId || '').toLowerCase().includes(q)
                  );
                  filtered.sort((a, b) =>
                    clientSort === 'balance'
                      ? b.balanceDue - a.balanceDue
                      : (a.businessName || a.fullName || '').localeCompare(b.businessName || b.fullName || '')
                  );
                  if (filtered.length === 0) {
                    return <p className="muted" style={{ padding: '10px 4px' }}>No clients match "{clientSearch}".</p>;
                  }
                  return filtered.map((c) => (
                    <div key={c._id} className={`client-card ${selectedId === c._id ? 'selected' : ''}`} onClick={() => openClient(c._id)}>
                      <div className="client-avatar">{initials(c.businessName || c.fullName)}</div>
                      <div className="client-card-body">
                        <div className="client-card-name">{c.businessName || c.fullName}</div>
                        <div className="client-card-meta">{c.clientId}{c.businessType ? ` · ${c.businessType}` : ''}</div>
                      </div>
                      <div className="client-card-right">
                        {c.projectStage ? <span className="tag wip">{c.projectStage}</span> : <span className="muted" style={{ fontSize: 11 }}>no project</span>}
                        {c.balanceDue > 0 && <div className="balance-due">₹{c.balanceDue.toLocaleString()} due</div>}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="clients-detail-col">
            {!detail ? (
              <div className="panel"><EmptyState icon="👈" title="Select a client" hint="Pick someone from the list to manage their project, invoices, and files." /></div>
            ) : (
              <>
              <div className="panel detail-header-panel">
                <div className="detail-header">
                  <div className="client-avatar lg">{initials(detail.client.businessName || detail.client.fullName)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 className="detail-header-name">{detail.client.businessName || detail.client.fullName}</h3>
                    <div className="muted">
                      {detail.client.clientId}
                      {detail.client.email ? ` · ${detail.client.email}` : ''}
                      {detail.client.phone ? ` · ${detail.client.phone}` : ''}
                    </div>
                  </div>
                  <button className="btn-sm ghost" onClick={closeClient}>← Back to all clients</button>
                </div>
              </div>
              {(() => {
                const clientActivity = activity.filter((a) => a.client && String(a.client._id) === String(detail.client._id));
                if (clientActivity.length === 0) return null;
                return (
                  <div className="panel" style={{ marginBottom: 22 }}>
                    <h3 className="section-title">🕘 Recent activity</h3>
                    <ul className="activity-feed">
                      {clientActivity.slice(0, 4).map((a) => (
                        <li key={a._id}>
                          <span className={`activity-dot ${a.type}`}></span>
                          <div>
                            <div className="activity-msg">{a.message}</div>
                            <div className="activity-time">{timeAgo(a.createdAt)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div className="row2">
                <div className="panel">
                  <h3 className="section-title">🛠️ Project</h3>
                  <form onSubmit={saveProject}>
                    <div className="form-row">
                      <div style={{ flex: '1 1 100%' }}>
                        <label>Project name</label>
                        <input value={projectForm.name} onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div>
                        <label>Plan label</label>
                        <input value={projectForm.planLabel} maxLength={60} onChange={(e) => setProjectForm({ ...projectForm, planLabel: e.target.value })} placeholder="e.g. School Website — Standard" />
                      </div>
                      <div>
                        <label>Stage</label>
                        <select value={projectForm.stage} onChange={(e) => setProjectForm({ ...projectForm, stage: e.target.value })}>
                          {STAGE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="form-row">
                      <div>
                        <label>Next milestone</label>
                        <input value={projectForm.nextMilestoneLabel} onChange={(e) => setProjectForm({ ...projectForm, nextMilestoneLabel: e.target.value })} placeholder="e.g. Homepage preview" />
                      </div>
                      <div>
                        <label>Milestone date</label>
                        <input type="date" value={projectForm.nextMilestoneDate} onChange={(e) => setProjectForm({ ...projectForm, nextMilestoneDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div style={{ flex: '1 1 100%' }}>
                        <label>Staging URL (shared with client)</label>
                        <input type="url" value={projectForm.stagingUrl} onChange={(e) => setProjectForm({ ...projectForm, stagingUrl: e.target.value })} placeholder="https://staging.example.com" />
                      </div>
                    </div>
                    <div className="form-row">
                      <div style={{ flex: '1 1 100%' }}>
                        <label>Status note (shown to client, max 500 characters)</label>
                        <textarea
                          maxLength={500}
                          value={projectForm.statusNote}
                          onChange={(e) => setProjectForm({ ...projectForm, statusNote: e.target.value })}
                          placeholder="e.g. Homepage and About pages are done — working on the admissions form next."
                          style={{ width: '100%', minHeight: 70, padding: '9px 11px', border: '1px solid var(--line)', borderRadius: 7, background: 'var(--paper)', color: 'var(--ink)', font: '400 13.5px Inter', resize: 'vertical' }}
                        />
                      </div>
                    </div>
                    <button className="btn-sm primary">Save project</button>
                  </form>
                </div>

                <div className="panel">
                  <h3 className="section-title">🧾 Invoices</h3>
                  <form onSubmit={addInvoice} style={{ marginBottom: 16 }}>
                    <div className="form-row">
                      <div style={{ flex: '1 1 100%' }}>
                        <label>Description</label>
                        <input value={invoiceForm.description} onChange={(e) => setInvoiceForm({ ...invoiceForm, description: e.target.value })} placeholder="e.g. Milestone 2 payment" />
                      </div>
                    </div>
                    <div className="form-row">
                      <div>
                        <label>Amount (₹)</label>
                        <input type="number" min="0" step="0.01" value={invoiceForm.amount} onChange={(e) => setInvoiceForm({ ...invoiceForm, amount: e.target.value })} />
                      </div>
                      <div>
                        <label>Due date</label>
                        <input type="date" value={invoiceForm.dueDate} onChange={(e) => setInvoiceForm({ ...invoiceForm, dueDate: e.target.value })} />
                      </div>
                    </div>
                    <div className="form-row">
                      <div style={{ flex: '1 1 100%' }}>
                        <label>Payment link (optional — shown to the client as a "Pay now" button)</label>
                        <input type="url" value={invoiceForm.paymentLink} onChange={(e) => setInvoiceForm({ ...invoiceForm, paymentLink: e.target.value })} placeholder="https://rzp.io/l/…" />
                      </div>
                    </div>
                    <button className="btn-sm primary">Add invoice</button>
                  </form>

                  {detail.invoices.length === 0 ? (
                    <EmptyState icon="🧾" title="No invoices yet" hint="Add one above once there\u2019s something to bill for." />
                  ) : (
                    <ul className="list">
                      {detail.invoices.map((inv) => {
                        const overdue = isOverdue(inv);
                        const tagLabel = overdue ? 'overdue' : inv.status;
                        return (
                          <li key={inv._id} className="inv-row">
                            <div className="inv-row-top">
                              <div>
                                <b>{invoiceLabel(inv)}</b>
                                <div className="muted">{inv.description}</div>
                              </div>
                              <div className="inv-row-amt">
                                {formatINR(inv.amount)}
                                <span className={`tag ${tagLabel}`}>{tagLabel}</span>
                              </div>
                            </div>
                            <div className="inv-row-actions">
                              <button className="btn-sm approve" onClick={() => toggleInvoicePaid(inv)}>
                                Mark {inv.status === 'due' ? 'paid' : 'due'}
                              </button>
                              <button className="btn-sm ghost" onClick={() => downloadOwnerPdf(inv)}>PDF</button>
                              {inv.status === 'paid' && (
                                <>
                                  <button className="btn-sm ghost" onClick={() => downloadOwnerReceipt(inv)}>Receipt</button>
                                  <button className="btn-sm ghost" onClick={() => editPaymentDetails(inv)}>Payment details</button>
                                </>
                              )}
                              <button className="btn-sm ghost" onClick={() => { setEditingLinkId(inv._id); setLinkDraft(inv.paymentLink || ''); }}>
                                {inv.paymentLink ? 'Edit pay link' : 'Add pay link'}
                              </button>
                            </div>
                            {inv.status === 'paid' && (inv.paymentMode || inv.transactionId) && payingId !== inv._id && (
                              <p className="muted inv-pay-note">Paid by {inv.paymentMode || '—'}{inv.transactionId ? ` · Ref ${inv.transactionId}` : ''}</p>
                            )}
                            {payingId === inv._id && (
                              <div className="inv-pay-edit">
                                <select aria-label="Payment mode" value={payDraft.paymentMode} onChange={(e) => setPayDraft({ ...payDraft, paymentMode: e.target.value })}>
                                  {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <input aria-label="Transaction or reference ID" maxLength={60} value={payDraft.transactionId} onChange={(e) => setPayDraft({ ...payDraft, transactionId: e.target.value })} placeholder="UPI / bank reference (optional)" />
                                <button className="btn-sm primary" onClick={() => savePayment(inv)}>{payDraft.markPaid ? 'Mark paid' : 'Save'}</button>
                                <button className="btn-sm ghost" onClick={() => setPayingId(null)}>Cancel</button>
                              </div>
                            )}
                            {editingLinkId === inv._id && (
                              <div className="inv-link-edit">
                                <input type="url" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://…  (leave empty to remove the link)" />
                                <button className="btn-sm primary" onClick={() => saveInvoiceLink(inv)}>Save</button>
                                <button className="btn-sm ghost" onClick={() => setEditingLinkId(null)}>Cancel</button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div className="panel" style={{ marginTop: 22 }}>
                <h3 className="section-title">📁 Files</h3>
                <form onSubmit={uploadFile} style={{ marginBottom: 18 }}>
                  <div className="form-row">
                    <div style={{ flex: '1 1 100%' }}>
                      <label>File (max 10 MB)</label>
                      <input key={fileInputKey} type="file" onChange={(e) => setFileForm({ ...fileForm, file: e.target.files[0] || null })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div>
                      <label>Display name (optional)</label>
                      <input value={fileForm.name} onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })} placeholder="Defaults to the file name" />
                    </div>
                    <div>
                      <label>Type</label>
                      <select value={fileForm.type} onChange={(e) => setFileForm({ ...fileForm, type: e.target.value })}>
                        <option>Document</option>
                        <option>Image</option>
                        <option>Preview link</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label>Version label (optional)</label>
                      <input value={fileForm.versionLabel} maxLength={30} onChange={(e) => setFileForm({ ...fileForm, versionLabel: e.target.value })} placeholder="Auto: v1, v2, v3…" />
                    </div>
                  </div>
                  <p className="muted" style={{ margin: '0 0 10px' }}>
                    Re-uploading with the same display name adds a new version of that file instead of a duplicate.
                  </p>
                  <button className="btn-sm primary" disabled={uploading || !fileForm.file}>
                    {uploading ? 'Uploading…' : 'Share file with client'}
                  </button>
                </form>

                {detail.deliverables.length === 0 ? (
                  <EmptyState icon="📁" title="No files shared yet" hint="Share a file above and it\u2019ll show up here, plus on the client\u2019s own dashboard." />
                ) : (
                  groupDeliverables(detail.deliverables).map((g) => (
                    <div key={g.key} className="file-group">
                      <FileRow file={g.latest} />
                      {g.older.length > 0 && (
                        <details className="older-versions">
                          <summary>Earlier versions ({g.older.length})</summary>
                          {g.older.map((f) => <FileRow key={f._id} file={f} compact />)}
                        </details>
                      )}
                    </div>
                  ))
                )}
              </div>
              </>
            )}
            </div>
          </div>
        )}

        {tab === 'support' && (
          <>
            <div className="panel">
              {ticketsLoading && <SkeletonRows count={2} columns={2} />}
              {!ticketsLoading && tickets.length === 0 && <EmptyState icon="💬" title="No support tickets yet" hint="Tickets clients raise will show up here." />}
              {!ticketsLoading && tickets.map((t) => (
                <TicketThread
                  key={t._id}
                  ticket={t}
                  role="owner"
                  clientLabel={t.client?.businessName || t.client?.fullName || 'Client'}
                  onReply={replyToTicket}
                  onToggleStatus={toggleTicketStatus}
                />
              ))}
            </div>
          </>
        )}

        {tab === 'leads' && (
          <>
            <div className="panel">
              {leadsLoading && <SkeletonRows count={3} columns={4} />}
              {!leadsLoading && leads.length === 0 && <EmptyState icon="📬" title="No leads yet" hint="Contact-form submissions will show up here once your site is wired to the leads endpoint." />}
              {!leadsLoading && leads.length > 0 && (
                <table>
                  <thead><tr><th>Name</th><th>Contact</th><th>Message</th><th>Received</th><th>Status</th></tr></thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l._id}>
                        <td>{l.name}<br /><span className="muted">{l.businessName}</span></td>
                        <td>{l.email}<br /><span className="muted">{l.phone}</span></td>
                        <td style={{ maxWidth: 240 }}>{l.message}</td>
                        <td>{timeAgo(l.createdAt)}</td>
                        <td>
                          <select value={l.status} onChange={(e) => updateLead(l._id, e.target.value)}>
                            <option value="new">new</option>
                            <option value="contacted">contacted</option>
                            <option value="converted">converted</option>
                            <option value="closed">closed</option>
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {tab === 'audit' && <AuditLogTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  );
}
