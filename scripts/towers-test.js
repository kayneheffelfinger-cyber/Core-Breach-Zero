// SCRAP PROTOCOL validation: Sentinel buff, Sniper nerf #3, Virus CONTAGION rework,
// the SHREDDER early-wave specialist, mirror sync + deploy chain checks.
// Usage: node scripts/towers-test.js  (pure file/logic checks — no server needed)
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${label}`); }
  else { failed += 1; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`); }
}
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// Extract a `const NAME = <literal>;` block. Extra bindings (e.g. shop.js's ic())
// can be preloaded so literals that call helpers still evaluate.
function extractLiteral(src, name, extraBindings = {}) {
  const start = src.indexOf(`const ${name} = `);
  if (start < 0) return undefined;
  const open = src.indexOf('[', start) !== -1 && src.indexOf('{', start) !== -1
    ? Math.min(src.indexOf('[', start), src.indexOf('{', start))
    : Math.max(src.indexOf('[', start), src.indexOf('{', start));
  const openCh = src[open];
  const closeCh = openCh === '[' ? ']' : '}';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === openCh) depth += 1;
    if (src[i] === closeCh) {
      depth -= 1;
      if (depth === 0) {
        const names = ['WAVE_HP_SCALE', ...Object.keys(extraBindings)];
        const values = [0.12, ...Object.values(extraBindings)];
        return new Function(...names, `return (${src.slice(open, i + 1)})`)(...values);
      }
    }
  }
  return undefined;
}

console.log('--- Blueprint catalog (shop.js) ---');
const shopjs = read('shop.js');
const TOWERS = extractLiteral(shopjs, 'TOWERS', { ic: (inner) => inner });
const silo = TOWERS && TOWERS.find((t) => t.id === 'missilesilo');
const drone = TOWERS && TOWERS.find((t) => t.id === 'dronespawner');
check('MISSILE SILO registered at Clearance 30 (endgame capstone)', silo && silo.unlock === 30, JSON.stringify(silo && silo.unlock));
check('MISSILE SILO is a mixed-currency capstone (9000 NC + 120 BT / 650 salvage)', silo && silo.price.nc === 9000 && silo.price.bt === 120 && silo.cost === 650);
check('MISSILE SILO base: 300 dmg / 0.22 rate / 300 rng / 55 splash', silo && silo.stats.dmg === 300 && silo.stats.rate === 0.22 && silo.stats.rng === 300 && silo.stats.splash === 55);
check('MISSILE SILO has 4-tier ladder ending in MIRV PROTOCOL', silo && silo.track.length === 4 && silo.track[3].label === 'MIRV PROTOCOL' && silo.track[3].sets.cluster === 1 && silo.track[3].sets.dmg === 780);
check('MISSILE SILO has decal art', silo && silo.art === 'assets/towers/missilesilo.png' && fs.existsSync(path.join(ROOT, 'assets/towers/missilesilo.png')));
check('DRONE SPAWNER registered at Clearance 20', drone && drone.unlock === 20, JSON.stringify(drone && drone.unlock));
check('DRONE SPAWNER is one-per-commander (5200 NC + 85 BT / 475 salvage)', drone && drone.limit === 1 && drone.price.nc === 5200 && drone.price.bt === 85 && drone.cost === 475);
check('DRONE SPAWNER base: 70 dmg/hull drone every 6s in a 190 ring', drone && drone.stats.drone === 70 && drone.stats.launchEvery === 6 && drone.stats.rng === 190);
check('DRONE SPAWNER apex tier: 240-damage drones every 3s at 230 rng', drone && drone.track[3].label === 'APEX CARRIER' && drone.track[3].sets.drone === 240 && drone.track[3].sets.launchEvery === 3 && drone.track[3].sets.rng === 230);
check('DRONE SPAWNER has decal art', drone && drone.art === 'assets/towers/dronespawner.png' && fs.existsSync(path.join(ROOT, 'assets/towers/dronespawner.png')));
check('shop card renders a DRONE meter for the carrier', shopjs.includes("entry.stats.drone ? `<div class=\"tc-meter\"><span>DRONE</span>"));
check('shop card renders a CONTAGION meter for the virus', shopjs.includes("entry.stats.corrupt ? `<div class=\"tc-meter\"><span>CONTAGION</span>"));

console.log('--- SCRAP PROTOCOL balance pass (shop.js) ---');
const se = TOWERS.find((t) => t.id === 'sentinel');
const vi = TOWERS.find((t) => t.id === 'virus');
const sh = TOWERS.find((t) => t.id === 'shredder');
const sg = TOWERS.find((t) => t.id === 'shotgunner');
const sn = TOWERS.find((t) => t.id === 'sniper');
check('SENTINEL buffed: 7 dmg / 1.6 rate / 135 rng', se.stats.dmg === 7 && se.stats.rate === 1.6 && se.stats.rng === 135);
check('SENTINEL ladder rolled up (12 / 2.0+150 / 20+185)', se.track[0].sets.dmg === 12 && se.track[1].sets.rate === 2 && se.track[1].sets.rng === 150 && se.track[2].sets.dmg === 20 && se.track[2].sets.rng === 185);
check('VIRUS is premium now: 2400 NC + 55 BT / 500 salvage', vi.price.nc === 2400 && vi.price.bt === 55 && vi.cost === 500);
check('VIRUS base blades up: 12 dmg at 3/s', vi.stats.dmg === 12 && vi.stats.rate === 3);
check('VIRUS ladder is 5 tiers ending ZERO PATIENT 80 dmg / 4.2 rate', vi.track.length === 5 && vi.track[4].label === 'ZERO PATIENT' && vi.track[4].sets.dmg === 80 && vi.track[4].sets.rate === 4.2);
check('CONTAGION tier infects (corrupt 40) and ZERO PATIENT burns 70/s', vi.track[3].sets.corrupt === 40 && vi.track[4].sets.corrupt === 70);
check('VIRUS blade tiers got pricier (650/900/1600/2400/3600)', vi.track.map((t) => t.cost).join(',') === '650,900,1600,2400,3600');
check('SNIPER trimmed again: 130 dmg base', sn.stats.dmg === 130);
check('SNIPER rail trimmed (150 / 215 / 375)', sn.track[1].sets.dmg === 150 && sn.track[3].sets.dmg === 215 && sn.track[4].sets.dmg === 375);
check('SHREDDER decrypts at Clearance 20 (2200 NC + 35 BT / 90 salvage)', sh && sh.unlock === 20 && sh.price.nc === 2200 && sh.price.bt === 35 && sh.cost === 90);
check('SHREDDER is the early-wave specialist: 11 dmg / 3 rate / 105 rng', sh && sh.stats.dmg === 11 && sh.stats.rate === 3 && sh.stats.rng === 105);
check('SHREDDER ladder tops out on purpose (3 small tiers, cap 18 dmg)', sh && sh.track.length === 3 && sh.track[2].sets.dmg === 18 && sh.track[2].sets.rng === 115);
check('SHREDDER has decal art', sh && sh.art === 'assets/towers/shredder.png' && fs.existsSync(path.join(ROOT, 'assets/towers/shredder.png')));

console.log('--- Nerfs: Shotgunner + Sniper (shop.js) ---');
check('SHOTGUNNER trimmed: 27 dmg / 12U base burst ring', sg.stats.dmg === 27 && sg.stats.splash === 12);
check('SHOTGUNNER ladder trimmed (splash 20/24, dmg 36/40)', sg.track[1].sets.splash === 20 && sg.track[2].sets.splash === 24 && sg.track[2].sets.dmg === 36 && sg.track[3].sets.dmg === 40);
check('SNIPER trimmed: 130 dmg base', sn.stats.dmg === 130);
check('SNIPER rail trimmed (150 / 215 / 375)', sn.track[1].sets.dmg === 150 && sn.track[3].sets.dmg === 215 && sn.track[4].sets.dmg === 375);
check('sniper rng + targeting untouched by the nerf', sn.track[0].sets.targeting === 'maxhp' && sn.track[4].sets.rng === 350 && sn.track[4].sets.rate === 0.4);

console.log('--- Combat wiring (combat.js) ---');
const combat = read('combat.js');
check('MISSILE SILO tracks air natively (no pad needed)', combat.includes("missilesilo: { air: 'yes' }"));
check('SHREDDER is ground-only with pad AA', combat.includes("shredder: { air: 'no' }"));
check('SHREDDER spits a chip-stream (fx-chip tracer)', combat.includes("case 'shredder':") && combat.includes("fireLine(tower, target, 'fx-chip'"));
check('CONTAGION wiring: virus hits infect with a 5s phase burn', combat.includes("target.corrupt = { dps: es.corrupt, t: 5 }") && combat.includes("damageEnemy(enemy, enemy.corrupt.dps * dt, { phase: true, src: 'virus' })"));
check('corruption tick guarded against friendly summons', combat.includes('if (es.corrupt && !target.friendly)'));
check('tower panel shows live CONTAGION intel', combat.includes('<span>CONTAGION</span>'));
check('DRONE SPAWNER is a one-per-commander rig', combat.includes("new Set(['zeroday', 'corpseblossom', 'dronespawner'])"));
check('silo fires a visible warhead (kind missile + fx-missile node)', combat.includes("case 'missilesilo':") && combat.includes("kind: 'missile'") && combat.includes("fx-shell fx-missile"));
check('projectile loop flies shells AND missiles', combat.includes("p.kind === 'shell' || p.kind === 'missile'"));
check('MIRV cluster pass: 40% dmg out to 130u beyond the crater', combat.includes('if (p.cluster)') && combat.includes('Math.round(p.dmg * 0.4)') && combat.includes('d <= 130'));
check('strike-drone fabricator exists with target lead', combat.includes('function launchStrikeDrone(tower)') && combat.includes('const lead = 0.9;'));
check('carrier upkeep ticks droneCd and launches on cadence', combat.includes("tower.id === 'dronespawner'") && combat.includes('tower.droneCd <= 0 && launchStrikeDrone(tower)'));
check('strike drones respect the global summon cap', combat.split('launchStrikeDrone(tower)').length > 1 && combat.includes('item.friendly && item.alive).length >= SUMMON_CAP'));
check('tower panel shows live STRIKE DRONE intel', combat.includes('<span>STRIKE DRONE</span>') && combat.includes('<span>NEXT LAUNCH</span>'));

console.log('--- HARD escalation (combat.js) ---');
const ENEMY_TYPES = extractLiteral(combat, 'ENEMY_TYPES');
const SURGE_MODS = extractLiteral(combat, 'SURGE_MODS');
const HARD_WAVES = extractLiteral(combat, 'HARD_WAVES');
check('MODE_HP_GROWTH.hard = 0.1 (1.10x compounding)', combat.includes('MODE_HP_GROWTH = { hard: 0.1, crimson: 0.13 }'));
check('MODE_SPEED.hard = 1.15 (+15% hostile speed)', combat.includes('MODE_SPEED = { hard: 1.15, crimson: 1.18 }'));
check('HELLFIRE now burns exactly 6 HARD waves', HARD_WAVES.filter((w) => w.mod === 'hellfire').length === 6, `${HARD_WAVES.filter((w) => w.mod === 'hellfire').length}`);
check('DENSE ASSAULT (w20) upgraded to hellfire + phantom escort', HARD_WAVES[19].mod === 'hellfire' && HARD_WAVES[19].groups.some(([k, c]) => k === 'phantom' && c >= 10));
check('GRID LOCK (w25) overclock escalated to hellfire', HARD_WAVES[24].mod === 'hellfire');
check('final escort grows a third Firewall Warden + 5th Juggernaut', HARD_WAVES[29].groups.some(([k, c]) => k === 'warden' && c === 3) && HARD_WAVES[29].groups.some(([k, c]) => k === 'juggernaut' && c === 5));
const hullAt = (i) => Math.pow(1.1, i);
check('hull curve: w10 ≈ 2.36x, w20 ≈ 6.12x, w30 ≈ 15.86x', Math.abs(hullAt(9) - 2.36) < 0.02 && Math.abs(hullAt(19) - 6.12) < 0.03 && Math.abs(hullAt(29) - 15.86) < 0.05, `w10=${hullAt(9).toFixed(2)} w20=${hullAt(19).toFixed(2)} w30=${hullAt(29).toFixed(2)}`);
check('vote card copy warns +15% speed', combat.includes('COMPOUNDING HULLS · +15% SPEED · HELLFIRE SURGES'));
const badKeys = new Set();
for (const wave of HARD_WAVES) for (const [key, count] of wave.groups) {
  if (!ENEMY_TYPES[key]) badKeys.add(key);
  if (!Number.isInteger(count) || count <= 0) badKeys.add(`${key}:${count}`);
  if (wave.mod && !SURGE_MODS[wave.mod]) badKeys.add(wave.mod);
}
check('escalated HARD ladder still validates (keys + mods + counts)', badKeys.size === 0, [...badKeys].join(','));

console.log('--- Shop mirrors (LOCAL + server) ---');
const appjs = read('app.js');
const serverjs = read('server.js');
const localShop = extractLiteral(appjs, 'SHOP');
const serverShop = extractLiteral(serverjs, 'SHOP');
for (const id of ['virus', 'shredder', 'dronespawner', 'missilesilo']) {
  const a = localShop[id];
  const b = serverShop[id];
  const strip = (e) => JSON.stringify({ name: e.name, unlock: e.unlock, price: e.price, currency: e.currency });
  check(`${id} mirror identical (name/unlock/price/currency)`, a && b && strip(a) === strip(b), `${strip(a || {})} vs ${strip(b || {})}`);
}
const localRewards = extractLiteral(appjs, 'REWARDS');
const serverRewards = extractLiteral(serverjs, 'REWARDS');
check('reward tables untouched by IRON RAIN', JSON.stringify(localRewards) === JSON.stringify(serverRewards) && localRewards.hard.winNC === 250 && localRewards.crimson.winNC === 500);

console.log('--- Private Crimson early access (app.js) ---');
check('crimsonEarlyAccess reads the admin flag off the shop profile', appjs.includes('function crimsonEarlyAccess()') && /profile && profile\.admin/.test(appjs));
const phaseIdx = appjs.indexOf('function crimsonPhase(');
const earlyIdx = appjs.indexOf('if (crimsonEarlyAccess()) return \'live\';');
check('early-access gate sits inside the phase machine before the T-0 check', phaseIdx >= 0 && earlyIdx > phaseIdx && earlyIdx < appjs.indexOf("now >= CRIMSON_DEADLINE) return 'live';", phaseIdx));
check('live panel marks the early field test (and nothing more)', appjs.includes('// EARLY FIELD TEST — ONE UNREGISTERED DEPLOY SIGNATURE ACCEPTED'));
check('QA override still wins over early access (?crimson=passed)', appjs.indexOf("CRIMSON_DEBUG === 'passed'") < earlyIdx);
check('non-admin seal untouched: default shop profile has no admin flag', shopjs.includes('equippedPerks: [], admin: false }'));
check('phantom bay fix: setProfile purges catalog-dead blueprint ids', shopjs.includes('towerById(id) && profile.owned.includes(id)'));

console.log('--- Deploy chain: update log, build, cache-bust ---');
const indexhtml = read('index.html');
const styles = read('styles.css');
check('BUILD bumped to 2026.10.26', appjs.includes("const BUILD = '2026.10.26';"));
check('UPDATE LOG leads with SCRAP PROTOCOL entry', appjs.indexOf('SCRAP PROTOCOL') < appjs.indexOf('CRIMSON VEINS') && appjs.includes("version: '2026.10.26', tag: 'SCRAP PROTOCOL'"));
check('update log covers sentinel buff + shredder + sniper nerf #3 + virus rework', ['SENTINEL TURRET buffed', 'SHREDDER decrypts at Clearance 20', 'SNIPER tuned down again', 'VIRUS reworked', 'MISSILE SILO'].every((s) => appjs.includes(s)));
const busts = indexhtml.match(/\?v=([0-9a-z]+)/g) || [];
check('all 6 index.html assets cache-busted to 20261023d', busts.length === 6 && busts.every((v) => v === '?v=20261023d'), busts.join(' '));
check('shell footer brands SCRAP PROTOCOL', indexhtml.includes('BUILD 2026.10.26 // SCRAP PROTOCOL') && indexhtml.includes('THE CRIMSON WELL IS OPEN'));
check('play menu copy updated to 15% hostiles', appjs.includes('compounding hulls, 15% faster hostiles'));
check('fx-missile warhead styled (orange glow)', styles.includes('.fx-missile') && /fx-missile[^}]*#ff7a45/.test(styles));
check('fx-chip stream styled for the Shredder', styles.includes('.fx-chip'));

console.log('--- Syntax gates ---');
for (const f of ['combat.js', 'app.js', 'server.js', 'shop.js']) {
  try { require('child_process').execSync(`node --check ${path.join(ROOT, f)}`, { stdio: 'pipe' }); check(`${f} parses clean`, true); }
  catch (err) { check(`${f} parses clean`, false, String(err.stderr).slice(0, 200)); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
