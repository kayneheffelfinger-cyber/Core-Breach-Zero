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
const sessions = new Map(); // token hash -> { name, expiresAt }

function loadAccounts() {
  try {
    return JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
  } catch {
    return {};
  }
}

const accounts = loadAccounts();
for (const account of Object.values(accounts)) {
  for (const session of Array.isArray(account.sessions) ? account.sessions : []) {
    if (session.expiresAt > Date.now()) {
      sessions.set(session.tokenHash, { name: account.name, expiresAt: session.expiresAt });
    }
  }
}

function saveAccounts() {
  fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
}

function hashPasscode(passcode, salt) {
  return crypto.scryptSync(passcode, salt, 32).toString('hex');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createSession(name) {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + SESSION_MS;
  const tokenDigest = tokenHash(token);
  const account = accounts[name];
  account.sessions = (account.sessions || []).filter((session) => session.expiresAt > Date.now());
  account.sessions.push({ tokenHash: tokenDigest, expiresAt });
  sessions.set(tokenDigest, { name, expiresAt });
  saveAccounts();
  return token;
}

function sessionName(token) {
  const session = sessions.get(tokenHash(token));
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    revokeSession(token);
    return null;
  }
  return session.name;
}

function revokeSession(token) {
  const tokenDigest = tokenHash(token);
  const session = sessions.get(tokenDigest);
  if (!session) return;
  sessions.delete(tokenDigest);
  const account = accounts[session.name];
  if (account) {
    account.sessions = (account.sessions || []).filter((entry) => entry.tokenHash !== tokenDigest);
    saveAccounts();
  }
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
    accounts[name] = { name, email, salt, hash: hashPasscode(passcode, salt), sessions: [], createdAt: new Date().toISOString() };
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

  if (pathname === '/api/logout' && request.method === 'POST') {
    const body = await readBody(request);
    const token = body ? String(body.token || '') : '';
    revokeSession(token);
    return sendJson(response, 200, { ok: true });
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

const MAP_PROTOCOLS = ['easy', 'medium', 'hard', 'insane', 'cbz'];
const rooms = new Map();
for (const [id, name] of [
  ['room-01', 'ROOM 01 // ALPHA'],
  ['room-02', 'ROOM 02 // BRAVO'],
  ['room-03', 'ROOM 03 // CHARLIE'],
  ['room-04', 'ROOM 04 // DELTA'],
]) {
  rooms.set(id, { id, name, players: [], map: null, started: false });
}

const webSockets = new WebSocketServer({ server, path: '/rooms' });

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function roomSnapshot(room) {
  return {
    id: room.id,
    name: room.name,
    map: room.map,
    maxPlayers: 4,
    started: room.started,
    commanders: room.players.map((player, index) => ({ callsign: player.callsign, isHost: index === 0 })),
  };
}

function roomsSnapshot() {
  return [...rooms.values()].map(roomSnapshot);
}

function broadcastRooms() {
  const message = JSON.stringify({ type: 'rooms', rooms: roomsSnapshot() });
  for (const client of webSockets.clients) {
    if (client.readyState === client.OPEN) client.send(message);
  }
}

function broadcastRoom(room) {
  const message = { type: 'room-update', room: roomSnapshot(room) };
  for (const player of room.players) send(player.socket, message);
}

function removePlayer(room, socket) {
  const index = room.players.findIndex((player) => player.socket === socket);
  if (index === -1) return;
  room.players.splice(index, 1);
  socket.roomId = null;
  if (room.players.length === 0) Object.assign(room, { map: null, started: false });
  else broadcastRoom(room);
  broadcastRooms();
}

webSockets.on('connection', (socket) => {
  socket.roomId = null;
  socket.authenticated = false;

  socket.on('message', (raw) => {
    if (raw.length > 65536) return socket.close(1009, 'Message too large');
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', message: 'Invalid message.' });
    }

    if (!socket.authenticated) {
      if (message.type !== 'authenticate') {
        send(socket, { type: 'auth-error', message: 'Authenticate before entering a room.' });
        return socket.close(1008, 'Authentication required');
      }
      const token = typeof message.token === 'string' ? message.token : '';
      const name = sessionName(token);
      if (!name || !accounts[name]) {
        send(socket, { type: 'auth-error', message: 'Session expired. Log in again.' });
        return socket.close(1008, 'Invalid session');
      }
      socket.authenticated = true;
      socket.sessionToken = token;
      socket.callsign = name;
      send(socket, { type: 'linked', callsign: name, rooms: roomsSnapshot() });
      return;
    }

    if (!sessionName(socket.sessionToken)) {
      send(socket, { type: 'auth-error', message: 'Session expired. Log in again.' });
      return socket.close(1008, 'Session expired');
    }
    if (message.type === 'rooms') return send(socket, { type: 'rooms', rooms: roomsSnapshot() });

    if (message.type === 'join') {
      const room = rooms.get(String(message.room || ''));
      if (!room) return send(socket, { type: 'error', message: 'Room not found.' });
      if (socket.roomId) return send(socket, { type: 'error', message: 'Leave your current room before switching.' });
      if (room.started) return send(socket, { type: 'error', message: 'This room has already started.' });
      if (room.players.length >= 4) return send(socket, { type: 'error', message: 'Room is full. Choose another room.' });
      room.players.push({ socket, callsign: socket.callsign });
      socket.roomId = room.id;
      send(socket, { type: 'joined', you: socket.callsign, room: roomSnapshot(room) });
      broadcastRoom(room);
      return broadcastRooms();
    }

    const room = rooms.get(socket.roomId);
    if (!room) return;
    const playerIndex = room.players.findIndex((player) => player.socket === socket);
    if (playerIndex === -1) return;

    if (message.type === 'leave') return removePlayer(room, socket);
    if (message.type === 'config') {
      if (playerIndex !== 0) return send(socket, { type: 'error', message: 'Only the room lead can change the map.' });
      if (room.started) return send(socket, { type: 'error', message: 'This room has already started.' });
      if (!MAP_PROTOCOLS.includes(message.map)) return send(socket, { type: 'error', message: 'Unknown map protocol.' });
      room.map = message.map;
      broadcastRoom(room);
      return broadcastRooms();
    }
    if (message.type === 'start') {
      if (playerIndex !== 0) return send(socket, { type: 'error', message: 'Only the room lead can start the mission.' });
      if (room.started) return send(socket, { type: 'error', message: 'This room has already started.' });
      if (!room.map) return send(socket, { type: 'error', message: 'Select a map before starting.' });
      if (room.players.length < 2) return send(socket, { type: 'error', message: 'Wait for at least one other commander before starting.' });
      room.started = true;
      const snapshot = roomSnapshot(room);
      for (const player of room.players) send(player.socket, { type: 'launch', room: snapshot });
      broadcastRooms();
      return;
    }
  });

  socket.on('close', () => {
    const room = rooms.get(socket.roomId);
    if (room) removePlayer(room, socket);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Core Breach: Zero listening on http://0.0.0.0:${port}`);
});
