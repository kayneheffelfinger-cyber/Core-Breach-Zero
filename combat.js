// Core Breach: Zero — Combat Protocol (Easy Mode).
// Loaded after app.js: uses its globals (BATTLE_MAPS, svgNode, playSound, showToast...).
// Mode voting + 15-wave Easy layout + enemies that follow every map's tracks and mechanics.
(() => {
const board = document.querySelector('#board');
const battlefield = document.querySelector('#battlefield');

// --- Enemy roster (Easy Mode) ---------------------------------------------------
// Rebalance pass: bounties roughly doubled so a real defense network is affordable
// by the mid waves, and every archetype still hits the core for a unique amount.
const ENEMY_TYPES = {
  glitched: { name: 'GLITCHED BIT', tag: 'NORMAL', hp: 15, speed: 84, size: 9, bounty: 3, dmg: 1, color: '#70e1d0', ability: 'None — cheap fodder that arrives in numbers.' },
  runner: { name: 'DATA RUNNER', tag: 'FAST', hp: 10, speed: 124, size: 8, bounty: 5, dmg: 2, color: '#a5d58b', ability: 'Very fast — outruns reaction time.' },
  file: { name: 'CORRUPTED FILE', tag: 'SWARM', hp: 8, speed: 62, size: 6, bounty: 2, dmg: 1, color: '#c49bef', ability: 'Spawns in dense clusters.' },
  shielded: { name: 'SHIELDED BYTE', tag: 'ARMORED', hp: 45, speed: 40, size: 11, bounty: 9, dmg: 3, color: '#8fb7c9', armor: 0.2, ability: 'Armor plating absorbs 20% of incoming damage.' },
  drone: { name: 'OVERCLOCKED DRONE', tag: 'FLYING', hp: 25, speed: 88, size: 10, bounty: 8, dmg: 2, color: '#ffb45a', flying: true, ability: 'Air unit — flies a straight line to the core, ignoring tracks, gates and haste fields.' },
  nullcore: { name: 'NULL CORE', tag: 'TANK', hp: 150, speed: 28, size: 14, bounty: 19, dmg: 4, color: '#7f8fa0', ability: 'Dense hull soaks heavy damage.' },
  virus: { name: 'SYSTEM VIRUS', tag: 'MINI-BOSS', hp: 600, speed: 48, size: 20, bounty: 120, dmg: 6, color: '#ff5e7a', boss: true, ability: 'Malware Pulse — emits a stunning shockwave every 8s.' },
  leak: { name: 'MEMORY LEAK', tag: 'MINI-BOSS', hp: 1200, speed: 34, size: 22, bounty: 225, dmg: 8, color: '#ffb45a', boss: true, ability: 'Replication — spills 6 Corrupted Files at 50% HP.' },
  overseer: { name: 'CORE BREACH: ZERO', tag: 'FINAL BOSS', hp: 4200, speed: 27, size: 26, bounty: 750, dmg: 25, color: '#ff4d5e', boss: true, shield: 400, ability: 'Overheat — shockwave disables a tower for 4s. Shielding Matrix — gains a 400 HP shield at 25% HP.' },
};

// --- Easy Mode: 20 waves, 6 boss encounters ---------------------------------------
// Wave pressure compounds: every wave index adds +10% enemy HP on top of the
// roster, so the same towers that cruised wave 3 start bleeding around wave 8-10
// unless the defense network grows with it. Surge modifiers stack on top.
const WAVE_HP_SCALE = 0.12;  // +12% HP per wave index — pressure compounds faster
const SURGE_MODS = {
  overclock: { hp: 1, speed: 1.25, label: 'OVERCLOCK SURGE', note: 'HOSTILES RUN 25% FASTER' },
  hardened: { hp: 1.4, speed: 1, label: 'HARDENED HULLS', note: 'HOSTILES +40% HP' },
};
const EASY_WAVES = [
  { groups: [['glitched', 16]] },
  { groups: [['glitched', 20], ['runner', 8]] },
  { groups: [['glitched', 16], ['runner', 10], ['file', 12]] },
  { groups: [['shielded', 12], ['glitched', 14]] },
  { groups: [['runner', 24], ['shielded', 10], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 10], ['glitched', 16]], phase: 'AIR DEBUT' },
  { groups: [['shielded', 18], ['drone', 14]] },
  { groups: [['nullcore', 4], ['file', 26]] },
  { groups: [['nullcore', 6], ['drone', 14], ['runner', 18]], mod: 'overclock' },
  { groups: [['shielded', 10], ['nullcore', 5], ['leak', 1]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 36], ['runner', 14]], phase: 'SWARM SURGE', mod: 'overclock' },
  { groups: [['nullcore', 10], ['drone', 18]] },
  { groups: [['virus', 1], ['leak', 1], ['shielded', 12]], phase: 'DOUBLE TROUBLE' },
  { groups: [['shielded', 20], ['drone', 22], ['glitched', 30]] },
  { groups: [['runner', 30], ['drone', 16]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 12], ['shielded', 16]], phase: 'ARMOR COLUMN', mod: 'hardened' },
  { groups: [['drone', 26], ['runner', 20]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['virus', 2], ['file', 40], ['glitched', 30]], phase: 'VIRULENT SURGE' },
  { groups: [['leak', 2], ['nullcore', 10], ['drone', 20]], phase: 'LEAK STORM', mod: 'hardened' },
  { groups: [['shielded', 20], ['nullcore', 10], ['overseer', 1], ['drone', 20]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];
// Pace pass: wider spawn gaps so waves stream in instead of dumping all at once.
const SPAWN_GAP = { file: 0.45, glitched: 0.75, runner: 0.65, shielded: 1.0, drone: 0.95, nullcore: 1.85, virus: 2.5, leak: 2.5, overseer: 2.75 };
const BASE_MAX = 100;

// --- Foundry rules: free placement + clearance boxes ---------------------------------
const START_SALVAGE = 200;   // mission opening funds — enough to open with 2-3 bays
const FOOT_HALF = 24;        // clearance box is 48x48 around every placed unit
const SEP = 56;              // min axis distance between two unit centers (box + gap)
const CORE_CLEAR = 58;       // nothing deploys inside the reactor ring
const PAD_SNAP = 24;         // hex AA pads: deploy this close to a pad center to link anti-air
const PAD_AIR_BOOST = 1.5;   // pads overcharge linked units: +50% damage vs flying hostiles
const TRACK_CLEAR = 36;      // nothing deploys on the convoy lane itself
// Tower limit scales with the squad: every extra commander brings their own
// hardware allotment to the shared grid.
const TOWER_BASE = 20;       // solo ceiling
const TOWER_PER_ALLY = 9;    // +9 slots per additional commander in the room
function towerLimit() {
  const players = (typeof window !== 'undefined' && Number(window.CBZ_ROOM_PLAYERS)) || 1;
  return TOWER_BASE + TOWER_PER_ALLY * (Math.max(1, Math.min(4, players)) - 1);
}
// air: 'no' = ground only (a hex pad grants AA), 'yes' = anything
const TOWER_RULES = {
  sentinel: { air: 'no' },
  lazermortar: { air: 'no' },
  shotgunner: { air: 'no' },
  virus: { air: 'yes' },
};

// --- Upgrade ladder data rides on the blueprint catalog (shop.js entry.track) ------
// Nothing module-shaped lives here anymore: one chassis, one linear ladder.


// --- Mission state ----------------------------------------------------------------
const state = {
  mode: 'idle', // idle | vote | countdown | waves | over
  map: null, samplers: [], gateEvents: [], zoneRanges: [],
  waveIndex: -1, queue: [], spawnGap: 0, intermission: 0, countdown: 0,
  cash: 0, baseHp: BASE_MAX, enemies: [], kills: 0, bossesKilled: 0, earned: 0, clock: 0, nidSeq: 0,
  towers: [], projectiles: [], building: null, ghost: null, bar: null, towerPanel: null, panelTower: null,
  bonusNc: 0, mouseX: 500, mouseY: 300, mouseOn: false,
  raf: 0, last: 0,
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
    nid: ++state.nidSeq,
    // Wave pressure: +10% HP per wave index, surge modifiers stack on top.
    hp: Math.round(t.hp * (state.hpScale || 1)), maxHp: Math.round(t.hp * (state.hpScale || 1)), shield: 0, maxShield: t.shield || 0,
    pathIdx, dist: debugFreeze ? 260 + Math.random() * 480 : 0, speed: t.speed * (state.surgeSpeed || 1), alive: true,
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
    // Null Beacon collapse modules shred deeper into armor; base weak still halves it.
    const armorMult = enemy.weak ? Math.max(0.05, 0.5 - 0.15 * (enemy.shredLv || 0)) : 1;
    const armor = (enemy.t.armor || 0) * armorMult;
    left *= 1 - armor;
    if (enemy.shield > 0) {
      const absorbed = Math.min(enemy.shield, left);
      enemy.shield -= absorbed;
      left -= absorbed;
    }
  }
  if (enemy.weak) left *= 1 + (enemy.weakAmp || 0.15);
  // Cryo Frostbite: hostiles that are actively slowed take amplified damage.
  if (enemy.frost && (enemy.slow || 0) > 0) left *= 1 + enemy.frost;
  enemy.hp = Math.max(0, enemy.hp - left);
  if (enemy.t.boss) updateBossBar(); // the top-bar boss readout tracks every hit
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
  const payout = Math.round(enemy.t.bounty);
  state.cash += payout;
  state.earned += payout;
  state.kills += 1;
  if (enemy.t.boss) state.bossesKilled += 1;
  const [x, y] = posOf(enemy);
  floatText(x, y - enemy.t.size - 6, `+$${payout}`, 'cash-float');
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
  if (coopGuest()) { guestFrame(dt); return; }
  if (state.mode === 'countdown') {
    state.countdown -= dt;
    const n = Math.ceil(state.countdown);
    if (n !== state.lastCount && n > 0) { state.lastCount = n; banner(String(n), '// DEPLOYING', 'banner-count'); playSound(); }
    if (state.countdown <= 0) beginWave(debugWave > 0 ? Math.min(EASY_WAVES.length - 1, debugWave - 1) : 0);
  }
  if (state.mode === 'waves') runWaves(dt);
  for (const enemy of state.enemies) if (enemy.alive) moveEnemy(enemy, dt);
  state.enemies = state.enemies.filter((enemy) => enemy.alive);
  updateTowers(dt);
  updateProjectiles(dt);
  if (coopHost()) {
    state.syncT -= dt;
    if (state.syncT <= 0) { state.syncT = 0.12; coopBroadcast(); }
  }
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
    // Air route: no tracks, no phase gates, no haste zones — cryo slow, frostbite
    // and gravity still bite, otherwise flyers would ignore every control tower.
    enemy.dist = Math.max(0, enemy.dist - (enemy.pull || 0) * dt);
    enemy.dist += enemy.speed * (1 - (enemy.slow || 0)) * (1 - (enemy.gravSlow || 0)) * dt;
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
  enemy.dist += enemy.speed * haste * (1 - (enemy.slow || 0)) * (1 - (enemy.gravSlow || 0)) * dt;
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
    // Income pass: cleared waves pay build money. Rates trimmed — the upgrade
    // ladder is the real salvage sink now, maxing a chassis must hurt.
    const bonus = 30 + (state.waveIndex + 1) * 7;
    state.cash += bonus;
    state.earned += bonus;
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
  state.hpScale = 1 + WAVE_HP_SCALE * index;
  const surge = wave.mod ? SURGE_MODS[wave.mod] : null;
  state.surgeSpeed = surge ? surge.speed : 1;
  if (surge && surge.hp !== 1) state.hpScale *= surge.hp;
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
  banner(`WAVE ${String(index + 1).padStart(2, '0')} / ${EASY_WAVES.length}`, surge ? `// ${surge.label} — ${surge.note}` : wave.phase ? `// ${wave.phase}` : '// HOSTILES INBOUND', 'banner-wave');
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
  state.bossBar.hidden = !boss;
  state.bossBar.style.display = boss ? '' : 'none';
  if (!boss) return;
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
  state.syncTitle = String(title || '');
  state.syncSeq = (state.syncSeq || 0) + 1;
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
  { id: 'easy', label: 'EASY', sub: '20 WAVES // 6 BOSS WAVES', ready: true },
  { id: 'medium', label: 'MEDIUM', sub: 'JUNCTION PRESSURE', ready: false },
  { id: 'hard', label: 'HARD', sub: 'DUAL LANE SIEGE', ready: false },
  { id: 'insane', label: 'INSANE', sub: 'SPIRAL OVERDRIVE', ready: false },
  { id: 'cbz', label: 'CBZ', sub: 'PHASE GRID PROTOCOL', ready: false },
];

function showVote(context) {
  closeVote();
  state.mode = 'vote';
  const panel = document.createElement('div');
  panel.className = 'vote-overlay';
  panel.innerHTML = `
    <div class="vote-card">
      <div class="eyebrow">// SOLO DEPLOYMENT</div>
      <h2>CHOOSE COMBAT PROTOCOL</h2>
      <div class="mode-grid">${MODES.map((mode) => `
        <button class="mode-card${mode.ready ? '' : ' locked'}" type="button" data-mode="${mode.id}" ${mode.ready ? '' : 'disabled'}>
          <span class="mode-stamp">${mode.ready ? 'READY' : 'COMING SOON'}</span>
          <b>${mode.label}</b><small>${mode.sub}</small>
        </button>`).join('')}</div>
      <p class="vote-state" id="vote-state">Select a protocol to deploy.</p>
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
  launchCombat(mode);
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
  // Flat point cloud of every lane — placement checks + drone spawn gates use it.
  state.trackPts = state.samplers.flatMap((sampler) => sampler.pts);
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
  state.nidSeq = 0;
  state.guestMap = new Map();
  state.syncT = 0;
  state.syncTitle = '';
  state.syncSeq = 0;
  state.lastSyncSeq = 0;
  ensureLayers();
  ensureHud();
  ensureLoadoutBar();
  ensureTip();
  updateHud();
  setStatus(`COMBAT PROTOCOL // ${map.name}`);
  if (skipVote) launchCombat('easy');
  else showVote('solo');
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

function endMission(win, fromSync = false) {
  state.mode = 'over';
  cancelAnimationFrame(state.raf);
  if (coopHost()) { const bridge = window.CBZCoopBridge; if (bridge && bridge.send) bridge.send({ k: 'over', win }); }
  closeVote();
  hideTip();
  const panel = document.createElement('div');
  panel.className = `mission-end ${win ? 'win' : 'lose'}`;
  panel.innerHTML = `
    <div class="end-card">
      <div class="eyebrow">${win ? '// PROTOCOL COMPLETE' : '// CORE LOST'}</div>
      <h2>${win ? 'SECTOR CLEARED' : 'CORE BREACHED'}</h2>
      <div class="end-stats">
        <div><span>OUTCOME</span><b>${win ? `ALL ${EASY_WAVES.length} WAVES REPELLED` : `FELL ON WAVE ${state.waveIndex + 1}`}</b></div>
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
  notifyRoomEnded();
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
    <div class="lo-hint">PICK A BAY (1-5) → CLICK THE GRID TO DEPLOY · HEX PADS = ANTI-AIR · CLICK A DEPLOYED UNIT → UPGRADE LADDER · RIGHT-CLICK / ESC TO STOP</div>`;
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
  if (head) head.textContent = `${state.towers.length}/${towerLimit()} DEPLOYED`;
}

function refreshPanelAfford() {
  if (!state.towerPanel || !state.panelTower) return;
  const tower = state.panelTower;
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  const next = tiers[lvl];
  state.towerPanel.querySelectorAll('.tp-buy').forEach((button) => {
    const index = Number(button.dataset.tier);
    if (Number.isNaN(index) || index !== lvl) { button.disabled = true; return; }
    button.disabled = Boolean(next) && state.cash < next.cost;
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
  const limit = towerLimit();
  if (state.towers.length >= limit) { playSound('alarm'); showToast(`Command grid saturated — ${limit} units max at ${window.CBZ_ROOM_PLAYERS || 1} commander(s).`); return; }
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
  // The convoy lane is hostile territory — no building on or across the track.
  for (const [tx, ty] of state.trackPts) {
    const dx = tx - x;
    const dy = ty - y;
    if (dx * dx + dy * dy < TRACK_CLEAR * TRACK_CLEAR) return { ok: false, reason: 'KEEP OFF THE TRACK' };
  }
  for (const tower of state.towers) {
    if (Math.abs(tower.x - x) < SEP && Math.abs(tower.y - y) < SEP) return { ok: false, reason: 'TOO CLOSE — CLEARANCE BOX' };
  }
  return { ok: true, reason: '' };
}

// Hex AA pads: a unit deployed on one of the map's hexagon pads gains anti-air
// targeting, even if its chassis is ground-only (Sentinel, Plasma Mortar, ...).
function padAt(x, y) {
  return ((state.map && state.map.pads) || []).find(([px, py]) => Math.hypot(px - x, py - y) <= PAD_SNAP) || null;
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
  if (reason) {
    if (broke) reason.textContent = `NEED $${state.building.cost} SALVAGE`;
    else if (verdict.ok && padAt(x, y)) reason.textContent = 'AA PAD — THIS UNIT CAN HIT FLYERS';
    else reason.textContent = verdict.reason;
  }
}

function rejectPlace(x, y, reason) {
  floatText(x, y - 20, `✕ ${reason}`, 'block-float');
  playSound('alarm');
}

function placeTower(entry, x, y) {
  if (state.towers.length >= towerLimit()) { playSound('alarm'); showToast(`Command grid saturated — ${towerLimit()} units max.`); return false; }
  if (state.cash < entry.cost) { playSound('alarm'); showToast(`Need $${entry.cost} salvage to deploy ${entry.name}.`); return false; }
  state.cash -= entry.cost;
  const node = towerNode(entry, x, y);
  state.layers.towers.appendChild(node);
  const tower = { id: entry.id, entry, x, y, node, head: node.querySelector('.tw-head'), cd: 0.35, boost: 1, lvl: 0 };
  const pad = padAt(x, y);
  if (pad) {
    tower.onPad = true;
    tower.pad = pad;
    node.classList.add('tw-on-pad');
    const padNode = document.querySelector(`[data-pad="${pad[0]},${pad[1]}"]`);
    if (padNode) padNode.classList.add('occupied');
    floatText(x, y - 46, 'AA PAD LINKED', 'aa-float');
  }
  state.towers.push(tower);
  node.classList.add('placed');
  setTimeout(() => node.classList.remove('placed'), 620);
  floatText(x, y - 34, `-$${entry.cost}`, 'cash-float');
  playSound();
  updateHud();
  return true;
}

function towerNode(entry, x, y) {
  const g = svgNode('g', { class: `tower tw-${entry.cat}` });
  const rng = entry.stats.rng >= 999 ? 300 : entry.stats.rng;
  g.appendChild(svgNode('circle', { class: 'tw-range', r: rng }));
  g.appendChild(svgNode('rect', { class: 'tw-footprint', x: -FOOT_HALF, y: -FOOT_HALF, width: FOOT_HALF * 2, height: FOOT_HALF * 2 }));
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

// --- Upgrade ladder: one linear track per chassis, bought with salvage -------------
// Tiers come from the blueprint catalog (entry.track). Every tier's `sets` are
// absolute stat values applied on install; levels live on the placed unit only —
// scrapped when it is sold, wiped when the mission ends.
function trackLevel(tower) {
  return tower.lvl || 0;
}

function towerTrack(tower) {
  return tower.entry.track || [];
}

function effStats(tower) {
  const s = tower.entry.stats;
  const stats = { dmg: s.dmg, rate: s.rate, rng: s.rng, splash: s.splash || 0 };
  for (let i = 0; i < trackLevel(tower); i++) {
    const tier = towerTrack(tower)[i];
    if (tier && tier.sets) Object.assign(stats, tier.sets);
  }
  return { ...stats, infinite: s.rng >= 999 };
}

function trackInvested(tower) {
  return tower.entry.cost + towerTrack(tower).slice(0, trackLevel(tower)).reduce((sum, tier) => sum + tier.cost, 0);
}

function paintTowerRange(tower) {
  const es = effStats(tower);
  const r = es.infinite ? 300 : es.rng;
  const range = tower.node.querySelector('.tw-range');
  if (range) range.setAttribute('r', r);
  const aura = tower.node.querySelector('.tw-aura');
  if (aura) aura.setAttribute('r', r);
}

function buyTrack(tower) {
  if (state.mode !== 'waves' && state.mode !== 'countdown') return;
  if (coopGuest()) { coopIntent({ a: 'up', t: state.towers.indexOf(tower) }); return; }
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  if (lvl >= tiers.length) return;
  const tier = tiers[lvl];
  if (state.cash < tier.cost) { playSound('alarm'); showToast(`Need $${tier.cost} salvage for ${tier.label}.`); return; }
  state.cash -= tier.cost;
  tower.lvl = lvl + 1;
  paintTowerRange(tower);
  floatText(tower.x, tower.y - 42, `${tier.label} ONLINE`, 'up-float');
  fxRing(tower.x, tower.y, 'fx-ring-white');
  playSound();
  updateHud();
  openTowerPanel(tower); // re-render the panel with the new tier installed
}

// --- Tower intel panel (stats + field modules + sell) ------------------------------------
function openTowerPanel(tower) {
  closeTowerPanel();
  const entry = tower.entry;
  const es = effStats(tower);
  const refund = Math.floor(trackInvested(tower) * 0.7);
  const fmt = {
    dmg: (v) => String(Math.round(v)),
    rate: (v) => v.toFixed(1),
    rng: (v) => (entry.stats.rng >= 999 ? 'INF' : String(Math.round(v))),
  };
  const pips = (level, max) => Array.from({ length: max }, (unused, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
  const tiers = towerTrack(tower);
  const lvl = trackLevel(tower);
  const rows = tiers.map((tier, index) => {
    const installed = index < lvl;
    const next = index === lvl;
    return `
      <div class="tp-up${installed ? ' maxed' : ''}" data-tier="${index}">
        <div class="tp-up-head"><span>${String(index + 1).padStart(2, '0')} · ${tier.label}</span>${installed ? '<b class="tp-val">ONLINE</b>' : `<span class="tp-info">${tier.info}</span>`}</div>
        <div class="tp-pips">${pips(installed ? 1 : 0, 1)}</div>
        <button class="tp-buy" type="button" data-tier="${index}" ${next ? '' : 'disabled'}>${installed ? 'INSTALLED' : next ? `$${tier.cost}` : 'LOCKED'}</button>
      </div>`;
  }).join('');
  const panel = document.createElement('div');
  panel.className = `tower-panel tw-${entry.cat}`;
  panel.innerHTML = `
    <div class="tp-head"><b>${entry.name}</b><span class="tp-cat">${entry.cat.toUpperCase()}</span></div>
    <div class="tp-stats">
      <div><span>DMG</span><b>${Math.round(es.dmg) || '—'}</b></div>
      <div><span>RATE</span><b>${es.rate ? `${es.rate.toFixed(1)}/s` : '—'}</b></div>
      <div><span>RNG</span><b>${es.infinite ? 'INF' : Math.round(es.rng)}</b></div>
      ${es.splash ? `<div><span>SPLASH</span><b>${Math.round(es.splash)}U</b></div>` : ''}
    </div>
    <p class="tp-special">${entry.special.replace('>> ', '')}</p>
    <div class="tp-ups"><div class="tp-ups-head"><span>// UPGRADE LADDER</span><b>TIER ${Math.min(lvl + 1, tiers.length)} / ${tiers.length} · THIS MISSION</b></div>${rows}</div>
    <button class="tp-sell" type="button">SALVAGE BACK +$${refund}</button>
    <p class="tp-note">UPGRADES ARE SCRAPPED ON SELL &amp; WHEN THE MISSION ENDS</p>`;
  battlefield.appendChild(panel);
  const [sx, sy] = toScreen(tower.x, tower.y);
  panel.style.left = `${Math.max(10, Math.min(window.innerWidth - 238, sx + 26))}px`;
  panel.style.top = `${Math.max(10, Math.min(window.innerHeight - 330, sy - 120))}px`;
  state.towerPanel = panel;
  state.panelTower = tower;
  tower.node.classList.add('selected');
  panel.querySelectorAll('.tp-buy').forEach((button) => button.addEventListener('click', () => buyTrack(tower)));
  panel.querySelector('.tp-sell').addEventListener('click', () => sellTower(tower));
  refreshPanelAfford();
}

function closeTowerPanel() {
  if (state.panelTower && state.panelTower.node) state.panelTower.node.classList.remove('selected');
  if (state.towerPanel) { state.towerPanel.remove(); state.towerPanel = null; }
  state.panelTower = null;
}

function sellTower(tower) {
  if (coopGuest()) { coopIntent({ a: 'sell', t: state.towers.indexOf(tower) }); closeTowerPanel(); return; }
  const refund = Math.floor(trackInvested(tower) * 0.7);
  state.cash += refund;
  tower.node.remove();
  if (tower.pad) {
    const padNode = document.querySelector(`[data-pad="${tower.pad[0]},${tower.pad[1]}"]`);
    if (padNode) padNode.classList.remove('occupied');
  }
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
  for (const tower of state.towers) tower.boost = 1;
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
  const es = effStats(tower);
  // Installed tiers can rewrite chassis rules — Satellite Comms grants the
  // Shotgunner anti-air coverage without an AA pad link.
  const rule = { ...(TOWER_RULES[tower.id] || {}) };
  if (es.air) rule.air = es.air;
  const rng = es.infinite ? 9999 : es.rng;
  // Stickiness: pad AA guns ride their target until it dies or escapes the ring —
  // re-picking fresher flyers leaves every drone one burst short of dying.
  if (tower.onPad && tower.target && tower.target.alive && tower.target.t.flying) {
    const [sx, sy] = posOf(tower.target);
    if (Math.hypot(sx - tower.x, sy - tower.y) <= rng) return tower.target;
  }
  let pool = state.enemies.filter((enemy) => {
    if (!enemy.alive) return false;
    if (rule.air === 'no' && enemy.t.flying && !tower.onPad) return false;
    const [ex, ey] = posOf(enemy);
    return rng > 900 || Math.hypot(ex - tower.x, ey - tower.y) <= rng;
  });
  if (!pool.length) {
    tower.target = null;
    return null;
  }
  // Ground-only units linked to an AA pad are the only anti-air there — they
  // prioritize flyers, or drones sail past while track-walkers soak every shot.
  // Pad guns lead the NEAREST flyer: it has the longest flight time left inside
  // the range ring, so the burst actually finishes before the drone exits.
  if (rule.air === 'no' && tower.onPad) {
    const flying = pool.filter((enemy) => enemy.t.flying);
    if (flying.length) {
      tower.target = flying.reduce((best, enemy) => (enemy.dist < best.dist ? enemy : best));
      return tower.target;
    }
  }
  if (rule.air === 'prefer') {
    const flying = pool.filter((enemy) => enemy.t.flying);
    if (flying.length) pool = flying;
  }
  // Priority: the hostile furthest along the track (closest to the core).
  tower.target = pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
  return tower.target;
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
  let dmg = effStats(tower).dmg;
  const [tx, ty] = posOf(target);
  // Pads overcharge linked units against flying hostiles.
  if (tower.onPad && target.t.flying) dmg *= PAD_AIR_BOOST;
  switch (tower.id) {
    case 'sentinel': {
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-tracer');
      break;
    }
    case 'lazermortar': {
      const shell = svgNode('circle', { class: 'fx-shell', r: 4, cx: tower.x, cy: tower.y });
      state.layers.fx.appendChild(shell);
      state.projectiles.push({ kind: 'shell', x: tower.x, y: tower.y, tx, ty, speed: 260, dmg, splash: effStats(tower).splash || 30, node: shell });
      break;
    }
    case 'shotgunner': {
      // Scattergun: the whole blast ring takes the hit instantly — no projectile phase.
      const blast = effStats(tower).splash || 15;
      for (const enemy of state.enemies) {
        if (!enemy.alive) continue;
        const [px, py] = posOf(enemy);
        if (Math.hypot(px - tx, py - ty) <= blast) damageEnemy(enemy, dmg);
      }
      // Pellet fan: three amber streaks fanned around the aim line.
      const aim = Math.atan2(ty - tower.y, tx - tower.x);
      const span = Math.hypot(tx - tower.x, ty - tower.y);
      for (const off of [-0.24, 0, 0.24]) {
        const px = tower.x + Math.cos(aim + off) * span;
        const py = tower.y + Math.sin(aim + off) * span;
        const pellet = svgNode('line', { class: 'fx-line fx-pellet', x1: tower.x, y1: tower.y, x2: px, y2: py, 'stroke-width': 2.5 });
        state.layers.fx.appendChild(pellet);
        setTimeout(() => pellet.remove(), 300);
      }
      fxRing(tx, ty, 'fx-ring-amber');
      break;
    }
    case 'virus': {
      // Melee swarm: blades land instantly — no projectile phase at all.
      damageEnemy(target, dmg);
      const slash = svgNode('line', { class: 'fx-line fx-tracer fx-slash', x1: tower.x, y1: tower.y, x2: tx, y2: ty, 'stroke-width': 3 });
      state.layers.fx.appendChild(slash);
      setTimeout(() => slash.remove(), 160);
      fxRing(tx, ty, 'fx-ring-virus');
      break;
    }
    default: {
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-tracer');
      break;
    }
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
          if (Math.hypot(px - p.tx, py - p.ty) <= (p.splash || 40)) damageEnemy(enemy, p.dmg);
        }
      } else {
        p.x += (dx / Math.hypot(dx, dy)) * step;
        p.y += (dy / Math.hypot(dx, dy)) * step;
      }
      p.node.setAttribute('cx', p.x.toFixed(1));
      p.node.setAttribute('cy', p.y.toFixed(1));
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
    if (coopGuest()) {
      coopIntent({ a: 'place', id: state.building.id, x, y });
      floatText(x, y - 20, 'SYNC → SQUAD LEAD', 'sync-float');
      setBuilding(null);
      return;
    }
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
function notifyRoomEnded() {
  // Mission concluded while deployed from a squad room — unlock the bay for everyone.
  try {
    if (typeof sendToService === 'function' && typeof currentRoom !== 'undefined' && currentRoom) {
      sendToService({ type: 'end' });
    }
  } catch { /* room service optional — solo missions never hit this. */ }
}

// --- Squad sync: host-authoritative state relay -----------------------------------------
// Solo missions run a purely local sim. Squad missions (Node room or a LOCAL bay)
// elect the room lead as host: the host runs the full simulation and broadcasts
// ~8Hz snapshots; every other commander renders from those snapshots and ships
// intents (deploy / install / salvage) back to the host for validation.
function coopRole() {
  const bridge = window.CBZCoopBridge;
  return bridge && bridge.role ? bridge.role : 'solo';
}
const coopHost = () => coopRole() === 'host';
const coopGuest = () => coopRole() === 'guest';

function coopBroadcast() {
  const bridge = window.CBZCoopBridge;
  if (!bridge || !bridge.send) return;
  const boss = state.enemies.find((enemy) => enemy.alive && enemy.t.boss);
  bridge.send({
    k: 'sync',
    m: state.mode, w: state.waveIndex, c: Math.round(state.cash), b: Math.max(0, Math.ceil(state.baseHp)),
    kk: state.kills, bk: state.bossesKilled, er: Math.round(state.earned),
    sq: state.syncSeq || 0, st: state.syncTitle || '',
    tw: state.towers.map((tower, index) => [index, tower.id, Math.round(tower.x), Math.round(tower.y), tower.lvl || 0, tower.onPad ? 1 : 0]),
    en: state.enemies.filter((enemy) => enemy.alive).map((enemy) => [enemy.nid, enemy.key, Math.round(enemy.fx), Math.round(enemy.fy), Math.round(enemy.hp), enemy.maxHp, Math.round(enemy.shield || 0), enemy.t.flying ? 1 : 0]),
    bo: boss ? [boss.nid, Math.round(boss.hp), boss.maxHp, Math.round(boss.shield || 0)] : null,
  });
}

function coopIntent(payload) {
  const bridge = window.CBZCoopBridge;
  if (bridge && bridge.send) bridge.send({ k: 'intent', ...payload });
}

function coopApplyIntent(message) {
  if (!message) return;
  if (message.a === 'place') {
    const entry = window.CBZShop && CBZShop.TOWERS.find((item) => item.id === message.id);
    if (!entry || !canPlace(message.x, message.y).ok) return;
    placeTower(entry, message.x, message.y);
  } else if (message.a === 'up') {
    const tower = state.towers[message.t];
    if (tower) buyTrack(tower);
  } else if (message.a === 'sell') {
    const tower = state.towers[message.t];
    if (tower) sellTower(tower);
  }
}

function coopApplySync(snap) {
  if (!state.guestMap) return;
  state.mode = snap.m === 'waves' || snap.m === 'countdown' ? snap.m : state.mode;
  state.waveIndex = snap.w;
  state.cash = snap.c;
  state.baseHp = snap.b;
  state.kills = snap.kk;
  state.bossesKilled = snap.bk;
  state.earned = snap.er;
  if (snap.sq && snap.sq !== state.lastSyncSeq) {
    state.lastSyncSeq = snap.sq;
    if (snap.st) banner(snap.st, '// SQUAD LINK', 'banner-wave');
  }
  // Towers appear as the host builds them; ladder installs repaint their rings.
  const seenTowers = new Set();
  for (const [gid, id, x, y, lvl, pad] of snap.tw) {
    seenTowers.add(gid);
    let tower = state.towers.find((item) => item.gid === gid);
    if (!tower && window.CBZShop) {
      const entry = CBZShop.TOWERS.find((item) => item.id === id);
      if (!entry) continue;
      const node = towerNode(entry, x, y);
      state.layers.towers.appendChild(node);
      tower = { id, entry, x, y, node, head: node.querySelector('.tw-head'), cd: 0, boost: 1, lvl, gid, onPad: Boolean(pad), guest: true };
      state.towers.push(tower);
      node.classList.add('placed');
      setTimeout(() => node.classList.remove('placed'), 620);
    } else if (tower && tower.lvl !== lvl) {
      tower.lvl = lvl;
      paintTowerRange(tower);
    }
  }
  state.towers = state.towers.filter((tower) => {
    if (tower.guest && !seenTowers.has(tower.gid)) { tower.node.remove(); return false; }
    return true;
  });
  // Enemies keyed by host spawn id: create missing, refresh bars, drop the dead.
  const alive = new Set();
  for (const [nid, key, x, y, hp, maxHp, shield] of snap.en) {
    alive.add(nid);
    let enemy = state.guestMap.get(nid);
    if (!enemy) {
      const t = ENEMY_TYPES[key];
      if (!t) continue;
      const g = svgNode('g', { class: `enemy e-${key}${t.boss ? ' e-boss' : ''}` });
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
      state.layers.enemies.appendChild(g);
      enemy = { key, t, node: g, fill, shieldFill, hp, maxHp, shield, maxShield: t.shield || 0, alive: true, gx: x, gy: y, fx: x, fy: y, angle: 0, guest: true, guestNid: nid };
      state.guestMap.set(nid, enemy);
      g.classList.add('spawn-in');
      setTimeout(() => g.classList.remove('spawn-in'), 420);
    }
    enemy.gx = x;
    enemy.gy = y;
    if (enemy.hp !== hp || enemy.shield !== shield) {
      enemy.hp = hp;
      enemy.shield = shield;
      paintBars(enemy);
    }
  }
  for (const [nid, enemy] of state.guestMap) {
    if (!alive.has(nid)) {
      enemy.node.remove();
      state.guestMap.delete(nid);
    }
  }
  state.enemies = [...state.guestMap.values()];
  updateHud();
  updateBossBar();
}

function guestFrame(dt) {
  const k = Math.min(1, dt * 12);
  for (const enemy of state.guestMap.values()) {
    enemy.fx += (enemy.gx - enemy.fx) * k;
    enemy.fy += (enemy.gy - enemy.fy) * k;
    enemy.node.setAttribute('transform', `translate(${enemy.fx.toFixed(1)} ${enemy.fy.toFixed(1)})`);
  }
  updateBossBar();
}

function coopHandle(message) {
  if (!message) return;
  if (message.k === 'sync') { if (coopGuest()) coopApplySync(message); return; }
  if (message.k === 'intent') { if (coopHost()) coopApplyIntent(message); return; }
  if (message.k === 'over') { if (coopGuest() && state.mode !== 'over') endMission(Boolean(message.win), true); return; }
}

window.CBZCombat = {
  startMission,
  abort,
  coopHandle,
  active: () => state.mode !== 'idle',
  // Read-only telemetry for QA + tests.
  stats: () => ({ mode: state.mode, wave: state.waveIndex + 1, kills: state.kills, cash: Math.round(state.cash), base: state.baseHp, towers: state.towers.length, enemies: state.enemies.filter((enemy) => enemy.alive).length, towersDetail: state.towers.map((t) => ({ id: t.id, onPad: !!t.onPad })), flyingAlive: state.enemies.filter((e) => e.alive && e.t.flying).length }),
};
})();
