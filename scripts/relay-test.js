#!/usr/bin/env node
// Relay-lane E2E: exercises the exact MQTT topic scheme + room protocol that
// app.js P2P_ROOMS speaks over the public broker (HiveMQ -> EMQX fallback).
// A simulated room lead serves a bay; a simulated guest scans, joins, chats,
// receives launch + coop sync, leaves, and is refused re-entry once started.
// Run: node scripts/relay-test.js
const URLS = process.env.CBZ_RELAY_URLS
  ? process.env.CBZ_RELAY_URLS.split(',')
  : ['wss://broker.hivemq.com:8884/mqtt', 'wss://broker.emqx.io:8084/mqtt'];

const HOST_KEY = `relaytest-${Date.now().toString(36)}`;
const BAY = 'room-01';
const topic = (kind) => `cbz0/${HOST_KEY}/${BAY}/${kind}`;
const { connect } = require('mqtt');

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failed += 1; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function clientConnect(tag) {
  return new Promise((resolve, reject) => {
    let index = 0;
    const attempt = () => {
      if (index >= URLS.length) return reject(new Error('no relay broker reachable'));
      const url = URLS[index];
      const client = connect(url, { clientId: `cbz-rt-${tag}-${Math.random().toString(36).slice(2, 8)}`, clean: true, connectTimeout: 7000, reconnectPeriod: 0 });
      const kill = setTimeout(() => { try { client.end(true); } catch { /* ignore */ } index += 1; attempt(); }, 9000);
      client.on('connect', () => { clearTimeout(kill); resolve({ client, url }); });
      client.on('error', () => { /* handled by timeout or end */ });
    };
    attempt();
  });
}

function pub(client, t, message) { client.publish(t, JSON.stringify(message)); }

(async () => {
  console.log(`RELAY TEST — broker ladder: ${URLS.join(' -> ')}`);
  console.log(`namespace: cbz0/${HOST_KEY}/${BAY}/*`);
  const deadline = setTimeout(() => { console.log(`\nRELAY TEST TIMED OUT`); process.exit(1); }, 60000);

  const [host, guest] = await Promise.all([clientConnect('host'), clientConnect('guest')]);
  check('relay broker connected (host + guest clients)', true);
  console.log(`  using ${host.url}`);

  const inbox = [];
  const waitFor = (predicate, ms, label) => new Promise((resolve) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const hit = inbox.find(predicate);
      if (hit) { clearInterval(timer); resolve(hit); }
      else if (Date.now() - started > ms) { clearInterval(timer); resolve(null); console.log(`  (timeout waiting: ${label})`); }
    }, 25);
  });

  guest.client.on('message', (t, raw) => { try { inbox.push({ topic: t, message: JSON.parse(raw.toString()) }); } catch { /* ignore */ } });

  // --- HOST: serve the bay on the relay -------------------------------------
  let started = false;
  const roster = [{ callsign: 'TESTLEAD', isHost: true }];
  const snapshot = () => ({ id: BAY, name: 'ROOM 01 // ALPHA', map: started ? 'patrol' : null, protocol: 'easy', maxPlayers: 4, started, commanders: roster.slice() });
  const cids = new Map(); // cid -> callsign
  const uniqueName = (name) => (roster.some((commander) => commander.callsign === name) ? `${name}-2` : name);
  host.client.subscribe(topic('up'));
  host.client.on('message', (t, raw) => {
    let message; try { message = JSON.parse(raw.toString()); } catch { return; }
    if (!message || typeof message.cid !== 'string') return;
    if (message.type === 'join') {
      if (started) return pub(host.client, topic('dn'), { to: message.cid, type: 'error', message: 'This room has already started.' });
      if (roster.length >= 4) return pub(host.client, topic('dn'), { to: message.cid, type: 'error', message: 'Room is full. Choose another room.' });
      const name = uniqueName(String(message.callsign || 'COMMANDER').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 16) || 'COMMANDER');
      cids.set(message.cid, name);
      roster.push({ callsign: name, isHost: false });
      pub(host.client, topic('dn'), { to: message.cid, type: 'joined', you: name, room: snapshot(), chat: [] });
      return;
    }
    const callsign = cids.get(message.cid);
    if (!callsign) return;
    if (message.type === 'ping') return pub(host.client, topic('dn'), { to: message.cid, type: 'ping' });
    if (message.type === 'leave') { const i = roster.findIndex((commander) => commander.callsign === callsign); if (i > 0) roster.splice(i, 1); cids.delete(message.cid); pub(host.client, topic('dn'), { type: 'room-update', room: snapshot() }); return; }
    if (message.type === 'chat') { const text = String(message.text || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 280); if (!text) return; pub(host.client, topic('dn'), { type: 'chat', from: callsign, text, ts: Date.now() }); return; }
    if (message.type === 'end' && !started) { started = true; pub(host.client, topic('dn'), { to: message.cid, type: 'launch', room: snapshot() }); }
  });

  const heart = setInterval(() => pub(host.client, topic('state'), snapshot()), 350);

  // --- GUEST: scan -> join -> chat -> launch -> sync -> leave ----------------
  guest.client.subscribe(topic('state'));
  const seen = await waitFor((entry) => entry.topic === topic('state') && entry.message.id === BAY, 12000, 'bay state heartbeat');
  check('relay scan: guest discovers the bay via state heartbeat', Boolean(seen && seen.message.commanders.length === 1));
  check('relay scan snapshot is fresh (started=false, protocol=easy)', Boolean(seen && seen.message.started === false && seen.message.protocol === 'easy'));

  guest.client.subscribe(topic('dn'));
  pub(guest.client, topic('up'), { type: 'join', callsign: 'TESTGUEST', cid: 'guestcid1' });
  const joined = await waitFor((entry) => entry.topic === topic('dn') && entry.message.to === 'guestcid1' && entry.message.type === 'joined', 12000, 'joined reply');
  check('relay join: guest receives addressed joined reply', Boolean(joined && joined.message.you === 'TESTGUEST'));
  check('relay roster: room now holds 2 commanders', Boolean(joined && joined.message.room.commanders.length === 2));

  pub(guest.client, topic('up'), { type: 'chat', text: 'relay link online', cid: 'guestcid1' });
  const chat = await waitFor((entry) => entry.topic === topic('dn') && entry.message.type === 'chat', 12000, 'chat echo');
  check('relay chat: broadcast rebroadcast with sender callsign', Boolean(chat && chat.message.from === 'TESTGUEST' && chat.message.text === 'relay link online'));

  const pingRound = await new Promise((resolve) => {
    const began = Date.now();
    pub(guest.client, topic('up'), { type: 'ping', cid: 'guestcid1' });
    const timer = setInterval(() => {
      const hit = inbox.find((entry) => entry.topic === topic('dn') && entry.message.to === 'guestcid1' && entry.message.type === 'ping');
      if (hit) { clearInterval(timer); resolve(true); }
      else if (Date.now() - began > 10000) { clearInterval(timer); resolve(false); }
    }, 25);
  });
  check('relay keepalive: guest ping echoed by the room lead', pingRound);

  pub(guest.client, topic('up'), { type: 'end', cid: 'guestcid1' });
  const launch = await waitFor((entry) => entry.topic === topic('dn') && entry.message.type === 'launch', 12000, 'launch');
  check('relay launch: guest receives launch with started room', Boolean(launch && launch.message.room.started === true && launch.message.room.map === 'patrol'));

  pub(host.client, topic('dn'), { to: 'guestcid1', type: 'coop', kind: 'sync', data: { w: 3, c: 250, b: 96 } });
  const sync = await waitFor((entry) => entry.topic === topic('dn') && entry.message.type === 'coop' && entry.message.kind === 'sync', 12000, 'coop sync');
  check('relay coop: host sync snapshot reaches the guest', Boolean(sync && sync.message.data.w === 3 && sync.message.data.c === 250));

  pub(guest.client, topic('up'), { type: 'leave', cid: 'guestcid1' });
  const update = await waitFor((entry) => entry.topic === topic('dn') && entry.message.type === 'room-update' && entry.message.room.commanders.length === 1, 12000, 'leave sweep');
  check('relay leave: seat swept, roster back to the room lead', Boolean(update));

  pub(guest.client, topic('up'), { type: 'join', callsign: 'LATECOMER', cid: 'guestcid2' });
  const refused = await waitFor((entry) => entry.topic === topic('dn') && entry.message.to === 'guestcid2' && entry.message.type === 'error', 12000, 'started-room refusal');
  check('relay guard: join refused once the mission started', Boolean(refused && /already started/i.test(refused.message.message)));

  clearInterval(heart);
  clearTimeout(deadline);
  try { host.client.end(true); } catch { /* ignore */ }
  try { guest.client.end(true); } catch { /* ignore */ }
  console.log(`\nRELAY RESULT: ${passed} passed, ${failed} failed (namespace ${HOST_KEY} leaves no retained state)`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.log(`RELAY TEST ERROR: ${error.message}`); process.exit(1); });
