#!/bin/bash
# CRIMSON DAWN QA: teaser countdown -> live event flip -> deploy -> CRIMSON HUD -> relic card -> grant chain
cd /home/z/my-project/Core-Breach-Zero
SS=/home/z/my-project/download/screenshots
mkdir -p "$SS"
B="agent-browser"

pkill -f "node server.js" 2>/dev/null; sleep 0.3
rm -f accounts.json
(PORT=3111 node server.js > /tmp/cbz-qa-crimson.log 2>&1 &)
sleep 1.4

$B set viewport 1440 900
$B open "http://127.0.0.1:3111/" > /dev/null
$B wait --load networkidle
sleep 1.2
echo "--- register (clears auth overlay)"
$B find first "#tab-register" click; sleep 0.3
$B find first "#auth-name" fill "DAWNQA"
$B find first "#auth-email" fill "dawnqa@mail.com"
$B find first "#auth-passcode" fill "corebreach"
$B find first "#auth-confirm" fill "corebreach"
$B find first "#auth-submit" click
$B wait --fn "document.querySelector('#auth-overlay').hidden === true" --timeout 8000
echo "logged in: $($B eval "document.querySelector('#cmdr-chip').textContent")"
sleep 0.4

echo "--- phase 1: sealed signal"
echo "button title: $($B eval "document.querySelector('#crimson-title').textContent")"
echo "button sub: $($B eval "document.querySelector('#crimson-sub').textContent")"
C1=$($B eval "document.querySelector('#crimson-count').textContent")
echo "countdown now: $C1"
sleep 2.1
C2=$($B eval "document.querySelector('#crimson-count').textContent")
echo "countdown +2s: $C2"
[ "$C1" != "$C2" ] && echo "PASS countdown ticks live" || echo "FAIL countdown frozen"
echo "$C1" | tr -d '"' | rg -q '^T-19[12]:' && echo "PASS countdown starts ~192h window" || echo "FAIL countdown window mismatch: $C1"
$B find first "[data-menu=\"crimson\"]" click
sleep 0.8
echo "panel kicker: $($B eval "document.querySelector('#dialog-kicker').textContent")"
echo "panel title: $($B eval "document.querySelector('#dialog-title').textContent")"
echo "big countdown: $($B eval "document.querySelector('#crimson-big') ? document.querySelector('#crimson-big').textContent.slice(0,12) : 'none'")"
$B screenshot "$SS/50-crimson-sealed.png"
$B find first "#dialog-close" click
sleep 0.4

echo "--- phase 2: the dawn goes live (?crimson=live)"
$B open "http://127.0.0.1:3111/?crimson=live" > /dev/null
$B wait --load networkidle
sleep 1.2
echo "button title: $($B eval "document.querySelector('#crimson-title').textContent")"
echo "button count: $($B eval "document.querySelector('#crimson-count').textContent")"
$B eval "document.querySelector('#menu-crimson').classList.contains('crimson-live') ? 'PASS crimson-live glow class on' : 'FAIL glow class missing'"
$B find first "[data-menu=\"crimson\"]" click
sleep 0.8
echo "panel title: $($B eval "document.querySelector('#dialog-title').textContent")"
$B screenshot "$SS/51-crimson-live-panel.png"
$B find first "#crimson-deploy" click
sleep 1.0
echo "battlefield visible: $($B eval "!document.querySelector('#battlefield').hidden")"
echo "map name: $($B eval "document.querySelector('#battle-map-name').textContent")"
$B wait --fn "document.querySelector('#combat-protocol').textContent === 'CRIMSON'" --timeout 9000
echo "protocol HUD: $($B eval "document.querySelector('#combat-protocol').textContent")"
$B wait --fn "document.querySelectorAll('.enemy').length >= 1" --timeout 15000
sleep 0.6
echo "enemies on board: $($B eval "document.querySelectorAll('.enemy').length")"
echo "wave label: $($B eval "document.querySelector('#combat-wave').textContent")"
$B screenshot "$SS/52-crimson-combat.png"

echo "--- phase 3: relic card in the shop"
$B eval "CBZCombat.abort(); document.querySelector('#exit-battle').click();" > /dev/null
sleep 0.6
$B find first "[data-menu=\"shop\"]" click
sleep 1.2
echo "relic card present: $($B eval "Boolean(document.querySelector('.tower-card.state-event[data-id=\"dawnbreaker\"]'))")"
echo "relic lock text: $($B eval "(document.querySelector('.tower-card[data-id=\"dawnbreaker\"] .tc-lock b')||{}).textContent")"
$B screenshot "$SS/53-dawnbreaker-relic.png"

echo "--- phase 4: grant chain through the real API"
REG=$(curl -s -X POST http://127.0.0.1:3111/api/register -H 'content-type: application/json' -d '{"name":"DAWNQA1","email":"dawnqa1@mail.com","passcode":"corebreach"}')
TOKEN=$(echo "$REG" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))")
LOSS=$(curl -s -X POST http://127.0.0.1:3111/api/mission/complete -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\",\"result\":\"loss\",\"wavesCleared\":7,\"bossesKilled\":1,\"difficulty\":\"crimson\",\"map\":\"cbz\"}")
echo "$LOSS" | rg -q '"relic":false' && echo "PASS crimson loss grants NO relic" || echo "FAIL loss granted relic"
OWNGRP=$(echo "$LOSS" | python3 -c "import sys,json; d=json.load(sys.stdin); print('dawnbreaker' in d['profile']['owned'])")
[ "$OWNGRP" = "False" ] && echo "PASS relic not owned after loss" || echo "FAIL relic owned after loss"
WIN=$(curl -s -X POST http://127.0.0.1:3111/api/mission/complete -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\",\"result\":\"win\",\"wavesCleared\":20,\"bossesKilled\":14,\"difficulty\":\"crimson\",\"map\":\"cbz\"}")
echo "win nc: $(echo "$WIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['rewards']['nc'])") (expect 20*15+14*25+500 = 1150)"
echo "$WIN" | rg -q '"relic":true' && echo "PASS crimson win grants relic" || echo "FAIL win did not grant relic"
OWNGRP2=$(echo "$WIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('dawnbreaker' in d['profile']['owned'])")
[ "$OWNGRP2" = "True" ] && echo "PASS dawnbreaker in owned armory" || echo "FAIL relic missing from armory"
AGAIN=$(curl -s -X POST http://127.0.0.1:3111/api/mission/complete -H 'content-type: application/json' -d "{\"token\":\"$TOKEN\",\"result\":\"win\",\"wavesCleared\":20,\"bossesKilled\":14,\"difficulty\":\"crimson\",\"map\":\"cbz\"}")
echo "$AGAIN" | rg -q '"relic":false' && echo "PASS relic is one-time (second win: no duplicate)" || echo "FAIL duplicate relic grant"
echo "QA-CRIMSON-DONE"
pkill -f "node server.js" 2>/dev/null
