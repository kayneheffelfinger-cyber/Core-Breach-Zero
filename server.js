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

// --- Commander accounts ----------------------------------------------------
const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const sessions = new Map();

function loadAccounts() {
  try {
    const data = JSON.parse(fs.readFileSync(accountsFile, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('Account store must contain a JSON object.');
    }
    return Object.assign(Object.create(null), data);
  } catch (error) {
    if (error.code === 'ENOENT') return Object.create(null);
    throw error;
  }
}

const accounts = loadAccounts();

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
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size <= 4096) chunks.push(chunk);
    });
    request.on('end', () => {
      if (!size || size > 4096) return resolve(null);
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(response, 400, { ok: false, error: 'Invalid request.' });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';
    if (!NAME_RE.test(name)) return sendJson(response, 400, { ok: false, error: 'Name must be 3-16 characters (letters, numbers, - or _).' });
    if (email.length > 64 || !EMAIL_RE.test(email)) return sendJson(response, 400, { ok: false, error: 'Enter a valid email address.' });
    if (passcode.length < 4 || passcode.length > 64) return sendJson(response, 400, { ok: false, error: 'Passcode must be 4-64 characters.' });
    if (accounts[name]) return sendJson(response, 400, { ok: false, error: 'That commander name is already taken.' });
    if (Object.values(accounts).some((account) => account.email === email)) {
      return sendJson(response, 400, { ok: false, error: 'That email is already registered.' });
    }

    const salt = crypto.randomBytes(16).toString('hex');
    accounts[name] = { name, email, salt, hash: hashPasscode(passcode, salt), createdAt: new Date().toISOString() };
    try {
      fs.writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
    } catch (error) {
      delete accounts[name];
      console.error('Could not save commander account:', error);
      return sendJson(response, 500, { ok: false, error: 'Could not save the account. Try again later.' });
    }
    return sendJson(response, 200, { ok: true, token: createSession(name), name, email });
  }

  if (pathname === '/api/login' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return sendJson(response, 400, { ok: false, error: 'Invalid request.' });
    }
    const identity = typeof body.identity === 'string' ? body.identity.trim() : '';
    const passcode = typeof body.passcode === 'string' ? body.passcode : '';
    const account = accounts[identity] || Object.values(accounts).find((entry) => entry.email === identity.toLowerCase());
    if (!account || passcode.length < 4 || passcode.length > 64) {
      return sendJson(response, 401, { ok: false, error: 'Invalid commander name/email or passcode.' });
    }
    const attempt = hashPasscode(passcode, account.salt);
    const expected = account.hash;
    const attemptBuffer = Buffer.from(attempt, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    if (attemptBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(attemptBuffer, expectedBuffer)) {
      return sendJson(response, 401, { ok: false, error: 'Invalid commander name/email or passcode.' });
    }
    return sendJson(response, 200, { ok: true, token: createSession(account.name), name: account.name, email: account.email });
  }

  if (pathname === '/api/session' && request.method === 'POST') {
    const body = await readBody(request);
    const token = body && typeof body === 'object' && !Array.isArray(body) ? String(body.token || '') : '';
    const name = sessionName(token);
    if (!name || !accounts[name]) return sendJson(response, 401, { ok: false, error: 'Session expired. Log in again.' });
    return sendJson(response, 200, { ok: true, name, email: accounts[name].email });
  }

  if (pathname === '/api/logout' && request.method === 'POST') {
    const body = await readBody(request);
    const token = body && typeof body === 'object' && !Array.isArray(body) ? String(body.token || '') : '';
    sessions.delete(token);
    return sendJson(response, 200, { ok: true });
  }

  return sendJson(response, 404, { ok: false, error: 'Unknown API endpoint.' });
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  if (pathname.startsWith('/api/')) {
    handleApi(request, response, pathname).catch((error) => {
      console.error('Account API request failed:', error);
      if (!response.headersSent) sendJson(response, 500, { ok: false, error: 'Account service failure.' });
    });
    return;
  }
  if (pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'online' }));
    return;
  }

  let requestedPath = '/index.html';
  if (pathname !== '/') {
    try {
      requestedPath = decodeURIComponent(pathname);
    } catch {
      response.writeHead(400).end('Bad request');
      return;
    }
  }
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

// --- Deployment bays -------------------------------------------------------
const MAP_PROTOCOLS = ['easy', 'medium', 'hard', 'insane', 'cbz'];
const SQUAD_SIZES = [2, 3, 4];
const LAUNCH_TIMEOUT = 4200;
const rooms = new Map();

for (const [id, name] of [
  ['bay-01', 'BAY 01 // ALPHA'],
  ['bay-02', 'BAY 02 // BRAVO'],
  ['bay-03', 'BAY 03 // CHARLIE'],
  ['bay-04', 'BAY 04 // DELTA'],
]) {
  rooms.set(id, { id, name, players: [], maxPlayers: 2, map: null, started: false });
}

function roomSnapshot(room) {
  return {
    id: room.id,
    name: room.name,
    map: room.map,
    maxPlayers: room.maxPlayers,
    started: room.started,
    commanders: room.players.map((player, index) => ({ callsign: player.callsign, isHost: index === 0 })),
  };
}

function roomsSnapshot() {
  return [...rooms.values()].map(roomSnapshot);
}

function broadcastRooms() {
  const payload = JSON.stringify({ type: 'rooms', rooms: roomsSnapshot() });
  for (const client of webSockets.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

function broadcastRoom(room, message) {
  for (const player of room.players) send(player.socket, message);
}

function removePlayer(room, socket) {
  const index = room.players.findIndex((player) => player.socket === socket);
  if (index === -1) return;
  room.players.splice(index, 1);
  socket.roomId = null;
  if (room.players.length === 0) {
    Object.assign(room, { players: [], maxPlayers: 2, map: null, started: false });
    return broadcastRooms();
  }
  broadcastRoom(room, { type: 'room-update', room: roomSnapshot(room) });
  broadcastRooms();
}

const webSockets = new WebSocketServer({ server, path: '/rooms' });

function send(socket, message) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}

function scheduleLaunchFailure(room) {
  // Gameplay is now live; keep the launch window stable without forcing a fake failure.
  void room;
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
        send(socket, { type: 'auth-error', message: 'Authenticate before joining a deployment bay.' });
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
      send(socket, { type: 'linked', callsign: socket.callsign, rooms: roomsSnapshot() });
      return;
    }

    if (!sessionName(socket.sessionToken)) {
      send(socket, { type: 'auth-error', message: 'Session expired. Log in again.' });
      return socket.close(1008, 'Session expired');
    }

    if (message.type === 'rooms') return send(socket, { type: 'rooms', rooms: roomsSnapshot() });

    if (message.type === 'join') {
      const room = rooms.get(String(message.room || ''));
      if (!room) return send(socket, { type: 'error', message: 'Deployment bay not found.' });
      if (socket.roomId) return send(socket, { type: 'error', message: 'Leave your current bay before switching.' });
      if (room.started) return send(socket, { type: 'error', message: 'Mission in progress. This bay is locked.' });
      if (room.players.length >= room.maxPlayers) return send(socket, { type: 'error', message: 'Bay is full. Choose another deployment bay.' });
      room.players.push({ socket, callsign: socket.callsign });
      socket.roomId = room.id;
      send(socket, { type: 'joined', you: socket.callsign, room: roomSnapshot(room) });
      broadcastRoom(room, { type: 'room-update', room: roomSnapshot(room) });
      return broadcastRooms();
    }

    const room = rooms.get(socket.roomId);
    if (!room) return;
    const playerIndex = room.players.findIndex((player) => player.socket === socket);
    if (playerIndex === -1) return;

    if (message.type === 'leave') return removePlayer(room, socket);

    if (message.type === 'config') {
      if (playerIndex !== 0) return send(socket, { type: 'error', message: 'Only the bay host can reconfigure the mission.' });
      if (room.started) return;
      if (message.map !== undefined) {
        if (!MAP_PROTOCOLS.includes(message.map)) return send(socket, { type: 'error', message: 'Unknown map protocol.' });
        room.map = message.map;
      }
      if (message.maxPlayers !== undefined) {
        const max = Number(message.maxPlayers);
        if (!SQUAD_SIZES.includes(max)) return send(socket, { type: 'error', message: 'Squad size must be 2, 3 or 4 commanders.' });
        if (max < room.players.length) return send(socket, { type: 'error', message: 'Squad size cannot drop below the current roster.' });
        room.maxPlayers = max;
      }
      broadcastRoom(room, { type: 'room-update', room: roomSnapshot(room) });
      return broadcastRooms();
    }

    if (message.type === 'start') {
      if (playerIndex !== 0) return send(socket, { type: 'error', message: 'Only the bay host can start the mission.' });
      if (room.started) return;
      if (!room.map) return send(socket, { type: 'error', message: 'Select a map protocol before launching.' });
      room.started = true;
      broadcastRoom(room, { type: 'launch', room: roomSnapshot(room) });
      broadcastRooms();
      scheduleLaunchFailure(room);
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
