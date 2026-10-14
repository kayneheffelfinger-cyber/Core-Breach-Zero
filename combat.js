// Core Breach: Zero — Combat Protocol (Easy Mode).
// Loaded after app.js: uses its globals (BATTLE_MAPS, svgNode, playSound, showToast...).
// Mode voting + 15-wave Easy layout + enemies that follow every map's tracks and mechanics.
(() => {
const board = document.querySelector('#board');
const battlefield = document.querySelector('#battlefield');

// --- Enemy roster (Easy Mode) ---------------------------------------------------
// Pace pass: speeds trimmed ~10% and every archetype now hits the core for a
// different amount — leaking a boss should hurt far more than losing one fodder bit.
const ENEMY_TYPES = {
  glitched: { name: 'GLITCHED BIT', tag: 'NORMAL', hp: 15, speed: 84, size: 9, bounty: 4, dmg: 1, color: '#70e1d0', ability: 'None — cheap fodder that arrives in numbers.' },
  runner: { name: 'DATA RUNNER', tag: 'FAST', hp: 10, speed: 124, size: 8, bounty: 6, dmg: 2, color: '#a5d58b', ability: 'Very fast — outruns reaction time.' },
  file: { name: 'CORRUPTED FILE', tag: 'SWARM', hp: 8, speed: 62, size: 6, bounty: 2, dmg: 1, color: '#c49bef', ability: 'Spawns in dense clusters.' },
  shielded: { name: 'SHIELDED BYTE', tag: 'ARMORED', hp: 45, speed: 40, size: 11, bounty: 12, dmg: 3, color: '#8fb7c9', armor: 0.2, ability: 'Armor plating absorbs 20% of incoming damage.' },
  drone: { name: 'OVERCLOCKED DRONE', tag: 'FLYING', hp: 25, speed: 88, size: 10, bounty: 10, dmg: 2, color: '#ffb45a', flying: true, ability: 'Air unit — flies a straight line to the core, ignoring tracks, gates and haste fields.' },
  nullcore: { name: 'NULL CORE', tag: 'TANK', hp: 150, speed: 28, size: 14, bounty: 25, dmg: 4, color: '#7f8fa0', ability: 'Dense hull soaks heavy damage.' },
  virus: { name: 'SYSTEM VIRUS', tag: 'MINI-BOSS', hp: 600, speed: 48, size: 20, bounty: 150, dmg: 6, color: '#ff5e7a', boss: true, ability: 'Malware Pulse — emits a stunning shockwave every 8s.' },
  leak: { name: 'MEMORY LEAK', tag: 'MINI-BOSS', hp: 1200, speed: 34, size: 22, bounty: 300, dmg: 8, color: '#ffb45a', boss: true, ability: 'Replication — spills 6 Corrupted Files at 50% HP.' },
  overseer: { name: 'CORE BREACH: ZERO', tag: 'FINAL BOSS', hp: 3500, speed: 27, size: 26, bounty: 1000, dmg: 25, color: '#ff4d5e', boss: true, shield: 300, ability: 'Overheat — shockwave disables a tower for 4s. Shielding Matrix — gains a 300 HP shield at 25% HP.' },
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
// Pace pass: wider spawn gaps so waves stream in instead of dumping all at once.
const SPAWN_GAP = { file: 0.45, glitched: 0.75, runner: 0.65, shielded: 1.0, drone: 0.95, nullcore: 1.85, virus: 2.5, leak: 2.5, overseer: 2.75 };
const BASE_MAX = 100;

// --- Foundry rules: free placement + clearance boxes ---------------------------------
const START_SALVAGE = 200;   // mission opening funds — enough to open with 2-3 bays
const FOOT_HALF = 24;        // clearance box is 48x48 around every placed unit
const SEP = 56;              // min axis distance between two unit centers (box + gap)
const CORE_CLEAR = 58;       // nothing deploys inside the reactor ring
const MAX_TOWERS = 30;       // command grid saturation guard
// air: 'no' = ground only, 'prefer' = flying first, 'yes' = anything
const TOWER_RULES = {
  sentinel: { air: 'no' }, arclance: { air: 'yes' }, plasmort: { air: 'no' }, railspire: { air: 'yes' },
  stingerpad: { air: 'prefer' }, teslacoil: { air: 'yes' }, flakstorm: { air: 'yes' }, pyrewell: { air: 'no' },
  quantum: { air: 'yes' }, phasedeca: { air: 'yes' }, singularity: { air: 'yes' },
  cryobeacon: { air: 'yes', aura: true }, nullbeacon: { air: 'yes', aura: true }, gravwell: { air: 'yes', aura: true },
  naniteweb: { aura: true }, scrapforge: { aura: true },
};

// --- Field modules: temporary per-tower upgrades bought with salvage mid-mission ------
// Modules live on the placed unit only: scrapped when it is sold, wiped when the
// mission ends. Nothing here touches the Nexus Shop, the loadout or the wallet.
const MAX_UP = 3;
const UPGRADE_TRACKS = {
  dmg: { label: 'DAMAGE', mult: 0.25, costK: 0.35 },
  rate: { label: 'FIRE RATE', mult: 0.15, costK: 0.3 },
  rng: { label: 'RANGE', mult: 0.12, costK: 0.25 },
};
const ATTACKER_TOWERS = new Set(['sentinel', 'arclance', 'plasmort', 'railspire', 'stingerpad', 'teslacoil', 'flakstorm', 'pyrewell', 'quantum', 'phasedeca', 'singularity']);

// --- Mission state ----------------------------------------------------------------
const state = {
  mode: 'idle', // idle | vote | countdown | waves | over
  map: null, samplers: [], gateEvents: [], zoneRanges: [],
  waveIndex: -1, queue: [], spawnGap: 0, intermission: 0, countdown: 0,
  cash: 0, baseHp: BASE_MAX, enemies: [], kills: 0, bossesKilled: 0, earned: 0, clock: 0,
  towers: [], projectiles: [], building: null, ghost: null, bar: null, towerPanel: null, panelTower: null,
  bonusNc: 0, mouseX: 500, mouseY: 300, mouseOn: false,
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
  // Shapes live in an inner chassis so CSS spawn/death/hover animations can scale or
  // bob them freely — a CSS transform on this outer group would override the
  // per-frame position attribute and teleport the unit toward the board corner.
  const chassis = svgNode('g', { class: 'e-chassis' });
  for (const node of shapeFor(key, t)) chassis.appendChild(node);
  g.appendChild(chassis);
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
  if (t.flying) {
    // Air units leave the track behind: straight flight plan from spawn gate to core.
    const [sx, sy] = state.samplers[pathIdx].at(0);
    const [tx, ty] = corePos();
    enemy.flight = { sx, sy, tx, ty, total: Math.max(1, Math.hypot(tx - sx, ty - sy)) };
    enemy.dist = debugFreeze ? Math.min(enemy.flight.total * 0.85, 260 + Math.random() * 480) : 0;
  }
  g.addEventListener('pointerenter', (event) => showTip(enemy, event));
  g.addEventListener('pointermove', moveTip);
  g.addEventListener('pointerleave', () => hideTip(enemy));
  state.layers.enemies.appendChild(g);
  state.enemies.push(enemy);
  const [x, y] = enemy.flight ? flightPos(enemy, enemy.dist) : state.samplers[pathIdx].at(enemy.dist);
  enemy.fx = x;
  enemy.fy = y;
  g.setAttribute('transform', `translate(${x} ${y})`);
  g.classList.add('spawn-in');
  setTimeout(() => g.classList.remove('spawn-in'), 420);
  if (t.boss) { banner(t.name, '// HOSTILE COMMANDER DETECTED', 'banner-red'); updateBossBar(); }
  return enemy;
}

function damageEnemy(enemy, amount, opts = {}) {
  let left = amount;
  if (!opts.phase) {
    const armor = (enemy.t.armor || 0) * (enemy.weak ? 0.5 : 1);
    left *= 1 - armor;
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, left);
      enemy.shield -= absorbed;
      left -= absorbed;
    }
  }
  if (enemy.weak) left *= 1.15;
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
  if (enemy.t.boss) state.bossesKilled += 1;
  const [x, y] = posOf(enemy);
  // Pyre Well contagion: anything dying while burning ignites its neighbors.
  if (enemy.burn && enemy.burn.t > 0) {
    fxRing(x, y, 'fx-ring-amber');
    for (const other of state.enemies) {
      if (!other.alive || other === enemy) continue;
      const [ox, oy] = posOf(other);
      if (Math.hypot(ox - x, oy - y) <= 55) applyBurn(other);
    }
  }
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
  if (enemy.flight) return [enemy.fx, enemy.fy];
  return state.samplers[enemy.pathIdx].at(enemy.dist);
}

function corePos() {
  return [state.map.core.x, state.map.core.y];
}

// Flying units cruise straight from their spawn gate to the core with a light
// sinusoidal weave that fades out near both ends of the flight plan.
function flightPos(enemy, progress) {
  const f = enemy.flight;
  const t = Math.min(1, Math.max(0, progress / f.total));
  const dx = f.tx - f.sx;
  const dy = f.ty - f.sy;
  const nx = -dy / f.total;
  const ny = dx / f.total;
  const weave = Math.sin(progress * (Math.PI * 2) / 120) * 8 * Math.sin(t * Math.PI);
  return [f.sx + dx * t + nx * weave, f.sy + dy * t + ny * weave];
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
  updateTowers(dt);
  updateProjectiles(dt);
  processBurn(dt);
}

function moveEnemy(enemy, dt) {
  if (debugFreeze || state.mode !== 'waves') return;
  if (enemy.stun > 0) {
    enemy.stun -= dt;
    enemy.node.classList.add('e-stunned');
    return;
  }
  enemy.node.classList.remove('e-stunned');
  if (enemy.flight) {
    // Air route: no tracks, no phase gates, no haste zones — cryo slow and gravity
    // pull still bite, otherwise flyers would ignore every control tower.
    enemy.dist = Math.max(0, enemy.dist - (enemy.pull || 0) * dt);
    enemy.dist += enemy.speed * (1 - (enemy.slow || 0)) * dt;
    if (enemy.dist >= enemy.flight.total) { leakEnemy(enemy); return; }
    const [fx, fy] = flightPos(enemy, enemy.dist);
    const [px, py] = flightPos(enemy, enemy.dist - 8);
    const heading = (Math.atan2(fy - py, fx - px) * 180) / Math.PI;
    enemy.fx = fx;
    enemy.fy = fy;
    enemy.node.setAttribute('transform', `translate(${fx.toFixed(1)} ${fy.toFixed(1)}) rotate(${heading.toFixed(1)})`);
    return;
  }
  const haste = inHasteZone(enemy.pathIdx, enemy.dist) ? 1.3 : 1;
  enemy.node.classList.toggle('e-haste', haste > 1);
  if (enemy.t.boss && enemy.key === 'virus') {
    enemy.pulseTimer -= dt;
    if (enemy.pulseTimer <= 0) { enemy.pulseTimer = 8; fxRing(...posOf(enemy), 'fx-ring-virus'); }
  }
  enemy.dist = Math.max(0, enemy.dist - (enemy.pull || 0) * dt);
  enemy.dist += enemy.speed * haste * (1 - (enemy.slow || 0)) * dt;
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
    // Scrap Foundry: prints bonus Nexus Coins into the commander's wallet per cleared wave.
    const forges = state.towers.filter((tower) => tower.id === 'scrapforge');
    if (forges.length) {
      const bank = 18 * forges.length;
      state.bonusNc += bank;
      for (const forge of forges) floatText(forge.x, forge.y - 30, `+${bank} NC BANKED`, 'nc-float');
    }
    const cleared = state.waveIndex + 1;
    if (cleared >= EASY_WAVES.length) { endMission(true); return; }
    banner(`WAVE ${cleared} CLEARED`, `// +$${bonus} SALVAGE`, 'banner-green');
    playSound();
    state.intermission = 7; // pace pass: a real build/upgrade window between waves
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
  refreshBarAfford();
  refreshPanelAfford();
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
  state.roomVote = context === 'room' ? { votes: {}, myId: myPlayerId } : null;
  const panel = document.createElement('div');
  panel.className = 'vote-overlay';
  panel.innerHTML = `
    <div class="vote-card">
      <div class="eyebrow">${context === 'room' ? '// SQUAD VOTE — 2 COMMANDERS' : '// SOLO DEPLOYMENT'}</div>
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
  if (line) line.textContent = `PROTOCOL LOCKED: ${mode.toUpperCase()} — DEPLOYING…`;
  const cancel = panel.querySelector('#vote-cancel');
  if (cancel) cancel.hidden = true;
}

function paintVotes() {
  const panel = state.votePanel;
  if (!panel || !state.roomVote) return;
  const line = panel.querySelector('#vote-state');
  const names = { 0: 'HOST', 1: 'GUEST' };
  const parts = [0, 1].map((id) => {
    const vote = state.roomVote.votes[id];
    return `<span class="vote-chip${vote ? ' voted' : ''}">${names[id]}: ${vote ? vote.toUpperCase() : 'VOTING…'}</span>`;
  });
  if (line) line.innerHTML = parts.join('');
}

function maybeLaunchRoom() {
  if (!state.roomVote) return;
  if (state.roomVote.votes[0] && state.roomVote.votes[1]) {
    const mode = state.roomVote.votes[state.roomVote.myId] || 'easy';
    launchCombat(mode);
  }
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
  state.cash = debugCash || START_SALVAGE;
  state.baseHp = BASE_MAX;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.bonusNc = 0;
  state.building = null;
  state.kills = 0;
  state.bossesKilled = 0;
  state.earned = 0;
  state.waveIndex = -1;
  state.clock = 0;
  ensureLayers();
  ensureHud();
  ensureLoadoutBar();
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
  setBuilding(null);
  closeTowerPanel();
  if (state.bar) { state.bar.remove(); state.bar = null; }
  if (state.layers) { state.layers.enemies.remove(); state.layers.fx.remove(); if (state.layers.towers) state.layers.towers.remove(); state.layers = null; }
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.bonusNc = 0;
  setStatus(myName ? `MAP RECON // ${state.map ? state.map.name : ''}` : 'MENU SYSTEM READY');
}

function paintPayout(panel, data) {
  const box = panel.querySelector('#end-rewards');
  if (!box) return;
  if (!data) {
    box.innerHTML = '<div class="payout-offline">NEXUS LINK OFFLINE — REWARDS NOT BANKED</div>';
    box.classList.add('on');
    return;
  }
  const r = data.rewards;
  const rows = [
    `<div class="payout-row payout-nc"><span>NEXUS COINS</span><b>+${r.nc} NC</b></div>`,
    r.bt > 0 ? `<div class="payout-row payout-bt"><span>BREACH TOKENS</span><b>+${r.bt} BT</b></div>` : '',
    r.firstClear ? '<div class="payout-row payout-bt"><span>FIRST CLEARANCE BONUS</span><b>+5 BT</b></div>' : '',
    r.bonusNc > 0 ? `<div class="payout-row payout-nc"><span>SCRAP FOUNDRY YIELD</span><b>+${r.bonusNc} NC</b></div>` : '',
    `<div class="payout-row payout-xp"><span>COMBAT XP</span><b>+${r.xp} XP</b></div>`,
    r.levelsGained > 0 ? `<div class="payout-row payout-lvl"><span>CLEARANCE LEVEL UP</span><b>LV ${data.profile.level} ▲${r.levelsGained > 1 ? ` ×${r.levelsGained}` : ''}</b></div>` : '',
  ];
  box.innerHTML = `<div class="payout-head">// NEXUS TRANSFER COMPLETE</div>${rows.join('')}`;
  box.classList.add('on');
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
      <div class="end-rewards" id="end-rewards"></div>
      <div class="end-actions">
        <button class="inline-button" id="end-redeploy" type="button">${win ? 'RE-DEPLOY' : 'RETRY'}</button>
        <button class="inline-button" id="end-bay" type="button">RETURN TO BAY</button>
      </div>
    </div>`;
  battlefield.appendChild(panel);
  state.endPanel = panel;
  if (window.CBZShop) {
    CBZShop.submitMission({
      result: win ? 'win' : 'loss',
      wavesCleared: win ? EASY_WAVES.length : state.waveIndex + 1,
      bossesKilled: state.bossesKilled,
      flawless: Boolean(win && state.baseHp >= BASE_MAX),
      bonusNc: state.bonusNc,
      difficulty: 'easy',
    }).then((data) => paintPayout(panel, data));
  }
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
  board.querySelectorAll('.layer-enemies, .layer-fx, .layer-towers, .layer-ghost').forEach((layer) => layer.remove());
  const towers = svgNode('g', { class: 'layer-towers' });
  const enemies = svgNode('g', { class: 'layer-enemies' });
  const fx = svgNode('g', { class: 'layer-fx' });
  board.appendChild(towers);
  board.appendChild(enemies);
  board.appendChild(fx);
  state.layers = { towers, enemies, fx, ghost: null };
  state.ghost = null;
}

function abort() {
  if (state.mode === 'idle') return;
  cancelAnimationFrame(state.raf);
  closeVote();
  if (state.endPanel) { state.endPanel.remove(); state.endPanel = null; }
  if (state.tip) state.tip.hidden = true;
  restoreRecon();
}

// --- Deployment loadout bar (the 5 bays you brought) -----------------------------------
function ensureLoadoutBar() {
  if (state.bar) state.bar.remove();
  const shop = window.CBZShop;
  const loadout = shop && shop.loadout ? shop.loadout() : [];
  const bar = document.createElement('div');
  bar.className = 'loadout-bar';
  const slots = [0, 1, 2, 3, 4].map((index) => {
    const entry = loadout[index];
    if (!entry) return `<div class="lo-slot lo-empty"><span class="lo-key">${index + 1}</span><b>EMPTY BAY</b><small>EQUIP IN NEXUS SHOP</small></div>`;
    return `<button class="lo-slot" type="button" data-tower="${entry.id}"><span class="lo-key">${index + 1}</span><span class="lo-icon cat-${entry.cat}">${entry.icon}</span><b>${entry.name}</b><span class="lo-cost">$${entry.cost}</span></button>`;
  }).join('');
  bar.innerHTML = `
    <div class="lo-head"><span>// DEPLOYMENT LOADOUT</span><b>${loadout.length}/5 BAYS ARMED</b></div>
    <div class="lo-slots">${slots}</div>
    <div class="lo-hint">PICK A BAY (1-5) → CLICK THE GRID TO DEPLOY · CLICK A DEPLOYED UNIT → FIELD MODULES · RIGHT-CLICK / ESC TO STOP</div>`;
  battlefield.appendChild(bar);
  state.bar = bar;
  bar.addEventListener('click', (event) => {
    const slot = event.target.closest('.lo-slot[data-tower]');
    if (!slot) return;
    toggleBuild(slot.dataset.tower);
  });
}

function refreshBarAfford() {
  if (!state.bar) return;
  state.bar.querySelectorAll('.lo-slot[data-tower]').forEach((slot) => {
    const entry = window.CBZShop && CBZShop.TOWERS.find((item) => item.id === slot.dataset.tower);
    slot.classList.toggle('poor', Boolean(entry && state.cash < entry.cost));
  });
  const head = state.bar.querySelector('.lo-head b');
  if (head) head.textContent = `${state.towers.length} DEPLOYED`;
}

function refreshPanelAfford() {
  if (!state.towerPanel || !state.panelTower) return;
  state.towerPanel.querySelectorAll('.tp-up').forEach((row) => {
    const track = row.dataset.track;
    const maxed = state.panelTower.up[track] >= MAX_UP;
    const poor = !maxed && state.cash < upCost(state.panelTower, track);
    row.classList.toggle('poor', poor);
    const button = row.querySelector('.tp-buy');
    if (button) button.disabled = maxed || poor;
  });
}

function buildingAllowed() {
  return state.mode === 'countdown' || state.mode === 'waves';
}

function toggleBuild(id) {
  if (!buildingAllowed()) return;
  if (state.building && state.building.id === id) { setBuilding(null); return; }
  const entry = window.CBZShop && CBZShop.TOWERS.find((item) => item.id === id);
  if (!entry) return;
  if (state.towers.length >= MAX_TOWERS) { playSound('alarm'); showToast(`Command grid saturated — ${MAX_TOWERS} units max.`); return; }
  if (state.cash < entry.cost) { playSound('alarm'); showToast(`Need $${entry.cost} salvage to deploy ${entry.name}.`); return; }
  setBuilding(entry);
}

function setBuilding(entry) {
  state.building = entry || null;
  board.classList.toggle('placing', Boolean(state.building));
  closeTowerPanel();
  if (state.bar) {
    state.bar.querySelectorAll('.lo-slot[data-tower]').forEach((slot) => {
      slot.classList.toggle('on', Boolean(state.building) && slot.dataset.tower === state.building.id);
    });
  }
  if (state.building) {
    ensureGhost();
    paintGhost(state.mouseX, state.mouseY);
  } else if (state.ghost) {
    state.ghost.remove();
    state.ghost = null;
  }
  playSound('hover');
}

// --- Placement engine: anywhere on the grid, clearance boxes enforce spacing -----------
function canPlace(x, y) {
  if (x < FOOT_HALF || x > 1000 - FOOT_HALF || y < FOOT_HALF || y > 600 - FOOT_HALF) return { ok: false, reason: 'OUT OF BOUNDS' };
  if (Math.hypot(x - state.map.core.x, y - state.map.core.y) < CORE_CLEAR) return { ok: false, reason: 'KEEP CLEAR OF THE CORE' };
  for (const tower of state.towers) {
    if (Math.abs(tower.x - x) < SEP && Math.abs(tower.y - y) < SEP) return { ok: false, reason: 'TOO CLOSE — CLEARANCE BOX' };
  }
  return { ok: true, reason: '' };
}

function boardPoint(event) {
  const point = board.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const ctm = board.getScreenCTM();
  if (!ctm) return [0, 0];
  const mapped = point.matrixTransform(ctm.inverse());
  return [mapped.x, mapped.y];
}

function toScreen(x, y) {
  const rect = board.getBoundingClientRect();
  const scale = Math.min(rect.width / 1000, rect.height / 600);
  const offsetX = (rect.width - 1000 * scale) / 2;
  const offsetY = (rect.height - 600 * scale) / 2;
  return [rect.left + offsetX + x * scale, rect.top + offsetY + y * scale];
}

function ensureGhost() {
  if (!state.layers || !state.building) return;
  if (state.ghost && state.ghostEntry === state.building) return;
  if (state.ghost) { state.ghost.remove(); state.ghost = null; }
  if (!state.layers.ghost) {
    const ghost = svgNode('g', { class: 'layer-ghost' });
    board.appendChild(ghost);
    state.layers.ghost = ghost;
  }
  const entry = state.building;
  const rng = entry.stats.rng >= 999 ? 300 : entry.stats.rng;
  const g = svgNode('g', { class: 'tw-ghost' });
  g.appendChild(svgNode('circle', { class: 'tw-range', r: rng }));
  g.appendChild(svgNode('rect', { class: 'tw-footprint', x: -FOOT_HALF, y: -FOOT_HALF, width: FOOT_HALF * 2, height: FOOT_HALF * 2 }));
  g.appendChild(svgNode('polygon', { class: 'tw-base', points: hexPoints(0, 0, 16) }));
  g.appendChild(svgNode('circle', { class: 'tw-ped', r: 9 }));
  const head = svgNode('g', { class: 'tw-head' });
  head.appendChild(svgNode('rect', { class: 'tw-barrel', x: 4, y: -2.5, width: 16, height: 5 }));
  head.appendChild(svgNode('circle', { class: 'tw-hub', r: 4.5 }));
  g.appendChild(head);
  const note = svgNode('text', { class: 'tw-ghost-note', y: -34, 'text-anchor': 'middle' }, entry.name);
  g.appendChild(note);
  g.appendChild(svgNode('text', { class: 'tw-ghost-reason', y: 44, 'text-anchor': 'middle' }, ''));
  state.layers.ghost.appendChild(g);
  state.ghost = g;
  state.ghostEntry = entry;
}

function paintGhost(x, y) {
  if (!state.ghost || !state.building) return;
  const verdict = canPlace(x, y);
  const broke = state.cash < state.building.cost;
  const ok = verdict.ok && !broke;
  state.ghost.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  state.ghost.classList.toggle('bad', !ok);
  state.ghost.classList.toggle('off', !state.mouseOn);
  const reason = state.ghost.querySelector('.tw-ghost-reason');
  if (reason) reason.textContent = broke ? `NEED $${state.building.cost} SALVAGE` : verdict.reason;
}

function rejectPlace(x, y, reason) {
  floatText(x, y - 20, `✕ ${reason}`, 'block-float');
  playSound('alarm');
}

function placeTower(entry, x, y) {
  state.cash -= entry.cost;
  const node = towerNode(entry, x, y);
  state.layers.towers.appendChild(node);
  const tower = { id: entry.id, entry, x, y, node, head: node.querySelector('.tw-head'), cd: 0.35, boost: 1, up: { dmg: 0, rate: 0, rng: 0 } };
  state.towers.push(tower);
  node.classList.add('placed');
  setTimeout(() => node.classList.remove('placed'), 620);
  floatText(x, y - 34, `-$${entry.cost}`, 'cash-float');
  playSound();
  updateHud();
}

function towerNode(entry, x, y) {
  const g = svgNode('g', { class: `tower tw-${entry.cat}` });
  const rng = entry.stats.rng >= 999 ? 300 : entry.stats.rng;
  g.appendChild(svgNode('circle', { class: 'tw-range', r: rng }));
  g.appendChild(svgNode('rect', { class: 'tw-footprint', x: -FOOT_HALF, y: -FOOT_HALF, width: FOOT_HALF * 2, height: FOOT_HALF * 2 }));
  const AURA_CLASS = { cryobeacon: 'aura-cryo', nullbeacon: 'aura-null', gravwell: 'aura-grav', naniteweb: 'aura-nanite' };
  if (AURA_CLASS[entry.id]) g.appendChild(svgNode('circle', { class: `tw-aura ${AURA_CLASS[entry.id]}`, r: rng }));
  // Chassis keeps CSS placement animation away from this group's position transform.
  const chassis = svgNode('g', { class: 'tw-chassis' });
  chassis.appendChild(svgNode('polygon', { class: 'tw-base', points: hexPoints(0, 0, 16) }));
  chassis.appendChild(svgNode('circle', { class: 'tw-ped', r: 9 }));
  const head = svgNode('g', { class: 'tw-head' });
  head.appendChild(svgNode('rect', { class: 'tw-barrel', x: 4, y: -2.5, width: 16, height: 5 }));
  head.appendChild(svgNode('circle', { class: 'tw-hub', r: 4.5 }));
  chassis.appendChild(head);
  g.appendChild(chassis);
  g.appendChild(svgNode('text', { class: 'tw-tag', y: -28, 'text-anchor': 'middle' }, entry.name.split(' ')[0]));
  g.setAttribute('transform', `translate(${x} ${y})`);
  return g;
}

// --- Field modules: buy temporary per-tower upgrades with salvage ----------------------
function upgradeTracks(tower) {
  if (ATTACKER_TOWERS.has(tower.id)) return ['dmg', 'rate', 'rng'];
  // Aura/support units widen their field instead; the Scrap Foundry prints money, full stop.
  if (tower.entry.stats.rng > 0 && tower.id !== 'scrapforge') return ['rng'];
  return [];
}

function upCost(tower, track) {
  return Math.round(tower.entry.cost * UPGRADE_TRACKS[track].costK * (tower.up[track] + 1));
}

function effStats(tower) {
  const s = tower.entry.stats;
  const up = tower.up || { dmg: 0, rate: 0, rng: 0 };
  return {
    dmg: s.dmg * (1 + UPGRADE_TRACKS.dmg.mult * up.dmg),
    rate: s.rate * (1 + UPGRADE_TRACKS.rate.mult * up.rate),
    rng: s.rng >= 999 ? s.rng : Math.round(s.rng * (1 + UPGRADE_TRACKS.rng.mult * up.rng)),
    infinite: s.rng >= 999,
  };
}

function paintTowerRange(tower) {
  const es = effStats(tower);
  const r = es.infinite ? 300 : es.rng;
  const range = tower.node.querySelector('.tw-range');
  if (range) range.setAttribute('r', r);
  const aura = tower.node.querySelector('.tw-aura');
  if (aura) aura.setAttribute('r', r);
}

function buyUpgrade(tower, track) {
  if (state.mode !== 'waves' && state.mode !== 'countdown') return;
  if (tower.up[track] >= MAX_UP) return;
  const cost = upCost(tower, track);
  if (state.cash < cost) { playSound('alarm'); showToast(`Need $${cost} salvage for that module.`); return; }
  state.cash -= cost;
  tower.up[track] += 1;
  if (track === 'rng') paintTowerRange(tower);
  floatText(tower.x, tower.y - 42, `${UPGRADE_TRACKS[track].label} LV${tower.up[track]}`, 'up-float');
  fxRing(tower.x, tower.y, 'fx-ring-white');
  playSound();
  updateHud();
  openTowerPanel(tower); // re-render the panel with the new module installed
}

// --- Tower intel panel (stats + field modules + sell) ------------------------------------
function openTowerPanel(tower) {
  closeTowerPanel();
  const entry = tower.entry;
  const es = effStats(tower);
  const refund = Math.floor(entry.cost * 0.7);
  const fmt = {
    dmg: (v) => String(Math.round(v)),
    rate: (v) => v.toFixed(1),
    rng: (v) => (entry.stats.rng >= 999 ? 'INF' : String(Math.round(v))),
  };
  const pips = (level) => Array.from({ length: MAX_UP }, (unused, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
  const rows = upgradeTracks(tower).map((track) => {
    const meta = UPGRADE_TRACKS[track];
    const level = tower.up[track];
    const maxed = level >= MAX_UP;
    const next = entry.stats[track] * (1 + meta.mult * (level + 1));
    const stat = track === 'rng' && es.infinite ? 'INF' : fmt[track](es[track]);
    return `
      <div class="tp-up${maxed ? ' maxed' : ''}" data-track="${track}">
        <div class="tp-up-head"><span>${meta.label}</span><b class="tp-val">${stat}${maxed ? '' : ` <i>→ ${fmt[track](next)}</i>`}</b></div>
        <div class="tp-pips">${pips(level)}</div>
        <button class="tp-buy" type="button" data-track="${track}" ${maxed ? 'disabled' : ''}>${maxed ? 'MAXED' : `$${upCost(tower, track)}`}</button>
      </div>`;
  }).join('');
  const panel = document.createElement('div');
  panel.className = `tower-panel tw-${entry.cat}`;
  panel.innerHTML = `
    <div class="tp-head"><b>${entry.name}</b><span class="tp-cat">${entry.cat.toUpperCase()}</span></div>
    <div class="tp-stats">
      <div><span>DMG</span><b>${Math.round(es.dmg) || '—'}</b></div>
      <div><span>RATE</span><b>${es.rate ? `${(es.rate * tower.boost).toFixed(1)}/s` : '—'}</b></div>
      <div><span>RNG</span><b>${es.infinite ? 'INF' : es.rng || '—'}</b></div>
    </div>
    <p class="tp-special">${entry.special.replace('>> ', '')}</p>
    ${rows ? `<div class="tp-ups"><div class="tp-ups-head"><span>// FIELD MODULES</span><b>TEMPORARY · LV ${MAX_UP} MAX</b></div>${rows}</div>` : '<p class="tp-noup">NO FIELD MODULES — ECONOMY UNIT</p>'}
    <button class="tp-sell" type="button">SALVAGE BACK +$${refund}</button>
    <p class="tp-note">MODULES ARE SCRAPPED ON SELL &amp; WHEN THE MISSION ENDS</p>`;
  battlefield.appendChild(panel);
  const [sx, sy] = toScreen(tower.x, tower.y);
  panel.style.left = `${Math.max(10, Math.min(window.innerWidth - 238, sx + 26))}px`;
  panel.style.top = `${Math.max(10, Math.min(window.innerHeight - 330, sy - 120))}px`;
  state.towerPanel = panel;
  state.panelTower = tower;
  tower.node.classList.add('selected');
  panel.querySelectorAll('.tp-buy').forEach((button) => button.addEventListener('click', () => buyUpgrade(tower, button.dataset.track)));
  panel.querySelector('.tp-sell').addEventListener('click', () => sellTower(tower));
  refreshPanelAfford();
}

function closeTowerPanel() {
  if (state.panelTower && state.panelTower.node) state.panelTower.node.classList.remove('selected');
  if (state.towerPanel) { state.towerPanel.remove(); state.towerPanel = null; }
  state.panelTower = null;
}

function sellTower(tower) {
  const refund = Math.floor(tower.entry.cost * 0.7);
  state.cash += refund;
  tower.node.remove();
  state.towers = state.towers.filter((item) => item !== tower);
  const [x, y] = [tower.x, tower.y];
  closeTowerPanel();
  floatText(x, y - 20, `+$${refund} SALVAGED`, 'cash-float');
  fxRing(x, y, 'fx-ring-amber');
  playSound();
  updateHud();
}

// --- Tower combat brain ------------------------------------------------------------------
function updateTowers(dt) {
  if (!state.layers || !state.towers.length) return;
  // Nanite Web: +30% fire rate to towers inside its web (web radius scales with modules).
  const webs = state.towers.filter((tower) => tower.id === 'naniteweb');
  for (const tower of state.towers) {
    tower.boost = webs.some((web) => web !== tower && Math.hypot(web.x - tower.x, web.y - tower.y) <= effStats(web).rng) ? 1.3 : 1;
  }
  // Enemy-touching auras first: cryo slow, null debuff, gravity pull.
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    enemy.slow = 0;
    enemy.weak = false;
    enemy.pull = 0;
  }
  for (const tower of state.towers) {
    const es = effStats(tower);
    const rng = es.infinite ? 9999 : es.rng;
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const [ex, ey] = posOf(enemy);
      if (Math.hypot(ex - tower.x, ey - tower.y) > rng) continue;
      if (tower.id === 'cryobeacon') enemy.slow = Math.max(enemy.slow, 0.35);
      if (tower.id === 'nullbeacon') enemy.weak = true;
      if (tower.id === 'gravwell') { enemy.pull = 30; enemy.node.classList.add('e-grav'); }
    }
  }
  for (const enemy of state.enemies) if (!enemy.pull) enemy.node.classList.remove('e-grav');
  // Fire control.
  for (const tower of state.towers) {
    const rate = effStats(tower).rate * tower.boost;
    if (rate <= 0) continue;
    tower.cd -= dt;
    if (tower.cd > 0) continue;
    const target = acquireTarget(tower);
    if (!target) { tower.cd = 0; continue; }
    aimHead(tower, target);
    fireTower(tower, target);
    tower.cd = 1 / rate;
  }
}

function acquireTarget(tower) {
  const rule = TOWER_RULES[tower.id] || {};
  const es = effStats(tower);
  const rng = es.infinite ? 9999 : es.rng;
  let pool = state.enemies.filter((enemy) => {
    if (!enemy.alive) return false;
    if (rule.air === 'no' && enemy.t.flying) return false;
    const [ex, ey] = posOf(enemy);
    return rng > 900 || Math.hypot(ex - tower.x, ey - tower.y) <= rng;
  });
  if (!pool.length) return null;
  if (rule.air === 'prefer') {
    const flying = pool.filter((enemy) => enemy.t.flying);
    if (flying.length) pool = flying;
  }
  // Priority: the hostile furthest along the track (closest to the core).
  return pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
}

function aimHead(tower, target) {
  const [ex, ey] = posOf(target);
  const angle = (Math.atan2(ey - tower.y, ex - tower.x) * 180) / Math.PI;
  if (tower.head) tower.head.setAttribute('transform', `rotate(${angle.toFixed(1)})`);
}

function fireLine(tower, target, cls, width = 2) {
  const [ex, ey] = posOf(target);
  const line = svgNode('line', { class: `fx-line ${cls}`, x1: tower.x, y1: tower.y, x2: ex, y2: ey, 'stroke-width': width });
  state.layers.fx.appendChild(line);
  setTimeout(() => line.remove(), 300);
  return [ex, ey];
}

function fireTower(tower, target) {
  const dmg = effStats(tower).dmg;
  const [tx, ty] = posOf(target);
  switch (tower.id) {
    case 'sentinel': {
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-tracer');
      break;
    }
    case 'arclance': {
      damageEnemy(target, dmg);
      const hit = [target];
      let from = target;
      for (let hop = 0; hop < 2; hop++) {
        const [fx, fy] = posOf(from);
        const next = state.enemies.find((enemy) => enemy.alive && !hit.includes(enemy) && Math.hypot(...posOf(enemy).map((v, i) => v - [fx, fy][i])) <= 90);
        if (!next) break;
        damageEnemy(next, dmg * 0.6);
        hit.push(next);
        from = next;
      }
      const pts = [tower.x, tower.y, ...hit.flatMap((enemy) => posOf(enemy))];
      const bolt = svgNode('polyline', { class: 'fx-line fx-chain', points: pts.map((v) => v.toFixed(1)).join(' ') });
      state.layers.fx.appendChild(bolt);
      setTimeout(() => bolt.remove(), 240);
      break;
    }
    case 'plasmort': {
      const shell = svgNode('circle', { class: 'fx-shell', r: 4 });
      state.layers.fx.appendChild(shell);
      state.projectiles.push({ kind: 'shell', x: tower.x, y: tower.y, tx, ty, speed: 260, dmg, node: shell });
      break;
    }
    case 'railspire': {
      const len = tower.entry.stats.rng;
      const angle = Math.atan2(ty - tower.y, tx - tower.x);
      const ex = tower.x + Math.cos(angle) * len;
      const ey = tower.y + Math.sin(angle) * len;
      const line = svgNode('line', { class: 'fx-line fx-beam-rail', x1: tower.x, y1: tower.y, x2: ex, y2: ey });
      state.layers.fx.appendChild(line);
      setTimeout(() => line.remove(), 300);
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const [px, py] = posOf(enemy);
        if (distToSegment(px, py, tower.x, tower.y, ex, ey) <= 14) damageEnemy(enemy, dmg);
      }
      break;
    }
    case 'stingerpad': {
      const missile = svgNode('polygon', { class: 'fx-missile', points: '5,0 -3,3 -3,-3' });
      state.layers.fx.appendChild(missile);
      state.projectiles.push({ kind: 'missile', x: tower.x, y: tower.y, target, speed: 320, dmg, node: missile, angle: 0 });
      break;
    }
    case 'teslacoil': {
      damageEnemy(target, dmg);
      const zapped = [target];
      for (const enemy of state.enemies) {
        if (zapped.length >= 3) break;
        if (!enemy.alive || enemy === target) continue;
        const [ex, ey] = posOf(enemy);
        if (Math.hypot(ex - tower.x, ey - tower.y) <= tower.entry.stats.rng) zapped.push(enemy);
      }
      for (const enemy of zapped) enemy.stun = Math.max(enemy.stun || 0, 0.5);
      const pts = [tower.x, tower.y, ...zapped.flatMap((enemy) => posOf(enemy))];
      const arc = svgNode('polyline', { class: 'fx-line fx-chain fx-chain-stun', points: pts.map((v) => v.toFixed(1)).join(' ') });
      state.layers.fx.appendChild(arc);
      setTimeout(() => arc.remove(), 240);
      break;
    }
    case 'flakstorm': {
      const [bx, by] = [tx, ty];
      const burst = svgNode('circle', { class: 'fx-flak', cx: bx, cy: by, r: 5 });
      state.layers.fx.appendChild(burst);
      setTimeout(() => burst.remove(), 420);
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const [px, py] = posOf(enemy);
        if (Math.hypot(px - bx, py - by) <= 26) damageEnemy(enemy, enemy.t.flying ? dmg * 4 : dmg);
      }
      break;
    }
    case 'pyrewell': {
      damageEnemy(target, dmg);
      applyBurn(target);
      fireLine(tower, target, 'fx-tracer fx-fire');
      break;
    }
    case 'quantum': {
      const execute = target.hp < target.maxHp * 0.1;
      damageEnemy(target, execute ? 99999 : dmg, { phase: true });
      const [qx, qy] = fireLine(tower, target, 'fx-beam-quantum', 1.6);
      floatText(qx, qy - 16, execute ? 'EXECUTED' : `-${dmg}`, execute ? 'core-float' : 'cash-float');
      break;
    }
    case 'phasedeca': {
      damageEnemy(target, dmg, { phase: true });
      fireLine(tower, target, 'fx-beam-phase', 3);
      break;
    }
    case 'singularity': {
      const sx2 = tx;
      const sy2 = ty;
      const hole = svgNode('circle', { class: 'fx-sing', cx: sx2, cy: sy2, r: 70 });
      state.layers.fx.appendChild(hole);
      setTimeout(() => hole.remove(), 620);
      fxRing(sx2, sy2, 'fx-ring-virus');
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const [px, py] = posOf(enemy);
        if (Math.hypot(px - sx2, py - sy2) <= 70) damageEnemy(enemy, dmg, { phase: true });
      }
      floatText(sx2, sy2 - 74, 'SINGULARITY', 'core-float');
      break;
    }
    default:
      break;
  }
}

function applyBurn(enemy) {
  enemy.burn = { dps: 6, t: 3 };
  enemy.node.classList.add('e-burning');
}

function processBurn(dt) {
  if (state.mode !== 'waves') return;
  for (const enemy of state.enemies) {
    if (!enemy.alive || !enemy.burn) continue;
    enemy.burn.t -= dt;
    enemy.hp = Math.max(0, enemy.hp - enemy.burn.dps * dt);
    if (enemy.burn.t <= 0) {
      enemy.burn = null;
      enemy.node.classList.remove('e-burning');
    }
    if (enemy.hp <= 0) killEnemy(enemy);
    else paintBars(enemy);
  }
}

function updateProjectiles(dt) {
  if (!state.layers) return;
  for (const p of state.projectiles) {
    if (p.kind === 'shell') {
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      const step = p.speed * dt;
      if (Math.hypot(dx, dy) <= step) {
        p.x = p.tx;
        p.y = p.ty;
        p.dead = true;
        fxRing(p.tx, p.ty, 'fx-ring-red');
        for (const enemy of state.enemies) {
          if (!enemy.alive) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - p.tx, py - p.ty) <= 40) damageEnemy(enemy, p.dmg);
        }
      } else {
        p.x += (dx / Math.hypot(dx, dy)) * step;
        p.y += (dy / Math.hypot(dx, dy)) * step;
      }
      p.node.setAttribute('cx', p.x.toFixed(1));
      p.node.setAttribute('cy', p.y.toFixed(1));
    } else if (p.kind === 'missile') {
      if (!p.target || !p.target.alive) {
        p.target = acquireTarget({ id: 'stingerpad', x: p.x, y: p.y, entry: { stats: { rng: 999 } } });
        if (!p.target) { p.dead = true; }
      }
      if (p.target) {
        const [ex, ey] = posOf(p.target);
        const dx = ex - p.x;
        const dy = ey - p.y;
        const gap = Math.hypot(dx, dy);
        const step = p.speed * dt;
        p.angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (gap <= step + 6) {
          p.dead = true;
          damageEnemy(p.target, p.target.t.flying ? p.dmg * 2 : p.dmg);
          fxRing(ex, ey, 'fx-ring-amber');
        } else {
          p.x += (dx / gap) * step;
          p.y += (dy / gap) * step;
        }
      }
      p.node.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(0)})`);
    }
    if (p.dead) p.node.remove();
  }
  state.projectiles = state.projectiles.filter((p) => !p.dead);
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const span = dx * dx + dy * dy;
  const t = span ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / span)) : 0;
  return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
}

// --- Board plumbing: pointer tracking, deploy clicks, cancel gestures --------------------
board.addEventListener('pointermove', (event) => {
  const [x, y] = boardPoint(event);
  state.mouseX = x;
  state.mouseY = y;
  state.mouseOn = true;
  if (state.building) paintGhost(x, y);
});

board.addEventListener('pointerleave', () => {
  state.mouseOn = false;
  if (state.ghost) state.ghost.classList.add('off');
});

board.addEventListener('click', (event) => {
  if (!state.bar || !buildingAllowed()) return;
  const [x, y] = boardPoint(event);
  if (state.building) {
    const verdict = canPlace(x, y);
    if (!verdict.ok) { rejectPlace(x, y, verdict.reason); return; }
    if (state.cash < state.building.cost) { rejectPlace(x, y, `NEED $${state.building.cost} SALVAGE`); return; }
    placeTower(state.building, x, y);
    return;
  }
  const node = event.target.closest ? event.target.closest('.tower') : null;
  if (node) {
    const tower = state.towers.find((item) => item.node === node);
    if (tower) openTowerPanel(tower);
  }
});

board.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (state.building) setBuilding(null);
  else closeTowerPanel();
});

document.addEventListener('keydown', (event) => {
  if (document.querySelector('#battlefield').hidden) return;
  if (event.key === 'Escape') { setBuilding(null); closeTowerPanel(); return; }
  const digit = Number(event.key);
  if (digit >= 1 && digit <= 5 && state.bar && buildingAllowed()) {
    const slots = state.bar.querySelectorAll('.lo-slot[data-tower]');
    const slot = slots[digit - 1];
    if (slot) toggleBuild(slot.dataset.tower);
  }
});

// --- Room sync ----------------------------------------------------------------------------
function sendToPeer(message) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function handleRoomMessage(message) {
  if (message.type === 'game-vote' && state.roomVote) {
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
