const assert = require('assert');
const EventEmitter = require('events');
const path = require('path');
const C = require('./utils/auditCore');

// --- redaction & meta caps
const r = C.redact({ name: 'A', password: 'p', nested: { token: 't', okay: 1, deep: { a: { b: { c: 1 } } } }, list: Array(30).fill('x'), long: 'y'.repeat(500), newPassword: 'z' });
assert.strictEqual(r.password, '[redacted]'); assert.strictEqual(r.nested.token, '[redacted]'); assert.strictEqual(r.newPassword, '[redacted]');
assert.strictEqual(r.list.length, 20); assert.ok(r.long.length <= 301); assert.strictEqual(r.nested.deep.a.b, '[nested]');
assert.deepStrictEqual(C.diffObjects({ name: 'a', password: 'old', amount: 1 }, { name: 'b', password: 'new', amount: 1 }),
  [{ field: 'name', from: 'a', to: 'b' }, { field: 'password', from: '[redacted]', to: '[redacted]' }]);

// --- entry building
const req = { user: { _id: '66f1a2b3c4d5e6f7a8b9c0d1', name: 'Amit', email: 'a@b.co', role: 'owner' }, ip: '1.2.3.4', headers: { 'user-agent': 'UA'.repeat(200) } };
const e = C.buildEntry(req, 'client.delete', { entityType: 'client', entityId: 77, entityLabel: 'Shanti Public School', meta: { token: 'secret', reason: 'dup' } });
assert.strictEqual(e.summary, 'Client deleted: Shanti Public School'); assert.strictEqual(e.entityId, '77');
assert.strictEqual(e.meta.token, '[redacted]'); assert.ok(e.userAgent.length <= 200); assert.strictEqual(e.actor.role, 'owner');
const big = C.buildEntry(req, 'settings.update', { meta: { x: Array(20).fill('z'.repeat(300)) } }); assert.deepStrictEqual(big.meta, { truncated: true });
const anon = C.buildEntry({ headers: {}, ip: '9.9.9.9' }, 'auth.login_failed', { actor: { email: 'x@y.z' }, summary: 'Wrong password' });
assert.strictEqual(anon.actor.email, 'x@y.z'); assert.strictEqual(anon.summary, 'Wrong password');

// --- filters
let f = C.buildFilter({ action: 'client.delete,bogus.action,invoice.delete', from: '2026-10-01', to: '2026-10-05', q: 'sh(a)nti.*', limit: '9999', page: '-3', actor: 'zzz' });
assert.deepStrictEqual(f.filter.action, { $in: ['client.delete', 'invoice.delete'] });
assert.strictEqual(f.limit, 100); assert.strictEqual(f.page, 1); assert.ok(!f.filter['actor.id']);
assert.strictEqual(f.filter.createdAt.$lte.toISOString(), '2026-10-05T23:59:59.999Z');
assert.ok(f.filter.$or[0].summary.test('SH(A)NTI.* school')); assert.ok(!f.filter.$or[0].summary.test('shanti'));   // regex was escaped
assert.deepStrictEqual(C.buildFilter({}).filter, {});
assert.deepStrictEqual(C.buildFilter({ action: 'nope' }).filter, {});

// --- middleware, with a stub model
const created = [];
const modelPath = require.resolve('./models/AuditLog');
require.cache[modelPath] = { id: modelPath, filename: modelPath, loaded: true, exports: { create: async (x) => { created.push(x); if (x.action === 'boom') throw new Error('db down'); } } };
const { audited, logAudit } = require('./utils/audit');
const run = (status, locals) => new Promise((resolve) => {
  const res = new EventEmitter(); res.statusCode = status; res.locals = locals || {};
  audited('client.delete', { entityType: 'client', entityId: (rq) => rq.params.id })({ ...req, params: { id: 'c1' } }, res, () => {});
  res.emit('finish'); setTimeout(resolve, 5);
});
(async () => {
  await run(200, { audit: { label: 'Shanti Public School' } });
  await run(404); await run(500);                      // failures are not logged
  assert.strictEqual(created.length, 1);
  assert.strictEqual(created[0].entityId, 'c1'); assert.strictEqual(created[0].entityLabel, 'Shanti Public School');
  await logAudit(req, 'boom');                          // DB failure must not throw
  console.log('middleware + failure-safety OK');

  // --- append-only model hooks (no DB connection needed to run the hooks)
  delete require.cache[modelPath];
  const Model = require('./models/AuditLog');
  const ours = (op) => Model.schema.s.hooks._pres.get(op).map((h) => h.fn).filter((fn) => /append-only/.test(String(fn)));
  for (const op of ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany']) {
    const fns = ours(op); assert.strictEqual(fns.length, 1, op);
    await new Promise((ok) => fns[0].call({}, (err) => { assert.ok(err && /append-only/.test(err.message), op); ok(); }));
  }
  const [saveHook] = ours('save');
  await new Promise((ok) => saveHook.call({ isNew: false }, (err) => { assert.ok(err); ok(); }));
  await new Promise((ok) => saveHook.call({ isNew: true }, (err) => { assert.ok(!err); ok(); }));
  console.log('append-only hooks OK\nall passed'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
