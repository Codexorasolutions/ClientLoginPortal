// Friendly placeholder shown when a list/section has no data yet.
// Usage: <EmptyState icon="🧾" title="No invoices yet" hint="..." action={<button/>} />
export default function EmptyState({ icon, title, hint, action }) {
  return (
    <div
      className="empty-state"
      style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--ink-soft)' }}
    >
      {icon && <div style={{ fontSize: 38, marginBottom: 10 }}>{icon}</div>}
      {title && (
        <div style={{ fontWeight: 600, fontSize: 15, color: 'var(--ink)' }}>{title}</div>
      )}
      {hint && <p style={{ margin: '6px 0 0', fontSize: 13.5 }}>{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}
