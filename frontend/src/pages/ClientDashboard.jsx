import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import NotificationBell from '../components/NotificationBell.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import EmptyState from '../components/EmptyState.jsx';
import { SkeletonStatGrid, SkeletonRows, SkeletonBlock } from '../components/Skeleton.jsx';
import FileRow from '../components/FileRow.jsx';
import InvoicesPanel from '../components/InvoicesPanel.jsx';
import TicketThread from '../components/TicketThread.jsx';
import OnboardingTour from '../components/OnboardingTour.jsx';
import SettingsPanel from '../components/SettingsPanel.jsx';
import groupDeliverables from '../utils/groupDeliverables.js';
import timeAgo from '../utils/timeAgo.js';
import '../styles/theme.css';
import '../styles/dashboard.css';

const STAGES = [
  { key: 'discovery', label: 'Discovery' },
  { key: 'design', label: 'Design' },
  { key: 'development', label: 'Development' },
  { key: 'review', label: 'Review' },
  { key: 'live', label: 'Live' },
];

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'project', label: 'My project' },
  { key: 'files', label: 'Files & deliverables' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'support', label: 'Support' },
  { key: 'settings', label: 'Settings' },
];

const TOUR_STEPS = [
  { key: 'overview', title: 'Welcome to your portal', text: "This is your dashboard home — your project status and recent activity at a glance, any time you log in." },
  { key: 'project', title: 'Track your project', text: 'Follow your website through each stage here, and find your staging link and the latest update from Codexora once they\u2019re ready.' },
  { key: 'files', title: 'Files & deliverables', text: 'Anything Codexora shares with you — designs, documents, drafts — shows up here, grouped by file with older versions tucked underneath.' },
  { key: 'invoices', title: 'Invoices', text: 'See what\u2019s due, download a PDF any time, and pay directly when a payment link is attached.' },
  { key: 'support', title: 'Support', text: 'Need help with anything? Raise a ticket here and reply directly — Codexora will see it right away.' },
  { key: 'settings', title: 'Your settings', text: 'Update your business info, change your password, or turn notifications off, all from here.' },
];

export default function ClientDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [data, setData] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [activity, setActivity] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [form, setForm] = useState({ subject: '', message: '' });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: dash }, { data: tix }, { data: act }, { data: prof }] = await Promise.all([
        api.get('/client/dashboard'),
        api.get('/client/tickets'),
        api.get('/client/activity'),
        api.get('/profile'),
      ]);
      setData(dash);
      setTickets(tix.tickets);
      setActivity(act.activity);
      setProfile(prof.profile);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not load your dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const fileGroups = data ? groupDeliverables(data.deliverables) : [];
  const stageIndex = data?.project ? STAGES.findIndex((s) => s.key === data.project.stage) : -1;

  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject || !form.message) return;
    setSubmitting(true);
    try {
      const { data: res } = await api.post('/client/tickets', form);
      setTickets((prev) => [res.ticket, ...prev]);
      setForm({ subject: '', message: '' });
    } catch (err) {
      alert(err.response?.data?.message || 'Could not submit ticket');
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('cx_token');
    localStorage.removeItem('cx_user');
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="app">
        <aside className="sidebar">
          <div className="brand" style={{ marginBottom: 0 }}>
            <div className="mark">CX</div>
            <div className="name" style={{ color: '#F5F6F1' }}>Codexora</div>
          </div>
        </aside>
        <main className="main">
          <SkeletonStatGrid />
          <div style={{ height: 18 }} />
          <SkeletonBlock height={90} />
          <div style={{ height: 18 }} />
          <SkeletonRows count={4} columns={3} />
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <p className="error-text">{error}</p>
        </div>
      </div>
    );
  }

  const displayName = data.client.businessName || data.client.fullName;

  return (
    <>
      <OnboardingTour steps={TOUR_STEPS} activeKey={tab} onStepChange={setTab} />
      <div className="app">
        <div className={`mobile-backdrop ${mobileNavOpen ? 'show' : ''}`} onClick={() => setMobileNavOpen(false)}></div>
      <aside className={`sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand" style={{ marginBottom: 0 }}>
          <div className="mark">CX</div>
          <div className="name" style={{ color: '#F5F6F1' }}>Codexora</div>
        </div>
        <nav>
          {TABS.map((t) => (
            <a
              key={t.key}
              className={tab === t.key ? 'on' : ''}
              onClick={() => { setTab(t.key); setMobileNavOpen(false); }}
            >
              {t.label}
              {t.key === 'support' && tickets.some((tk) => tk.status === 'open' && tk.lastReplyBy === 'owner') && (
                <span className="badge">{tickets.filter((tk) => tk.status === 'open' && tk.lastReplyBy === 'owner').length}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="idbox">
          {displayName}
          <br />
          {data.client.clientId}
          <br />
          <a href="#" style={{ color: '#9A9DA6' }} onClick={(e) => { e.preventDefault(); signOut(); }}>
            Sign out
          </a>
        </div>
      </aside>

      <main className="main">
        <div className="topline">
          <div>
            <h2>{TABS.find((t) => t.key === tab)?.label === 'Overview' ? `Welcome back, ${displayName}` : TABS.find((t) => t.key === tab)?.label}</h2>
            <div className="sub">
              {tab === 'overview' && "Here's where your website project stands right now."}
              {tab === 'project' && 'Your current stage, milestones, and any note from Codexora.'}
              {tab === 'files' && 'Everything Codexora has shared with you, grouped by file.'}
              {tab === 'invoices' && 'Your invoices, running totals, and payment status.'}
              {tab === 'support' && 'Raise a request or follow up on an existing one.'}
              {tab === 'settings' && 'Your business info, password, and notification preferences.'}
            </div>
          </div>
          <div className="topline-actions">
            <button className="mobile-menu-btn" onClick={() => setMobileNavOpen((o) => !o)} aria-label="Menu">☰</button>
            {data.project && tab === 'overview' && <span className="pill">Plan: {data.project.planLabel}</span>}
            <ThemeToggle />
            <NotificationBell />
          </div>
        </div>

        {tab === 'overview' && (
          <>
            <div className="stat-grid">
              <div className="stat">
                <div className="num">{data.project ? STAGES[stageIndex]?.label : '—'}</div>
                <div className="lab">Current stage</div>
              </div>
              <div className="stat">
                <div className="num">{data.project?.nextMilestoneDate ? new Date(data.project.nextMilestoneDate).toLocaleDateString() : '—'}</div>
                <div className="lab">{data.project?.nextMilestoneLabel || 'Next milestone'}</div>
              </div>
              <div className="stat">
                <div className="num">₹{data.balanceDue.toLocaleString()}</div>
                <div className="lab">Balance due</div>
              </div>
              <div className="stat">
                <div className="num">{data.openTicketsCount}</div>
                <div className="lab">Open support ticket{data.openTicketsCount === 1 ? '' : 's'}</div>
              </div>
            </div>

            <div className="panel">
              <h3 className="section-title">Recent activity</h3>
              {activity.length === 0 ? (
                <EmptyState icon="🕘" title="No activity yet" hint="Updates on your project, invoices, and files will show up here." />
              ) : (
                <ul className="activity-feed">
                  {activity.map((a) => (
                    <li key={a._id}>
                      <span className={`activity-dot ${a.type}`}></span>
                      <div>
                        <div className="activity-msg">{a.message}</div>
                        <div className="activity-time">{timeAgo(a.createdAt)}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {tab === 'project' && (
          data.project ? (
            <div className="panel">
              <div className="stepper">
                {STAGES.map((s, i) => (
                  <div key={s.key} className={`step ${i < stageIndex ? 'done' : i === stageIndex ? 'now' : ''}`}>
                    <div className="dot">{i < stageIndex ? '✓' : i + 1}</div>
                    <div className="lab">{s.label}</div>
                  </div>
                ))}
              </div>

              {(data.project.statusNote || data.project.stagingUrl) && (
                <div className="project-extras">
                  {data.project.statusNote && (
                    <div className="status-note">
                      <div className="status-note-label">Latest update from Codexora</div>
                      <p>{data.project.statusNote}</p>
                      {data.project.statusNoteUpdatedAt && (
                        <div className="activity-time">Updated {timeAgo(data.project.statusNoteUpdatedAt)}</div>
                      )}
                    </div>
                  )}
                  {data.project.stagingUrl && (
                    <a className="staging-btn" href={data.project.stagingUrl} target="_blank" rel="noopener noreferrer">
                      View staging site ↗
                    </a>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="panel">
              <EmptyState icon="📋" title="No project set up yet" hint="Codexora will add this once your project kicks off." />
            </div>
          )
        )}

        {tab === 'files' && (
          <div className="panel">
            {fileGroups.length === 0 ? (
              <EmptyState icon="📁" title="No files shared yet" hint="Files Codexora shares with you will show up here." />
            ) : (
              <>
                {data.project?.name && <div className="files-project">{data.project.name}</div>}
                {fileGroups.map((g) => (
                  <div key={g.key} className="file-group">
                    <FileRow file={g.latest} />
                    {g.older.length > 0 && (
                      <details className="older-versions">
                        <summary>Earlier versions ({g.older.length})</summary>
                        {g.older.map((f) => <FileRow key={f._id} file={f} compact />)}
                      </details>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {tab === 'invoices' && <InvoicesPanel invoices={data.invoices} />}

        {tab === 'support' && (
          <div className="panel">
            <form className="ticket-form" onSubmit={handleTicketSubmit} style={{ marginBottom: 20 }}>
              <input
                placeholder="Subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                required
              />
              <textarea
                placeholder="Describe your issue or request…"
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
              />
              <button className="btn-sm primary" disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit ticket'}
              </button>
            </form>

            {tickets.length === 0 ? (
              <EmptyState icon="💬" title="No support tickets yet" hint="Raise one below if you need help with anything." />
            ) : (
              tickets.map((t) => (
                <TicketThread
                  key={t._id}
                  ticket={t}
                  role="client"
                  onReply={async (id, message) => {
                    const { data: res } = await api.post(`/client/tickets/${id}/reply`, { message });
                    setTickets((prev) => prev.map((x) => (x._id === id ? res.ticket : x)));
                  }}
                />
              ))
            )}
          </div>
        )}

        {tab === 'settings' && profile && (
          <SettingsPanel profile={profile} onUpdated={setProfile} />
        )}
      </main>
    </div>
    </>
  );
}
