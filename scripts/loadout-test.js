// Deployment loadout endpoint tests — phase 1: fresh account; phase 2: persistence after server restart.
// Usage: node scripts/loadout-test.js 1   (then after server restart)  node scripts/loadout-test.js 2
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
  const identity = { identity: 'LOADCMDR1', passcode: 'test1234' };
  const reg = await api('/api/register', { name: 'LOADCMDR1', email: 'load1@test.io', passcode: 'test1234' });
  let token = reg.data.token;
  check('register (or existing)', reg.data.ok || /already/.test(reg.data.error || ''), JSON.stringify(reg.data));
  if (!token) {
    const login = await api('/api/login', identity);
    token = login.data.token;
    check('login fallback', Boolean(token), JSON.stringify(login.data));
  }
  const denied = await api('/api/loadout', { token: 'garbage', loadout: ['sentinel'] });
  check('unauthenticated loadout 401', denied.status === 401);

  if (phase === '1') {
    const prof = await api('/api/profile', { token });
    check('profile ships loadout field', Array.isArray(prof.data.profile.loadout), JSON.stringify(prof.data.profile));
    check('default loadout = [sentinel]', prof.data.profile.loadout.length === 1 && prof.data.profile.loadout[0] === 'sentinel', JSON.stringify(prof.data.profile.loadout));

    // Own a second blueprint so multi-bay loadouts can be tested.
    const buy = await api('/api/shop/purchase', { token, itemId: 'arclance' });
    check('buy arclance ok', Boolean(buy.data.ok), JSON.stringify(buy.data));

    const set = await api('/api/loadout', { token, loadout: ['sentinel', 'arclance'] });
    check('set 2-bay loadout ok', set.data.ok && set.data.profile.loadout.join(',') === 'sentinel,arclance', JSON.stringify(set.data));

    const reorder = await api('/api/loadout', { token, loadout: ['arclance', 'sentinel'] });
    check('reorder bays ok', reorder.data.ok && reorder.data.profile.loadout.join(',') === 'arclance,sentinel', JSON.stringify(reorder.data));

    const unowned = await api('/api/loadout', { token, loadout: ['plasmort'] });
    check('unowned blueprint rejected 400', unowned.status === 400, JSON.stringify(unowned.data));

    const six = await api('/api/loadout', { token, loadout: ['sentinel', 'sentinel', 'sentinel', 'sentinel', 'sentinel', 'sentinel'] });
    check('oversized/dup loadout rejected 400', six.status === 400, JSON.stringify(six.data));

    const nonList = await api('/api/loadout', { token, loadout: 'sentinel' });
    check('non-array payload rejected 400', nonList.status === 400);

    const empty = await api('/api/loadout', { token, loadout: [] });
    check('empty loadout allowed', empty.data.ok && empty.data.profile.loadout.length === 0, JSON.stringify(empty.data));
    const restore = await api('/api/loadout', { token, loadout: ['arclance', 'sentinel'] });
    check('loadout restored for phase 2', restore.data.ok && restore.data.profile.loadout.length === 2, JSON.stringify(restore.data));

    const mission = await api('/api/mission/complete', { token, result: 'win', wavesCleared: 15, bossesKilled: 3, flawless: true, bonusNc: 40, difficulty: 'easy' });
    check('mission pays bonusNc 40', mission.data.ok && mission.data.rewards.bonusNc === 40, JSON.stringify(mission.data.rewards));
    const ncNoBonus = 15 * 8 + 3 * 10 + 60 + 25;
    check('bonus folded into nc total', mission.data.rewards.nc === ncNoBonus + 40, `nc=${mission.data.rewards.nc} expected=${ncNoBonus + 40}`);

    const capped = await api('/api/mission/complete', { token, result: 'loss', wavesCleared: 1, bossesKilled: 0, bonusNc: 99999, difficulty: 'easy' });
    check('bonusNc clamped to 600', capped.data.ok && capped.data.rewards.bonusNc === 600, JSON.stringify(capped.data.rewards));
  } else {
    const prof = await api('/api/profile', { token });
    check('loadout persisted after restart', prof.data.ok && prof.data.profile.loadout.join(',') === 'arclance,sentinel', JSON.stringify(prof.data.profile));
  }

  console.log(`\n${pass} PASSED / ${fail} FAILED`);
  process.exit(fail ? 1 : 0);
})();
