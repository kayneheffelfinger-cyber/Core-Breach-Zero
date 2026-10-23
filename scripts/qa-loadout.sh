#!/bin/bash
# Loadout + phantom-bay QA: strip -> PHANTOM EXORCISM (retired roster id must not occupy a bay)
# -> buy + equip a full 5-bay loadout -> mission bar -> place -> blocked -> sell -> towers kill
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa.log 2>&1 &)
sleep 1.4

$B set viewport 1440 900
$B open http://127.0.0.1:3111/ > /dev/null
$B wait --load networkidle
sleep 0.6
$B find first "#tab-register" click
sleep 0.4
$B find first "#auth-name" fill "QALOADOUT"
$B find first "#auth-email" fill "qaloadout@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
echo "logged in: $($B eval "document.querySelector('#cmdr-chip').textContent")"

echo "--- flow 1: shop loadout strip (1 filled + 4 empty bays)"
$B find first "[data-menu=\"shop\"]" click
sleep 1.0
echo "strip present: $($B eval "!!document.querySelector('#loadout-strip')")"
echo "filled bays: $($B eval "document.querySelectorAll('.ls-bay.filled').length")"
echo "empty bays: $($B eval "document.querySelectorAll('.ls-bay.ls-empty').length")"

echo "--- flow 2: PHANTOM BAY regression (arclance = blueprint retired in the 3-chassis rebuild)"
pkill -f "node server.js" 2>/dev/null; sleep 0.4
node -e "
const fs = require('fs');
const db = JSON.parse(fs.readFileSync('accounts.json', 'utf8'));
const acct = db.QALOADOUT;
acct.meta.level = 20; acct.meta.nc = 50000; acct.meta.bt = 2000;
acct.meta.owned.push('arclance');             // ghost blueprint from the old roster
acct.meta.loadout = ['sentinel', 'arclance']; // ghost occupies bay 2 while rendering EMPTY
fs.writeFileSync('accounts.json', JSON.stringify(db, null, 2));
console.log('phantom injected: loadout=' + acct.meta.loadout.join(','));
"
(PORT=3111 node server.js > /tmp/cbz-qa.log 2>&1 &)
sleep 1.4
$B open http://127.0.0.1:3111/ > /dev/null
$B wait --load networkidle
sleep 0.8
# Server restart wiped in-memory sessions — log back in if the overlay reappeared.
if [ "$($B eval "document.querySelector('#auth-overlay').hidden" | tr -d '"')" != "true" ]; then
  $B find first "#tab-login" click
  sleep 0.3
  $B find first "#auth-identity" fill "QALOADOUT"
  $B find first "#auth-passcode" fill "corebreach"
  $B find first "#auth-submit" click
  $B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
fi
TOKEN=$($B eval "localStorage.getItem('cbz-token')" | tr -d '"')
$B find first "[data-menu=\"shop\"]" click
sleep 1.0
PHANTOM=$($B eval "window.CBZShop.profile().loadout.includes('arclance')" | tr -d '"')
echo "phantom in live loadout (expect false): $PHANTOM"
FILLED=$($B eval "document.querySelectorAll('.ls-bay.filled').length")
EMPTY=$($B eval "document.querySelectorAll('.ls-bay.ls-empty').length")
echo "filled bays after exorcism (expect 1): $FILLED"
echo "empty bays after exorcism (expect 4): $EMPTY"
echo "header: $($B eval "document.querySelector('.ls-head small').textContent.slice(0, 42)")"
if [ "$PHANTOM" = "false" ] && [ "$FILLED" = "1" ] && [ "$EMPTY" = "4" ]; then echo "PASS phantom bay exorcised"; else echo "FAIL phantom still occupies a bay"; fi
$B screenshot "$SS/44-shop-loadout-strip.png"

echo "--- flow 2b: buy + equip four real towers -> a full 5-bay loadout"
for T in virus shotgunner sniper zeroday; do
  $B eval "document.querySelector('[data-buy=\"$T\"]').scrollIntoView({block:'center'})" > /dev/null
  $B find first "[data-buy='$T']" click
  sleep 0.3
  $B find first "[data-buy='$T']" click
  $B wait --fn "window.CBZShop.profile().owned.includes('$T')" --timeout 6000
  $B eval "document.querySelector('[data-equip=\"$T\"]').scrollIntoView({block:'center'})" > /dev/null
  $B find first "[data-equip='$T']" click
  sleep 0.5
done
echo "filled bays final (expect 5): $($B eval "document.querySelectorAll('.ls-bay.filled').length")"
echo "empty bays final (expect 0): $($B eval "document.querySelectorAll('.ls-bay.ls-empty').length")"
echo "loadout final: $($B eval "window.CBZShop.loadout().map((t) => t.id).join(',')")"
HEAL=$(curl -s -X POST http://127.0.0.1:3111/api/profile -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\"}" | python3 -c "import sys,json; lo=json.load(sys.stdin)['profile']['loadout']; print(len(lo), 'arclance' in lo)")
echo "stored layout healed server-side (expect: 5 False): $HEAL"
$B screenshot "$SS/44b-shop-5-bays.png"

echo "--- flow 3: mission loadout bar appears on deploy (5 armed slots)"
$B find first "#dialog-close" click
sleep 0.5
$B find first "[data-menu=\"play\"]" click
sleep 0.5
$B find text "SOLO MAP RECON" click
sleep 0.5
$B find first ".map-card" click
sleep 0.6
$B find first "#deploy-mission" click
sleep 0.5
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
sleep 0.5
echo "bar present: $($B eval "!!document.querySelector('.loadout-bar')")"
echo "armed slots: $($B eval "document.querySelectorAll('.lo-slot[data-tower]').length")"
echo "empty bays: $($B eval "document.querySelectorAll('.lo-slot.lo-empty').length")"
$B screenshot "$SS/45-mission-loadout-bar.png"

echo "--- flow 4: free placement + clearance box enforcement"
$B eval "window.__boardXY = (bx, by) => { const b = document.querySelector('#board'); const p = b.createSVGPoint(); p.x = bx; p.y = by; const m = p.matrixTransform(b.getScreenCTM()); return [m.x, m.y]; }; window.__fire = (bx, by) => { const [cx, cy] = __boardXY(bx, by); const b = document.querySelector('#board'); const opts = {clientX: cx, clientY: cy, bubbles: true}; b.dispatchEvent(new PointerEvent('pointermove', opts)); b.dispatchEvent(new MouseEvent('click', opts)); }; window.__hover = (bx, by) => { const [cx, cy] = __boardXY(bx, by); const b = document.querySelector('#board'); b.dispatchEvent(new PointerEvent('pointermove', {clientX: cx, clientY: cy, bubbles: true})); }; 'helpers-ready'" > /dev/null
$B eval "document.querySelector(\".lo-slot[data-tower='sentinel']\").click()" > /dev/null
sleep 0.2
$B eval "__hover(150, 220)" > /dev/null
sleep 0.3
echo "ghost visible: $($B eval "!!document.querySelector('.tw-ghost') && !document.querySelector('.tw-ghost').classList.contains('off')")"
echo "ghost shows tower name: $($B eval "(document.querySelector('.tw-ghost-note')||{}).textContent")"
$B eval "__fire(150, 220)" > /dev/null
sleep 0.5
echo "towers placed: $($B eval "document.querySelectorAll('.layer-towers .tower').length")"
echo "cash after \$50 sentinel: $($B eval "document.querySelector('#combat-cash').textContent")"
$B screenshot "$SS/46-placement-ghost-tower.png"
$B eval "__fire(180, 240)" > /dev/null
sleep 0.4
echo "blocked float shown: $($B eval "document.querySelectorAll('.block-float').length > 0")"
echo "still 1 tower: $($B eval "document.querySelectorAll('.layer-towers .tower').length")"
$B screenshot "$SS/47-placement-blocked.png"
echo "clearance boxes visible while placing: $($B eval "getComputedStyle(document.querySelector('.tower .tw-footprint')).opacity")"

echo "--- flow 5: tower intel panel + sell refund"
$B eval "document.querySelector('#board').dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true}))" > /dev/null
sleep 0.3
echo "build mode cancelled: $($B eval "!document.querySelector('#board').classList.contains('placing')")"
$B eval "document.querySelector('.layer-towers .tower').dispatchEvent(new MouseEvent('click', {bubbles: true}))" > /dev/null
sleep 0.4
echo "panel open: $($B eval "!!document.querySelector('.tower-panel')")"
echo "panel name: $($B eval "(document.querySelector('.tower-panel .tp-head b')||{}).textContent")"
$B screenshot "$SS/48-tower-panel.png"
$B eval "document.querySelector('.tp-sell').click()" > /dev/null
sleep 0.4
echo "after sell towers: $($B eval "document.querySelectorAll('.layer-towers .tower').length")"
echo "cash after 70% refund: $($B eval "document.querySelector('#combat-cash').textContent")"

echo "--- flow 6: towers actually kill (wave 1, sentinel + sniper on the lane)"
$B eval "document.querySelector(\".lo-slot[data-tower='sentinel']\").click()" > /dev/null
sleep 0.2
$B eval "__fire(150, 220)" > /dev/null
$B eval "document.querySelector('.tp-sell') && 0" > /dev/null
$B eval "document.querySelector(\".lo-slot[data-tower='sniper']\").click()" > /dev/null
sleep 0.2
$B eval "__fire(450, 235)" > /dev/null
sleep 0.3
echo "towers on grid: $($B eval "document.querySelectorAll('.layer-towers .tower').length")"
echo "cash before combat: $($B eval "document.querySelector('#combat-cash').textContent")"
sleep 14
echo "cash after combat: $($B eval "document.querySelector('#combat-cash').textContent")"
echo "enemies alive: $($B eval "document.querySelectorAll('.enemy').length")"
$B screenshot "$SS/49-towers-firing.png"
echo "base hp intact: $($B eval "document.querySelector('#base-num').textContent")"

echo "--- page errors ---"
$B errors || true
$B close
pkill -f "node server.js" 2>/dev/null
rm -f accounts.json
echo QA_DONE
