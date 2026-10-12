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
    accounts[name] = { name, email, salt, hash: hashPasscode(passcode, salt), createdAt: new Date().toISOString() };
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
