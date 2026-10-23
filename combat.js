// Core Breach: Zero — Combat Protocol (Easy Mode).
// Loaded after app.js: uses its globals (BATTLE_MAPS, svgNode, playSound, showToast...).
// Mode voting (EASY + MEDIUM) + per-protocol wave ladders + enemies that follow every map's tracks and mechanics.
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
  hexbug: { name: 'HEX CRAWLER', tag: 'REGEN', hp: 55, speed: 58, size: 10, bounty: 12, dmg: 2, color: '#6ee7a0', regen: 0.03, ability: 'Nanite Weave — knits 3% hull back per second. Burst it down or it outlives your DPS.' },
  juggernaut: { name: 'DATA JUGGERNAUT', tag: 'SUPERARMOR', hp: 320, speed: 24, size: 17, bounty: 55, dmg: 5, color: '#98a7b8', armor: 0.45, ability: 'Ablative megaplate — absorbs 45% of all incoming damage.' },
  phantom: { name: 'PHANTOM PACKET', tag: 'PHASE', hp: 40, speed: 70, size: 9, bounty: 14, dmg: 2, color: '#9ad1ff', blink: { every: 3.2, jump: 90 }, ability: 'Phase Jump — blinks 90u up the lane every few seconds, dodging chokepoint DPS.' },
  warden: { name: 'FIREWALL WARDEN', tag: 'HARD BOSS', hp: 2400, speed: 31, size: 23, bounty: 420, dmg: 12, color: '#ff8a3d', boss: true, shield: 700, ability: 'Packet Storm — spills 4 Hex Crawlers at 60% hull. Shield Lattice — spawns with a 700 HP shield.' },
};

// --- Easy Mode: 20 waves, 6 boss encounters ---------------------------------------
// Wave pressure compounds: every wave index adds +10% enemy HP on top of the
// roster, so the same towers that cruised wave 3 start bleeding around wave 8-10
// unless the defense network grows with it. Surge modifiers stack on top.
const WAVE_HP_SCALE = 0.12;  // +12% HP per wave index — pressure compounds faster
const SURGE_MODS = {
  overclock: { hp: 1, speed: 1.25, label: 'OVERCLOCK SURGE', note: 'HOSTILES RUN 25% FASTER' },
  hardened: { hp: 1.4, speed: 1, label: 'HARDENED HULLS', note: 'HOSTILES +40% HP' },
  crush: { hp: 1.5, speed: 1.15, label: 'CRUSH PROTOCOL', note: 'HOSTILES +50% HP · 15% FASTER' },
  hellfire: { hp: 1.65, speed: 1.2, label: 'HELLFIRE SURGE', note: 'HOSTILES +65% HP · 20% FASTER' },
  dawnfire: { hp: 1.8, speed: 1.25, label: 'DAWNFIRE SURGE', note: 'HOSTILES +80% HP · 25% FASTER' },
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

// --- Medium Protocol: 30 waves, denser, angrier -----------------------------------
// Same roster, but the pressure dials all turn clockwise: bigger groups, more
// overlapping boss waves, more surge modifiers and a steeper HP curve. The
// final wave throws the CORE BREACH: ZERO overseer at you WITH a mini-boss escort.
const MEDIUM_WAVES = [
  { groups: [['glitched', 22], ['runner', 12]] },
  { groups: [['glitched', 20], ['file', 18], ['runner', 12]] },
  { groups: [['shielded', 16], ['glitched', 20]], mod: 'hardened' },
  { groups: [['runner', 28], ['drone', 10], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 16], ['glitched', 22], ['file', 20]], phase: 'AIR PRESSURE' },
  { groups: [['nullcore', 7], ['file', 32]], mod: 'overclock' },
  { groups: [['shielded', 22], ['drone', 18], ['runner', 16]] },
  { groups: [['nullcore', 8], ['leak', 1], ['file', 26]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 42], ['runner', 22]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 1], ['leak', 1], ['shielded', 18]], phase: 'DOUBLE TROUBLE', mod: 'hardened' },
  { groups: [['nullcore', 13], ['drone', 22], ['runner', 20]] },
  { groups: [['drone', 30], ['runner', 26]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 26], ['nullcore', 11], ['glitched', 32]], mod: 'hardened' },
  { groups: [['virus', 2], ['file', 46], ['drone', 20]], phase: 'VIRULENT SURGE' },
  { groups: [['leak', 2], ['nullcore', 13], ['drone', 24]], phase: 'LEAK STORM', mod: 'hardened' },
  { groups: [['runner', 36], ['drone', 22], ['file', 32]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 15], ['shielded', 24], ['virus', 1]], phase: 'ARMOR COLUMN' },
  { groups: [['drone', 32], ['runner', 28], ['glitched', 36]], mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 2], ['shielded', 22]], phase: 'COMMANDER WALL', mod: 'hardened' },
  { groups: [['nullcore', 17], ['drone', 26], ['file', 42]], phase: 'DENSE ASSAULT' },
  { groups: [['runner', 42], ['drone', 26]], phase: 'FULL SPRINT', mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 2], ['nullcore', 13]], phase: 'TRIPLE THREAT', mod: 'hardened' },
  { groups: [['shielded', 30], ['drone', 28], ['runner', 30], ['file', 38]], mod: 'overclock' },
  { groups: [['nullcore', 15], ['virus', 2], ['leak', 2], ['drone', 26]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hardened' },
  { groups: [['file', 48], ['nullcore', 14], ['drone', 24]], phase: 'GRID LOCK', mod: 'overclock' },
  { groups: [['shielded', 30], ['nullcore', 14], ['runner', 30]], mod: 'hardened' },
  { groups: [['virus', 2], ['leak', 2], ['drone', 28]], phase: 'SIEGE PAIR', mod: 'overclock' },
  { groups: [['nullcore', 16], ['file', 50], ['glitched', 40]], phase: 'DEAD STACK' },
  { groups: [['runner', 40], ['drone', 30], ['shielded', 26]], phase: 'LAST BREACH', mod: 'overclock' },
  { groups: [['shielded', 26], ['nullcore', 13], ['overseer', 1], ['virus', 1], ['leak', 1], ['drone', 26]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];

// --- Hard Protocol: 30 waves of pure hell -------------------------------------------
// The HELL PROTOCOL pass (escalated twice): HARD ladders the Medium roster with
// four elite classes (Hex Crawlers regen, Data Juggernauts tank, Phantom Packets
// blink past chokepoints, Firewall Wardens spill swarms) and cranks every dial
// past the stops: +20-40% hostile counts per wave, armor columns from wave 7,
// Juggernaut packs from wave 10, doubled boss stacks mid-ladder, HELLFIRE
// surges on SIX of the ugliest indices and a final escort of 3 Wardens + 2
// Viruses + 2 Leaks behind the overseer. The compounding hull curve does the rest.
const HARD_WAVES = [
  { groups: [['glitched', 30], ['runner', 20]] },
  { groups: [['glitched', 28], ['file', 28], ['runner', 20]] },
  { groups: [['shielded', 24], ['glitched', 30], ['hexbug', 8]], phase: 'NANITE DEBUT', mod: 'hardened' },
  { groups: [['runner', 40], ['drone', 18], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS' },
  { groups: [['drone', 24], ['glitched', 32], ['phantom', 10]], phase: 'PHASE PRESSURE' },
  { groups: [['nullcore', 12], ['file', 44], ['hexbug', 10]], mod: 'overclock' },
  { groups: [['shielded', 30], ['drone', 26], ['runner', 24]], mod: 'hardened' },
  { groups: [['nullcore', 14], ['leak', 1], ['file', 36], ['phantom', 10]], phase: 'MINI-BOSS // MEMORY LEAK' },
  { groups: [['file', 58], ['runner', 30], ['hexbug', 14]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 2], ['leak', 1], ['shielded', 26], ['juggernaut', 3]], phase: 'DOUBLE TROUBLE', mod: 'hardened' },
  { groups: [['nullcore', 20], ['drone', 30], ['runner', 28]], mod: 'overclock' },
  { groups: [['drone', 42], ['runner', 34], ['phantom', 12]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 34], ['nullcore', 16], ['glitched', 42], ['hexbug', 12]], mod: 'hellfire' },
  { groups: [['virus', 2], ['leak', 2], ['file', 56], ['drone', 28], ['juggernaut', 3]], phase: 'VIRULENT SURGE', mod: 'hardened' },
  { groups: [['leak', 2], ['nullcore', 18], ['drone', 32]], phase: 'LEAK STORM', mod: 'hellfire' },
  { groups: [['runner', 48], ['drone', 30], ['file', 44], ['phantom', 12]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 20], ['shielded', 32], ['virus', 2], ['juggernaut', 4]], phase: 'ARMOR COLUMN', mod: 'hardened' },
  { groups: [['drone', 44], ['runner', 36], ['glitched', 48]], mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 2], ['shielded', 30], ['warden', 1]], phase: 'FIREWALL RISING', mod: 'hardened' },
  { groups: [['nullcore', 22], ['drone', 34], ['file', 54], ['juggernaut', 3], ['phantom', 10]], phase: 'DENSE ASSAULT', mod: 'hellfire' },
  { groups: [['runner', 54], ['drone', 34], ['hexbug', 16]], phase: 'FULL SPRINT', mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 3], ['nullcore', 18], ['juggernaut', 4]], phase: 'TRIPLE THREAT', mod: 'hellfire' },
  { groups: [['shielded', 38], ['drone', 36], ['runner', 38], ['file', 50]], mod: 'overclock' },
  { groups: [['nullcore', 20], ['virus', 3], ['leak', 3], ['drone', 34], ['warden', 2]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hardened' },
  { groups: [['file', 62], ['nullcore', 20], ['drone', 32], ['phantom', 14]], phase: 'GRID LOCK', mod: 'hellfire' },
  { groups: [['shielded', 38], ['nullcore', 20], ['runner', 38], ['juggernaut', 5]], mod: 'hellfire' },
  { groups: [['virus', 4], ['leak', 3], ['drone', 36], ['hexbug', 16]], phase: 'SIEGE WALL', mod: 'overclock' },
  { groups: [['nullcore', 22], ['file', 62], ['glitched', 50], ['warden', 2]], phase: 'DEAD STACK', mod: 'hardened' },
  { groups: [['runner', 52], ['drone', 38], ['shielded', 34], ['phantom', 14]], phase: 'LAST BREACH', mod: 'overclock' },
  { groups: [['shielded', 34], ['nullcore', 20], ['warden', 3], ['overseer', 1], ['virus', 2], ['leak', 2], ['drone', 36], ['juggernaut', 5], ['phantom', 10]], phase: 'FINAL BOSS // CORE BREACH: ZERO' },
];

// --- Crimson Dawn: 20 waves of the impossible (LIMITED-TIME EVENT) ------------------
// The event protocol makes HARD look like a tutorial. Elite classes only get
// featured from wave 3, boss stacks land every other wave from wave 10, DAWNFIRE
// surges (the strongest modifier in the game) burn four of the last seven waves
// and the final hour buries the overseer under 2 Wardens, 3 Viruses and 3 Leaks
// under DAWNFIRE. Hull pressure compounds at 1.13x per wave — wave 10 ≈ 3x,
// wave 20 ≈ 10.2x roster hull. The prize: the DAWNBRINGER relic blueprint.
const CRIMSON_WAVES = [
  { groups: [['glitched', 34], ['runner', 26]] },
  { groups: [['shielded', 30], ['glitched', 36], ['runner', 24]], mod: 'overclock' },
  { groups: [['drone', 30], ['file', 44], ['hexbug', 12]], phase: 'NANITE DEBUT', mod: 'hardened' },
  { groups: [['runner', 48], ['drone', 24], ['virus', 1]], phase: 'MINI-BOSS // SYSTEM VIRUS', mod: 'overclock' },
  { groups: [['shielded', 36], ['drone', 32], ['phantom', 14]], phase: 'PHASE PRESSURE', mod: 'hardened' },
  { groups: [['nullcore', 18], ['file', 52], ['hexbug', 14]], mod: 'overclock' },
  { groups: [['shielded', 40], ['nullcore', 16], ['runner', 34]], phase: 'ARMOR COLUMN', mod: 'crush' },
  { groups: [['nullcore', 18], ['leak', 2], ['file', 44], ['phantom', 12]], phase: 'MINI-BOSS // MEMORY LEAK', mod: 'hardened' },
  { groups: [['file', 66], ['runner', 38], ['hexbug', 18]], phase: 'SWARM STORM', mod: 'overclock' },
  { groups: [['virus', 3], ['leak', 2], ['shielded', 34], ['juggernaut', 5]], phase: 'DOUBLE TROUBLE', mod: 'dawnfire' },
  { groups: [['drone', 48], ['runner', 40], ['phantom', 14]], phase: 'AIR ARMADA', mod: 'overclock' },
  { groups: [['shielded', 44], ['nullcore', 22], ['glitched', 52], ['hexbug', 16]], phase: 'DAWNFIRE COLUMN', mod: 'dawnfire' },
  { groups: [['virus', 3], ['leak', 3], ['file', 62], ['drone', 34], ['juggernaut', 4]], phase: 'VIRULENT SURGE', mod: 'hardened' },
  { groups: [['leak', 3], ['nullcore', 22], ['drone', 38]], phase: 'LEAK STORM', mod: 'hellfire' },
  { groups: [['runner', 58], ['drone', 36], ['file', 52], ['phantom', 16]], phase: 'BLITZ RUN', mod: 'overclock' },
  { groups: [['nullcore', 24], ['shielded', 40], ['virus', 3], ['juggernaut', 6]], phase: 'ARMOR COLUMN', mod: 'dawnfire' },
  { groups: [['drone', 52], ['runner', 44], ['glitched', 56]], mod: 'overclock' },
  { groups: [['virus', 4], ['leak', 3], ['shielded', 38], ['warden', 2]], phase: 'FIREWALL RISING', mod: 'hardened' },
  { groups: [['nullcore', 26], ['file', 68], ['drone', 40], ['phantom', 16], ['warden', 2]], phase: 'PRE-FINAL ONSLAUGHT', mod: 'hellfire' },
  { groups: [['shielded', 40], ['nullcore', 24], ['warden', 2], ['overseer', 1], ['virus', 3], ['leak', 3], ['drone', 40], ['juggernaut', 5], ['phantom', 12]], phase: 'FINAL DAWN // THE CRIMSON HOUR', mod: 'dawnfire' },
];

// Per-protocol pressure: Medium compounds HP faster than Easy on top of denser waves.
// HARD dials snap off twice — hull pressure COMPOUNDS every wave
// ((1.10)^index: wave 10 ≈ 2.4x, wave 20 ≈ 6.1x, wave 30 ≈ 15.9x roster hull —
// the run escalates, it never plateaus) and every hostile moves 15% faster.
// CRIMSON DAWN (event) compounds steeper still at 1.13x — wave 20 ≈ 21.7x hull —
// and every hostile moves 18% faster. Nothing comes back from that.
const MODE_HP_SCALE = { easy: WAVE_HP_SCALE, medium: 0.14, hard: 0.17 }; // legacy linear curve (easy/medium)
const MODE_HP_GROWTH = { hard: 0.1, crimson: 0.13 }; // compounding hull curves — hell and the dawn are exponential
const MODE_SPEED = { hard: 1.15, crimson: 1.18 };     // hostile protocol speed multipliers
// Easy pass: commanders (bosses) spawn with 10% less hull — a gentler first exposure.
const EASY_BOSS_RELIEF = 0.9;
// Hard pass: a boss that breaches the core hits it for 10x damage — a leaked
// commander all but ends the run (virus 60, leak 80, warden 120, overseer 250).
// Crimson Dawn keeps the same rule: at 21x hull, one leak should end you.
const MODE_BOSS_LEAK = { hard: 10, crimson: 10 };
const WAVES = { easy: EASY_WAVES, medium: MEDIUM_WAVES, hard: HARD_WAVES, crimson: CRIMSON_WAVES };
function missionWaves() { return WAVES[state.protocol] || EASY_WAVES; }

// Pace pass: wider spawn gaps so waves stream in instead of dumping all at once.
const SPAWN_GAP = { file: 0.45, glitched: 0.75, runner: 0.65, shielded: 1.0, drone: 0.95, nullcore: 1.85, virus: 2.5, leak: 2.5, overseer: 2.75, hexbug: 0.7, juggernaut: 2.2, phantom: 0.8, warden: 3.0 };
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
  sniper: { air: 'no' },
  shredder: { air: 'no' },     // chaff mulcher — pad links grant AA like the Sentinel
  virus: { air: 'yes' },
  zeroday: { air: 'no' },      // economy rig — never fires; rule kept for pad-link copy
  corpseblossom: { air: 'no' }, // spawner — never targets; veins curse flyers directly
  dawnbreaker: { air: 'yes' },  // CRIMSON RELIC — dawn-forged lance tracks air natively
  missilesilo: { air: 'yes' },  // MISSILE SILO — warheads track air and ground without a pad
  dronespawner: { air: 'no' },  // spawner — never targets; strike drones hit anything they intercept
};

// One-off rigs: only a single unit of these chassis may deploy per commander.
const UNIQUE_TOWERS = new Set(['zeroday', 'corpseblossom', 'dronespawner']);
const NUKE_DAMAGE = 2200;      // Nuclear Fall Out: flat strike damage inside the blast
const NUKE_RADIUS = 240;       // strike decimates everything inside this ring
const NUKE_COST = 500;         // salvage price per cast
const NUKE_COOLDOWN = 300;     // seconds between casts
const WASTE_RADIUS = 130;      // radioactive aftermath pool
const WASTE_SECONDS = 100;     // fallout lingers this long
const WASTE_DPS = 30;          // small tick damage inside the fallout
const SUMMON_CAP = 60;         // global ceiling so Blossom chains stay performant

// --- Upgrade ladder data rides on the blueprint catalog (shop.js entry.track) ------
// Nothing module-shaped lives here anymore: one chassis, one linear ladder.


// --- Mission state ----------------------------------------------------------------
const state = {
  mode: 'idle', // idle | vote | countdown | waves | over
  protocol: 'easy', speed2x: false, bossHpMult: 1, speedBtn: null, nukeBtn: null,
  nukeAim: false, crosshair: null, wasteZones: [],
  map: null, samplers: [], gateEvents: [], zoneRanges: [],
  waveIndex: -1, queue: [], spawnGap: 0, intermission: 0, countdown: 0,
  cash: 0, baseHp: BASE_MAX, enemies: [], kills: 0, bossesKilled: 0, earned: 0, clock: 0, nidSeq: 0,
  towers: [], projectiles: [], building: null, ghost: null, bar: null, towerPanel: null, panelTower: null,
  bonusNc: 0, mouseX: 500, mouseY: 300, mouseOn: false,
  raf: 0, last: 0,
  hud: null, bossBar: null, tip: null, tipTarget: null, votePanel: null, endPanel: null, banner: null,
  layers: null, deployBtn: null,
  corpseLust: 0, // reserved telemetry: total Blood Lust banked across Blossoms
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
  } else if (key === 'hexbug') {
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 13) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 9) });
    add('circle', { class: 'e-core', r: 3 });
  } else if (key === 'juggernaut') {
    add('rect', { class: 'e-ghost', x: -14, y: -12, width: 28, height: 24 });
    add('rect', { class: 'e-body', x: -10, y: -8, width: 20, height: 16 });
    add('line', { class: 'e-plate', x1: -6, y1: 0, x2: 6, y2: 0 });
    add('rect', { class: 'e-core', x: -3, y: -4, width: 6, height: 8 });
  } else if (key === 'phantom') {
    add('circle', { class: 'e-ghost e-ghost-2', r: 11 });
    add('polygon', { class: 'e-body', points: '0,-9 8,0 0,9 -8,0' });
    add('circle', { class: 'e-core', r: 2.5 });
  } else if (key === 'warden') {
    add('circle', { class: 'e-orbit', r: 24 });
    add('polygon', { class: 'e-ghost', points: hexPoints(0, 0, 20) });
    add('polygon', { class: 'e-body', points: hexPoints(0, 0, 16) });
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      add('line', { class: 'e-plate', x1: Math.cos(a) * 8, y1: Math.sin(a) * 8, x2: Math.cos(a) * 15, y2: Math.sin(a) * 15 });
    }
    add('circle', { class: 'e-core', r: 5.5 });
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
  const g = svgNode('g', { class: `enemy e-${key}${t.boss ? ' e-boss' : ''}${state.protocol === 'crimson' ? ` e-crimson${state.surgeMod ? ' e-surge' : ''}` : ''}` });
  // Shapes live in an inner chassis so CSS spawn/death/hover animations can scale or
  // bob them freely — a CSS transform on this outer group would override the
  // per-frame position attribute and teleport the unit toward the board corner.
  const chassis = svgNode('g', { class: 'e-chassis' });
  for (const node of shapeFor(key, t)) chassis.appendChild(node);
  g.appendChild(chassis);
  // The dawn marks its own: a pulsing crimson aura ring orbits every hostile.
  if (state.protocol === 'crimson') g.insertBefore(svgNode('circle', { class: 'e-aura', r: t.size + 7 }), chassis);
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
    // Wave pressure: HP scales per wave index, surge modifiers stack on top.
    // Easy relief: commanders (bosses) spawn with slightly less hull on EASY.
    hp: Math.round(t.hp * (t.boss ? state.bossHpMult : 1) * (state.hpScale || 1)), maxHp: Math.round(t.hp * (t.boss ? state.bossHpMult : 1) * (state.hpScale || 1)), shield: 0, maxShield: t.shield || 0,
    pathIdx, dist: debugFreeze ? 260 + Math.random() * 480 : 0, speed: t.speed * (state.surgeSpeed || 1) * (MODE_SPEED[state.protocol] || 1), alive: true,
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
  if (state.protocol === 'crimson') fxRing(x, y, 'fx-ring-crimson'); // the vein spits them out burning
  setTimeout(() => g.classList.remove('spawn-in'), 420);
  if (t.boss) { banner(t.name, '// HOSTILE COMMANDER DETECTED', 'banner-red'); updateBossBar(); }
  return enemy;
}

function damageEnemy(enemy, amount, opts = {}) {
  if (enemy.friendly && !opts.friendlyFire) return; // Blossom summons shrug off friendly grid fire
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
  if (enemy.hp <= 0) killEnemy(enemy, opts.src);
  else paintBars(enemy);
}

function paintBars(enemy) {
  const barW = enemy.t.boss ? 34 : 22;
  enemy.fill.setAttribute('width', (barW * enemy.hp) / enemy.maxHp);
  enemy.fill.classList.toggle('low', enemy.hp / enemy.maxHp < 0.35);
  enemy.shieldFill.setAttribute('width', enemy.maxShield ? (barW * enemy.shield) / enemy.maxShield : 0);
}

function killEnemy(enemy, src) {
  if (!enemy.alive) return;
  enemy.alive = false;
  hideTip(enemy);
  if (enemy.friendly) {
    // Summons expire quietly — no bounty, no kill credit, no Blossom chains.
    enemy.node.classList.add('dying');
    setTimeout(() => enemy.node.remove(), 300);
    return;
  }
  // Zero Day tier-5 skim: enemy bounties pay +10% while the rig runs that tier.
  const skim = state.towers.some((tower) => tower.id === 'zeroday' && (effStats(tower).bounty || 0) > 0) ? 1.1 : 1;
  const payout = Math.round(enemy.t.bounty * skim);
  state.cash += payout;
  state.earned += payout;
  state.kills += 1;
  if (enemy.t.boss) state.bossesKilled += 1;
  const [x, y] = posOf(enemy);
  floatText(x, y - enemy.t.size - 6, `+$${payout}`, 'cash-float');
  fxRing(x, y, 'fx-ring-red');
  enemy.node.classList.add('dying');
  setTimeout(() => enemy.node.remove(), 300);
  corpseBlossomFeed(enemy, x, y, src);
  updateHud();
  if (enemy.t.boss) updateBossBar();
}

// --- Corpse Blossom: the dead rise and walk the lane backwards -------------------
function corpseBlossomFeed(enemy, x, y, src) {
  for (const tower of state.towers) {
    if (tower.id !== 'corpseblossom') continue;
    if (Math.hypot(x - tower.x, y - tower.y) > effStats(tower).rng) continue;
    const lvl = trackLevel(tower);
    if (lvl >= 4) {
      tower.lust = (tower.lust || 0) + (effStats(tower).lust || 1);
      floatText(tower.x, tower.y - 44, `BLOOD LUST ${tower.lust}`, 'lust-float');
      if (state.panelTower === tower) openTowerPanel(tower); // live lust counter
    }
    spawnSummon(enemy, tower, src === 'veins' && lvl >= 2);
  }
}

function spawnSummon(enemy, tower, stained) {
  if (state.enemies.filter((item) => item.friendly && item.alive).length >= SUMMON_CAP) return;
  const t = enemy.t;
  const es = effStats(tower);
  const bonus = stained ? 50 + (es.stainedPct ? Math.round(t.hp * 0.1) : 0) : 0;
  const hp = Math.max(1, Math.round(t.hp * (es.summonHp || 0.3)) + bonus);
  const g = svgNode('g', { class: `enemy e-summon e-${enemy.key}` });
  const chassis = svgNode('g', { class: 'e-chassis' });
  for (const node of shapeFor(enemy.key, t)) chassis.appendChild(node);
  g.appendChild(chassis);
  const barY = -(t.size + 13);
  g.appendChild(svgNode('rect', { class: 'hp-bg', x: -11, y: barY, width: 22, height: 3.4 }));
  const fill = svgNode('rect', { class: 'hp-fill', x: -11, y: barY, width: 22, height: 3.4 });
  g.appendChild(fill);
  const summon = {
    key: enemy.key, t, node: g, fill, shieldFill: fill, nid: ++state.nidSeq,
    hp, maxHp: hp, shield: 0, maxShield: t.shield || 0,
    pathIdx: enemy.pathIdx, dist: enemy.dist || 0,
    speed: t.speed * 0.85, alive: true, friendly: true, reverse: true,
    usedGates: new Set(), angle: 0,
  };
  if (t.flying) {
    // Dead flyers rise where they fell and fly the route BACK to the breach gate.
    const [gx, gy] = state.samplers[enemy.pathIdx].at(0);
    summon.flight = { sx: enemy.fx, sy: enemy.fy, tx: gx, ty: gy, total: Math.max(1, Math.hypot(gx - enemy.fx, gy - enemy.fy)) };
    summon.dist = 0;
    summon.fx = enemy.fx;
    summon.fy = enemy.fy;
  } else {
    const [px, py] = state.samplers[enemy.pathIdx].at(summon.dist);
    summon.fx = px;
    summon.fy = py;
  }
  g.setAttribute('transform', `translate(${summon.fx.toFixed(1)} ${summon.fy.toFixed(1)})`);
  const bloom = svgNode('circle', { class: 'fx-ring fx-bloom', cx: summon.fx, cy: summon.fy, r: 6 });
  state.layers.fx.appendChild(bloom);
  setTimeout(() => bloom.remove(), 720);
  g.classList.add('spawn-in');
  setTimeout(() => g.classList.remove('spawn-in'), 420);
  state.layers.enemies.appendChild(g);
  state.enemies.push(summon);
  fxRing(summon.fx, summon.fy, 'fx-ring-virus');
  floatText(summon.fx, summon.fy - t.size - 10, stained ? 'BLOOD STAINED RISES' : 'RISEN', 'summon-float');
  paintBars(summon);
  return summon;
}

function despawnSummon(summon) {
  summon.alive = false;
  fxRing(summon.fx, summon.fy, 'fx-ring-virus');
  summon.node.remove();
}

// Summons kamikaze: the first hostile they touch takes damage equal to the
// summon's full hull, then the corpse collapses.
function contactDamage(summon) {
  const [sx, sy] = [summon.fx, summon.fy];
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.friendly) continue;
    if (summon.flight || enemy.flight) {
      const [ex, ey] = posOf(enemy);
      if (Math.hypot(ex - sx, ey - sy) > 14) continue;
    } else if (enemy.pathIdx !== summon.pathIdx || Math.abs(enemy.dist - summon.dist) > 12) {
      continue;
    }
    damageEnemy(enemy, summon.maxHp, { src: 'summon' });
    despawnSummon(summon);
    return;
  }
}

function moveSummon(summon, dt) {
  if (debugFreeze || state.mode !== 'waves') return;
  if (summon.flight) {
    summon.dist += summon.speed * (1 - (summon.slow || 0)) * dt;
    if (summon.dist >= summon.flight.total) { despawnSummon(summon); return; }
    const [fx, fy] = flightPos(summon, summon.dist);
    summon.fx = fx;
    summon.fy = fy;
    summon.node.setAttribute('transform', `translate(${fx.toFixed(1)} ${fy.toFixed(1)})`);
    contactDamage(summon);
    return;
  }
  summon.dist -= summon.speed * (1 - (summon.slow || 0)) * dt;
  if (summon.dist <= 0) { despawnSummon(summon); return; }
  const [x, y] = state.samplers[summon.pathIdx].at(summon.dist);
  summon.fx = x;
  summon.fy = y;
  summon.node.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  contactDamage(summon);
}

// --- Drone Spawner: the carrier fabricates one-way strike drones ---------------------
// Every launchEvery seconds (while a hostile stands inside its ring) the
// carrier rolls a strike drone off the line: a friendly flyer that rockets
// across the grid with target lead and detonates on the first hostile it
// touches for its full payload. Rides the summon pipeline (flight + kamikaze
// contact), so it engages walkers and flyers alike and respects SUMMON_CAP.
function launchStrikeDrone(tower) {
  if (state.enemies.filter((item) => item.friendly && item.alive).length >= SUMMON_CAP) return false;
  const es = effStats(tower);
  const pool = state.enemies.filter((enemy) => {
    if (!enemy.alive || enemy.friendly) return false;
    const [px, py] = posOf(enemy);
    return Math.hypot(px - tower.x, py - tower.y) <= es.rng;
  });
  if (!pool.length) return false;
  const prey = pool.reduce((best, enemy) => (enemy.dist > best.dist ? enemy : best));
  // Lead the target: aim where the prey will be roughly one flight-time from now.
  const lead = 0.9;
  let aimX;
  let aimY;
  if (prey.flight) {
    const [fx, fy] = flightPos(prey, prey.dist + prey.speed * lead);
    aimX = fx;
    aimY = fy;
  } else {
    const future = Math.min(state.samplers[prey.pathIdx].len, prey.dist + prey.speed * (1 - (prey.slow || 0)) * lead);
    [aimX, aimY] = state.samplers[prey.pathIdx].at(future);
  }
  const t = { ...ENEMY_TYPES.drone, hp: Math.max(1, Math.round(es.drone || 70)), bounty: 0, dmg: 0, name: 'STRIKE DRONE', ability: 'One-way strike unit — detonates on the first hostile it intercepts.' };
  const g = svgNode('g', { class: 'enemy e-summon e-drone e-strike' });
  const chassis = svgNode('g', { class: 'e-chassis' });
  for (const node of shapeFor('drone', t)) chassis.appendChild(node);
  g.appendChild(chassis);
  const barY = -(t.size + 13);
  g.appendChild(svgNode('rect', { class: 'hp-bg', x: -11, y: barY, width: 22, height: 3.4 }));
  const fill = svgNode('rect', { class: 'hp-fill', x: -11, y: barY, width: 22, height: 3.4 });
  g.appendChild(fill);
  const total = Math.max(1, Math.hypot(aimX - tower.x, aimY - tower.y));
  const drone = {
    key: 'drone', t, node: g, fill, shieldFill: fill, nid: ++state.nidSeq,
    hp: t.hp, maxHp: t.hp, shield: 0, maxShield: 0,
    pathIdx: prey.pathIdx, dist: 0,
    speed: Math.max(110, t.speed * 1.5), alive: true, friendly: true, reverse: true,
    usedGates: new Set(), angle: 0,
    flight: { sx: tower.x, sy: tower.y, tx: aimX, ty: aimY, total },
    fx: tower.x, fy: tower.y,
  };
  g.setAttribute('transform', `translate(${tower.x.toFixed(1)} ${tower.y.toFixed(1)})`);
  const bloom = svgNode('circle', { class: 'fx-ring fx-bloom', cx: tower.x, cy: tower.y, r: 6 });
  state.layers.fx.appendChild(bloom);
  setTimeout(() => bloom.remove(), 720);
  state.layers.enemies.appendChild(g);
  state.enemies.push(drone);
  paintBars(drone);
  return true;
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
  const leakDmg = Math.round(enemy.t.dmg * (enemy.t.boss ? (MODE_BOSS_LEAK[state.protocol] || 1) : 1));
  state.baseHp = Math.max(0, state.baseHp - leakDmg);
  board.classList.remove('core-hit');
  void board.offsetWidth;
  board.classList.add('core-hit');
  setTimeout(() => board.classList.remove('core-hit'), 550);
  floatText(...corePos(), `-${leakDmg} CORE`, 'core-float');
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

// Cinematic Nuclear Fall Out impact: white-out flash over the whole board +
// twin expanding shockwave rings + the lingering fallout pool.
function fxNukeBlast(x, y) {
  const flash = document.createElement('div');
  flash.className = 'nuke-flash';
  battlefield.appendChild(flash);
  setTimeout(() => flash.remove(), 900);
  for (const [cls, delay] of [['fx-nuke-ring', 0], ['fx-nuke-ring slow', 150]]) {
    setTimeout(() => {
      const ring = svgNode('circle', { class: `fx-ring ${cls}`, cx: x, cy: y, r: 10 });
      state.layers.fx.appendChild(ring);
      setTimeout(() => ring.remove(), 1400);
    }, delay);
  }
  fxRing(x, y, 'fx-ring-red');
}

// Blood Purge: crimson shockwave swells to the full curse radius.
function fxPurgeBlast(tower) {
  const ring = svgNode('circle', { class: 'fx-ring fx-purge-ring', cx: tower.x, cy: tower.y, r: 8 });
  state.layers.fx.appendChild(ring);
  setTimeout(() => ring.remove(), 950);
  fxRing(tower.x, tower.y, 'fx-ring-virus');
}

// Blood Scream: screen-edge crimson vignette + every enraged summon shudders.
function fxScreamBlast(tower, buffed) {
  const vignette = document.createElement('div');
  vignette.className = 'scream-vignette';
  battlefield.appendChild(vignette);
  setTimeout(() => vignette.remove(), 1100);
  for (const summon of state.enemies) {
    if (!summon.alive || !summon.friendly) continue;
    summon.node.classList.add('screamed-flash');
    setTimeout(() => summon.node.classList.remove('screamed-flash'), 900);
  }
  fxRing(tower.x, tower.y, 'fx-ring-virus');
}

function floatText(x, y, text, cls) {
  const label = svgNode('text', { class: `float-text ${cls}`, x, y, 'text-anchor': 'middle' }, text);
  state.layers.fx.appendChild(label);
  setTimeout(() => label.remove(), 950);
}

// --- Main loop ------------------------------------------------------------------------
function tick(ts) {
  state.raf = requestAnimationFrame(tick);
  let dt = Math.min(0.05, (ts - state.last) / 1000 || 0);
  state.last = ts;
  if (state.speed2x) dt *= 2; // OVERDRIVE perk: the whole sim runs at double tempo
  state.clock += dt;
  if (coopGuest()) { guestFrame(dt); return; }
  if (state.mode === 'countdown') {
    state.countdown -= dt;
    const n = Math.ceil(state.countdown);
    if (n !== state.lastCount && n > 0) { state.lastCount = n; banner(String(n), '// DEPLOYING', 'banner-count'); playSound(); }
    if (state.countdown <= 0) beginWave(debugWave > 0 ? Math.min(missionWaves().length - 1, debugWave - 1) : 0);
  }
  if (state.mode === 'waves') runWaves(dt);
  tickWaste(dt);
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
  if (enemy.friendly) { moveSummon(enemy, dt); return; }
  if (debugFreeze || state.mode !== 'waves') return;
  if (enemy.stun > 0) {
    enemy.stun -= dt;
    enemy.node.classList.add('e-stunned');
    return;
  }
  enemy.node.classList.remove('e-stunned');
  if (enemy.corrupt && enemy.corrupt.t > 0) {
    // VIRUS CONTAGION: phase burn ticks every frame; kills credit the strain.
    enemy.corrupt.t -= dt;
    damageEnemy(enemy, enemy.corrupt.dps * dt, { phase: true, src: 'virus' });
    if (!enemy.alive) return;
  }
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
  if (enemy.t.regen && enemy.hp < enemy.maxHp) {
    enemy.hp = Math.min(enemy.maxHp, enemy.hp + enemy.maxHp * enemy.t.regen * dt);
    paintBars(enemy);
  }
  if (enemy.t.blink) {
    enemy.blinkTimer = (enemy.blinkTimer === undefined ? enemy.t.blink.every : enemy.blinkTimer) - dt;
    if (enemy.blinkTimer <= 0) {
      enemy.blinkTimer = enemy.t.blink.every;
      fxRing(...posOf(enemy), 'fx-ring-phantom');
      enemy.dist += enemy.t.blink.jump;
    }
  }
  if (enemy.t.boss && enemy.key === 'warden' && !enemy.stormed && enemy.hp <= enemy.maxHp * 0.6) {
    enemy.stormed = true;
    const lane = state.samplers[enemy.pathIdx];
    fxRing(...posOf(enemy), 'fx-ring-amber');
    for (let i = 0; i < 4; i++) {
      const spawn = spawnEnemy('hexbug', enemy.pathIdx);
      spawn.dist = Math.min(lane.len - 8, Math.max(0, enemy.dist - 18 + i * 9));
    }
    banner('FIREWALL WARDEN', '// PACKET STORM — HEX CRAWLERS SPILLED', 'banner-red');
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
  } else if (!state.enemies.some((enemy) => enemy.alive && !enemy.friendly) && state.intermission <= 0) {
    // Income pass: cleared waves pay build money. Rates trimmed — the upgrade
    // ladder is the real salvage sink now, maxing a chassis must hurt.
    // Zero Day rigs skim their wave yield on top.
    let rigYield = 0;
    for (const tower of state.towers) {
      if (tower.id !== 'zeroday') continue;
      const income = effStats(tower).income || 0;
      if (!income) continue;
      rigYield += income;
      floatText(tower.x, tower.y - 40, `+$${income} RIG`, 'cash-float');
    }
    const hardMult = state.protocol === 'hard' ? 0.85 : state.protocol === 'crimson' ? 0.7 : 1; // HELL PAYS WORSE — salvage is blood in HARD, and the dawn bleeds you for 70%
    const bonus = Math.round((30 + (state.waveIndex + 1) * 7) * hardMult) + rigYield;
    state.cash += bonus;
    state.earned += bonus;
    const cleared = state.waveIndex + 1;
    if (window.CBZPerks && CBZPerks.has('fieldrep') && state.baseHp < BASE_MAX) {
      state.baseHp = Math.min(BASE_MAX, state.baseHp + 2);
      floatText(...corePos(), '+2 FIELD REPAIRS', 'repair-float');
    }
    if (cleared >= missionWaves().length) { endMission(true); return; }
    banner(`WAVE ${cleared} CLEARED`, rigYield ? `// +$${bonus} SALVAGE · RIG YIELD $${rigYield}` : `// +$${bonus} SALVAGE`, 'banner-green');
    playSound();
    state.intermission = state.protocol === 'crimson' ? 3 : state.protocol === 'hard' ? 4.5 : 7; // HARD: 4.5s to rebuild — the swarm never waits. CRIMSON: 3s
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
  const waves = missionWaves();
  const wave = waves[index];
  const growth = MODE_HP_GROWTH[state.protocol] || 0;
  state.hpScale = growth
    ? Math.pow(1 + growth, index) // HARD: compounding hull curve — every wave prices in the last
    : 1 + (MODE_HP_SCALE[state.protocol] || WAVE_HP_SCALE) * index;
  state.bossHpMult = state.protocol === 'easy' ? EASY_BOSS_RELIEF : 1;
  const surge = wave.mod ? SURGE_MODS[wave.mod] : null;
  state.surgeSpeed = surge ? surge.speed : 1;
  state.surgeMod = wave.mod || null; // crimson visuals: surge waves burn brighter
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
  banner(`WAVE ${String(index + 1).padStart(2, '0')} / ${waves.length}`, surge ? `// ${surge.label} — ${surge.note}` : wave.phase ? `// ${wave.phase}` : '// HOSTILES INBOUND', 'banner-wave');
  updateHud();
}

// --- Combat HUD -----------------------------------------------------------------------
function ensureHud() {
  if (!state.hud) {
    state.hud = document.createElement('div');
    state.hud.className = 'combat-hud';
    state.hud.innerHTML = `
      <div class="hud-block hud-wave"><span class="hud-label">WAVE</span><strong id="combat-wave">—</strong></div>
      <div class="hud-block hud-protocol"><span class="hud-label">PROTOCOL</span><strong id="combat-protocol">—</strong></div>
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
  // OVERDRIVE perk: TIME x2 toggle — only rendered once the achievement decrypts it.
  if (!state.speedBtn && window.CBZPerks && CBZPerks.has('overdrive')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speed-toggle';
    btn.textContent = 'TIME x1';
    btn.addEventListener('click', () => {
      state.speed2x = !state.speed2x;
      btn.textContent = state.speed2x ? 'TIME x2' : 'TIME x1';
      btn.classList.toggle('on', state.speed2x);
      playSound();
    });
    state.speedBtn = btn;
  }
  if (state.speedBtn) {
    state.speed2x = false;
    state.speedBtn.textContent = 'TIME x1';
    state.speedBtn.classList.remove('on');
    document.querySelector('.field-hud').insertBefore(state.speedBtn, exit);
  }
  // Nuclear Fall Out: strike button lives next to the time toggle once a rig deploys.
  if (!state.nukeBtn) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nuke-toggle';
    btn.hidden = true;
    btn.addEventListener('click', () => {
      const rig = readyRig();
      if (!rig) { playSound('alarm'); showToast('Nuclear strike needs the rig at Tier 6 — Nuclear Fall Out.'); return; }
      if (state.nukeAim) { setNukeAim(false); return; }
      if ((rig.nukeCd || 0) > 0) { playSound('alarm'); showToast(`Nuke recharging — ${Math.ceil(rig.nukeCd)}s left.`); return; }
      if (state.cash < NUKE_COST) { playSound('alarm'); showToast(`Need $${NUKE_COST} salvage to call the nuke.`); return; }
      setNukeAim(true);
      playSound();
    });
    state.nukeBtn = btn;
  }
  state.nukeAim = false;
  if (state.crosshair) { state.crosshair.remove(); state.crosshair = null; }
  paintNukeButton();
  document.querySelector('.field-hud').insertBefore(state.nukeBtn, exit);
}

function updateHud() {
  if (!state.hud) return;
  document.querySelector('#combat-wave').textContent = state.waveIndex < 0 ? '—' : `${String(state.waveIndex + 1).padStart(2, '0')}/${missionWaves().length}`;
  document.querySelector('#combat-cash').textContent = `$${state.cash}`;
  const fill = document.querySelector('#base-fill');
  fill.style.width = `${(state.baseHp / BASE_MAX) * 100}%`;
  fill.classList.toggle('warn', state.baseHp <= 60);
  fill.classList.toggle('crit', state.baseHp <= 30);
  document.querySelector('#base-num').textContent = Math.round(state.baseHp);
  refreshBarAfford();
  refreshPanelAfford();
}

// Radioactive aftermath: fallout pools burn everything inside them — hostiles
// and risen corpses alike — until the fallout decays.
function tickWaste(dt) {
  if (!state.wasteZones.length || state.mode !== 'waves') return;
  for (const zone of state.wasteZones) {
    if (state.clock >= zone.until) {
      if (zone.node) zone.node.remove();
      zone.dead = true;
      continue;
    }
    for (const enemy of state.enemies) {
      if (!enemy.alive) continue;
      const [px, py] = posOf(enemy);
      if (Math.hypot(px - zone.x, py - zone.y) <= zone.r) damageEnemy(enemy, WASTE_DPS * dt, { src: 'waste', friendlyFire: true });
    }
  }
  state.wasteZones = state.wasteZones.filter((zone) => !zone.dead);
}

// --- Nuclear Fall Out: aimed tactical strike ---------------------------------------
function readyRig() {
  return state.towers.find((tower) => tower.id === 'zeroday' && trackLevel(tower) >= 6) || null;
}

function setNukeAim(on) {
  state.nukeAim = Boolean(on);
  if (state.crosshair) { state.crosshair.remove(); state.crosshair = null; }
  if (state.nukeAim) {
    setBuilding(null);
    state.crosshair = svgNode('g', { class: 'nuke-crosshair' });
    state.crosshair.appendChild(svgNode('circle', { class: 'nuke-blast', r: NUKE_RADIUS }));
    state.crosshair.appendChild(svgNode('circle', { class: 'nuke-waste', r: WASTE_RADIUS }));
    const label = svgNode('text', { class: 'nuke-label', y: -NUKE_RADIUS - 12, 'text-anchor': 'middle' }, 'NUCLEAR FALL OUT');
    state.crosshair.appendChild(label);
    state.layers.fx.appendChild(state.crosshair);
    paintGhost(state.mouseX, state.mouseY);
  }
  if (state.nukeBtn) paintNukeButton();
}

function paintNukeButton() {
  if (!state.nukeBtn) return;
  const rig = state.towers.find((tower) => tower.id === 'zeroday') || null;
  const armed = readyRig();
  state.nukeBtn.hidden = !rig;
  state.nukeBtn.disabled = Boolean(rig) && !armed; // visible the moment a rig deploys — locked until Tier 6
  if (!rig) return;
  const cd = armed ? (armed.nukeCd || 0) : 0;
  state.nukeBtn.textContent = state.nukeAim ? 'CLICK TARGET — ESC CANCELS'
    : !armed ? 'NUKE — RIG TIER 6 REQUIRED'
    : cd > 0 ? `NUKE ${Math.ceil(cd)}s`
    : `NUKE READY — $${NUKE_COST}`;
  state.nukeBtn.classList.toggle('on', state.nukeAim);
  state.nukeBtn.classList.toggle('cd', cd > 0 && !state.nukeAim);
  state.nukeBtn.classList.toggle('lock', Boolean(rig) && !armed);
}

function fireNuke(x, y) {
  const rig = readyRig();
  if (!rig || (rig.nukeCd || 0) > 0) { setNukeAim(false); return; }
  if (state.cash < NUKE_COST) { playSound('alarm'); showToast(`Need $${NUKE_COST} salvage to call the nuke.`); setNukeAim(false); return; }
  state.cash -= NUKE_COST;
  rig.nukeCd = NUKE_COOLDOWN;
  setNukeAim(false);
  // Strike: flat devastation inside the blast ring, then lingering fallout.
  for (const enemy of state.enemies) {
    if (!enemy.alive) continue;
    const [px, py] = posOf(enemy);
    if (Math.hypot(px - x, py - y) <= NUKE_RADIUS) damageEnemy(enemy, NUKE_DAMAGE, { src: 'nuke', friendlyFire: true });
  }
  const node = svgNode('circle', { class: 'fx-waste', cx: x, cy: y, r: WASTE_RADIUS });
  state.layers.fx.appendChild(node);
  state.wasteZones.push({ x, y, r: WASTE_RADIUS, until: state.clock + WASTE_SECONDS, node });
  fxNukeBlast(x, y);
  floatText(x, y - NUKE_RADIUS - 20, 'NUCLEAR FALL OUT', 'core-float');
  playSound('alarm');
  updateHud();
}

// --- Corpse Blossom abilities --------------------------------------------------------
function bloodPurge(tower) {
  if (trackLevel(tower) < 4) return;
  const lust = tower.lust || 0;
  if (lust <= 0) { playSound('alarm'); showToast('Blood Lust bar is empty — kills feed it.'); return; }
  const rng = effStats(tower).rng;
  let hits = 0;
  for (const enemy of state.enemies) {
    if (!enemy.alive || enemy.friendly) continue;
    const [px, py] = posOf(enemy);
    if (Math.hypot(px - tower.x, py - tower.y) <= rng) { damageEnemy(enemy, lust, { src: 'purge' }); hits += 1; }
  }
  tower.lust = 0;
  fxPurgeBlast(tower);
  floatText(tower.x, tower.y - 52, `BLOOD PURGE — ${lust} DMG`, 'lust-float');
  playSound();
  openTowerPanel(tower);
  updateHud();
}

function bloodScream(tower) {
  if (trackLevel(tower) < 5) return;
  if ((tower.screamCd || 0) > 0) return;
  let buffed = 0;
  for (const summon of state.enemies) {
    if (!summon.alive || !summon.friendly || summon.screamed) continue;
    summon.maxHp *= 2;
    summon.hp *= 2;
    summon.speed *= 2.5;
    summon.screamed = true;
    paintBars(summon);
    buffed += 1;
  }
  tower.screamCd = 200;
  fxScreamBlast(tower, buffed);
  banner('BLOOD SCREAM', buffed ? `// ${buffed} SUMMONS ENRAGED — 2x HP · +150% SPEED` : '// NO SUMMONS ON THE FIELD', 'banner-red');
  playSound();
  openTowerPanel(tower);
}

function updateBossBar() {
  const boss = state.enemies.find((enemy) => enemy.alive && enemy.t.boss && !enemy.friendly);
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

// --- Mode vote (EASY + MEDIUM live, the rest coming soon) --------------------------------
const MODES = [
  { id: 'easy', label: 'EASY', sub: '20 WAVES // 6 BOSS WAVES // GENTLER BOSSES', ready: true },
  { id: 'medium', label: 'MEDIUM', sub: '30 WAVES // DENSER, FASTER, ANGRIER', ready: true },
  { id: 'hard', label: 'HARD', sub: '30 WAVES // COMPOUNDING HULLS · +15% SPEED · HELLFIRE SURGES // BOSS LEAKS NEAR-KILL THE CORE', ready: true },
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
function startMission(map, skipVote = false, forcedProtocol = null) {
  if (state.mode !== 'idle' && state.mode !== 'over') return;
  state.map = map;
  state.mode = 'vote';
  state.protocol = null; // the combat protocol locks in at the vote
  state.speed2x = false;
  state.samplers = buildSamplers(map);
  // Flat point cloud of every lane — placement checks + drone spawn gates use it.
  state.trackPts = state.samplers.flatMap((sampler) => sampler.pts);
  prepMechanics(map, state.samplers);
  state.cash = (debugCash || START_SALVAGE) + (window.CBZPerks && CBZPerks.has('deeppockets') ? 150 : 0);
  state.baseHp = BASE_MAX;
  state.enemies = [];
  state.towers = [];
  state.projectiles = [];
  state.wasteZones = [];
  state.nukeAim = false;
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
  if (skipVote) launchCombat(forcedProtocol || 'easy');
  else showVote('solo');
}

function launchCombat(mode) {
  closeVote();
  state.protocol = mode;
  if (mode === 'hard' || mode === 'crimson') state.cash = Math.round(state.cash * (mode === 'crimson' ? 0.7 : 0.8)); // HELL strips 20% of opening salvage; the DAWN strips 30% — you deploy wounded
  const proto = document.querySelector('#combat-protocol');
  if (proto) proto.textContent = String(mode).toUpperCase();
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
  if (state.speedBtn) { state.speedBtn.remove(); state.speedBtn = null; }
  state.speed2x = false;
  if (state.nukeBtn) { state.nukeBtn.remove(); state.nukeBtn = null; }
  state.nukeAim = false;
  if (state.crosshair) { state.crosshair.remove(); state.crosshair = null; }
  state.wasteZones = [];
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
    ...(data.unlocked || []).map((id) => `<div class="payout-row payout-ach"><span>ACHIEVEMENT UNLOCKED</span><b>${escapeHtml(String(id).toUpperCase())}</b></div>`),
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
  // Event gamemodes (the Crimson Dawn + every future event map) never offer a
  // retry — the redeploy path relaunches the standard protocol vote, which can
  // never re-arm an event run. The debrief offers one clean exit: RETURN TO BAY.
  const eventMode = Boolean((state.map && state.map.event) || state.protocol === 'crimson');
  panel.innerHTML = `
    <div class="end-card">
      <div class="eyebrow">${win ? '// PROTOCOL COMPLETE' : '// CORE LOST'}</div>
      <h2>${win ? 'SECTOR CLEARED' : 'CORE BREACHED'}</h2>
      <div class="end-stats">
        <div><span>OUTCOME</span><b>${win ? `ALL ${missionWaves().length} WAVES REPELLED` : `FELL ON WAVE ${state.waveIndex + 1}`}</b></div>
        <div><span>ELIMINATIONS</span><b>${state.kills}</b></div>
        <div><span>SALVAGE EARNED</span><b>$${state.earned}</b></div>
        <div><span>BASE INTEGRITY</span><b>${Math.round(state.baseHp)}/${BASE_MAX}</b></div>
        <div><span>MISSION TIME</span><b>${Math.floor(state.clock / 60)}:${String(Math.floor(state.clock % 60)).padStart(2, '0')}</b></div>
      </div>
      <div class="end-rewards" id="end-rewards"></div>
      <div class="end-actions">
        ${eventMode ? '' : `<button class="inline-button" id="end-redeploy" type="button">${win ? 'RE-DEPLOY' : 'RETRY'}</button>`}
        <button class="inline-button" id="end-bay" type="button">RETURN TO BAY</button>
      </div>
    </div>`;
  battlefield.appendChild(panel);
  state.endPanel = panel;
  if (window.CBZShop) {
    CBZShop.submitMission({
      result: win ? 'win' : 'loss',
      wavesCleared: win ? missionWaves().length : state.waveIndex + 1,
      bossesKilled: state.bossesKilled,
      flawless: Boolean(win && state.baseHp >= BASE_MAX),
      bonusNc: state.bonusNc,
      difficulty: state.protocol || 'easy',
      map: state.map ? state.map.id : '',
    }).then((data) => paintPayout(panel, data));
  }
  if (!eventMode) panel.querySelector('#end-redeploy').addEventListener('click', () => { panel.remove(); state.endPanel = null; resetBoard(); startMission(state.map); });
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
  if (entry.limit && state.towers.some((tower) => tower.id === id)) {
    playSound('alarm');
    showToast(`${entry.name} is a one-off rig — only one deploys per commander.`);
    return;
  }
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
  if (entry.limit && state.towers.some((tower) => tower.id === entry.id)) {
    playSound('alarm');
    showToast(`${entry.name} is a one-off rig — only one deploys per commander.`);
    return false;
  }
  if (state.cash < entry.cost) { playSound('alarm'); showToast(`Need $${entry.cost} salvage to deploy ${entry.name}.`); return false; }
  state.cash -= entry.cost;
  const node = towerNode(entry, x, y);
  state.layers.towers.appendChild(node);
  const tower = { id: entry.id, entry, x, y, node, head: node.querySelector('.tw-head'), cd: 0.35, boost: 1, lvl: 0 };
  if (entry.id === 'corpseblossom') { tower.veinCd = 0.6; tower.lust = 0; tower.screamCd = 0; }
  if (entry.id === 'zeroday') tower.nukeCd = 0;
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
  // Spread the whole base stats object — special chassis carry custom keys
  // (income / veins / summonHp / lust / bounty) that upgrade tiers overwrite.
  const stats = { ...tower.entry.stats };
  for (let i = 0; i < trackLevel(tower); i++) {
    const tier = towerTrack(tower)[i];
    if (tier && tier.sets) Object.assign(stats, tier.sets);
  }
  return { ...stats, infinite: tower.entry.stats.rng >= 999 };
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
  if (tower.id === 'zeroday' && tower.lvl >= 6) { showToast('NUCLEAR FALL OUT ARMED — the rig can call the strike.'); playSound('alarm'); }
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
  const specials = [];
  if (entry.id === 'corpseblossom') {
    specials.push(`<div class="tp-abil-row"><span>SUMMON HP</span><b>${Math.round((es.summonHp || 0.3) * 100)}%</b></div>`);
    if (trackLevel(tower) >= 4) specials.push(`<div class="tp-abil-row lust"><span>BLOOD LUST</span><b>${tower.lust || 0}</b></div>`);
  }
  if (entry.id === 'dronespawner') {
    specials.push(`<div class="tp-abil-row"><span>STRIKE DRONE</span><b>${Math.round(es.drone || 70)} DMG/HULL</b></div>`);
    specials.push(`<div class="tp-abil-row"><span>NEXT LAUNCH</span><b>${state.mode === 'waves' ? `${Math.ceil(tower.droneCd || 0)}s` : `${Math.round(es.launchEvery || 6)}s CADENCE`}</b></div>`);
  }
  if (entry.id === 'virus' && es.corrupt) specials.push(`<div class="tp-abil-row"><span>CONTAGION</span><b>${es.corrupt}/S · 5S BURN</b></div>`);
  if (entry.id === 'zeroday') specials.push(`<div class="tp-abil-row"><span>WAVE INCOME</span><b>$${es.income || 0}/WAVE</b></div>`);
  const abilities = [];
  if (entry.id === 'corpseblossom' && trackLevel(tower) >= 4) {
    abilities.push(`<button class="tp-ability purge" type="button" id="tp-purge" ${tower.lust > 0 ? '' : 'disabled'}>BLOOD PURGE — RELEASE ${tower.lust || 0} LUST</button>`);
  }
  if (entry.id === 'corpseblossom' && trackLevel(tower) >= 5) {
    const cd = Math.ceil(tower.screamCd || 0);
    abilities.push(`<button class="tp-ability scream" type="button" id="tp-scream" ${cd > 0 ? 'disabled' : ''}>BLOOD SCREAM${cd > 0 ? ` — ${cd}s` : ' — READY'}</button>`);
  }
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
    ${specials.length ? `<div class="tp-specials">${specials.join('')}</div>` : ''}
    <p class="tp-special">${entry.special.replace('>> ', '')}</p>
    <div class="tp-ups"><div class="tp-ups-head"><span>// UPGRADE LADDER</span><b>TIER ${Math.min(lvl + 1, tiers.length)} / ${tiers.length} · THIS MISSION</b></div>${rows}</div>
    ${abilities.length ? `<div class="tp-abilities">${abilities.join('')}</div>` : ''}
    <button class="tp-sell" type="button">SALVAGE BACK +$${refund}</button>
    <p class="tp-note">UPGRADES ARE SCRAPPED ON SELL &amp; WHEN THE MISSION ENDS</p>`;
  battlefield.appendChild(panel);
  // Clamp with MEASURED panel size — 5/6-tier tracks + ability buttons make the
  // panel far taller than the old 330px guess, which pushed menus off-screen.
  const [sx, sy] = toScreen(tower.x, tower.y);
  const margin = 10;
  const pw = panel.offsetWidth || 224;
  const ph = panel.offsetHeight || 330;
  let left = sx + 26;
  if (left + pw > window.innerWidth - margin) left = sx - pw - 26; // flip left near the right edge
  panel.style.left = `${Math.max(margin, Math.min(window.innerWidth - pw - margin, left))}px`;
  panel.style.top = `${Math.max(margin, Math.min(window.innerHeight - ph - margin, sy - 120))}px`;
  state.towerPanel = panel;
  state.panelTower = tower;
  tower.node.classList.add('selected');
  panel.querySelectorAll('.tp-buy').forEach((button) => button.addEventListener('click', () => buyTrack(tower)));
  panel.querySelector('.tp-sell').addEventListener('click', () => sellTower(tower));
  const purge = panel.querySelector('#tp-purge');
  if (purge) purge.addEventListener('click', () => bloodPurge(tower));
  const scream = panel.querySelector('#tp-scream');
  if (scream) scream.addEventListener('click', () => bloodScream(tower));
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
  if (!state.layers || !state.towers.length) { paintNukeButton(); return; }
  for (const tower of state.towers) tower.boost = 1;
  // Special chassis upkeep: Blossom curse pulses + ability cooldowns, rig nuke clock.
  for (const tower of state.towers) {
    if (tower.id === 'corpseblossom') {
      tower.screamCd = Math.max(0, (tower.screamCd || 0) - dt);
      const es = effStats(tower);
      if (es.veins) {
        tower.veinCd -= dt;
        if (tower.veinCd <= 0) {
          const [lo, hi] = es.veinRate || [0.1, 1];
          tower.veinCd = lo + Math.random() * (hi - lo);
          const pool = state.enemies.filter((enemy) => {
            if (!enemy.alive || enemy.friendly) return false;
            const [px, py] = posOf(enemy);
            return Math.hypot(px - tower.x, py - tower.y) <= es.rng;
          });
          if (pool.length) {
            const target = pool[Math.floor(Math.random() * pool.length)];
            const [tx, ty] = posOf(target);
            const burst = svgNode('circle', { class: 'fx-ring fx-veins-burst', cx: tx, cy: ty, r: 6 });
            state.layers.fx.appendChild(burst);
            setTimeout(() => burst.remove(), 620);
            fxRing(tx, ty, 'fx-ring-virus');
            for (const enemy of pool) {
              const [px, py] = posOf(enemy);
              if (Math.hypot(px - tx, py - ty) <= 55) damageEnemy(enemy, es.veins, { src: 'veins' });
            }
          }
        }
      }
    }
    if (tower.id === 'dronespawner') {
      // Strike-drone fabrication clock: only launches while hostiles stand in the ring.
      tower.droneCd = Math.max(0, (tower.droneCd || 0) - dt);
      if (tower.droneCd <= 0 && launchStrikeDrone(tower)) {
        tower.droneCd = effStats(tower).launchEvery || 6;
        if (state.panelTower === tower) openTowerPanel(tower); // live launch countdown
      }
    }
    if (tower.id === 'zeroday') tower.nukeCd = Math.max(0, (tower.nukeCd || 0) - dt);
  }
  paintNukeButton();
  // Fire control.
  const overclockMult = window.CBZPerks && CBZPerks.has('overclock') ? 1.05 : 1;
  for (const tower of state.towers) {
    const rate = effStats(tower).rate * tower.boost * overclockMult;
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
  // Sniper Headset rewrites acquisition entirely: only the beefiest hostile in
  // reach is worth a trigger pull — bosses and tanks over track fodder.
  if (es.targeting === 'maxhp') {
    tower.target = pool.reduce((best, enemy) => (enemy.hp > best.hp ? enemy : best));
    return tower.target;
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
    case 'sniper': {
      // Hitscan marksman: the round lands the instant the trigger breaks —
      // no projectile phase, just a bright rail line and a red impact ring.
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-sniper', 1.6);
      fxRing(tx, ty, 'fx-ring-red');
      break;
    }
    case 'shredder': {
      // Chaff mulcher: same instant-hit brain as the Sentinel but the drum
      // spits a ragged amber chip-stream instead of a clean tracer.
      damageEnemy(target, dmg);
      fireLine(tower, target, 'fx-chip', 1.8);
      break;
    }
    case 'missilesilo': {
      // Strategic strike: the warhead flies a visible arc (slow, dodgeable by
      // nothing — it always lands) and detonates for full damage in the blast.
      // MIRV tiers crack the shell into cluster bomblets on impact.
      const es = effStats(tower);
      const missile = svgNode('circle', { class: 'fx-shell fx-missile', r: 5, cx: tower.x, cy: tower.y });
      state.layers.fx.appendChild(missile);
      state.projectiles.push({ kind: 'missile', x: tower.x, y: tower.y, tx, ty, speed: 210, dmg, splash: es.splash || 55, cluster: es.cluster || 0, node: missile });
      fxRing(tower.x, tower.y, 'fx-ring-amber');
      break;
    }
    case 'virus': {
      // Melee swarm: blades land instantly — no projectile phase at all.
      // CONTAGION tier: every hit infects the target — corruption burns for
      // es.corrupt damage per second over 5s as PHASE damage (armor plating
      // and shield lattices mean nothing to it), refreshed by every blade.
      damageEnemy(target, dmg);
      const es = effStats(tower);
      if (es.corrupt && !target.friendly) {
        target.corrupt = { dps: es.corrupt, t: 5 };
        fxRing(tx, ty, 'fx-ring-virus');
      }
      const slash = svgNode('line', { class: 'fx-line fx-tracer fx-slash', x1: tower.x, y1: tower.y, x2: tx, y2: ty, 'stroke-width': 3 });
      state.layers.fx.appendChild(slash);
      setTimeout(() => slash.remove(), 160);
      fxRing(tx, ty, 'fx-ring-virus');
      break;
    }
    case 'dawnbreaker': {
      // CRIMSON RELIC: hitscan solar lance — the beam burns straight through
      // armor plating AND shield lattices (phase damage), tracks air natively,
      // and SUNSLAUGHTER tiers splash the burn onto everything near the target.
      damageEnemy(target, dmg, { phase: true, src: 'dawn' });
      fireLine(tower, target, 'fx-dawn', 2.4);
      fxRing(tx, ty, 'fx-ring-amber');
      const burn = effStats(tower).splash || 0;
      if (burn > 0) {
        for (const enemy of state.enemies) {
          if (!enemy.alive || enemy === target) continue;
          const [px, py] = posOf(enemy);
          if (Math.hypot(px - tx, py - ty) <= burn) damageEnemy(enemy, Math.round(dmg * 0.6), { phase: true, src: 'dawn' });
        }
      }
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
    if (p.kind === 'shell' || p.kind === 'missile') {
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
        // MIRV PROTOCOL: the shell cracks open — cluster bomblets pepper a wide
        // secondary ring around the impact crater for partial damage.
        if (p.cluster) {
          fxRing(p.tx, p.ty, 'fx-ring-amber');
          for (const enemy of state.enemies) {
            if (!enemy.alive) continue;
            const [px, py] = posOf(enemy);
            const d = Math.hypot(px - p.tx, py - p.ty);
            if (d > (p.splash || 40) && d <= 130) damageEnemy(enemy, Math.round(p.dmg * 0.4));
          }
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
  if (state.crosshair) state.crosshair.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
  if (state.building) paintGhost(x, y);
});

board.addEventListener('pointerleave', () => {
  state.mouseOn = false;
  if (state.ghost) state.ghost.classList.add('off');
});

board.addEventListener('click', (event) => {
  if (!state.bar || !buildingAllowed()) return;
  const [x, y] = boardPoint(event);
  if (state.nukeAim) { fireNuke(x, y); return; }
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
  if (event.key === 'Escape') { setBuilding(null); closeTowerPanel(); if (state.nukeAim) setNukeAim(false); return; }
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
  const boss = state.enemies.find((enemy) => enemy.alive && enemy.t.boss && !enemy.friendly);
  bridge.send({
    k: 'sync',
    m: state.mode, w: state.waveIndex, c: Math.round(state.cash), b: Math.max(0, Math.ceil(state.baseHp)),
    kk: state.kills, bk: state.bossesKilled, er: Math.round(state.earned),
    sq: state.syncSeq || 0, st: state.syncTitle || '',
    tw: state.towers.map((tower, index) => [index, tower.id, Math.round(tower.x), Math.round(tower.y), tower.lvl || 0, tower.onPad ? 1 : 0]),
    en: state.enemies.filter((enemy) => enemy.alive).map((enemy) => [enemy.nid, enemy.key, Math.round(enemy.fx), Math.round(enemy.fy), Math.round(enemy.hp), enemy.maxHp, Math.round(enemy.shield || 0), enemy.t.flying ? 1 : 0, enemy.friendly ? 1 : 0]),
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
  for (const [nid, key, x, y, hp, maxHp, shield, flying, friendly] of snap.en) {
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
      enemy = { key, t, node: g, fill, shieldFill, hp, maxHp, shield, maxShield: t.shield || 0, alive: true, gx: x, gy: y, fx: x, fy: y, angle: 0, guest: true, guestNid: nid, friendly: Boolean(friendly) };
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
