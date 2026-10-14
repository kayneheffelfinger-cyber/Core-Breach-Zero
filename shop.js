// Core Breach: Zero — Nexus Shop (blueprints, currencies, commander clearance).
// Loaded after app.js: uses its globals (apiRequest, playSound, showToast).
// Economy tables mirror server.js — keep xpToNext + reward math in sync there.
window.CBZShop = (() => {
  const MAX_LEVEL = 30;
  const HORIZON = 10; // locked blueprints stay visible within 10 levels; beyond that they are hidden
  const xpToNext = (level) => Math.round(55 * Math.pow(level, 0.86));

  const CATEGORIES = {
    all: { label: 'ALL LINES' },
    offense: { label: 'OFFENSE' },
    control: { label: 'CONTROL' },
    support: { label: 'SUPPORT' },
    special: { label: 'SPECIAL' },
  };

  const ic = (inner) => `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

  // --- Blueprint catalog: 16 turret lines, each with its own signature trick ------
  const TOWERS = [
    { id: 'sentinel', name: 'SENTINEL TURRET', cat: 'offense', unlock: 1, price: 0, cost: 50, currency: 'nc',
      tagline: 'Rapid kinetic baseline — cheap, dependable, always ready.',
      stats: { dmg: 14, rate: 1.6, rng: 150, tgt: 'SINGLE / GROUND' },
      special: '>> The grid standard. Fast bursts, low salvage cost, never overheats.',
      icon: ic('<path d="M9 33h22"/><path d="M13 33v-7h14v7"/><path d="M20 26V7"/><circle cx="20" cy="6" r="2.4"/>') },
    { id: 'arclance', name: 'ARC LANCE', cat: 'offense', unlock: 1, price: 400, cost: 85, currency: 'nc',
      tagline: 'Voltage that jumps the queue.',
      stats: { dmg: 18, rate: 0.9, rng: 165, tgt: 'SINGLE / GROUND + AIR' },
      special: '>> Chain lightning forks to 2 extra targets at 60% damage per arc.',
      icon: ic('<path d="M23 4L11 23h8l-5 13 14-20h-8z"/>') },
    { id: 'plasmort', name: 'PLASMA MORTAR', cat: 'offense', unlock: 2, price: 550, cost: 135, currency: 'nc',
      tagline: 'Lobs searing plasma over the whole grid.',
      stats: { dmg: 46, rate: 0.4, rng: 210, tgt: 'SPLASH 40U' },
      special: '>> Shells detonate on impact for full damage in a 40-unit splash.',
      icon: ic('<path d="M8 34h16"/><path d="M12 34L28 18"/><rect x="27" y="6" width="9" height="9" transform="rotate(45 31.5 10.5)"/><path d="M6 14a26 26 0 0 1 11-10" stroke-dasharray="3 4"/>') },
    { id: 'cryobeacon', name: 'CRYO DISRUPTOR', cat: 'control', unlock: 3, price: 650, cost: 115, currency: 'nc',
      tagline: 'A cold that never lifts.',
      stats: { dmg: 4, rate: 1, rng: 140, tgt: 'AURA SLOW 35%' },
      special: '>> Everything inside the field moves 35% slower — permanently.',
      icon: ic('<path d="M20 4v32"/><path d="M7 12l26 16"/><path d="M33 12L7 28"/><path d="M20 10l-4 4M20 10l4 4"/>') },
    { id: 'scrapforge', name: 'SCRAP FOUNDRY', cat: 'support', unlock: 5, price: 700, cost: 95, currency: 'nc',
      tagline: 'Turns wreckage into wages.',
      stats: { dmg: 0, rate: 0, rng: 0, tgt: 'ECONOMY' },
      special: '>> Prints +18 bonus NC every wave your squad clears.',
      icon: ic('<circle cx="20" cy="20" r="7"/><circle cx="20" cy="20" r="2.5"/><path d="M20 6v5M20 29v5M6 20h5M29 20h5M10 10l3.5 3.5M30 10l-3.5 3.5M10 30l3.5-3.5M30 30l-3.5-3.5"/>') },
    { id: 'railspire', name: 'RAIL SPIRE', cat: 'offense', unlock: 7, price: 950, cost: 175, currency: 'nc',
      tagline: 'One line, every offender.',
      stats: { dmg: 60, rate: 0.5, rng: 240, tgt: 'PIERCE LINE' },
      special: '>> Slugs drill through every hostile standing in the flight line.',
      icon: ic('<path d="M15 34L20 6l5 28"/><path d="M4 20h32" stroke-dasharray="2 4"/><circle cx="20" cy="15" r="2.2"/>') },
    { id: 'stingerpad', name: 'STINGER PAD', cat: 'offense', unlock: 9, price: 1150, cost: 195, currency: 'nc',
      tagline: 'Hornets with a lock-on license.',
      stats: { dmg: 12, rate: 2.2, rng: 190, tgt: 'SEEKING / AIR PRIORITY' },
      special: '>> Missiles chase their target — 200% damage vs flying units.',
      icon: ic('<path d="M7 33h26"/><path d="M13 27l7-11 7 11z"/><path d="M20 16V9"/><path d="M13 6h14"/>') },
    { id: 'teslacoil', name: 'TESLA COIL', cat: 'control', unlock: 11, price: 1400, cost: 215, currency: 'nc',
      tagline: 'Random acts of voltage.',
      stats: { dmg: 22, rate: 0.7, rng: 130, tgt: 'CHAIN / STUN 0.5S' },
      special: '>> Every hit may arc-stun up to 3 hostiles for half a second.',
      icon: ic('<rect x="14" y="23" width="12" height="10"/><path d="M12 23h16"/><path d="M14 18h12"/><path d="M16 13h8"/><path d="M25 13l6-5"/><path d="M26 16l7-1"/>') },
    { id: 'flakstorm', name: 'FLAK STORM', cat: 'offense', unlock: 13, price: 1600, cost: 245, currency: 'nc',
      tagline: 'The sky is a target-rich environment.',
      stats: { dmg: 30, rate: 1.4, rng: 175, tgt: 'BURST / 400% VS AIR' },
      special: '>> Proximity bursts shred air units for 400% damage.',
      icon: ic('<path d="M20 34V18"/><path d="M20 34L9 14"/><path d="M20 34L31 14"/><circle cx="20" cy="13" r="2.2"/><circle cx="9" cy="10" r="2.2"/><circle cx="31" cy="10" r="2.2"/>') },
    { id: 'pyrewell', name: 'PYRE WELL', cat: 'offense', unlock: 15, price: 1850, cost: 235, currency: 'nc',
      tagline: 'Fire that learns to spread.',
      stats: { dmg: 10, rate: 1.2, rng: 145, tgt: 'BURN 6/S · 3S' },
      special: '>> Burned hostiles ignite their neighbors when they die — contagion burn.',
      icon: ic('<path d="M20 5c6 7 9 11 9 17a9 9 0 1 1-18 0c0-6 3-10 9-17z"/><path d="M20 33a4 4 0 0 1-4-4c0-3 2-5 4-8 2 3 4 5 4 8a4 4 0 0 1-4 4z"/>') },
    { id: 'nullbeacon', name: 'NULL BEACON', cat: 'support', unlock: 17, price: 2200, cost: 265, currency: 'nc',
      tagline: 'Strips the plating off the problem.',
      stats: { dmg: 0, rate: 0, rng: 160, tgt: 'DEBUFF AURA' },
      special: '>> Hostiles in range lose half their armor and take +15% damage.',
      icon: ic('<path d="M4 20c5-8 12-12 16-12s11 4 16 12c-5 8-12 12-16 12S9 28 4 20z"/><circle cx="20" cy="20" r="4"/><path d="M8 32L32 8"/>') },
    { id: 'quantum', name: 'QUANTUM SNIPER', cat: 'offense', unlock: 19, price: 2600, cost: 325, currency: 'nc',
      tagline: 'The shot already happened.',
      stats: { dmg: 150, rate: 0.25, rng: 999, tgt: 'SINGLE / EXECUTE' },
      special: '>> Infinite range; instantly executes any hostile below 10% HP.',
      icon: ic('<circle cx="20" cy="20" r="11"/><path d="M20 4v8M20 28v8M4 20h8M28 20h8"/><circle cx="20" cy="20" r="2" fill="currentColor" stroke="none"/>') },
    { id: 'gravwell', name: 'GRAVITY WELL', cat: 'control', unlock: 21, price: 3000, cost: 285, currency: 'nc',
      tagline: 'Physics, weaponized.',
      stats: { dmg: 8, rate: 1, rng: 135, tgt: 'PULL FIELD' },
      special: '>> Drags hostiles backwards while they crawl through the well.',
      icon: ic('<circle cx="20" cy="20" r="4"/><circle cx="20" cy="20" r="9.5" stroke-dasharray="4 3"/><circle cx="20" cy="20" r="15" stroke-dasharray="2 5"/>') },
    { id: 'naniteweb', name: 'NANITE WEB', cat: 'support', unlock: 23, price: 3400, cost: 305, currency: 'nc',
      tagline: 'Your turrets, but caffeinated.',
      stats: { dmg: 0, rate: 0, rng: 120, tgt: 'SUPPORT AURA' },
      special: '>> Adjacent turrets fire 30% faster and cycle 20% quicker.',
      icon: ic('<path d="M20 6l12 7v14l-12 7-12-7V13z"/><circle cx="20" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="32" cy="13" r="2" fill="currentColor" stroke="none"/><circle cx="32" cy="27" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="34" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="27" r="2" fill="currentColor" stroke="none"/><circle cx="8" cy="13" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="20" r="3"/>') },
    { id: 'phasedeca', name: 'PHASE DECIMATOR', cat: 'special', unlock: 25, price: 180, cost: 425, currency: 'bt',
      tagline: 'Ignores the armor phase entirely.',
      stats: { dmg: 90, rate: 0.6, rng: 230, tgt: 'PHASE BEAM' },
      special: '>> Beam phases through armor and shields — always full damage.',
      icon: ic('<path d="M3 20h11"/><rect x="14" y="11" width="9" height="18"/><path d="M23 20h14"/><path d="M23 15l12-7"/><path d="M23 25l12 7"/>') },
    { id: 'singularity', name: 'SINGULARITY CORE', cat: 'special', unlock: 30, price: 400, cost: 555, currency: 'bt',
      tagline: 'Deletes a zip code of hostiles.',
      stats: { dmg: 400, rate: 0.08, rng: 200, tgt: 'SINGULARITY / 12S' },
      special: '>> Collapses a black hole every 12s that consumes everything nearby.',
      icon: ic('<circle cx="20" cy="20" r="5.5" fill="currentColor" stroke="none"/><circle cx="20" cy="20" r="10.5" stroke-dasharray="3 3"/><path d="M33 8a17 17 0 0 1 3 12" stroke-dasharray="2 3"/><path d="M7 32a17 17 0 0 1-3-12" stroke-dasharray="2 3"/>') },
  ];

  let profile = { name: '', level: 1, xp: 0, xpNext: xpToNext(1), maxLevel: MAX_LEVEL, nc: 0, bt: 0, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'] };
  const MAX_BAYS = 5;
  let container = null;
  let filter = 'all';
  let armed = null;
  let armedTimer = 0;

  const towerById = (id) => TOWERS.find((entry) => entry.id === id);
  const format = (value) => Number(value || 0).toLocaleString('en-US');

  function setProfile(next) {
    const before = profile.level;
    profile = { ...profile, ...next };
    profile.xpNext = xpToNext(profile.level);
    // A loadout may only ever reference blueprints the commander owns.
    profile.loadout = (Array.isArray(profile.loadout) ? profile.loadout : [])
      .map(String).filter((id, index, list) => list.indexOf(id) === index && profile.owned.includes(id)).slice(0, MAX_BAYS);
    if (!profile.loadout.length && profile.owned.length) profile.loadout = [profile.owned[0]];
    if (profile.level > before) {
      showToast(`CLEARANCE LEVEL UP — LV ${profile.level} UNLOCKED`);
      playSound();
      const badge = container && container.querySelector('#shop-level-badge');
      if (badge) { badge.classList.remove('levelup'); void badge.offsetWidth; badge.classList.add('levelup'); }
    }
    if (container) repaint();
    if (typeof window.paintWallet === 'function') window.paintWallet();
  }

  function visibility(entry) {
    if (profile.owned.includes(entry.id)) return 'owned';
    if (profile.level >= entry.unlock) return 'buy';
    if (profile.level >= entry.unlock - HORIZON) return 'locked';
    return 'hidden';
  }

  function hiddenCount() {
    return TOWERS.filter((entry) => visibility(entry) === 'hidden').length;
  }

  // --- Deployment loadout: the blueprints carried into a mission -----------------
  function paintBays() {
    const wrap = container && container.querySelector('#ls-bays');
    if (!wrap) return;
    const bays = [0, 1, 2, 3, 4].map((index) => {
      const entry = (profile.loadout || [])[index] && towerById(profile.loadout[index]);
      if (!entry) return `<div class="ls-bay ls-empty"><small>BAY ${index + 1}</small><b>EMPTY</b><small>EQUIP BELOW</small></div>`;
      return `<div class="ls-bay filled cat-${entry.cat}"><small>BAY ${index + 1}</small><span class="ls-icon">${entry.icon}</span><b>${entry.name}</b><small>$${entry.cost} SALVAGE IN MISSION</small></div>`;
    });
    wrap.innerHTML = bays.join('');
  }

  function toggleEquip(id) {
    const entry = towerById(id);
    if (!entry || !profile.owned.includes(id)) return;
    const spot = profile.loadout.indexOf(id);
    if (spot >= 0) {
      profile.loadout.splice(spot, 1);
    } else {
      if (profile.loadout.length >= MAX_BAYS) {
        playSound('alarm');
        showToast('Loadout full — all 5 bays are occupied. Unequip a blueprint first.');
        return;
      }
      profile.loadout.push(id);
    }
    playSound();
    persistLoadout();
    repaint();
  }

  async function persistLoadout() {
    try { localStorage.setItem('cbz-loadout', JSON.stringify(profile.loadout)); } catch { /* storage optional. */ }
    try {
      const data = await apiRequest('/api/loadout', { token: localStorage.getItem('cbz-token') || '', loadout: profile.loadout });
      const before = profile.level;
      profile = { ...profile, ...data.profile };
      profile.xpNext = xpToNext(profile.level);
      if (profile.level > before && typeof window.paintWallet === 'function') window.paintWallet();
    } catch { /* Offline: the local loadout still rides into the next mission. */ }
  }

  function meters(entry) {
    const caps = { dmg: 160, rate: 2.5, rng: 260 };
    const pct = (value, cap) => `${Math.max(3, Math.min(100, Math.round((value / cap) * 100)))}%`;
    return `
      <div class="tc-meter"><span>DMG</span><div class="tm-track"><i style="width:${pct(entry.stats.dmg, caps.dmg)}"></i></div><b>${entry.stats.dmg || '—'}</b></div>
      <div class="tc-meter"><span>RATE</span><div class="tm-track"><i style="width:${pct(entry.stats.rate, caps.rate)}"></i></div><b>${entry.stats.rate ? `${entry.stats.rate}/s` : '—'}</b></div>
      <div class="tc-meter"><span>RNG</span><div class="tm-track"><i style="width:${pct(entry.stats.rng, caps.rng)}"></i></div><b>${entry.stats.rng >= 999 ? 'INF' : entry.stats.rng || '—'}</b></div>`;
  }

  function cardHtml(entry) {
    const vis = visibility(entry);
    if (vis === 'locked') {
      return `
        <article class="tower-card state-locked cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">CLEARANCE ${entry.unlock}</span></div>
          <div class="tc-icon">${entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          <div class="tc-lock"><span>SIGNAL ENCRYPTED</span><b>LV ${entry.unlock}</b></div>
        </article>`;
    }
    const owned = vis === 'owned';
    const affordable = entry.currency === 'bt' ? profile.bt >= entry.price : profile.nc >= entry.price;
    return `
      <article class="tower-card state-${owned ? 'owned' : 'buy'} cat-${entry.cat}" data-id="${entry.id}">
        <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">${owned ? 'DEPLOYED' : `CLEARANCE ${entry.unlock}`}</span></div>
        <div class="tc-icon">${entry.icon}</div>
        <h4>${entry.name}</h4>
        <p class="tc-tagline">${entry.tagline}</p>
        <div class="tc-stats">${meters(entry)}</div>
        <div class="tc-target">${entry.stats.tgt}</div>
        <p class="tc-special">${entry.special}</p>
        ${owned ? `<button class="tc-equip${profile.loadout.includes(entry.id) ? ' on' : ''}" type="button" data-equip="${entry.id}">${profile.loadout.includes(entry.id) ? 'UNEQUIP FROM LOADOUT' : 'EQUIP TO LOADOUT'}</button>` : `<button class="tc-buy${affordable ? '' : ' cant'}" type="button" data-buy="${entry.id}"><i class="tok ${entry.currency === 'bt' ? 'tok-bt' : 'tok-nc'}">${entry.currency.toUpperCase()}</i>${format(entry.price)}</button>`}
      </article>`;
  }

  function render(target) {
    container = target;
    filter = 'all';
    armed = null;
    container.innerHTML = `
      <header class="shop-head">
        <div><span class="shop-kicker">// NEXUS MARKETPLACE</span><h3>BLUEPRINT EXCHANGE</h3></div>
        <span class="shop-horizon">DECRYPT HORIZON: 10 LV</span>
      </header>
      <div class="shop-wallet">
        <div class="shop-level">
          <div class="shop-level-badge" id="shop-level-badge"><b id="shop-level">${profile.level}</b><span>CLEARANCE</span></div>
          <div class="shop-xp"><div class="shop-xp-head"><span>CLEARANCE PROGRESS</span><span id="shop-xp-num"></span></div><div class="shop-xp-track"><i id="shop-xp-fill"></i></div></div>
        </div>
        <div class="shop-currencies">
          <div class="cur-chip cur-nc"><i class="tok tok-nc">NC</i><div><b id="shop-nc">0</b><span>NEXUS COINS</span></div></div>
          <div class="cur-chip cur-bt"><i class="tok tok-bt">BT</i><div><b id="shop-bt">0</b><span>BREACH TOKENS</span></div></div>
        </div>
      </div>
      <div class="loadout-strip" id="loadout-strip">
        <div class="ls-head"><span>// DEPLOYMENT LOADOUT</span><small>THE 5 BLUEPRINTS YOU CARRY INTO EVERY MISSION</small></div>
        <div class="ls-bays" id="ls-bays"></div>
      </div>
      <p class="shop-note">Nexus Coins flow from every wave, boss and cleared sector. <b>Breach Tokens</b> drop only from boss kills, flawless defenses and first clearances. New blueprints decrypt 10 clearance levels before they unlock — beyond that range, their signals stay hidden. Equipped blueprints deploy from the loadout bar in battle; towers you place claim a clearance box on the grid that blocks overlapping builds.</p>
      <div class="shop-tabs" id="shop-tabs"></div>
      <div class="shop-grid" id="shop-grid"></div>
      <div class="shop-encrypted" id="shop-encrypted" hidden></div>`;
    container.querySelector('#shop-tabs').innerHTML = Object.entries(CATEGORIES).map(([id, cat]) => `<button class="shop-tab${id === 'all' ? ' on' : ''}" type="button" data-cat="${id}">${cat.label}</button>`).join('');
    container.querySelector('#shop-tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('[data-cat]');
      if (!tab) return;
      filter = tab.dataset.cat;
      container.querySelectorAll('.shop-tab').forEach((el) => el.classList.toggle('on', el === tab));
      playSound();
      repaint();
    });
    container.querySelector('#shop-grid').addEventListener('click', onGridClick);
    repaint();
  }

  function repaint() {
    if (!container) return;
    const grid = container.querySelector('#shop-grid');
    if (!grid) return;
    paintBays();
    const list = TOWERS.filter((entry) => (filter === 'all' || entry.cat === filter) && visibility(entry) !== 'hidden');
    grid.innerHTML = list.map(cardHtml).join('');
    const level = container.querySelector('#shop-level');
    if (level) level.textContent = profile.level;
    const nc = container.querySelector('#shop-nc');
    if (nc) nc.textContent = format(profile.nc);
    const bt = container.querySelector('#shop-bt');
    if (bt) bt.textContent = format(profile.bt);
    const capped = profile.level >= MAX_LEVEL;
    const xpNum = container.querySelector('#shop-xp-num');
    const xpFill = container.querySelector('#shop-xp-fill');
    if (xpNum) xpNum.textContent = capped ? 'MAX CLEARANCE' : `${format(profile.xp)} / ${format(profile.xpNext)} XP`;
    if (xpFill) xpFill.style.width = capped ? '100%' : `${Math.min(100, Math.round((profile.xp / profile.xpNext) * 100))}%`;
    const encrypted = container.querySelector('#shop-encrypted');
    if (encrypted) {
      const count = hiddenCount();
      encrypted.hidden = count === 0;
      encrypted.innerHTML = `<span>▲</span> ${count} ENCRYPTED BLUEPRINT${count === 1 ? '' : 'S'} BEYOND DECRYPT HORIZON <span>▲</span>`;
    }
  }

  function onGridClick(event) {
    const equip = event.target.closest('[data-equip]');
    if (equip) { toggleEquip(equip.dataset.equip); return; }
    const button = event.target.closest('[data-buy]');
    if (!button) return;
    const entry = towerById(button.dataset.buy);
    if (!entry) return;
    const affordable = entry.currency === 'bt' ? profile.bt >= entry.price : profile.nc >= entry.price;
    if (!affordable) {
      playSound('alarm');
      const card = button.closest('.tower-card');
      if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      showToast(entry.currency === 'bt' ? 'Not enough Breach Tokens — only bosses and flawless runs pay those.' : 'Not enough Nexus Coins — clear more waves.');
      return;
    }
    if (armed !== entry.id) {
      armed = entry.id;
      button.classList.add('arm');
      button.textContent = 'CONFIRM PURCHASE?';
      clearTimeout(armedTimer);
      armedTimer = setTimeout(() => { armed = null; repaint(); }, 2600);
      return;
    }
    clearTimeout(armedTimer);
    armed = null;
    purchase(entry, button);
  }

  async function purchase(entry, button) {
    button.disabled = true;
    button.textContent = 'TRANSFERRING…';
    try {
      const data = await apiRequest('/api/shop/purchase', { token: localStorage.getItem('cbz-token') || '', itemId: entry.id });
      setProfile(data.profile);
      playSound();
      showToast(`ACQUIRED: ${entry.name} — added to your armory.`);
      const card = container && container.querySelector(`.tower-card[data-id="${entry.id}"]`);
      if (card) card.classList.add('bought');
    } catch (error) {
      playSound('alarm');
      showToast(error.message);
      repaint();
    }
  }

  async function submitMission(payload) {
    try {
      const data = await apiRequest('/api/mission/complete', { token: localStorage.getItem('cbz-token') || '', ...payload });
      setProfile(data.profile);
      return data;
    } catch {
      return null;
    }
  }

  return { render, setProfile, submitMission, profile: () => profile, loadout: () => (profile.loadout || []).map(towerById).filter(Boolean), TOWERS, xpToNext, HORIZON, MAX_LEVEL, MAX_BAYS };
})();
