import '../styles/theme.css';

export default function PendingApproval() {
  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: 'center', maxWidth: 420 }}>
        <div className="stamp">?</div>
        <h3 style={{ fontFamily: 'Poppins', fontSize: 22, margin: '0 0 10px' }}>Request received</h3>
        <p className="muted" style={{ lineHeight: 1.6 }}>
          Your email is verified. Codexora typically approves new clients within one business day —
          you'll get an email once your portal access is live.
        </p>
        <a className="btn ghost" href="/login" style={{ display: 'inline-block', textDecoration: 'none' }}>
          Back to sign in
        </a>
      </div>
    </div>
  );
}
