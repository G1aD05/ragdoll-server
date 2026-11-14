// Room-code matchmaker ("signalling server") for Ragdoll Playground.
//
// Players never send game data through here. The host registers a room name, a friend asks to join it, and this
// server only hands the two their connection details (a few KB, once) so the browsers can link up directly with
// WebRTC. That is why the bandwidth use is tiny and the static game can live on a different host.
//
//   Host   -> {t:"host", room}              <- {t:"hosted"} | {t:"error", msg}
//   Guest  -> {t:"join", room}              host gets {t:"guest", gid}
//   Host   -> {t:"offer", gid, code}        guest gets {t:"offer", code}
//   Guest  -> {t:"answer", code}            host gets {t:"answer", gid, code}
//   either -> {t:"ping"}                    keeps the connection from idling out
//
// Environment: PORT (set by Render), MAX_GUESTS (default 3), ALLOWED_ORIGINS (comma list, default: any).
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 8080;
const MAX_GUESTS = Number(process.env.MAX_GUESTS) || 3;
const MAX_ROOMS = Number(process.env.MAX_ROOMS) || 2000;
const ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const ROOM_RE = /^[A-Z0-9_-]{3,24}$/;
const MAX_CODE = 32 * 1024; // an invite/reply code is about 1-3 KB

const rooms = new Map(); // ROOM -> { host: ws, guests: Map(gid -> ws), next: number }

const server = http.createServer((req, res) => {
  // health check, and what the game pokes to wake a sleeping free-tier server
  res.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' });
  res.end('ragdoll signalling server ok (' + rooms.size + ' rooms)\n');
});
const wss = new WebSocketServer({ server, maxPayload: MAX_CODE + 1024 });

function send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function bad(ws, msg) { send(ws, { t: 'error', msg }); }

// crude per-address rate limit for new connections
const hits = new Map();
setInterval(() => hits.clear(), 60 * 1000).unref();

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin || '';
  if (ORIGINS.length && !ORIGINS.includes(origin)) { ws.close(1008, 'origin not allowed'); return; }
  const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const n = (hits.get(ip) || 0) + 1; hits.set(ip, n);
  if (n > 60) { ws.close(1008, 'slow down'); return; }

  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let role = null, room = null, gid = null;

  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(String(data)); } catch (e) { return bad(ws, 'bad message'); }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') return send(ws, { t: 'pong' });

    if (m.t === 'host' && !role) {
      const name = String(m.room || '').trim().toUpperCase();
      if (!ROOM_RE.test(name)) return bad(ws, 'room codes are 3-24 letters, numbers, - or _');
      if (rooms.has(name)) return bad(ws, 'that room code is already taken, pick another');
      if (rooms.size >= MAX_ROOMS) return bad(ws, 'the server is full right now, try again later');
      role = 'host'; room = name;
      rooms.set(name, { host: ws, guests: new Map(), next: 1 });
      return send(ws, { t: 'hosted', room: name });
    }
    if (m.t === 'join' && !role) {
      const name = String(m.room || '').trim().toUpperCase();
      const r = rooms.get(name);
      if (!r) return bad(ws, 'no game with that room code (check the spelling, or ask the host to start hosting first)');
      if (r.guests.size >= MAX_GUESTS) return bad(ws, 'that room is full');
      role = 'guest'; room = name; gid = r.next++;
      r.guests.set(gid, ws);
      return send(r.host, { t: 'guest', gid });
    }
    const r = rooms.get(room);
    if (!r) return;
    if (role === 'host' && m.t === 'offer') {
      const g = r.guests.get(m.gid);
      if (g && typeof m.code === 'string' && m.code.length <= MAX_CODE) send(g, { t: 'offer', code: m.code });
    } else if (role === 'guest' && m.t === 'answer') {
      if (typeof m.code === 'string' && m.code.length <= MAX_CODE) send(r.host, { t: 'answer', gid, code: m.code });
    }
  });

  ws.on('close', () => {
    const r = rooms.get(room);
    if (!r) return;
    if (role === 'host') {
      rooms.delete(room);
      for (const g of r.guests.values()) { send(g, { t: 'error', msg: 'the host left' }); g.close(); }
    } else if (role === 'guest') {
      r.guests.delete(gid);
    }
  });
});

// drop connections that went silent (closed laptops, dropped wifi) so their room names free up
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 30 * 1000).unref();

server.listen(PORT, () => console.log('signalling server on :' + PORT));
module.exports = { server, wss, rooms };
