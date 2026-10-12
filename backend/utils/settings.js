import Setting from '../models/Setting.js';
import { mergeWithDefaults, renderTemplate } from './settingsDefaults.js';

let cache = null;
let cachedAt = 0;

// 60-second cache; always refreshed right after a save
export async function getSettings(force = false) {
  if (!force && cache && Date.now() - cachedAt < 60_000) return cache;
  const doc = await Setting.findOne({ key: 'main' }).lean();
  cache = mergeWithDefaults(doc?.data);
  cachedAt = Date.now();
  return cache;
}

export async function saveSettings(data, userId) {
  await Setting.findOneAndUpdate(
    { key: 'main' },
    { data, updatedBy: userId },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  );
  cache = null;
  return getSettings(true);
}

// const { subject, html } = await renderEmail('approved', { clientName, clientId, portalUrl });
export async function renderEmail(templateKey, vars = {}) {
  const s = await getSettings();
  const tpl = s.emailTemplates[templateKey];
  if (!tpl) throw new Error(`Unknown email template: ${templateKey}`);
  return renderTemplate(tpl, { businessName: s.business.name, portalUrl: process.env.CLIENT_URL, ...vars });
}
