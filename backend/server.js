const express = require('express'), http = require('http'), path = require('path'), crypto = require('crypto');
const bcrypt = require('bcryptjs'), { WebSocketServer } = require('ws');
const db = require('./db'), game = require('./game');
const app = express(); app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ---------- Auth (create account / login) ----------
const newToken = uid => { const t = crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO sessions(token,user_id) VALUES(?,?)').run(t, uid); return t; };
app.post('/api/register', (req, res) => {
  const u = String(req.body.username || '').trim(), p = String(req.body.password || '');
  if (u.length < 3 || u.length > 16 || p.length < 4) return res.status(400).json({ error: 'Username 3-16 chars, password min 4 chars' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(u)) return res.status(409).json({ error: 'Username taken' });
  const id = db.prepare('INSERT INTO users(username,password_hash) VALUES(?,?)').run(u, bcrypt.hashSync(p, 10)).lastInsertRowid;
  res.json({ token: newToken(id), username: u });
});
app.post('/api/login', (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE username=?').get(String(req.body.username || '').trim());
  if (!row || !bcrypt.compareSync(String(req.body.password || ''), row.password_hash)) return res.status(401).json({ error: 'Wrong username or password' });
  res.json({ token: newToken(row.id), username: row.username });
});
app.get('/api/leaderboard', (req, res) => res.json(db.prepare('SELECT username,wins,games FROM users ORDER BY wins DESC LIMIT 10').all()));

// ---------- Rooms (live games) ----------
const rooms = new Map(), socks = new Map(); // code -> room ; userId -> ws
const userOf = t => db.prepare('SELECT u.id,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=?').get(t);
const genCode = () => { let c; do c = String(100000 + Math.floor(Math.random() * 900000)); while (rooms.has(c) || db.prepare('SELECT 1 FROM groups WHERE code=?').get(c)); return c; };
const nameOf = r => id => (r.players.find(p => p.id === id) || {}).name || '?';

function view(r, uid) {
  const v = { code: r.code, name: r.name, host: r.host, max: r.max, start: r.start, timer: r.timer, status: r.status, players: r.players, me: uid };
  if (r.g) { const g = r.g; v.g = { order: g.order, counts: Object.fromEntries(g.order.map(i => [i, g.hands[i].length])), hand: g.hands[uid] || [], top: game.topCard(g), color: g.color, dir: g.dir, pend: g.pend, pt: g.pt, turn: g.order[g.turn], drew: g.drew, drewIdx: g.drewIdx, up: g.up, deck: g.deck.length, winner: g.winner, log: g.log.slice(-6), tEnd: r.tEnd }; }
  return v;
}
function push(r) { r.players.forEach(p => { const s = socks.get(p.id); if (s && s.readyState === 1) s.send(JSON.stringify({ type: 'state', room: view(r, p.id) })); }); }
function armTimer(r) {
  clearTimeout(r.th); r.tEnd = null;
  if (r.status !== 'playing' || !r.timer || r.g.winner) return;
  r.tEnd = Date.now() + r.timer * 1000;
  r.th = setTimeout(() => { game.timeout(r.g, nameOf(r)); armTimer(r); push(r); }, r.timer * 1000);
}
function afterMove(r) {
  if (r.g.winner) {
    clearTimeout(r.th); r.status = 'done'; r.tEnd = null;
    db.prepare("UPDATE groups SET status='done' WHERE code=?").run(r.code);
    db.prepare('INSERT INTO game_results(code,winner_id,players) VALUES(?,?,?)').run(r.code, r.g.winner, r.players.length);
    r.players.forEach(p => db.prepare('UPDATE users SET games=games+1, wins=wins+? WHERE id=?').run(p.id === r.g.winner ? 1 : 0, p.id));
  } else armTimer(r);
  push(r);
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws, req) => {
  const user = userOf(new URL(req.url, 'http://x').searchParams.get('token'));
  if (!user) return ws.close();
  socks.set(user.id, ws);
  let room = [...rooms.values()].find(r => r.status !== 'done' && r.players.some(p => p.id === user.id));
  if (room) push(room);
  const err = m => ws.send(JSON.stringify({ type: 'error', error: m }));
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    const cur = () => room && rooms.get(room.code);
    if (m.type === 'create') {
      const code = genCode(), max = Math.min(10, Math.max(2, +m.max || 4)), start = Math.min(15, Math.max(1, +m.start || 7)), timer = [0, 15, 30, 45, 60, 90, 120].includes(+m.timer) ? +m.timer : 0;
      const r = { code, name: String(m.name || user.username + "'s group").slice(0, 24), host: user.id, max, start, timer, status: 'lobby', players: [{ id: user.id, name: user.username }], g: null };
      rooms.set(code, r); room = r;
      db.prepare('INSERT INTO groups(code,name,host_id,max_players,start_cards,timer_sec) VALUES(?,?,?,?,?,?)').run(code, r.name, user.id, max, start, timer);
      db.prepare('INSERT INTO group_players VALUES(?,?)').run(code, user.id); return push(r);
    }
    if (m.type === 'join') {
      const r = rooms.get(String(m.code).trim()); if (!r) return err('Invalid code');
      if (!r.players.some(p => p.id === user.id)) {
        if (r.status !== 'lobby') return err('Game already started'); if (r.players.length >= r.max) return err('Group is full');
        r.players.push({ id: user.id, name: user.username }); db.prepare('INSERT OR IGNORE INTO group_players VALUES(?,?)').run(r.code, user.id);
      } room = r; return push(r);
    }
    const r = cur(); if (!r) return err('Join a group first');
    if (m.type === 'leave') { if (r.status === 'lobby') { r.players = r.players.filter(p => p.id !== user.id); db.prepare('DELETE FROM group_players WHERE code=? AND user_id=?').run(r.code, user.id); push(r); } room = null; return ws.send(JSON.stringify({ type: 'left' })); }
    if (m.type === 'start') {
      if (r.host !== user.id) return err('Only host can start'); if (r.players.length < 2) return err('Need at least 2 players');
      r.g = game.newGame(r.players.map(p => p.id), r.start); r.status = 'playing'; db.prepare("UPDATE groups SET status='playing' WHERE code=?").run(r.code); return afterMove(r);
    }
    if (r.status !== 'playing') return;
    const n = user.username; let e = null;
    if (m.type === 'play') e = game.play(r.g, user.id, +m.i, m.color, n);
    else if (m.type === 'draw') e = game.draw(r.g, user.id, n);
    else if (m.type === 'pass') e = game.pass(r.g, user.id);
    else if (m.type === 'uno') e = game.uno(r.g, user.id);
    else if (m.type === 'catch') e = game.catchUno(r.g, user.id, nameOf(r));
    if (e) return err(e); afterMove(r);
  });
  ws.on('close', () => { if (socks.get(user.id) === ws) socks.delete(user.id); });
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('UNO running on http://localhost:' + PORT));
