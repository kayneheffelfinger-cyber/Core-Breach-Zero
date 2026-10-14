const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const accountsFile = path.join(root, 'accounts.json');
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// --- Commander accounts (persisted to accounts.json) ---------------------------
const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const sessions = new Map(); // token -> { name, expiresAt }

function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  } catch {
    return {};
  }
}

const accounts = loadAccounts();

// --- Nexus economy (mirrored in shop.js — keep in sync) -----------------------
const MAX_LEVEL = 30;
const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));
const SHOP = {
  sentinel: { name: 'SENTINEL TURRET', unlock: 1, price: 0, currency: 'nc' },
  arclance: { name: 'ARC LANCE', unlock: 1, price: 400, currency: 'nc' },
  plasmort: { name: 'PLASMA MORTAR', unlock: 2, price: 550, currency: 'nc' },
  cryobeacon: { name: 'CRYO DISRUPTOR', unlock: 3, price: 650, currency: 'nc' },
  scrapforge: { name: 'SCRAP FOUNDRY', unlock: 5, price: 700, currency: 'nc' },
  railspire: { name: 'RAIL SPIRE', unlock: 7, price: 950, currency: 'nc' },
  stingerpad: { name: 'STINGER PAD', unlock: 9, price: 1150, currency: 'nc' },
  teslacoil: { name: 'TESLA COIL', unlock: 11, price: 1400, currency: 'nc' },
  flakstorm: { name: 'FLAK STORM', unlock: 13, price: 1600, currency: 'nc' },
  pyrewell: { name: 'PYRE WELL', unlock: 15, price: 1850, currency: 'nc' },
  nullbeacon: { name: 'NULL BEACON', unlock: 17, price: 2200, currency: 'nc' },
  quantum: { name: 'QUANTUM SNIPER', unlock: 19, price: 2600, currency: 'nc' },
  gravwell: { name: 'GRAVITY WELL', unlock: 21, price: 3000, currency: 'nc' },
  naniteweb: { name: 'NANITE WEB', unlock: 23, price: 3400, currency: 'nc' },
  phasedeca: { name: 'PHASE DECIMATOR', unlock: 25, price: 180, currency: 'bt' },
  singularity: { name: 'SINGULARITY CORE', unlock: 30, price: 400, currency: 'bt' },
};
const REWARDS = {
  easy: { waveNC: 8, waveXP: 12, bossNC: 10, bossBT: 1, bossXP: 30, winNC: 60, winXP: 80, flawlessNC: 25, flawlessBT: 2, flawlessXP: 50, firstClearBT: 5 },
};

function defaultMeta() {
  return { nc: 750, bt: 0, xp: 0, level: 1, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'] };
}

// Grant legacy accounts the Nexus wallet without touching their credentials.
for (const account of Object.values(accounts)) {
  account.meta = { ...defaultMeta(), ...(account.meta && typeof account.meta === 'object' ? account.meta : {}) };
}

function profilePayload(account) {
  const meta = account.meta;
  return { name: account.name, level: meta.level, xp: meta.xp, xpNext: xpToNext(meta.level), maxLevel: MAX_LEVEL, nc: meta.nc, bt: meta.bt, firstClear: meta.firstClear, owned: meta.owned, loadout: meta.loadout || [] };
}

function saveAccounts() {
  fs.writeFile(accountsFile, JSON.stringify(accounts, null, 2), () => {});
}

function hashPasscode(passcode, salt) {
  return crypto.scryptSync(passcode, salt, 32).toString('hex');
}

function createSession(name) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { name, expiresAt: Date.now() + SESSION_MS });
  return token;
}

function sessionName(token) {
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return session.name;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 4096) {
        resolve(null);
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) return resolve(null);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    request.on('error', () => resolve(null));
  });
}

async function handleApi(request, response, pathname) {
  if (pathname === '/api/register' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, error: 'Invalid request.' });
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim().toLowerCase();
    const passcode = String(body.passcode || '');
    if (!NAME_RE.test(name)) return sendJson(response, 400, { ok: false, error: 'Name must be 3-16 characters (letters, numbers, - or _).' });
    if (!EMAIL_RE.test(email)) return sendJson(response, 400, { ok: false, error: 'Enter a valid email address.' });
    if (passcode.length < 4 || passcode.length > 64) return sendJson(response, 400, { ok: false, error: 'Passcode must be 4-64 characters.' });
    if (accounts[name]) return sendJson(response, 400, { ok: false, error: 'That commander name is already taken.' });
    if (Object.values(accounts).some((account) => account.email === email)) {
      return sendJson(response, 400, { ok: false, error: 'That email is already registered.' });
    }
    const salt = crypto.randomBytes(16).toString('hex');
    accounts[name] = { name, email, salt, hash: hashPasscode(passcode, salt), createdAt: new Date().toISOString(), meta: defaultMeta() };
    saveAccounts();
    return sendJson(response, 200, { ok: true, token: createSession(name), name, email });
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body) return sendJson(response, 400, { ok: false, error: 'Invalid request.' });
    const identity = String(body.identity || '').trim();
    const email = identity.toLowerCase();
    const passcode = String(body.passcode || '');
    const account = accounts[identity] || Object.values(accounts).find((entry) => entry.email === email);
    if (!account) return sendJson(response, 401, { ok: false, error: 'No account found for that name or email.' });
    const attempt = hashPasscode(passcode, account.salt);
    const expected = account.hash;
    if (attempt.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(attempt), Buffer.from(expected))) {
      return sendJson(response, 401, { ok: false, error: 'Wrong passcode. Try again.' });
    }
    return sendJson(response, 200, { ok: true, token: createSession(account.name), name: account.name, email: account.email });
  }

  if (pathname === '/api/session' && request.method === 'POST') {
    const body = await readBody(request);
    const token = body ? String(body.token || '') : '';
    const name = sessionName(token);
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    return sendJson(response, 200, { ok: true, name, email: accounts[name].email });
  }

  if (pathname === '/api/profile' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  if (pathname === '/api/shop/purchase' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const itemId = String(body.itemId || '');
    const item = SHOP[itemId];
    if (!item) return sendJson(response, 404, { ok: false, error: 'Unknown blueprint.' });
    const meta = accounts[name].meta;
    if (meta.owned.includes(itemId)) return sendJson(response, 409, { ok: false, error: 'Blueprint already in your armory.' });
    if (meta.level < item.unlock) return sendJson(response, 403, { ok: false, error: `Clearance level ${item.unlock} required.` });
    if (item.price > 0) {
      const balance = item.currency === 'bt' ? meta.bt : meta.nc;
      if (balance < item.price) return sendJson(response, 402, { ok: false, error: item.currency === 'bt' ? 'Not enough Breach Tokens.' : 'Not enough Nexus Coins.' });
      if (item.currency === 'bt') meta.bt -= item.price;
      else meta.nc -= item.price;
    }
    meta.owned.push(itemId);
    saveAccounts();
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  if (pathname === '/api/loadout' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const meta = accounts[name].meta;
    const list = Array.isArray(body.loadout) ? body.loadout.map((id) => String(id || '')) : null;
    if (!list) return sendJson(response, 400, { ok: false, error: 'Loadout payload must be a list of blueprint ids.' });
    const clean = [...new Set(list)].filter((id) => id && meta.owned.includes(id)).slice(0, 5);
    if (clean.length !== list.length) return sendJson(response, 400, { ok: false, error: 'Loadouts hold max 5 bays and only blueprints you own.' });
    meta.loadout = clean;
    saveAccounts();
    return sendJson(response, 200, { ok: true, profile: profilePayload(accounts[name]) });
  }

  if (pathname === '/api/mission/complete' && request.method === 'POST') {
    const body = await readBody(request);
    const name = sessionName(body ? String(body.token || '') : '');
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    const table = REWARDS[String(body.difficulty)] || REWARDS.easy;
    const win = body.result === 'win';
    const waves = Math.max(0, Math.min(15, Number(body.wavesCleared) || 0));
    const bosses = Math.max(0, Math.min(3, Number(body.bossesKilled) || 0));
    const flawless = Boolean(win && body.flawless);
    const bonusNc = Math.max(0, Math.min(600, Math.round(Number(body.bonusNc) || 0))); // Scrap Foundry yield
    const meta = accounts[name].meta;
    let nc = waves * table.waveNC + bosses * table.bossNC + bonusNc;
    let bt = bosses * table.bossBT;
    let xp = waves * table.waveXP + bosses * table.bossXP;
    if (win) { nc += table.winNC; xp += table.winXP; }
    if (flawless) { nc += table.flawlessNC; bt += table.flawlessBT; xp += table.flawlessXP; }
    let firstClear = false;
    if (win && !meta.firstClear) { meta.firstClear = true; firstClear = true; bt += table.firstClearBT; }
    const before = meta.level;
    meta.nc += nc;
    meta.bt += bt;
    meta.xp += xp;
    while (meta.level < MAX_LEVEL && meta.xp >= xpToNext(meta.level)) {
      meta.xp -= xpToNext(meta.level);
      meta.level += 1;
    }
    if (meta.level >= MAX_LEVEL) meta.xp = Math.min(meta.xp, xpToNext(MAX_LEVEL));
    saveAccounts();
    return sendJson(response, 200, { ok: true, rewards: { nc, bt, xp, bonusNc, firstClear, levelsGained: meta.level - before }, profile: profilePayload(accounts[name]) });
  }

  return sendJson(response, 404, { ok: false, error: 'Unknown API endpoint.' });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(request, response, pathname);
    return;
  }
  if (pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'online' }));
    return;
  }

  const requestedPath = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const filePath = path.resolve(root, `.${requestedPath}`);
  if (!filePath.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(error.code === 'ENOENT' ? 404 : 500).end('Not found');
      return;
    }
    response.writeHead(200, {
      'content-type': mimeTypes[path.extname(filePath)] || 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    });
    response.end(content);
  });
});

const rooms = new Map();
const webSockets = new WebSocketServer({ server, path: '/rooms' });

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function createRoomCode() {
  let code;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(code));
  return code;
}

function broadcast(room, message, except) {
  for (const player of room.players) {
    if (player !== except) send(player, message);
  }
}

webSockets.on('connection', (socket) => {
  socket.on('message', (raw) => {
    if (raw.length > 65536) return socket.close(1009, 'Message too large');
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', message: 'Invalid message.' });
    }

    if (message.type === 'create') {
      if (socket.roomCode) return;
      const code = createRoomCode();
      const room = { players: [socket] };
      rooms.set(code, room);
      socket.roomCode = code;
      socket.playerId = 0;
      send(socket, { type: 'created', code, playerId: 0 });
      return;
    }

    if (message.type === 'join') {
      const code = String(message.code || '').trim();
      const room = rooms.get(code);
      if (!room) return send(socket, { type: 'error', message: 'Room not found.' });
      if (room.players.length >= 2) return send(socket, { type: 'error', message: 'Room is full.' });
      room.players.push(socket);
      socket.roomCode = code;
      socket.playerId = 1;
      send(socket, { type: 'joined', code, playerId: 1 });
      broadcast(room, { type: 'peer-joined', playerId: 1 }, socket);
      return;
    }

    const room = rooms.get(socket.roomCode);
    if (!room) return;
    // Game messages (mode votes, launch sync) relay to the other commander.
    broadcast(room, message, socket);
  });

  socket.on('close', () => {
    const room = rooms.get(socket.roomCode);
    if (!room) return;
    room.players = room.players.filter((player) => player !== socket);
    broadcast(room, { type: 'peer-left' });
    if (room.players.length === 0) rooms.delete(socket.roomCode);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Core Breach: Zero listening on http://0.0.0.0:${port}`);
});
