export const STATUS_LABELS = { active: 'Active', pending: 'Pending', suspended: 'Suspended', terminated: 'Terminated', rejected: 'Rejected' };

export default function StatusBadge({ status }) {
  return <span className={`us-status ${status}`}>{STATUS_LABELS[status] || status}</span>;
}
