#!/bin/bash
# SPIRAL ESCALATION QA: the doubled INSANE protocol + the four new elite classes live on the grid.
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"
ok() { if [ "$2" = "1" ] || [ "$2" = "true" ]; then echo "PASS $1"; else echo "FAIL $1 — got: $2"; fi; }
gate() { local n="$1"; [ -n "$START_AT" ] && [ "$n" -lt "$START_AT" ] && return 1; [ -n "$STOP_AT" ] && [ "$n" -ge "$STOP_AT" ] && return 1; return 0; }

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-spiral.log 2>&1 &)
sleep 1.4

register() {
  # Idempotent: only register when the auth overlay is showing.
  if $B eval "document.querySelector('#auth-overlay').hidden ? 'no' : 'yes'" 2>/dev/null | rg -q "yes"; then
    $B find first "#tab-register" click; sleep 0.3
    $B find first "#auth-name" fill "$1"; $B find first "#auth-email" fill "$2"
    $B find first "#auth-passcode" fill "corebreach"; $B find first "#auth-confirm" fill "corebreach"
    $B find first "#auth-submit" click
    $B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
  else
    echo "(already authed — skipping register $1)"
  fi
}
fresh_page() {
  $B open "http://127.0.0.1:3111/$1" > /dev/null
  $B wait --load networkidle
  sleep 1.4
  # If a battle/recon is somehow live, abort home first.
  $B eval "(() => { const exit = document.querySelector('#exit-battle'); if (exit && !exit.closest('template') && exit.offsetParent && exit.textContent.includes('ABORT')) { exit.click(); return 'aborted'; } return 'clean'; })()" > /dev/null
  sleep 0.6
  register "$2" "$3"
  sleep 0.4
}
vote_insane() {
  $B find first "[data-menu=\"play\"]" click; sleep 0.5
  $B find text "SOLO MAP RECON" click; sleep 0.5
  $B find first ".map-card" click; sleep 0.5
  $B find first "#deploy-mission" click; sleep 0.6
  $B find first "[data-mode=\"insane\"]" click
  $B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
}
hover_hp() {
  $B eval "document.querySelector('$1').dispatchEvent(new PointerEvent('pointerenter', {clientX: 720, clientY: 320, bubbles: true}))" > /dev/null
  sleep 0.5
  $B eval "(document.querySelector('.enemy-tip .tip-hp span')||{}).textContent"
}
place_grid() {
  $B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (let gx = 60; gx <= 940; gx += 70) { for (let gy = 60; gy <= 540; gy += 70) clicks.push([rect.left + ox + gx*scale, rect.top + oy + gy*scale]); } window.__spClicks = clicks; return clicks.length; })()" > /dev/null
  $B eval "window.__placeUntil = (n) => { const board = document.querySelector('#board'); let guard = 0; while (document.querySelectorAll('.layer-towers .tower').length < n && guard < window.__spClicks.length) { const [x, y] = window.__spClicks[guard]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); guard++; } return document.querySelectorAll('.layer-towers .tower').length; }; 'ready'" > /dev/null
}
arm_three() {
  $B eval "window.CBZShop.setProfile({ name: '$1', level: 40, xp: 0, nc: 50000, bt: 300, owned: ['sentinel','lazermortar','shotgunner'], loadout: ['sentinel','lazermortar','shotgunner'] }); 'armed'" > /dev/null
  sleep 0.4
}

$B set viewport 1440 900

echo "--- flow 0: the relic card carries the absurd declared value"
if gate 0; then
fresh_page "" "SPIRAL0" "spiral0@mail.com"
$B eval "window.CBZShop.setProfile({ name: 'SPIRAL0', level: 40, xp: 0, nc: 50000, bt: 300, owned: ['sentinel','dawnbreaker'], loadout: ['sentinel','dawnbreaker'] }); 'armed'" > /dev/null
sleep 0.5
$B find first "[data-menu=\"shop\"]" click; sleep 0.8
ok "relic card declares 250,000 NC + 2,500 BT" "$($B eval "Boolean([...document.querySelectorAll('.tower-card')].some((c) => c.textContent.includes('250,000 NC + 2,500 BT')))")"
$B find first "[data-cat=\"__ult\"]" click; sleep 0.8
ok "warden vault sings \$700 souls / 35s" "$($B eval "Boolean((document.querySelector('#shop-ultimatum') || {textContent:''}).textContent.includes('700 PER SOUL') && (document.querySelector('#shop-ultimatum') || {textContent:''}).textContent.includes('35s COOLDOWN'))")"
fi

echo "--- flow 1: wave 5 PHASE SHROUD — spectre cloaks under live fire (INSANE x2)"
if gate 1; then
fresh_page "?cbzwave=5&cash=99999" "SPIRAL1" "spiral1@mail.com"
arm_three "SPIRAL1"
vote_insane
place_grid
$B eval "document.querySelector('.lo-slot[data-tower=\"sentinel\"]').click()" > /dev/null
$B eval "window.__placeUntil(10)" > /dev/null
$B eval "document.querySelector('.lo-slot[data-tower=\"lazermortar\"]').click()" > /dev/null
$B eval "window.__placeUntil(12)" > /dev/null
$B wait --fn "document.querySelector('.e-spectre') !== null" --timeout 90000
ok "NULL SPECTRE debuts on wave 5 (PHASE SHROUD)" "$($B eval "Boolean(document.querySelector('.e-spectre'))")"
$B wait --fn "document.querySelector('.e-spectre.e-cloak') !== null" --timeout 25000
ok "phase shroud toggles: spectre drops every lock (.e-cloak)" "$($B eval "Boolean(document.querySelector('.e-spectre.e-cloak'))")"
TIP=$(hover_hp ".e-spectre")
echo "spectre tip: $TIP"
echo "$TIP" | rg -q "116 HP" && echo "PASS spectre max hull 70 x 1.135^4 = 116 on the doubled curve" || echo "FAIL spectre hull mismatch"
ok "spectre intel names the shroud" "$($B eval "Boolean((document.querySelector('.enemy-tip .tip-ability') || {textContent:''}).textContent.includes('Phase Shroud'))")"
$B screenshot "$SS/90-spiral-spectre.png"
fi

echo "--- flow 2: wave 9 SWARM STORM — BLOATWARE and the deterministic EMP ring"
if gate 2; then
fresh_page "?cbzwave=9&freeze=1&cash=99999" "SPIRAL2" "spiral2@mail.com"
arm_three "SPIRAL2"
vote_insane
$B wait --fn "document.querySelector('.e-bloat') !== null" --timeout 150000
ok "BLOATWARE marches on wave 9" "$($B eval "Boolean(document.querySelector('.e-bloat'))")"
# Read the first frozen bloat's board position, then sweep placement candidates around it
# (radii 48-82u x 12 angles) until at least 5 sentinels stand inside EMP + range reach.
$B eval "(() => { const el = document.querySelector('.e-bloat'); const m = el.getAttribute('transform').match(/translate\\(([\\d.-]+) ([\\d.-]+)/); const bx = Number(m[1]); const by = Number(m[2]); const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; window.__ring = []; for (const r of [48, 60, 72, 82]) { for (let i = 0; i < 12; i++) { const a = (Math.PI/6)*i; window.__ring.push([rect.left + ox + (bx + Math.cos(a)*r)*scale, rect.top + oy + (by + Math.sin(a)*r)*scale]); } } return 'candidates around ' + bx.toFixed(0) + ',' + by.toFixed(0) + ': ' + window.__ring.length; })()"
$B eval "document.querySelector('.lo-slot[data-tower=\"sentinel\"]').click()" > /dev/null
$B eval "(() => { const board = document.querySelector('#board'); let guard = 0; while (document.querySelectorAll('.layer-towers .tower').length < 5 && guard < window.__ring.length) { const [x, y] = window.__ring[guard]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); guard++; } return 'placed=' + document.querySelectorAll('.layer-towers .tower').length + ' tried=' + guard; })()"
ok "sentinel ring stands around the frozen bloat" "$($B eval "document.querySelectorAll('.layer-towers .tower').length >= 4")"
echo "wall chewing the frozen bloat..."
$B wait --fn "document.querySelector('.tw-offline') !== null" --timeout 150000
ok "death rattle EMP: a tower goes OFFLINE near the corpse" "$($B eval "Boolean(document.querySelector('.tw-offline'))")"
$B screenshot "$SS/91-spiral-emp.png"
fi

echo "--- flow 3: wave 13 hellfire — DATA LEECH siphon field + doubled opening cash"
if gate 3; then
fresh_page "?cbzwave=13&freeze=1" "SPIRAL3" "spiral3@mail.com"
vote_insane
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 30000
ok "doubled opening: \$130 salvage (200 x 0.65)" "$($B eval "document.querySelector('#combat-cash').textContent === '\$130'")"
echo "protocol HUD: $($B eval "document.querySelector('#combat-protocol').textContent")"
$B wait --fn "document.querySelector('.e-leech') !== null" --timeout 220000
ok "DATA LEECH debuts on wave 13" "$($B eval "Boolean(document.querySelector('.e-leech'))")"
LTIP=$(hover_hp ".e-leech")
echo "leech tip: $LTIP"
echo "$LTIP" | rg -q "679/679 HP" && echo "PASS leech hull 90 x 1.135^12 x 1.65 hellfire = 679" || echo "FAIL leech hull mismatch"
ok "leech intel names Siphon Field" "$($B eval "Boolean((document.querySelector('.enemy-tip .tip-ability') || {textContent:''}).textContent.includes('Siphon Field'))")"
fi

echo "--- flow 4: wave 18 BERSERK LINE — RAMPAGE UNIT enrage"
if gate 4; then
fresh_page "?cbzwave=18&freeze=1" "SPIRAL4" "spiral4@mail.com"
vote_insane
$B wait --fn "document.querySelector('.e-rampager') !== null" --timeout 180000
ok "RAMPAGE UNIT debuts on wave 17 (BERSERK LINE)" "$($B eval "Boolean(document.querySelector('.e-rampager'))")"
RTIP=$(hover_hp ".e-rampager")
echo "rampager tip: $RTIP"
echo "$RTIP" | rg -q "2066/2066 HP" && echo "PASS rampager hull 240 x 1.135^17 (wave 18, overclock) = 2066" || echo "FAIL rampager hull mismatch"
ok "rampager intel warns Berserk Drive" "$($B eval "Boolean((document.querySelector('.enemy-tip .tip-ability') || {textContent:''}).textContent.includes('Berserk Drive'))")"
echo "vote card sub: $($B eval "([...document.querySelectorAll('.mode-card')].find((c) => c.dataset.mode === 'insane') || {textContent:''}).textContent.replace(/\\s+/g, ' ').trim()")"
$B screenshot "$SS/92-spiral-rampager.png"
fi
echo "QA COMPLETE"
