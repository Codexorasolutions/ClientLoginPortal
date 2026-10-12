import AuditLog from '../models/AuditLog.js';
import { ACTIONS, buildFilter } from '../utils/auditCore.js';

// GET /api/owner/audit/actions
export const listAuditActions = (req, res) => res.json(ACTIONS);

// GET /api/owner/audit?action=a,b&from=2026-10-01&to=2026-10-05&q=text&page=1&limit=25
export const listAudit = async (req, res) => {
  try {
    const { filter, page, limit } = buildFilter(req.query);
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load the audit log', error: err.message });
  }
};
