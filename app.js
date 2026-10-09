const dialog = document.querySelector('#menu-dialog');
const body = document.querySelector('#dialog-body');
const deployment = document.querySelector('#deployment-overlay');
const deploymentBody = document.querySelector('#deployment-body');
const deploymentTitle = document.querySelector('#deployment-title');
const deploymentKicker = document.querySelector('#deployment-kicker');
const launchOverlay = document.querySelector('#launch-overlay');
const launchState = document.querySelector('#launch-state');
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
let socket;
let myCallsign = '';
let currentRoom = null;
let roomList = [];
let soundEnabled = true;
let audioContext;
let toastTimer;
let launchReturnTimer;

document.querySelector('#server-port').textContent = `PORT ${port}`;

const menus = {
  play: {
    tag: 'DEPLOYMENT BAYS', title: 'PLAY MENU',
    description: 'Four deployment bays are online. Claim a bay, set the map protocol & squad size, then launch the mission.',
    stats: [['DEPLOYMENT BAYS', '4'], ['MAP PROTOCOLS', '5'], ['SQUAD SIZE', '2-4 COMMANDERS']],
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
    description: 'The menu server is ready for bay connections. Choose a port with the PORT environment variable.',
    stats: [['MENU SERVER', `PORT ${port}`], ['BAY SIZE', '2-4 COMMANDERS'], ['GAMEPLAY', 'NOT INSTALLED']],
  },
};

// Map protocols, easiest to hardest. Each route is [pathData, startPoint, endPoint].
const maps = {
  easy: {
    tag: 'EASY', name: 'PERIMETER PATROL', sector: 'SECTOR 03 // OUTER FENCE LINE', waves: 8, threat: 1,
    blurb: 'Low-intensity probe waves on the fence line. Standard patrol rotations for rookie commanders.',
    route: ['M6 36 H48 V12 H90 V36 H114', [6, 36], [114, 36]],
  },
  medium: {
    tag: 'MEDIUM', name: 'IRON JUNCTION', sector: 'SECTOR 12 // FREIGHT CROSSROADS', waves: 12, threat: 2,
    blurb: 'Armored convoys punch through the freight grid at shift change. Hold the junction.',
    route: ['M6 10 H42 V34 H78 V10 H114', [6, 10], [114, 10]],
  },
  hard: {
    tag: 'HARD', name: 'MELTDOWN GRID', sector: 'SECTOR 21 // COOLING FIELD', waves: 16, threat: 3,
    blurb: 'Coolant failure across the grid. Hostiles ride the heat storms toward the reactor.',
    route: ['M6 38 H52 V8 H100 V28 H64 V38 H114', [6, 38], [114, 38]],
  },
  insane: {
    tag: 'INSANE', name: 'OVERLOAD SPIRE', sector: 'SECTOR 47 // VERTIGO SPIRE', waves: 20, threat: 4,
    blurb: 'Vertical assault up the burning spire. Elevators are gone. Defenses are already overrun.',
    route: ['M6 40 H30 V8 H56 V40 H82 V8 H108', [6, 40], [108, 8]],
  },
  cbz: {
    tag: 'CORE-BREACH-ZERO', name: 'CORE: ZERO', sector: 'SECTOR 00 // REACTOR CHAMBER', waves: 26, threat: 5,
    blurb: 'The original breach. Maximum intensity, no checkpoints, no mercy. No commander has ever held the core. This is where the protocol ends and the breach begins.',
    route: ['M6 22 H34 V38 H62 V6 H90 V22 H114', [6, 22], [114, 22]],
  },
};
const mapOrder = ['easy', 'medium', 'hard', 'insane', 'cbz'];

function playSound(kind = 'click') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new window.AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    if (kind === 'launch') {
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(120, now);
      oscillator.frequency.exponentialRampToValueAtTime(640, now + .7);
      gain.gain.setValueAtTime(.05, now);
      gain.gain.exponentialRampToValueAtTime(.001, now + .75);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + .75);
      return;
    }
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
  if (key === 'play') return openDeployment();
  playSound();
  updatePreview(key);
  document.querySelector('#dialog-kicker').textContent = `// ${item.tag}`;
  document.querySelector('#dialog-title').textContent = item.title;
  renderDetails(item);
  dialog.showModal();
}

function renderDetails(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

// --- Room service link ------------------------------------------------------
function ensureSocket() {
  if (socket && socket.readyState === WebSocket.CONNECTING) return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'rooms' }));
    return;
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/rooms`);
  socket.addEventListener('open', () => setStatus('ROOM SERVICE ONLINE'));
  socket.addEventListener('message', ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    handleServiceMessage(message);
  });
  socket.addEventListener('close', () => {
    setStatus('ROOM SERVICE OFFLINE');
    if (currentRoom && !deployment.hidden) {
      currentRoom = null;
      renderBays();
    }
  });
  socket.addEventListener('error', () => showToast('Could not reach the room service. Check the server port.'));
}

function sendToService(payload) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  else showToast('Room service is linking — try again in a moment.');
}

function handleServiceMessage(message) {
  if (message.type === 'linked') {
    myCallsign = message.callsign;
    roomList = message.rooms;
    if (!deployment.hidden && !currentRoom) renderBays();
  } else if (message.type === 'rooms') {
    roomList = message.rooms;
    if (!deployment.hidden && !currentRoom) renderBays();
  } else if (message.type === 'joined') {
    myCallsign = message.you;
    currentRoom = message.room;
    setStatus(`BAY LINKED // ${currentRoom.name}`);
    renderLobby();
  } else if (message.type === 'room-update') {
    roomList = roomList.map((room) => (room.id === message.room.id ? message.room : room));
    if (currentRoom && currentRoom.id === message.room.id) {
      currentRoom = message.room;
      if (!deployment.hidden && launchOverlay.hidden) renderLobby();
    }
  } else if (message.type === 'launch') {
    currentRoom = message.room;
    showLaunchSequence();
  } else if (message.type === 'mission-aborted') {
    showLaunchFailure(message.reason);
  } else if (message.type === 'error') {
    showToast(message.message);
  }
}

// --- Deployment bay browser -------------------------------------------------
function openDeployment() {
  playSound();
  deployment.hidden = false;
  ensureSocket();
  if (currentRoom) renderLobby();
  else renderBays();
}

function closeDeployment() {
  if (!launchOverlay.hidden) return;
  deployment.hidden = true;
}

function occupancyPips(count, max) {
  return `<span class="pips" role="img" aria-label="${count} of ${max} commanders">${Array.from({ length: max }, (_, index) => `<i class="${index < count ? 'on' : ''}"></i>`).join('')}</span>`;
}

function routeSvg(route, critical = false) {
  const [pathData, [startX, startY], [endX, endY]] = route;
  return `<svg class="route-svg${critical ? ' route-critical' : ''}" viewBox="0 0 120 44" preserveAspectRatio="none" aria-hidden="true"><path class="route-line" d="${pathData}"/><circle class="route-node" cx="${startX}" cy="${startY}" r="2.5"/><circle class="route-core" cx="${endX}" cy="${endY}" r="4"/></svg>`;
}

function renderBays() {
  deploymentKicker.textContent = '// DEPLOYMENT BAYS';
  deploymentTitle.textContent = 'SELECT DEPLOYMENT BAY';
  if (roomList.length === 0) {
    deploymentBody.innerHTML = '<p class="lobby-state">LINKING TO ROOM SERVICE...</p>';
    return;
  }
  deploymentBody.innerHTML = `
    <p class="dialog-copy">Four bays are standing by. Claim an empty bay to become its host — the host picks the map protocol, sets the squad size &amp; launches. Other commanders can join any open bay.</p>
    <div class="bays-grid">${roomList.map((room) => {
      const count = room.commanders.length;
      const full = count >= room.maxPlayers;
      const state = room.started ? 'session' : count === 0 ? 'empty' : 'open';
      const statusText = room.started ? 'MISSION IN PROGRESS' : count === 0 ? 'EMPTY // AWAITING COMMANDER' : `${count}/${room.maxPlayers} COMMANDERS // OPEN`;
      return `<article class="bay-card is-${state}">
        <header><strong>${escapeHtml(room.name)}</strong><em class="bay-status ${state}">${statusText}</em></header>
        <div class="bay-meta">${occupancyPips(count, room.maxPlayers)}<span class="bay-map">${room.map ? `MAP: ${escapeHtml(maps[room.map].name)}` : 'MAP: UNSET'}</span></div>
        ${room.map ? routeSvg(maps[room.map].route, room.map === 'cbz') : '<div class="bay-route-hint">AWAITING MAP PROTOCOL</div>'}
        <button class="join-button" type="button" data-bay="${room.id}" ${room.started || full ? 'disabled' : ''}>${room.started ? 'BAY LOCKED' : full ? 'BAY FULL' : count === 0 ? 'CLAIM BAY' : 'JOIN BAY'}</button>
      </article>`;
    }).join('')}</div>`;
  deploymentBody.querySelectorAll('[data-bay]').forEach((button) => button.addEventListener('click', () => {
    playSound();
    sendToService({ type: 'join', room: button.dataset.bay });
  }));
}

// --- Bay lobby ----------------------------------------------------------------
function isHost(room) {
  return !!room.commanders.find((commander) => commander.isHost && commander.callsign === myCallsign);
}

function threatPips(level) {
  return `<span class="threat" role="img" aria-label="Threat level ${level} of 5">${Array.from({ length: 5 }, (_, index) => `<i class="${index < level ? 'on' : ''}"></i>`).join('')}</span>`;
}

function mapCard(id, room, host) {
  const map = maps[id];
  const selected = room.map === id;
  if (id === 'cbz') {
    return `<button class="map-card map-cbz${selected ? ' selected' : ''}" type="button" data-map="${id}" aria-pressed="${selected}">
      <span class="map-diff">${map.tag}</span>
      <span class="cbz-head"><strong class="map-name">${map.name}</strong><span class="map-sector">${map.sector}</span><span class="cbz-clearance">CLEARANCE: BLACK // MAXIMUM THREAT PROTOCOL</span></span>
      ${routeSvg(map.route, true)}
      <span class="cbz-side"><span class="map-blurb">${map.blurb}</span><span class="map-foot">${threatPips(map.threat)}<span class="map-waves">${map.waves} WAVES</span></span></span>
    </button>`;
  }
  return `<button class="map-card map-${id}${selected ? ' selected' : ''}" type="button" data-map="${id}" aria-pressed="${selected}">
    <span class="map-diff">${map.tag}</span>
    <strong class="map-name">${map.name}</strong>
    <span class="map-sector">${map.sector}</span>
    ${routeSvg(map.route)}
    <span class="map-blurb">${map.blurb}</span>
    <span class="map-foot">${threatPips(map.threat)}<span class="map-waves">${map.waves} WAVES</span></span>
  </button>`;
}

function renderLobby() {
  const room = currentRoom;
  if (!room) return renderBays();
  const host = isHost(room);
  deploymentKicker.textContent = '// BAY LINK ESTABLISHED';
  deploymentTitle.textContent = room.name;
  const roster = room.commanders.map((commander, index) => `
    <li class="${commander.callsign === myCallsign ? 'you' : ''}">
      <span class="slot-tag">${commander.callsign === myCallsign ? 'YOU' : 'ALLY'}</span>
      <strong>${escapeHtml(commander.callsign)}</strong>
      <em class="${index === 0 ? 'host-tag' : 'crew-tag'}">${index === 0 ? 'BAY HOST' : 'CREW'}</em>
    </li>`).join('');
  const emptySlots = Array.from({ length: Math.max(0, room.maxPlayers - room.commanders.length) }, () => '<li class="slot-empty"><span class="slot-tag">//</span><strong>AWAITING COMMANDER</strong></li>').join('');
  deploymentBody.innerHTML = `
    <div class="lobby-grid">
      <section class="roster-panel">
        <h3>SQUAD ROSTER</h3>
        <ul class="roster-list">${roster}${emptySlots}</ul>
        <button class="ghost-button" id="leave-bay" type="button">LEAVE BAY</button>
      </section>
      <section class="config-panel">
        <h3>MAP PROTOCOL // EASY TO CORE-BREACH-ZERO</h3>
        <div class="map-grid">${mapOrder.map((id) => mapCard(id, room, host)).join('')}</div>
        <div class="squad-row">
          <h3>SQUAD SIZE</h3>
          <div class="squad-toggle">${[2, 3, 4].map((size) => `<button type="button" data-size="${size}" class="${room.maxPlayers === size ? 'on' : ''}" ${!host || size < room.commanders.length ? 'disabled' : ''}>${size}</button>`).join('')}</div>
        </div>
        ${host
          ? `<button class="start-button" id="start-mission" type="button" ${room.map ? '' : 'disabled'}>START MISSION <span>→</span></button>`
          : '<p class="standby-note">STANDBY // THE BAY HOST SELECTS THE MAP PROTOCOL AND LAUNCHES THE MISSION.</p>'}
      </section>
    </div>`;
  document.querySelector('#leave-bay').addEventListener('click', () => {
    playSound();
    sendToService({ type: 'leave' });
    currentRoom = null;
    setStatus('ROOM SERVICE ONLINE');
    renderBays();
  });
  deploymentBody.querySelectorAll('[data-map]').forEach((card) => card.addEventListener('click', () => {
    if (!host) return showToast('Only the bay host can change the map protocol.');
    playSound();
    sendToService({ type: 'config', map: card.dataset.map });
  }));
  deploymentBody.querySelectorAll('[data-size]').forEach((button) => button.addEventListener('click', () => {
    if (!host) return;
    playSound();
    sendToService({ type: 'config', maxPlayers: Number(button.dataset.size) });
  }));
  const startButton = document.querySelector('#start-mission');
  if (startButton) startButton.addEventListener('click', () => {
    playSound('launch');
    sendToService({ type: 'start' });
  });
}

// --- Launch sequence -----------------------------------------------------------
function showLaunchSequence() {
  clearTimeout(launchReturnTimer);
  launchOverlay.classList.remove('fail');
  launchState.textContent = 'INITIALIZING DEFENSE GRID...';
  launchOverlay.hidden = false;
}

function showLaunchFailure(reason) {
  launchState.textContent = reason;
  launchOverlay.classList.add('fail');
  clearTimeout(launchReturnTimer);
  launchReturnTimer = setTimeout(() => {
    launchOverlay.hidden = true;
    if (!deployment.hidden) {
      if (currentRoom) renderLobby();
      else renderBays();
    }
  }, 2200);
}

// --- Wiring ---------------------------------------------------------------------
document.querySelectorAll('[data-menu]').forEach((button) => {
  button.addEventListener('mouseenter', () => updatePreview(button.dataset.menu));
  button.addEventListener('focus', () => updatePreview(button.dataset.menu));
  button.addEventListener('click', () => openMenu(button.dataset.menu));
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
document.querySelector('#deployment-close').addEventListener('click', closeDeployment);
deployment.addEventListener('click', (event) => { if (event.target === deployment) closeDeployment(); });
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !deployment.hidden && launchOverlay.hidden) closeDeployment();
});
document.querySelector('#sound-toggle').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const enabled = button.getAttribute('aria-pressed') === 'true';
  soundEnabled = !enabled;
  button.setAttribute('aria-pressed', String(soundEnabled));
  button.textContent = `SFX: ${soundEnabled ? 'ON' : 'OFF'}`;
  if (soundEnabled) playSound();
});
