import { useState } from 'react';
import timeAgo from '../utils/timeAgo.js';

// One ticket: original message, reply history, a status tag, and a reply
// box. Used by both dashboards — `role` controls whose voice "you" is and
// which actions are available (owner can close/reopen; client cannot).
export default function TicketThread({ ticket, role, onReply, onToggleStatus, clientLabel }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const closed = ticket.status === 'closed';
  const waitingOn = ticket.lastReplyBy === role ? 'them' : 'you';
  const replies = ticket.replies || [];
  const visibleReplies = expanded ? replies : replies.slice(-2);

  const send = async (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError('');
    try {
      await onReply(ticket._id, draft.trim());
      setDraft('');
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send reply');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="ticket-thread">
      <div className="ticket-head">
        <div>
          <b>{ticket.subject}</b>
          {clientLabel && <div className="muted">{clientLabel}</div>}
        </div>
        <div className="ticket-head-right">
          <span className={`tag ${closed ? 'closed' : 'open'}`}>{closed ? 'closed' : 'open'}</span>
          {!closed && <span className={`wait-badge ${waitingOn === 'you' ? 'you' : ''}`}>{waitingOn === 'you' ? 'Awaiting your reply' : 'Awaiting reply'}</span>}
          {role === 'owner' && onToggleStatus && (
            <button className="btn-sm ghost" onClick={() => onToggleStatus(ticket)}>
              {closed ? 'Reopen' : 'Mark resolved'}
            </button>
          )}
        </div>
      </div>

      <div className="ticket-msg original">
        <div className="ticket-msg-meta">{role === 'client' ? 'You' : clientLabel || 'Client'} · {timeAgo(ticket.createdAt)}</div>
        <p>{ticket.message}</p>
      </div>

      {replies.length > 2 && !expanded && (
        <button className="show-earlier" onClick={() => setExpanded(true)}>Show {replies.length - 2} earlier repl{replies.length - 2 === 1 ? 'y' : 'ies'}</button>
      )}

      {visibleReplies.map((r, i) => (
        <div key={r._id || i} className={`ticket-msg ${r.author === role ? 'mine' : 'theirs'}`}>
          <div className="ticket-msg-meta">
            {r.author === role ? 'You' : r.author === 'owner' ? 'Codexora' : clientLabel || 'Client'} · {timeAgo(r.createdAt)}
          </div>
          <p>{r.message}</p>
        </div>
      ))}

      {closed ? (
        <p className="muted" style={{ marginTop: 10 }}>
          This ticket is closed.{role === 'client' && ' Raise a new ticket if you need further help.'}
        </p>
      ) : (
        <form className="ticket-reply-form" onSubmit={send}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={role === 'owner' ? 'Reply to the client…' : 'Write a reply…'}
            maxLength={2000}
          />
          <button className="btn-sm primary" disabled={sending || !draft.trim()}>{sending ? '…' : 'Send'}</button>
        </form>
      )}
      {error && <p className="error-text" style={{ marginTop: 6 }}>{error}</p>}
    </div>
  );
}
