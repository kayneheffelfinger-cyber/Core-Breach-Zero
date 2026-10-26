#!/bin/bash
# DAWN FORGE QA: 50k core vault readout -> relic + headsman shop cards ->
# combat: 3-rail headsman cap + one-off relic cap + corona rig -> blossom spawns
# rise, hover shows the green friendly-intel card, and no tower targets a friendly.
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"
PASS=0; FAIL=0
ok() { if [ "$2" = "true" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1 (got: $2)"; FAIL=$((FAIL+1)); fi; }

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-dawnforge.log 2>&1 &)
sleep 1.4

$B set viewport 1440 900
$B open "http://127.0.0.1:3111/" > /dev/null
$B wait --load networkidle; sleep 0.8
$B find first "#tab-register" click; sleep 0.3
$B find first "#auth-name" fill "DAWNQA"
$B find first "#auth-email" fill "dawnqa@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
sleep 0.5

echo "--- flow 1: vault panel reads 50k cores; relic + headsman cards carry the new caps"
$B eval "window.CBZShop.setProfile({ name: 'DAWNQA', level: 55, xp: 0, nc: 90000, bt: 400, owned: ['sentinel','lazermortar','dawnbreaker','executioner','corpseblossom'], loadout: ['sentinel','dawnbreaker','executioner','corpseblossom'], totalXp: 125000, ultCores: 0, ultClaims: 0 }); 'armed'" > /dev/null
$B find first "[data-menu=\"shop\"]" click; sleep 1.2
ok "relic card renders with its decal" "$($B eval "Boolean(document.querySelector('.tower-card[data-id=\"dawnbreaker\"] img.tw-art[src=\"assets/towers/dawnbreaker.png\"]'))")"
ok "relic card says ONE PER COMMANDER" "$($B eval "document.body.innerHTML.includes('ONE PER COMMANDER')")"
ok "headsman card says UP TO 3 PER COMMANDER" "$($B eval "document.body.innerHTML.includes('UP TO 3 PER COMMANDER')")"
ok "headsman card shows nerfed FINAL RITUAL 330" "$($B eval "document.body.innerHTML.includes('DMG 210 → 330')")"
$B find first "[data-cat=\"__ult\"]" click; sleep 0.8
ok "vault labels the bar PROGRESS INTO THE NEXT CORE" "$($B eval "document.querySelector('#shop-ultimatum').textContent.includes('PROGRESS INTO THE NEXT CORE')")"
ok "next-core bar reads 25,000 / 50,000" "$($B eval "document.querySelector('#shop-ultimatum').textContent.includes('25,000 / 50,000 XP')")"
ok "exchange button banks 2 ready cores" "$($B eval "document.querySelector('#shop-ultimatum').textContent.includes('BANK 2 ULTIMATUM CORES')")"
ok "foot prints 50,000 XP PER CORE" "$($B eval "document.querySelector('#shop-ultimatum').textContent.includes('50,000 XP PER CORE')")"
ok "vault note reassures the ledger is never spent" "$($B eval "document.querySelector('#shop-ultimatum').textContent.includes('never resets or spends your TOTAL XP')")"
$B screenshot "$SS/70-dawn-forge-vault.png"
$B find first "#dialog-close" click; sleep 0.4

echo "--- flow 2: frozen wave — headsman musters 3, relic is singular, corona rig renders"
$B open "http://127.0.0.1:3111/?cbzwave=5&freeze=1&cash=9999" > /dev/null
$B wait --load networkidle; sleep 1.6
$B eval "window.CBZShop.setProfile({ name: 'DAWNQA', level: 55, xp: 0, nc: 90000, bt: 400, owned: ['sentinel','lazermortar','dawnbreaker','executioner','corpseblossom'], loadout: ['sentinel','dawnbreaker','executioner','corpseblossom'], totalXp: 125000 }); 're-armed'" > /dev/null
sleep 0.4
$B find first "[data-menu=\"play\"]" click; sleep 0.5
$B find text "SOLO MAP RECON" click; sleep 0.4
$B find first ".map-card" click; sleep 0.4
$B find first "#deploy-mission" click; sleep 0.4
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (const p of [...board.querySelectorAll('path')].slice(0, 2)) { try { const len = p.getTotalLength(); for (const f of [0.2, 0.45, 0.7, 0.9]) { const pt = p.getPointAtLength(len*f); const pt2 = p.getPointAtLength(Math.min(len, len*f + 8)); let dx = pt2.x - pt.x, dy = pt2.y - pt.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; for (const off of [70, -70]) clicks.push([rect.left + ox + (pt.x - dy*off)*scale, rect.top + oy + (pt.y + dx*off)*scale]); } } catch {} } window.__dawnClicks = clicks; return clicks.length; })()" > /dev/null
$B eval "document.querySelector('.lo-slot[data-tower=\"executioner\"]').click()" > /dev/null
$B eval "(() => { const c = window.__dawnClicks.slice(0, 3); for (const [x, y] of c) document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return '3 rails'; })()" > /dev/null
sleep 0.4
ok "three headsman rails deploy" "$($B eval "CBZCombat.stats().towersDetail.filter((t) => t.id === 'executioner').length === 3")"
$B eval "(() => { const [x, y] = window.__dawnClicks[3]; document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return '4th rail'; })()" > /dev/null
sleep 0.4
ok "4th rail rejected with the cap toast" "$($B eval "document.querySelector('#toast').textContent.includes('only 3 deploy per commander')")"
$B eval "document.querySelector('.lo-slot[data-tower=\"dawnbreaker\"]').click()" > /dev/null
$B eval "(() => { const [x, y] = window.__dawnClicks[4]; document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return 'relic down'; })()" > /dev/null
sleep 0.4
ok "relic deploys once" "$($B eval "CBZCombat.stats().towersDetail.filter((t) => t.id === 'dawnbreaker').length === 1")"
ok "corona rings render on the relic" "$($B eval "document.querySelectorAll('.tw-dawnbreaker .tw-corona').length === 2")"
ok "sun core + sun-disc muzzle render" "$($B eval "Boolean(document.querySelector('.tw-dawnbreaker .tw-suncore')) && Boolean(document.querySelector('.tw-dawnbreaker .tw-muzzle'))")"
$B eval "(() => { const [x, y] = window.__dawnClicks[5]; document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return '2nd relic'; })()" > /dev/null
sleep 0.4
ok "second relic rejected with the one-off toast" "$($B eval "document.querySelector('#toast').textContent.includes('one-off rig')")"
$B screenshot "$SS/71-dawn-forge-rig.png"

echo "--- flow 3: blossom rises spawns; hover shows friendly intel; guns ignore friendlies"
$B eval "document.querySelector('.lo-slot[data-tower=\"corpseblossom\"]').click()" > /dev/null
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const p = [...board.querySelectorAll('path')][0]; const len = p.getTotalLength(); const pt = p.getPointAtLength(len*0.5); const x = rect.left + ox + pt.x*scale; const y = rect.top + oy + (pt.y - 60)*scale; document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return 'blossom down'; })()" > /dev/null
sleep 0.4
ok "blossom deploys" "$($B eval "CBZCombat.stats().towersDetail.filter((t) => t.id === 'corpseblossom').length === 1")"
$B wait --fn "document.querySelectorAll('.e-summon').length >= 1" --timeout 40000
ok "risen spawn walks the lane" "$($B eval "document.querySelectorAll('.e-summon').length >= 1")"
$B eval "(() => { const node = document.querySelector('.e-summon'); const r = node.getBoundingClientRect(); node.dispatchEvent(new PointerEvent('pointerenter', { clientX: r.left + 6, clientY: r.top + 6, bubbles: true })); return 'hover'; })()" > /dev/null
sleep 0.4
ok "friendly-intel card opens on hover" "$($B eval "const tip = document.querySelector('.enemy-tip'); Boolean(tip) && !tip.hidden")"
ok "tip names the spawn CORPSE BLOSSOM SPAWN" "$($B eval "document.querySelector('.enemy-tip').textContent.includes('CORPSE BLOSSOM SPAWN')")"
ok "tip shows live HP + allegiance" "$($B eval "/\\d+\\/$\\d+ HP|\\d+\\/\\d+ HP/.test(document.querySelector('.enemy-tip').textContent) && document.querySelector('.enemy-tip').textContent.includes('YOURS')")"
ok "no tower targets a friendly (fire-control sample)" "$($B eval "CBZCombat.stats().friendlyTargeted === false && CBZCombat.stats().friendliesAlive >= 1")"
$B screenshot "$SS/72-dawn-forge-summon-tip.png"

pkill -f "node server.js" 2>/dev/null
echo "DAWN FORGE QA: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
