#!/bin/bash
# E2E del server en modo VK_DRY_RUN sobre un puerto alternativo: no inyecta teclas.
# Uso: tests/server_e2e.sh      (sale 0 si todo pasa; imprime una línea por caso)
set -u
cd "$(dirname "$0")/.."
PORT=17699
URL="http://127.0.0.1:$PORT"
fail=0
pass() { echo "PASS $1"; }
bad()  { echo "FAIL $1 :: $2"; fail=1; }

STATE=$(mktemp -d "${TMPDIR:-/tmp}/vk-e2e-state.XXXXXX")
VK_PORT=$PORT VK_DRY_RUN=1 VK_STATE_DIR="$STATE" python3 vk_server.py >/dev/null 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null; wait $SRV 2>/dev/null; rm -rf "$STATE"' EXIT
for _ in $(seq 20); do curl -sf "$URL/health" >/dev/null && break; sleep 0.1; done

post() { curl -s -o /dev/null -w '%{http_code}' -X POST "$URL$1" -H 'Content-Type: application/json' -d "$2"; }
calls() { curl -s "$URL/debug/calls"; }
reset() { curl -s -X DELETE "$URL/debug/calls" >/dev/null; }
expect() { # nombre, código esperado, path, body
  local c; c=$(post "$3" "$4"); [ "$c" = "$2" ] && pass "$1 ($c)" || bad "$1" "esperaba $2, obtuvo $c"; }
expect_call() { # nombre, fragmento JSON esperado en la última llamada
  local last; last=$(calls | python3 -c 'import sys,json; c=json.load(sys.stdin)["calls"]; print(json.dumps(c[-1] if c else None, ensure_ascii=False))')
  case "$last" in *"$2"*) pass "$1";; *) bad "$1" "última llamada=$last";; esac; }

# health + CORS
h=$(curl -si "$URL/health")
echo "$h" | grep -q '"server": "resyst-vk"' && pass "health body" || bad "health body" "$h"
echo "$h" | grep -qi '^Access-Control-Allow-Origin: \*' && pass "health CORS" || bad "health CORS" "sin ACAO"
o=$(curl -si -X OPTIONS "$URL/type" -H 'Origin: null' -H 'Access-Control-Request-Method: POST')
echo "$o" | grep -qi 'Access-Control-Allow-Methods: GET, POST, OPTIONS' && pass "preflight" || bad "preflight" "$o"

# /type
reset; expect "type acento" 200 /type '{"text":"ñáü¿","delay":15}'
expect_call "type argv UTF-8" '["type", "--delay", "15", "--clearmodifiers", "--", "ñáü¿"]'
expect "type delay negativo → clamp" 200 /type '{"text":"a","delay":-50}'
expect_call "type delay clamp 0" '"--delay", "0"'
expect "type delay enorme → clamp" 200 /type '{"text":"a","delay":99999}'
expect_call "type delay clamp 200" '"--delay", "200"'
expect "type delay basura → default" 200 /type '{"text":"a","delay":"x"}'
expect_call "type delay default 50" '"--delay", "50"'
expect "type sin delay → default" 200 /type '{"text":"a"}'
expect_call "type default 50" '"--delay", "50"'
expect "type texto vacío" 400 /type '{"text":""}'
expect "type solo controles" 400 /type '{"text":"\u0007\u001b"}'
reset; expect "type quita controles" 200 /type '{"text":"a\u001bb"}'
expect_call "type sin ESC" '"--", "ab"]'
expect "type texto que empieza con guion" 200 /type '{"text":"--help"}'
expect_call "type -- protege" '"--", "--help"]'

# /key
reset; expect "key simple" 200 /key '{"keys":"Return"}'
expect_call "key argv" '["key", "--clearmodifiers", "--", "Return"]'
expect "key multi acorde" 200 /key '{"keys":"ctrl+a ctrl+c"}'
expect_call "key acordes separados" '"--", "ctrl+a", "ctrl+c"]'
expect "key inyección" 400 /key '{"keys":"Return; rm -rf ~"}'
expect "key opción" 400 /key '{"keys":"--window 1 a"}'
expect "key vacía" 400 /key '{"keys":""}'
expect "key 9 acordes" 400 /key '{"keys":"a a a a a a a a a"}'
expect "key no string" 400 /key '{"keys":{"x":1}}'

# /press
reset; expect "press repeat" 200 /press '{"keys":"BackSpace","repeat":3,"delay":25}'
expect_call "press argv" '["key", "--clearmodifiers", "--repeat", "3", "--repeat-delay", "25", "--", "BackSpace"]'
expect "press repeat clamp" 200 /press '{"keys":"BackSpace","repeat":500}'
expect_call "press repeat 20" '"--repeat", "20"'
expect "press 2 acordes" 400 /press '{"keys":"a b"}'

# /hold
reset; expect "hold down" 200 /hold '{"key":"shift","state":1}'
curl -s "$URL/health" | grep -q '"held": \["shift"\]' && pass "hold listado en health" || bad "hold listado" "$(curl -s "$URL/health")"
expect "hold up" 200 /hold '{"key":"shift","state":0}'
expect_call "hold keyup" '["keyup", "--", "shift"]'
curl -s "$URL/health" | grep -q '"held": \[\]' && pass "hold liberado" || bad "hold liberado" "$(curl -s "$URL/health")"
expect "hold key inválida" 400 /hold '{"key":"shift x"}'

# ── v4: personalización ────────────────────────────────────────────────
jget() { curl -s "$URL$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print(json.dumps(eval(sys.argv[1], {'d': d}), ensure_ascii=False))" "$2"; }

# /prefs: vacío → guardar → leer → archivo 0600 atómico
[ "$(jget /prefs 'd["prefs"]')" = "null" ] && pass "prefs inicial null" || bad "prefs inicial" "$(curl -s "$URL/prefs")"
expect "prefs guardar v4" 200 /prefs '{"prefs":{"v":4,"rev":7,"active":"noche","order":["noche"],"profiles":{"noche":{"name":"Noche","s":{"theme":"lab"}}},"macros":[],"pinned":[]}}'
[ "$(jget /prefs 'd["prefs"]["rev"]')" = "7" ] && pass "prefs roundtrip rev" || bad "prefs roundtrip" "$(curl -s "$URL/prefs")"
mode=$(stat -c %a "$STATE/prefs.json" 2>/dev/null); [ "$mode" = "600" ] && pass "prefs.json 0600" || bad "prefs.json modo" "$mode"
[ ! -e "$STATE/prefs.json.tmp" ] && pass "prefs sin .tmp residual" || bad "prefs tmp" "quedó .tmp"
expect "prefs no-v4" 400 /prefs '{"prefs":{"v":3,"profiles":{"a":{}}}}'
expect "prefs sin perfiles" 400 /prefs '{"prefs":{"v":4,"profiles":{}}}'
expect "prefs no objeto" 400 /prefs '{"prefs":"x"}'
[ "$(jget /prefs 'd["prefs"]["rev"]')" = "7" ] && pass "prefs inválido no pisa" || bad "prefs pisado" "$(curl -s "$URL/prefs")"
python3 -c 'import json,sys; json.dump({"prefs":{"v":4,"rev":8,"profiles":{"a":{}},"pad":"a"*300000}}, open(sys.argv[1],"w"))' "$STATE/big.json"
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/prefs" --data-binary "@$STATE/big.json")
[ "$c" = "200" ] && pass "prefs 300 KiB admitido (límite 512 KiB)" || bad "prefs 300K" "$c"
python3 -c 'import json,sys; json.dump({"prefs":{"v":4,"profiles":{"a":{}},"pad":"a"*600000}}, open(sys.argv[1],"w"))' "$STATE/huge.json"
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/prefs" --data-binary "@$STATE/huge.json")
[ "$c" = "400" ] && pass "prefs > 512 KiB (400)" || bad "prefs 600K" "$c"

# /profile + /events (long-poll)
s0=$(jget /events 'd["seq"]')
expect "profile next" 200 /profile '{"id":"next"}'
[ "$(jget "/events?since=$s0" '[e["id"] for e in d["events"] if e["type"]=="profile"]')" = '["next"]' ] && pass "events entrega profile" || bad "events" "$(curl -s "$URL/events?since=$s0")"
expect "profile vacío" 400 /profile '{"id":""}'
expect "profile control" 400 /profile '{"id":"a\u0007b"}'
expect "profile largo" 400 /profile "{\"id\":\"$(head -c 41 /dev/zero | tr '\0' a)\"}"
s1=$(jget /events 'd["seq"]')
t0=$(date +%s%N); ( sleep 0.6; post /profile '{"id":"juego"}' >/dev/null ) &
lp=$(jget "/events?since=$s1&wait=5" '[e["id"] for e in d["events"]]'); dt=$(( ($(date +%s%N) - t0) / 1000000 ))
[ "$lp" = '["juego"]' ] && [ $dt -ge 400 ] && [ $dt -lt 4000 ] && pass "long-poll despierta con el evento (${dt} ms)" || bad "long-poll" "lp=$lp dt=$dt"
t0=$(date +%s%N); e=$(jget "/events?since=999999&wait=1" 'd["events"]'); dt=$(( ($(date +%s%N) - t0) / 1000000 ))
[ "$e" = "[]" ] && [ $dt -ge 900 ] && pass "long-poll vence vacío (${dt} ms)" || bad "long-poll timeout" "e=$e dt=$dt"
t0=$(date +%s%N); jget "/events?since=0&wait=99999" 'd["ok"]' >/dev/null; dt=$(( ($(date +%s%N) - t0) / 1000000 ))
[ $dt -lt 1000 ] && pass "events since=0 inmediato" || bad "events since=0" "dt=$dt"

# /window: presets y arrastre acotado al monitor (dry-run: 2 monitores 1920x1080)
reset; expect "window preset br m s0" 200 /window '{"anchor":"br","size":"m","screen":0}'
expect_call "window br m = posición histórica" '["windowgeom", 1130, 620, 780, 430]'
expect "window preset tl s s1" 200 /window '{"anchor":"tl","size":"s","screen":1}'
expect_call "window tl s monitor 1" '["windowgeom", 1930, 10, 640, 330]'
expect "window preset bc wide" 200 /window '{"anchor":"bc","size":"wide","screen":0}'
expect_call "window bc wide centrado" '["windowgeom", 260, 630, 1400, 420]'
expect "window screen fuera de rango → clamp" 200 /window '{"anchor":"tr","size":"m","screen":9}'
expect_call "window screen clamp a 1" '["windowgeom", 3050, 10, 780, 430]'
expect "window anchor inválido" 400 /window '{"anchor":"zz","size":"m"}'
expect "window size inválido" 400 /window '{"anchor":"br","size":"xxl"}'
expect "window arrastre" 200 /window '{"x":100,"y":200}'
expect_call "window xy" '["windowgeom", 100, 200, 780, 430]'
expect "window arrastre fuera de pantalla" 200 /window '{"x":-500,"y":5000}'
expect_call "window xy acotado" '["windowgeom", 0, 650, 780, 430]'
expect "window arrastre entre monitores" 200 /window '{"x":3500,"y":-50}'
expect_call "window xy monitor 1 acotado" '["windowgeom", 3060, 0, 780, 430]'
[ "$(jget /window 'd["rect"]["x"]')" = "3060" ] && pass "GET /window refleja geometría" || bad "GET window" "$(curl -s "$URL/window")"
expect "window libre + tamaño" 200 /window '{"x":1500,"y":900,"size":"s"}'
expect_call "window libre redimensiona y acota (centro en monitor 0)" '["windowgeom", 1280, 750, 640, 330]'
expect "window libre centro en monitor 1" 200 /window '{"x":1800,"y":900,"size":"s"}'
expect_call "window libre salta al monitor del centro" '["windowgeom", 1920, 750, 640, 330]'
expect "window libre size inválido" 400 /window '{"x":1,"y":1,"size":"q"}'
[ "$(jget /window 'len(d["monitors"])')" = "2" ] && pass "GET /window monitores" || bad "monitores" "$(curl -s "$URL/window")"

# guardia de origen: una web cualquiera no puede teclear ni leer prefs/portapapeles
reset
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/type" -H 'Origin: https://evil.example' -H 'Content-Type: text/plain' -d '{"text":"rm -rf ~"}')
[ "$c" = "403" ] && pass "origen web → 403 en /type" || bad "origen web /type" "$c"
[ "$(calls | python3 -c 'import sys,json; print(len(json.load(sys.stdin)["calls"]))')" = "0" ] && pass "origen web no ejecuta xdotool" || bad "origen web ejecutó" "$(calls)"
c=$(curl -s -o /dev/null -w '%{http_code}' "$URL/prefs" -H 'Origin: http://localhost:8080'); [ "$c" = "403" ] && pass "origen web → 403 en GET /prefs" || bad "origen /prefs" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' "$URL/clipboard" -H 'Origin: https://evil.example'); [ "$c" = "403" ] && pass "origen web → 403 en /clipboard" || bad "origen clipboard" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' "$URL/health" -H 'Host: evil.example:17699'); [ "$c" = "403" ] && pass "DNS rebinding (Host ajeno) → 403" || bad "rebinding" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS "$URL/type" -H 'Origin: https://evil.example' -H 'Access-Control-Request-Method: POST'); [ "$c" = "403" ] && pass "preflight web → 403" || bad "preflight web" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/type" -H 'Origin: null' -H 'Content-Type: application/json' -d '{"text":"a"}'); [ "$c" = "200" ] && pass "Origin null (widget file://) → 200" || bad "origin null" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:$PORT/health"); [ "$c" = "200" ] && pass "Host localhost → 200" || bad "localhost" "$c"
c=$(curl -s -o /dev/null -w '%{http_code}' "$URL/clipboard"); [ "$c" = "200" ] && pass "GET /clipboard local → 200" || bad "clipboard" "$c"

# /opacity
reset; expect "opacity 0.5" 200 /opacity '{"op":0.5}'
expect_call "opacity xprop 32c" '"_NET_WM_WINDOW_OPACITY", "2147483647"]'
expect "opacity clamp bajo" 200 /opacity '{"op":0.01}'
expect_call "opacity mínimo 0.35" '"1503238553"]'
expect "opacity basura" 400 /opacity '{"op":"x"}'
expect "opacity NaN" 400 /opacity '{}'
expect "unopacity" 200 /unopacity '{}'
expect_call "unopacity remove" '"-remove", "_NET_WM_WINDOW_OPACITY"]'

# body malformado
expect "json roto" 400 /type '{"text":'
expect "json no objeto" 400 /type '[1,2]'
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/type" -H 'Content-Length: abc' --data-binary 'x')
[ "$c" = "400" ] && pass "content-length basura (400)" || bad "content-length basura" "$c"
big=$(head -c 70000 /dev/zero | tr '\0' a)
c=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/type" --data-binary "{\"text\":\"$big\"}")
[ "$c" = "400" ] && pass "body > 64 KiB (400)" || bad "body grande" "$c"
expect "ruta desconocida" 404 /nope '{}'

# slowloris: un cliente que no manda el body no bloquea a los demás
( exec 3<>/dev/tcp/127.0.0.1/$PORT; printf 'POST /type HTTP/1.1\r\nContent-Length: 100\r\n\r\n' >&3; sleep 7 ) &
SL=$!; sleep 0.3
t0=$(date +%s%N); curl -sf --max-time 2 "$URL/health" >/dev/null && pass "health con cliente colgado" || bad "slowloris" "health bloqueado"
kill $SL 2>/dev/null

# puerto ocupado por nosotros → sale 0 con mensaje
out=$(VK_PORT=$PORT VK_DRY_RUN=1 timeout 5 python3 vk_server.py 2>&1); rc=$?
[ $rc = 0 ] && echo "$out" | grep -q 'ya hay un server' && pass "port-in-use propio (rc=0)" || bad "port-in-use propio" "rc=$rc out=$out"
# puerto ocupado por otro → sale 1
python3 -c 'import socket,time; s=socket.socket(); s.bind(("127.0.0.1",17698)); s.listen(); time.sleep(4)' &
OTH=$!; sleep 0.3
out=$(VK_PORT=17698 VK_DRY_RUN=1 timeout 5 python3 vk_server.py 2>&1); rc=$?
[ $rc = 1 ] && echo "$out" | grep -q 'ocupado' && pass "port-in-use ajeno (rc=1)" || bad "port-in-use ajeno" "rc=$rc out=$out"
kill $OTH 2>/dev/null

# SIGTERM con tecla retenida → keyup al salir (verificado por salida limpia)
post /hold '{"key":"ctrl","state":1}' >/dev/null
kill -TERM $SRV; wait $SRV; rc=$?
[ $rc = 0 ] && pass "SIGTERM salida limpia (rc=0)" || bad "SIGTERM" "rc=$rc"
trap - EXIT

[ $fail = 0 ] && echo "ALL PASS" || echo "SOME FAILED"
exit $fail
