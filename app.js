const dialog = document.querySelector('#menu-dialog');
const body = document.querySelector('#dialog-body');
const authOverlay = document.querySelector('#auth-overlay');
const port = window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
let socket;
let roomCode = '';
let peerConnected = false;
let soundEnabled = true;
let audioContext;
let toastTimer;
let authToken = localStorage.getItem('cbz-token') || '';
let myName = '';
let myPlayerId = 0;
let authMode = 'login';

document.querySelector('#server-port').textContent = `PORT ${port}`;
document.querySelector('#preview-port').textContent = port;

const menus = {
  play: {
    tag: 'DEPLOYMENT HUB', title: 'PLAY MENU',
    description: 'Recon any of the 5 battle maps solo, or deploy EASY MODE — 15 waves, 3 boss encounters, base defense. Rooms support 2 commanders.',
    stats: [['MAP RECON', '5 SECTORS'], ['EASY MODE', '15 WAVES LIVE'], ['SERVER PORT', port]],
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

// --- Local Nexus fallback --------------------------------------------------------
// Static hosts (GitHub Pages) cannot run the Node backend: POST /api/* returns a
// non-JSON 405 page there. When that happens we flip to a fully local Nexus that
// mirrors server.js — same tables, same rules, same error strings — with accounts,
// sessions, wallet, purchases, loadouts and mission payouts persisted in
// localStorage. Progress is per-browser; the real server remains authoritative
// whenever the site is actually served by `node server.js`.
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
    return { name: account.name, level: meta.level, xp: meta.xp, xpNext: xpToNext(meta.level), maxLevel: MAX_LEVEL, nc: meta.nc, bt: meta.bt, firstClear: meta.firstClear, owned: meta.owned, loadout: meta.loadout || [] };
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
      if (item.price > 0) {
        const balance = item.currency === 'bt' ? meta.bt : meta.nc;
        if (balance < item.price) throw new Error(item.currency === 'bt' ? 'Not enough Breach Tokens.' : 'Not enough Nexus Coins.');
        if (item.currency === 'bt') meta.bt -= item.price;
        else meta.nc -= item.price;
      }
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
      const waves = Math.max(0, Math.min(15, Number(body.wavesCleared) || 0));
      const bosses = Math.max(0, Math.min(3, Number(body.bossesKilled) || 0));
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
  if (key === 'play') renderPlayMenu();
  else if (key === 'shop') renderNexusShop();
  else renderDetails(item);
  dialog.showModal();
}

function renderPlayMenu(message = '') {
  body.innerHTML = `
    <p class="dialog-copy">${LOCAL.down() ? 'Local Nexus active — solo missions are fully playable and progress saves in this browser. Multiplayer rooms need the Node server: run <strong>node server.js</strong> locally and open its address.' : `Fly any battle map solo, or hit START MISSION on a map to deploy Easy Mode — 15 waves, 3 boss encounters. Server port: <strong>${escapeHtml(port)}</strong>.`}</p>
    <div class="action-grid">
      <button class="action-button" id="map-recon" type="button"><b>SOLO MAP RECON</b><small>Fly over any of the 5 battle maps</small></button>
      <button class="action-button" id="host-room" type="button"><b>HOST A ROOM</b><small>Create a code for a second commander</small></button>
    </div>
    <form class="join-form" id="join-form"><input id="room-input" aria-label="Room code" placeholder="ENTER 6-DIGIT ROOM CODE" maxlength="6" inputmode="numeric" autocomplete="off"><button class="join-submit" type="submit">JOIN ROOM</button></form>
    ${message ? `<p class="lobby-state" role="status">${escapeHtml(message)}</p>` : ''}`;
  document.querySelector('#map-recon').addEventListener('click', renderMapSelect);
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
  setStatus(myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY');
  playSound();
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
    document.querySelector('#server-status').textContent = myName ? 'ACCOUNT LINKED // MENU SYSTEM READY' : 'MENU SYSTEM READY';
    peerConnected = false;
  });
  socket.addEventListener('error', () => showToast('Could not reach the room service. Check the server port.'));
}

function hostRoom() {
  if (LOCAL.down()) return showToast('Room service needs the Node server — solo missions are fully playable here.');
  document.querySelector('#server-status').textContent = 'CONNECTING...';
  connectRoom();
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'create' })), { once: true });
  body.innerHTML = '<p class="lobby-state" role="status">Opening a commander room...</p>';
}

function joinRoom(code) {
  const normalized = String(code).trim();
  if (!/^\d{6}$/.test(normalized)) return showToast('Enter a valid 6-digit room code.');
  if (LOCAL.down()) return showToast('Room service needs the Node server — solo missions are fully playable here.');
  document.querySelector('#server-status').textContent = 'CONNECTING...';
  connectRoom();
  socket.addEventListener('open', () => socket.send(JSON.stringify({ type: 'join', code: normalized })), { once: true });
  body.innerHTML = '<p class="lobby-state" role="status">Connecting to commander room...</p>';
}

function handleRoomMessage(message) {
  if (String(message.type).startsWith('game-')) {
    if (window.CBZCombat) CBZCombat.handleRoomMessage(message);
    return;
  }
  if (message.type === 'error') {
    showToast(message.message);
    renderPlayMenu(message.message);
    return;
  }
  if (message.type === 'created') {
    roomCode = message.code;
    myPlayerId = message.playerId || 0;
    peerConnected = false;
    renderRoom();
  } else if (message.type === 'joined') {
    roomCode = message.code;
    myPlayerId = message.playerId || 1;
    peerConnected = true;
    renderJoinedRoom();
  } else if (message.type === 'peer-joined') {
    peerConnected = true;
    renderRoom();
    showToast('A commander joined the room.');
  } else if (message.type === 'peer-left') {
    peerConnected = false;
    if (window.CBZCombat) CBZCombat.peerLeft();
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
  body.innerHTML = `<div class="invite-box"><span>ROOM CODE / PORT ${escapeHtml(port)}</span><strong class="room-code">${escapeHtml(roomCode)}</strong><span class="invite-link">${escapeHtml(inviteUrl())}</span><button class="inline-button" id="copy-invite" type="button">COPY INVITE</button></div><p class="lobby-state" role="status">${peerConnected ? '<strong>Second commander connected.</strong> Both players are in the room.' : '<strong>Waiting for a commander.</strong> Share the room code to invite a player.'}</p>${peerConnected ? '<button class="inline-button room-launch" id="room-launch" type="button">START MODE VOTE</button>' : '<p class="dialog-copy menu-only-note">Easy Mode combat is live — 15 waves, 3 bosses. Once a commander joins, start a mode vote.</p>'}`;
  document.querySelector('#copy-invite').addEventListener('click', copyInvite);
  const launch = document.querySelector('#room-launch');
  if (launch) launch.addEventListener('click', () => window.CBZCombat && CBZCombat.offerRoomVote());
}

function renderJoinedRoom() {
  document.querySelector('#dialog-kicker').textContent = `// ROOM ${escapeHtml(roomCode)}`;
  document.querySelector('#dialog-title').textContent = 'ROOM JOINED';
  body.innerHTML = `<div class="detail-row"><span>ROOM CODE</span><b>${escapeHtml(roomCode)}</b></div><p class="lobby-state"><strong>Commander link established.</strong> Start a mode vote to deploy Easy Mode — 15 waves, 3 bosses.</p><button class="inline-button room-launch" id="room-launch" type="button">START MODE VOTE</button>`;
  document.querySelector('#room-launch').addEventListener('click', () => window.CBZCombat && CBZCombat.offerRoomVote());
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
