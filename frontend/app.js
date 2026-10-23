const $ = document.getElementById('app'); let ws, room = null, pick = null, auth = JSON.parse(localStorage.getItem('uno-auth') || 'null'), authErr = '';
const COL = { R: 'Red', G: 'Green', B: 'Blue', Y: 'Yellow' }, esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lab = c => ({ S: '⊘', R: '⇄', D2: '+2', W: '🎨', W4: '+4', SH: '🔀' }[c.v] || c.v), isNum = c => /^\d$/.test(c.v);
const send = o => ws && ws.readyState === 1 && ws.send(JSON.stringify(o));
async function doAuth(kind) {
  const r = await fetch('/api/' + kind, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: un.value, password: pw.value }) });
  const d = await r.json(); if (!r.ok) { authErr = d.error; return render(); }
  auth = d; localStorage.setItem('uno-auth', JSON.stringify(d)); authErr = ''; connect();
}
function logout() { localStorage.removeItem('uno-auth'); auth = null; room = null; ws && ws.close(); render(); }
function connect() {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?token=' + auth.token);
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === 'state') room = m.room; if (m.type === 'left') room = null; if (m.type === 'error') alert(m.error); render(); };
  ws.onclose = () => { if (auth) setTimeout(() => auth && connect(), 2000); };
  render();
}
function render() {
  if (!auth) return $.innerHTML = `<h1>🃏 UNO Online</h1><div class="box"><h3>Login / Create account</h3><div class="row"><input id="un" placeholder="Username" maxlength="16"><input id="pw" type="password" placeholder="Password"><button onclick="doAuth('login')">Login</button><button class="s" onclick="doAuth('register')">Create account</button></div><p style="color:#d7263d">${esc(authErr)}</p></div>`;
  if (!room) return $.innerHTML = `<div class="row"><h1 style="flex:1">🃏 UNO Online</h1><span class="muted">${esc(auth.username)}</span><button class="s" onclick="logout()">Logout</button></div>
  <div class="box"><h3>Create group</h3><div class="row"><label>Group name<input id="gn" maxlength="24"></label><label>Players<select id="mx">${[2,3,4,5,6,7,8,9,10].map(n => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
  <label>Starting cards<input id="sc" type="number" min="1" max="15" value="7" style="width:90px"></label><label>Turn timer<select id="ts"><option value="0">Off</option>${[15,30,45,60,90,120].map(n => `<option value="${n}" ${n === 30 ? 'selected' : ''}>${n} sec</option>`).join('')}</select></label>
  <button onclick="send({type:'create',name:gn.value,max:mx.value,start:sc.value,timer:ts.value})">Create</button></div></div>
  <div class="box"><h3>Join with code</h3><div class="row"><input id="jc" inputmode="numeric" maxlength="8" placeholder="Group code"><button onclick="send({type:'join',code:jc.value})">Join</button></div></div>`;
  const x = room, g = x.g, nm = id => esc((x.players.find(p => p.id === id) || {}).name || '?');
  let h = `<div class="row"><h1 style="flex:1">${esc(x.name)}</h1><button class="s" onclick="send({type:'leave'})">← Lobby</button></div>`;
  if (x.status === 'lobby') return $.innerHTML = h + `<div class="box"><div style="font-size:28px;letter-spacing:4px">Code: <b>${x.code}</b></div><b>Players (${x.players.length}/${x.max}) · ${x.start} cards each · timer: ${x.timer ? x.timer + ' sec' : 'off'}</b><div class="row" style="margin:8px 0">${x.players.map(p => `<span class="pl">${esc(p.name)}${p.id === x.host ? ' 👑' : ''}</span>`).join('')}</div>${x.host === x.me ? `<button ${x.players.length < 2 ? 'disabled' : ''} onclick="send({type:'start'})">Start game</button>` : '<span class="muted">Waiting for host…</span>'}</div>`;
  const myTurn = g.turn === x.me && !g.winner;
  h += `<div class="box"><div class="row">${g.order.map(id => `<span class="pl ${g.turn === id && !g.winner ? 't' : ''}">${nm(id)}${id === x.me ? ' (you)' : ''}<br>🂠 ${g.counts[id]}${g.counts[id] === 1 ? ' <b>UNO!</b>' : ''}</span>`).join('')}</div>
  ${x.timer && g.tEnd ? '<p><b>⏱ <span id="tm"></span></b></p>' : ''}<p class="muted">Direction: ${g.dir > 0 ? '⟳' : '⟲'}</p></div>`;
  if (g.winner) h += `<div class="box"><h2>🏆 ${nm(g.winner)} won!</h2></div>`;
  h += `<div class="box"><div class="tbl"><div><div class="c back">UNO<br>${g.deck}</div></div><div><div class="c ${g.top.c === 'W' ? g.color : g.top.c}">${lab(g.top)}</div><div class="muted">Colour: <b>${COL[g.color]}</b></div></div></div>
  ${g.pend ? `<p style="text-align:center"><b>⚠ Penalty stack: ${g.pend}</b></p>` : ''}<div class="log">${g.log.map(esc).join('<br>')}</div></div>
  <div class="box"><b>Your cards</b> ${myTurn ? '— your turn!' : ''}<div class="cards" style="margin-top:8px">${g.hand.map((c, i) => { const ok = myTurn && can(g, c, i); return `<div class="c ${c.c} ${ok ? 'ok' : 'no'}" ${ok ? `onclick="tryPlay(${i})"` : ''}>${lab(c)}</div>`; }).join('')}</div>
  ${pick !== null ? `<p>Choose colour: ${Object.keys(COL).map(k => `<span class="dot" style="background:var(--${k})" onclick="send({type:'play',i:${pick},color:'${k}'});pick=null"></span>`).join('')}</p>` : ''}
  <div class="row" style="margin-top:10px"><button ${myTurn && !g.drew ? '' : 'disabled'} onclick="send({type:'draw'})">${g.pend ? 'Take ' + g.pend : 'Draw card'}</button>${g.drew && myTurn ? '<button class="s" onclick="send({type:\'pass\'})">Pass</button>' : ''}<button class="s" onclick="send({type:'uno'})">UNO!</button>${g.up && g.up !== x.me && !g.winner ? `<button onclick="send({type:'catch'})">Catch ${nm(g.up)}!</button>` : ''}</div></div>`;
  $.innerHTML = h;
}
// client-side hint only; the server re-checks every move
function can(g, c, i) { if (g.drewIdx != null && i !== g.drewIdx) return false; if (g.pend) return c.v === g.pt; if (g.hand.length === 1 && !isNum(c)) return false; return c.c === 'W' || c.c === g.color || c.v === g.top.v; }
function tryPlay(i) { if (room.g.hand[i].c === 'W') { pick = i; render(); } else send({ type: 'play', i }); }
setInterval(() => { const el = document.getElementById('tm'); if (el && room && room.g) el.textContent = Math.max(0, Math.ceil((room.g.tEnd - Date.now()) / 1000)) + 's left'; }, 300);
if (auth) connect(); else render();
