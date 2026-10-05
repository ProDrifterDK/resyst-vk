/* Resyst VK — capa de ajustes v4: perfiles + biblioteca de macros + sincronía con el server.

   Modelo:
     store = { v:4, rev, active, order:[ids], profiles:{id:{name, icon, s:{…ajustes…}}},
               macros:[{id,label,kind:'text'|'keys',body}], pinned:[macroId] }
   - Los ajustes visuales/de comportamiento viven DENTRO del perfil activo: editar = editar el perfil.
   - Macros y fila personal son globales (son "tuyos", no de un modo).
   - localStorage es la caché rápida; el server (~/.config/resyst-vk/prefs.json) es la copia
     durable: el perfil de Chrome vive en /tmp y se borra al reiniciar el equipo.
   - Migración v3: 'resyst-vk.settings' (plano) → perfil "Noche" con esos valores. */
'use strict';
window.VK = window.VK || {};

VK.Settings = (() => {
  const { lsGet, lsSet, isHex, clamp, debounce } = VK.util;

  const PROFILE_DEFAULTS = {
    theme: 'lab', accent: null,
    shape: 'soft', cap: 'raised', press: 'sink', font: 'brand', density: 'normal', subLegends: true,
    scale: 1, opacity: 1,
    sound: false, soundPack: 'click', volume: 0.7,
    repeatStart: 380, suggest: true, lang: 'es',
    topRow: 'accents',
    // mantener pulsado → popup de variantes (é, ñ, ¿, ≤…)
    longPress: true, lpDelay: 400, lpRelease: 'first', lpSize: 'm', lpHint: true,
    win: {screen: 0, anchor: 'br', size: 'm'},
  };

  // Validadores: cualquier valor importado o del server pasa por aquí antes de aplicarse.
  const ENUMS = {
    theme: () => Object.keys(VK.THEMES || {lab: 1}),
    shape: ['square', 'soft', 'round'], cap: ['raised', 'flat', 'outline'],
    press: ['sink', 'glow', 'ripple', 'subtle'], font: ['brand', 'tech', 'human'],
    density: ['tight', 'normal', 'airy'], soundPack: ['click', 'thock', 'type', 'bubble'],
    lang: ['es', 'en'], topRow: ['accents', 'personal', 'none'],
    lpRelease: ['first', 'stay'], lpSize: ['s', 'm', 'l'],
  };
  const ANCHORS = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];
  const SIZES = ['s', 'm', 'l', 'wide'];

  function sanitizeProfile(raw) {
    const s = Object.assign({}, PROFILE_DEFAULTS, raw && typeof raw === 'object' ? raw : {});
    for (const [k, allowed] of Object.entries(ENUMS)) {
      const list = typeof allowed === 'function' ? allowed() : allowed;
      if (!list.includes(s[k])) s[k] = PROFILE_DEFAULTS[k];
    }
    s.accent = isHex(s.accent) ? s.accent.toLowerCase() : null;
    s.scale = clamp(Number(s.scale) || 1, 0.8, 1.3);
    s.opacity = clamp(Number(s.opacity) || 1, 0.35, 1);
    s.volume = clamp(Number(s.volume), 0, 1); if (Number.isNaN(s.volume)) s.volume = 0.7;
    s.repeatStart = clamp(parseInt(s.repeatStart, 10) || 380, 150, 900);
    s.lpDelay = clamp(parseInt(s.lpDelay, 10) || 400, 200, 1200);
    for (const b of ['sound', 'suggest', 'subLegends', 'longPress', 'lpHint']) s[b] = !!s[b];
    const w = s.win && typeof s.win === 'object' ? s.win : {};
    s.win = {
      screen: clamp(parseInt(w.screen, 10) || 0, 0, 7),
      anchor: ANCHORS.includes(w.anchor) || w.anchor === 'free' ? w.anchor : 'br',
      size: SIZES.includes(w.size) ? w.size : 'm',
    };
    if (s.win.anchor === 'free') {
      s.win.x = clamp(parseInt(w.x, 10) || 0, -10000, 20000);
      s.win.y = clamp(parseInt(w.y, 10) || 0, -10000, 20000);
    }
    return s;
  }
  const sanitizeApps = a => (Array.isArray(a) ? a : [])
    .map(x => String(x || '').trim().toLowerCase().slice(0, 60)).filter((x, i, arr) => x && arr.indexOf(x) === i).slice(0, 12);

  const CHORD_RE = /^[A-Za-z0-9_]{1,32}(\+[A-Za-z0-9_]{1,32}){0,4}$/;
  const validChords = body => {
    const parts = String(body || '').trim().split(/\s+/);
    return parts.length >= 1 && parts.length <= 8 && parts.every(p => CHORD_RE.test(p));
  };
  function sanitizeMacro(m) {
    if (!m || typeof m !== 'object') return null;
    const kind = m.kind === 'keys' ? 'keys' : 'text';
    const label = String(m.label || '').trim().slice(0, 24);
    const body = String(m.body || '').slice(0, 2000);
    if (!label || !body) return null;
    if (kind === 'keys' && !validChords(body)) return null;
    const id = /^[a-z0-9_-]{1,40}$/i.test(m.id || '') ? m.id : newId('m');
    return {id, label, kind, body: kind === 'keys' ? body.trim().split(/\s+/).join(' ') : body};
  }

  let seq = 0;
  function newId(prefix) { return prefix + Date.now().toString(36) + (seq++).toString(36); }

  const SEED_MACROS = [
    {id: 'copy', label: 'Copiar', kind: 'keys', body: 'ctrl+c'},
    {id: 'cut', label: 'Cortar', kind: 'keys', body: 'ctrl+x'},
    {id: 'paste', label: 'Pegar', kind: 'keys', body: 'ctrl+v'},
    {id: 'undo', label: 'Deshacer', kind: 'keys', body: 'ctrl+z'},
    {id: 'redo', label: 'Rehacer', kind: 'keys', body: 'ctrl+shift+z'},
    {id: 'all', label: 'Todo', kind: 'keys', body: 'ctrl+a'},
    {id: 'save', label: 'Guardar', kind: 'keys', body: 'ctrl+s'},
    {id: 'find', label: 'Buscar', kind: 'keys', body: 'ctrl+f'},
    {id: 'wordl', label: '⌫ palabra', kind: 'keys', body: 'ctrl+BackSpace'},
    {id: 'tab', label: 'Nueva pestaña', kind: 'keys', body: 'ctrl+t'},
    {id: 'shrug', label: '¯\\_(ツ)_/¯', kind: 'text', body: '¯\\_(ツ)_/¯'},
    {id: 'today', label: 'Fecha', kind: 'text', body: '{fecha}'},
    {id: 'gg', label: 'gg wp', kind: 'text', body: 'gg wp '},
  ];
  const SEED_PINNED = ['copy', 'cut', 'paste', 'undo', 'redo', 'all', 'save', 'find', 'wordl'];

  function seedProfiles(base) {
    const P = (name, icon, s) => ({name, icon, apps: [], s: sanitizeProfile(Object.assign({}, base, s))});
    return {
      order: ['noche', 'dia', 'juego', 'escritura'],
      profiles: {
        noche: P('Noche', '☾', {}),
        dia: P('Día', '☀', {theme: 'paper', accent: null}),
        juego: P('Juego', '◆', {theme: 'arcade', accent: null, topRow: 'none', suggest: false, sound: false,
          press: 'glow', cap: 'flat', opacity: 0.88, win: {screen: 0, anchor: 'br', size: 's'}}),
        escritura: P('Escritura', '✎', {theme: 'slate', accent: null, font: 'human', suggest: true,
          topRow: 'accents', sound: true, soundPack: 'thock', subLegends: false,
          win: {screen: 0, anchor: 'bc', size: 'l'}}),
      },
    };
  }

  // v3 → v4: el perfil activo ("Noche") queda EXACTAMENTE con los ajustes que el usuario tenía;
  // los demás perfiles heredan sus preferencias neutras (escala, idioma, auto-repetición…).
  function freshStore(v3) {
    const base = v3 ? sanitizeProfile(v3) : sanitizeProfile({});
    const {order, profiles} = seedProfiles(base);
    return {v: 4, rev: v3 ? 1 : 0, active: 'noche', auto: true, order, profiles,
            macros: SEED_MACROS.map(m => Object.assign({}, m)), pinned: SEED_PINNED.slice()};
  }

  function sanitizeStore(raw) {
    if (!raw || typeof raw !== 'object' || raw.v !== 4 || !raw.profiles) return null;
    const profiles = {};
    const order = [];
    for (const id of Array.isArray(raw.order) ? raw.order : Object.keys(raw.profiles)) {
      const p = raw.profiles[id];
      if (!p || order.includes(id) || !/^[a-z0-9_-]{1,40}$/i.test(id)) continue;
      profiles[id] = {name: String(p.name || id).slice(0, 18), icon: String(p.icon || '✦').slice(0, 2),
                      apps: sanitizeApps(p.apps), s: sanitizeProfile(p.s)};
      order.push(id);
    }
    if (!order.length) return null;
    const macros = (Array.isArray(raw.macros) ? raw.macros : []).map(sanitizeMacro).filter(Boolean).slice(0, 120);
    const ids = new Set(macros.map(m => m.id));
    const pinned = (Array.isArray(raw.pinned) ? raw.pinned : []).filter((id, i, a) => ids.has(id) && a.indexOf(id) === i);
    // una app pertenece a un solo perfil (el primero que la reclama)
    const seen = new Set();
    for (const id of order) {
      profiles[id].apps = profiles[id].apps.filter(a => !seen.has(a) && seen.add(a));
    }
    return {v: 4, rev: Number(raw.rev) || 0, active: profiles[raw.active] ? raw.active : order[0],
            auto: raw.auto !== false, order, profiles, macros, pinned};
  }

  // ── estado vivo ──────────────────────────────────────────────────────
  const bus = new VK.util.Evt();
  let store = sanitizeStore(lsGet('store', null));
  if (!store) {
    const v3 = lsGet('settings', null);
    store = freshStore(v3 && typeof v3 === 'object' ? v3 : null);
    lsSet('store', store);
  }

  let server = null;          // URL base del server (lo define main.js)
  let dirty = false;          // hay cambios locales no confirmados por el server

  function persist(silent) {
    store.rev = Date.now();
    lsSet('store', store);
    dirty = true;
    pushSoon();
    if (!silent) bus.emit('change', {kind: 'store'});
  }

  async function push() {
    if (!server || !dirty) return false;
    const body = JSON.stringify({prefs: store});
    try {
      const r = await fetch(server + '/prefs', {method: 'POST', headers: {'Content-Type': 'application/json'}, body});
      if (r.ok) { dirty = false; return true; }
    } catch (_) {}
    return false;
  }
  const pushSoon = debounce(push, 400);

  // Al arrancar (y al volver el server): el más reciente gana.
  async function sync() {
    if (!server) return 'no-server';
    try {
      const r = await fetch(server + '/prefs', {cache: 'no-store'});
      const j = await r.json();
      const remote = j && j.ok ? sanitizeStore(j.prefs) : null;
      if (remote && remote.rev > store.rev) {
        store = remote;
        lsSet('store', store);
        dirty = false;
        bus.emit('change', {kind: 'remote'});
        return 'pulled';
      }
      if (!remote || store.rev > remote.rev) { dirty = true; await push(); return 'pushed'; }
      dirty = false;
      return 'same';
    } catch (_) { return 'offline'; }
  }

  // ── API pública ──────────────────────────────────────────────────────
  const api = {
    PROFILE_DEFAULTS, SIZES, ANCHORS, CHORD_RE, validChords, sanitizeProfile, sanitizeMacro, sanitizeStore, freshStore,
    on: (ev, fn) => bus.on(ev, fn),
    setServer(url) { server = url; },
    sync, push,
    // ajustes del perfil activo
    get() { return store.profiles[store.active].s; },
    set(patch) {
      const p = store.profiles[store.active];
      p.s = sanitizeProfile(Object.assign({}, p.s, patch));
      persist(true);
      bus.emit('change', {kind: 'setting', keys: Object.keys(patch)});
    },
    // perfiles
    store: () => store,
    active: () => store.active,
    profile: id => store.profiles[id || store.active],
    profiles: () => store.order.map(id => Object.assign({id}, store.profiles[id])),
    activate(id) {
      if (!store.profiles[id] || id === store.active) return false;
      store.active = id;
      persist(true);
      bus.emit('change', {kind: 'profile'});
      return true;
    },
    // id = id exacto, nombre (sin mayúsculas/acentos), 'next' o 'prev'
    resolve(ref) {
      const r = String(ref || '').trim().toLowerCase();
      const i = store.order.indexOf(store.active);
      if (r === 'next') return store.order[(i + 1) % store.order.length];
      if (r === 'prev') return store.order[(i - 1 + store.order.length) % store.order.length];
      if (store.profiles[r]) return r;
      const fold = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      return store.order.find(id => fold(store.profiles[id].name) === fold(r)) || null;
    },
    duplicate(id) {
      const src = store.profiles[id || store.active];
      if (!src || store.order.length >= 12) return null;
      const nid = newId('p');
      let name = src.name + ' 2';
      for (let n = 2; store.order.some(x => store.profiles[x].name === name); n++) name = src.name + ' ' + n;
      store.profiles[nid] = {name: name.slice(0, 18), icon: src.icon, apps: [],
                             s: sanitizeProfile(JSON.parse(JSON.stringify(src.s)))};
      store.order.splice(store.order.indexOf(id || store.active) + 1, 0, nid);
      store.active = nid;
      persist(true);
      bus.emit('change', {kind: 'profile'});
      return nid;
    },
    rename(id, name, icon) {
      const p = store.profiles[id];
      const n = String(name || '').trim().slice(0, 18);
      if (!p || !n) return false;
      p.name = n;
      if (icon) p.icon = String(icon).slice(0, 2);
      persist();
      return true;
    },
    remove(id) {
      if (!store.profiles[id] || store.order.length <= 1) return false;
      store.order = store.order.filter(x => x !== id);
      delete store.profiles[id];
      if (store.active === id) store.active = store.order[0];
      persist(true);
      bus.emit('change', {kind: 'profile'});
      return true;
    },
    move(id, delta) {
      const i = store.order.indexOf(id), j = i + delta;
      if (i < 0 || j < 0 || j >= store.order.length) return false;
      [store.order[i], store.order[j]] = [store.order[j], store.order[i]];
      persist();
      return true;
    },
    // cambio automático por app enfocada (WM_CLASS)
    autoEnabled: () => store.auto !== false,
    setAuto(on) { store.auto = !!on; persist(); },
    profileForApp(cls) {
      const c = String(cls || '').toLowerCase();
      return c ? store.order.find(id => store.profiles[id].apps.includes(c)) || null : null;
    },
    assignApp(id, cls) {
      const c = sanitizeApps([cls])[0];
      if (!c || !store.profiles[id]) return false;
      for (const pid of store.order) store.profiles[pid].apps = store.profiles[pid].apps.filter(a => a !== c);
      store.profiles[id].apps = sanitizeApps(store.profiles[id].apps.concat(c));
      persist();
      return true;
    },
    unassignApp(id, cls) {
      const p = store.profiles[id];
      if (!p) return false;
      p.apps = p.apps.filter(a => a !== cls);
      persist();
      return true;
    },
    // macros
    macros: () => store.macros,
    macro: id => store.macros.find(m => m.id === id) || null,
    pinned: () => store.pinned.map(id => store.macros.find(m => m.id === id)).filter(Boolean),
    isPinned: id => store.pinned.includes(id),
    saveMacro(m) {
      const clean = sanitizeMacro(m);
      if (!clean) return null;
      const i = store.macros.findIndex(x => x.id === clean.id);
      if (i >= 0) store.macros[i] = clean; else store.macros.push(clean);
      persist(true);
      bus.emit('change', {kind: 'macros'});
      return clean;
    },
    deleteMacro(id) {
      store.macros = store.macros.filter(m => m.id !== id);
      store.pinned = store.pinned.filter(x => x !== id);
      persist(true);
      bus.emit('change', {kind: 'macros'});
    },
    togglePin(id) {
      if (store.pinned.includes(id)) store.pinned = store.pinned.filter(x => x !== id);
      else if (store.pinned.length < VK.Layout.PERSONAL_MAX) store.pinned.push(id);
      else return false;
      persist(true);
      bus.emit('change', {kind: 'macros'});
      return true;
    },
    movePin(id, delta) {
      const i = store.pinned.indexOf(id), j = i + delta;
      if (i < 0 || j < 0 || j >= store.pinned.length) return false;
      [store.pinned[i], store.pinned[j]] = [store.pinned[j], store.pinned[i]];
      persist(true);
      bus.emit('change', {kind: 'macros'});
      return true;
    },
    // respaldo
    exportJSON: () => JSON.stringify(Object.assign({format: 'resyst-vk/4'}, store), null, 2),
    importJSON(text) {
      const parsed = JSON.parse(text);
      let next = sanitizeStore(parsed);
      if (!next) {
        // respaldo v3: dump de claves localStorage → migrar
        const v3raw = parsed && parsed['resyst-vk.settings'];
        if (!v3raw) throw new Error('formato no reconocido');
        next = freshStore(typeof v3raw === 'string' ? JSON.parse(v3raw) : v3raw);
      }
      store = next;
      persist(true);
      bus.emit('change', {kind: 'remote'});
    },
    reset() {
      store = freshStore(null);
      persist(true);
      bus.emit('change', {kind: 'remote'});
    },
  };
  return api;
})();
