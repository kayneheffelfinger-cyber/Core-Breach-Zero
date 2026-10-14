// Compact end-to-end smoke test: accounts (name + email) + rooms + static files + map recon assets.
// Usage: node scripts/smoke-test.js  (expects server on PORT 3111)
const BASE = 'http://127.0.0.1:3111';
const { WebSocket } = require('ws');

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}

async function api(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

function wsConnect() {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket('ws://127.0.0.1:3111/rooms');
    socket.on('open', () => resolve(socket));
    socket.on('error', reject);
  });
}

function nextMessage(socket) {
  return new Promise((resolve) => {
    const handler = (raw) => { socket.off('message', handler); resolve(JSON.parse(raw.toString())); };
    socket.on('message', handler);
  });
}

(async () => {
  // --- Static files ---
  const home = await fetch(`${BASE}/`).then((r) => r.text());
  check('GET / serves game shell', home.includes('CORE BREACH') && home.includes('auth-overlay'));
  const appJs = await fetch(`${BASE}/app.js`);
  check('GET /app.js served as JS', appJs.ok && appJs.headers.get('content-type').includes('javascript'));
  check('GET /app.js has 5 map recon maps', (await appJs.text()).match(/\bid: '(easy|medium|hard|insane|cbz)'/g)?.length === 5);
  check('GET /styles.css served', (await fetch(`${BASE}/styles.css`)).ok);
  const health = await fetch(`${BASE}/health`).then((r) => r.json());
  check('GET /health online', health.status === 'online');

  // --- Accounts: register ---
  const reg = await api('/api/register', { name: 'SMOKE1', email: 'Smoke@Mail.com', passcode: 'corebreach' });
  check('register returns token + name + email', reg.status === 200 && reg.body.ok && !!reg.body.token && reg.body.name === 'SMOKE1' && reg.body.email === 'smoke@mail.com');
  check('register normalizes email to lowercase', reg.body.email === 'smoke@mail.com');
  check('register duplicate name rejected', (await api('/api/register', { name: 'SMOKE1', email: 'other@mail.com', passcode: 'corebreach' })).status === 400);
  check('register duplicate email rejected', (await api('/api/register', { name: 'SMOKE2', email: 'smoke@mail.com', passcode: 'corebreach' })).status === 400);
  check('register bad email rejected', (await api('/api/register', { name: 'SMOKE3', email: 'not-an-email', passcode: 'corebreach' })).status === 400);
  check('register short passcode rejected', (await api('/api/register', { name: 'SMOKE3', email: 's3@mail.com', passcode: 'abc' })).status === 400);
  check('register bad name rejected', (await api('/api/register', { name: 'no', email: 's4@mail.com', passcode: 'corebreach' })).status === 400);

  // --- Accounts: login (by name, by email, wrong passcode) ---
  const loginName = await api('/api/login', { identity: 'SMOKE1', passcode: 'corebreach' });
  check('login by name works', loginName.status === 200 && loginName.body.ok && loginName.body.name === 'SMOKE1');
  const loginEmail = await api('/api/login', { identity: 'SMOKE@MAIL.COM', passcode: 'corebreach' });
  check('login by email (case-insensitive) works', loginEmail.status === 200 && loginEmail.body.name === 'SMOKE1');
  check('login wrong passcode rejected', (await api('/api/login', { identity: 'SMOKE1', passcode: 'wrong-code' })).status === 401);
  check('login unknown identity rejected', (await api('/api/login', { identity: 'GHOST9', passcode: 'corebreach' })).status === 401);

  // --- Accounts: session ---
  const session = await api('/api/session', { token: reg.body.token });
  check('session token resolves commander', session.status === 200 && session.body.name === 'SMOKE1' && session.body.email === 'smoke@mail.com');
  check('session bad token rejected', (await api('/api/session', { token: 'deadbeef' })).status === 401);

  // --- Rooms over WebSocket ---
  const host = await wsConnect();
  host.send(JSON.stringify({ type: 'create' }));
  const created = await nextMessage(host);
  check('room create returns 6-digit code + playerId 0', created.type === 'created' && /^\d{6}$/.test(created.code) && created.playerId === 0);

  const stranger = await wsConnect();
  stranger.send(JSON.stringify({ type: 'join', code: '000001' }));
  check('join unknown room errors', (await nextMessage(stranger)).type === 'error');

  const guest = await wsConnect();
  guest.send(JSON.stringify({ type: 'join', code: created.code }));
  const joined = await nextMessage(guest);
  check('guest joins room as playerId 1', joined.type === 'joined' && joined.code === created.code && joined.playerId === 1);
  check('host notified of peer join', (await nextMessage(host)).type === 'peer-joined');

  const third = await wsConnect();
  third.send(JSON.stringify({ type: 'join', code: created.code }));
  check('third commander rejected (room full)', (await nextMessage(third)).type === 'error');

  host.send(JSON.stringify({ type: 'game-vote', voter: 0, mode: 'easy' }));
  const relayed = await nextMessage(guest);
  check('game messages relay host to guest', relayed.type === 'game-vote' && relayed.mode === 'easy' && relayed.voter === 0);
  guest.send(JSON.stringify({ type: 'game-vote', voter: 1, mode: 'easy' }));
  const relayedBack = await nextMessage(host);
  check('game messages relay guest to host', relayedBack.type === 'game-vote' && relayedBack.voter === 1);

  host.close();
  check('guest notified when host leaves', (await nextMessage(guest)).type === 'peer-left');
  guest.close();
  stranger.close();
  third.close();

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((error) => { console.error('SMOKE TEST CRASH:', error); process.exit(1); });
