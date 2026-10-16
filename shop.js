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

  // --- Blueprint catalog: 4 turret lines, each with ONE linear upgrade track ------
  // track: an ordered ladder of single improvements bought with salvage mid-mission.
  // Every tier's `sets` are absolute stat values applied on install (cumulative).
  const TOWERS = [
    { id: 'sentinel', name: 'SENTINEL TURRET', cat: 'offense', unlock: 1, price: 0, cost: 100, currency: 'nc',
      tagline: 'Rapid kinetic baseline — cheap, dependable, always ready.',
      stats: { dmg: 6, rate: 1.5, rng: 130, tgt: 'SINGLE / GROUND · AA ON PADS' },
      special: '>> The grid standard. Deploy on a hex pad to link anti-air coverage.',
      art: 'assets/towers/sentinel.png',
      track: [
        { label: 'HIGHER CALIBER', cost: 140, sets: { dmg: 11 }, info: 'DMG 6 → 11' },
        { label: 'BETTER TECH', cost: 210, sets: { rate: 1.8, rng: 145 }, info: 'RATE 1.5 → 1.8 · RNG 130 → 145' },
        { label: 'SENTINEL PROMOTION', cost: 350, sets: { dmg: 18, rng: 180 }, info: 'DMG 11 → 18 · RNG 145 → 180' },
      ],
      icon: ic('<path d="M9 33h22"/><path d="M13 33v-7h14v7"/><path d="M20 26V7"/><circle cx="20" cy="6" r="2.4"/>') },
    { id: 'lazermortar', name: 'LAZER MORTAR', cat: 'offense', unlock: 1, price: 0, cost: 250, currency: 'nc', reward: true,
      tagline: 'REWARD BLUEPRINT — beat Easy Mode to decrypt it.',
      stats: { dmg: 60, rate: 0.3, rng: 180, splash: 30, tgt: 'SPLASH 30U · AA ON PADS' },
      special: '>> Lazer shells detonate on impact for full damage inside the blast ring. Trophy chassis for clearing Easy Mode.',
      art: 'assets/towers/lazermortar.png',
      track: [
        { label: 'BETTER SCOPE', cost: 400, sets: { rng: 210, rate: 0.35 }, info: 'RNG 180 → 210 · RATE 0.3 → 0.35' },
        { label: 'HIGHLY EXPLOSIVE ROUNDS', cost: 500, sets: { splash: 60, dmg: 80 }, info: 'SPLASH 30 → 60 · DMG 60 → 80' },
        { label: 'TRUE MORTAR', cost: 1250, sets: { rate: 0.25, dmg: 100, splash: 65 }, info: 'RATE 0.35 → 0.25 · DMG 80 → 100 · SPLASH 60 → 65' },
        { label: 'USA FUNDING', cost: 2000, sets: { dmg: 140, rate: 0.2, rng: 245, splash: 70 }, info: 'DMG 100 → 140 · RATE 0.25 → 0.2 · RNG 210 → 245 · SPLASH 65 → 70' },
      ],
      icon: ic('<path d="M8 34h16"/><path d="M12 34L28 18"/><rect x="27" y="6" width="9" height="9" transform="rotate(45 31.5 10.5)"/><path d="M6 14a26 26 0 0 1 11-10" stroke-dasharray="3 4"/>') },
    { id: 'shotgunner', name: 'SHOTGUNNER', cat: 'offense', unlock: 3, price: { nc: 800, bt: 10 }, cost: 150, currency: 'mixed',
      tagline: 'Close-work scattergun — wide pellet bursts shred tight packs.',
      stats: { dmg: 30, rate: 0.8, rng: 100, splash: 15, tgt: 'SPLASH 15U · GROUND · AA VIA SATELLITE' },
      special: '>> Pellet blasts hammer everything inside the burst ring. Tier-1 Satellite Comms unlocks anti-air without a hex pad.',
      art: 'assets/towers/shotgunner.png',
      track: [
        { label: 'SATELLITE COMMS', cost: 95, sets: { rng: 105, air: 'yes' }, info: 'RNG 100 → 105 · ANTI-AIR UNLOCKED — no pad needed' },
        { label: 'LARGER SHELLS', cost: 190, sets: { splash: 25 }, info: 'SPLASH 15 → 25' },
        { label: 'HELL SHELLS', cost: 290, sets: { splash: 30, dmg: 40 }, info: 'SPLASH 25 → 30 · DMG 30 → 40' },
        { label: 'EXPERT TRAINING', cost: 350, sets: { rate: 1, rng: 120, dmg: 45 }, info: 'RATE 0.8 → 1 · RNG 105 → 120 · DMG 40 → 45' },
      ],
      icon: ic('<path d="M7 33l12-12"/><path d="M12 35L24 23"/><path d="M24 23l5-5"/><circle cx="31" cy="12" r="2.2"/><circle cx="35" cy="17" r="2.2"/><circle cx="27" cy="7" r="1.8"/>') },
    { id: 'virus', name: 'VIRUS', cat: 'special', unlock: 1, price: { nc: 1000, bt: 30 }, cost: 400, currency: 'mixed',
      tagline: 'Melee swarm chassis — blades that feast at contact range.',
      stats: { dmg: 7, rate: 3, rng: 90, tgt: 'MELEE / GROUND + AIR' },
      special: '>> Shreds anything that steps into blade range — walkers and flyers alike.',
      art: 'assets/towers/virus.png',
      track: [
        { label: 'LARGER BLADES', cost: 500, sets: { dmg: 14, rate: 2.7, rng: 100 }, info: 'DMG 7 → 14 · RATE 3 → 2.7 · RNG 90 → 100' },
        { label: 'SUPER VIRUS', cost: 700, sets: { dmg: 18, rate: 3.2, rng: 105 }, info: 'DMG 14 → 18 · RATE 2.7 → 3.2 · RNG 100 → 105' },
        { label: 'MALWARE VIRUS', cost: 1400, sets: { rate: 3.5, rng: 110, dmg: 30 }, info: 'DMG 18 → 30 · RATE 3.2 → 3.5 · RNG 105 → 110' },
      ],
      icon: ic('<circle cx="20" cy="21" r="7"/><path d="M20 14V6"/><path d="M20 6l-4 3M20 6l4 3"/><path d="M14 25l-7 5"/><path d="M26 25l7 5"/><circle cx="20" cy="21" r="2.4" fill="currentColor" stroke="none"/>') },
  ];

  let profile = { name: '', level: 1, xp: 0, xpNext: xpToNext(1), maxLevel: MAX_LEVEL, nc: 0, bt: 0, firstClear: false, owned: ['sentinel'], loadout: ['sentinel'] };
  const MAX_BAYS = 5;

  // Dual-currency prices arrive as { nc, bt }; single-currency as a number.
  const priceOf = (entry) => (typeof entry.price === 'object' ? entry.price : { [entry.currency || 'nc']: entry.price || 0 });
  const canAfford = (entry) => {
    const cost = priceOf(entry);
    return profile.nc >= (cost.nc || 0) && profile.bt >= (cost.bt || 0);
  };
  const priceLabel = (entry) => {
    const cost = priceOf(entry);
    const parts = [];
    if (cost.nc) parts.push(`<i class="tok tok-nc">NC</i>${format(cost.nc)}`);
    if (cost.bt) parts.push(`<i class="tok tok-bt">BT</i>${format(cost.bt)}`);
    return parts.join(' ') || 'FREE';
  };
  // Tower decal art: generated portraits, one unique emblem per chassis.
  const artHtml = (entry) => (entry.art ? `<img class="tw-art" src="${entry.art}" alt="${entry.name} decal" loading="lazy" onerror="this.remove()">` : '');
  const trackHtml = (entry) => (!entry.track ? '' : `<div class="tc-track"><span class="tc-track-head">UPGRADE TRACK — ${entry.track.length} TIERS</span>${entry.track.map((tier, i) =>
    `<div class="tc-tier"><span>${String(i + 1).padStart(2, '0')}</span><b>${tier.label}</b><small>${tier.info}</small><em>$${format(tier.cost)}</em></div>`).join('')}</div>`);
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
    if (entry.reward && !profile.firstClear) return 'reward-locked';
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
      return `<div class="ls-bay filled cat-${entry.cat}"><small>BAY ${index + 1}</small><span class="ls-icon">${artHtml(entry) || entry.icon}</span><b>${entry.name}</b><small>$${entry.cost} SALVAGE IN MISSION</small></div>`;
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
    const caps = { dmg: 160, rate: 3.5, rng: 260 };
    const pct = (value, cap) => `${Math.max(3, Math.min(100, Math.round((value / cap) * 100)))}%`;
    const splash = entry.stats.splash ? `<div class="tc-meter"><span>SPLASH</span><div class="tm-track"><i style="width:${pct(entry.stats.splash, 80)}"></i></div><b>${entry.stats.splash}U</b></div>` : '';
    return `
      <div class="tc-meter"><span>DMG</span><div class="tm-track"><i style="width:${pct(entry.stats.dmg, caps.dmg)}"></i></div><b>${entry.stats.dmg || '—'}</b></div>
      <div class="tc-meter"><span>RATE</span><div class="tm-track"><i style="width:${pct(entry.stats.rate, caps.rate)}"></i></div><b>${entry.stats.rate ? `${entry.stats.rate}/s` : '—'}</b></div>
      <div class="tc-meter"><span>RNG</span><div class="tm-track"><i style="width:${pct(entry.stats.rng, caps.rng)}"></i></div><b>${entry.stats.rng >= 999 ? 'INF' : entry.stats.rng || '—'}</b></div>${splash}`;
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
          ${trackHtml(entry)}
          <div class="tc-lock"><span>SIGNAL ENCRYPTED</span><b>LV ${entry.unlock}</b></div>
        </article>`;
    }
    if (vis === 'reward-locked') {
      return `
        <article class="tower-card state-locked state-reward cat-${entry.cat}" data-id="${entry.id}">
          <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">REWARD BLUEPRINT</span></div>
          <div class="tc-icon">${entry.icon}</div>
          <h4>${entry.name}</h4>
          <p class="tc-tagline">${entry.tagline}</p>
          <div class="tc-stats">${meters(entry)}</div>
          <div class="tc-target">${entry.stats.tgt}</div>
          <p class="tc-special">${entry.special}</p>
          ${trackHtml(entry)}
          <div class="tc-lock"><span>MISSION REWARD</span><b>BEAT EASY MODE</b></div>
        </article>`;
    }
    const owned = vis === 'owned';
    const affordable = canAfford(entry);
    return `
      <article class="tower-card state-${owned ? 'owned' : 'buy'} cat-${entry.cat}" data-id="${entry.id}">
        <div class="tc-top"><span class="tc-cat">${CATEGORIES[entry.cat].label}</span><span class="tc-unlock">${owned ? 'DEPLOYED' : `CLEARANCE ${entry.unlock}`}</span></div>
        <div class="tc-icon">${artHtml(entry) || entry.icon}</div>
        <h4>${entry.name}</h4>
        <p class="tc-tagline">${entry.tagline}</p>
        <div class="tc-stats">${meters(entry)}</div>
        <div class="tc-target">${entry.stats.tgt}</div>
        <p class="tc-special">${entry.special}</p>
        ${trackHtml(entry)}
        ${owned ? `<button class="tc-equip${profile.loadout.includes(entry.id) ? ' on' : ''}" type="button" data-equip="${entry.id}">${profile.loadout.includes(entry.id) ? 'UNEQUIP FROM LOADOUT' : 'EQUIP TO LOADOUT'}</button>` : `<button class="tc-buy${affordable ? '' : ' cant'}" type="button" data-buy="${entry.id}">${priceLabel(entry)}</button>`}
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
        <div class="ls-head"><span>// DEPLOYMENT LOADOUT</span><small>THE 3 BLUEPRINTS YOU CARRY INTO EVERY MISSION</small></div>
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
    if (!canAfford(entry)) {
      playSound('alarm');
      const card = button.closest('.tower-card');
      if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
      showToast('Not enough Nexus Coins / Breach Tokens for that blueprint.');
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

  // Salvage-code redemption — server route + LOCAL mirror share the same contract.
  // Codes validate server-side (and in LOCAL mode) against a one-time-per-commander
  // ledger, so there is no admin surface to abuse.
  async function redeemCode(code) {
    const data = await apiRequest('/api/redeem', { token: localStorage.getItem('cbz-token') || '', code });
    setProfile(data.profile);
    return data.granted || null;
  }

  return { render, setProfile, submitMission, redeemCode, profile: () => profile, loadout: () => (profile.loadout || []).map(towerById).filter(Boolean), TOWERS, xpToNext, HORIZON, MAX_LEVEL, MAX_BAYS };
})();
