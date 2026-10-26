// ULTIMATUM validation: uncapped clearance, lifetime XP ledger, core exchange,
// CORPSE BLOSSOM as the first Ultimatum card, one-card equip rule, mirrors + deploy chain.
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
check('MISSILE SILO has 4-tier ladder ending in MIRV PROTOCOL', silo && silo.track.length === 4 && silo.track[3].label === 'MIRV PROTOCOL' && silo.track[3].sets.cluster === 1 && silo.track[3].sets.dmg === 650);
check('MISSILE SILO has decal art', silo && silo.art === 'assets/towers/missilesilo.png' && fs.existsSync(path.join(ROOT, 'assets/towers/missilesilo.png')));
check('DRONE SPAWNER registered at Clearance 20', drone && drone.unlock === 20, JSON.stringify(drone && drone.unlock));
check('DRONE SPAWNER is one-per-commander (5200 NC + 85 BT / 475 salvage)', drone && drone.limit === 1 && drone.price.nc === 5200 && drone.price.bt === 85 && drone.cost === 475);
check('DRONE SPAWNER base: 70 dmg/hull drone every 6s in a 190 ring', drone && drone.stats.drone === 70 && drone.stats.launchEvery === 6 && drone.stats.rng === 190);
check('DRONE SPAWNER apex tier: 200-damage drones every 3s at 230 rng', drone && drone.track[3].label === 'APEX CARRIER' && drone.track[3].sets.drone === 200 && drone.track[3].sets.launchEvery === 3 && drone.track[3].sets.rng === 230);
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
check('VIRUS ladder is 5 tiers ending ZERO PATIENT 64 dmg / 3.8 rate', vi.track.length === 5 && vi.track[4].label === 'ZERO PATIENT' && vi.track[4].sets.dmg === 64 && vi.track[4].sets.rate === 3.8);
check('CONTAGION tier infects (corrupt 40) and ZERO PATIENT burns 55/s', vi.track[3].sets.corrupt === 40 && vi.track[4].sets.corrupt === 55);
check('VIRUS blade tiers got pricier (650/900/1600/2400/3600)', vi.track.map((t) => t.cost).join(',') === '650,900,1600,2400,3600');
check('SNIPER trimmed again: 130 dmg base', sn.stats.dmg === 130);
check('SNIPER rail trimmed (150 / 215 / 330)', sn.track[1].sets.dmg === 150 && sn.track[3].sets.dmg === 215 && sn.track[4].sets.dmg === 330);
check('SHREDDER decrypts at Clearance 20 (2200 NC + 35 BT / 90 salvage)', sh && sh.unlock === 20 && sh.price.nc === 2200 && sh.price.bt === 35 && sh.cost === 90);
check('SHREDDER is the early-wave specialist: 11 dmg / 3 rate / 105 rng', sh && sh.stats.dmg === 11 && sh.stats.rate === 3 && sh.stats.rng === 105);
check('SHREDDER ladder tops out on purpose (3 small tiers, cap 18 dmg)', sh && sh.track.length === 3 && sh.track[2].sets.dmg === 18 && sh.track[2].sets.rng === 115);
check('SHREDDER has decal art', sh && sh.art === 'assets/towers/shredder.png' && fs.existsSync(path.join(ROOT, 'assets/towers/shredder.png')));

console.log('--- Nerfs: Shotgunner + Sniper (shop.js) ---');
check('SHOTGUNNER trimmed: 27 dmg / 12U base burst ring', sg.stats.dmg === 27 && sg.stats.splash === 12);
check('SHOTGUNNER ladder trimmed (splash 20/24, dmg 36/40)', sg.track[1].sets.splash === 20 && sg.track[2].sets.splash === 24 && sg.track[2].sets.dmg === 36 && sg.track[3].sets.dmg === 40);
check('SNIPER trimmed: 130 dmg base', sn.stats.dmg === 130);
check('SNIPER rail trimmed (150 / 215 / 330)', sn.track[1].sets.dmg === 150 && sn.track[3].sets.dmg === 215 && sn.track[4].sets.dmg === 330);
check('sniper rng + targeting untouched by the nerf', sn.track[0].sets.targeting === 'maxhp' && sn.track[4].sets.rng === 350 && sn.track[4].sets.rate === 0.4);

console.log('--- Combat wiring (combat.js) ---');
const combat = read('combat.js');
check('MISSILE SILO tracks air natively (no pad needed)', combat.includes("missilesilo: { air: 'yes' }"));
check('SHREDDER is ground-only with pad AA', combat.includes("shredder: { air: 'no' }"));
check('SHREDDER spits a chip-stream (fx-chip tracer)', combat.includes("case 'shredder':") && combat.includes("fireLine(tower, target, 'fx-chip'"));
check('CONTAGION wiring: virus hits infect with a 5s phase burn', combat.includes("target.corrupt = { dps: es.corrupt, t: 5 }") && combat.includes("damageEnemy(enemy, enemy.corrupt.dps * dt, { phase: true, src: 'virus' })"));
check('corruption tick guarded against friendly summons', combat.includes('if (es.corrupt && !target.friendly)'));
check('tower panel shows live CONTAGION intel', combat.includes('<span>CONTAGION</span>'));
check('DRONE SPAWNER is a one-per-commander rig', combat.includes("new Set(['zeroday', 'corpseblossom', 'dronespawner', 'gravewarden'])"));
check('silo fires a visible warhead (kind missile + fx-missile node)', combat.includes("case 'missilesilo':") && combat.includes("kind: 'missile'") && combat.includes("fx-shell fx-missile"));
check('projectile loop flies shells AND missiles', combat.includes("p.kind === 'shell' || p.kind === 'missile'"));
check('MIRV cluster pass: 35% dmg out to 130u beyond the crater', combat.includes('if (p.cluster)') && combat.includes('Math.round(p.dmg * 0.35)') && combat.includes('d <= 130'));
check('strike-drone fabricator exists with target lead', combat.includes('function launchStrikeDrone(tower)') && combat.includes('const lead = 0.9;'));
check('carrier upkeep ticks droneCd and launches on cadence', combat.includes("tower.id === 'dronespawner'") && combat.includes('tower.droneCd <= 0 && launchStrikeDrone(tower)'));
check('strike drones respect the global summon cap', combat.split('launchStrikeDrone(tower)').length > 1 && combat.includes('item.friendly && item.alive).length >= SUMMON_CAP'));
check('tower panel shows live STRIKE DRONE intel', combat.includes('<span>STRIKE DRONE</span>') && combat.includes('<span>NEXT LAUNCH</span>'));

console.log('--- HARD escalation (combat.js) ---');
const ENEMY_TYPES = extractLiteral(combat, 'ENEMY_TYPES');
const SURGE_MODS = extractLiteral(combat, 'SURGE_MODS');
const HARD_WAVES = extractLiteral(combat, 'HARD_WAVES');
check('MODE_HP_GROWTH.hard = 0.1 (1.10x compounding)', combat.includes('MODE_HP_GROWTH = { hard: 0.1, insane: 0.105, crimson: 0.13 }'));
check('MODE_SPEED.hard = 1.15 (+15% hostile speed)', combat.includes('MODE_SPEED = { hard: 1.15, insane: 1.16, crimson: 1.18 }'));
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
check('non-admin seal untouched: default shop profile has no admin flag', shopjs.includes('ultClaims: 0, admin: false }'));
check('phantom bay fix: setProfile purges catalog-dead blueprint ids', shopjs.includes('towerById(id) && profile.owned.includes(id)'));

console.log('--- FULL CLEARANCE: all-perks admin + event debrief (app.js/combat.js/server.js) ---');
check('CBZPerks.has grants flag-admins every perk without achievements', appjs.includes('if (!profile.admin && (!profile.achievements || !profile.achievements[perk.ach])) return false;'));
check('perks panel renders admin-decrypted cards with the clearance line', appjs.includes('const earned = admin || cleared;') && appjs.includes('>> ADMIN CLEARANCE — DECRYPTED WITHOUT THE RECORD.'));
check('earned-achievement cards still show the standard standby line', appjs.includes("const standby = cleared ? '>> ON STANDBY — EQUIP INTO ONE OF TWO SLOTS.'"));
check('LOCAL /api/perks lets admins equip unearned perks', appjs.includes("if (!ach[achId] && !admin) throw new Error('That perk is still encrypted — earn its achievement first.');"));
check('LOCAL admin check covers roster names AND flag-admins', appjs.includes('const admin = Boolean(meta.admin) || isAdminName(account.name); // FULL CLEARANCE — admins skip the vault'));
check('server /api/perks mirror grants admins the same clearance', serverjs.includes('if (!ach[achId] && !isAdmin(name)) return sendJson(response, 403'));
const crimsonMap = extractLiteral(appjs, 'CRIMSON_MAP');
check('CRIMSON_MAP flagged as an event gamemode', Boolean(crimsonMap) && crimsonMap.event === true && crimsonMap.theme === 'crimson');
check('event debrief omits the retry button entirely', combat.includes("const eventMode = Boolean((state.map && state.map.event) || state.protocol === 'crimson');") && combat.includes("eventMode ? '' : `<button class=\"inline-button\" id=\"end-redeploy\"") && combat.includes("if (!eventMode) panel.querySelector('#end-redeploy')"));
check('non-event debrief keeps RE-DEPLOY / RETRY', combat.includes("${win ? 'RE-DEPLOY' : 'RETRY'}"));
check('event debrief keeps RETURN TO BAY as the exit', combat.includes("<button class=\"inline-button\" id=\"end-bay\" type=\"button\">RETURN TO BAY</button>"));

console.log('--- ULTIMATUM: uncapped clearance + core vault (shop.js/app.js/server.js) ---');
const indexhtml = read('index.html');
const styles = read('styles.css');
check('level cap is gone everywhere (app/server/shop)', !appjs.includes('MAX_LEVEL') && !serverjs.includes('MAX_LEVEL') && !shopjs.includes('MAX_LEVEL'));
check('MAX CLEARANCE display retired from the shop', !shopjs.includes('MAX CLEARANCE'));
check('lifetime XP ledger increments on missions (server + LOCAL)', serverjs.includes('meta.totalXp += xp;') && appjs.includes('meta.totalXp += xp;'));
check('lifetime XP ledger increments on salvage codes (server + LOCAL)', serverjs.includes('meta.totalXp += grant.xp;') && appjs.includes('meta.totalXp += grant.xp;'));
check('veteran backfill from clearance history (server + LOCAL)', serverjs.includes('back += xpToNext(l);') && appjs.includes('back += xpToNext(l);'));
const appUltCards = extractLiteral(appjs, 'ULT_CARDS');
const serverUltCards = extractLiteral(serverjs, 'ULT_CARDS');
check('ULT card catalog mirrors (corpseblossom: 1 core, L20)', JSON.stringify(appUltCards) === JSON.stringify(serverUltCards) && Boolean(appUltCards && appUltCards.corpseblossom) && appUltCards.corpseblossom.cores === 1 && appUltCards.corpseblossom.unlock === 20);
check('ULT_XP_PER_CORE mirrors at 50000 (app/server/shop)', /const ULT_XP_PER_CORE = 50000;/.test(appjs) && /const ULT_XP_PER_CORE = 50000;/.test(serverjs) && /const ULT_XP_PER_CORE = 50000;/.test(shopjs));
check('/api/ultimatum lives on server + LOCAL', serverjs.includes("pathname === '/api/ultimatum'") && appjs.includes("path === '/api/ultimatum'"));
check('exchange is a milestone claim (banked vs claims, both sides)', serverjs.includes('banked <= (meta.ultClaims || 0)') && appjs.includes('banked <= (meta.ultClaims || 0)'));
check('purchase guards: 409 dupe + 403 clearance + 402 cores (server)', serverjs.includes("'Ultimatum card already in your armory.'") && serverjs.includes('Clearance level ${card.unlock} required.') && serverjs.includes('Not enough Ultimatum cores'));
check('one-card rule enforced in both loadout validators', serverjs.includes('Only one ULTIMATUM card can be armed at a time') && appjs.includes('Only one ULTIMATUM card can be armed at a time'));
check('blossom left the NC/BT shop mirrors (Ultimatum-only)', !localShop.corpseblossom && !serverShop.corpseblossom);
check('shop catalog flags the blossom ULTIMATUM (adminOnly retired)', shopjs.includes('ultimatum: true') && !shopjs.includes('adminOnly: true'));
check('vault tab + panel + exchange wired in the shop', shopjs.includes('shop-tab-ult') && shopjs.includes('data-cat="__ult"') && shopjs.includes('id="shop-ultimatum"') && shopjs.includes('onUltClick'));
check('exchange button labels the 50k milestone dynamically', shopjs.includes('EXCHANGE ${format(ULT_XP_PER_CORE)} XP // BANK ') && shopjs.includes('REACH ${format(ULT_XP_PER_CORE)} TOTAL XP TO BANK A CORE'));
check('TOTAL XP counter lives in the shop wallet', shopjs.includes('TOTAL XP // LIFETIME') && shopjs.includes('id="shop-totalxp"'));
check('vault card renders blossom art + arm/buy actions', shopjs.includes('data-ult-buy="${card.id}"') && shopjs.includes("ULTIMATUM CARD ACQUIRED"));
check('client one-card guard + setProfile heal in shop.js', shopjs.includes('ONLY ONE ULTIMATUM CARD CAN BE ARMED') && shopjs.includes('let ultSeen = false;'));
check('blueprint grid excludes ULTIMATUM cards', shopjs.includes('!entry.ultimatum && (filter'));
check('ultimatum vault styled (gold hero + card + exchange)', styles.includes('.ult-hero') && styles.includes('.ult-card') && styles.includes('.ult-exchange.ready') && styles.includes('.tok-ult'));

console.log('--- Deploy chain: update log, build, cache-bust ---');
check('BUILD bumped to 2026.11.01', appjs.includes("const BUILD = '2026.11.01';"));
check('UPDATE LOG leads with ULTIMATUM entry', appjs.indexOf("version: '2026.10.28', tag: 'ULTIMATUM'") < appjs.indexOf("version: '2026.10.27'") && appjs.indexOf('FULL CLEARANCE') < appjs.indexOf('SCRAP PROTOCOL'));
check('update log covers cap removal + vault + blossom card + migration', ['clearance cap is GONE', 'ULTIMATUM system goes live', 'first ULTIMATUM card', 'backfilled from their clearance history'].every((s) => appjs.includes(s)));
check('update log covers sentinel buff + shredder + sniper nerf #3 + virus rework', ['SENTINEL TURRET buffed', 'SHREDDER decrypts at Clearance 20', 'SNIPER tuned down again', 'VIRUS reworked', 'MISSILE SILO'].every((s) => appjs.includes(s)));
const busts = indexhtml.match(/\?v=([0-9a-z]+)/g) || [];
check('all 6 index.html assets cache-busted to 20261024h', busts.length === 6 && busts.every((v) => v === '?v=20261024h'), busts.join(' '));
check('shell footer brands WAR CHEST', indexhtml.includes('BUILD 2026.11.01 // WAR CHEST') && indexhtml.includes('THE CRIMSON WELL IS OPEN') && indexhtml.includes('ULTIMATUM VAULT OPEN'));
check('play menu copy updated to 15% hostiles', appjs.includes('compounding hulls, 15% faster hostiles'));
check('fx-missile warhead styled (orange glow)', styles.includes('.fx-missile') && /fx-missile[^}]*#ff7a45/.test(styles));
check('fx-chip stream styled for the Shredder', styles.includes('.fx-chip'));

console.log('--- INSANE ERA: insane protocol + two new apex cards ---');
const INSANE_WAVES = extractLiteral(combat, 'INSANE_WAVES');
const INSANE_REWARDS_LOCAL = extractLiteral(appjs, 'REWARDS');
const INSANE_REWARDS_SERVER = extractLiteral(serverjs, 'REWARDS');
check('INSANE ladder registered in the WAVES map', combat.includes('WAVES = { easy: EASY_WAVES, medium: MEDIUM_WAVES, hard: HARD_WAVES, insane: INSANE_WAVES, crimson: CRIMSON_WAVES }'));
check('INSANE ladder has 30 waves', Array.isArray(INSANE_WAVES) && INSANE_WAVES.length === 30, String(INSANE_WAVES && INSANE_WAVES.length));
check('insane hull curve: 1.105x compounding (past HARD, under CRIMSON)', combat.includes('MODE_HP_GROWTH = { hard: 0.1, insane: 0.105, crimson: 0.13 }'));
check('insane speed: +16% (hard 15 / crimson 18)', combat.includes('MODE_SPEED = { hard: 1.15, insane: 1.16, crimson: 1.18 }'));
check('insane boss leaks near-kill the core (10x)', combat.includes('MODE_BOSS_LEAK = { hard: 10, insane: 10, crimson: 10 }'));
check('solo vote flips INSANE to READY with the spiral copy', combat.includes("label: 'INSANE', sub: '30 WAVES // COMPOUNDING HULLS · +16% SPEED · DAWNFIRE SURGES") && /label: 'INSANE'[\s\S]{0,220}ready: true/.test(combat));
check('dawnfire burns exactly 2 insane waves (TRIPLE THREAT + SIEGE WALL)', INSANE_WAVES && INSANE_WAVES.filter((w) => w.mod === 'dawnfire').length === 2 && INSANE_WAVES[21].phase === 'TRIPLE THREAT' && INSANE_WAVES[26].phase === 'SIEGE WALL');
check('insane final wave keeps the overseer + 3 wardens escort', INSANE_WAVES && INSANE_WAVES[29].groups.some(([k, c]) => k === 'warden' && c === 3) && INSANE_WAVES[29].groups.some(([k, c]) => k === 'overseer' && c === 1));
check('insane economy: opening -25% / wave pay 80% / rebuild 3.5s', combat.includes("mode === 'insane' ? 0.75 : 0.8") && combat.includes("state.protocol === 'insane' ? 0.8 :") && combat.includes("state.protocol === 'insane' ? 3.5 :"));
check('insane pays 350 NC / 400 XP per win, mirrored exactly', INSANE_REWARDS_LOCAL && INSANE_REWARDS_SERVER && INSANE_REWARDS_LOCAL.insane.winNC === 350 && INSANE_REWARDS_LOCAL.insane.winXP === 400 && JSON.stringify(INSANE_REWARDS_LOCAL.insane) === JSON.stringify(INSANE_REWARDS_SERVER.insane));
check('room protocols carry insane (LOCAL + server sync)', appjs.includes("const ROOM_PROTOCOLS = ['easy', 'medium', 'hard', 'insane'];") && serverjs.includes("const PROTOCOL_CHOICES = ['easy', 'medium', 'hard', 'insane'];"));
check('play menu copy names the spiral', appjs.includes('INSANE (30 waves on the spiral'));
check('OPEN ROSTER: EXECUTIONER sold in the grid (no ULT flag), warden stays apex', TOWERS && TOWERS.some((t) => t.id === 'gravewarden' && t.ultimatum === true && t.limit === 1 && t.cost === 400 && t.track.length === 6) && TOWERS.some((t) => t.id === 'executioner' && !t.ultimatum && t.limit === 3 && t.unlock === 50 && t.price && t.price.nc === 12000 && t.price.bt === 150 && t.track.length === 5));
check('apex decals shipped + dawnbreaker decal', fs.existsSync(path.join(ROOT, 'assets/towers/gravewarden.png')) && fs.existsSync(path.join(ROOT, 'assets/towers/executioner.png')) && fs.existsSync(path.join(ROOT, 'assets/towers/dawnbreaker.png')) && shopjs.includes("art: 'assets/towers/dawnbreaker.png'"));
check('shop ULT_CARDS: 2 cards — blossom 1 core / warden 2 cores, headsman gone', /const ULT_CARDS = \[[\s\S]*?corpseblossom[\s\S]*?cores: 1[\s\S]*?gravewarden[\s\S]*?cores: 2[\s\S]*?\];/.test(shopjs) && !shopjs.includes("id: 'executioner', name: 'EXECUTIONER', cores"));
check('free-claim rendering retired with the headsman', !shopjs.includes('CLAIM // FREE AT CLEARANCE') && !shopjs.includes('card.cores === 0'));
check('ULT one-card set trimmed to the vault duo (server + LOCAL)', serverjs.includes("new Set(['corpseblossom', 'gravewarden'])") && appjs.includes("new Set(['corpseblossom', 'gravewarden'])"));
check('server ULT_CARDS mirror: vault duo only', /gravewarden: \{ name: 'GRAVE WARDEN', cores: 2, unlock: 20 \}/.test(serverjs) && !serverjs.includes("executioner: { name: 'EXECUTIONER', cores"));
check('LOCAL ULT_CARDS mirror matches server', /gravewarden: \{ name: 'GRAVE WARDEN', cores: 2, unlock: 20 \}/.test(appjs) && !appjs.includes("executioner: { name: 'EXECUTIONER', cores"));
check('EXECUTIONER priced in both SHOP mirrors at Clearance 50', serverjs.includes("executioner: { name: 'EXECUTIONER', unlock: 50, price: { nc: 12000, bt: 150 }, currency: 'mixed' }") && appjs.includes("executioner: { name: 'EXECUTIONER', unlock: 50, price: { nc: 12000, bt: 150 }, currency: 'mixed' }"));
check('combat: warden + executioner registered as unique rigs with the right AA rules', combat.includes("gravewarden: { air: 'no' }") && combat.includes("executioner: { air: 'yes' }") && combat.includes("new Set(['zeroday', 'corpseblossom', 'dronespawner', 'gravewarden'])"));
check('executioner rail: max-hull targeting + boss-only full damage + execute cut', combat.includes("case 'executioner':") && /target\.t\.boss \? dmg : Math\.max\(1, Math\.round\(dmg \* \(es\.chaffPct \|\| 0\.15\)\)\)/.test(combat) && /target\.key !== 'overseer' && target\.hp <= target\.maxHp \* \(es\.execute \|\| 0\.15\)/.test(combat));
check('grave warden: DEATH TOLL bell + yard slow + kill-charge feed', combat.includes('function graveWardenFeed') && combat.includes('function wardenYardMult') && /es\.bell && tower\.bellCd <= 0/.test(combat) && /enemy\.stun = Math\.max\(enemy\.stun \|\| 0, es\.tollStun \|\| 0\.8\)/.test(combat));
check('yard slow bites walkers AND flyers (both move lines hooked)', (combat.match(/wardenYardMult\(enemy\)/g) || []).length >= 3);
check('tower panel reports apex readouts', combat.includes('COMMANDERS BELOW') && combat.includes('TOLL CHARGES'));
check('UPDATE LOG leads with INSANE ERA entry', appjs.indexOf("version: '2026.10.30', tag: 'INSANE ERA'") >= 0 && appjs.indexOf("version: '2026.10.30'") < appjs.indexOf("version: '2026.10.29'"));
check('update log covers insane + warden + executioner + one-card extension', ['INSANE PROTOCOL goes live', 'GRAVE WARDEN joins the ULTIMATUM vault', 'headsman', 'One-card rule extends'].every((s) => appjs.includes(s)));

console.log('--- DAWN FORGE: 50k cores + relic singular + headsman musters + friendly fire-control ---');
check('update log leads with DAWN FORGE entry', appjs.indexOf("version: '2026.10.33', tag: 'DAWN FORGE'") >= 0 && appjs.indexOf("version: '2026.10.33'") < appjs.indexOf("version: '2026.10.32'"));
check('DAWNBRINGER capped at one per commander', TOWERS.some((t) => t.id === 'dawnbreaker' && t.limit === 1 && t.stats.tgt.includes('ONE PER COMMANDER')));
check('EXECUTIONER nerfed: 72 dmg / 0.45 rate / 12% base execute', TOWERS.some((t) => t.id === 'executioner' && t.stats.dmg === 72 && t.stats.rate === 0.45 && t.stats.execute === 0.12));
check('EXECUTIONER ladder rolled down to FINAL RITUAL 330 / 0.68 / 22% / 16%', TOWERS.some((t) => { const tier = t.track[4]; return tier && tier.sets.dmg === 330 && tier.sets.rate === 0.68 && tier.sets.execute === 0.22 && tier.sets.chaffPct === 0.16; }));
check('EXECUTIONER copy musters three rails', shopjs.includes('UP TO 3 PER COMMANDER') && shopjs.includes('Up to three rails per commander.'));
check('deploy caps are count-based (limitReached + limitToast)', combat.includes('function limitReached(entry)') && combat.includes('state.towers.filter((tower) => tower.id === entry.id).length >= entry.limit') && combat.includes('function limitToast(entry)'));
check('both deploy gates run the count check', (combat.match(/limitReached\(entry\)/g) || []).length >= 2 && !combat.includes('state.towers.some((tower) => tower.id === entry.id)'));
check('fire-control skips friendly summons', /let pool = state\.enemies\.filter\(\(enemy\) => \{[\s\S]{0,220}if \(enemy\.friendly\) return false;/.test(combat));
check('dawn splash skips friendlies too', combat.includes('if (!enemy.alive || enemy === target || enemy.friendly) continue;'));
check('summon hover intel wired (risen + strike drones)', combat.includes('function showSummonTip(summon, event)') && (combat.match(/showSummonTip\(/g) || []).length >= 3 && combat.includes("'CORPSE BLOSSOM SPAWN'") && combat.includes("'DRONE SPAWNER PAYLOAD'"));
check('friendly tip shows live HP + allegiance', combat.includes('ALLEGIANCE') && combat.includes('TOWERS IGNORE IT'));
check('ledger reconcile floor in both sanitizers (heal up, never down)', /if \(back > \(meta\.totalXp \|\| 0\)\) meta\.totalXp = back;/.test(serverjs) && /if \(back > \(meta\.totalXp \|\| 0\)\) meta\.totalXp = back;/.test(appjs) && /if \(back > \(legacy\.totalXp \|\| 0\)\) legacy\.totalXp = back;/.test(serverjs));
check('vault panel labels the next-core bar + reassures the ledger', shopjs.includes('PROGRESS INTO THE NEXT CORE') && shopjs.includes('banking one never resets or spends your TOTAL XP'));
check('DAWNBRINGER relic rig: corona rings + sun core + muzzle in combat', combat.includes("entry.id === 'dawnbreaker'") && combat.includes("class: 'tw-corona'") && combat.includes("class: 'tw-suncore'") && combat.includes("class: 'tw-muzzle'"));
check('dawn lance fires a layered beam (halo under core)', combat.includes("fireLine(tower, target, 'fx-dawn-halo', 6.5)") && combat.includes("fireLine(tower, target, 'fx-dawn', 2.6)"));
check('relic rig styled: corona spin + sun pulse + halo sheath + green summon tip', styles.includes('@keyframes corona-spin') && styles.includes('@keyframes sun-pulse') && styles.includes('.fx-dawn-halo') && styles.includes('.tip-head.summon') && styles.includes('.tw-dawnbreaker .tw-barrel'));
check('per-kind tower class hook shipped', combat.includes('tw-${entry.cat} tw-${entry.id}'));

console.log('--- WAR CHEST: nerf pass + warden choir + fillers + relay + cap 15 + unique kits ---');
check('update log leads with WAR CHEST entry', appjs.indexOf("version: '2026.11.01', tag: 'WAR CHEST'") >= 0 && appjs.indexOf("version: '2026.11.01'") < appjs.indexOf("version: '2026.10.33'"));
check('update log covers nerf pass + choir + fillers + relay + cap + art', ['nerf hammer falls', 'SOUL CHOIR', 'SPARK COIL', 'FLAK POST', 'TAR SPRAYER', 'COMMAND RELAY', 'max 15 towers again', 'WAR MACHINE achievement', '17 unique field rigs'].every((s) => appjs.includes(s)));
check('DAWNBRINGER nerfed: 330 dmg / 0.8 rate base', TOWERS.some((t) => t.id === 'dawnbreaker' && t.stats.dmg === 330 && t.stats.rate === 0.8));
check('SUNSLAUGHTER rolled down to 1250 dmg / 40 splash', TOWERS.some((t) => { const tier = t.track && t.track[3]; return t.id === 'dawnbreaker' && tier && tier.sets.dmg === 1250 && tier.sets.splash === 40; }));
check('VIRUS ZERO PATIENT nerfed: 64 dmg / 3.8 rate / 55 corruption', TOWERS.some((t) => { const tier = t.track && t.track[4]; return t.id === 'virus' && tier && tier.sets.dmg === 64 && tier.sets.rate === 3.8 && tier.sets.corrupt === 55; }));
check('SNIPER RAIL GUNNER trimmed to 330', TOWERS.some((t) => { const tier = t.track && t.track[4]; return t.id === 'sniper' && tier && tier.sets.dmg === 330; }));
check('MIRV PROTOCOL trimmed: 650 dmg / 80 splash', TOWERS.some((t) => { const tier = t.track && t.track[3]; return t.id === 'missilesilo' && tier && tier.sets.dmg === 650 && tier.sets.splash === 80; }));
check('APEX CARRIER payload trimmed to 200', TOWERS.some((t) => { const tier = t.track && t.track[3]; return t.id === 'dronespawner' && tier && tier.sets.drone === 200; }));
check('ZERO DAY nuke cut to 1700 + MIRV cluster to 35%', combat.includes('const NUKE_DAMAGE = 1700') && combat.includes('Math.round(p.dmg * 0.35)'));
const warden = TOWERS.find((t) => t.id === 'gravewarden');
check('GRAVE WARDEN all-around buffs: 180 base yard, 6-tier ladder', warden && warden.stats.rng === 180 && warden.track.length === 6);
check('warden ladder rolled up (90 bell / 40% slow / 180+5.5s / 330+4s+50%+1.4s)', warden && warden.track[1].sets.bell === 90 && warden.track[2].sets.yardSlow === 0.4 && warden.track[3].sets.bell === 180 && warden.track[3].sets.bellEvery === 5.5 && warden.track[4].sets.bell === 330 && warden.track[4].sets.bellEvery === 4 && warden.track[4].sets.yardSlow === 0.5 && warden.track[4].sets.tollStun === 1.4);
const soulTier = warden && warden.track[5];
check('SOUL CHOIR is the priciest tier ever minted ($5,200, soul + $900 + 45s)', soulTier && soulTier.label === 'SOUL CHOIR' && soulTier.cost === 5200 && soulTier.sets.soul === 1 && soulTier.sets.soulCost === 900 && soulTier.sets.soulCd === 45);
check('soul summon wired: launchWardenSoul + castSoul + core rise float', combat.includes('function launchWardenSoul(tower)') && combat.includes('function castSoul(tower)') && combat.includes("'A SOUL RISES FROM THE CORE'") && combat.includes("lane.len - 4"));
check('soul hull forges from the yard: 10 x TOLL CHARGES (min 50)', combat.includes('Math.max(50, 10 * (tower.tollCharges || 0))'));
check('soul rides the summon pipeline (friendly + reverse + kamikaze)', combat.includes("key: 'soul', t, node: g, fill, shieldFill: fill") && combat.includes('friendly: true, reverse: true,'));
check('soul hover intel: GRAVE WARDEN CHOIR tag wired', combat.includes("'GRAVE WARDEN CHOIR'") && combat.includes("'VENGEFUL SOUL'"));
check('warden panel shows SOUL CHOIR row + SUMMON SOUL ability', combat.includes('<span>SOUL CHOIR</span>') && combat.includes('SUMMON SOUL — $') && combat.includes("id=\"tp-soul\""));
check('warden soulCd ticks in upkeep', combat.includes('tower.soulCd = Math.max(0, (tower.soulCd || 0) - dt);'));
const spark = TOWERS.find((t) => t.id === 'sparkcoil');
const flak = TOWERS.find((t) => t.id === 'flakpost');
const tar = TOWERS.find((t) => t.id === 'tarsprayer');
const relay = TOWERS.find((t) => t.id === 'relay');
check('SPARK COIL filler registered (L6, 950+15, weak 3-tier ladder)', spark && spark.unlock === 6 && spark.price.nc === 950 && spark.price.bt === 15 && spark.cost === 120 && spark.track.length === 3 && spark.track[2].sets.dmg === 16);
check('FLAK POST filler registered (L10, 1400+20, flyers-only)', flak && flak.unlock === 10 && flak.price.nc === 1400 && flak.price.bt === 20 && flak.cost === 160 && flak.stats.tgt.includes('FLYERS ONLY'));
check('TAR SPRAYER filler registered (L12, 1750+25, no damage, slow 15%)', tar && tar.unlock === 12 && tar.price.nc === 1750 && tar.price.bt === 25 && tar.stats.dmg === 0 && tar.stats.slow === 0.15);
check('COMMAND RELAY support rig registered (L18, 4300+70, limit 1, +10% dmg aura)', relay && relay.unlock === 18 && relay.limit === 1 && relay.stats.dmgBuff === 0.1 && relay.track.length === 5);
check('RALLY CRY is the relay capstone ($600 cast / 45s cd / +50% for 6s)', relay && relay.track[4].label === 'RALLY CRY' && relay.track[4].sets.rallyCost === 600 && relay.track[4].sets.rallyCd === 45);
check('filler + relay decals shipped and wired', ['sparkcoil', 'flakpost', 'tarsprayer', 'relay'].every((id) => { const e = TOWERS.find((t) => t.id === id); return e && e.art === `assets/towers/${id}.png` && fs.existsSync(path.join(ROOT, `assets/towers/${id}.png`)); }));
check('FLAK POST flies a new air rule (only) + fire-control honors it', combat.includes("flakpost: { air: 'only' }") && combat.includes("if (rule.air === 'only' && !enemy.t.flying) return false;"));
check('new fire cases wired (fx-spark + fx-flak + flyer-only burst)', combat.includes("case 'sparkcoil':") && combat.includes("fireLine(tower, target, 'fx-spark'") && combat.includes("case 'flakpost':") && combat.includes("fireLine(tower, target, 'fx-flak'") && combat.includes('!enemy.t.flying) continue;'));
check('tar slick applies to walkers only + drags both move paths', combat.includes('enemy.tar = es.slow; enemy.tarT = 0.4;') && (combat.match(/tarMult\(enemy\)/g) || []).length >= 2 && combat.includes('function tarMult(enemy)'));
check('relay network buffs hook dmg + rate + range', combat.includes("dmg *= relayMult(tower, 'dmg');") && combat.includes("relayMult(tower, 'rate')") && combat.includes("relayMult(tower, 'range')"));
check('RALLY CRY casts: castRally + panel button + rally clock', combat.includes('function castRally(tower)') && combat.includes('other.rallyT = 6') && combat.includes('tower.boost = tower.rallyT > 0 ? 1.5 : 1;') && combat.includes("id=\"tp-rally\""));
check('command ceiling back to 15 (SATURATION DOCTRINE buys 20)', combat.includes('const TOWER_BASE = 15;') && combat.includes("CBZPerks.has('saturation') ? base + 5 : base"));
check('SATURATION DOCTRINE perk + WAR MACHINE achievement registered (app)', appjs.includes("id: 'saturation', name: 'SATURATION DOCTRINE', ach: 'warmachine'") && appjs.includes("id: 'warmachine', name: 'WAR MACHINE'") && /warmachine: Boolean\(bigWins >= 15\)/.test(appjs));
check('perk + achievement mirrors land server-side', serverjs.includes("saturation: 'warmachine'") && /warmachine: Boolean\(bigWins >= 15\)/.test(serverjs));
check('four new blueprints priced in both SHOP mirrors', ['sparkcoil', 'flakpost', 'tarsprayer', 'relay'].every((id) => serverjs.includes(`${id}: { name:`) && appjs.includes(`${id}: { name:`)));
check('artHtml reaches the mission bar + locked card previews', shopjs.includes('ULT_XP_PER_CORE, artHtml }') && combat.includes('CBZShop.artHtml ? CBZShop.artHtml(entry)') && (shopjs.match(/artHtml\(entry\) \|\| entry\.icon/g) || []).length >= 3);
check('per-kind field kits live (kindKit + kit CSS + per-tower paint)', combat.includes('function kindKit(entry, chassis, head)') && combat.includes('kindKit(entry, chassis, head);') && styles.includes('.tw-kit-drum') && styles.includes('.tw-relay .tw-kit-halo') && styles.includes('.tw-tarsprayer .tw-kit-vat'));
check('shop meters gained SLICK + NETWORK rows', shopjs.includes("<span>SLICK</span>") && shopjs.includes("<span>NETWORK</span>"));

console.log('--- Syntax gates ---');
for (const f of ['combat.js', 'app.js', 'server.js', 'shop.js']) {
  try { require('child_process').execSync(`node --check ${path.join(ROOT, f)}`, { stdio: 'pipe' }); check(`${f} parses clean`, true); }
  catch (err) { check(`${f} parses clean`, false, String(err.stderr).slice(0, 200)); }
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
