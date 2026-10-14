// Core Breach: Zero — deployment bay room service test.
// Exercises the restored fixed-bay multiplayer flow end to end:
//   authenticate -> linked -> join bay -> roster updates -> lead map config ->
//   start -> launch broadcast -> mission end unlock -> leave/reset.
// Run: node scripts/room-test.js (server must be listening on PORT, default 3000)
const PORT = Number(process.env.PORT || 3000);
const BASE = `http://127.0.0.1:${PORT}`;
let passed = 0;
let failed = 0;

function check(name, ok, extra = '') {
  if (ok) { passed += 1; console.log(`  ok - ${name}`); }
  else { failed += 1; console.log(`  FAIL - ${name} ${extra}`); }
}

async function api(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

function connect() {
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws');
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}/rooms`);
    const inbox = [];
    const waiters = [];
    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const index = waiters.findIndex((waiter) => waiter.match(message));
      if (index >= 0) {
        const [waiter] = waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
        return;
      }
      inbox.push(message);
    });
    socket.on('open', () => resolve({
      socket,
      send: (message) => socket.send(JSON.stringify(message)),
      close: () => socket.close(),
      wait: (match, ms = 2500, label = 'message') => new Promise((resolveWait, rejectWait) => {
        const found = inbox.findIndex(match);
        if (found >= 0) return resolveWait(inbox.splice(found, 1)[0]);
        const timer = setTimeout(() => {
          rejectWait(new Error(`timeout waiting for ${label}; inbox=[${inbox.map((m) => `${m.type || '??'}${m.room ? `:${m.room.id}:${m.room.commanders.length}` : ''}`).join(' | ') || 'EMPTY'}]`));
        }, ms);
        waiters.push({ match, resolve: resolveWait, timer });
      }),
    }));
    socket.on('error', reject);
  });
}

(async () => {
  const stamp = Date.now().toString(36);
  const nameA = `baytest_a_${stamp}`.slice(0, 16);
  const nameB = `baytest_b_${stamp}`.slice(0, 16);

  console.log('Auth setup');
  const regA = await api('/api/register', { name: nameA, email: `${nameA}@test.io`, passcode: 'corebreach' });
  const regB = await api('/api/register', { name: nameB, email: `${nameB}@test.io`, passcode: 'corebreach' });
  check('register commander A', regA.status === 200 && Boolean(regA.data.token));
  check('register commander B', regB.status === 200 && Boolean(regB.data.token));

  console.log('Bay link');
  const A = await connect();
  A.send({ type: 'authenticate', token: regA.data.token });
  const linkedA = await A.wait((m) => m.type === 'linked', 2500, 'linked(A)');
  check('A authenticates and receives 4 bays', Array.isArray(linkedA.rooms) && linkedA.rooms.length === 4);
  check('bays are ALPHA/BRAVO/CHARLIE/DELTA', linkedA.rooms.map((room) => room.id).join(',') === 'room-01,room-02,room-03,room-04');
  check('A callsign matches account name', linkedA.callsign === nameA);

  console.log('Join + roster');
  A.send({ type: 'join', room: 'room-01' });
  const joinedA = await A.wait((m) => m.type === 'joined', 2500, 'joined(A)');
  check('A joins room-01 as lead', joinedA.room.commanders.length === 1 && joinedA.room.commanders[0].isHost);

  // Lead picks the map while solo — allowed. Starting solo is not.
  A.send({ type: 'config', map: 'easy' });
  const soloConfig = await A.wait((m) => m.type === 'room-update' && m.room.map === 'easy', 2500, 'solo config');
  check('lead picks the map while solo', soloConfig.room.map === 'easy');
  A.send({ type: 'start' });
  const needTwo = await A.wait((m) => m.type === 'error' && /other commander/i.test(m.message), 2500, 'start guard');
  check('lead cannot start alone', Boolean(needTwo));

  const B = await connect();
  B.send({ type: 'authenticate', token: regB.data.token });
  await B.wait((m) => m.type === 'linked', 2500, 'linked(B)');
  B.send({ type: 'join', room: 'room-01' });
  const joinedB = await B.wait((m) => m.type === 'joined', 2500, 'joined(B)');
  check('B joins the same bay', joinedB.room.commanders.length === 2);
  const rosterA = await A.wait((m) => m.type === 'room-update' && m.room.commanders.length === 2, 2500, 'room-update(A)');
  check('A sees the squad grow to 2', rosterA.room.commanders.some((commander) => commander.callsign === nameB));

  console.log('Config + guards');
  B.send({ type: 'config', map: 'medium' });
  const denied = await B.wait((m) => m.type === 'error', 2500, 'config denied for non-lead');
  check('non-lead cannot pick the map', /room lead/i.test(denied.message));
  A.send({ type: 'config', map: 'medium' });
  const configA = await A.wait((m) => m.type === 'room-update' && m.room.map === 'medium', 2500, 'config applied');
  check('lead re-selects map for the squad', configA.room.map === 'medium');

  console.log('Launch + unlock');
  A.send({ type: 'start' });
  const launchA = await A.wait((m) => m.type === 'launch', 2500, 'launch(A)');
  const launchB = await B.wait((m) => m.type === 'launch', 2500, 'launch(B)');
  check('launch broadcast to lead', launchA.room.started && launchA.room.map === 'medium');
  check('launch broadcast to ally', launchB.room.started && launchB.room.map === 'medium');

  B.send({ type: 'end' });
  const endedA = await A.wait((m) => m.type === 'room-update' && m.room.started === false && m.room.commanders.length === 2, 2500, 'end unlock');
  check('mission end unlocks the bay', endedA.room.started === false && endedA.room.commanders.length === 2);

  console.log('Leave + reset');
  A.send({ type: 'leave' });
  await B.wait((m) => m.type === 'room-update' && m.room.commanders.length === 1, 2500, 'leave update');
  check('lead leaving shrinks the roster', true);
  B.send({ type: 'leave' });
  const roomsAfter = await connect().then(async (C) => {
    C.send({ type: 'authenticate', token: regA.data.token });
    const linked = await C.wait((m) => m.type === 'linked', 2500, 'linked(C)');
    C.close();
    return linked.rooms;
  });
  const bay01 = roomsAfter.find((room) => room.id === 'room-01');
  check('empty bay resets map + started flag', bay01.commanders.length === 0 && bay01.map === null && bay01.started === false);

  console.log('Capacity guard');
  const squad = [];
  const regC = await api('/api/register', { name: `baytest_c_${stamp}`.slice(0, 16), email: `c${stamp}@test.io`, passcode: 'corebreach' });
  const regD = await api('/api/register', { name: `baytest_d_${stamp}`.slice(0, 16), email: `d${stamp}@test.io`, passcode: 'corebreach' });
  const tokens = [regA.data, regB.data, regC.data, regD.data];
  for (const token of tokens) {
    const client = await connect();
    client.send({ type: 'authenticate', token: token.token });
    await client.wait((m) => m.type === 'linked', 2500, 'linked');
    client.send({ type: 'join', room: 'room-02' });
    squad.push(client);
  }
  const results = await Promise.all(squad.map((client, index) =>
    client.wait((m) => m.type === 'joined' || m.type === 'error', 2500, 'join result').then((m) => m.type)));
  check('4 commanders fill a bay', results.filter((type) => type === 'joined').length === 4);
  const extra = await connect();
  extra.send({ type: 'authenticate', token: regA.data.token });
  await extra.wait((m) => m.type === 'linked', 2500, 'linked(extra)');
  extra.send({ type: 'join', room: 'room-02' });
  const fullError = await extra.wait((m) => m.type === 'error', 2500, 'full bay');
  check('5th commander is turned away', /full/i.test(fullError.message));
  for (const client of [...squad, extra]) client.close();

  A.close();
  B.close();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch((error) => {
  console.error('ROOM TEST CRASH:', error.message);
  process.exit(1);
});
