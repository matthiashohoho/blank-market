// Tiny Redis client over the Upstash REST API (no dependencies).
// Falls back to an in-memory store for local development only.
const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const configured = !!(URL_ && TOKEN);
const onVercel = !!process.env.VERCEL;

/* ---------- in-memory fallback (local dev) ---------- */
const mem = new Map(); // key -> {v, exp}
function live(k) { const e = mem.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { mem.delete(k); return null; } return e; }
function memCmd(a) {
  const [c, k, ...r] = a; const C = c.toUpperCase();
  if (C === 'GET') { const e = live(k); return e ? e.v : null; }
  if (C === 'SET') {
    let nx = false, ms = 0;
    for (let i = 1; i < r.length; i++) { const o = String(r[i]).toUpperCase(); if (o === 'NX') nx = true; if (o === 'PX') ms = +r[++i]; if (o === 'EX') ms = +r[++i] * 1000; }
    if (nx && live(k)) return null;
    mem.set(k, { v: String(r[0]), exp: ms ? Date.now() + ms : 0 }); return 'OK';
  }
  if (C === 'DEL') { mem.delete(k); return 1; }
  if (C === 'EXPIRE') { const e = live(k); if (e) e.exp = Date.now() + r[0] * 1000; return e ? 1 : 0; }
  if (C === 'HSET') { const e = live(k) || { v: {}, exp: 0 }; if (typeof e.v !== 'object') e.v = {}; e.v[r[0]] = String(r[1]); mem.set(k, e); return 1; }
  if (C === 'HDEL') { const e = live(k); if (e) delete e.v[r[0]]; return 1; }
  if (C === 'HGETALL') { const e = live(k); if (!e) return []; return Object.entries(e.v).flat(); }
  throw new Error('unsupported ' + C);
}

async function cmd(...args) {
  if (!configured) return memCmd(args);
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(args) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function pipe(cmds) {
  if (!configured) return cmds.map(memCmd);
  const r = await fetch(URL_ + '/pipeline', { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(cmds) });
  const j = await r.json();
  return j.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}
const hashObj = arr => { const o = {}; for (let i = 0; i < (arr || []).length; i += 2) o[arr[i]] = arr[i + 1]; return o; };

module.exports = { cmd, pipe, hashObj, configured, onVercel };
