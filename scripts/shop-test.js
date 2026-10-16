// Nexus Shop endpoint tests — phase 1: fresh economy; phase 2: persistence after server restart.
// Usage: node scripts/shop-test.js 1   (then after server restart)  node scripts/shop-test.js 2
const BASE = `http://127.0.0.1:${process.env.PORT || 3111}`;
let pass = 0;
let fail = 0;

function check(name, condition, extra = '') {
  if (condition) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fail += 1;
    console.log(`FAIL ${name} ${extra}`);
  }
}

async function api(path, payload) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

(async () => {
  const phase = process.argv[2] || '1';
  const home = await fetch(`${BASE}/`);
  check('homepage 200', home.status === 200);
  const shopjs = await fetch(`${BASE}/shop.js`);
  check('shop.js served 200', shopjs.status === 200);
  const decal = await fetch(`${BASE}/assets/towers/sentinel.png`);
  check('tower decal asset served', decal.ok);

  const identity = { identity: 'SHOPCMDR1', passcode: 'test1234' };
  const reg = await api('/api/register', { name: 'SHOPCMDR1', email: 'shop1@test.io', passcode: 'test1234' });
  let token = reg.data.token;
  check('register (or existing)', reg.data.ok || /already/.test(reg.data.error || ''), JSON.stringify(reg.data));
  if (!token) {
    const login = await api('/api/login', identity);
    token = login.data.token;
    check('login fallback', Boolean(token), JSON.stringify(login.data));
  }

  if (phase === '1') {
    const prof = await api('/api/profile', { token });
    check('profile defaults nc=750 bt=0 lv=1', prof.data.profile && prof.data.profile.nc === 750 && prof.data.profile.bt === 0 && prof.data.profile.level === 1, JSON.stringify(prof.data));
    check('starter sentinel owned', Boolean(prof.data.profile.owned.includes('sentinel')), JSON.stringify(prof.data.profile));
    check('xpNext mirrors formula (55)', prof.data.profile.xpNext === 55, `xpNext=${prof.data.profile.xpNext}`);

    // Reward blueprint stays encrypted until the first Easy Mode clearance.
    const reward = await api('/api/shop/purchase', { token, itemId: 'lazermortar' });
    check('reward blueprint locked 403 before first clear', reward.status === 403, JSON.stringify(reward.data));
    const unknown = await api('/api/shop/purchase', { token, itemId: 'nope' });
    check('unknown blueprint 404', unknown.status === 404);
    const bad = await api('/api/profile', { token: 'garbage' });
    check('bad token 401', bad.status === 401);

    const loss = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 5, bossesKilled: 1, difficulty: 'easy' });
    check('loss nc = 5*8 + 1*10 = 50', loss.data.rewards.nc === 50, JSON.stringify(loss.data.rewards));
    check('loss bt = 1 (boss only)', loss.data.rewards.bt === 1);
    check('loss xp = 5*12 + 30 = 90', loss.data.rewards.xp === 90);
    check('loss levels up L1->L2 (90 >= 55)', loss.data.rewards.levelsGained === 1 && loss.data.profile.level === 2, JSON.stringify(loss.data.rewards));

    const win = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 15, bossesKilled: 3, flawless: true, difficulty: 'easy' });
    check('win nc = 235 (8*15+10*3+60+25)', win.data.rewards.nc === 235, JSON.stringify(win.data.rewards));
    check('win bt = 10 (3 bosses +2 flawless +5 firstClear)', win.data.rewards.bt === 10, `bt=${win.data.rewards.bt}`);
    check('firstClear flagged once', win.data.rewards.firstClear === true);
    check('win xp = 400 (180+90+80+50)', win.data.rewards.xp === 400);
    check('levels L2->L5 (+3), xp=13 left', win.data.rewards.levelsGained === 3 && win.data.profile.level === 5 && win.data.profile.xp === 13, JSON.stringify(win.data.rewards));
    check('wallet totals nc=1035 bt=11 (750+50+235)', win.data.profile.nc === 1035 && win.data.profile.bt === 11, JSON.stringify(win.data.profile));

    // First clearance decrypts the Lazer Mortar — free reward blueprint.
    const reward2 = await api('/api/shop/purchase', { token, itemId: 'lazermortar' });
    check('lazermortar unlocks after first clear (free)', reward2.data.ok && reward2.data.profile.owned.includes('lazermortar') && reward2.data.profile.nc === 1035, JSON.stringify(reward2.data));
    const dup = await api('/api/shop/purchase', { token, itemId: 'lazermortar' });
    check('duplicate rejected 409', dup.status === 409);

    // Virus costs 1000 NC + 30 BT — partial funds are rejected, then a grind pass funds it.
    const poor = await api('/api/shop/purchase', { token, itemId: 'virus' });
    check('dual-currency shortfall 402', poor.status === 402, `status=${poor.status}`);
    for (let i = 0; i < 4; i++) {
      await api('/api/mission/complete', { token, result: 'win', wavesCleared: 20, bossesKilled: 6, difficulty: 'easy' });
    }
    const funded = await api('/api/profile', { token });
    check('grind banked >= 1000 NC and >= 30 BT', funded.data.profile.nc >= 1000 && funded.data.profile.bt >= 30, JSON.stringify(funded.data.profile));
    const virus = await api('/api/shop/purchase', { token, itemId: 'virus' });
    check('dual-currency purchase deducts both', virus.data.ok && virus.data.profile.owned.includes('virus') && virus.data.profile.nc === funded.data.profile.nc - 1000 && virus.data.profile.bt === funded.data.profile.bt - 30, JSON.stringify(virus.data));

    // 3-bay loadout cap on the server side.
    const trio = await api('/api/loadout', { token, loadout: ['sentinel', 'lazermortar', 'virus'] });
    check('full unique loadout accepted', trio.data.ok && trio.data.profile.loadout.length === 3, JSON.stringify(trio.data));
    const four = await api('/api/loadout', { token, loadout: ['sentinel', 'sentinel', 'lazermortar', 'virus'] });
    check('duplicate bay rejected 400', four.status === 400, JSON.stringify(four.data));

    const again = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 999, bossesKilled: 99, difficulty: 'easy' });
    check('input clamped: nc=270 (20-wave caps)', again.data.rewards.nc === 270, JSON.stringify(again.data.rewards));
    check('no second firstClear, bt=5 (20-wave caps)', again.data.rewards.firstClear === false && again.data.rewards.bt === 5, JSON.stringify(again.data.rewards));

    // Salvage codes — /api/redeem grants once per commander account per code.
    const sealed = await api('/api/profile', { token });
    const beforeNc = sealed.data.profile.nc;
    const beforeBt = sealed.data.profile.bt;
    const noAuth = await api('/api/redeem', { code: 'NULLCORE' });
    check('redeem without token 401', noAuth.status === 401, JSON.stringify(noAuth.data));
    const badcode = await api('/api/redeem', { token, code: 'FREEMONEY' });
    check('unknown code rejected 404', badcode.status === 404, JSON.stringify(badcode.data));
    const nullcore = await api('/api/redeem', { token, code: 'nullcore' });
    check('NULLCORE (lowercase) grants +1500 NC', nullcore.data.ok && nullcore.data.profile.nc === beforeNc + 1500, JSON.stringify(nullcore.data));
    const dupe = await api('/api/redeem', { token, code: 'NULLCORE' });
    check('second NULLCORE rejected 409', dupe.status === 409, JSON.stringify(dupe.data));
    const ghostwire = await api('/api/redeem', { token, code: 'GHOSTWIRE' });
    check('GHOSTWIRE grants +75 BT', ghostwire.data.ok && ghostwire.data.profile.bt === beforeBt + 75, JSON.stringify(ghostwire.data));
    const datacache = await api('/api/redeem', { token, code: 'DATACACHE' });
    check('DATACACHE grants +4000 NC +100 BT', datacache.data.ok && datacache.data.profile.nc === beforeNc + 5500 && datacache.data.profile.bt === beforeBt + 175, JSON.stringify(datacache.data));
    const zeroday = await api('/api/redeem', { token, code: 'zeroday' });
    check('ZERODAY (lowercase) grants +5000 NC +500 BT', zeroday.data.ok && zeroday.data.profile.nc === beforeNc + 10500 && zeroday.data.profile.bt === beforeBt + 675, JSON.stringify(zeroday.data));
    console.log(`PHASE1 RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }

  if (phase === '2') {
    const prof = await api('/api/profile', { token });
    const p = prof.data.profile || {};
    check('persisted after restart: full armory', p.owned && p.owned.includes('sentinel') && p.owned.includes('lazermortar') && p.owned.includes('virus'), JSON.stringify(p));
    check('persisted firstClear flag', p.firstClear === true);
    check('persisted full loadout', Array.isArray(p.loadout) && p.loadout.length === 3, JSON.stringify(p.loadout));
    check('persisted redeemed ledger (4 codes)', Array.isArray(p.redeemed) && p.redeemed.length === 4, JSON.stringify(p.redeemed));
    console.log(`PHASE2 RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
  process.exit(1);
})();
