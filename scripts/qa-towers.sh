#!/bin/bash
# IRON RAIN QA: endgame chassis in the shop -> both towers place on the grid ->
# MIRV-capable silo fires visible warheads -> Drone Spawner fabricates strike drones
# -> unique-rig guard -> live tower intel panel.
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-towers.log 2>&1 &)
sleep 1.4

$B set viewport 1440 900
$B open "http://127.0.0.1:3111/" > /dev/null
$B wait --load networkidle; sleep 0.8
$B find first "#tab-register" click; sleep 0.3
$B find first "#auth-name" fill "IRONQA"
$B find first "#auth-email" fill "ironqa@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
sleep 0.5

echo "--- flow 1: an endgame commander sees both IRON RAIN chassis in the shop"
$B eval "window.CBZShop.setProfile({ level: 30, owned: ['sentinel','lazermortar','missilesilo','dronespawner'], loadout: ['sentinel','missilesilo','dronespawner'] }); 'armed'" > /dev/null
$B find first "[data-menu=\"shop\"]" click
sleep 1.2
echo "silo card rendered: $($B eval "Boolean(document.querySelector('.tower-card[data-id=\"missilesilo\"]'))")"
echo "drone card rendered: $($B eval "Boolean(document.querySelector('.tower-card[data-id=\"dronespawner\"]'))")"
echo "MIRV PROTOCOL tier shown: $($B eval "document.body.innerHTML.includes('MIRV PROTOCOL')")"
echo "DRONE meter shown: $($B eval "document.body.innerHTML.includes('DMG/HULL')")"
echo "silo bay armed: $($B eval "[...document.querySelectorAll('.ls-bay b')].some((el) => el.textContent === 'MISSILE SILO')")"
$B screenshot "$SS/60-iron-rain-shop.png"
$B find first "#dialog-close" click
sleep 0.4

echo "--- flow 2: wave 5 frozen — place both chassis along the track"
$B open "http://127.0.0.1:3111/?cbzwave=5&freeze=1&cash=9999" > /dev/null
$B wait --load networkidle; sleep 1.6
$B eval "window.CBZShop.setProfile({ level: 30, owned: ['sentinel','lazermortar','missilesilo','dronespawner'], loadout: ['sentinel','missilesilo','dronespawner'] }); 're-armed'" > /dev/null
sleep 0.4
$B find first "[data-menu=\"play\"]" click; sleep 0.5
$B find text "SOLO MAP RECON" click; sleep 0.4
$B find first ".map-card" click; sleep 0.4
$B find first "#deploy-mission" click; sleep 0.4
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
# Sample client coords hugging the lane (track points offset +/-55 perpendicular).
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (const p of [...board.querySelectorAll('path')].slice(0, 3)) { try { const len = p.getTotalLength(); for (const f of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) { const pt = p.getPointAtLength(len*f); const pt2 = p.getPointAtLength(Math.min(len, len*f + 8)); let dx = pt2.x - pt.x, dy = pt2.y - pt.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; for (const off of [55, -55]) { clicks.push([rect.left + ox + (pt.x - dy*off)*scale, rect.top + oy + (pt.y + dx*off)*scale]); } } } catch {} } window.__ironClicks = clicks; return clicks.length; })()"
$B eval "document.querySelector('.lo-slot[data-tower=\"missilesilo\"]').click()" > /dev/null
$B eval "(() => { for (const [x, y] of window.__ironClicks) document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return 'silo clicks done'; })()"
echo "silos placed: $($B eval "CBZCombat.stats().towersDetail.filter((t) => t.id === 'missilesilo').length")"
$B eval "document.querySelector('.lo-slot[data-tower=\"dronespawner\"]').click()" > /dev/null
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (const p of [...board.querySelectorAll('path')].slice(0, 3)) { try { const len = p.getTotalLength(); for (const f of [0.15, 0.3, 0.45, 0.6, 0.75, 0.9]) { const pt = p.getPointAtLength(len*f); const pt2 = p.getPointAtLength(Math.min(len, len*f + 8)); let dx = pt2.x - pt.x, dy = pt2.y - pt.y; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; for (const off of [115, -115]) { clicks.push([rect.left + ox + (pt.x - dy*off)*scale, rect.top + oy + (pt.y + dx*off)*scale]); } } } catch {} } window.__ironClicks2 = clicks; for (const [x, y] of clicks) document.querySelector('#board').dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return 'carrier clicks done'; })()"
echo "carriers placed: $($B eval "CBZCombat.stats().towersDetail.filter((t) => t.id === 'dronespawner').length")"
echo "unique-rig guard: extra carrier clicks rejected -> $($B eval "document.querySelector('#toast').textContent")"
echo "full grid: $($B eval "JSON.stringify(CBZCombat.stats().towersDetail)")"
$B screenshot "$SS/61-iron-rain-placed.png"

echo "--- flow 3: the silo shoots visible warheads, the carrier fabricates drones"
$B wait --fn "document.querySelectorAll('.fx-missile').length >= 1 || document.body.innerHTML.includes('fx-missile')" --timeout 25000 \
  && echo "PASS warhead in flight" || echo "WARN no missile caught in the 25s window"
MS=$($B eval "document.querySelectorAll('.fx-missile').length")
echo "missiles in flight: $MS"
$B wait --fn "document.querySelectorAll('.e-strike').length >= 1" --timeout 25000 \
  && echo "PASS strike drone fabricated" || echo "WARN no strike drone in the 25s window"
echo "strike drones on board: $($B eval "document.querySelectorAll('.e-strike').length")"
echo "hostiles in range dying to warheads -> kills so far: $($B eval "CBZCombat.stats().kills")"
$B screenshot "$SS/62-iron-rain-combat.png"

echo "--- flow 4: live tower intel on the carrier"
$B eval "document.querySelector('#board').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); 'build cleared'" > /dev/null
sleep 0.3
$B eval "(() => { const g = document.querySelector('#board .tw-special.tower'); if (!g) return 'no carrier node'; const r = g.getBoundingClientRect(); g.dispatchEvent(new MouseEvent('click', { clientX: r.left + r.width/2, clientY: r.top + r.height/2, bubbles: true })); return 'clicked'; })()"
sleep 0.6
echo "carrier panel open: $($B eval "Boolean(document.querySelector('.tower-panel'))")"
echo "panel shows strike drone intel: $($B eval "document.body.innerHTML.includes('STRIKE DRONE') && document.body.innerHTML.includes('NEXT LAUNCH')")"
$B screenshot "$SS/63-carrier-panel.png"

echo "--- page errors ---"
$B errors || true
$B close
pkill -f "node server.js" 2>/dev/null
rm -f accounts.json
echo QA-TOWERS-DONE
