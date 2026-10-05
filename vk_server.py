#!/usr/bin/env python3
"""Resyst VK server v3 — inyección XTEST + utilidades de escritorio.

Endpoints (127.0.0.1:17670, loopback only):
  POST /type   {"text": "...", "delay": 0..200}               → xdotool type
  POST /key    {"keys": "Return" | "ctrl+c ctrl+v"}           → xdotool key (1..8 acordes)
  POST /press  {"keys": "BackSpace", "repeat": 1..20,
                "delay": 0..200}                              → xdotool key --repeat
  POST /hold   {"key": "shift", "state": 1|0}                 → keydown/keyup (auto-release 10 s)
  POST /paste  {"text": "..."}                                → clipboard + ctrl+v (preserva el portapapeles)
  POST /launch {"app": "kate|kwrite|mousepad"}                → abre un editor (verificación en vivo)
  GET  /health                                               → estado + ventana activa + caps/num LED
  GET  /focus  {"win": "id"}  — ver Focus histórico abajo

Personalización (v4):
  GET  /prefs                                                → {"prefs": {...}|null}  (copia durable)
  POST /prefs  {"prefs": {"v": 4, ...}}                      → guarda atómico en $VK_STATE_DIR/prefs.json
  POST /profile {"id": "juego"|"next"|"prev"}                → evento para el widget (atajos globales)
  GET  /events?since=N&wait=0..25                            → long-poll de eventos {seq, events:[...]}
  GET  /clipboard                                            → {"text": "..."} (crear macro desde el portapapeles)
  GET  /window                                               → geometría del widget + monitores
  POST /window {"anchor": "br", "size": "m", "screen": 0}    → preset de posición/tamaño
               {"x": 100, "y": 600}                          → posición absoluta (arrastre), acotada al monitor
  POST /opacity {"op": 0.35..1}   POST /unopacity            → _NET_WM_WINDOW_OPACITY del widget

Utilidades internas (sin endpoint público de ejecución arbitraria):
  - ventana activa: _NET_ACTIVE_WINDOW vía xprop (para indicador del widget)
  - estado de LEDs del teclado físico: /sys/class/leds/*capslock/brightness
  - clipboard: xclip -i -selection clipboard (stdin, sin shell)

Notas de diseño (bugs documentados, no cambiar):
  * El widget corre en file:// → CORS + preflight OPTIONS son obligatorios.
  * Guardia de origen: solo Origin ausente o "null" y Host 127.0.0.1/localhost:PORT
    (si no, cualquier web podría teclear en el escritorio con un POST text/plain).
  * xdotool necesita LANG/LC_ALL=C.UTF-8 o los acentos UTF-8 se rompen.
  * Las llamadas a xdotool se serializan con un lock: dos `type --clearmodifiers`
    concurrentes intercalan teclas y modificadores.
  * /paste preserva el portapapeles del usuario (guarda + restaura con xclip).

Variables de entorno solo para pruebas:
  VK_PORT=17699     puerto alternativo (por defecto 17670)
  VK_DRY_RUN=1      no ejecuta xdotool; registra argv y lo expone en GET /debug/calls
  VK_STATE_DIR=...  carpeta de prefs.json (por defecto ~/.config/resyst-vk)
  VK_WIN_CLASS=...  clase X11 de la ventana del widget (por defecto ResystVK)
"""
import errno
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

HOST = "127.0.0.1"
PORT = int(os.environ.get("VK_PORT", "17670"))
DRY_RUN = os.environ.get("VK_DRY_RUN") == "1"
STATE_DIR = os.environ.get("VK_STATE_DIR") or os.path.join(
    os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config"), "resyst-vk")
WIN_CLASS = os.environ.get("VK_WIN_CLASS", "ResystVK")

# Hereda el entorno (XAUTHORITY, HOME…) pero fuerza display y locale UTF-8.
ENV = dict(os.environ, DISPLAY=":0", LANG="C.UTF-8", LC_ALL="C.UTF-8")

DELAY_DEFAULT = 50  # contrato original: /type sin delay → 50 ms
DELAY_MAX = 200
MAX_TEXT = 2000
MAX_BODY = 64 * 1024
MAX_CHORDS = 8
MAX_REPEAT = 20
HOLD_AUTO_RELEASE_S = 10.0
XDOTOOL_TIMEOUT_S = 10
CLIP_RESTORE_DELAY_S = 0.35   # margen para que el destino procese el paste
MAX_PREFS_BODY = 512 * 1024
EVENTS_KEEP = 32
EVENTS_MAX_WAIT_S = 25
# Presets de ventana: tamaño (ancho, alto) y márgenes al borde del monitor.
WIN_SIZES = {"s": (640, 330), "m": (780, 430), "l": (980, 500), "wide": (1400, 420)}
WIN_ANCHORS = ("tl", "tc", "tr", "bl", "bc", "br")
WIN_MARGIN_X = 10
WIN_MARGIN_TOP = 10
WIN_MARGIN_BOTTOM = 30   # br + m en el monitor 0 → (1130, 620), la posición histórica
PROFILE_REF_RE = re.compile(r"^[^\x00-\x1f\x7f]{1,40}$")
LAUNCH_WHITELIST = {
    "kate": ["kate"],
    "kwrite": ["kwrite"],
    "mousepad": ["mousepad"],
}

# keysym (letras, dígitos, _ ) unidos por '+': "ctrl+shift+Left", "F12", "aacute"
CHORD_RE = re.compile(r"^[A-Za-z0-9_]{1,32}(\+[A-Za-z0-9_]{1,32}){0,4}$")
KEYSYM_RE = re.compile(r"^[A-Za-z0-9_]{1,32}$")
# controles C0/C1 salvo \n y \t (xdotool los traduce a Return/Tab)
CTRL_RE = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")

_xdo_lock = threading.Lock()
_clip_lock = threading.Lock()
_held = {}  # keysym -> threading.Timer de auto-release
_held_lock = threading.Lock()
dry_calls = []  # solo en VK_DRY_RUN


def run_xdotool(args):
    """Ejecuta xdotool serializado. Devuelve (rc, stdout, stderr)."""
    with _xdo_lock:
        if DRY_RUN:
            dry_calls.append(args)
            del dry_calls[:-500]
            return 0, "", ""
        try:
            r = subprocess.run(
                ["xdotool"] + args,
                env=ENV,
                capture_output=True,
                text=True,
                timeout=XDOTOOL_TIMEOUT_S,
            )
            return r.returncode, r.stdout.strip(), r.stderr.strip()
        except subprocess.TimeoutExpired:
            return 124, "", "xdotool timeout"
        except FileNotFoundError:
            return 127, "", "xdotool no instalado"


def run_quiet(argv, timeout=5, input_text=None):
    """Ejecuta un binario del sistema sin shell, capturando (rc, stdout, stderr)."""
    if DRY_RUN:
        dry_calls.append(argv)
        del dry_calls[:-500]
        return 0, "", ""
    try:
        r = subprocess.run(argv, env=ENV, capture_output=True, text=True,
                           timeout=timeout, input=input_text)
        return r.returncode, r.stdout.strip(), r.stderr.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
        return 1, "", repr(e)


# ── utilidades de escritorio (para /health y /launch) ──────────────────

_dry_focus: dict = {"id": None, "class": None, "name": None}   # solo VK_DRY_RUN (POST /debug/focus)


def active_window():
    """(win_id, clase, título) de la ventana con foco, o (None, None, None)."""
    if DRY_RUN:
        return _dry_focus["id"], _dry_focus["class"], _dry_focus["name"]
    rc, out, _ = run_quiet(["xprop", "-root", "_NET_ACTIVE_WINDOW"], timeout=2)
    if rc != 0:
        return None, None, None
    m = re.search(r"window id # (0x[0-9a-f]+)", out)
    if not m:
        return None, None, None
    wid = m.group(1)
    _, cls, _ = run_quiet(["xprop", "-id", wid, "WM_CLASS"], timeout=2)
    _, name, _ = run_quiet(["xprop", "-id", wid, "_NET_WM_NAME"], timeout=2)
    cls = cls.split("=", 1)[-1].strip('" ').split('"')[0] if cls else ""
    name = name.split("=", 1)[-1].strip('" ') if name else ""
    return wid, cls, name


def led_state():
    """Caps/Num lock según los LEDs de los dispositivos de entrada."""
    caps = num = 0
    try:
        for d in os.listdir("/sys/class/leds"):
            if d.endswith("::capslock"):
                caps = 1 if _read_led(d) else caps
            elif d.endswith("::numlock"):
                num = 1 if _read_led(d) else num
    except OSError:
        pass
    return caps, num


def _read_led(led):
    try:
        with open(f"/sys/class/leds/{led}/brightness") as fh:
            return int(fh.read().strip() or 0) > 0
    except (OSError, ValueError):
        return False


# ── preferencias durables (el perfil de Chrome vive en /tmp) ───────────

_prefs_lock = threading.Lock()


def prefs_path():
    return os.path.join(STATE_DIR, "prefs.json")


def prefs_read():
    try:
        with open(prefs_path(), encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else None
    except (OSError, ValueError):
        return None


def prefs_write(prefs):
    """Escritura atómica (tmp + rename) con permisos 0600."""
    if not isinstance(prefs, dict) or prefs.get("v") != 4:
        raise ValueError("prefs debe ser un objeto v4")
    if not isinstance(prefs.get("profiles"), dict) or not prefs["profiles"]:
        raise ValueError("prefs sin perfiles")
    with _prefs_lock:
        os.makedirs(STATE_DIR, mode=0o700, exist_ok=True)
        tmp = prefs_path() + ".tmp"
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(prefs, fh, ensure_ascii=False, indent=1)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, prefs_path())


# ── bus de eventos (long-poll) para atajos globales → widget ───────────

_events = []           # [(seq, dict)]
_events_seq = 0
_events_cv = threading.Condition()


def push_event(ev):
    global _events_seq
    with _events_cv:
        _events_seq += 1
        _events.append((_events_seq, dict(ev, seq=_events_seq, ts=time.time())))
        del _events[:-EVENTS_KEEP]
        _events_cv.notify_all()
        return _events_seq


def events_since(since, wait):
    deadline = time.monotonic() + wait
    with _events_cv:
        while True:
            out = [e for s, e in _events if s > since]
            left = deadline - time.monotonic()
            if out or left <= 0:
                return _events_seq, out
            _events_cv.wait(left)


# ── geometría de la ventana del widget ─────────────────────────────────

MON_RE = re.compile(r"(\d+)/\d+x(\d+)/\d+\+(-?\d+)\+(-?\d+)")
DRY_MONITORS = [{"x": 0, "y": 0, "w": 1920, "h": 1080}, {"x": 1920, "y": 0, "w": 1920, "h": 1080}]
_dry_geom = {"x": 1130, "y": 620, "w": 780, "h": 430}


def monitors():
    if DRY_RUN:
        return [dict(m) for m in DRY_MONITORS]
    rc, out, _ = run_quiet(["xrandr", "--listactivemonitors"], timeout=3)
    mons = []
    if rc == 0:
        for line in out.splitlines()[1:]:
            m = MON_RE.search(line)
            if m:
                w, h, x, y = (int(v) for v in m.groups())
                mons.append({"x": x, "y": y, "w": w, "h": h})
    return mons or [{"x": 0, "y": 0, "w": 1920, "h": 1080}]


def widget_window():
    """Id (decimal) de la ventana visible del widget, o None."""
    if DRY_RUN:
        return "0"
    rc, out, _ = run_quiet(["xdotool", "search", "--onlyvisible", "--class", WIN_CLASS], timeout=3)
    ids = out.split() if rc == 0 else []
    return ids[0] if ids else None


def widget_geometry(wid):
    if DRY_RUN:
        return dict(_dry_geom)
    rc, out, _ = run_quiet(["xdotool", "getwindowgeometry", "--shell", wid], timeout=3)
    if rc != 0:
        return None
    vals = dict(line.split("=", 1) for line in out.splitlines() if "=" in line)
    try:
        return {"x": int(vals["X"]), "y": int(vals["Y"]), "w": int(vals["WIDTH"]), "h": int(vals["HEIGHT"])}
    except (KeyError, ValueError):
        return None


def preset_rect(mon, anchor, size):
    w, h = WIN_SIZES[size]
    w, h = min(w, mon["w"] - 2 * WIN_MARGIN_X), min(h, mon["h"] - WIN_MARGIN_TOP - WIN_MARGIN_BOTTOM)
    col, row = anchor[1], anchor[0]
    x = {"l": mon["x"] + WIN_MARGIN_X,
         "c": mon["x"] + (mon["w"] - w) // 2,
         "r": mon["x"] + mon["w"] - w - WIN_MARGIN_X}[col]
    y = mon["y"] + WIN_MARGIN_TOP if row == "t" else mon["y"] + mon["h"] - h - WIN_MARGIN_BOTTOM
    return {"x": x, "y": y, "w": w, "h": h}


def clamp_to_monitors(x, y, w, h, mons):
    """Mantiene la ventana entera dentro del monitor que contiene su centro."""
    cx, cy = x + w // 2, y + h // 2
    mon = next((m for m in mons if m["x"] <= cx < m["x"] + m["w"] and m["y"] <= cy < m["y"] + m["h"]),
               None)
    if mon is None:
        mon = min(mons, key=lambda m: abs(m["x"] + m["w"] // 2 - cx) + abs(m["y"] + m["h"] // 2 - cy))
    x = max(mon["x"], min(x, mon["x"] + mon["w"] - w))
    y = max(mon["y"], min(y, mon["y"] + mon["h"] - h))
    return x, y, mons.index(mon)


def window_apply(data):
    """POST /window → mueve/redimensiona el widget. Devuelve (rc, payload)."""
    mons = monitors()
    wid = widget_window()
    if wid is None:
        return 409, {"ok": False, "error": "ventana del widget no encontrada"}
    geom = widget_geometry(wid) or {"x": 0, "y": 0, "w": 780, "h": 430}
    if "x" in data or "y" in data:
        x = clamp_int(data.get("x"), -10000, 20000, geom["x"])
        y = clamp_int(data.get("y"), -10000, 20000, geom["y"])
        size = data.get("size")
        if size is not None and size not in WIN_SIZES:
            raise ValueError("size inválido")
        w, h = WIN_SIZES[size] if size else (geom["w"], geom["h"])
        x, y, screen = clamp_to_monitors(x, y, w, h, mons)
        rect = {"x": x, "y": y, "w": min(w, mons[screen]["w"]), "h": min(h, mons[screen]["h"])}
    else:
        anchor = str(data.get("anchor", "br"))
        size = str(data.get("size", "m"))
        if anchor not in WIN_ANCHORS:
            raise ValueError("anchor inválido")
        if size not in WIN_SIZES:
            raise ValueError("size inválido")
        screen = clamp_int(data.get("screen"), 0, len(mons) - 1, 0)
        rect = preset_rect(mons[screen], anchor, size)
    if DRY_RUN:
        dry_calls.append(["windowgeom", rect["x"], rect["y"], rect["w"], rect["h"]])
        _dry_geom.update(rect)
    else:
        if (rect["w"], rect["h"]) != (geom["w"], geom["h"]):
            run_quiet(["xdotool", "windowsize", wid, str(rect["w"]), str(rect["h"])], timeout=3)
        run_quiet(["xdotool", "windowmove", wid, str(rect["x"]), str(rect["y"])], timeout=3)
    return 200, {"ok": True, "rect": rect, "screen": screen}


def window_opacity(op):
    wid = widget_window()
    if wid is None:
        return 409, {"ok": False, "error": "ventana del widget no encontrada"}
    if op is None:
        argv = ["xprop", "-id", wid, "-remove", "_NET_WM_WINDOW_OPACITY"]
    else:
        argv = ["xprop", "-id", wid, "-f", "_NET_WM_WINDOW_OPACITY", "32c",
                "-set", "_NET_WM_WINDOW_OPACITY", str(int(op * 0xFFFFFFFF))]
    rc, _, err = run_quiet(argv, timeout=3)
    return (200 if rc == 0 else 500), {"ok": rc == 0, "error": err or None}


# ── clipboard ───────────────────────────────────────────────────────────

def clip_read():
    rc, out, _ = run_quiet(["xclip", "-o", "-selection", "clipboard"], timeout=2)
    return out if rc == 0 else None


def clip_write(text):
    return run_quiet(["xclip", "-i", "-selection", "clipboard"],
                     timeout=3, input_text=text)[0] == 0


def do_paste(text):
    """Clipboard → ctrl+shift+v (KLIPPER preserva el historial del usuario)."""
    with _clip_lock:
        if not clip_write(text):
            return 1, "xclip no disponible"
        time.sleep(CLIP_RESTORE_DELAY_S)
        rc, _, err = run_xdotool(["key", "--clearmodifiers", "--", "ctrl+shift+v"])
        return rc, err


def clamp_int(value, lo, hi, default):
    try:
        n = int(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, n))


def parse_chords(raw):
    chords = str(raw or "").split()
    if not chords:
        raise ValueError("keys vacío")
    if len(chords) > MAX_CHORDS:
        raise ValueError("demasiados acordes (máx %d)" % MAX_CHORDS)
    for c in chords:
        if not CHORD_RE.match(c):
            raise ValueError("acorde inválido: %r" % c[:40])
    return chords


def release_held(key):
    with _held_lock:
        t = _held.pop(key, None)
    if t:
        t.cancel()
    return run_xdotool(["keyup", "--", key])


def release_all_held():
    with _held_lock:
        keys = list(_held)
    for k in keys:
        release_held(k)


class Handler(BaseHTTPRequestHandler):
    timeout = 5  # socket timeout: un cliente colgado no retiene un hilo
    server_version = "ResystVK/3"

    def log_message(self, fmt, *args):
        pass  # silencio; los errores reales viajan en la respuesta JSON

    def _send(self, code, payload):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()
        self.wfile.write(body)

    def _result(self, rc, err):
        self._send(200 if rc == 0 else 500, {"ok": rc == 0, "error": err or None})

    def _guard(self):
        """Solo clientes locales legítimos: el widget (file:// → Origin "null") o herramientas
        sin Origin (curl, resyst-vk.sh). Bloquea páginas web que intenten inyectar teclas o
        leer prefs/portapapeles (POST no-cors text/plain no hace preflight) y DNS rebinding
        (Host ajeno). Devuelve True si la petición fue rechazada."""
        origin = self.headers.get("Origin")
        host = (self.headers.get("Host") or "").lower()
        allowed_hosts = {"127.0.0.1:%d" % PORT, "localhost:%d" % PORT}
        if (origin is not None and origin != "null") or (host and host not in allowed_hosts):
            body = json.dumps({"ok": False, "error": "origen no permitido"}).encode()
            self.send_response(403)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return True
        return False

    def do_OPTIONS(self):
        if self._guard():
            return
        self._send(200, {"ok": True})

    def _read_body(self, limit=MAX_BODY):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ValueError("Content-Length inválido")
        if n < 0 or n > limit:
            raise ValueError("body demasiado grande")
        raw = self.rfile.read(n) if n else b""
        data = json.loads(raw.decode("utf-8") or "{}")
        if not isinstance(data, dict):
            raise ValueError("se esperaba un objeto JSON")
        return data

    def do_GET(self):
        if self._guard():
            return
        url = urlsplit(self.path)
        path, query = url.path, parse_qs(url.query)
        if path == "/health":
            with _held_lock:
                held = sorted(_held)
            wid, cls, name = active_window()
            caps, num = led_state()
            self._send(200, {"ok": True, "server": "resyst-vk", "version": 4,
                             "pid": os.getpid(), "dry_run": DRY_RUN, "held": held,
                             "events_seq": _events_seq,
                             "focus": {"id": wid, "class": cls, "name": name},
                             "leds": {"caps": caps, "num": num}})
        elif path == "/prefs":
            self._send(200, {"ok": True, "prefs": prefs_read()})
        elif path == "/clipboard":
            text = clip_read()
            self._send(200, {"ok": True, "text": (text or "")[:MAX_TEXT]})
        elif path == "/events":
            since = clamp_int((query.get("since") or ["0"])[0], 0, 1 << 62, 0)
            wait = clamp_int((query.get("wait") or ["0"])[0], 0, EVENTS_MAX_WAIT_S, 0)
            seq, evs = events_since(since, wait)
            self._send(200, {"ok": True, "seq": seq, "events": evs})
        elif path == "/window":
            wid = widget_window()
            self._send(200, {"ok": True, "win": wid, "rect": widget_geometry(wid) if wid else None,
                             "monitors": monitors(), "sizes": WIN_SIZES})
        elif path == "/debug/calls" and DRY_RUN:
            self._send(200, {"ok": True, "calls": dry_calls})
        else:
            self._send(404, {"ok": False, "error": "not found"})

    def do_DELETE(self):
        if self._guard():
            return
        if self.path == "/debug/calls" and DRY_RUN:
            dry_calls.clear()
            self._send(200, {"ok": True})
        else:
            self._send(404, {"ok": False, "error": "not found"})

    def do_POST(self):
        if self._guard():
            return
        try:
            if self.path == "/prefs":
                data = self._read_body(MAX_PREFS_BODY)
                prefs_write(data.get("prefs"))
                push_event({"type": "prefs"})
                self._send(200, {"ok": True})
                return
            data = self._read_body()
            if self.path == "/debug/focus" and DRY_RUN:
                cls = str(data.get("class") or "")[:60] or None
                _dry_focus.update({"id": "0x1" if cls else None, "class": cls, "name": cls})
                self._send(200, {"ok": True})
                return
            if self.path == "/profile":
                ref = str(data.get("id", "")).strip()
                if not PROFILE_REF_RE.match(ref):
                    raise ValueError("id de perfil inválido")
                seq = push_event({"type": "profile", "id": ref})
                self._send(200, {"ok": True, "seq": seq})
                return
            if self.path == "/window":
                code, payload = window_apply(data)
                self._send(code, payload)
                return
            if self.path == "/opacity":
                try:
                    op = float(data.get("op", "nan"))
                except (TypeError, ValueError):
                    raise ValueError("op inválido")
                if op != op:  # NaN
                    raise ValueError("op inválido")
                code, payload = window_opacity(max(0.35, min(1.0, op)))
                self._send(code, payload)
                return
            if self.path == "/unopacity":
                code, payload = window_opacity(None)
                self._send(code, payload)
                return
            if self.path == "/type":
                text = CTRL_RE.sub("", str(data.get("text", "")))[:MAX_TEXT]
                if not text:
                    raise ValueError("text vacío")
                delay = clamp_int(data.get("delay"), 0, DELAY_MAX, DELAY_DEFAULT)
                self._xdo(["type", "--delay", str(delay), "--clearmodifiers", "--", text])
            elif self.path == "/key":
                chords = parse_chords(data.get("keys"))
                self._xdo(["key", "--clearmodifiers", "--"] + chords)
            elif self.path == "/press":
                chords = parse_chords(data.get("keys"))
                if len(chords) != 1:
                    raise ValueError("/press acepta un solo acorde")
                repeat = clamp_int(data.get("repeat"), 1, MAX_REPEAT, 1)
                delay = clamp_int(data.get("delay"), 0, DELAY_MAX, 30)
                self._xdo(["key", "--clearmodifiers", "--repeat", str(repeat),
                           "--repeat-delay", str(delay), "--"] + chords)
            elif self.path == "/hold":
                key = str(data.get("key", ""))
                if not KEYSYM_RE.match(key):
                    raise ValueError("key inválida")
                if data.get("state"):
                    rc, _, err = run_xdotool(["keydown", "--", key])
                    if rc == 0:
                        t = threading.Timer(HOLD_AUTO_RELEASE_S, release_held, args=(key,))
                        t.daemon = True
                        with _held_lock:
                            old = _held.pop(key, None)
                            _held[key] = t
                        if old:
                            old.cancel()
                        t.start()
                else:
                    rc, _, err = release_held(key)
                self._result(rc, err)
            elif self.path == "/paste":
                text = CTRL_RE.sub("", str(data.get("text", "")))[:MAX_TEXT]
                if not text:
                    raise ValueError("text vacío")
                rc, err = do_paste(text)
                self._result(rc, err)
            elif self.path == "/launch":
                app = str(data.get("app", ""))
                if app not in LAUNCH_WHITELIST:
                    raise ValueError("app no permitida: %r" % app[:30])
                rc, _, err = run_quiet(LAUNCH_WHITELIST[app], timeout=3)
                self._result(rc, err)
            else:
                self._send(404, {"ok": False, "error": "not found"})
        except (ValueError, UnicodeDecodeError) as e:  # JSONDecodeError ⊂ ValueError
            self._send(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001
            self._send(500, {"ok": False, "error": repr(e)})

    def _xdo(self, args):
        rc, _, err = run_xdotool(args)
        self._result(rc, err)


class Server(ThreadingHTTPServer):
    daemon_threads = True


def already_running():
    try:
        with urllib.request.urlopen("http://%s:%d/health" % (HOST, PORT), timeout=1.5) as r:
            return json.load(r).get("server") == "resyst-vk"
    except Exception:  # noqa: BLE001
        return False


def main():
    try:
        srv = Server((HOST, PORT), Handler)
    except OSError as e:
        if e.errno == errno.EADDRINUSE:
            if already_running():
                print("resyst-vk: ya hay un server activo en %s:%d" % (HOST, PORT), flush=True)
                return 0
            print("resyst-vk: puerto %d ocupado por otro proceso" % PORT, file=sys.stderr, flush=True)
            return 1
        raise

    def on_term(signum, _frame):
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, on_term)
    print("resyst-vk server v4 on %s:%d%s" % (HOST, PORT, " (DRY RUN)" if DRY_RUN else ""), flush=True)
    try:
        srv.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        release_all_held()  # nunca dejar una tecla pegada al salir
        srv.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
