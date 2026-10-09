const dialog = document.querySelector('#menu-dialog');
const body = document.querySelector('#dialog-body');
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
let socket;
let roomCode = '';
let peerConnected = false;
let soundEnabled = true;
let audioContext;
let toastTimer;

document.querySelector('#server-port').textContent = `PORT ${port}`;
document.querySelector('#preview-port').textContent = port;

const menus = {
  play: {
    tag: 'DEPLOYMENT HUB', title: 'PLAY MENU',
    description: 'Create a room and invite another commander. The defense grid is still under construction.',
    stats: [['GAMEPLAY', 'IN DEVELOPMENT'], ['ROOMS', '2 COMMANDERS'], ['SERVER PORT', port]],
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
    description: 'The menu server is ready for room connections. Choose a port with the PORT environment variable.',
    stats: [['MENU SERVER', `PORT ${port}`], ['ROOM SIZE', '2 COMMANDERS'], ['GAMEPLAY', 'NOT INSTALLED']],
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
  if (key === 'play') renderPlayMenu();
  else renderDetails(item);
  dialog.showModal();
}

function renderPlayMenu(message = '') {
  body.innerHTML = `
    <p class="dialog-copy">Gameplay is not implemented yet. You can set up a room now, then connect the game when it is ready. Server port: <strong>${escapeHtml(port)}</strong>.</p>
    <div class="action-grid">
      <button class="action-button" type="button" disabled><b>SOLO DEPLOYMENT</b><small>Gameplay coming later</small></button>
      <button class="action-button" id="host-room" type="button"><b>HOST A ROOM</b><small>Create a code for a second commander</small></button>
    </div>
    <form class="join-form" id="join-form"><input id="room-input" aria-label="Room code" placeholder="ENTER 6-DIGIT ROOM CODE" maxlength="6" inputmode="numeric" autocomplete="off"><button class="join-submit" type="submit">JOIN ROOM</button></form>
    ${message ? `<p class="lobby-state" role="status">${escapeHtml(message)}</p>` : ''}`;
  document.querySelector('#host-room').addEventListener('click', hostRoom);
  document.querySelector('#join-form').addEventListener('submit', (event) => {
    event.preventDefault();
    joinRoom(document.querySelector('#room-input').value);
  });
  const initialCode = new URLSearchParams(location.search).get('room');
  if (initialCode) document.querySelector('#room-input').value = initialCode;
}

function renderDetails(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

function connectRoom() {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/rooms`);
  socket.addEventListener('open', () => {
    document.querySelector('#server-status').textContent = 'ROOM SERVICE CONNECTED';
  });
  socket.addEventListener('message', ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    handleRoomMessage(message);
  });
  socket.addEventListener('close', () => {
    document.querySelector('#server-status').textContent = 'MENU SYSTEM READY';
    peerConnected = false;
  });
  socket.addEventListener('error', () => showToast('Could not reach the room service. Check the server port.'));
}

function hostRoom() {
  document.querySelector('#server-status').textContent = 'CONNECTING...';
  connectRoom();
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'create' })), { once: true });
  body.innerHTML = '<p class="lobby-state" role="status">Opening a commander room...</p>';
}

function joinRoom(code) {
  const normalized = String(code).trim();
  if (!/^\d{6}$/.test(normalized)) return showToast('Enter a valid 6-digit room code.');
  document.querySelector('#server-status').textContent = 'CONNECTING...';
  connectRoom();
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', code: normalized })), { once: true });
  body.innerHTML = '<p class="lobby-state" role="status">Connecting to commander room...</p>';
}

function handleRoomMessage(message) {
  if (message.type === 'error') {
    showToast(message.message);
    renderPlayMenu(message.message);
    return;
  }
  if (message.type === 'created') {
    roomCode = message.code;
    peerConnected = false;
    renderRoom();
  } else if (message.type === 'joined') {
    roomCode = message.code;
    peerConnected = true;
    renderJoinedRoom();
  } else if (message.type === 'peer-joined') {
    peerConnected = true;
    renderRoom();
    showToast('A commander joined the room.');
  } else if (message.type === 'peer-left') {
    peerConnected = false;
    if (roomCode && dialog.open) renderRoom();
    showToast('The other commander disconnected.');
  }
}

function inviteUrl() {
  return `${location.origin}/?room=${encodeURIComponent(roomCode)}`;
}

function renderRoom() {
  if (!dialog.open) return;
  document.querySelector('#dialog-kicker').textContent = '// COMMAND LINK READY';
  document.querySelector('#dialog-title').textContent = 'ROOM CREATED';
  body.innerHTML = `<div class="invite-box"><span>ROOM CODE / PORT ${escapeHtml(port)}</span><strong class="room-code">${escapeHtml(roomCode)}</strong><span class="invite-link">${escapeHtml(inviteUrl())}</span><button class="inline-button" id="copy-invite" type="button">COPY INVITE</button></div><p class="lobby-state" role="status">${peerConnected ? '<strong>Second commander connected.</strong> Both players are in the room.' : '<strong>Waiting for a commander.</strong> Share the room code to invite a player.'}</p><p class="dialog-copy menu-only-note">Game launch will be added when the playable game is ready.</p>`;
  document.querySelector('#copy-invite').addEventListener('click', copyInvite);
}

function renderJoinedRoom() {
  document.querySelector('#dialog-kicker').textContent = `// ROOM ${escapeHtml(roomCode)}`;
  document.querySelector('#dialog-title').textContent = 'ROOM JOINED';
  body.innerHTML = `<div class="detail-row"><span>ROOM CODE</span><b>${escapeHtml(roomCode)}</b></div><p class="lobby-state"><strong>Commander link established.</strong> Game launch will be added when the playable game is ready.</p>`;
}

async function copyInvite() {
  try {
    await navigator.clipboard.writeText(inviteUrl());
    showToast('Invite link copied.');
  } catch {
    showToast(`Share room ${roomCode} at ${location.host}.`);
  }
}

document.querySelectorAll('[data-menu]').forEach((button) => {
  button.addEventListener('mouseenter', () => updatePreview(button.dataset.menu));
  button.addEventListener('focus', () => updatePreview(button.dataset.menu));
  button.addEventListener('click', () => openMenu(button.dataset.menu));
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelector('#sound-toggle').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') === 'true';
  soundEnabled = !enabled;
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.textContent = `SFX: ${soundEnabled ? 'ON' : 'OFF'}`;
  if (soundEnabled) playSound();
});

const roomFromUrl = new URLSearchParams(location.search).get('room');
if (roomFromUrl) openMenu('play');
