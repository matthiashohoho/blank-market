const crypto = require('crypto');
const E = require('./_lib/engine.js');
const { cmd, pipe, hashObj, configured, onVercel } = require('./_lib/store.js');

const TTL = 60 * 60 * 48;          // games expire after 2 days
const GRACE = 2500;                // ms after the deadline before an unfinished round resolves
const PRESETS = { quick: { rounds: 10, stocks: 4 }, standard: { rounds: 15, stocks: 5 }, full: { rounds: 20, stocks: 6 } };
const TIMERS = [45, 60, 90, 120, 180, 300];
const CASH = [5000, 10000, 25000];

const kG = c => `bm:g:${c}`, kJ = c => `bm:j:${c}`, kO = (c, r) => `bm:o:${c}:${r}`, kL = c => `bm:l:${c}`;
const rid = n => crypto.randomBytes(n).toString('hex');
class Bad extends Error { constructor(m, s = 400) { super(m); this.status = s; } }

async function loadAll(code, round) {
  const cmds = [['GET', kG(code)], ['HGETALL', kJ(code)]];
  const res = await pipe(cmds);
  const rec = res[0] ? JSON.parse(res[0]) : null;
  const joins = Object.entries(hashObj(res[1])).map(([id, v]) => ({ id, ...JSON.parse(v) })).sort((a, b) => a.at - b.at);
  let orders = {};
  const r = round ?? (rec && rec.state ? rec.state.round : null);
  if (rec && rec.state && r) orders = Object.fromEntries(Object.entries(hashObj(await cmd('HGETALL', kO(code, r)))).map(([k, v]) => [k, JSON.parse(v)]));
  return { rec, joins, orders };
}
async function saveRec(rec) { await cmd('SET', kG(rec.code), JSON.stringify(rec), 'EX', TTL); }
async function withLock(code, fn) {
  const me = rid(6);
  for (let i = 0; i < 30; i++) {
    if (await cmd('SET', kL(code), me, 'NX', 'PX', 6000)) {
      try { return await fn(); } finally { await cmd('DEL', kL(code)); }
    }
    await new Promise(r => setTimeout(r, 120));
  }
  throw new Error('The game is busy. Try again.');
}
function auth(joins, token) { return token ? joins.find(j => j.token === token) || null : null; }

async function maybeResolve(code, rec, orders) {
  if (!rec || rec.phase !== 'trading') return rec;
  const g = rec.state;
  const allIn = g.players.every(p => orders[p.id] && orders[p.id].submitted);
  if (!allIn && Date.now() < rec.deadline + GRACE) return rec;
  return withLock(code, async () => {
    const fresh = await loadAll(code);
    const r = fresh.rec;
    if (!r || r.phase !== 'trading' || r.state.round !== g.round) return r;
    const o = {};
    for (const p of r.state.players) { const x = fresh.orders[p.id]; if (x) o[p.id] = { trades: x.trades || {}, secret: x.secret || null }; }
    r.state = E.resolveRound(r.state, o);
    r.phase = r.state.over ? 'over' : 'results';
    r.deadline = null;
    await saveRec(r);
    return r;
  });
}

function view(rec, joins, orders, viewer) {
  const base = { code: rec.code, phase: rec.phase, now: Date.now(), deadline: rec.deadline, hostId: rec.hostId, settings: rec.settings,
    isHost: !!viewer && viewer.id === rec.hostId, myId: viewer ? viewer.id : null,
    lobby: joins.map(j => ({ id: j.id, name: j.name })) };
  if (!rec.state) return base;
  base.game = E.publicView(rec.state);
  base.ready = rec.phase === 'trading' ? Object.entries(orders).filter(([, o]) => o.submitted).map(([k]) => k) : [];
  if (viewer) {
    base.me = E.privateView(rec.state, viewer.id);
    const mine = orders[viewer.id];
    base.myOrder = rec.phase === 'trading' && mine ? mine : null;
  }
  return base;
}

function cleanName(n) { n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16); if (!n) throw new Bad('Enter your name.'); return n; }
function cleanCode(c) { c = String(c || '').toUpperCase().trim(); if (!/^[A-Z]{4}$/.test(c)) throw new Bad('Game codes are four letters.'); return c; }
const LET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const newCode = () => Array.from(crypto.randomBytes(4), b => LET[b % LET.length]).join('');

const actions = {
  async create(b) {
    const name = cleanName(b.name);
    const p = PRESETS[b.preset] || PRESETS.full;
    const timer = TIMERS.includes(+b.timer) ? +b.timer : 90;
    const startCash = CASH.includes(+b.startCash) ? +b.startCash : 10000;
    let code;
    for (let i = 0; i < 10; i++) { code = newCode(); if (!(await cmd('GET', kG(code)))) break; }
    const pid = 'p' + rid(4), token = rid(16);
    const rec = { code, hostId: pid, phase: 'lobby', deadline: null, created: Date.now(),
      settings: { rounds: p.rounds, stocks: p.stocks, startCash, secrets: 3, hintCost: Math.round(startCash * 0.15), timer } };
    await saveRec(rec);
    await pipe([['HSET', kJ(code), pid, JSON.stringify({ name, token, at: Date.now() })], ['EXPIRE', kJ(code), TTL]]);
    return { code, token, pid };
  },
  async join(b) {
    const code = cleanCode(b.code), name = cleanName(b.name);
    const { rec, joins } = await loadAll(code);
    if (!rec) throw new Bad(`No game with code ${code}.`, 404);
    if (rec.phase !== 'lobby') throw new Bad('That game has already started.');
    if (joins.length >= 8) throw new Bad('That game is full (8 players).');
    if (joins.some(j => j.name.toLowerCase() === name.toLowerCase())) throw new Bad('Someone at the table already has that name.');
    const pid = 'p' + rid(4), token = rid(16);
    await cmd('HSET', kJ(code), pid, JSON.stringify({ name, token, at: Date.now() }));
    return { code, token, pid };
  },
  async view(b) {
    const code = cleanCode(b.code);
    let { rec, joins, orders } = await loadAll(code);
    if (!rec) throw new Bad(`No game with code ${code}.`, 404);
    const viewer = auth(joins, b.token);
    if (rec.phase === 'trading') {
      const r2 = await maybeResolve(code, rec, orders);
      if (r2 !== rec) { rec = r2; orders = {}; }
    }
    return view(rec, joins, orders, viewer);
  },
  async start(b) {
    const code = cleanCode(b.code);
    return withLock(code, async () => {
      const { rec, joins } = await loadAll(code);
      const v = rec && auth(joins, b.token);
      if (!v || v.id !== rec.hostId) throw new Bad('Only the host can start the game.', 403);
      if (rec.phase !== 'lobby') return { ok: true };
      if (joins.length < 2) throw new Bad('You need at least two players.');
      rec.state = E.newGame(rec.settings, joins.map(j => ({ id: j.id, name: j.name })), crypto.randomBytes(4).readUInt32LE(0));
      rec.phase = 'trading'; rec.deadline = Date.now() + rec.settings.timer * 1000;
      await saveRec(rec);
      return { ok: true };
    });
  },
  async next(b) {
    const code = cleanCode(b.code);
    return withLock(code, async () => {
      const { rec, joins } = await loadAll(code);
      const v = rec && auth(joins, b.token);
      if (!v || v.id !== rec.hostId) throw new Bad('Only the host can start the next round.', 403);
      if (rec.phase !== 'results') return { ok: true };
      rec.phase = 'trading'; rec.deadline = Date.now() + rec.settings.timer * 1000;
      await saveRec(rec);
      return { ok: true };
    });
  },
  async endNow(b) {
    const code = cleanCode(b.code);
    return withLock(code, async () => {
      const { rec, joins } = await loadAll(code);
      const v = rec && auth(joins, b.token);
      if (!v || v.id !== rec.hostId) throw new Bad('Only the host can end the round.', 403);
      if (rec.phase === 'trading') { rec.deadline = Math.min(rec.deadline, Date.now() - GRACE); await saveRec(rec); }
      return { ok: true };
    });
  },
  async order(b) {
    const code = cleanCode(b.code);
    const { rec, joins } = await loadAll(code);
    const v = rec && auth(joins, b.token);
    if (!v) throw new Bad('You are not in this game.', 403);
    if (rec.phase !== 'trading' || +b.round !== rec.state.round) throw new Bad('This round is closed.', 409);
    if (Date.now() > rec.deadline + GRACE) throw new Bad('Time is up for this round.', 409);
    const ids = rec.state.stocks.map(s => s.id);
    const p = rec.state.players.find(x => x.id === v.id);
    const trades = {};
    for (const sid of ids) {
      const t = (b.trades || {})[sid]; if (!t) continue;
      const buy = Math.max(0, Math.min(1e6, Math.floor(+t.buy || 0))), sell = Math.max(0, Math.min(1e6, Math.floor(+t.sell || 0)));
      const times = Math.max(1, Math.min(1000, Math.floor(+t.times || 1)));
      if (buy || sell) trades[sid] = { buy, sell, times };
    }
    let secret = ids.includes(b.secret) ? b.secret : null;
    if (secret && p.secretsLeft <= 0) secret = null;
    const o = { trades, secret, submitted: !!b.submitted, at: Date.now() };
    await pipe([['HSET', kO(code, rec.state.round), v.id, JSON.stringify(o)], ['EXPIRE', kO(code, rec.state.round), TTL]]);
    if (o.submitted) {
      const fresh = await loadAll(code);
      await maybeResolve(code, fresh.rec, fresh.orders);
    }
    return { ok: true };
  },
  async hint(b) {
    const code = cleanCode(b.code);
    return withLock(code, async () => {
      const { rec, joins } = await loadAll(code);
      const v = rec && auth(joins, b.token);
      if (!v) throw new Bad('You are not in this game.', 403);
      if (rec.phase !== 'trading') throw new Bad('Hints can only be bought while a round is open.', 409);
      const p = rec.state.players.find(x => x.id === v.id);
      if (p.hint) throw new Bad('You already used your hint.');
      if (!rec.state.stocks.some(s => s.id === b.sid)) throw new Bad('Unknown stock.');
      if (p.cash < rec.settings.hintCost) throw new Bad('Not enough cash for a hint.');
      p.hint = b.sid; p.hintRound = rec.state.round; p.cash = E.round2(p.cash - rec.settings.hintCost);
      await saveRec(rec);
      return { ok: true };
    });
  },
};

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (onVercel && !configured) { res.status(503).json({ error: 'The game database is not connected yet. Add Upstash Redis to this project in Vercel, then redeploy.' }); return; }
  try {
    let b = req.body;
    if (typeof b === 'string') b = JSON.parse(b || '{}');
    b = b || {};
    const fn = actions[b.action];
    if (!fn) throw new Bad('Unknown action.');
    res.status(200).json(await fn(b));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Something went wrong on the server. Try again.' });
    if (!e.status) console.error(e);
  }
};
