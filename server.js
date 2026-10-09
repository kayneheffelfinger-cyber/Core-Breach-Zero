const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
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
  setTimeout(() => {
    if (room.started && room.players.length > 0) {
      room.started = false;
      broadcastRoom(room, { type: 'mission-aborted', reason: 'GAMEPLAY MODULE NOT INSTALLED — RETURNING TO COMMAND' });
      broadcastRooms();
    }
  }, LAUNCH_TIMEOUT);
}

webSockets.on('connection', (socket) => {
  socket.callsign = `CMDR-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  socket.roomId = null;
  send(socket, { type: 'linked', callsign: socket.callsign, rooms: roomsSnapshot() });

  socket.on('message', (raw) => {
    if (raw.length > 65536) return socket.close(1009, 'Message too large');
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      return send(socket, { type: 'error', message: 'Invalid message.' });
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
