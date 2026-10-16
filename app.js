const dialog = document.querySelector('#menu-dialog');
const body = document.querySelector('#dialog-body');
const authOverlay = document.querySelector('#auth-overlay');
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
let socket;
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
    description: 'Enter one of four rooms for up to four commanders, or recon any of the 5 battle maps solo. EASY MODE: 20 waves, boss encounters, base defense.',
    stats: [['ROOMS', '4 DEPLOYMENT BAYS'], ['SQUAD SIZE', 'UP TO 4 COMMANDERS'], ['SERVER PORT', port]],
  },
  perks: {
    tag: 'SKILL MATRIX', title: 'TOWER & PERKS',
    description: 'Turret upgrades, plasma buffs, and commander tech trees will be available when gameplay is added.',
    stats: [['TURRET SYSTEMS', 'PLANNED'], ['PERK TREE', 'PLANNED'], ['STATUS', 'NOT DEPLOYED']],
  },
  shop: {
    tag: 'NEXUS MARKETPLACE', title: 'NEXUS SHOP',
    description: 'The Nexus exchange is live. Spend Nexus Coins on turret blueprints and rare Breach Tokens on experimental hardware. New blueprints decrypt as your clearance level rises.',
    stats: () => {
      const shop = window.CBZShop;
      const profile = shop ? shop.profile() : null;
      return [
        ['CURRENCIES', 'NEXUS COINS + BREACH TOKENS'],
        ['BLUEPRINTS', `${shop ? shop.TOWERS.length : 16} TURRET LINES`],
        ['WALLET', profile ? `LV ${profile.level} // ${Number(profile.nc).toLocaleString('en-US')} NC // ${profile.bt} BT` : 'SYNCING…'],
      ];
    },
  },
  settings: {
    tag: 'SYSTEM CONFIG', title: 'SETTINGS & LOGS',
    description: 'The mission server is live. Choose a port with the PORT environment variable. Commander accounts (name + email) persist in accounts.json beside the server.',
    stats: [['MENU SERVER', `PORT ${port}`], ['ROOM SIZE', 'UP TO 4 COMMANDERS'], ['ACCOUNT LEDGER', 'ACTIVE']],
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

// --- Local Nexus fallback --------------------------------------------------------
// Static hosts (GitHub Pages) cannot run the Node backend: POST /api/* returns a
// non-JSON 405 page there. When that happens we flip to a fully local Nexus that
// mirrors server.js — same tables, same rules, same error strings — with accounts,
// sessions, wallet, purchases, loadouts and mission payouts persisted in
// localStorage. Progress is per-browser; the real server remains authoritative
// whenever the site is actually served by `node server.js`.
// Salvage codes — redeemable once per commander account, in SETTINGS & LOGS.
// Mirrored in server.js: same codes, same grants, same one-time ledger.
const REDEEM_CODES = {
  NULLCORE: { nc: 1500, bt: 0 },
  GHOSTWIRE: { nc: 0, bt: 75 },
  DATACACHE: { nc: 4000, bt: 100 },
  ZERODAY: { nc: 5000, bt: 500 },
};

const LOCAL = (() => {
  const ACCOUNTS_KEY = 'cbz-local-accounts';
  const SESSIONS_KEY = 'cbz-local-sessions';
  const NAME_RE = /^[A-Za-z0-9_-]{3,16}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const MAX_LEVEL = 30;
  const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
  const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));
  // Mirrors server.js SHOP — keep in sync (name/unlock/price/currency only).
  const SHOP = {
    sentinel: { name: 'SENTINEL TURRET', unlock: 1, price: 0, currency: 'nc' },
    lazermortar: { name: 'LAZER MORTAR', unlock: 1, price: 0, currency: 'nc', firstClear: true },
    virus: { name: 'VIRUS', unlock: 1, price: { nc: 1000, bt: 30 }, currency: 'mixed' },
  };
  const REWARDS = {
    easy: { waveNC: 8, waveXP: 12, bossNC: 10, bossBT: 1, bossXP: 30, winNC: 60, winXP: 80, flawlessNC: 25, flawlessBT: 2, flawlessXP: 50, firstClearBT: 5 },
  };
  let down = false;

  function readJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
  }
  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage optional. */ }
  }
  const readAccounts = () => readJson(ACCOUNTS_KEY, {});
  const readSessions = () => readJson(SESSIONS_KEY, {});
  const defaultMeta = () => ({ nc: 750, bt: 0, xp: 0, level: 1, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'] });

  function randomHex(bytes) {
    const array = new Uint8Array(bytes);
    if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(array);
    else for (let i = 0; i < array.length; i += 1) array[i] = Math.floor(Math.random() * 256);
    return [...array].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function hashPasscode(passcode, salt) {
    const seeded = `${salt}::${passcode}::core-breach-zero`;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seeded));
        return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      } catch { /* fall through to the manual scramble. */ }
    }
    // Non-secure-context fallback: deterministic scramble (cosmetic — local saves only).
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < seeded.length; i += 1) {
      const ch = seeded.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
  }

  function createSession(name) {
    const token = randomHex(24);
    const sessions = readSessions();
    sessions[token] = { name, expiresAt: Date.now() + SESSION_MS };
    writeJson(SESSIONS_KEY, sessions);
    return token;
  }

  function sessionName(token) {
    const sessions = readSessions();
    const entry = sessions[token];
    if (!entry || Date.now() > entry.expiresAt) {
      if (entry) { delete sessions[token]; writeJson(SESSIONS_KEY, sessions); }
      return null;
    }
    return entry.name;
  }

  function profilePayload(account) {
    const meta = account.meta;
    return { name: account.name, level: meta.level, xp: meta.xp, xpNext: xpToNext(meta.level), maxLevel: MAX_LEVEL, nc: meta.nc, bt: meta.bt, firstClear: meta.firstClear, owned: meta.owned, loadout: meta.loadout || [], redeemed: meta.redeemed || [] };
  }

  function requireAccount(body) {
    const name = sessionName(String((body || {}).token || ''));
    const account = name ? readAccounts()[name] : null;
    if (!name || !account) throw new Error('Session expired. Log in again.');
    return account;
  }

  async function handle(path, payload) {
    const body = payload || {};
    if (path === '/api/register') {
      const name = String(body.name || '').trim();
      const email = String(body.email || '').trim().toLowerCase();
      const passcode = String(body.passcode || '');
      if (!NAME_RE.test(name)) throw new Error('Name must be 3-16 characters (letters, numbers, - or _).');
      if (!EMAIL_RE.test(email)) throw new Error('Enter a valid email address.');
      if (passcode.length < 4 || passcode.length > 64) throw new Error('Passcode must be 4-64 characters.');
      const accounts = readAccounts();
      if (accounts[name]) throw new Error('That commander name is already taken.');
      if (Object.values(accounts).some((entry) => entry.email === email)) throw new Error('That email is already registered.');
      const salt = randomHex(16);
      accounts[name] = { name, email, salt, hash: await hashPasscode(passcode, salt), createdAt: new Date().toISOString(), meta: defaultMeta(), local: true };
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, token: createSession(name), name, email };
    }
    if (path === '/api/login') {
      const identity = String(body.identity || '').trim();
      const email = identity.toLowerCase();
      const passcode = String(body.passcode || '');
      const accounts = readAccounts();
      const account = accounts[identity] || Object.values(accounts).find((entry) => entry.email === email);
      if (!account) throw new Error('No account found for that name or email.');
      if ((await hashPasscode(passcode, account.salt)) !== account.hash) throw new Error('Wrong passcode. Try again.');
      return { ok: true, token: createSession(account.name), name: account.name, email: account.email };
    }
    if (path === '/api/session') {
      const name = sessionName(String(body.token || ''));
      const account = name ? readAccounts()[name] : null;
      if (!account) throw new Error('Session expired. Log in again.');
      return { ok: true, name, email: account.email };
    }
    if (path === '/api/profile') {
      return { ok: true, profile: profilePayload(requireAccount(body)) };
    }
    if (path === '/api/shop/purchase') {
      const account = requireAccount(body);
      const item = SHOP[String(body.itemId || '')];
      if (!item) throw new Error('Unknown blueprint.');
      const meta = account.meta;
      if (meta.owned.includes(String(body.itemId || ''))) throw new Error('Blueprint already in your armory.');
      if (meta.level < item.unlock) throw new Error(`Clearance level ${item.unlock} required.`);
      if (item.firstClear && !meta.firstClear) throw new Error('Reward locked — beat Easy Mode to decrypt this blueprint.');
      const cost = typeof item.price === 'object' ? item.price : { [item.currency === 'bt' ? 'bt' : 'nc']: item.price || 0 };
      if ((cost.nc || 0) > 0 && meta.nc < cost.nc) throw new Error('Not enough Nexus Coins.');
      if ((cost.bt || 0) > 0 && meta.bt < cost.bt) throw new Error('Not enough Breach Tokens.');
      if (cost.nc) meta.nc -= cost.nc;
      if (cost.bt) meta.bt -= cost.bt;
      meta.owned.push(String(body.itemId || ''));
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, profile: profilePayload(account) };
    }
    if (path === '/api/loadout') {
      const account = requireAccount(body);
      const meta = account.meta;
      const list = Array.isArray(body.loadout) ? body.loadout.map((id) => String(id || '')) : null;
      if (!list) throw new Error('Loadout payload must be a list of blueprint ids.');
      const clean = [...new Set(list)].filter((id) => id && meta.owned.includes(id)).slice(0, 5);
      if (clean.length !== list.length) throw new Error('Loadouts hold max 5 bays and only blueprints you own.');
      meta.loadout = clean;
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, profile: profilePayload(account) };
    }
    if (path === '/api/mission/complete') {
      const account = requireAccount(body);
      const table = REWARDS[String(body.difficulty)] || REWARDS.easy;
      const win = body.result === 'win';
      const waves = Math.max(0, Math.min(20, Number(body.wavesCleared) || 0));
      const bosses = Math.max(0, Math.min(5, Number(body.bossesKilled) || 0));
      const flawless = Boolean(win && body.flawless);
      const bonusNc = Math.max(0, Math.min(600, Math.round(Number(body.bonusNc) || 0))); // Scrap Foundry yield
      const meta = account.meta;
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
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, rewards: { nc, bt, xp, bonusNc, firstClear, levelsGained: meta.level - before }, profile: profilePayload(account) };
    }
    if (path === '/api/redeem') {
      // Salvage-code redemption — mirrors server.js exactly (same codes, same grants).
      const account = requireAccount(body);
      const code = String((body || {}).code || '').trim().toUpperCase();
      const grant = REDEEM_CODES[code];
      if (!grant) throw new Error('Unknown salvage code. The grid does not recognize it.');
      account.meta.redeemed = Array.isArray(account.meta.redeemed) ? account.meta.redeemed : [];
      if (account.meta.redeemed.includes(code)) throw new Error('Code already redeemed by this commander.');
      account.meta.redeemed.push(code);
      account.meta.nc += grant.nc;
      account.meta.bt += grant.bt;
      const accounts = readAccounts();
      accounts[account.name] = account;
      writeJson(ACCOUNTS_KEY, accounts);
      return { ok: true, granted: { nc: grant.nc, bt: grant.bt }, profile: profilePayload(account) };
    }
    throw new Error('Unknown API endpoint.');
  }

  function markDown() {
    if (down) return;
    down = true;
    paintNetBadge();
  }

  return { handle, markDown, down: () => down };
})();

function paintNetBadge() {
  const badge = document.querySelector('#net-badge');
  if (badge) badge.hidden = !LOCAL.down();
}

// --- Commander authentication ---------------------------------------------------
async function apiRequest(path, payload) {
  if (LOCAL.down()) return LOCAL.handle(path, payload);
  let response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    LOCAL.markDown(); // network failure — no Node backend reachable
    return LOCAL.handle(path, payload);
  }
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) {
    // Static host (GitHub Pages): POST endpoints return an HTML 405 page here.
    LOCAL.markDown();
    return LOCAL.handle(path, payload);
  }
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
  setStatus(LOCAL.down() ? 'LOCAL NEXUS ONLINE // PROGRESS SAVES IN THIS BROWSER' : 'ACCOUNT LINKED // MENU SYSTEM READY');
  loadProfile();
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
  const stats = typeof item.stats === 'function' ? item.stats() : item.stats;
  document.querySelector('#preview-stats').innerHTML = stats.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
}

function openMenu(key) {
  const item = menus[key];
  if (!item) return;
  playSound();
  updatePreview(key);
  document.querySelector('#dialog-kicker').textContent = `// ${item.tag}`;
  document.querySelector('#dialog-title').textContent = item.title;
  if (key === 'play') openPlayMenu();
  else if (key === 'shop') renderNexusShop();
  else if (key === 'settings') renderSettingsPanel(item);
  else renderDetails(item);
  dialog.showModal();
}

// --- Room service: four fixed deployment bays, room lead starts the mission ------
let roomList = [];
let currentRoom = null;
let showingBays = false;
let myCallsign = '';
let roomLaunch = false;
let launchTimer = 0;

// Commanders in the current squad — combat reads this for the tower limit.
window.CBZ_ROOM_PLAYERS = 1;
function roomPlayerCount() {
  return Math.max(1, Math.min(4, Number(window.CBZ_ROOM_PLAYERS) || 1));
}

// --- LOCAL ROOM SERVICE ----------------------------------------------------------
// GitHub Pages has no Node backend, so the four deployment bays also run in the
// browser off localStorage, speaking the exact same message protocol as the
// server's room service. Solo launch works immediately, and a second tab on this
// machine can drop into the same bay as a real squadmate — shared roster, shared
// map pick, synchronized launch.
const LOCAL_ROOMS = (() => {
  const KEY = 'cbz-local-rooms';
  const MAX_PLAYERS = 4;
  const STALE_MS = 20000; // a seat whose tab stops beating this long is abandoned
  const BAYS = [
    ['room-01', 'ROOM 01 // ALPHA'],
    ['room-02', 'ROOM 02 // BRAVO'],
    ['room-03', 'ROOM 03 // CHARLIE'],
    ['room-04', 'ROOM 04 // DELTA'],
  ];
  let callsign = '';
  let myRoom = null;
  let launchedFor = null;
  let wired = false;
  let TAB_ID = '';
  try {
    TAB_ID = sessionStorage.getItem('cbz-tab') || '';
    if (!TAB_ID) {
      TAB_ID = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
      sessionStorage.setItem('cbz-tab', TAB_ID);
    }
  } catch { TAB_ID = `t${Math.floor(Math.random() * 1e9).toString(36)}`; }

  function fresh() {
    return BAYS.map(([id, name]) => ({ id, name, players: [], map: null, started: false, launchId: null }));
  }
  function prune(rooms) {
    const now = Date.now();
    for (const room of rooms) {
      room.players = (room.players || []).filter((player) => now - (player.lastSeen || 0) < STALE_MS);
      if (!room.players.length && (room.map || room.started)) {
        // An abandoned bay resets, exactly like the server's empty-room rule.
        room.map = null;
        room.started = false;
        room.launchId = null;
      }
    }
    return rooms;
  }
  function read() {
    let rooms = null;
    try { rooms = JSON.parse(localStorage.getItem(KEY)); } catch { rooms = null; }
    return prune(Array.isArray(rooms) ? rooms : fresh());
  }
  function write(rooms) {
    try { localStorage.setItem(KEY, JSON.stringify(rooms)); } catch { /* storage optional. */ }
  }
  function snapshot(room) {
    return {
      id: room.id,
      name: room.name,
      map: room.map,
      maxPlayers: MAX_PLAYERS,
      started: room.started,
      commanders: room.players.map((player, index) => ({ callsign: player.callsign, isHost: index === 0 })),
    };
  }
  const snapshots = (rooms) => rooms.map(snapshot);
  function findMine(rooms) {
    return rooms.find((room) => room.players.some((player) => player.tab === TAB_ID)) || null;
  }

  // Another tab changed the bay state — refresh this tab's UI and follow a launch.
  function syncFromStorage() {
    const rooms = read();
    roomList = snapshots(rooms);
    const mine = findMine(rooms);
    if (mine) {
      currentRoom = snapshot(mine);
      if (mine.started && mine.map && mine.launchId && launchedFor !== mine.launchId) {
        launchedFor = mine.launchId;
        showLaunchSequence(mine.map);
        return;
      }
      if (dialog.open) {
        if (showingBays) renderBays();
        else renderLobby();
      }
    } else {
      currentRoom = null;
      if (dialog.open && showingBays) renderBays();
    }
  }

  function handle(message) {
    const rooms = read();
    if (message.type === 'authenticate') {
      callsign = (message.callsign || callsign || 'COMMANDER').toUpperCase();
      handleServiceMessage({ type: 'linked', callsign, rooms: snapshots(rooms) });
      return;
    }
    if (message.type === 'rooms') {
      handleServiceMessage({ type: 'rooms', rooms: snapshots(rooms) });
      return;
    }
    if (message.type === 'join') {
      const room = rooms.find((bay) => bay.id === String(message.room || ''));
      if (!room) return handleServiceMessage({ type: 'error', message: 'Room not found.' });
      if (myRoom) return handleServiceMessage({ type: 'error', message: 'Leave your current room before switching.' });
      if (room.started) return handleServiceMessage({ type: 'error', message: 'This room has already started.' });
      if (room.players.length >= MAX_PLAYERS) return handleServiceMessage({ type: 'error', message: 'Room is full. Choose another room.' });
      room.players.push({ callsign, tab: TAB_ID, lastSeen: Date.now() });
      myRoom = room.id;
      write(rooms);
      handleServiceMessage({ type: 'joined', you: callsign, room: snapshot(room) });
      return;
    }
    if (message.type === 'config') {
      const room = findMine(rooms);
      if (room && !room.started && room.players[0] && room.players[0].tab === TAB_ID) {
        room.map = message.map;
        write(rooms);
        syncFromStorage();
      }
      return;
    }
    if (message.type === 'start') {
      const room = findMine(rooms);
      if (!room || !room.map || room.started) return;
      if (!room.players[0] || room.players[0].tab !== TAB_ID) {
        return handleServiceMessage({ type: 'error', message: 'Only the room lead can start the mission.' });
      }
      room.started = true;
      room.launchId = `${Date.now()}`;
      write(rooms);
      launchedFor = room.launchId;
      handleServiceMessage({ type: 'launch', room: snapshot(room) });
      return;
    }
    if (message.type === 'leave') {
      const room = findMine(rooms);
      if (room) {
        room.players = room.players.filter((player) => player.tab !== TAB_ID);
        if (!room.players.length) { room.map = null; room.started = false; room.launchId = null; }
        write(rooms);
      }
      myRoom = null;
      handleServiceMessage({ type: 'rooms', rooms: snapshots(read()) });
      return;
    }
    if (message.type === 'end') {
      const room = findMine(rooms);
      if (room && room.started) {
        room.started = false;
        room.launchId = null;
        write(rooms);
      }
      return;
    }
  }

  function wake() {
    if (wired) return;
    wired = true;
    callsign = (myName || 'COMMANDER').toUpperCase();
    // A fresh page load can't still be holding a seat — clear this tab's crash leftovers.
    const rooms = read();
    let cleaned = false;
    for (const room of rooms) {
      const before = room.players.length;
      room.players = room.players.filter((player) => player.tab !== TAB_ID);
      if (room.players.length !== before) cleaned = true;
    }
    if (cleaned) write(rooms);
    window.addEventListener('storage', (event) => {
      if (event.key === KEY) syncFromStorage();
    });
    const dropSeat = () => {
      const current = read();
      const room = findMine(current);
      if (room) {
        room.players = room.players.filter((player) => player.tab !== TAB_ID);
        if (!room.players.length) { room.map = null; room.started = false; room.launchId = null; }
        write(current);
      }
    };
    window.addEventListener('pagehide', dropSeat);
    window.addEventListener('beforeunload', dropSeat);
    setInterval(() => {
      const current = read();
      const room = findMine(current);
      if (!room) return;
      const me = room.players.find((player) => player.tab === TAB_ID);
      if (me) { me.lastSeen = Date.now(); write(current); }
    }, 5000);
  }

  function role() {
    // Squad seat for the co-op relay: the tab holding seat 0 of a started bay leads.
    const mine = findMine(read());
    if (!mine || !mine.started || !mine.players.length) return 'solo';
    const seat = mine.players.findIndex((player) => player.tab === TAB_ID);
    return seat === 0 ? 'host' : 'guest';
  }

  return { handle, wake, snapshots: () => snapshots(read()), role };
})();

function sendToService(message) {
  if (LOCAL.down()) {
    LOCAL_ROOMS.handle(message);
    return;
  }
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connectRoom() {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocol}//${location.host}/rooms`);
  socket.addEventListener('open', () => {
    document.querySelector('#server-status').textContent = 'ROOM SERVICE CONNECTED';
    // Bays require a commander session — the same token that logged you in.
    sendToService({ type: 'authenticate', token: authToken });
  });
  socket.addEventListener('message', ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    handleServiceMessage(message);
  });
  socket.addEventListener('close', () => {
    document.querySelector('#server-status').textContent = myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY';
  });
  socket.addEventListener('error', () => showToast('Could not reach the room service. Check the server port.'));
}

function openPlayMenu() {
  if (LOCAL.down()) {
    // Static host: the four deployment bays run locally off localStorage —
    // join one, pick a map, launch. No Node server required.
    showingBays = true;
    LOCAL_ROOMS.wake();
    roomList = LOCAL_ROOMS.snapshots();
    renderBays();
    return;
  }
  // Already linked to the room service? Show the live lobby/bays without
  // reconnecting — a fresh socket would eject this commander from their room.
  if (socket && socket.readyState === WebSocket.OPEN) {
    if (currentRoom) return renderLobby();
    showingBays = true;
    renderBays();
    sendToService({ type: 'rooms' });
    return;
  }
  document.querySelector('#server-status').textContent = 'CONNECTING...';
  body.innerHTML = '<p class="lobby-state" role="status">LINKING TO ROOM SERVICE...</p>';
  showingBays = true; // 'linked' will flip this view into the live bay browser
  connectRoom();
}

function renderBays() {
  showingBays = true;
  currentRoom = null;
  window.CBZ_ROOM_PLAYERS = 1;
  document.querySelector('#dialog-kicker').textContent = '// AVAILABLE ROOMS';
  document.querySelector('#dialog-title').textContent = 'SELECT A ROOM';
  const reconButton = '<button class="action-button bay-recon" id="map-recon" type="button"><b>SOLO MAP RECON</b><small>Open one of the five maps without joining a room</small></button>';
  if (!roomList.length) {
    body.innerHTML = `<p class="dialog-copy">Enter one of four rooms for up to four commanders. Select a map after entering.</p>${reconButton}<p class="lobby-state">LINKING TO ROOMS...</p>`;
    document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
    return;
  }
  body.innerHTML = `
    <p class="dialog-copy">Enter an open room for up to four commanders. Choose a map, wait for at least one teammate, and let the room lead start when ready.</p>
    ${reconButton}
    <div class="bays-grid">${roomList.map((room) => {
      const count = room.commanders.length;
      const full = count >= room.maxPlayers;
      const started = room.started;
      const map = room.map && BATTLE_MAPS[room.map];
      const state = started ? 'started' : count === 0 ? 'empty' : full ? 'full' : 'open';
      const stateText = started ? 'MISSION STARTED' : full ? `FULL // ${count}/${room.maxPlayers} COMMANDERS` : `${count}/${room.maxPlayers} COMMANDERS // WAITING`;
      const buttonText = started ? 'IN PROGRESS' : full ? 'ROOM FULL' : 'ENTER ROOM';
      return `<article class="bay-card is-${state}">
        <header><strong>${escapeHtml(room.name)}</strong><span class="bay-status">${escapeHtml(stateText)}</span></header>
        <p class="bay-map">${map ? `${escapeHtml(map.difficulty)} // ${escapeHtml(map.name)}` : 'MAP: NOT SELECTED'}</p>
        <button class="join-button" type="button" data-bay="${escapeHtml(room.id)}" ${full || started ? 'disabled' : ''}>${buttonText}</button>
      </article>`;
    }).join('')}</div>`;
  document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
  body.querySelectorAll('[data-bay]').forEach((button) => button.addEventListener('click', () => {
    playSound();
    sendToService({ type: 'join', room: button.dataset.bay });
  }));
  const invite = new URLSearchParams(location.search).get('room');
  if (invite && roomList.some((room) => room.id === invite && !room.started && room.commanders.length < room.maxPlayers)) {
    sendToService({ type: 'join', room: invite });
  }
}

function isRoomLead(room) {
  return room.commanders.some((commander) => commander.isHost && commander.callsign === myCallsign);
}

function renderRoomMapCard(map, room, roomLead) {
  const selected = room.map === map.id;
  return `<article class="room-map-entry">
    <button class="map-card${map.id === 'cbz' ? ' map-cbz' : ''}${selected ? ' selected' : ''}" type="button" data-map="${map.id}" aria-pressed="${selected}" ${roomLead && !room.started ? '' : 'disabled'}>
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
  window.CBZ_ROOM_PLAYERS = currentRoom.commanders.length;
  const room = currentRoom;
  const roomLead = isRoomLead(room);
  document.querySelector('#dialog-kicker').textContent = room.started ? '// MISSION IN PROGRESS' : '// ROOM LINK ESTABLISHED';
  document.querySelector('#dialog-title').textContent = room.name;
  const roster = room.commanders.map((commander) => `
    <li class="${commander.callsign === myCallsign ? 'you' : ''}">
      <span class="slot-tag">${commander.callsign === myCallsign ? 'YOU' : 'ALLY'}</span>
      <strong>${escapeHtml(commander.callsign)}</strong>
      <em class="${commander.isHost ? 'host-tag' : 'crew-tag'}">${commander.isHost ? 'ROOM LEAD' : 'CREW'}</em>
    </li>`).join('');
  const emptySlots = Array.from(
    { length: Math.max(0, room.maxPlayers - room.commanders.length) },
    () => '<li class="slot-empty"><span class="slot-tag">//</span><strong>AWAITING COMMANDER</strong></li>',
  ).join('');
  body.innerHTML = `
    <div class="lobby-grid">
      <section class="roster-panel">
        <h3>SQUAD ROSTER</h3>
        <ul class="roster-list">${roster}${emptySlots}</ul>
        <button class="ghost-button" id="leave-room" type="button">LEAVE ROOM</button>
      </section>
      <section class="config-panel">
        <h3>SELECT MAP // ${roomLead ? 'ROOM LEAD CONTROL' : 'ROOM LEAD SELECTS'}</h3>
        ${roomLead && !room.started ? `<p class="dialog-copy">${LOCAL.down() ? 'Choose a map and launch when ready. Other commanders can drop into this bay from another tab on this machine.' : 'Choose a map. Your squad waits here until at least one teammate joins and you start.'}</p>` : ''}
        <div class="map-grid">${Object.values(BATTLE_MAPS).map((map) => renderRoomMapCard(map, room, roomLead)).join('')}</div>
        ${roomLead && !room.started ? `<button class="start-button" id="start-room" type="button" ${room.map && (LOCAL.down() || room.commanders.length >= 2) ? '' : 'disabled'}>START WHEN READY <span>→</span></button>` : ''}
        ${room.started ? '<p class="standby-note">MISSION STARTED // DEPLOYMENT LOCKED. FINISH OR EXIT TO REGROUP.</p>' : !roomLead ? '<p class="standby-note">STANDBY // WAITING FOR THE ROOM LEAD TO START.</p>' : ''}
      </section>
    </div>`;
  document.querySelector('#leave-room').addEventListener('click', () => {
    playSound();
    sendToService({ type: 'leave' });
    currentRoom = null;
    window.CBZ_ROOM_PLAYERS = 1;
    setStatus('ROOM SERVICE ONLINE');
    renderBays();
  });
  body.querySelectorAll('[data-map]').forEach((button) => button.addEventListener('click', () => {
    if (!roomLead || room.started) return;
    playSound();
    sendToService({ type: 'config', map: button.dataset.map });
  }));
  const startButton = document.querySelector('#start-room');
  if (startButton) startButton.addEventListener('click', () => {
    playSound();
    sendToService({ type: 'start' });
  });
  body.querySelectorAll('[data-recon]').forEach((button) => button.addEventListener('click', () => {
    openBattlefield(button.dataset.recon);
  }));
}

function handleServiceMessage(message) {
  if (message.type === 'auth-error') {
    showToast(message.message);
    if (dialog.open && !showingBays) renderBays();
    setStatus('ROOM SERVICE // SIGN IN REQUIRED FOR ROOMS');
    return;
  }
  if (message.type === 'linked') {
    myCallsign = message.callsign;
    roomList = message.rooms;
    if (Array.isArray(message.chat)) message.chat.forEach(appendChat);
    setStatus('ROOM SERVICE ONLINE');
    if (dialog.open && showingBays) renderBays();
    return;
  }
  if (message.type === 'chat') {
    appendChat(message);
    return;
  }
  if (message.type === 'coop') {
    if (window.CBZCombat) CBZCombat.coopHandle({ k: message.kind, ...(message.data || {}) });
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
    return;
  }
  if (message.type === 'launch') {
    currentRoom = message.room;
    showLaunchSequence(currentRoom.map);
  }
}

function showLaunchSequence(mapId) {
  clearTimeout(launchTimer);
  const map = BATTLE_MAPS[mapId];
  if (!map) {
    showToast('Room launch referenced an unknown map.');
    if (currentRoom && dialog.open) renderLobby();
    return;
  }
  if (dialog.open) dialog.close();
  roomLaunch = true;
  window.CBZ_ROOM_PLAYERS = currentRoom ? currentRoom.commanders.length : 1;
  // Squad relay: the room lead's sim is authoritative — everyone else mirrors it
  // and ships intents. Server rooms relay over WebSocket; LOCAL bays relay over
  // a BroadcastChannel between tabs on this machine.
  if (LOCAL.down()) {
    const channel = new BroadcastChannel(`cbz-coop-${currentRoom ? currentRoom.id : 'solo'}`);
    channel.onmessage = (event) => { if (window.CBZCombat) CBZCombat.coopHandle(event.data); };
    window.CBZCoopBridge = { role: LOCAL_ROOMS.role(), send: (msg) => channel.postMessage(msg) };
  } else {
    window.CBZCoopBridge = {
      role: currentRoom && isRoomLead(currentRoom) ? 'host' : 'guest',
      send: (msg) => { const { k, ...data } = msg; sendToService({ type: 'coop', kind: k, data }); },
    };
  }
  const overlay = document.querySelector('#loading-overlay');
  const state = document.querySelector('#loading-state');
  state.textContent = `SQUAD LINKED // LOADING ${map.name}`;
  overlay.hidden = false;
  setStatus('SQUAD LAUNCH // SYNCHRONIZING');
  launchTimer = setTimeout(() => {
    overlay.hidden = true;
    openBattlefield(mapId);
    // Room launch skips the solo protocol vote — the room lead already picked the map.
    if (window.CBZCombat) CBZCombat.startMission(map, true);
  }, 1600);
}

function renderDetails(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>`;
}

// Settings & Logs carries one interactive extra: salvage-code redemption.
function renderSettingsPanel(item) {
  body.innerHTML = `<p class="dialog-copy">${escapeHtml(item.description)}</p><div class="detail-list">${item.stats.map(([label, value]) => `<div class="detail-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('')}</div>
    <div class="redeem-block">
      <div class="redeem-head">// INTERCEPTED TRANSMISSIONS</div>
      <p class="redeem-copy">Salvage codes surface on intercepted net traffic. Each code redeems once per commander.</p>
      <div class="redeem-row">
        <input id="redeem-input" maxlength="24" autocomplete="off" spellcheck="false" placeholder="ENTER CODE" aria-label="Salvage code">
        <button id="redeem-button" class="redeem-button" type="button">REDEEM</button>
      </div>
      <div class="redeem-status" id="redeem-status" hidden></div>
    </div>`;
  const input = body.querySelector('#redeem-input');
  const button = body.querySelector('#redeem-button');
  const status = body.querySelector('#redeem-status');
  function paintStatus(text, bad) {
    status.hidden = !text;
    status.textContent = text;
    status.classList.toggle('bad', Boolean(bad));
    status.classList.toggle('good', !bad);
  }
  async function submit() {
    const code = input.value.trim().toUpperCase();
    if (!code) { paintStatus('ENTER A CODE FIRST.', true); input.focus(); return; }
    if (!authToken || !window.CBZShop) { paintStatus('LINK A COMMANDER FIRST — CODES PAY INTO YOUR ACCOUNT.', true); return; }
    button.disabled = true;
    paintStatus('TRANSMITTING…');
    try {
      const granted = await window.CBZShop.redeemCode(code);
      if (!granted) throw new Error('Transfer rejected.');
      paintWallet();
      playSound();
      const parts = [];
      if (granted.nc) parts.push(`+${Number(granted.nc).toLocaleString('en-US')} NC`);
      if (granted.bt) parts.push(`+${granted.bt} BT`);
      const amount = parts.join(' / ') || 'NOTHING?!';
      showToast(`SALVAGE CODE ${code} — ${amount} INJECTED`);
      paintStatus(`CODE ACCEPTED — ${amount}.`, false);
      input.value = '';
    } catch (error) {
      paintStatus(String((error && error.message) || 'REJECTED BY THE GRID.').toUpperCase(), true);
    } finally {
      button.disabled = false;
      input.focus();
    }
  }
  button.addEventListener('click', submit);
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); submit(); } });
  input.focus();
}

// --- Nexus shop + commander wallet ---------------------------------------------
function renderNexusShop() {
  if (!window.CBZShop) return renderDetails(menus.shop);
  dialog.classList.add('shop-open');
  CBZShop.render(body);
}

async function loadProfile() {
  if (!authToken || !window.CBZShop) return;
  try {
    const data = await apiRequest('/api/profile', { token: authToken });
    CBZShop.setProfile(data.profile);
    paintWallet();
  } catch { /* wallet keeps defaults if the profile API is unreachable. */ }
}

function paintWallet() {
  const wallet = document.querySelector('#wallet');
  const shop = window.CBZShop;
  if (!wallet || !shop) return;
  const profile = shop.profile();
  wallet.hidden = false;
  document.querySelector('#wallet-lv').textContent = `LV ${profile.level}`;
  document.querySelector('#wallet-nc').textContent = Number(profile.nc || 0).toLocaleString('en-US');
  document.querySelector('#wallet-bt').textContent = Number(profile.bt || 0).toLocaleString('en-US');
  const levelLine = document.querySelector('#menu-level');
  if (levelLine) levelLine.textContent = `COMMANDER LV ${profile.level}`;
}
window.paintWallet = paintWallet;

// --- Global comms: one shared channel, in the menu or mid-mission -----------------------
const CHAT_KEY = 'cbz-global-chat';
function chatIdentity() {
  return myCallsign || myName || 'GUEST';
}
function chatOnline() {
  return !LOCAL.down() && socket && socket.readyState === WebSocket.OPEN;
}
function appendChat(entry) {
  const log = document.querySelector('#chat-log');
  if (!log || !entry || !entry.text) return;
  const line = document.createElement('div');
  line.className = 'chat-line';
  line.innerHTML = `<b>${escapeHtml(String(entry.from || 'GRID'))}</b><span>${escapeHtml(String(entry.text))}</span>`;
  log.appendChild(line);
  while (log.children.length > 80) log.removeChild(log.firstChild);
  log.scrollTop = log.scrollHeight;
}
function sendChat(text) {
  const clean = String(text || '').trim().slice(0, 280);
  if (!clean) return;
  if (chatOnline()) {
    socket.send(JSON.stringify({ type: 'chat', text: clean }));
    return;
  }
  // Static host: relay through localStorage so tabs on this machine stay linked.
  const entry = { from: chatIdentity(), text: clean, ts: Date.now() };
  try {
    const list = JSON.parse(localStorage.getItem(CHAT_KEY) || '[]');
    list.push(entry);
    localStorage.setItem(CHAT_KEY, JSON.stringify(list.slice(-50)));
  } catch { /* storage optional. */ }
  appendChat(entry);
}
window.addEventListener('storage', (event) => {
  if (event.key !== CHAT_KEY || !event.newValue) return;
  try {
    const list = JSON.parse(event.newValue);
    const last = list[list.length - 1];
    if (last) appendChat(last);
  } catch { /* malformed storage — ignore. */ }
});
(function ensureComms() {
  if (document.querySelector('#comms-toggle')) return;
  const toggle = document.createElement('button');
  toggle.id = 'comms-toggle';
  toggle.type = 'button';
  toggle.textContent = 'COMMS';
  const panel = document.createElement('div');
  panel.id = 'comms-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <div class="comms-head"><span>// GLOBAL NET</span><b id="comms-scope">LOCAL RELAY</b></div>
    <div class="chat-log" id="chat-log"></div>
    <form class="chat-form" id="chat-form"><input id="chat-input" maxlength="280" autocomplete="off" placeholder="Transmit to the grid..."><button type="submit">SEND</button></form>`;
  document.body.appendChild(toggle);
  document.body.appendChild(panel);
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      document.querySelector('#comms-scope').textContent = chatOnline() ? 'SERVER RELAY' : 'LOCAL RELAY';
      const log = document.querySelector('#chat-log');
      if (log) log.scrollTop = log.scrollHeight;
    }
  });
  panel.querySelector('#chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const input = panel.querySelector('#chat-input');
    sendChat(input.value);
    input.value = '';
  });
})();

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
    pads.appendChild(svgNode('polygon', { class: 'pad', points: hexPoints(x, y, 17), 'data-pad': `${x},${y}` }));
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
  // Map recon is always a solo sim — any squad bridge from a previous mission dies here.
  if (!roomLaunch) window.CBZCoopBridge = null;
  document.querySelector('#battle-map-name').textContent = map.name;
  document.querySelector('#battle-map-sector').textContent = map.sector;
  document.querySelector('#battle-map-mech').textContent = map.mechanic;
  buildBoard(map);
  const deploy = document.querySelector('#deploy-mission');
  deploy.hidden = false;
  deploy.onclick = () => window.CBZCombat && CBZCombat.startMission(map);
  document.querySelector('#battlefield').hidden = false;
  setStatus(`MAP RECON // ${map.name}`);
}

function exitBattlefield() {
  if (window.CBZCombat) CBZCombat.abort();
  document.querySelector('#battlefield').hidden = true;
  document.querySelector('#board').innerHTML = '';
  const returnedFromRoom = roomLaunch;
  roomLaunch = false;
  setStatus(currentRoom ? `ROOM LINKED // ${currentRoom.name}` : myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY');
  if (returnedFromRoom && currentRoom) {
    renderLobby();
    dialog.showModal();
  }
  playSound();
}

document.querySelectorAll('[data-menu]').forEach((button) => {
  button.addEventListener('mouseenter', () => updatePreview(button.dataset.menu));
  button.addEventListener('focus', () => updatePreview(button.dataset.menu));
  button.addEventListener('click', () => openMenu(button.dataset.menu));
});
document.querySelector('#dialog-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => dialog.classList.remove('shop-open'));
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
paintNetBadge();
restoreSession();
