import Lead from '../models/Lead.js';
import { notifyOwners } from '../utils/notify.js';
import { logAudit } from '../utils/audit.js';

// POST /api/leads — public endpoint the main Codexora website's contact
// form can eventually point to, instead of (or alongside) Google Sheets
export const createLead = async (req, res) => {
  try {
    const { name, email, phone, businessName, message } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const lead = await Lead.create({ name, email, phone, businessName, message });

    await notifyOwners({
      title: 'New website lead',
      message: `${name} (${email}) — ${businessName || 'no business name given'}`,
      type: 'lead',
    });

    res.status(201).json({ message: 'Thanks — we will be in touch soon.', lead });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not submit', error: err.message });
  }
};

// GET /api/owner/leads
export const listLeads = async (req, res) => {
  try {
    const leads = await Lead.find().sort({ createdAt: -1 });
    res.json({ leads });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load leads', error: err.message });
  }
};

// PATCH /api/owner/leads/:id
export const updateLeadStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'contacted', 'converted', 'closed'].includes(status)) {
      return res.status(400).json({ message: 'Status must be new, contacted, converted or closed' });
    }
    const lead = await Lead.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    await logAudit(req, 'lead.update', { entityType: 'lead', entityId: lead._id, entityLabel: lead.name, summary: `Lead "${lead.name}" set to ${status}`, meta: { status } });
    res.json({ lead });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not update lead', error: err.message });
  }
};
