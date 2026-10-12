import AuditLog from '../models/AuditLog.js';
import { ACTIONS, buildEntry } from './auditCore.js';

// Never throws: a logging problem must not break the action being logged.
export async function logAudit(req, action, info = {}) {
  try {
    if (!ACTIONS[action]) console.warn(`[audit] unknown action "${action}"`);
    await AuditLog.create(buildEntry(req, action, info));
  } catch (err) {
    console.error('[audit] could not write entry:', err.message);
  }
}
