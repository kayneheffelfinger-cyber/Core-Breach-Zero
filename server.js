const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { WebSocketServer } = require('ws');

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
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