// Core Breach: Zero — Combat Protocol (Easy Mode).
// Loaded after app.js: uses its globals (BATTLE_MAPS, svgNode, playSound, showToast...).
// Mode voting + 15-wave Easy layout + enemies that follow every map's tracks and mechanics.
(() => {
const board = document.querySelector('#board');
const battlefield = document.querySelector('#battlefield');

// --- Enemy roster (Easy Mode) ---------------------------------------------------
const ENEMY_TYPES = {
  glitched: { name: 'GLITCHED BIT', tag: 'NORMAL', hp: 15, speed: 95, size: 9, bounty: 4, dmg: 1, color: '#70e1d0', ability: 'None — cheap fodder that arrives in numbers.' },
  runner: { name: 'DATA RUNNER', tag: 'FAST', hp: 10, speed: 140, size: 8, bounty: 6, dmg: 1, color: '#a5d58b', ability: 'Very fast — outruns reaction time.' },
  file: { name: 'CORRUPTED FILE', tag: 'SWARM', hp: 8, speed: 70, size: 6, bounty: 2, dmg: 1, color: '#c49bef', ability: 'Spawns in dense clusters.' },
  shielded: { name: 'SHIELDED BYTE', tag: 'ARMORED', hp: 45, speed: 45, size: 11, bounty: 12, dmg: 1, color: '#8fb7c9', armor: 0.2, ability: 'Armor plating absorbs 20% of incoming damage.' },
  drone: { name: 'OVERCLOCKED DRONE', tag: 'FLYING', hp: 25, speed: 100, size: 10, bounty: 10, dmg: 1, color: '#ffb45a', flying: true, ability: 'Air unit — hovers over ground defenses.' },
  nullcore: { name: 'NULL CORE', tag: 'TANK', hp: 150, speed: 32, size: 14, bounty: 25, dmg: 2, color: '#7f8fa0', ability: 'Dense hull soaks heavy damage.' },
  virus: { name: 'SYSTEM VIRUS', tag: 'MINI-BOSS', hp: 600, speed: 55, size: 20, bounty: 150, dmg: 5, color: '#ff5e7a', boss: true, ability: 'Malware Pulse — emits a stunning shockwave every 8s.' },
  leak: { name: 'MEMORY LEAK', tag: 'MINI-BOSS', hp: 1200, speed: 38, size: 22, bounty: 300, dmg: 5, color: '#ffb45a', boss: true, ability: 'Replication — spills 6 Corrupted Files at 50% HP.' },
  overseer: { name: 'CORE BREACH: ZERO', tag: 'FINAL BOSS', hp: 3500, speed: 30, size: 26, bounty: 1000, dmg: 20, color: '#ff4d5e', boss: true, shield: 300, ability: 'Overheat — shockwave disables a tower for 4s. Shielding Matrix — gains a 300 HP shield at 25% HP.' },
};

// --- Easy Mode: 15 waves, 3 boss encounters --------------------------------------
const EASY_WAVES = [
  { groups: [['glitched', 10]] },
  { groups: [['glitched', 15], ['runner', 4]] },
  { groups: [['glitched', 12], ['runner', 8], ['file', 6]] },
  { groups: [['shielded', 10], ['glitched', 10]] },
  { groups: [['runner', 20], ['shielded', 8], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 8], ['glitched', 12]], phase: 'AIR DEBUT' },
  { groups: [['shielded', 15], ['drone', 12]] },
  { groups: [['nullcore', 3], ['file', 20]] },
  { groups: [['nullcore', 5], ['drone', 12], ['runner', 15]] },
  { groups: [['shielded', 8], ['nullcore', 4], ['leak', 1]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 30], ['runner', 10]], phase: 'SWARM SURGE' },
  { groups: [['nullcore', 8], ['drone', 15]] },
  { groups: [['virus', 1], ['leak', 1], ['shielded', 10]], phase: 'DOUBLE TROUBLE' },
  { groups: [['nullcore', 12], ['drone', 20], ['glitched', 25]] },
  { groups: [['shielded', 15], ['nullcore', 8], ['overseer', 1]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];
const SPAWN_GAP = { file: 0.34, glitched: 0.6, runner: 0.5, shielded: 0.8, drone: 0.75, nullcore: 1.5, virus: 2, leak: 2, overseer: 2.2 };
const BASE_MAX = 100;

// --- Mission state ----------------------------------------------------------------
const state = {
  mode: 'idle', // idle | vote | countdown | waves | over
  map: null, samplers: [], gateEvents: [], zoneRanges: [],
  waveIndex: -1, queue: [], spawnGap: 0, intermission: 0, countdown: 0,
  cash: 0, baseHp: BASE_MAX, enemies: [], kills: 0, earned: 0, clock: 0,
  roomVote: null, raf: 0, last: 0,
  hud: null, bossBar: null, tip: null, tipTarget: null, votePanel: null, endPanel: null, banner: null,
  layers: null, deployBtn: null,
};

const debugWave = Number(new URLSearchParams(location.search).get('cbzwave') || 0);
const debugCash = Number(new URLSearchParams(location.search).get('cash') || 0);
const debugFreeze = new URLSearchParams(location.search).has('freeze');

// --- Track engine: sample every SVG path once, then move by arc length -------------
function buildSamplers(map) {
  return map.paths.map((d) => {
    const el = svgNode('path', { d });
    const len = el.getTotalLength();
    const step = 2;
    const pts = [];
    for (let l = 0; l <= len; l += step) {
      const p = el.getPointAtLength(l);
      pts.push([p.x, p.y]);
    }
    return { pts, len, step, at(dist) { return pts[Math.min(pts.length - 1, Math.max(0, Math.round(dist / step)))]; } };
  });
}

function nearestDist(sampler, x, y) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < sampler.pts.length; i++) {
    const dx = sampler.pts[i][0] - x;
    const dy = sampler.pts[i][1] - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { dist: best * sampler.step, err: Math.sqrt(bestD) };
}

function prepMechanics(map, samplers) {
  // Phase gates: teleport an enemy once, from its position on one track to another track.
  state.gateEvents = (map.gates || []).map((gate, index) => {
    let from = null;
    let to = null;
    samplers.forEach((sampler, pathIdx) => {
      const a = nearestDist(sampler, gate.x, gate.y);
      const b = nearestDist(sampler, gate.toX, gate.toY);
      if (a.err < 30 && (from === null || a.dist < from.dist)) from = { pathIdx, dist: a.dist };
      if (b.err < 30 && (to === null || b.dist < to.dist)) to = { pathIdx, dist: b.dist };
    });
    return { index, gate, from, to };
  }).filter((event) => event.from && event.to);
  // Overcharge zones: haste fields that speed enemies up while inside the ring.
  state.zoneRanges = [];
  (map.zones || []).forEach((zone) => {
    samplers.forEach((sampler, pathIdx) => {
      let open = false;
      let start = 0;
      for (let i = 0; i < sampler.pts.length; i++) {
        const [x, y] = sampler.pts[i];
        const inside = (x - zone.x) ** 2 + (y - zone.y) ** 2 <= zone.r * zone.r;
        if (inside && !open) { open = true; start = i * sampler.step; }
        if (!inside && open) { open = false; state.zoneRanges.push({ pathIdx, a: start, b: i * sampler.step }); }
      }
      if (open) state.zoneRanges.push({ pathIdx, a: start, b: sampler.len });
    });
  });
}

function inHasteZone(pathIdx, dist) {
  return state.zoneRanges.some((r) => r.pathIdx === pathIdx && dist >= r.a && dist <= r.b);
}

// --- Enemy visuals: one distinct silhouette per archetype ---------------------------
function shapeFor(key, t) {
  const nodes = [];
  const add = (name, attrs, text) => nodes.push(svgNode(name, attrs, text));
  if (key === 'glitched') {
    add('rect', { class: 'e-ghost', x: -8, y: -9, width: 7, height: 5 });
    add('rect', { class: 'e-ghost e-ghost-2', x: 2, y: 5, width: 6, height: 4 });
    add('rect', { class: 'e-body', x: -6, y: -6, width: 12, height: 12 });
    add('rect', { class: 'e-core', x: -2, y: -2, width: 4, height: 4 });
  } else if (key === 'runner') {
    add('line', { class: 'e-trail', x1: -22, y1: 0, x2: -9, y2: 0 });
    add('polygon', { class: 'e-body', points: '11,0 -7,6 -3,0 -7,-6' });
  } else if (key === 'file') {
    add('polygon', { class: 'e-body', points: '0,-6 5,3 -5,3' });
    add('polygon', { class: 'e-ghost', points: '5,3 10,9 2,8' });
    add('polygon', { class: 'e-ghost e-ghost-2', points: '-6,2 -11,7 -3,9' });
  } else if (key === 'shielded') {
    add('circle', { class: 'e-ghost', r: 14 });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 10) });
    add('rect', { class: 'e-core', x: -3, y: -3, width: 6, height: 6 });
  } else if (key === 'drone') {
    add('g', { class: 'e-rotor-wrap' }, '');
    const rotor = nodes[nodes.length - 1];
    rotor.appendChild(svgNode('line', { class: 'e-rotor', x1: -12, y1: 0, x2: 12, y2: 0 }));
    rotor.appendChild(svgNode('line', { class: 'e-rotor', x1: 0, y1: -12, x2: 0, y2: 12 }));
    add('circle', { class: 'e-body', r: 6 });
    add('circle', { class: 'e-core', r: 2.5 });
  } else if (key === 'nullcore') {
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 17) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 13) });
    add('line', { class: 'e-plate', x1: -7, y1: -7, x2: 7, y2: 7 });
    add('line', { class: 'e-plate', x1: 7, y1: -7, x2: -7, y2: 7 });
    add('circle', { class: 'e-core', r: 3 });
  } else if (key === 'virus') {
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      add('line', { class: 'e-spike', x1: Math.cos(a) * 10, y1: Math.sin(a) * 10, x2: Math.cos(a) * 19, y2: Math.sin(a) * 19 });
    }
    add('circle', { class: 'e-body', r: 11 });
    add('circle', { class: 'e-core', r: 4.5 });
  } else if (key === 'leak') {
    add('circle', { class: 'e-drip e-drip-2', cx: 12, cy: 10, r: 4 });
    add('circle', { class: 'e-drip', cx: -10, cy: 12, r: 3 });
    add('circle', { class: 'e-body', r: 14 });
    add('circle', { class: 'e-core', r: 6 });
  } else if (key === 'overseer') {
    add('circle', { class: 'e-orbit', r: 24 });
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 19) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 14) });
    add('circle', { class: 'e-core', r: 5.5 });
    add('circle', { class: 'e-shield-ring', r: 21 });
  } else {
    add('circle', { class: 'e-body', r: t.size });
  }
  return nodes;
}

// --- Spawning / damage / death -------------------------------------------------------
function spawnEnemy(key, pathIdx) {
  const t = ENEMY_TYPES[key];
  const g = svgNode('g', { class: `enemy e-${key}${t.boss ? ' e-boss' : ''}` });
  for (const node of shapeFor(key, t)) g.appendChild(node);
  const barY = -(t.size + 13);
  const barW = t.boss ? 34 : 22;
  g.appendChild(svgNode('rect', { class: 'hp-bg', x: -barW / 2, y: barY, width: barW, height: 3.4 }));
  const fill = svgNode('rect', { class: 'hp-fill', x: -barW / 2, y: barY, width: barW, height: 3.4 });
  g.appendChild(fill);
  const shieldFill = svgNode('rect', { class: 'shield-fill', x: -barW / 2, y: barY - 4, width: 0, height: 2.4 });
  g.appendChild(shieldFill);
  const enemy = {
    key, t, node: g, fill, shieldFill,
    hp: t.hp, maxHp: t.hp, shield: 0, maxShield: t.shield || 0,
    pathIdx, dist: debugFreeze ? 260 + Math.random() * 480 : 0, speed: t.speed, alive: true,
    usedGates: new Set(), pulseTimer: 8, replicated: false, shielded: false, angle: 0,
  };
  g.addEventListener('pointerenter', (event) => showTip(enemy, event));
  g.addEventListener('pointermove', moveTip);
  g.addEventListener('pointerleave', () => hideTip(enemy));
  state.layers.enemies.appendChild(g);
  state.enemies.push(enemy);
  const [x, y] = state.samplers[pathIdx].at(enemy.dist);
  g.setAttribute('transform', `translate(${x} ${y})`);
  g.classList.add('spawn-in');
  setTimeout(() => g.classList.remove('spawn-in'), 420);
  if (t.boss) { banner(t.name, '// HOSTILE COMMANDER DETECTED', 'banner-red'); updateBossBar(); }
  return enemy;
}

function damageEnemy(enemy, amount) {
  let left = amount * (1 - (enemy.t.armor || 0));
  if (enemy.shield > 0) {
    const absorbed = Math.min(enemy.shield, left);
    enemy.shield -= absorbed;
    left -= absorbed;
  }
  enemy.hp = Math.max(0, enemy.hp - left);
  if (enemy.key === 'leak' && !enemy.replicated && enemy.hp <= enemy.maxHp / 2) replicateLeak(enemy);
  if (enemy.key === 'overseer' && !enemy.shielded && enemy.hp <= enemy.maxHp * 0.25) {
    enemy.shielded = true;
    enemy.shield = enemy.maxShield;
    enemy.node.querySelector('.e-shield-ring').classList.add('on');
    fxRing(...posOf(enemy), 'fx-ring-white');
  }
  if (enemy.hp <= 0) killEnemy(enemy);
  else paintBars(enemy);
}

function paintBars(enemy) {
  const barW = enemy.t.boss ? 34 : 22;
  enemy.fill.setAttribute('width', (barW * enemy.hp) / enemy.maxHp);
  enemy.fill.classList.toggle('low', enemy.hp / enemy.maxHp < 0.35);
  enemy.shieldFill.setAttribute('width', enemy.maxShield ? (barW * enemy.shield) / enemy.maxShield : 0);
}

function killEnemy(enemy) {
  if (!enemy.alive) return;
  enemy.alive = false;
  hideTip(enemy);
  state.cash += enemy.t.bounty;
  state.earned += enemy.t.bounty;
  state.kills += 1;
  const [x, y] = posOf(enemy);
  floatText(x, y - enemy.t.size - 6, `+$${enemy.t.bounty}`, 'cash-float');
  fxRing(x, y, 'fx-ring-red');
  enemy.node.classList.add('dying');
  setTimeout(() => enemy.node.remove(), 300);
  updateHud();
  if (enemy.t.boss) updateBossBar();
}

function replicateLeak(enemy) {
  enemy.replicated = true;
  const [x, y] = posOf(enemy);
  fxRing(x, y, 'fx-ring-amber');
  for (let i = 0; i < 6; i++) {
    const spawn = spawnEnemy('file', enemy.pathIdx);
    spawn.dist = Math.min(state.samplers[enemy.pathIdx].len - 8, Math.max(0, enemy.dist - 18 + i * 7));
  }
  banner('MEMORY LEAK', '// REPLICATION — HOSTILES SPILLED', 'banner-red');
}

function leakEnemy(enemy) {
  enemy.alive = false;
  hideTip(enemy);
  enemy.node.remove();
  state.baseHp = Math.max(0, state.baseHp - enemy.t.dmg);
  board.classList.remove('core-hit');
  void board.offsetWidth;
  board.classList.add('core-hit');
  setTimeout(() => board.classList.remove('core-hit'), 550);
  floatText(...corePos(), `-${enemy.t.dmg} CORE`, 'core-float');
  updateHud();
  if (enemy.t.boss) updateBossBar();
  if (state.baseHp <= 0 && state.mode === 'waves') endMission(false);
}

function posOf(enemy) {
  return state.samplers[enemy.pathIdx].at(enemy.dist);
}

function corePos() {
  return [state.map.core.x, state.map.core.y];
}

// --- FX -------------------------------------------------------------------------------
function fxRing(x, y, cls) {
  const ring = svgNode('circle', { class: `fx-ring ${cls}`, cx: x, cy: y, r: 6 });
  state.layers.fx.appendChild(ring);
  setTimeout(() => ring.remove(), 650);
}

function floatText(x, y, text, cls) {
  const label = svgNode('text', { class: `float-text ${cls}`, x, y, 'text-anchor': 'middle' }, text);
  state.layers.fx.appendChild(label);
  setTimeout(() => label.remove(), 950);
}

// --- Main loop ------------------------------------------------------------------------
function tick(ts) {
  state.raf = requestAnimationFrame(tick);
  const dt = Math.min(0.05, (ts - state.last) / 1000 || 0);
  state.last = ts;
  state.clock += dt;
  if (state.mode === 'countdown') {
    state.countdown -= dt;
    const n = Math.ceil(state.countdown);
    if (n !== state.lastCount && n > 0) { state.lastCount = n; banner(String(n), '// DEPLOYING', 'banner-count'); playSound(); }
    if (state.countdown <= 0) beginWave(debugWave > 0 ? Math.min(14, debugWave - 1) : 0);
  }
  if (state.mode === 'waves') runWaves(dt);
  for (const enemy of state.enemies) if (enemy.alive) moveEnemy(enemy, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
}

function moveEnemy(enemy, dt) {
  if (debugFreeze || state.mode !== 'waves') return;
  const haste = inHasteZone(enemy.pathIdx, enemy.dist) ? 1.3 : 1;
  enemy.node.classList.toggle('e-haste', haste > 1);
  if (enemy.t.boss && enemy.key === 'virus') {
    enemy.pulseTimer -= dt;
    if (enemy.pulseTimer <= 0) { enemy.pulseTimer = 8; fxRing(...posOf(enemy), 'fx-ring-virus'); }
  }
  enemy.dist += enemy.speed * haste * dt;
  const sampler = state.samplers[enemy.pathIdx];
  for (const event of state.gateEvents) {
    if (enemy.usedGates.has(event.index)) continue;
    if (event.from.pathIdx === enemy.pathIdx && enemy.dist >= event.from.dist) {
      const [gx, gy] = [event.gate.x, event.gate.y];
      fxRing(gx, gy, 'fx-ring-gate');
      enemy.pathIdx = event.to.pathIdx;
      enemy.dist = event.to.dist + 2;
      enemy.usedGates.add(event.index);
      fxRing(event.gate.toX, event.gate.toY, 'fx-ring-gate');
      playSound('hover');
      return moveEnemy(enemy, 0);
    }
  }
  if (enemy.dist >= sampler.len) { leakEnemy(enemy); return; }
  const [x, y] = sampler.at(enemy.dist);
  const [px, py] = sampler.at(Math.max(0, enemy.dist - 6));
  const angle = (Math.atan2(y - py, x - px) * 180) / Math.PI;
  if (Math.abs(angle - enemy.angle) > 1) enemy.angle = angle;
  enemy.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})${enemy.key === 'runner' ? ` rotate(${enemy.angle.toFixed(1)})` : ''}`);
}

function runWaves(dt) {
  if (state.queue.length) {
    state.spawnGap -= dt;
    if (state.spawnGap <= 0) {
      const key = state.queue.shift();
      const enemy = spawnEnemy(key, state.spawnSide++ % state.samplers.length);
      state.spawnGap = SPAWN_GAP[key] || 0.8;
      paintBars(enemy);
    }
  } else if (!state.enemies.some((enemy) => enemy.alive) && state.intermission <= 0) {
    const bonus = 25 + (state.waveIndex + 1) * 5;
    state.cash += bonus;
    state.earned += bonus;
    const cleared = state.waveIndex + 1;
    if (cleared >= EASY_WAVES.length) { endMission(true); return; }
    banner(`WAVE ${cleared} CLEARED`, `// +$${bonus} SALVAGE`, 'banner-green');
    playSound();
    state.intermission = 4.5;
    updateHud();
  }
  if (state.intermission > 0) {
    state.intermission -= dt;
    if (state.intermission <= 0) beginWave(state.waveIndex + 1);
  }
}

function beginWave(index) {
  state.mode = 'waves';
  state.waveIndex = index;
  const wave = EASY_WAVES[index];
  const queue = [];
  const bosses = [];
  for (const [key, count] of wave.groups) {
    for (let i = 0; i < count; i++) (ENEMY_TYPES[key].boss ? bosses : queue).push(key);
  }
  const at = Math.floor(queue.length * 0.45);
  bosses.forEach((key, i) => queue.splice(at + i, 0, key));
  state.queue = queue;
  state.spawnGap = 0;
  state.spawnSide = 0;
  banner(`WAVE ${String(index + 1).padStart(2, '0')} / ${EASY_WAVES.length}`, wave.phase ? `// ${wave.phase}` : '// HOSTILES INBOUND', 'banner-wave');
  updateHud();
}

// --- Combat HUD -----------------------------------------------------------------------
function ensureHud() {
  if (!state.hud) {
    state.hud = document.createElement('div');
    state.hud.className = 'combat-hud';
    state.hud.innerHTML = `
      <div class="hud-block hud-wave"><span class="hud-label">WAVE</span><strong id="combat-wave">—</strong></div>
      <div class="hud-block hud-base"><span class="hud-label">BASE INTEGRITY</span><div class="base-track"><div class="base-fill" id="base-fill"></div></div><b id="base-num">100</b></div>
      <div class="hud-block hud-cash"><span class="hud-label">SALVAGE</span><strong id="combat-cash">$0</strong></div>`;
    if (!state.bossBar) {
      state.bossBar = document.createElement('div');
      state.bossBar.className = 'boss-bar';
      state.bossBar.hidden = true;
      state.bossBar.innerHTML = `<span class="hud-label" id="boss-name">BOSS</span><div class="boss-track"><div class="boss-fill" id="boss-fill"></div><div class="boss-shield" id="boss-shield"></div></div>`;
      battlefield.appendChild(state.bossBar);
    }
  }
  const exit = document.querySelector('#exit-battle');
  const deploy = document.querySelector('#deploy-mission');
  state.deployBtn = deploy;
  exit.textContent = 'ABORT MISSION';
  exit.classList.add('aborting');
  deploy.hidden = true;
  document.querySelector('.field-hud').insertBefore(state.hud, exit);
}

function updateHud() {
  if (!state.hud) return;
  document.querySelector('#combat-wave').textContent = state.waveIndex < 0 ? '—' : `${String(state.waveIndex + 1).padStart(2, '0')}/${EASY_WAVES.length}`;
  document.querySelector('#combat-cash').textContent = `$${state.cash}`;
  const fill = document.querySelector('#base-fill');
  fill.style.width = `${(state.baseHp / BASE_MAX) * 100}%`;
  fill.classList.toggle('warn', state.baseHp <= 60);
  fill.classList.toggle('crit', state.baseHp <= 30);
  document.querySelector('#base-num').textContent = Math.round(state.baseHp);
}

function updateBossBar() {
  const boss = state.enemies.find((enemy) => enemy.alive && enemy.t.boss);
  if (!boss) { state.bossBar.hidden = true; return; }
  state.bossBar.hidden = false;
  document.querySelector('#boss-name').textContent = `${boss.t.tag} // ${boss.t.name}`;
  document.querySelector('#boss-fill').style.width = `${(boss.hp / boss.maxHp) * 100}%`;
  document.querySelector('#boss-shield').style.width = boss.maxShield ? `${(boss.shield / boss.maxShield) * 25}%` : '0%';
}

// --- Enemy hover tooltip ----------------------------------------------------------------
function ensureTip() {
  if (state.tip) return;
  state.tip = document.createElement('div');
  state.tip.className = 'enemy-tip';
  state.tip.hidden = true;
  battlefield.appendChild(state.tip);
}

function showTip(enemy, event) {
  ensureTip();
  state.tipTarget = enemy;
  const t = enemy.t;
  const armor = t.armor ? `${Math.round(t.armor * 100)}% PLATE` : 'NONE';
  state.tip.innerHTML = `
    <div class="tip-head"><b>${t.name}</b><span class="tip-tag">${t.tag}</span></div>
    <div class="tip-hp"><div class="tip-hp-track"><div class="tip-hp-fill" style="width:${(enemy.hp / enemy.maxHp) * 100}%"></div></div><span>${Math.ceil(enemy.hp)}/${enemy.maxHp} HP${enemy.shield > 0 ? ` +${Math.ceil(enemy.shield)} SHLD` : ''}</span></div>
    <div class="tip-rows">
      <div><span>SPEED</span><b>${t.speed >= 120 ? 'VERY FAST' : t.speed >= 90 ? 'FAST' : t.speed >= 60 ? 'AVERAGE' : t.speed >= 40 ? 'SLOW' : 'VERY SLOW'}</b></div>
      <div><span>ARMOR</span><b>${armor}</b></div>
      <div><span>CORE DMG</span><b>${t.dmg}</b></div>
      <div><span>BOUNTY</span><b>$${t.bounty}</b></div>
    </div>
    <p class="tip-ability">${t.ability}</p>`;
  state.tip.hidden = false;
  moveTip(event);
}

function moveTip(event) {
  if (!state.tip || state.tip.hidden) return;
  const pad = 16;
  const x = event ? event.clientX : state.mouseX || 100;
  const y = event ? event.clientY : state.mouseY || 100;
  state.mouseX = x;
  state.mouseY = y;
  const wide = state.tip.offsetWidth || 240;
  state.tip.style.left = `${Math.min(window.innerWidth - wide - 10, x + pad)}px`;
  state.tip.style.top = `${Math.max(10, y - state.tip.offsetHeight - pad)}px`;
}

function hideTip(enemy) {
  if (!state.tip || (enemy && state.tipTarget !== enemy)) return;
  state.tip.hidden = true;
  state.tipTarget = null;
}

// --- Banners ---------------------------------------------------------------------------
function banner(title, sub, cls) {
  if (!state.banner) {
    state.banner = document.createElement('div');
    state.banner.className = 'wave-banner';
    battlefield.appendChild(state.banner);
  }
  state.banner.className = `wave-banner ${cls || 'banner-wave'}`;
  state.banner.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
  void state.banner.offsetWidth;
  state.banner.classList.add('show');
  clearTimeout(state.bannerTimer);
  state.bannerTimer = setTimeout(() => state.banner.classList.remove('show'), 2100);
}

// --- Mode vote (EASY live, everything else coming soon) ---------------------------------
const MODES = [
  { id: 'easy', label: 'EASY', sub: '15 WAVES // 3 BOSSES', ready: true },
  { id: 'medium', label: 'MEDIUM', sub: 'JUNCTION PRESSURE', ready: false },
  { id: 'hard', label: 'HARD', sub: 'DUAL LANE SIEGE', ready: false },
  { id: 'insane', label: 'INSANE', sub: 'SPIRAL OVERDRIVE', ready: false },
  { id: 'cbz', label: 'CBZ', sub: 'PHASE GRID PROTOCOL', ready: false },
];

function showVote(context) {
  closeVote();
  state.mode = 'vote';
  state.roomVote = context === 'room' ? { votes: {}, myId: myPlayerId, playerCount: roomPlayerCount } : null;
  const panel = document.createElement('div');
  panel.className = 'vote-overlay';
  panel.innerHTML = `
    <div class="vote-card">
      <div class="eyebrow">${context === 'room' ? `// SQUAD VOTE — ${roomPlayerCount} COMMANDERS` : '// SOLO DEPLOYMENT'}</div>
      <h2>CHOOSE COMBAT PROTOCOL</h2>
      <div class="mode-grid">${MODES.map((mode) => `
        <button class="mode-card${mode.ready ? '' : ' locked'}" type="button" data-mode="${mode.id}" ${mode.ready ? '' : 'disabled'}>
          <span class="mode-stamp">${mode.ready ? 'READY' : 'COMING SOON'}</span>
          <b>${mode.label}</b><small>${mode.sub}</small>
        </button>`).join('')}</div>
      <p class="vote-state" id="vote-state">${context === 'room' ? 'Waiting for both commanders to vote…' : 'Select a protocol to deploy.'}</p>
      <button class="inline-button" id="vote-cancel" type="button">CANCEL</button>
    </div>`;
  battlefield.appendChild(panel);
  state.votePanel = panel;
  panel.querySelector('#vote-cancel').addEventListener('click', () => { closeVote(); restoreRecon(); });
  panel.querySelectorAll('.mode-card:not(.locked)').forEach((card) => card.addEventListener('click', () => castVote(card.dataset.mode)));
  playSound();
}

function castVote(mode) {
  playSound();
  state.myVote = mode;
  if (state.roomVote) {
    state.roomVote.votes[state.roomVote.myId] = mode;
    lockVote(mode);
    sendToPeer({ type: 'game-vote', voter: state.roomVote.myId, mode });
    paintVotes();
    maybeLaunchRoom();
  } else {
    launchCombat(mode);
  }
}

function lockVote(mode) {
  const panel = state.votePanel;
  if (!panel) return;
  panel.querySelectorAll('.mode-card').forEach((card) => {
    card.classList.toggle('picked', card.dataset.mode === mode);
    card.disabled = true;
  });
  const line = panel.querySelector('#vote-state');
  if (line) line.textContent = state.roomVote
    ? `VOTE LOCKED: ${mode.toUpperCase()} — WAITING FOR SQUAD`
    : `PROTOCOL LOCKED: ${mode.toUpperCase()} — DEPLOYING…`;
  const cancel = panel.querySelector('#vote-cancel');
  if (cancel) cancel.hidden = true;
}

function paintVotes() {
  const panel = state.votePanel;
  if (!panel || !state.roomVote) return;
  const line = panel.querySelector('#vote-state');
  const parts = Array.from({ length: state.roomVote.playerCount }, (_, id) => {
    const vote = state.roomVote.votes[id];
    return `<span class="vote-chip${vote ? ' voted' : ''}">CMDR ${id + 1}: ${vote ? vote.toUpperCase() : 'VOTING…'}</span>`;
  });
  if (line) line.innerHTML = parts.join('');
}

function maybeLaunchRoom() {
  if (!state.roomVote || state.mode !== 'vote') return;
  const votes = Array.from({ length: state.roomVote.playerCount }, (_, id) => state.roomVote.votes[id]);
  if (votes.some((vote) => !vote)) return;
  const modes = new Set(votes);
  if (modes.size !== 1) {
    const line = state.votePanel && state.votePanel.querySelector('#vote-state');
    if (line) line.textContent = 'PROTOCOLS DO NOT MATCH // VOTE AGAIN';
    return;
  }
  launchCombat(votes[0]);
}

function closeVote() {
  if (state.votePanel) { state.votePanel.remove(); state.votePanel = null; }
}

// --- Mission lifecycle ------------------------------------------------------------------
function startMission(map, skipVote = false) {
  if (state.mode !== 'idle' && state.mode !== 'over') return;
  state.map = map;
  state.mode = 'vote';
  state.samplers = buildSamplers(map);
  prepMechanics(map, state.samplers);
  state.cash = debugCash;
  state.baseHp = BASE_MAX;
  state.enemies = [];
  state.kills = 0;
  state.earned = 0;
  state.waveIndex = -1;
  state.clock = 0;
  ensureLayers();
  ensureHud();
  ensureTip();
  updateHud();
  setStatus(`COMBAT PROTOCOL // ${map.name}`);
  if (skipVote) launchCombat('easy');
  else showVote(typeof myPlayerId === 'number' && (roomCode && peerConnected) ? 'room' : 'solo');
}

function launchCombat(mode) {
  closeVote();
  state.mode = 'countdown';
  state.countdown = 3.4;
  state.lastCount = 4;
  state.last = performance.now();
  state.raf = requestAnimationFrame(tick);
  playSound();
}

function restoreRecon() {
  state.mode = 'idle';
  const exit = document.querySelector('#exit-battle');
  exit.textContent = 'EXIT RECON';
  exit.classList.remove('aborting');
  if (state.deployBtn) state.deployBtn.hidden = false;
  if (state.hud) { state.hud.remove(); state.hud = null; }
  if (state.bossBar) state.bossBar.hidden = true;
  if (state.endPanel) { state.endPanel.remove(); state.endPanel = null; }
  if (state.layers) { state.layers.enemies.remove(); state.layers.fx.remove(); state.layers = null; }
  state.enemies = [];
  setStatus(myName ? `MAP RECON // ${state.map ? state.map.name : ''}` : 'MENU SYSTEM READY');
}

function endMission(win) {
  state.mode = 'over';
  cancelAnimationFrame(state.raf);
  closeVote();
  hideTip();
  const panel = document.createElement('div');
  panel.className = `mission-end ${win ? 'win' : 'lose'}`;
  panel.innerHTML = `
    <div class="end-card">
      <div class="eyebrow">${win ? '// PROTOCOL COMPLETE' : '// CORE LOST'}</div>
      <h2>${win ? 'SECTOR CLEARED' : 'CORE BREACHED'}</h2>
      <div class="end-stats">
        <div><span>OUTCOME</span><b>${win ? 'ALL 15 WAVES REPELLED' : `FELL ON WAVE ${state.waveIndex + 1}`}</b></div>
        <div><span>ELIMINATIONS</span><b>${state.kills}</b></div>
        <div><span>SALVAGE EARNED</span><b>$${state.earned}</b></div>
        <div><span>BASE INTEGRITY</span><b>${Math.round(state.baseHp)}/${BASE_MAX}</b></div>
        <div><span>MISSION TIME</span><b>${Math.floor(state.clock / 60)}:${String(Math.floor(state.clock % 60)).padStart(2, '0')}</b></div>
      </div>
      <div class="end-actions">
        <button class="inline-button" id="end-redeploy" type="button">${win ? 'RE-DEPLOY' : 'RETRY'}</button>
        <button class="inline-button" id="end-bay" type="button">RETURN TO BAY</button>
      </div>
    </div>`;
  battlefield.appendChild(panel);
  state.endPanel = panel;
  panel.querySelector('#end-redeploy').addEventListener('click', () => { panel.remove(); state.endPanel = null; resetBoard(); startMission(state.map); });
  panel.querySelector('#end-bay').addEventListener('click', () => { resetBoard(); restoreRecon(); openMenu('play'); });
  banner(win ? 'SECTOR CLEARED' : 'CORE BREACHED', win ? '// VICTORY TOKEN EARNED' : '// EVACUATE', win ? 'banner-green' : 'banner-red');
  playSound();
}

function resetBoard() {
  if (state.layers) { state.layers.enemies.remove(); state.layers.fx.remove(); }
  state.enemies = [];
  ensureLayers();
}

function ensureLayers() {
  board.querySelectorAll('.layer-enemies, .layer-fx').forEach((layer) => layer.remove());
  const enemies = svgNode('g', { class: 'layer-enemies' });
  const fx = svgNode('g', { class: 'layer-fx' });
  board.appendChild(enemies);
  board.appendChild(fx);
  state.layers = { enemies, fx };
}

function abort() {
  if (state.mode === 'idle') return;
  cancelAnimationFrame(state.raf);
  closeVote();
  if (state.endPanel) { state.endPanel.remove(); state.endPanel = null; }
  if (state.tip) state.tip.hidden = true;
  restoreRecon();
}

// --- Room sync ----------------------------------------------------------------------------
function sendToPeer(message) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function handleRoomMessage(message) {
  if (message.type === 'game-vote' && state.roomVote && state.mode === 'vote') {
    if (!Number.isInteger(message.voter) || message.voter < 0 || message.voter >= state.roomVote.playerCount) return;
    if (!MODES.some((mode) => mode.id === message.mode && mode.ready)) return;
    state.roomVote.votes[message.voter] = message.mode;
    paintVotes();
    maybeLaunchRoom();
  }
}

function peerLeft() {
  if (state.votePanel && state.roomVote) {
    closeVote();
    restoreRecon();
    showToast('The other commander left — vote cancelled.');
  }
}

window.CBZCombat = { startMission, abort, handleRoomMessage, peerLeft, offerRoomVote: () => { dialog.close(); openBattlefield('easy'); startMission(BATTLE_MAPS.easy); }, active: () => state.mode !== 'idle' };
})();
