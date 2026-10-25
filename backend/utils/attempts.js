// Tiny in-memory limiter for "wrong password" style attempts (per server process; resets on restart).
export function createLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const hits = new Map(); // key -> [timestamps]
  const recent = (key) => {
    const cutoff = Date.now() - windowMs;
    const list = (hits.get(key) || []).filter((t) => t > cutoff);
    hits.set(key, list);
    return list;
  };
  return {
    blocked: (key) => recent(key).length >= max,
    hit: (key) => { recent(key).push(Date.now()); },
    reset: (key) => hits.delete(key),
    minutesLeft: (key) => { const l = recent(key); return l.length ? Math.max(1, Math.ceil((l[0] + windowMs - Date.now()) / 60000)) : 0; },
  };
}
