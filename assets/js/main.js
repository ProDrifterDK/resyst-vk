/* Resyst VK v4 — controlador principal del widget.
   Capas qwerty latam + 123/nav, fila superior configurable (acentos / personal / compacta),
   perfiles con cambio en vivo (barra, atajo global vía server, o automático por app enfocada),
   modo composición (el propio teclado escribe dentro del widget: la ventana DOCK nunca tiene foco). */
'use strict';
window.VK = window.VK || {};

(() => {
  const { escapeHtml } = VK.util;
  const { LAYERS, SYM, rowsFor } = VK.Layout;
  const Settings = VK.Settings;
  const S = () => Settings.get();

  const PORT = (/^\d{4,5}$/.test(new URLSearchParams(location.search).get('port') || '')
    ? new URLSearchParams(location.search).get('port') : '17670');
  const SERVER = 'http://127.0.0.1:' + PORT;
  const TYPE_DELAY = 12;
  Settings.setServer(SERVER);

  const keysymFor = c => /^[a-z0-9]$/i.test(c) ? c.toLowerCase() : (SYM[c] || null);
  const isLetter = c => c.length === 1 && c.toLowerCase() !== c.toUpperCase();

  // ── estado ───────────────────────────────────────────────────────────
  const state = { shift: false, caps: false, ctrl: false, alt: false, altgr: false, super: false,
                  layer: 'qwerty', online: null, leds: {caps: 0, num: 0}, focusClass: '' };
  let keys = [];
  const kb = document.getElementById('kb');
  const $ = id => document.getElementById(id);

  function charOut(spec) {
    if (state.altgr && spec.g) return spec.g;
    if (isLetter(spec.c)) return (state.caps !== state.shift) ? spec.c.toUpperCase() : spec.c;
    return state.shift && spec.s ? spec.s : spec.c;
  }

  // ── construcción (se repite solo si cambia la estructura: fila superior / macros fijadas) ──
  let builtSig = '';
  function structureSig() {
    const s = S();
    return s.topRow + '|' + (s.topRow === 'personal'
      ? Settings.pinned().map(m => m.id + ':' + m.label).join(',') : '');
  }
  function build() {
    releaseAll();
    kb.innerHTML = '';
    keys = [];
    const s = S();
    const pinned = Settings.pinned();
    for (const [name, layer] of Object.entries(LAYERS)) {
      const rows = rowsFor(name, s.topRow, pinned);
      const grid = document.createElement('div');
      grid.className = 'layer';
      grid.id = 'layer-' + name;
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', layer.label);
      grid.style.gridTemplateRows = 'repeat(' + rows.length + ', minmax(0, 1fr))';
      grid.hidden = name !== state.layer;
      rows.forEach((row, ri) => {
        const total = row.reduce((n, k) => n + k.w, 0);
        if (total !== 60) console.warn('fila', name, ri, 'suma', total);
        for (const spec of row) {
          const isKey = !spec.gap && !spec.hint;
          const el = document.createElement(isKey ? 'button' : 'div');
          el.style.gridColumn = 'span ' + spec.w;
          el.style.gridRow = String(ri + 1);
          if (spec.gap) { el.className = 'spacer'; el.setAttribute('aria-hidden', 'true'); grid.appendChild(el); continue; }
          if (spec.hint) { el.className = 'row-hint'; el.textContent = spec.hint; grid.appendChild(el); continue; }
          el.type = 'button';
          el.className = 'key' + (spec.fn ? ' fn' : '') + (spec.glyph ? ' glyph' : '') + (spec.accent ? ' accent' : '')
            + (spec.num ? ' num' : '') + (spec.space ? ' space' : '') + (spec.mod ? ' mod fn' : '')
            + (spec.layer ? ' layer-toggle fn' : '') + (spec.macro ? ' macro' : '');
          el.dataset.key = spec.mod ? 'mod:' + spec.mod : spec.layer ? 'layer:' + spec.layer
            : spec.macro ? 'macro:' + spec.macro : (spec.k || spec.c);
          const lg = document.createElement('span'); lg.className = 'lg'; el.appendChild(lg);
          if (spec.c !== undefined && spec.s) { const sm = document.createElement('span'); sm.className = 'sm'; sm.setAttribute('aria-hidden', 'true'); el.appendChild(sm); }
          if (spec.aria) el.setAttribute('aria-label', spec.aria);
          if (spec.macro) el.title = macroTitle(spec.macro);
          if (spec.mod) el.setAttribute('aria-pressed', 'false');
          el._spec = spec;
          if (spec.c !== undefined && !spec.space) el.classList.toggle('hasvar', VK.Variants.variantsFor(spec.c).length > 0);
          keys.push(el);
          grid.appendChild(el);
        }
      });
      kb.appendChild(grid);
    }
    builtSig = structureSig();
    render();
  }
  function macroTitle(id) {
    const m = Settings.macro(id);
    return m ? (m.kind === 'keys' ? 'Atajo: ' + m.body : 'Texto: ' + m.body.slice(0, 80)) : '';
  }

  // ── render incremental ───────────────────────────────────────────────
  function spaceLabel() {
    const p = Settings.profile();
    return (S().lang || 'es') + ' · ' + (p ? p.name : '');
  }
  function render() {
    const spaceTxt = spaceLabel();
    for (const el of keys) {
      const spec = el._spec, lg = el.firstChild;
      if (spec.c !== undefined && !spec.space) {
        const out = charOut(spec);
        if (lg.textContent !== out) lg.textContent = out;
        if (spec.s) {
          const other = out === spec.s ? spec.c : spec.s;
          if (el.children[1].textContent !== other) el.children[1].textContent = other;
          el.classList.toggle('shifted', out === spec.s);
        }
        if (state.altgr && spec.g && !el.querySelector('.g3')) {
          const g3 = document.createElement('span');
          g3.className = 'sm g3'; g3.style.right = '.35rem'; g3.style.left = 'auto';
          g3.textContent = spec.g; el.appendChild(g3);
        } else if (!state.altgr && spec.g) {
          const g3 = el.querySelector('.g3');
          if (g3) g3.remove();
        }
        if (!spec.aria) el.setAttribute('aria-label', out);
      } else {
        const label = spec.space ? spaceTxt : spec.label;
        if (lg.textContent !== label) lg.textContent = label;
      }
      if (spec.mod) {
        const m = spec.mod;
        const armed = state[m];
        const locked = (m === 'caps' || m === 'shift') && state.caps;
        el.classList.toggle('armed', armed && !locked);
        el.classList.toggle('locked', locked);
        el.setAttribute('aria-pressed', armed || locked ? 'true' : 'false');
      }
    }
    for (const name of Object.keys(LAYERS)) { const g = $('layer-' + name); if (g) g.hidden = name !== state.layer; }
    const chips = [];
    if (Compose.active) chips.push([Compose.kind === 'keys' ? '● GRABANDO ATAJO' : '✎ EDITANDO', false, 'rec']);
    if (state.caps) chips.push(['⇪ BLOQ MAYÚS', true]);
    else if (state.shift) chips.push(['⇧ una vez', false]);
    if (state.ctrl) chips.push(['CTRL +', false]);
    if (state.alt) chips.push(['ALT +', false]);
    if (state.altgr) chips.push(['ALTGR +', false]);
    if (state.super) chips.push(['SUPER +', false]);
    if (state.layer === 'nav') chips.push(['123 · NAV', false]);
    const html = chips.map(([t, solid, extra]) => '<span class="chip' + (solid ? ' solid' : '') + (extra ? ' ' + extra : '') + '">' + t + '</span>').join('');
    const box = $('chips');
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  // ── envío: cola ordenada ─────────────────────────────────────────────
  let chain = Promise.resolve();
  let inflight = 0;
  async function api(path, body, method) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(SERVER + path, {
        method: method || 'POST', headers: body ? {'Content-Type': 'application/json'} : undefined,
        body: body ? JSON.stringify(body) : undefined, signal: ctl.signal, cache: 'no-store',
      });
      const j = await r.json().catch(() => ({}));
      return r.ok && j.ok ? Object.assign({ok: true}, j) : {ok: false, error: j.error || ('HTTP ' + r.status)};
    } catch (e) {
      return {ok: false, error: e.name === 'AbortError' ? 'timeout' : 'server no responde', offline: true};
    } finally { clearTimeout(t); }
  }
  function enqueue(path, body) {
    inflight++;
    const p = chain.then(() => api(path, body)).then(r => {
      inflight--;
      if (r.ok) { if (state.online !== true) health(); }
      else { showError(r.error); if (r.offline) setOnline(false); }
      return r;
    });
    chain = p;
    return p;
  }
  let msgTimer = 0;
  function showError(text) {
    $('msg').textContent = '⚠ ' + text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(() => { $('msg').textContent = ''; }, 3000);
  }

  function clearOneShot() { state.shift = false; state.ctrl = false; state.alt = false; state.altgr = false; state.super = false; }

  function modList() {
    const mods = [];
    if (state.super) mods.push('super');
    if (state.ctrl) mods.push('ctrl');
    if (state.alt) mods.push('alt');
    if (state.altgr) mods.push('altgr');
    return mods;
  }
  function chordFor(spec) {
    const mods = modList();
    if (spec.k) {
      if (state.shift) mods.push('shift');
      return mods.concat(spec.k).join('+');
    }
    if (!mods.length) return null;
    const c = (state.altgr && spec.g) ? spec.g : charOut(spec);
    const sym = keysymFor(c);
    if (!sym) return null;
    if (state.shift) mods.push('shift');
    return mods.concat(sym).join('+');
  }
  // Acorde "grabable" para macros de atajo: tecla base + modificadores armados.
  function recordChord(spec) {
    const mods = modList();
    if (state.shift) mods.push('shift');
    const sym = spec.k || keysymFor(spec.c);
    return sym ? mods.concat(sym).join('+') : null;
  }

  // ── modo composición: el teclado escribe dentro del widget ───────────
  const Compose = {
    active: false, kind: 'text', value: '', tokens: [], opts: null, resolve: null,
    // opts: {kind:'text'|'keys', label, value, multiline, max, placeholder}
    start(opts) {
      if (this.active) this.finish(null);
      this.active = true;
      this.kind = opts.kind === 'keys' ? 'keys' : 'text';
      this.opts = opts;
      this.value = this.kind === 'text' ? String(opts.value || '') : '';
      this.tokens = this.kind === 'keys' ? String(opts.value || '').split(/\s+/).filter(Boolean) : [];
      $('cLabel').textContent = opts.label || (this.kind === 'keys' ? 'Atajo' : 'Texto');
      $('cSuper').hidden = this.kind !== 'keys';
      $('compose').hidden = false;
      $('suggest').hidden = true;
      clearOneShot();
      state.layer = 'qwerty';
      this.paint();
      render();
      return new Promise(res => { this.resolve = res; });
    },
    finish(result) {
      if (!this.active) return;
      this.active = false;
      $('compose').hidden = true;
      $('suggest').hidden = false;
      clearOneShot();
      render();
      const r = this.resolve; this.resolve = null;
      if (r) r(result);
    },
    confirm() { this.finish(this.kind === 'keys' ? this.tokens.join(' ') : this.value); },
    back() {
      if (this.kind === 'keys') this.tokens.pop();
      else this.value = Array.from(this.value).slice(0, -1).join('');
      this.paint();
    },
    append(text) {
      const max = this.opts.max || 2000;
      if (Array.from(this.value + text).length > max) { showError('máximo ' + max + ' caracteres'); return; }
      this.value += text;
      this.paint();
    },
    feed(spec) {
      if (this.kind === 'keys') {
        if (this.tokens.length >= 8) { showError('máximo 8 acordes'); return; }
        const chord = recordChord(spec);
        if (chord && Settings.CHORD_RE.test(chord)) this.tokens.push(chord);
        else showError('sin keysym para «' + (spec.c || spec.label) + '»');
        clearOneShot(); this.paint(); render();
        return;
      }
      if (spec.k === 'BackSpace') { this.back(); }
      else if (spec.k === 'Return') { if (this.opts.multiline) this.append('\n'); else { this.confirm(); return; } }
      else if (spec.k === 'Escape') { this.finish(null); return; }
      else if (spec.k === 'Tab') { this.append('\t'); }
      else if (spec.c !== undefined) { this.append(charOut(spec)); }
      clearOneShot(); render();
    },
    paint() {
      const f = $('cField');
      if (this.kind === 'keys') {
        f.innerHTML = this.tokens.length
          ? this.tokens.map(t => '<span class="tok">' + escapeHtml(t) + '</span>').join('') + '<span class="caret"></span>'
          : '<span class="ph">pulsa la combinación en el teclado (arma Ctrl/Alt/⇧ primero)…</span>';
        $('cSuper').classList.toggle('on', state.super);
        $('cSuper').setAttribute('aria-pressed', String(state.super));
      } else {
        const chars = Array.from(this.value);
        const shown = chars.length > 60 ? '…' + chars.slice(-60).join('') : this.value;
        f.innerHTML = this.value
          ? escapeHtml(shown).replace(/\n/g, '<span class="nl">↵</span>').replace(/\t/g, '<span class="nl">⇥</span>') + '<span class="caret"></span>'
          : '<span class="ph">' + escapeHtml(this.opts.placeholder || 'escribe con el teclado…') + '</span><span class="caret"></span>';
      }
    },
  };
  $('cOk').addEventListener('click', () => Compose.confirm());
  $('cCancel').addEventListener('click', () => Compose.finish(null));
  $('cBack').addEventListener('click', () => Compose.back());
  $('cSuper').addEventListener('click', () => { state.super = !state.super; Compose.paint(); render(); });

  // Ejecuta la tecla; devuelve el acorde si admite repetición al mantener.
  // silent: el sonido ya sonó al bajar (tecla con variantes, que escribe al soltar).
  function activate(spec, silent) {
    if (S().sound && !silent) VK.Sound.click(spec.space ? 'space' : spec.mod ? 'mod' : spec.k === 'Return' ? 'enter' : 'key');
    if (spec.mod) { toggleMod(spec.mod); return null; }
    if (spec.layer) { state.layer = spec.layer; render(); return null; }
    if (Compose.active) { if (!spec.macro) Compose.feed(spec); return null; }
    if (spec.macro) { VK.Macros.run(spec.macro); clearOneShot(); render(); return null; }
    if (state.altgr && spec.g && !state.ctrl && !state.alt) {
      enqueue('/type', {text: spec.g, delay: TYPE_DELAY});
      clearOneShot(); render(); return null;
    }
    const chord = chordFor(spec);
    if (chord) enqueue('/key', {keys: chord});
    else if (state.ctrl || state.alt || state.altgr) showError('sin combo para «' + spec.c + '»');
    else {
      const out = charOut(spec);
      enqueue('/type', {text: out, delay: TYPE_DELAY});
      suggestFeed(out);
    }
    if (spec.k === 'BackSpace') suggestBack();
    else if (spec.k) { word = ''; renderSuggest([]); }
    clearOneShot();
    render();
    return spec.r && chord ? chord : null;
  }

  function toggleMod(m) {
    if (m === 'shift') {
      if (state.caps) { state.caps = false; state.shift = false; }
      else if (state.shift) { state.caps = true; state.shift = false; }
      else state.shift = true;
    } else if (m === 'caps') {
      state.caps = !state.caps; state.shift = false;
    } else {
      state[m] = !state[m];
    }
    if (Compose.active) Compose.paint();
    render();
  }

  // ── sugerencias offline ──────────────────────────────────────────────
  let word = '';
  function suggestFeed(ch) {
    if (!S().suggest) { word = ''; renderSuggest([]); return; }
    if (!/[\p{L}\p{N}]/u.test(ch)) { word = ''; renderSuggest([]); return; }
    word = (word + ch).slice(-14);
    renderSuggest(VK.Suggest.candidates(S().lang, word));
  }
  function suggestBack() {
    word = word.slice(0, -1);
    renderSuggest(word && S().suggest ? VK.Suggest.candidates(S().lang, word) : []);
  }
  function suggestCommit(full) {
    const rest = full.slice(word.length);
    enqueue('/type', {text: rest + ' ', delay: TYPE_DELAY});
    word = '';
    renderSuggest([]);
  }
  function renderSuggest(list) {
    const box = $('suggest');
    if (!list || !list.length) { if (box.childElementCount) box.innerHTML = ''; return; }
    const html = list.slice(0, 4).map(w => {
      const head = escapeHtml(w.slice(0, word.length));
      const tail = escapeHtml(w.slice(word.length));
      return '<button type="button" class="sug" role="option" aria-label="' + escapeHtml(w) + '" data-w="' + escapeHtml(w) + '"><b>' + head + '</b><i>' + tail + '</i></button>';
    }).join('');
    if (box.innerHTML !== html) box.innerHTML = html;
  }
  $('suggest').addEventListener('click', e => {
    const b = e.target.closest('.sug');
    if (b) suggestCommit(b.dataset.w);
  });

  // ── mantener pulsado → variantes ─────────────────────────────────────
  // Solo las teclas de carácter CON variantes (y sin Ctrl/Alt/AltGr/Super armados) escriben al
  // soltar; todas las demás siguen escribiendo al bajar, exactamente como antes.
  const LP = VK.LongPress;
  function holdInfo(spec) {
    const s = S();
    if (!s.longPress || spec.c === undefined || spec.space || spec.mod || spec.layer || spec.macro) return null;
    if (state.ctrl || state.alt || state.altgr || state.super) return null;
    if (Compose.active && Compose.kind === 'keys') return null;
    const base = charOut(spec);
    const v = VK.Variants.variantsFor(base);
    return v.length ? {base, v} : null;
  }
  // Escribe una variante elegida: mismo camino que una tecla normal (cola, sugerencias, one-shot).
  function commitVariant(v) {
    if (Compose.active) { if (Compose.kind === 'text') Compose.append(v); }
    else { enqueue('/type', {text: v, delay: TYPE_DELAY}); suggestFeed(v); }
    clearOneShot();
    render();
  }
  function openVariants(a) {
    a.timer = 0;
    if (active.get(a.id) !== a || a.opened || a.done) return;
    a.opened = true;
    a.el.classList.remove('holding');
    if (S().sound) VK.Sound.click('mod');
    const s = S();
    LP.open(a.el, a.hold.v, {base: a.hold.base, release: s.lpRelease, size: s.lpSize,
                             onPick: commitVariant, onClose: () => a.el.classList.remove('down')});
    if (a.lastX !== undefined) LP.move(a.lastX, a.lastY);
  }
  // Una tecla con variantes aún pendiente se escribe YA (otra tecla bajó: se respeta el orden).
  function flushPending(except) {
    for (const a of active.values()) {
      if (a === except || !a.hold || a.opened || a.done) continue;
      clearTimeout(a.timer); a.timer = 0;
      a.done = true;
      a.el.classList.remove('holding');
      activate(a.el._spec, true);
    }
  }

  // ── punteros ─────────────────────────────────────────────────────────
  const active = new Map();
  const MIN_DOWN_MS = 80;

  // e = evento de soltar (coordenadas); cancel = el gesto se interrumpió (blur, rebuild, pointercancel).
  function release(id, e, cancel) {
    const a = active.get(id);
    if (!a) return;
    active.delete(id);
    clearTimeout(a.timer); clearInterval(a.timer);
    a.el.classList.remove('holding');
    let keepDown = false;
    if (a.hold && !a.done) {
      a.done = true;
      if (!a.opened) activate(a.el._spec, true);          // tap corto: escribe el carácter base
      else if (cancel || !e) LP.stick();                  // gesto interrumpido: el popup queda para tocar
      else {
        const r = LP.release(e.clientX, e.clientY);
        if (r.action === 'commit') commitVariant(r.value);
        keepDown = r.action === 'sticky';
      }
    }
    if (keepDown) return;   // la tecla queda marcada mientras el popup siga abierto (onClose la limpia)
    const left = Math.max(0, MIN_DOWN_MS - (performance.now() - a.t0));
    setTimeout(() => {
      if (![...active.values()].some(o => o.el === a.el) && !a.el.classList.contains('lporigin')) a.el.classList.remove('down');
    }, left);
  }
  function releaseAll() { for (const id of [...active.keys()]) release(id, null, true); if (LP.isOpen()) LP.close('blur'); }

  function startRepeat(a) {
    a.timer = setTimeout(() => {
      const t0 = performance.now();
      a.timer = setInterval(() => {
        if (inflight > 0) return;
        const held = performance.now() - t0;
        enqueue('/press', {keys: a.chord, repeat: held > 1500 ? 3 : 1, delay: 25});
      }, 70);
    }, S().repeatStart);
  }
  function pressFx(el) {
    if (S().press !== 'ripple') return;
    el.classList.remove('fx');
    void el.offsetWidth;  // reinicia la animación
    el.classList.add('fx');
    clearTimeout(el._fxT);
    el._fxT = setTimeout(() => el.classList.remove('fx'), 360);
  }

  kb.addEventListener('pointerdown', e => {
    const el = e.target.closest('.key');
    if (!el || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    el.classList.add('down');
    pressFx(el);
    const a = {id: e.pointerId, el, t0: performance.now(), timer: 0, chord: null, hold: holdInfo(el._spec)};
    flushPending(a);
    active.set(e.pointerId, a);
    if (a.hold) {
      // con variantes: suena ya, escribe al soltar (o abre el popup si se mantiene)
      if (S().sound) VK.Sound.click('key');
      el.classList.add('holding');
      a.timer = setTimeout(() => openVariants(a), S().lpDelay);
      return;
    }
    a.chord = activate(el._spec);
    if (a.chord) startRepeat(a);
  });
  kb.addEventListener('pointermove', e => {
    const a = active.get(e.pointerId);
    if (!a || !a.hold) return;
    a.lastX = e.clientX; a.lastY = e.clientY;
    if (a.opened && LP.mode() === 'slide') LP.move(e.clientX, e.clientY);
  });
  kb.addEventListener('pointerup', e => release(e.pointerId, e, false));
  for (const ev of ['pointercancel', 'lostpointercapture']) {
    kb.addEventListener(ev, e => release(e.pointerId, e, true));
  }
  kb.addEventListener('click', e => {
    const el = e.target.closest('.key');
    if (el && e.detail === 0) {
      el.classList.add('down');
      setTimeout(() => el.classList.remove('down'), MIN_DOWN_MS);
      activate(el._spec);
    }
  });
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('dragstart', e => e.preventDefault());
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  // ── health + LEDs + app enfocada ─────────────────────────────────────
  function setOnline(on) {
    const was = state.online;
    state.online = on;
    $('dot').className = on ? 'on' : 'off';
    const txt = on ? 'listo' : 'server caído · reintentando';
    if ($('stat').textContent !== txt) $('stat').textContent = txt;
    if (on && was !== true) {
      Settings.sync().then(r => { if (r === 'pulled') applyAll('remote'); });
      applyWindow(S().win, true);
      lastOpacity = -1; applyOpacity(S().opacity);
    }
  }
  let checking = false;
  async function health() {
    if (checking) return;
    checking = true;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 2000);
    try {
      const r = await fetch(SERVER + '/health', {signal: ctl.signal, cache: 'no-store'});
      const j = await r.json();
      setOnline(r.ok && j.ok === true && j.server === 'resyst-vk');
      if (j.leds && (j.leds.caps !== state.leds.caps || j.leds.num !== state.leds.num)) {
        state.leds = j.leds;
        const html = (j.leds.caps ? '<span class="chip">⇪ CAPS FÍSICO</span>' : '')
                   + (j.leds.num ? '<span class="chip">NUM</span>' : '');
        const box = $('leds');
        if (box.innerHTML !== html) box.innerHTML = html;
      }
      const cls = j.focus && j.focus.class ? String(j.focus.class).toLowerCase() : '';
      if (cls && cls !== 'resystvk') onFocusClass(cls);
    } catch (_) {
      setOnline(false);
    } finally { clearTimeout(t); checking = false; }
  }

  // ── perfiles: cambio en vivo ─────────────────────────────────────────
  // baseProfile = último perfil elegido a mano; el modo automático vuelve a él al salir de una app asociada.
  let baseProfile = Settings.active();
  let autoProfile = null;   // perfil puesto por el modo automático (o null)

  // Solo reacciona cuando CAMBIA la app enfocada: si eliges un perfil a mano dentro de una app
  // asociada a otro, tu elección se respeta hasta que cambies de ventana.
  function onFocusClass(cls) {
    if (cls === state.focusClass) return;
    state.focusClass = cls;
    if (!Settings.autoEnabled()) return;
    const want = Settings.profileForApp(cls) || baseProfile;
    if (want && want !== Settings.active()) {
      autoProfile = want === baseProfile ? null : want;
      switchProfile(want, {auto: true});
    } else if (want === Settings.active()) {
      const next = want === baseProfile ? null : want;
      if (next !== autoProfile) { autoProfile = next; paintProfileButton(); }
    }
  }

  function switchProfile(id, opts) {
    opts = opts || {};
    if (!opts.auto) { baseProfile = id; autoProfile = null; }
    if (!Settings.activate(id)) { paintProfileButton(); return false; }
    return true;
  }

  let toastTimer = 0;
  function toast(extra) {
    const p = Settings.profile();
    const t = $('toast');
    t.innerHTML = '<span class="ti">' + escapeHtml(p.icon) + '</span><span>' + escapeHtml(p.name)
      + '</span><small>' + escapeHtml(extra || (autoProfile ? 'perfil · auto' : 'perfil')) + '</small>';
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1100);
  }

  function paintProfileButton() {
    const p = Settings.profile();
    const b = $('btnProfile');
    b.querySelector('.pi').textContent = p.icon;
    b.querySelector('.pn').textContent = p.name;
    b.querySelector('.auto').hidden = !autoProfile;
    b.title = 'Perfil activo: ' + p.name + (autoProfile ? ' (automático por app)' : '') + ' · clic para cambiar';
  }

  // ── apariencia + ventana: aplicar todo lo del perfil activo ──────────
  let appliedWin = '';
  let lastOpacity = -1;
  function applyAll(reason) {
    const s = S();
    VK.Look.apply(s);
    VK.Sound.configure({pack: s.soundPack, volume: s.volume});
    if (structureSig() !== builtSig) build(); else render();
    paintProfileButton();
    applyOpacity(s.opacity);
    applyWindow(s.win);
    if (reason === 'profile') toast();
    if (VK.PrefsUI && VK.PrefsUI.isOpen()) VK.PrefsUI.refresh();
    if (VK.Macros && VK.Macros.isOpen()) VK.Macros.refresh();
  }

  function applyWindow(win, force) {
    const sig = JSON.stringify(win);
    if (sig === appliedWin && !force) return;
    appliedWin = sig;
    const body = win.anchor === 'free' ? {x: win.x, y: win.y, size: win.size}
                                      : {anchor: win.anchor, size: win.size, screen: win.screen};
    api('/window', body).then(r => { if (!r.ok && !r.offline) showError('ventana: ' + r.error); });
  }

  async function applyOpacity(op) {
    if (Math.abs(op - lastOpacity) < 0.02) return;
    lastOpacity = op;
    const r = op >= 0.999 ? await api('/unopacity', {}) : await api('/opacity', {op});
    // respaldo si el server no puede (sin compositor / sin ventana): opacidad del documento
    document.body.style.opacity = r.ok || op >= 0.999 ? '' : String(Math.max(0.35, op));
  }

  Settings.on('change', ev => {
    if (ev.kind === 'profile') applyAll('profile');
    else if (ev.kind === 'remote') { baseProfile = Settings.active(); autoProfile = null; applyAll('remote'); }
    else if (ev.kind === 'macros') { if (structureSig() !== builtSig) build(); }
    else if (ev.kind === 'setting') applyAll('setting');
    else paintProfileButton();
  });

  // ── arrastre de la ventana por el asa ⠿ ──────────────────────────────
  (() => {
    const grip = $('grip');
    let drag = null;
    grip.addEventListener('pointerdown', async e => {
      e.preventDefault();
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      grip.classList.add('dragging');
      drag = {sx: e.screenX, sy: e.screenY, rect: null, last: 0, x: 0, y: 0, pending: null, moved: false};
      const r = await api('/window', null, 'GET');
      if (drag && r.ok && r.rect) drag.rect = r.rect;
    });
    grip.addEventListener('pointermove', e => {
      if (!drag || !drag.rect) return;
      // screenX/Y: la ventana se mueve bajo el puntero, así que se mide en coordenadas de pantalla
      const dx = e.screenX - drag.sx, dy = e.screenY - drag.sy;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 4) return;
      drag.moved = true;
      drag.x = drag.rect.x + dx; drag.y = drag.rect.y + dy;
      const now = performance.now();
      if (now - drag.last > 45 && !drag.pending) {
        drag.last = now;
        drag.pending = api('/window', {x: drag.x, y: drag.y}).finally(() => { if (drag) drag.pending = null; });
      }
    });
    const end = async () => {
      if (!drag) return;
      const d = drag; drag = null;
      grip.classList.remove('dragging');
      if (!d.moved || !d.rect) return;
      if (d.pending) await d.pending;
      const r = await api('/window', {x: d.x, y: d.y});
      if (r.ok && r.rect) {
        const win = {screen: r.screen, anchor: 'free', size: S().win.size, x: r.rect.x, y: r.rect.y};
        appliedWin = JSON.stringify(Settings.sanitizeProfile({win}).win);
        Settings.set({win});
      }
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  })();

  // ── atajos globales: el server reenvía /profile como evento (long-poll) ──
  async function eventLoop() {
    let since = -1;
    for (;;) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 26000);
        const url = SERVER + '/events?since=' + Math.max(0, since) + '&wait=' + (since < 0 ? 0 : 20);
        const r = await fetch(url, {cache: 'no-store', signal: ctl.signal});
        clearTimeout(t);
        const j = await r.json();
        if (since >= 0) {
          for (const ev of j.events || []) {
            if (ev.type === 'profile') {
              const id = Settings.resolve(ev.id);
              if (id) { if (!switchProfile(id)) toast(); }
              else showError('perfil desconocido: ' + ev.id);
            } else if (ev.type === 'prefs') {
              Settings.sync().then(res => { if (res === 'pulled') applyAll('remote'); });
            }
          }
        }
        since = j.seq;
      } catch (_) {
        await new Promise(res => setTimeout(res, 3000));
      }
    }
  }

  // ── menú de perfiles (barra) ─────────────────────────────────────────
  const profMenu = $('profMenu');
  function openProfMenu() {
    const items = Settings.profiles().map((p, i) =>
      '<button type="button" role="menuitemradio" aria-checked="' + (p.id === Settings.active()) + '" data-p="' + escapeHtml(p.id) + '"'
      + (p.id === Settings.active() ? ' class="on"' : '') + '><span class="pi">' + escapeHtml(p.icon) + '</span>'
      + escapeHtml(p.name) + '<span class="hint">' + (p.apps.length ? p.apps.length + ' app' + (p.apps.length > 1 ? 's' : '') : (i + 1)) + '</span></button>').join('');
    profMenu.innerHTML = items + '<hr>'
      + '<button type="button" role="menuitemcheckbox" aria-checked="' + Settings.autoEnabled() + '" data-act="auto">'
      + '<span class="pi">' + (Settings.autoEnabled() ? '◉' : '○') + '</span>Auto por app<span class="hint">' + escapeHtml(state.focusClass || '') + '</span></button>'
      + '<button type="button" role="menuitem" data-act="manage"><span class="pi">⚙</span>Administrar perfiles…</button>';
    const b = $('btnProfile').getBoundingClientRect();
    profMenu.hidden = false;
    profMenu.style.left = Math.max(6, Math.min(innerWidth - profMenu.offsetWidth - 6, b.right - profMenu.offsetWidth)) + 'px';
    $('btnProfile').setAttribute('aria-expanded', 'true');
    const first = profMenu.querySelector('.on') || profMenu.querySelector('button');
    if (first) first.focus();
  }
  function closeProfMenu() { profMenu.hidden = true; $('btnProfile').setAttribute('aria-expanded', 'false'); }
  $('btnProfile').addEventListener('click', e => { e.stopPropagation(); profMenu.hidden ? openProfMenu() : closeProfMenu(); });
  profMenu.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.p) { closeProfMenu(); if (!switchProfile(b.dataset.p)) toast(); }
    else if (b.dataset.act === 'auto') { Settings.setAuto(!Settings.autoEnabled()); if (!Settings.autoEnabled()) { autoProfile = null; paintProfileButton(); } openProfMenu(); }
    else if (b.dataset.act === 'manage') { closeProfMenu(); VK.PrefsUI.open('profiles'); }
  });
  document.addEventListener('pointerdown', e => {
    if (!profMenu.hidden && !profMenu.contains(e.target) && !$('btnProfile').contains(e.target)) closeProfMenu();
  });

  // ── panel emoji ──────────────────────────────────────────────────────
  const emojiWrap = $('emojiWrap');
  VK.EMOJI.mount(emojiWrap);
  let emojiReturn = null;   // overlay a restaurar si el emoji se eligió durante una composición
  VK.emojiPick = e => {
    if (Compose.active && Compose.kind === 'text') { Compose.append(e); closeEmoji(); return; }
    enqueue('/paste', {text: e});
    word = ''; renderSuggest([]);
  };
  function closeEmoji() { emojiWrap.hidden = true; $('btnEmoji').classList.remove('on'); if (emojiReturn) emojiReturn = null; }
  $('btnEmoji').addEventListener('click', () => {
    const open = emojiWrap.hidden;
    emojiWrap.hidden = !open;
    $('btnEmoji').classList.toggle('on', open);
    if (open) emojiWrap.querySelector('.emoji-body').focus();
  });
  emojiWrap.addEventListener('click', e => {
    if (e.target === emojiWrap || e.target.id === 'emojiPanel') closeEmoji();
  });
  $('btnCfg').addEventListener('click', () => VK.PrefsUI.isOpen() ? VK.PrefsUI.close() : VK.PrefsUI.open());
  $('btnMacros').addEventListener('click', () => VK.Macros.isOpen() ? VK.Macros.close() : VK.Macros.open());
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (LP.isOpen()) LP.close('escape');
    else if (!profMenu.hidden) closeProfMenu();
    else if (!emojiWrap.hidden) closeEmoji();
    else if (Compose.active) Compose.finish(null);
    else if (VK.Macros.isOpen()) VK.Macros.close();
    else if (VK.PrefsUI.isOpen()) VK.PrefsUI.close();
  });

  // ── API para los módulos de UI (macros.js, prefs-ui.js) ──────────────
  VK.App = {
    SERVER, api, enqueue, showError, toast, applyAll, applyWindow, switchProfile, Compose, state,
    focusClass: () => state.focusClass,
    TYPE_DELAY,
    // Edita con el teclado ocultando el panel que lo tapa; vuelve a mostrarlo al terminar.
    async compose(overlay, opts) {
      const wrap = typeof overlay === 'string' ? $(overlay) : overlay;
      if (wrap) wrap.hidden = true;
      const v = await Compose.start(opts);
      if (wrap) wrap.hidden = false;
      return v;
    },
  };

  // ── init ─────────────────────────────────────────────────────────────
  VK.Look.apply(S());
  VK.Sound.configure({pack: S().soundPack, volume: S().volume});
  build();
  paintProfileButton();
  health();
  setInterval(health, 2000);
  eventLoop();
})();
