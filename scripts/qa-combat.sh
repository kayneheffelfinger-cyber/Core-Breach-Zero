#!/bin/bash
# Combat protocol QA: register via UI -> recon -> mode vote -> waves -> tooltip -> boss -> phase gates
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
# register a QA commander through the real auth terminal (REGISTER tab first!)
$B find first "#tab-register" click
sleep 0.4
$B find first "#auth-name" fill "QACOMMANDER"
$B find first "#auth-email" fill "qacommander@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
echo "logged in as: $($B eval "document.querySelector('#cmdr-chip').textContent")"
sleep 0.5

echo "--- flow 1: recon + vote + wave 1"
$B find first ".menu-item" click
sleep 0.5
$B find text "SOLO MAP RECON" click
sleep 0.5
$B find first ".map-card" click
sleep 0.6
$B screenshot "$SS/33-recon-start-mission.png"
$B find first "#deploy-mission" click
sleep 0.5
$B screenshot "$SS/34-mode-vote.png"
$B find first ".mode-card:not(.locked)" click
$B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
$B wait --fn "document.querySelectorAll('.enemy').length > 0" --timeout 12000
sleep 1.2
$B screenshot "$SS/35-easy-combat.png"
echo "enemies on board: $($B eval "document.querySelectorAll('.enemy').length")"
echo "wave label: $($B eval "document.querySelector('#combat-wave') && document.querySelector('#combat-wave').textContent")"

echo "--- flow 2: frozen enemies + hover tooltip (wave 8 tanks)"
$B open "http://127.0.0.1:3111/?cbzwave=8&freeze=1&cash=1240" > /dev/null
$B wait --load networkidle
sleep 1.6
$B find first ".menu-item" click
sleep 0.4
$B find text "SOLO MAP RECON" click
sleep 0.4
$B find first ".map-card" click
sleep 0.4
$B find first "#deploy-mission" click
sleep 0.3
$B find first ".mode-card:not(.locked)" click
$B wait --fn "document.querySelectorAll('.enemy').length >= 3" --timeout 12000
sleep 0.6
$B eval "document.querySelector('.e-nullcore').dispatchEvent(new PointerEvent('pointerenter', {clientX: 720, clientY: 320, bubbles: true}))"
sleep 0.6
$B screenshot "$SS/36-enemy-tooltip.png"
echo "tooltip visible: $($B eval "!document.querySelector('.enemy-tip').hidden")"
echo "tip title: $($B eval "(document.querySelector('.enemy-tip b')||{}).textContent")"

echo "--- flow 3: wave 5 mini-boss"
$B open "http://127.0.0.1:3111/?cbzwave=5" > /dev/null
$B wait --load networkidle
sleep 1.6
$B find first ".menu-item" click
sleep 0.4
$B find text "SOLO MAP RECON" click
sleep 0.4
$B find first ".map-card" click
sleep 0.4
$B find first "#deploy-mission" click
sleep 0.3
$B find first ".mode-card:not(.locked)" click
$B wait --fn "document.querySelector('.boss-bar') && !document.querySelector('.boss-bar').hidden" --timeout 20000
sleep 0.8
$B screenshot "$SS/37-boss-wave5.png"
echo "boss bar: $($B eval "document.querySelector('#boss-name').textContent")"

echo "--- flow 4: CBZ phase gates + dual direction lanes"
$B open "http://127.0.0.1:3111/?cbzwave=1" > /dev/null
$B wait --load networkidle
sleep 1.6
$B find first ".menu-item" click
sleep 0.4
$B find text "SOLO MAP RECON" click
sleep 0.4
$B find first ".map-cbz" click
sleep 0.4
$B find first "#deploy-mission" click
sleep 0.3
$B find first ".mode-card:not(.locked)" click
sleep 11
$B screenshot "$SS/38-cbz-phase-gates.png"
echo "enemies alive: $($B eval "document.querySelectorAll('.enemy').length")"
echo "base hp: $($B eval "document.querySelector('#base-num').textContent")"

echo "--- page errors ---"
$B errors || true
$B close
pkill -f "node server.js" 2>/dev/null
rm -f accounts.json
echo QA_DONE
