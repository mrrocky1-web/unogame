// UNO rules engine. Pure logic, no network. Hands are keyed by user id.
const shuf = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isNum = c => /^\d$/.test(c.v);
function mkDeck(n) {
  const d = [];
  for (let k = 0; k < n; k++) {
    for (const c of 'RGBY') {
      d.push({ c, v: '0' });
      for (let v = 1; v <= 9; v++) d.push({ c, v: '' + v }, { c, v: '' + v });
      for (const v of ['S', 'R', 'D2']) d.push({ c, v }, { c, v });
    }
    for (let i = 0; i < 4; i++) d.push({ c: 'W', v: 'W' }, { c: 'W', v: 'W4' }, { c: 'W', v: 'SH' }); // SH = shuffle (colour change only)
  }
  return shuf(d);
}
const nxt = (g, s = 1) => ((g.turn + g.dir * s) % g.order.length + g.order.length * 2) % g.order.length;
function take(g, id, n) {
  for (let i = 0; i < n; i++) {
    if (!g.deck.length) { const t = g.disc.pop(); g.deck = shuf(g.disc); g.disc = [t]; if (!g.deck.length) break; }
    g.hands[id].push(g.deck.pop());
  }
}
function newGame(ids, start) {
  const g = { deck: mkDeck(ids.length * start > 70 ? 2 : 1), disc: [], hands: {}, order: shuf([...ids]), turn: 0, dir: 1, pend: 0, pt: 0, drew: false, drewIdx: null, up: null, unoOk: false, winner: null, log: ['Game started'] };
  g.order.forEach(id => { g.hands[id] = []; take(g, id, start); });
  let t; do { t = g.deck.pop(); if (!isNum(t)) g.deck.unshift(t); } while (!isNum(t));
  g.disc = [t]; g.color = t.c;
  return g;
}
const topCard = g => g.disc[g.disc.length - 1];
const matches = (g, c) => c.c === 'W' || c.c === g.color || c.v === topCard(g).v;
function canPlay(g, uid, i) {
  const h = g.hands[uid], c = h[i];
  if (!c) return false;
  if (g.drewIdx != null && i !== g.drewIdx) return false;      // after drawing, only that card may be played
  if (g.pend) return c.v === g.pt;                            // +2 on +2, +4 on +4 (any colour)
  if (h.length === 1 && !isNum(c)) return false;              // no action/plus/wild as the last card
  return matches(g, c);
}
function play(g, uid, i, col, name) {
  if (g.winner || g.order[g.turn] !== uid) return 'Not your turn';
  if (!canPlay(g, uid, i)) return 'Invalid card';
  const h = g.hands[uid], c = h[i];
  if (c.c === 'W' && !'RGBY'.includes(col)) return 'Choose a colour';
  h.splice(i, 1); g.disc.push(c); g.color = c.c === 'W' ? col : c.c;
  g.drew = false; g.drewIdx = null; g.up = null;
  g.log.push(`${name} played ${c.c === 'W' ? '' : c.c + ' '}${c.v}${c.c === 'W' ? ' -> ' + col : ''}`);
  if (!h.length) { g.winner = uid; g.log.push(name + ' wins!'); return null; }
  if (h.length === 1 && !g.unoOk) g.up = uid;               // forgot to call UNO: can be caught
  g.unoOk = false;
  let step = 1;
  if (c.v === 'S') step = 2;
  if (c.v === 'R') { g.dir *= -1; if (g.order.length === 2) step = 2; }
  if (c.v === 'D2' || c.v === 'W4') { g.pend += c.v === 'D2' ? 2 : 4; g.pt = c.v; }
  g.turn = nxt(g, step);
  return null;
}
function draw(g, uid, name) {
  if (g.winner || g.order[g.turn] !== uid || g.drew) return 'Not allowed';
  g.up = null;
  if (g.pend) { take(g, uid, g.pend); g.log.push(`${name} drew ${g.pend} (penalty)`); g.pend = 0; g.pt = 0; g.turn = nxt(g); return null; }
  const h = g.hands[uid];
  if (h.length === 1 && !isNum(h[0])) {                       // only an action card left: draw until a playable number card
    let c; do { take(g, uid, 1); c = h[h.length - 1]; } while (!(isNum(c) && matches(g, c)) && g.deck.length);
    g.log.push(name + ' drew until a number card');
  } else { take(g, uid, 1); g.log.push(name + ' drew a card'); }
  const i = h.length - 1;
  if (matches(g, h[i]) && !(h.length === 1 && !isNum(h[i]))) { g.drew = true; g.drewIdx = i; } else g.turn = nxt(g);
  return null;
}
function pass(g, uid) {
  if (g.order[g.turn] !== uid || !g.drew) return 'Not allowed';
  g.drew = false; g.drewIdx = null; g.turn = nxt(g); return null;
}
function uno(g, uid) {
  if (g.hands[uid].length !== 1) return 'You do not have 1 card';
  if (g.up === uid) g.up = null; else g.unoOk = true; return null;
}
function catchUno(g, uid, nameOf) {
  if (!g.up || g.up === uid) return 'Nothing to catch';
  take(g, g.up, 2); g.log.push(`${nameOf(uid)} caught ${nameOf(g.up)}: +2 cards`); g.up = null; return null;
}
function timeout(g, nameOf) {
  const id = g.order[g.turn], n = g.pend || 1;
  take(g, id, n); g.log.push(`${nameOf(id)} ran out of time, drew ${n}`);
  g.pend = 0; g.pt = 0; g.drew = false; g.drewIdx = null; g.up = null; g.turn = nxt(g);
}
module.exports = { newGame, play, draw, pass, uno, catchUno, timeout, canPlay, topCard };
