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

    const buy = await api('/api/shop/purchase', { token, itemId: 'arclance' });
    check('buy arclance 400 -> nc=350', buy.data.ok && buy.data.profile.nc === 350 && buy.data.profile.owned.includes('arclance'), JSON.stringify(buy.data));
    const dup = await api('/api/shop/purchase', { token, itemId: 'arclance' });
    check('duplicate rejected 409', dup.status === 409);
    const locked = await api('/api/shop/purchase', { token, itemId: 'singularity' });
    check('locked tower rejected 403', locked.status === 403, JSON.stringify(locked.data));
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
    check('wallet totals nc=635 bt=11', win.data.profile.nc === 635 && win.data.profile.bt === 11, JSON.stringify(win.data.profile));
    const poor = await api('/api/shop/purchase', { token, itemId: 'scrapforge' });
    check('unaffordable+unlocked -> 402 (700 > 635)', poor.status === 402, `status=${poor.status}`);

    const again = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 999, bossesKilled: 99, difficulty: 'easy' });
    check('input clamped: nc=210 (no flawless)', again.data.rewards.nc === 210, JSON.stringify(again.data.rewards));
    check('no second firstClear, bt=3', again.data.rewards.firstClear === false && again.data.rewards.bt === 3, JSON.stringify(again.data.rewards));
    check('level L5->L6, xp=143 banked', again.data.profile.level === 6 && again.data.profile.xp === 143, JSON.stringify(again.data.profile));
    console.log(`PHASE1 RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }

  if (phase === '2') {
    const prof = await api('/api/profile', { token });
    check('persisted after restart: nc=845 bt=14 lv=6', prof.data.profile && prof.data.profile.nc === 845 && prof.data.profile.bt === 14 && prof.data.profile.level === 6, JSON.stringify(prof.data));
    check('persisted armory: sentinel + arclance', prof.data.profile.owned.includes('sentinel') && prof.data.profile.owned.includes('arclance'), JSON.stringify(prof.data.profile));
    check('persisted firstClear flag', prof.data.profile.firstClear === true);
    console.log(`PHASE2 RESULT: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  }
  process.exit(1);
})();
