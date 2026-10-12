// routes/audit.js — mount as: app.use('/api/owner/audit', require('./routes/audit'));
const router = require('express').Router();
const { protect, ownerOnly } = require('../middleware/auth');
const AuditLog = require('../models/AuditLog');
const { ACTIONS, buildFilter } = require('../utils/auditCore');

router.use(protect, ownerOnly);

router.get('/actions', (req, res) => res.json(ACTIONS));

// GET /api/owner/audit?action=client.delete,invoice.delete&from=2026-10-01&to=2026-10-05&q=shanti&page=1&limit=25
router.get('/', async (req, res) => {
  const { filter, page, limit } = buildFilter(req.query);
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)) });
});

module.exports = router;
