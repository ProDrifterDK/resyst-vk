# ✦ Resyst VK

The Resyst Midnight on-screen keyboard for the Linux desktop. Born from a dying 2010 Razer Cyclosa and the question *"what does an on-screen keyboard look like when someone with taste designs it?"*

Dark, amber, and opinionated: a full Spanish ISO keyboard with word suggestions, profiles that follow the app you're using, long-press variants, macros, and a personalization engine deep enough to make it *yours*.

## What it does

- **Real Spanish ISO layout** — ñ, accents row (á é í ó ú ü ¿ ¡), AltGr layer, `123`/nav layer with F-keys and numpad
- **Long-press variants** — hold a key, slide, release: á à â ä ã, digits → symbols, ≤ « and friends; configurable hold time and behavior
- **Offline word suggestions** — frequency-lexicon prediction (12k ES + 8k EN), no network, ever
- **Profiles** — Noche (Midnight), Día (Papiro), Juego (Arcade), Escritura (Pizarra): switch live from the bar, bind global hotkeys, or let the keyboard follow the focused app
- **Appearance engine** — 5 themes + custom accent color (WCAG-clamped), key shape, caps, press animation, font, density
- **Macro library** — 13 built-ins, a personal top row, an in-widget editor that never leaks keystrokes
- **Key sound** — 4 synthesized packs, volume to taste
- **Zero focus stealing** — the keyboard never takes focus from what you're typing into (the hard-won way: `_NET_WM_WINDOW_TYPE_DOCK`)

No cloud. No telemetry. No network access at all — the whole thing is loopback on `127.0.0.1`.

## How it works

```
vk.html                widget shell (Chrome --app window)
assets/js/             keyboard: layout, themes, suggestions, macros, long-press, settings
vk_server.py           injection server (Python stdlib, 127.0.0.1:17670)
resyst-vk.sh           start | stop | status
tests/                 widget E2E (headless) + server E2E (dry-run)
tools/check_grid.js    layout invariant guard
```

The widget is a Chrome app window marked as a dock (`_NET_WM_WINDOW_TYPE_DOCK`), so the window manager never gives it focus — clicks land on keys while your text cursor stays in the app you were typing into. Keys are injected at the X server level (XTEST via xdotool), which is why it works in **every** application — GTK, Chromium, Electron, terminals — with no per-toolkit input-method plugins.

KDE Plasma X11 is the tested home (KWin 5.27). Wayland is a different animal: XTEST doesn't cross that boundary by design.

## Run it

```bash
git clone https://github.com/ProDrifterDK/resyst-vk.git
cd resyst-vk
./resyst-vk.sh start        # server + widget; stop/status when you need them
```

Requirements: Linux desktop on X11, Python 3 (stdlib only), xdotool, Google Chrome (any Chromium build works for the widget).

Optional dev deps for the test suites: Node.js + `playwright-core` (widget E2E).

## Tests

```bash
node tools/check_grid.js    # layout invariant: every row sums 60 columns
bash tests/server_e2e.sh    # server behavior in dry-run mode
node tests/widget_e2e.js    # 101 headless cases incl. long-press + touch
```

## License

MIT — see `lexicon-src/LICENSE` for the frequency-lexicon attribution (Hermit Dave's FrequencyWords, MIT).
