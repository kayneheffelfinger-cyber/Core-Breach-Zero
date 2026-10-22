#!/bin/bash
# HARD PROTOCOL QA: vote card -> hard lock-in -> compounding hull proof via live enemy tooltips
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-hard.log 2>&1 &)
sleep 1.4

register() {
  $B find first "#tab-register" click; sleep 0.3
  $B find first "#auth-name" fill "$1"; $B find first "#auth-email" fill "$2"
  $B find first "#auth-passcode" fill "corebreach"; $B find first "#auth-confirm" fill "corebreach"
  $B find first "#auth-submit" click
  $B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
}
vote_hard() {
  $B find first ".menu-item" click; sleep 0.4
  $B find text "SOLO MAP RECON" click; sleep 0.4
  $B find first ".map-card" click; sleep 0.4
  $B find first "#deploy-mission" click; sleep 0.5
  $B find first "[data-mode=\"hard\"]" click
  $B wait --fn "!document.querySelector('.vote-overlay')" --timeout 6000
  echo "protocol HUD: $($B eval "document.querySelector('#combat-protocol').textContent")"
}
hover_hp() {
  $B eval "document.querySelector('$1').dispatchEvent(new PointerEvent('pointerenter', {clientX: 720, clientY: 320, bubbles: true}))" > /dev/null
  sleep 0.5
  $B eval "(document.querySelector('.enemy-tip .tip-hp span')||{}).textContent"
}

$B set viewport 1440 900
$B open "http://127.0.0.1:3111/?cbzwave=30&freeze=1&cash=9999" > /dev/null
$B wait --load networkidle; sleep 0.8
register "HELLQA" "hellqa@mail.com"
echo "--- wave 30: final-wave fodder under 12.17x hull"
vote_hard
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
$B wait --fn "document.querySelector('.e-shielded') !== null" --timeout 20000
echo "wave label: $($B eval "document.querySelector('#combat-wave').textContent")"
TIP=$(hover_hp ".e-shielded")
echo "shielded tip: $TIP"
echo "$TIP" | rg -q "548 HP" && echo "PASS compounding: shielded 45 -> 548 at wave 30 (1.09^29)" || echo "FAIL compounding mismatch"
$B screenshot "$SS/41-hard-wave30-hull.png"

echo "--- wave 19: FIREWALL RISING warden under 4.72x hull"
$B open "http://127.0.0.1:3111/?cbzwave=19&freeze=1&cash=9999" > /dev/null
$B wait --load networkidle; sleep 0.8
register "HELLQA2" "hellqa2@mail.com"
vote_hard
$B wait --fn "document.querySelector('.e-warden') !== null" --timeout 40000
sleep 0.5
WTIP=$(hover_hp ".e-warden")
echo "warden tip: $WTIP"
echo "$WTIP" | rg -q "15850 HP" && echo "PASS warden 2400 x 4.72 curve x 1.40 hardened = 15850 at wave 19" || echo "FAIL warden hull (curve x mod) mismatch"
echo "boss bar: $($B eval "document.querySelector('#boss-name') ? document.querySelector('#boss-name').textContent : 'none'")"
$B screenshot "$SS/42-hard-warden.png"
echo "QA-HARD-DONE"
pkill -f "node server.js" 2>/dev/null
