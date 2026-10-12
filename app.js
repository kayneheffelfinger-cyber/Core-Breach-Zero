const dialog = document.querySelector('#menu-dialog');
const body = document.querySelector('#dialog-body');
const authOverlay = document.querySelector('#auth-overlay');
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
let socket;
let myCallsign = '';
let currentRoom = null;
let roomList = [];
let showingBays = false;
let soundEnabled = true;
let audioContext;
let toastTimer;
let authToken = localStorage.getItem('cbz-token') || '';
let myName = '';
let authMode = 'login';

document.querySelector('#server-port').textContent = `PORT ${port}`;
document.querySelector('#preview-port').textContent = port;

const menus = {
  play: {
    tag: 'DEPLOYMENT HUB', title: 'PLAY MENU',
    description: 'Enter one of four two-commander rooms and choose a map, or explore any map solo.',
    stats: [['AVAILABLE ROOMS', '4'], ['MAP RECON', '5 SECTORS'], ['SERVER PORT', port]],
  },
  perks: {
    tag: 'SKILL MATRIX', title: 'TOWER & PERKS',
    description: 'Turret upgrades, plasma buffs, and commander tech trees will be available when gameplay is added.',
    stats: [['TURRET SYSTEMS', 'PLANNED'], ['PERK TREE', 'PLANNED'], ['STATUS', 'NOT DEPLOYED']],
  },
  shop: {
    tag: 'NEXUS MARKETPLACE', title: 'NEXUS SHOP',
    description: 'The Energy Credit marketplace is planned for a future build.',
    stats: [['CURRENCY', 'ENERGY CREDITS'], ['ITEMS', 'NOT AVAILABLE'], ['STATUS', 'NOT DEPLOYED']],
  },
  inventory: {
    tag: 'COMMAND STORAGE', title: 'INVENTORY',
    description: 'Loadouts, turret modules, and cryo cores will appear here once the game systems are connected.',
    stats: [['LOADOUTS', 'PLANNED'], ['MODULES', 'PLANNED'], ['STATUS', 'NOT DEPLOYED']],
  },
  settings: {
    tag: 'SYSTEM CONFIG', title: 'SETTINGS & LOGS',
    description: 'The mission server is live. Choose a port with the PORT environment variable. Commander accounts (name + email) persist in accounts.json beside the server.',
    stats: [['MENU SERVER', `PORT ${port}`], ['ROOM SIZE', '2 COMMANDERS'], ['ACCOUNT LEDGER', 'ACTIVE']],
  },
};

function playSound(kind = 'click') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new window.AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = kind === 'hover' ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(kind === 'hover' ? 800 : 390, now);
    oscillator.frequency.exponentialRampToValueAtTime(kind === 'hover' ? 1100 : 160, now + .05);
    gain.gain.setValueAtTime(.04, now);
    gain.gain.exponentialRampToValueAtTime(.001, now + .06);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + .06);
  } catch { /* Sound is optional when browser audio is unavailable. */ }
}

function showToast(message) {
  const toast = document.querySelector('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

// --- Commander authentication ---------------------------------------------------
async function apiRequest(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || 'Auth system failure.');
  return data;
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelector('#tab-login').classList.toggle('on', mode === 'login');
  document.querySelector('#tab-register').classList.toggle('on', mode === 'register');
  document.querySelector('#auth-identity-field').hidden = mode !== 'login';
  document.querySelector('#auth-name-field').hidden = mode !== 'register';
  document.querySelector('#auth-email-field').hidden = mode !== 'register';
  document.querySelector('#auth-confirm-field').hidden = mode !== 'register';
  document.querySelector('#auth-kicker').textContent = mode === 'login' ? '// COMMANDER AUTHENTICATION' : '// NEW COMMANDER REGISTRATION';
  document.querySelector('#auth-submit').firstChild.textContent = mode === 'login' ? 'AUTHENTICATE ' : 'CREATE ACCOUNT ';
  document.querySelector('#auth-error').textContent = '';
}

function enterDeck(name) {
  myName = name;
  const chip = document.querySelector('#cmdr-chip');
  chip.hidden = false;
  chip.textContent = `CMDR: ${name}`;
  document.querySelector('#sign-out').hidden = false;
  authOverlay.hidden = true;
  setStatus('ACCOUNT LINKED // MENU SYSTEM READY');
}

async function submitAuth(event) {
  event.preventDefault();
  const errorLine = document.querySelector('#auth-error');
  const submit = document.querySelector('#auth-submit');
  errorLine.textContent = '';
  let payload;
  if (authMode === 'register') {
    const passcode = document.querySelector('#auth-passcode').value;
    if (passcode !== document.querySelector('#auth-confirm').value) {
      errorLine.textContent = 'Passcodes do not match.';
      return;
    }
    payload = {
      name: document.querySelector('#auth-name').value.trim(),
      email: document.querySelector('#auth-email').value.trim(),
      passcode,
    };
  } else {
    payload = {
      identity: document.querySelector('#auth-identity').value.trim(),
      passcode: document.querySelector('#auth-passcode').value,
    };
  }
  submit.disabled = true;
  try {
    const data = await apiRequest(authMode === 'login' ? '/api/login' : '/api/register', payload);
    authToken = data.token;
    localStorage.setItem('cbz-token', authToken);
    enterDeck(data.name);
    playSound();
    showToast(`Welcome, ${data.name}. The grid awaits.`);
  } catch (error) {
    errorLine.textContent = error.message;
    playSound('alarm');
  } finally {
    submit.disabled = false;
  }
}

async function restoreSession() {
  if (!authToken) {
    authOverlay.hidden = false;
    return;
  }
  try {
    const data = await apiRequest('/api/session', { token: authToken });
    enterDeck(data.name);
  } catch {
    authToken = '';
    localStorage.removeItem('cbz-token');
    authOverlay.hidden = false;
  }
}

function signOut() {
  localStorage.removeItem('cbz-token');
  authToken = '';
  location.reload();
}

function setStatus(text) {
  document.querySelector('#server-status').textContent = text;
}

function updatePreview(key) {
  const item = menus[key];
  if (!item) return;
  document.querySelectorAll('.menu-item').forEach((button) => button.classList.toggle('selected', button.dataset.menu === key));
  document.querySelector('#preview-tag').textContent = item.tag;
  document.querySelector('#preview-title').textContent = item.title;
  document.querySelector('#preview-desc').textContent = item.description;
  document.querySelector('#preview-stats').innerHTML = item.stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
}

function openMenu(key) {
  const item = menus[key];
  if (!item) return;
  playSound();
  updatePreview(key);
  document.querySelector('#dialog-kicker').textContent = `// ${item.tag}`;
  document.querySelector('#dialog-title').textContent = item.title;
  if (key === 'play' && currentRoom) renderLobby();
  else if (key === 'play') renderBays();
  else renderDetails(item);
  dialog.showModal();
  if (key === 'play' && !currentRoom) ensureSocket();
}

function renderDetails(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

// --- Map recon: battle maps (no waves, no enemies, no game mode) -----------------
const SVG_NS = 'http://www.w3.org/2000/svg';
const BATTLE_MAPS = {
  easy: {
    id: 'easy', difficulty: 'EASY', name: 'PERIMETER PATROL', sector: 'SECTOR 03 // OUTER FENCE LINE',
    mechanic: 'SINGLE VECTOR', hint: 'One long patrol lane into the reactor.',
    paths: ['M -60 150 H 250 Q 310 150 310 210 V 240 Q 310 300 370 300 H 630 Q 690 300 690 360 V 390 Q 690 450 750 450 H 940'],
    core: { x: 940, y: 450 }, spawns: [[0, 150]],
    pads: [[140, 90], [260, 230], [420, 210], [560, 210], [330, 390], [470, 390], [610, 390], [820, 350], [820, 540], [660, 510], [240, 60]],
    zones: [], gates: [],
  },
  medium: {
    id: 'medium', difficulty: 'MEDIUM', name: 'IRON JUNCTION', sector: 'SECTOR 12 // FREIGHT CROSSROADS',
    mechanic: 'JUNCTION SPLIT', hint: 'The stream forks at the junction — cover both branches.',
    paths: [
      'M -60 300 H 300 Q 340 300 340 260 V 200 Q 340 160 380 160 H 520 Q 560 160 560 200 V 260 Q 560 300 600 300 H 940',
      'M -60 300 H 300 Q 340 300 340 340 V 400 Q 340 440 380 440 H 520 Q 560 440 560 400 V 340 Q 560 300 600 300 H 940',
    ],
    core: { x: 940, y: 300 }, spawns: [[0, 300]],
    pads: [[430, 300], [490, 220], [490, 380], [240, 210], [240, 390], [660, 210], [660, 390], [760, 300], [430, 90], [430, 510], [850, 210], [850, 390]],
    zones: [], gates: [],
  },
  hard: {
    id: 'hard', difficulty: 'HARD', name: 'MELTDOWN GRID', sector: 'SECTOR 21 // COOLING FIELD',
    mechanic: 'DUAL LANE', hint: 'Two independent lanes converge on the reactor.',
    paths: [
      'M -60 110 H 700 Q 760 110 760 170 V 240 Q 760 300 700 300 H 505',
      'M -60 490 H 300 Q 240 490 240 430 V 360 Q 240 300 300 300 H 505',
    ],
    core: { x: 505, y: 300 }, spawns: [[0, 110], [0, 490]],
    pads: [[180, 210], [320, 210], [470, 210], [620, 210], [180, 390], [320, 390], [470, 390], [620, 390], [860, 180], [860, 420], [60, 300], [900, 300], [400, 60], [400, 540]],
    zones: [], gates: [],
  },
  insane: {
    id: 'insane', difficulty: 'INSANE', name: 'OVERLOAD SPIRE', sector: 'SECTOR 47 // VERTIGO SPIRE',
    mechanic: 'SPIRAL LOCK + OVERCHARGE', hint: 'A tightening spiral laced with haste fields.',
    paths: ['M -60 60 H 850 Q 920 60 920 130 V 470 Q 920 540 850 540 H 150 Q 80 540 80 470 V 130 Q 80 150 150 150 H 760 Q 830 150 830 220 V 380 Q 830 450 760 450 H 240 Q 170 450 170 380 V 220 Q 170 240 240 240 H 640 Q 700 240 700 300 H 545'],
    core: { x: 545, y: 300 }, spawns: [[0, 60]],
    pads: [[350, 105], [650, 105], [400, 195], [600, 195], [400, 405], [600, 405], [350, 495], [650, 495], [125, 300], [875, 300], [350, 300], [450, 300]],
    zones: [
      { x: 450, y: 60, r: 58, label: 'OVERCHARGE' },
      { x: 500, y: 450, r: 58, label: 'OVERCHARGE' },
    ],
    gates: [],
  },
  cbz: {
    id: 'cbz', difficulty: 'CBZ', name: 'CORE: ZERO', sector: 'SECTOR 00 // REACTOR CHAMBER',
    mechanic: 'PHASE GRID', hint: 'Twin lanes wired with hostile phase gates.',
    paths: [
      'M -60 150 H 760 Q 820 150 820 210 V 240 Q 820 300 760 300 H 505',
      'M 1060 450 H 240 Q 180 450 180 390 V 360 Q 180 300 240 300 H 505',
    ],
    core: { x: 505, y: 300 }, spawns: [[0, 150], [1060, 450]],
    pads: [[140, 80], [380, 80], [620, 80], [500, 80], [100, 230], [340, 230], [580, 230], [880, 230], [140, 520], [380, 520], [620, 520], [860, 520], [60, 300], [940, 300], [60, 180], [940, 420]],
    zones: [],
    gates: [
      { x: 400, y: 150, toX: 760, toY: 450 },
      { x: 600, y: 450, toX: 240, toY: 150 },
    ],
  },
};

function hexPoints(x, y, r) {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 3 * i - Math.PI / 6;
    return `${(x + r * Math.cos(angle)).toFixed(1)},${(y + r * Math.sin(angle)).toFixed(1)}`;
  }).join(' ');
}

function svgNode(name, attributes, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildBoard(map) {
  const board = document.querySelector('#board');
  board.innerHTML = '';
  const layer = (name) => {
    const group = svgNode('g', { class: `layer-${name}` });
    board.appendChild(group);
    return group;
  };
  const zones = layer('zones');
  const tracks = layer('tracks');
  const gates = layer('gates');
  const spawns = layer('spawns');
  const pads = layer('pads');
  for (const zone of map.zones) {
    zones.appendChild(svgNode('circle', { class: 'zone-circle', cx: zone.x, cy: zone.y, r: zone.r }));
    zones.appendChild(svgNode('text', { class: 'zone-label', x: zone.x, y: zone.y - zone.r + 16, 'text-anchor': 'middle' }, zone.label));
  }
  for (const d of map.paths) {
    tracks.appendChild(svgNode('path', { class: 'track-glow', d }));
    tracks.appendChild(svgNode('path', { class: 'track-road', d }));
    tracks.appendChild(svgNode('path', { class: 'track-line', d }));
  }
  for (const gate of map.gates) {
    gates.appendChild(svgNode('rect', { class: 'gate-node', x: gate.x - 9, y: gate.y - 9, width: 18, height: 18, transform: `rotate(45 ${gate.x} ${gate.y})` }));
    gates.appendChild(svgNode('rect', { class: 'gate-exit', x: gate.toX - 7, y: gate.toY - 7, width: 14, height: 14, transform: `rotate(45 ${gate.toX} ${gate.toY})` }));
    gates.appendChild(svgNode('text', { class: 'gate-label', x: gate.x, y: gate.y - 16, 'text-anchor': 'middle' }, 'PHASE'));
  }
  for (const [sx, sy] of map.spawns) {
    spawns.appendChild(svgNode('polygon', { class: 'spawn-node', points: hexPoints(sx, sy, 16) }));
    spawns.appendChild(svgNode('text', { class: 'spawn-label', x: Math.max(36, Math.min(964, sx)), y: sy + 32, 'text-anchor': 'middle' }, 'BREACH'));
  }
  spawns.appendChild(svgNode('circle', { class: 'core-ring', cx: map.core.x, cy: map.core.y, r: 30 }));
  spawns.appendChild(svgNode('polygon', { class: 'core-node', points: hexPoints(map.core.x, map.core.y, 20) }));
  spawns.appendChild(svgNode('text', { class: 'core-label', x: map.core.x, y: map.core.y + 42, 'text-anchor': 'middle' }, 'CORE'));
  for (const [x, y] of map.pads) {
    pads.appendChild(svgNode('polygon', { class: 'pad', points: hexPoints(x, y, 17) }));
  }
}

function renderMapSelect() {
  playSound();
  document.querySelector('#dialog-kicker').textContent = '// MAP RECON';
  document.querySelector('#dialog-title').textContent = 'SELECT A MAP';
  body.innerHTML = `<p class="dialog-copy">Recon flyovers only — no hostiles, no objectives. Walk each sector's grid before combat systems come online.</p><div class="map-grid">${Object.values(BATTLE_MAPS).map(mapCard).join('')}</div>`;
  body.querySelectorAll('[data-map]').forEach((card) => card.addEventListener('click', () => openBattlefield(card.dataset.map)));
}

function mapCard(map) {
  return `<button class="map-card${map.id === 'cbz' ? ' map-cbz' : ''}" type="button" data-map="${map.id}"><span class="map-diff">${map.difficulty}</span><strong>${escapeHtml(map.name)}</strong><small>${escapeHtml(map.sector)}</small><span class="map-mech">${escapeHtml(map.mechanic)}</span><em>${escapeHtml(map.hint)}</em></button>`;
}

function openBattlefield(mapId) {
  const map = BATTLE_MAPS[mapId];
  if (!map) return;
  playSound();
  dialog.close();
  document.querySelector('#battle-map-name').textContent = map.name;
  document.querySelector('#battle-map-sector').textContent = map.sector;
  document.querySelector('#battle-map-mech').textContent = map.mechanic;
  buildBoard(map);
  document.querySelector('#battlefield').hidden = false;
  setStatus(`MAP RECON // ${map.name}`);
}

function exitBattlefield() {
  document.querySelector('#battlefield').hidden = true;
  document.querySelector('#board').innerHTML = '';
  setStatus(myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY');
  playSound();
}

function ensureSocket() {
  if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'rooms' }));
    return;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/rooms`);
  socket.addEventListener('open', () => {
    setStatus('AUTHENTICATING COMMANDER...');
    socket.send(JSON.stringify({ type: 'authenticate', token: authToken }));
  });
  socket.addEventListener('message', ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    handleServiceMessage(message);
  });
  socket.addEventListener('close', () => {
    setStatus('ROOM SERVICE OFFLINE');
    if (currentRoom) {
      currentRoom = null;
      if (dialog.open && showingBays) renderBays();
    }
  });
  socket.addEventListener('error', () => showToast('Could not reach the room service. Check the server port.'));
}

function sendToService(message) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  else showToast('Room service is connecting — try again in a moment.');
}

function requireAuthentication(message) {
  authToken = '';
  myName = '';
  myCallsign = '';
  currentRoom = null;
  localStorage.removeItem('cbz-token');
  document.querySelector('#cmdr-chip').hidden = true;
  document.querySelector('#sign-out').hidden = true;
  authOverlay.hidden = false;
  setAuthMode('login');
  setStatus('AUTHENTICATION REQUIRED');
  document.querySelector('#auth-error').textContent = message;
}

function handleServiceMessage(message) {
  if (message.type === 'auth-error') {
    requireAuthentication(message.message);
    return;
  }
  if (message.type === 'linked') {
    myCallsign = message.callsign;
    roomList = message.rooms;
    setStatus('ROOM SERVICE ONLINE');
    if (dialog.open && showingBays) renderBays();
    return;
  }
  if (message.type === 'rooms') {
    roomList = message.rooms;
    if (dialog.open && showingBays) renderBays();
    return;
  }
  if (message.type === 'error') {
    showToast(message.message);
    if (dialog.open) {
      if (currentRoom) renderLobby();
      else renderBays();
    }
    return;
  }
  if (message.type === 'joined') {
    myCallsign = message.you;
    currentRoom = message.room;
    setStatus(`ROOM LINKED // ${currentRoom.name}`);
    renderLobby();
    return;
  }
  if (message.type === 'room-update') {
    roomList = roomList.map((room) => room.id === message.room.id ? message.room : room);
    if (currentRoom && currentRoom.id === message.room.id) {
      currentRoom = message.room;
      if (dialog.open && !showingBays) renderLobby();
    } else if (dialog.open && showingBays) {
      renderBays();
    }
  }
}

function renderBays() {
  showingBays = true;
  document.querySelector('#dialog-kicker').textContent = '// AVAILABLE ROOMS';
  document.querySelector('#dialog-title').textContent = 'SELECT A ROOM';
  if (!roomList.length) {
    body.innerHTML = '<p class="dialog-copy">Enter one of four two-commander rooms. Select a map after entering.</p><button class="action-button bay-recon" id="map-recon" type="button"><b>SOLO MAP RECON</b><small>Open one of the five maps without joining a room</small></button><p class="lobby-state">LINKING TO ROOMS...</p>';
    document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
    return;
  }
  body.innerHTML = `
    <p class="dialog-copy">Enter an open two-commander room. Choose a map from the room lobby, or explore any map solo.</p>
    <button class="action-button bay-recon" id="map-recon" type="button"><b>SOLO MAP RECON</b><small>Open one of the five maps without joining a room</small></button>
    <div class="bays-grid">${roomList.map((room) => {
      const count = room.commanders.length;
      const full = count >= room.maxPlayers;
      const map = room.map && BATTLE_MAPS[room.map];
      const state = count === 0 ? 'empty' : full ? 'full' : 'open';
      const stateText = full ? 'FULL // 2/2 COMMANDERS' : `${count}/${room.maxPlayers} COMMANDERS // OPEN`;
      const buttonText = full ? 'ROOM FULL' : 'ENTER ROOM';
      return `<article class="bay-card is-${state}">
        <header><strong>${escapeHtml(room.name)}</strong><span class="bay-status">${stateText}</span></header>
        <p class="bay-map">${map ? `${escapeHtml(map.difficulty)} // ${escapeHtml(map.name)}` : 'MAP: NOT SELECTED'}</p>
        <button class="join-button" type="button" data-bay="${escapeHtml(room.id)}" ${full ? 'disabled' : ''}>${buttonText}</button>
      </article>`;
    }).join('')}</div>`;
  document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
  body.querySelectorAll('[data-bay]').forEach((button) => button.addEventListener('click', () => {
    playSound();
    sendToService({ type: 'join', room: button.dataset.bay });
  }));
}

function isRoomLead(room) {
  return room.commanders.some((commander) => commander.isHost && commander.callsign === myCallsign);
}

function renderRoomMapCard(map, room, roomLead) {
  const selected = room.map === map.id;
  return `<article class="room-map-entry">
    <button class="map-card${map.id === 'cbz' ? ' map-cbz' : ''}${selected ? ' selected' : ''}" type="button" data-map="${map.id}" aria-pressed="${selected}" ${roomLead ? '' : 'disabled'}>
      <span class="map-diff">${map.difficulty}</span>
      <strong>${escapeHtml(map.name)}</strong>
      <small>${escapeHtml(map.sector)}</small>
      <span class="map-mech">${escapeHtml(map.mechanic)}</span>
      <em>${escapeHtml(map.hint)}</em>
    </button>
    <button class="map-preview-button" type="button" data-recon="${map.id}">OPEN RECON</button>
  </article>`;
}

function renderLobby() {
  if (!currentRoom) return renderBays();
  showingBays = false;
  const room = currentRoom;
  const roomLead = isRoomLead(room);
  document.querySelector('#dialog-kicker').textContent = '// ROOM LINK ESTABLISHED';
  document.querySelector('#dialog-title').textContent = room.name;
  const roster = room.commanders.map((commander) => `
    <li class="${commander.callsign === myCallsign ? 'you' : ''}">
      <span class="slot-tag">${commander.callsign === myCallsign ? 'YOU' : 'ALLY'}</span>
      <strong>${escapeHtml(commander.callsign)}</strong>
      <em class="${commander.isHost ? 'host-tag' : 'crew-tag'}">${commander.isHost ? 'ROOM LEAD' : 'CREW'}</em>
    </li>`).join('');
  const emptySlot = room.commanders.length < room.maxPlayers
    ? '<li class="slot-empty"><span class="slot-tag">//</span><strong>AWAITING COMMANDER</strong></li>'
    : '';
  body.innerHTML = `
    <div class="lobby-grid">
      <section class="roster-panel">
        <h3>SQUAD ROSTER</h3>
        <ul class="roster-list">${roster}${emptySlot}</ul>
        <button class="ghost-button" id="leave-room" type="button">LEAVE ROOM</button>
      </section>
      <section class="config-panel">
        <h3>SELECT MAP // ${roomLead ? 'ROOM LEAD CONTROL' : 'ROOM LEAD SELECTS'}</h3>
        ${roomLead ? '<p class="dialog-copy">Choose a map for this room. Anyone in the squad can open a recon preview.</p>' : ''}
        <div class="map-grid">${Object.values(BATTLE_MAPS).map((map) => renderRoomMapCard(map, room, roomLead)).join('')}</div>
      </section>
    </div>`;
  document.querySelector('#leave-room').addEventListener('click', () => {
    playSound();
    sendToService({ type: 'leave' });
    currentRoom = null;
    setStatus('ROOM SERVICE ONLINE');
    renderBays();
  });
  body.querySelectorAll('[data-map]').forEach((button) => button.addEventListener('click', () => {
    if (!roomLead) return;
    playSound();
    sendToService({ type: 'config', map: button.dataset.map });
  }));
  body.querySelectorAll('[data-recon]').forEach((button) => button.addEventListener('click', () => {
    openBattlefield(button.dataset.recon);
  }));
}

document.querySelectorAll('[data-menu]').forEach((button) => {
  button.addEventListener('mouseenter', () => updatePreview(button.dataset.menu));
  button.addEventListener('focus', () => updatePreview(button.dataset.menu));
  button.addEventListener('click', () => openMenu(button.dataset.menu));
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
document.querySelector('#exit-battle').addEventListener('click', exitBattlefield);
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelector('#sound-toggle').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') === 'true';
  soundEnabled = !enabled;
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.textContent = `SFX: ${soundEnabled ? 'ON' : 'OFF'}`;
  if (soundEnabled) playSound();
});
document.querySelector('#tab-login').addEventListener('click', () => setAuthMode('login'));
document.querySelector('#tab-register').addEventListener('click', () => setAuthMode('register'));
document.querySelector('#auth-form').addEventListener('submit', submitAuth);
document.querySelector('#sign-out').addEventListener('click', signOut);

const roomFromUrl = new URLSearchParams(location.search).get('room');
if (roomFromUrl) openMenu('play');

setAuthMode('login');
restoreSession();
