// Runs the server and plays a host and two guests against it.
process.env.PORT = process.env.PORT || '18080';
const { server, rooms } = require('./server');
const WebSocket = require('ws');
const assert = require('assert');
const url = 'ws://127.0.0.1:' + process.env.PORT;
const open = () => new Promise((res) => { const w = new WebSocket(url); w.q = []; w.on('message', (d) => { w.q.push(JSON.parse(d)); if (w.wake) w.wake(); }); w.on('open', () => res(w)); });
const next = (w) => new Promise((res) => { const go = () => w.q.length ? res(w.q.shift()) : (w.wake = go); go(); });
const tx = (w, o) => w.send(JSON.stringify(o));
(async () => {
  const host = await open();
  tx(host, { t: 'host', room: 'bad room!' }); assert.equal((await next(host)).t, 'error');
  tx(host, { t: 'host', room: 'pizza42' }); assert.deepEqual(await next(host), { t: 'hosted', room: 'PIZZA42' });
  const dup = await open(); tx(dup, { t: 'host', room: 'PIZZA42' }); assert.equal((await next(dup)).t, 'error'); dup.close();
  const nope = await open(); tx(nope, { t: 'join', room: 'NOPE' }); assert.match((await next(nope)).msg, /no game/); nope.close();
  const g1 = await open(); tx(g1, { t: 'join', room: 'pizza42' });
  const a = await next(host); assert.equal(a.t, 'guest');
  tx(host, { t: 'offer', gid: a.gid, code: 'RD1-offer' }); assert.deepEqual(await next(g1), { t: 'offer', code: 'RD1-offer' });
  tx(g1, { t: 'answer', code: 'RD1-answer' }); assert.deepEqual(await next(host), { t: 'answer', gid: a.gid, code: 'RD1-answer' });
  const g2 = await open(), g3 = await open(), g4 = await open();
  for (const g of [g2, g3]) { tx(g, { t: 'join', room: 'PIZZA42' }); await next(host); }
  tx(g4, { t: 'join', room: 'PIZZA42' }); assert.match((await next(g4)).msg, /full/);
  // public listing: only rooms whose host asked for it
  const lister = await open(); tx(lister, { t: 'list' });
  assert.deepEqual((await next(lister)).rooms, []);
  const pub = await open(); tx(pub, { t: 'host', room: 'open-1', pub: true, name: 'Zed\u0007 the host' }); await next(pub);
  tx(lister, { t: 'list' }); const l = (await next(lister)).rooms;
  assert.deepEqual(l, [{ room: 'OPEN-1', name: 'Zed the host', players: 1, max: 4 }]);
  pub.close(); lister.close();
  host.close(); assert.match((await next(g1)).msg, /host left/);
  await new Promise((r) => setTimeout(r, 100)); assert.equal(rooms.size, 0);
  console.log('server test ok'); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
