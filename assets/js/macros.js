/* Resyst VK — biblioteca de macros: atajos (acordes xdotool) y textos con variables.
   Variables en textos: {fecha} {hora} {clip} (portapapeles actual).
   Edición 100% con el propio teclado (modo composición): el widget es DOCK y nunca toma foco. */
'use strict';
window.VK = window.VK || {};

VK.Macros = (() => {
  const { escapeHtml } = VK.util;
  const Settings = VK.Settings;
  const $ = id => document.getElementById(id);
  const wrap = $('macroWrap');
  const body = $('macroBody');
  let editing = null;   // borrador {id?, label, kind, body} o null (vista de grilla)

  const pad = n => String(n).padStart(2, '0');
  async function expand(text) {
    const d = new Date();
    let out = text
      .replace(/\{fecha\}/g, pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + '-' + d.getFullYear())
      .replace(/\{hora\}/g, pad(d.getHours()) + ':' + pad(d.getMinutes()));
    if (out.includes('{clip}')) {
      const r = await VK.App.api('/clipboard', null, 'GET');
      out = out.replace(/\{clip\}/g, r.ok ? r.text : '');
    }
    return out;
  }

  async function run(id) {
    const m = Settings.macro(id);
    if (!m) { VK.App.showError('macro inexistente'); return; }
    if (m.kind === 'keys') { VK.App.enqueue('/key', {keys: m.body}); return; }
    const text = await expand(m.body);
    if (!text) return;
    // xdotool type no maneja bien emoji/astrales ni textos largos: esos van por el portapapeles
    if (/[\u{10000}-\u{10FFFF}]/u.test(text) || text.length > 240) VK.App.enqueue('/paste', {text});
    else VK.App.enqueue('/type', {text, delay: 6});
  }

  // ── vista grilla ─────────────────────────────────────────────────────
  function renderGrid() {
    const ms = Settings.macros();
    const pinnedN = Settings.pinned().length;
    $('macroSub').textContent = ms.length + ' macros · ' + pinnedN + '/' + VK.Layout.PERSONAL_MAX
      + ' en la fila personal' + (Settings.get().topRow === 'personal' ? '' : ' (actívala en Personalizar › Teclado)');
    body.innerHTML = '<div class="grid" role="list">' + ms.map(m => {
      const pinned = Settings.isPinned(m.id);
      return '<div class="tile" role="listitem" tabindex="0" data-run="' + escapeHtml(m.id) + '" aria-label="Ejecutar ' + escapeHtml(m.label) + '">'
        + '<span class="tl">' + escapeHtml(m.label) + '</span>'
        + '<span class="tb">' + (m.kind === 'keys' ? '⌨ ' : '¶ ') + escapeHtml(m.body.replace(/\n/g, '↵')) + '</span>'
        + '<span class="tact">'
        + '<button type="button" data-pin="' + escapeHtml(m.id) + '" class="' + (pinned ? 'pinned' : '') + '" aria-pressed="' + pinned + '" title="' + (pinned ? 'Quitar de' : 'Fijar en') + ' la fila personal" aria-label="Fijar ' + escapeHtml(m.label) + '">' + (pinned ? '★' : '☆') + '</button>'
        + '<button type="button" data-edit="' + escapeHtml(m.id) + '" title="Editar" aria-label="Editar ' + escapeHtml(m.label) + '">✎</button>'
        + '</span></div>';
    }).join('') + '<button type="button" class="tile new" data-new="1">＋ Nueva macro</button></div>';
  }

  body.addEventListener('click', e => {
    const t = e.target.closest('[data-pin],[data-edit],[data-new],[data-run],[data-f]');
    if (!t) return;
    if (t.dataset.pin) {
      if (!Settings.togglePin(t.dataset.pin)) VK.App.showError('fila llena (máx. ' + VK.Layout.PERSONAL_MAX + ')');
      renderGrid();
    } else if (t.dataset.edit) {
      const m = Settings.macro(t.dataset.edit);
      editing = Object.assign({}, m);
      renderEditor();
    } else if (t.dataset.new) {
      editing = {label: '', kind: 'text', body: ''};
      renderEditor();
    } else if (t.dataset.run) {
      t.classList.add('down');
      setTimeout(() => t.classList.remove('down'), 120);
      run(t.dataset.run);
    } else if (t.dataset.f) {
      editorAction(t.dataset.f, t);
    }
  });
  body.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.run) { e.preventDefault(); run(e.target.dataset.run); }
  });

  // ── editor ───────────────────────────────────────────────────────────
  function renderEditor() {
    const m = editing;
    const isNew = !m.id;
    const pinned = m.id && Settings.isPinned(m.id);
    const valid = !!Settings.sanitizeMacro(Object.assign({}, m, {id: m.id || 'tmp'}));
    $('macroSub').textContent = isNew ? 'nueva macro' : 'editando «' + m.label + '»';
    const bodyField = m.body
      ? (m.kind === 'keys'
          ? m.body.split(' ').map(t => '<span class="tok" style="display:inline-block;padding:0 .3rem;margin-right:.2rem;border:1px solid var(--accent);border-radius:4px;color:var(--accent)">' + escapeHtml(t) + '</span>').join('')
          : escapeHtml(m.body.replace(/\n/g, '↵')))
      : '<span class="ph">' + (m.kind === 'keys' ? 'tocar para grabar la combinación' : 'tocar para escribir el texto') + '</span>';
    body.innerHTML = '<div class="editor">'
      + '<div class="row"><span class="lbl">Tipo<small>Atajo = combinación de teclas · Texto = escribe un fragmento</small></span>'
      + '<div class="seg" role="radiogroup">'
      + '<button type="button" role="radio" data-f="kind:text" aria-checked="' + (m.kind === 'text') + '" class="' + (m.kind === 'text' ? 'on' : '') + '">¶ Texto</button>'
      + '<button type="button" role="radio" data-f="kind:keys" aria-checked="' + (m.kind === 'keys') + '" class="' + (m.kind === 'keys' ? 'on' : '') + '">⌨ Atajo</button></div></div>'
      + '<div class="row"><span class="lbl" style="flex:none;width:5.5rem">Nombre</span>'
      + '<button type="button" class="field" style="flex:1" data-f="label">' + (m.label ? escapeHtml(m.label) : '<span class="ph">tocar para nombrar</span>') + '</button></div>'
      + '<div class="row"><span class="lbl" style="flex:none;width:5.5rem">' + (m.kind === 'keys' ? 'Combinación' : 'Texto') + '</span>'
      + '<button type="button" class="field" style="flex:1" data-f="body">' + bodyField + '</button>'
      + (m.kind === 'text' ? '<button type="button" class="btn" data-f="clip" title="Usar el portapapeles actual">⎘ Portapapeles</button>' : '')
      + '</div>'
      + (m.kind === 'text' ? '<p class="note">Variables: <code>{fecha}</code> <code>{hora}</code> <code>{clip}</code> se expanden al ejecutar. ⏎ inserta salto de línea; ✓ confirma.</p>'
                           : '<p class="note">Arma Ctrl / Alt / ⇧ / AltGr (o ❖ Super) en el teclado y luego toca la tecla. Hasta 8 acordes en secuencia, p. ej. <code>ctrl+k ctrl+s</code>.</p>')
      + '<div class="row" style="gap:.35rem;justify-content:flex-end;border-top:1px solid var(--edge);margin-top:.3rem">'
      + (isNew ? '' : '<button type="button" class="btn danger" data-f="delete">Eliminar</button>')
      + (isNew ? '' : '<button type="button" class="btn" data-f="pin">' + (pinned ? '★ En fila' : '☆ Fijar') + '</button>')
      + '<span style="flex:1"></span>'
      + '<button type="button" class="btn" data-f="test"' + (valid ? '' : ' disabled') + '>▶ Probar</button>'
      + '<button type="button" class="btn" data-f="cancel">Volver</button>'
      + '<button type="button" class="btn primary" data-f="save"' + (valid ? '' : ' disabled') + '>Guardar</button>'
      + '</div></div>';
  }

  async function editorAction(f, el) {
    const m = editing;
    if (!m) return;
    if (f.startsWith('kind:')) {
      const k = f.slice(5);
      if (k !== m.kind) { m.kind = k; m.body = ''; }
      renderEditor();
    } else if (f === 'label') {
      const v = await VK.App.compose(wrap, {kind: 'text', label: 'Nombre', value: m.label, max: 24, placeholder: 'nombre corto (máx. 24)'});
      if (v !== null) m.label = v.trim();
      renderEditor();
    } else if (f === 'body') {
      const v = await VK.App.compose(wrap, m.kind === 'keys'
        ? {kind: 'keys', label: 'Atajo', value: ''}
        : {kind: 'text', label: 'Texto', value: m.body, multiline: true, max: 2000});
      if (v !== null && v !== '') m.body = v;
      if (!m.label && m.body) m.label = (m.kind === 'keys' ? m.body : m.body.split('\n')[0]).slice(0, 24);
      renderEditor();
    } else if (f === 'clip') {
      const r = await VK.App.api('/clipboard', null, 'GET');
      if (r.ok && r.text) { m.body = r.text.slice(0, 2000); if (!m.label) m.label = r.text.split('\n')[0].slice(0, 24); }
      else VK.App.showError('portapapeles vacío');
      renderEditor();
    } else if (f === 'test') {
      const tmp = Settings.sanitizeMacro(Object.assign({}, m, {id: m.id || 'tmp'}));
      if (!tmp) return;
      if (tmp.kind === 'keys') VK.App.enqueue('/key', {keys: tmp.body});
      else { const text = await expand(tmp.body); VK.App.enqueue(/[\u{10000}-\u{10FFFF}]/u.test(text) || text.length > 240 ? '/paste' : '/type', {text, delay: 6}); }
    } else if (f === 'save') {
      const saved = Settings.saveMacro(m);
      if (!saved) { VK.App.showError('macro inválida'); return; }
      editing = null;
      renderGrid();
    } else if (f === 'delete') {
      Settings.deleteMacro(m.id);
      editing = null;
      renderGrid();
    } else if (f === 'pin') {
      if (!Settings.togglePin(m.id)) VK.App.showError('fila llena');
      renderEditor();
    } else if (f === 'cancel') {
      editing = null;
      renderGrid();
    }
    void el;
  }

  function open() {
    if (VK.PrefsUI && VK.PrefsUI.isOpen()) VK.PrefsUI.close();
    editing = null;
    renderGrid();
    wrap.hidden = false;
    $('btnMacros').classList.add('on');
    const first = body.querySelector('.tile');
    if (first) first.focus();
  }
  function close() {
    if (VK.App.Compose.active) VK.App.Compose.finish(null);
    wrap.hidden = true;
    editing = null;
    $('btnMacros').classList.remove('on');
  }
  wrap.querySelector('.x').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });

  return {
    run, expand, open, close,
    isOpen: () => !wrap.hidden || (VK.App && VK.App.Compose.active && editing !== null),
    refresh: () => (editing ? renderEditor() : renderGrid()),
  };
})();
