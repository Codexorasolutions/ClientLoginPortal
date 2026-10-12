import sendEmail, { emailProvider } from '../utils/sendEmail.js';
import { getSettings, saveSettings, renderEmail } from '../utils/settings.js';
import { buildDefaults, TEMPLATE_VARS, SAMPLE_VARS, sanitizeSettings, diffPaths } from '../utils/settingsDefaults.js';
import { logAudit } from '../utils/audit.js';

// GET /api/owner/settings
export const getOwnerSettings = async (req, res) => {
  try {
    res.json({ settings: await getSettings(true), defaults: buildDefaults(), templateVars: TEMPLATE_VARS });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load settings', error: err.message });
  }
};

// PUT /api/owner/settings — only whitelisted fields are accepted and every one is validated
export const updateOwnerSettings = async (req, res) => {
  try {
    const before = await getSettings(true);
    const { data, errors } = sanitizeSettings(req.body, before);
    if (Object.keys(errors).length) {
      return res.status(400).json({ message: 'Please fix the highlighted fields', errors });
    }
    const changed = diffPaths(before, data);
    if (!changed.length) return res.json({ settings: before, changed });

    const settings = await saveSettings(data, req.user._id);
    await logAudit(req, 'settings.update', {
      entityType: 'settings', entityLabel: 'Business settings',
      summary: `Changed ${changed.length} setting${changed.length > 1 ? 's' : ''}`,
      meta: { changed }, // field names only, never the values
    });
    res.json({ settings, changed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not save settings', error: err.message });
  }
};

// POST /api/owner/settings/test-email — the SAVED template with sample values, sent to the owner's own address
export const sendTestEmail = async (req, res) => {
  try {
    const key = String(req.body?.template || '');
    if (!TEMPLATE_VARS[key]) return res.status(400).json({ message: 'Unknown template' });
    const { subject, html } = await renderEmail(key, SAMPLE_VARS);
    await sendEmail({ to: req.user.email, subject: `[Test] ${subject}`, html });
    res.json({ message: `Test email sent to ${req.user.email}` });
  } catch (err) {
    console.error(err);
    console.error('[test-email] failed:', err.hint || err.message, err.message);
    // the owner sees the real reason and the fix (this route is owner-only)
    res.status(502).json({ message: `Could not send the test email (${emailProvider()}). ${err.hint || err.message}` });
  }
};
