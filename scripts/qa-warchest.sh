#!/bin/bash
# WAR CHEST QA: new shop cards + decals -> unique field kits on the grid ->
# command ceiling 15 with SATURATION DOCTRINE buying it back to 20 ->
# Grave Warden SOUL CHOIR raises a vengeful soul from the core.
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"
PASS=0; FAIL=0
ok() { if [ "$2" = "true" ]; then echo "  PASS  $1"; PASS=$((PASS+1)); else echo "  FAIL  $1 (got: $2)"; FAIL=$((FAIL+1)); fi; }

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-warchest.log 2>&1 &)
sleep 1.4

$B set viewport 1440 900
$B open "http://127.0.0.1:3111/" > /dev/null
$B wait --load networkidle; sleep 0.8
$B find first "#tab-register" click; sleep 0.3
$B find first "#auth-name" fill "WARCHESTQA"
$B find first "#auth-email" fill "warchest@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
sleep 0.5

echo "--- flow 1: the four new blueprints render with decals + meters"
$B eval "window.CBZShop.setProfile({ name: 'WARCHESTQA', level: 30, xp: 0, nc: 40000, bt: 300, owned: ['sentinel','lazermortar','sparkcoil','flakpost','tarsprayer','relay'], loadout: ['sentinel','sparkcoil','flakpost','tarsprayer','relay'] }); 'armed'" > /dev/null
$B find first "[data-menu=\"shop\"]" click; sleep 1.2
ok "SPARK COIL card renders its decal" "$($B eval "Boolean(document.querySelector('.tower-card[data-id=\"sparkcoil\"] img.tw-art[src=\"assets/towers/sparkcoil.png\"]'))")"
ok "FLAK POST card declares FLYERS ONLY" "$($B eval "(document.querySelector('.tower-card[data-id=\"flakpost\"]') || {textContent:''}).textContent.includes('FLYERS ONLY')")"
ok "TAR SPRAYER card shows the SLICK meter + NO DAMAGE" "$($B eval "(document.querySelector('.tower-card[data-id=\"tarsprayer\"]') || {textContent:''}).textContent.includes('SLICK') && (document.querySelector('.tower-card[data-id=\"tarsprayer\"]') || {textContent:''}).textContent.includes('NO DAMAGE')")"
ok "COMMAND RELAY card shows the NETWORK meter" "$($B eval "(document.querySelector('.tower-card[data-id=\"relay\"]') || {textContent:''}).textContent.includes('NETWORK') && (document.querySelector('.tower-card[data-id=\"relay\"]') || {textContent:''}).textContent.includes('+10% DMG')")"
ok "RELAY decal renders on its card" "$($B eval "Boolean(document.querySelector('.tower-card[data-id=\"relay\"] img.tw-art[src=\"assets/towers/relay.png\"]'))")"
$B find first "[data-cat=\"__ult\"]" click; sleep 0.8
ok "warden vault card lists the SOUL CHOIR tier at \$5,200" "$($B eval "const t = (document.querySelector('#shop-ultimatum') || {textContent:''}).textContent; t.includes('SOUL CHOIR') && t.includes('5,200')")"
$B find first "#dialog-close" click; sleep 0.4

echo "--- flow 2: frozen wave — unique field kits render per chassis"
$B open "http://127.0.0.1:3111/?cbzwave=5&freeze=1&cash=99999" > /dev/null
$B wait --load networkidle; sleep 1.6
$B eval "window.CBZShop.setProfile({ name: 'WARCHESTQA', level: 30, xp: 0, nc: 40000, bt: 300, owned: ['sentinel','lazermortar','sparkcoil','flakpost','tarsprayer','relay'], loadout: ['sentinel','sparkcoil','flakpost','tarsprayer','relay'] }); 're-armed'" > /dev/null
sleep 0.4
$B find first "[data-menu=\"play\"]" click; sleep 0.5
$B find text "SOLO MAP RECON" click; sleep 0.4
$B find first ".map-card" click; sleep 0.4
$B find first "#deploy-mission" click; sleep 0.4
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000

# Dense, well-spaced candidate points: 2 paths x 8 stations x 2 sides.
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (let gx = 60; gx <= 940; gx += 70) { for (let gy = 60; gy <= 540; gy += 70) clicks.push([rect.left + ox + gx*scale, rect.top + oy + gy*scale]); } window.__wcClicks = clicks; return clicks.length; })()" > /dev/null
# placeUntil N: walks the candidate list, placing with the CURRENT building until the DOM count hits N.
$B eval "window.__placeUntil = (n) => { const board = document.querySelector('#board'); let guard = 0; while (document.querySelectorAll('.layer-towers .tower').length < n && guard < window.__wcClicks.length) { const [x, y] = window.__wcClicks[guard]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); guard++; } return document.querySelectorAll('.layer-towers .tower').length; }; 'helper ready'" > /dev/null

$B eval "document.querySelector('.lo-slot[data-tower=\"relay\"]').click()" > /dev/null
$B eval "window.__placeUntil(1)" > /dev/null
ok "relay chassis renders the halo mast kit" "$($B eval "Boolean(document.querySelector('.tw-relay .tw-kit-halo') && document.querySelector('.tw-relay .tw-kit-beacon'))")"
$B eval "document.querySelector('.lo-slot[data-tower=\"tarsprayer\"]').click()" > /dev/null
$B eval "window.__placeUntil(2)" > /dev/null
ok "tar sprayer renders the vat + nozzle kit" "$($B eval "Boolean(document.querySelector('.tw-tarsprayer .tw-kit-vat') && document.querySelector('.tw-tarsprayer .tw-kit-nozzle'))")"
$B eval "document.querySelector('.lo-slot[data-tower=\"flakpost\"]').click()" > /dev/null
$B eval "window.__placeUntil(3)" > /dev/null
ok "flak post renders TWIN barrels" "$($B eval "document.querySelectorAll('.tw-flakpost .tw-kit-tube').length === 2")"
$B eval "document.querySelector('.lo-slot[data-tower=\"sparkcoil\"]').click()" > /dev/null
$B eval "window.__placeUntil(4)" > /dev/null
ok "spark coil renders THREE coil rings + tip" "$($B eval "document.querySelectorAll('.tw-sparkcoil .tw-kit-coil').length === 3 && Boolean(document.querySelector('.tw-sparkcoil .tw-kit-sparktip'))")"

echo "--- flow 3: command ceiling 15 -> SATURATION DOCTRINE buys 20"
$B eval "document.querySelector('.lo-slot[data-tower=\"sentinel\"]').click()" > /dev/null
$B eval "window.__placeUntil(15)" > /dev/null
sleep 0.3
ok "grid caps at 15 units before the perk" "$($B eval "document.querySelectorAll('.layer-towers .tower').length === 15")"
$B eval "(() => { const board = document.querySelector('#board'); const [x, y] = window.__wcClicks[window.__wcClicks.length - 5]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return 'over-cap attempt'; })()" > /dev/null
sleep 0.3
ok "saturate toast names the 15-unit ceiling" "$($B eval "(document.querySelector('#toast') || {textContent:''}).textContent.includes('15 units max')")"
$B eval "window.CBZShop.setProfile({ name: 'WARCHESTQA', level: 30, xp: 0, nc: 40000, bt: 300, owned: ['sentinel','lazermortar','sparkcoil','flakpost','tarsprayer','relay'], loadout: ['sentinel','sparkcoil','flakpost','tarsprayer','relay'], achievements: { warmachine: true }, equippedPerks: ['saturation'] }); 'perked'" > /dev/null
sleep 0.3
$B eval "window.__placeUntil(20)" > /dev/null
sleep 0.3
ok "SATURATION DOCTRINE lifts the ceiling to 20" "$($B eval "document.querySelectorAll('.layer-towers .tower').length === 20")"
$B eval "(() => { const board = document.querySelector('#board'); const [x, y] = window.__wcClicks[window.__wcClicks.length - 5]; board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); return 'over-cap attempt'; })()" > /dev/null
sleep 0.3
ok "next rejection names the 20-unit ceiling" "$($B eval "(document.querySelector('#toast') || {textContent:''}).textContent.includes('20 units max')")"
ok "loadout bar header counts against the live ceiling" "$($B eval "(document.querySelector('.lo-head b') || {textContent:''}).textContent.includes('/20 DEPLOYED')")"
$B screenshot "$SS/80-warchest-cap.png"

echo "--- flow 4: the SOUL CHOIR — warden tier 6 raises a soul from the core"
$B open "http://127.0.0.1:3111/?cbzwave=5&freeze=1&cash=99999" > /dev/null
$B wait --load networkidle; sleep 1.6
$B eval "window.CBZShop.setProfile({ name: 'WARCHESTQA', level: 30, xp: 0, nc: 40000, bt: 300, owned: ['sentinel','shredder','gravewarden'], loadout: ['gravewarden','sentinel','shredder'] }); 'warden-armed'" > /dev/null
sleep 0.4
$B find first "[data-menu=\"play\"]" click; sleep 0.5
$B find text "SOLO MAP RECON" click; sleep 0.4
$B find first ".map-card" click; sleep 0.4
$B find first "#deploy-mission" click; sleep 0.4
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
$B eval "(() => { const board = document.querySelector('#board'); const rect = board.getBoundingClientRect(); const scale = Math.min(rect.width/1000, rect.height/600); const ox = (rect.width - 1000*scale)/2; const oy = (rect.height - 600*scale)/2; const clicks = []; for (let gx = 60; gx <= 940; gx += 70) { for (let gy = 60; gy <= 540; gy += 70) clicks.push([rect.left + ox + gx*scale, rect.top + oy + gy*scale]); } window.__soulClicks = clicks; return clicks.length; })()" > /dev/null
$B eval "document.querySelector('.lo-slot[data-tower=\"gravewarden\"]').click()" > /dev/null
$B eval "(() => { const board = document.querySelector('#board'); for (const [x, y] of window.__soulClicks) { board.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true })); if (document.querySelectorAll('.layer-towers .tower').length >= 1) break; } return document.querySelectorAll('.layer-towers .tower').length; })()" > /dev/null
# Exit build mode (re-click the active slot) so the next click SELECTS the warden.
$B eval "document.querySelector('.lo-slot[data-tower=\"gravewarden\"].on') ? document.querySelector('.lo-slot[data-tower=\"gravewarden\"]').click() : document.querySelector('.lo-slot[data-tower=\"gravewarden\"]').click()" > /dev/null
sleep 0.3
$B eval "(() => { const w = document.querySelector('.layer-towers .tw-gravewarden'); if (!w) return 'no warden'; w.dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'warden selected'; })()" > /dev/null
sleep 0.5
ok "warden panel lists 6 upgrade tiers" "$($B eval "document.querySelectorAll('.tp-up').length === 6")"
ok "SOUL CHOIR is tier 06 on the panel" "$($B eval "[...document.querySelectorAll('.tp-up')].some((row) => row.textContent.includes('SOUL CHOIR'))")"
$B eval "(() => { let n = 0; const step = () => { const btn = document.querySelector('.tp-buy:not([disabled])'); if (btn) { btn.click(); n++; if (n < 6) setTimeout(step, 140); } }; step(); return 'buying 6 tiers'; })()" > /dev/null
sleep 2.4
ok "all six warden tiers installed" "$($B eval "document.querySelectorAll('.tp-up.maxed').length === 6")"
ok "SOUL CHOIR row shows the next hull + cast price" "$($B eval "(document.querySelector('.tp-abil-row.soul') || {textContent:''}).textContent.includes('SOUL CHOIR') && (document.querySelector('.tp-abil-row.soul') || {textContent:''}).textContent.includes('900')")"
$B eval "(() => { const btn = document.querySelector('#tp-soul'); if (btn) btn.click(); return btn ? 'soul cast' : 'no button'; })()" > /dev/null
sleep 0.6
ok "a vengeful soul rises from the core" "$($B eval "Boolean(document.querySelector('.e-soul') && document.querySelector('.e-soul .soul-halo'))")"
ok "soul hover card tags GRAVE WARDEN CHOIR" "$($B eval "(() => { const s = document.querySelector('.e-soul'); if (!s) return false; s.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true })); const tip = (document.querySelector('.enemy-tip') || {textContent:''}).textContent; return tip.includes('GRAVE WARDEN CHOIR') && tip.includes('VENGEFUL SOUL'); })()")"
$B screenshot "$SS/81-soul-choir.png"

pkill -f "node server.js" 2>/dev/null
echo ""
echo "WARCHEST QA: $PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
