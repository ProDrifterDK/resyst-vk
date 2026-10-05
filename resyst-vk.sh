#!/bin/bash
# Resyst VK — lanzador del teclado virtual (server + widget)
# Uso: resyst-vk start|stop|status
# Instalación: clona este repo en el directorio que prefieras y ajusta VK_DIR.
set -u
VK_DIR="${VK_DIR:-$HOME/.local/share/resyst-vk}"
SERVER="$VK_DIR/vk_server.py"
LOG="${XDG_CACHE_HOME:-$HOME/.cache}/resyst-vk/server.log"
WIN_CLASS="ResystVK"
HEALTH="http://127.0.0.1:17670/health"

server_up() { curl -sf --max-time 2 "$HEALTH" >/dev/null 2>&1; }
is_widget() { DISPLAY=:0 xdotool search --class "$WIN_CLASS" >/dev/null 2>&1; }

start_server() {
  if server_up; then echo "server: ya activo"; return 0; fi
  setsid nohup /usr/bin/python3 "$SERVER" >>"$LOG" 2>&1 < /dev/null &
  for _ in 1 2 3 4 5; do
    sleep 1
    server_up && { echo "server: iniciado"; return 0; }
  done
  echo "server: FALLO al iniciar (ver $LOG)"
  return 1
}

start_widget() {
  if is_widget; then echo "widget: ya activo"; return 0; fi
  env DISPLAY=:0 QT_QPA_PLATFORM=xcb /usr/bin/google-chrome \
    --class="$WIN_CLASS" \
    --user-data-dir=/tmp/resyst-vk-profile \
    --new-window --window-size=780,430 --window-position=1130,620 \
    --app="file://$VK_DIR/vk.html" >/dev/null 2>&1 &
  sleep 3
  # dock de X11: sin foco + siempre encima (refuerzo; KWin rule también aplica al nacer)
  local wid
  wid=$(DISPLAY=:0 xdotool search --class "$WIN_CLASS" 2>/dev/null | tail -1)
  if [ -n "$wid" ]; then
    DISPLAY=:0 xprop -id "$wid" -f _NET_WM_WINDOW_TYPE 32a -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_DOCK
    echo "widget: iniciado (wid=$wid, tipo DOCK)"
  else
    echo "widget: FALLO al iniciar"
  fi
}

stop_all() {
  pkill -f 'resyst-vk-profil[e]' 2>/dev/null
  pkill -f 'vk_server\.py' 2>/dev/null
  echo "detenido"
}

status() {
  server_up && echo "server: ON" || echo "server: off"
  is_widget && echo "widget: ON" || echo "widget: off"
}

case "${1:-start}" in
  start) start_server; start_widget ;;
  stop) stop_all ;;
  status) status ;;
  *) echo "uso: $0 {start|stop|status}"; exit 2 ;;
esac
