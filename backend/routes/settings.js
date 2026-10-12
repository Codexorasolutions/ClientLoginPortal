// routes/settings.js — mount as: app.use('/api/owner/settings', require('./routes/settings'));
// Adjust the middleware/sendEmail imports to match your project.
const router = require('express').Router();
const { protect, ownerOnly } = require('../middleware/auth');
const sendEmail = require('../utils/sendEmail'); // assumed signature: sendEmail({ to, subject, html })
const { getSettings, saveSettings, renderEmail } = require('../utils/settings');
const { DEFAULTS, TEMPLATE_VARS, SAMPLE_VARS, sanitizeSettings, diffPaths } = require('../utils/settingsDefaults');

router.use(protect, ownerOnly);

router.get('/', async (req, res) => {
  res.json({ settings: await getSettings(true), defaults: DEFAULTS, templateVars: TEMPLATE_VARS });
});

router.put('/', async (req, res) => {
  const before = await getSettings(true);
  const { data, errors } = sanitizeSettings(req.body, before);
  if (Object.keys(errors).length) {
    return res.status(400).json({ message: 'Please fix the highlighted fields', errors });
  }
  const changed = diffPaths(before, data);
  if (!changed.length) return res.json({ settings: before, changed });
  const settings = await saveSettings(data, req.user._id);
  // audit hook (step 2): logAudit(req, 'settings.update', { changed });
  res.json({ settings, changed });
});

// sends the saved template, filled with sample values, to the owner's own email
router.post('/test-email', async (req, res) => {
  const key = String(req.body.template || '');
  if (!TEMPLATE_VARS[key]) return res.status(400).json({ message: 'Unknown template' });
  const { subject, html } = await renderEmail(key, SAMPLE_VARS);
  await sendEmail({ to: req.user.email, subject: `[Test] ${subject}`, html });
  res.json({ message: `Test email sent to ${req.user.email}` });
});

module.exports = router;
