/* Resyst VK — hoja de personalización (pestañas). Cada control escribe en el perfil activo
   vía VK.Settings.set(); main.js aplica en vivo (CSS vars / data-* / server). */
'use strict';
window.VK = window.VK || {};

VK.PrefsUI = (() => {
  const { escapeHtml, contrast } = VK.util;
  const Settings = VK.Settings;
  const $ = id => document.getElementById(id);
  const wrap = $('sheetWrap');
  const rail = $('sheetRail');
  const content = $('sheetContent');
  const ICONS = ['☾', '☀', '◆', '✎', '✦', '⚡', '♫', '☕', '⌘', '◎', '▲', '♥'];

  const TABS = [
    ['profiles', '◐', 'Perfiles'],
    ['look', '◑', 'Apariencia'],
    ['board', '⌨', 'Teclado'],
    ['sound', '♪', 'Sonido'],
    ['window', '▣', 'Ventana'],
    ['backup', '⇅', 'Respaldo'],
  ];
  let tab = 'profiles';
  let monitors = null;

  const s = () => Settings.get();
  const set = patch => Settings.set(patch);
  const seg = (key, options, current) => '<div class="seg" role="radiogroup" data-seg="' + key + '">'
    + options.map(([v, t, title]) => '<button type="button" role="radio" aria-checked="' + (String(v) === String(current)) + '" data-v="' + escapeHtml(String(v)) + '"'
      + (String(v) === String(current) ? ' class="on"' : '') + (title ? ' title="' + escapeHtml(title) + '"' : '') + '>' + t + '</button>').join('') + '</div>';
  const row = (label, sub, control) => '<div class="row"><span class="lbl">' + label + (sub ? '<small>' + sub + '</small>' : '') + '</span>' + control + '</div>';

  // ── espécimen en vivo (mismas clases que el teclado real) ─────────────
  function specimen() {
    const k = (w, cls, label, extra) => '<span class="key ' + cls + '" style="grid-column:span ' + w + ';grid-row:' + (extra || 1) + '"><span class="lg">' + label + '</span></span>';
    const sub = (w, cls, big, small, r) => '<span class="key ' + cls + '" style="grid-column:span ' + w + ';grid-row:' + r + '"><span class="lg">' + big + '</span><span class="sm">' + small + '</span></span>';
    return '<div class="specimen" aria-hidden="true">'
      + k(3, 'fn', 'Esc') + k(2, 'accent', 'á') + sub(2, '', '1', '!', 1) + sub(2, '', '2', '"', 1) + k(2, '', 'q') + k(2, '', 'w') + k(2, 'down', 'e') + k(2, '', 'r')
      + k(2, 'macro', 'Copiar') + k(2, 'macro', 'Pegar') + k(3, 'mod fn armed', 'Ctrl') + k(3, 'fn glyph', '⌫') + k(3, 'layer-toggle fn', '123')
      + k(4, 'mod fn locked', '⇪', 2) + k(2, '', 'a', 2) + k(2, '', 's', 2) + k(2, '', 'd', 2) + k(10, 'space', 'es · ' + escapeHtml(Settings.profile().name), 2)
      + k(2, 'glyph', '←', 2) + k(2, 'glyph', '→', 2) + k(6, 'fn glyph', '⏎', 2)
      + '</div>';
  }

  // ── pestañas ─────────────────────────────────────────────────────────
  function tabProfiles() {
    const act = Settings.active();
    const focus = VK.App.focusClass();
    const focusOwner = focus ? Settings.profileForApp(focus) : null;
    const list = Settings.profiles().map((p, i, all) => '<div class="prof' + (p.id === act ? ' on' : '') + '" data-pid="' + escapeHtml(p.id) + '">'
      + '<button type="button" class="btn picon" data-pa="icon" title="Cambiar ícono" aria-label="Ícono de ' + escapeHtml(p.name) + '">' + escapeHtml(p.icon) + '</button>'
      + '<button type="button" class="field" data-pa="rename" aria-label="Renombrar ' + escapeHtml(p.name) + '">' + escapeHtml(p.name)
      + (p.apps.length ? '<span class="ph" style="font-style:normal;margin-left:auto">⌁ ' + escapeHtml(p.apps.join(', ')) + '</span>' : '') + '</button>'
      + '<span class="hk">' + escapeHtml(p.id) + '</span>'
      + (p.id === act ? '<span class="btn on" aria-current="true">activo</span>' : '<button type="button" class="btn" data-pa="use">Usar</button>')
      + '<button type="button" class="btn" data-pa="up" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button type="button" class="btn" data-pa="down" aria-label="Bajar"' + (i === all.length - 1 ? ' disabled' : '') + '>↓</button>'
      + '<button type="button" class="btn" data-pa="dup" title="Duplicar">⧉</button>'
      + '<button type="button" class="btn danger" data-pa="del" title="Eliminar"' + (all.length <= 1 ? ' disabled' : '') + '>✕</button>'
      + '</div>').join('');
    const apps = Settings.profile().apps;
    return '<p class="note">Un perfil guarda <b>todo</b> lo visual y de comportamiento (tema, acento, teclas, sonido, fila superior, ventana). Editar cualquier ajuste edita el perfil activo.</p>'
      + list
      + row('Cambio automático por app', 'Al enfocar una app asociada se activa su perfil; al salir, vuelve al que elegiste',
            seg('auto', [['1', 'Sí'], ['0', 'No']], Settings.autoEnabled() ? '1' : '0'))
      + row('Apps de «' + escapeHtml(Settings.profile().name) + '»',
            apps.length ? apps.map(a => '<span class="chip" style="margin-right:.2rem">' + escapeHtml(a) + ' <button type="button" class="x" data-unapp="' + escapeHtml(a) + '" aria-label="Quitar ' + escapeHtml(a) + '" style="background:none;border:0;color:inherit;cursor:pointer">✕</button></span>').join('') : 'ninguna todavía',
            focus ? '<button type="button" class="btn" data-assign="' + escapeHtml(focus) + '" title="Última app enfocada (WM_CLASS)">⌁ Asociar «' + escapeHtml(focus) + '»'
              + (focusOwner && focusOwner !== act ? ' (está en ' + escapeHtml(Settings.profile(focusOwner).name) + ')' : '') + '</button>'
                  : '<span class="note">enfoca otra app para asociarla</span>')
      + '<p class="note">Atajos globales: asigna en <i>Preferencias del sistema › Atajos › Personalizados</i> comandos como '
      + '<code>resyst-vk.sh profile next</code> o <code>resyst-vk.sh profile juego</code> (id, nombre, <code>next</code>, <code>prev</code>).</p>';
  }

  function tabLook() {
    const cur = s();
    const pal = VK.Look.palette(cur.theme, cur.accent).vars;
    const cards = Object.entries(VK.THEMES).map(([id, t]) => {
      const v = t.vars;
      return '<button type="button" class="theme-card' + (id === cur.theme ? ' on' : '') + '" data-theme="' + id + '" role="radio" aria-checked="' + (id === cur.theme) + '"'
        + ' style="background:' + v.bg + ';color:' + v.text + '">'
        + '<span class="tc-keys"><i style="background:' + v.key + ';border-color:' + v.edge + '"></i><i style="background:' + v.key + ';border-color:' + v.edge + '"></i>'
        + '<i style="background:' + v.accent + ';border-color:' + v.accent + '"></i><i style="background:' + v.keyMod + ';border-color:' + v.edge + '"></i></span>'
        + '<span>' + escapeHtml(t.label) + '</span></button>';
    }).join('');
    const auto = !cur.accent;
    const sw = '<button type="button" class="swatch auto' + (auto ? ' on' : '') + '" data-accent="" title="Acento del tema" aria-label="Acento del tema" style="background:conic-gradient(' + VK.THEMES[cur.theme].vars.accent + ' 0 50%, ' + VK.THEMES[cur.theme].vars.key + ' 0)"></button>'
      + VK.ACCENTS.map(([hex, name]) => '<button type="button" class="swatch' + (cur.accent === hex ? ' on' : '') + '" data-accent="' + hex + '" title="' + escapeHtml(name) + '" aria-label="' + escapeHtml(name) + '" style="background:' + hex + '"></button>').join('');
    const ratio = contrast(pal.accent, pal.key).toFixed(1);
    const adjusted = cur.accent && pal.accent !== cur.accent;
    return specimen()
      + '<div class="row col"><span class="lbl">Tema</span><div class="theme-cards" role="radiogroup">' + cards + '</div></div>'
      + '<div class="row col"><span class="lbl">Acento<small>' + ratio + ':1 sobre la tecla' + (adjusted ? ' · ajustado para legibilidad (' + cur.accent + ' → ' + pal.accent + ')' : '') + '</small></span>'
      + '<div class="swatches">' + sw + '</div>'
      + '<input type="range" class="hue" id="rgHue" min="0" max="359" step="1" aria-label="Tono del acento propio"></div>'
      + row('Forma', '', seg('shape', [['square', '▢ Recta'], ['soft', '▢ Suave'], ['round', '◯ Redonda']], cur.shape))
      + row('Tecla', '', seg('cap', [['raised', 'Relieve'], ['flat', 'Plana'], ['outline', 'Contorno']], cur.cap))
      + row('Pulsación', 'Cómo responde la tecla al tocarla', seg('press', [['sink', 'Hundir'], ['glow', 'Brillo'], ['ripple', 'Onda'], ['subtle', 'Sutil']], cur.press))
      + row('Tipografía', '', seg('font', [['brand', 'DM Sans'], ['tech', 'Mono'], ['human', 'Fira']], cur.font))
      + row('Densidad', 'Separación entre teclas', seg('density', [['tight', 'Compacta'], ['normal', 'Normal'], ['airy', 'Amplia']], cur.density))
      + row('Leyendas secundarias', 'Símbolo de Shift en la esquina', seg('subLegends', [['1', 'Sí'], ['0', 'No']], cur.subLegends ? '1' : '0'))
      + row('Tamaño de letra', 'Escala del texto de las teclas', '<input type="range" id="rgScale" min="0.8" max="1.3" step="0.05" value="' + cur.scale + '" aria-label="Escala">');
  }

  function tabBoard() {
    const cur = s();
    return row('Fila superior', 'Acentos rápidos · tus macros fijadas (★ en ⌘) · sin fila (tablero compacto)',
               seg('topRow', [['accents', 'Acentos'], ['personal', '★ Personal'], ['none', 'Compacta']], cur.topRow))
      + (cur.topRow === 'personal'
          ? '<div class="row col"><span class="lbl">Orden de la fila personal<small>' + Settings.pinned().length + '/' + VK.Layout.PERSONAL_MAX + ' · se reparten las 56 columnas</small></span>'
            + '<div class="seg" style="flex-wrap:wrap">' + (Settings.pinned().map((m, i, a) =>
              '<span class="btn" style="display:inline-flex;gap:.25rem;align-items:center">'
              + '<button type="button" class="x" data-mv="' + escapeHtml(m.id) + ':-1" aria-label="Mover ' + escapeHtml(m.label) + ' a la izquierda"' + (i === 0 ? ' disabled' : '') + ' style="background:none;border:0;color:inherit;cursor:pointer">‹</button>'
              + escapeHtml(m.label)
              + '<button type="button" class="x" data-mv="' + escapeHtml(m.id) + ':1" aria-label="Mover ' + escapeHtml(m.label) + ' a la derecha"' + (i === a.length - 1 ? ' disabled' : '') + ' style="background:none;border:0;color:inherit;cursor:pointer">›</button></span>').join('')
              || '<span class="note">vacía: abre ⌘ y toca ☆ en las macros que quieras aquí</span>')
            + '<button type="button" class="btn" data-open="macros">⌘ Elegir macros…</button></div></div>'
          : '')
      + row('Sugerencias de palabra', 'Predicción offline (lexicón local)', seg('suggest', [['1', 'Sí'], ['0', 'No']], cur.suggest ? '1' : '0'))
      + row('Idioma de sugerencias', '', seg('lang', [['es', 'Español'], ['en', 'English']], cur.lang))
      + row('Inicio de auto-repetición', '<span id="repVal">' + cur.repeatStart + ' ms</span> · al mantener ⌫, Supr o flechas',
            '<input type="range" id="rgRepeat" min="150" max="900" step="50" value="' + cur.repeatStart + '" aria-label="Retardo de auto-repetición">')
      + '<h3 class="sec">Mantener pulsado · variantes</h3>'
      + row('Variantes al mantener', 'Mantén <b>e</b> → é è ê ë · <b>n</b> → ñ · <b>?</b> → ¿ · <b>3</b> → # · ³ …',
            seg('longPress', [['1', 'Sí'], ['0', 'No']], cur.longPress ? '1' : '0'))
      + (cur.longPress
          ? row('Tiempo para abrir', '<span id="lpVal">' + cur.lpDelay + ' ms</span> · un toque más corto escribe la letra normal',
                '<input type="range" id="rgLpDelay" min="200" max="1200" step="50" value="' + cur.lpDelay + '" aria-label="Tiempo de mantener para abrir variantes">')
            + row('Al soltar sin moverte', cur.lpRelease === 'first'
                    ? 'Escribe la primera variante (é, ñ, ¿): mantener-y-soltar = acento'
                    : 'El menú queda abierto para tocar la variante; toca fuera para cancelar',
                  seg('lpRelease', [['first', 'Escribe la 1ª'], ['stay', 'Queda abierto']], cur.lpRelease))
            + row('Tamaño del menú', '', seg('lpSize', [['s', 'Chico'], ['m', 'Medio'], ['l', 'Grande']], cur.lpSize))
            + row('Marcar teclas con variantes', 'Punto ' + '<span style="color:var(--accent)">•</span> en la esquina de la tecla',
                  seg('lpHint', [['1', 'Sí'], ['0', 'No']], cur.lpHint ? '1' : '0'))
          : '');
  }

  function tabSound() {
    const cur = s();
    return row('Sonido de tecla', 'Sintetizado (WebAudio), sin archivos', seg('sound', [['1', 'Sí'], ['0', 'No']], cur.sound ? '1' : '0'))
      + row('Pack', 'Toca para escucharlo', seg('soundPack', [['click', 'Click'], ['thock', 'Thock'], ['type', 'Máquina'], ['bubble', 'Burbuja']], cur.soundPack))
      + row('Volumen', '<span id="volVal">' + Math.round(cur.volume * 100) + '%</span>',
            '<input type="range" id="rgVolume" min="0" max="1" step="0.05" value="' + cur.volume + '" aria-label="Volumen">');
  }

  function tabWindow() {
    const w = s().win;
    const mons = monitors || [{x: 0, y: 0, w: 1920, h: 1080}];
    const anchors = ['tl', 'tc', 'tr', 'bl', 'bc', 'br'];
    const names = {tl: 'arriba izquierda', tc: 'arriba centro', tr: 'arriba derecha', bl: 'abajo izquierda', bc: 'abajo centro', br: 'abajo derecha'};
    return row('Posición', w.anchor === 'free' ? 'Libre (arrastrada con ⠿) · elige un ancla para volver a una esquina' : 'Esquina o borde del monitor',
               '<div class="anchor-grid" role="radiogroup" aria-label="Ancla">' + anchors.map(a =>
                 '<button type="button" role="radio" data-a="' + a + '" aria-label="' + names[a] + '" aria-checked="' + (w.anchor === a) + '"' + (w.anchor === a ? ' class="on"' : '') + '></button>').join('') + '</div>')
      + row('Monitor', mons.length > 1 ? mons.length + ' monitores detectados' : 'un monitor detectado',
            seg('screen', mons.map((m, i) => [i, (i + 1) + ' · ' + m.w + '×' + m.h]), w.screen))
      + row('Tamaño', '', seg('size', [['s', 'Chico'], ['m', 'Medio'], ['l', 'Grande'], ['wide', 'Ancho']], w.size))
      + row('Opacidad de la ventana', '<span id="opVal">' + Math.round(s().opacity * 100) + '%</span> · real (compositor KWin)',
            '<input type="range" id="rgOpacity" min="0.35" max="1" step="0.05" value="' + s().opacity + '" aria-label="Opacidad">')
      + '<p class="note">Arrastra el asa <b>⠿</b> de la barra para mover el teclado: la posición queda guardada en el perfil activo.</p>';
  }

  function tabBackup() {
    const n = Settings.profiles().length, m = Settings.macros().length;
    return row('Copia durable', 'El perfil de Chrome vive en /tmp; tus ajustes se guardan también en <code>~/.config/resyst-vk/prefs.json</code>',
               '<span class="chip">' + n + ' perfiles · ' + m + ' macros</span>')
      + row('Exportar', 'Descarga un JSON con perfiles, macros y fila personal', '<button type="button" class="btn" data-bk="export">⇩ Exportar</button>')
      + row('Importar', 'Acepta respaldos v4 y v3', '<button type="button" class="btn" data-bk="import">⇧ Importar</button>')
      + row('Restablecer', 'Vuelve a los 4 perfiles y macros de fábrica', '<button type="button" class="btn danger" data-bk="reset">' + (resetArmed ? '¿Seguro? toca otra vez' : 'Restablecer') + '</button>');
  }
  let resetArmed = false;

  const RENDER = {profiles: tabProfiles, look: tabLook, board: tabBoard, sound: tabSound, window: tabWindow, backup: tabBackup};

  function render() {
    rail.innerHTML = TABS.map(([id, ic, name]) => '<button type="button" class="tab' + (id === tab ? ' on' : '') + '" role="tab" aria-selected="' + (id === tab) + '" data-tab="' + id + '"><span class="ti">' + ic + '</span>' + name + '</button>').join('');
    const p = Settings.profile();
    $('sheetSub').textContent = 'perfil ' + p.icon + ' ' + p.name;
    const keepScroll = content.scrollTop;
    content.innerHTML = RENDER[tab]();
    content.scrollTop = keepScroll;
    wire();
  }

  // Controles continuos: se enlazan tras cada render (no re-renderizan mientras se arrastran).
  function wire() {
    const r = id => content.querySelector('#' + id);
    const bind = (id, fn) => { const el = r(id); if (el) el.oninput = () => fn(parseFloat(el.value), el); };
    bind('rgScale', v => set({scale: v}));
    bind('rgRepeat', v => { set({repeatStart: v}); const o = r('repVal'); if (o) o.textContent = v + ' ms'; });
    bind('rgLpDelay', v => { set({lpDelay: v}); const o = r('lpVal'); if (o) o.textContent = v + ' ms'; });
    bind('rgVolume', v => { set({volume: v}); const o = r('volVal'); if (o) o.textContent = Math.round(v * 100) + '%'; });
    const vol = r('rgVolume'); if (vol) vol.onchange = () => VK.Sound.click('key');
    bind('rgOpacity', v => { set({opacity: v}); const o = r('opVal'); if (o) o.textContent = Math.round(v * 100) + '%'; });
    const hue = r('rgHue');
    if (hue) {
      hue.oninput = () => set({accent: VK.Look.accentFromHue(parseFloat(hue.value), s().theme)});
      hue.onchange = () => render();
    }
  }

  content.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    const segBox = t.closest('[data-seg]');
    if (segBox) return onSeg(segBox.dataset.seg, t.dataset.v);
    if (t.dataset.theme) { set({theme: t.dataset.theme}); return render(); }
    if (t.dataset.accent !== undefined) { set({accent: t.dataset.accent || null}); return render(); }
    if (t.dataset.a) { set({win: Object.assign({}, s().win, {anchor: t.dataset.a})}); return render(); }
    if (t.dataset.assign) { Settings.assignApp(Settings.active(), t.dataset.assign); return render(); }
    if (t.dataset.unapp) { Settings.unassignApp(Settings.active(), t.dataset.unapp); return render(); }
    if (t.dataset.mv) { const [id, d] = t.dataset.mv.split(':'); Settings.movePin(id, parseInt(d, 10)); return render(); }
    if (t.dataset.open === 'macros') { close(); return VK.Macros.open(); }
    if (t.dataset.bk) return backup(t.dataset.bk);
    const prof = t.closest('[data-pid]');
    if (prof && t.dataset.pa) return profileAction(prof.dataset.pid, t.dataset.pa);
  });

  function onSeg(key, v) {
    const cur = s();
    if (key === 'auto') { Settings.setAuto(v === '1'); return render(); }
    if (['sound', 'suggest', 'subLegends', 'longPress', 'lpHint'].includes(key)) set({[key]: v === '1'});
    else if (key === 'screen') set({win: Object.assign({}, cur.win, {screen: parseInt(v, 10), anchor: cur.win.anchor === 'free' ? 'br' : cur.win.anchor})});
    else if (key === 'size') set({win: Object.assign({}, cur.win, {size: v})});
    else set({[key]: v});
    if (key === 'soundPack') { VK.Sound.ensure(); VK.Sound.click('key', v); setTimeout(() => VK.Sound.click('space', v), 140); }
    if (key === 'sound' && v === '1') VK.Sound.ensure();
    render();
  }

  async function profileAction(id, act) {
    const p = Settings.profile(id);
    if (act === 'use') VK.App.switchProfile(id);
    else if (act === 'up') Settings.move(id, -1);
    else if (act === 'down') Settings.move(id, 1);
    else if (act === 'dup') { Settings.duplicate(id); VK.App.switchProfile(Settings.active()); }
    else if (act === 'del') { if (Settings.remove(id)) VK.App.switchProfile(Settings.active()); }
    else if (act === 'icon') Settings.rename(id, p.name, ICONS[(ICONS.indexOf(p.icon) + 1) % ICONS.length]);
    else if (act === 'rename') {
      const v = await VK.App.compose(wrap, {kind: 'text', label: 'Nombre', value: p.name, max: 18, placeholder: 'nombre del perfil'});
      if (v && v.trim()) Settings.rename(id, v.trim());
    }
    render();
  }

  function backup(kind) {
    if (kind !== 'reset') resetArmed = false;
    if (kind === 'export') {
      const blob = new Blob([Settings.exportJSON()], {type: 'application/json'});
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'resyst-vk-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (kind === 'import') {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'application/json,.json';
      inp.onchange = () => {
        const f = inp.files[0];
        if (!f) return;
        f.text().then(t => {
          try { Settings.importJSON(t); VK.App.toast('importado'); render(); }
          catch (err) { VK.App.showError('respaldo inválido: ' + err.message); }
        });
      };
      inp.click();
    } else if (kind === 'reset') {
      if (!resetArmed) { resetArmed = true; render(); setTimeout(() => { resetArmed = false; if (isOpen() && tab === 'backup') render(); }, 4000); return; }
      resetArmed = false;
      Settings.reset();
      render();
    }
  }

  rail.addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) { tab = b.dataset.tab; render(); if (tab === 'window') loadMonitors(); }
  });
  rail.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const i = TABS.findIndex(t => t[0] === tab) + (e.key === 'ArrowDown' ? 1 : -1);
    tab = TABS[(i + TABS.length) % TABS.length][0];
    render();
    rail.querySelector('.on').focus();
  });

  async function loadMonitors() {
    const r = await VK.App.api('/window', null, 'GET');
    if (r.ok && Array.isArray(r.monitors)) { monitors = r.monitors; if (isOpen() && tab === 'window') render(); }
  }

  function isOpen() { return !wrap.hidden; }
  function open(which) {
    if (VK.Macros && VK.Macros.isOpen()) VK.Macros.close();
    if (which) tab = which;
    render();
    wrap.hidden = false;
    $('btnCfg').classList.add('on');
    if (tab === 'window') loadMonitors();
    const on = rail.querySelector('.on');
    if (on) on.focus();
  }
  function close() {
    if (VK.App.Compose.active) VK.App.Compose.finish(null);
    wrap.hidden = true;
    resetArmed = false;
    $('btnCfg').classList.remove('on');
  }
  wrap.querySelector('.x').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  return { open, close, isOpen, refresh: render, get tab() { return tab; } };
})();
