/* Resyst VK — popup de variantes (mantener pulsado). Solo UI + geometría:
   main.js decide CUÁNDO abrir y QUÉ escribir; aquí se dibuja, se elige y se cierra.

   Modos:
     slide  — el dedo/ratón sigue apretado: mover elige, soltar sobre una variante la escribe,
              soltar fuera (tras salir de la tecla) cancela.
     sticky — se soltó sin moverse de la tecla: el popup queda abierto para tocar una variante.
              Cierra con: elección, toque fuera (se consume, no teclea), Esc, o 6 s sin uso. */
'use strict';
window.VK = window.VK || {};

VK.LongPress = (() => {
  const { escapeHtml, clamp } = VK.util;
  const pop = document.getElementById('lpop');
  const CELL_REM = {s: 2.2, m: 2.7, l: 3.3};
  const GAP = 9;            // px entre la tecla y el popup (deja ver el pico + el halo)
  const MARGIN = 4;         // px al borde de la ventana
  const STICKY_MS = 6000;
  let st = null;

  function open(keyEl, variants, opts) {
    close('replace');
    pop.innerHTML = variants.map((v, i) => '<span class="lv" role="option" aria-selected="false" data-i="' + i + '">'
      + escapeHtml(v) + '</span>').join('');
    pop.setAttribute('aria-label', 'Variantes de ' + opts.base);
    pop.style.setProperty('--lp-cell', (CELL_REM[opts.size] || CELL_REM.m) + 'rem');
    pop.hidden = false;
    const kr = keyEl.getBoundingClientRect();
    const pw = pop.offsetWidth, ph = pop.offsetHeight;
    const left = clamp(kr.left + kr.width / 2 - pw / 2, MARGIN, Math.max(MARGIN, innerWidth - pw - MARGIN));
    let top = kr.top - GAP - ph, side = 'above';
    if (top < MARGIN) {   // fila de arriba: no cabe encima → debajo
      side = 'below';
      top = Math.min(kr.bottom + GAP, Math.max(MARGIN, innerHeight - ph - MARGIN));
    }
    pop.style.left = Math.round(left) + 'px';
    pop.style.top = Math.round(top) + 'px';
    pop.dataset.side = side;
    pop.style.setProperty('--caret-x', Math.round(clamp(kr.left + kr.width / 2 - left, 10, pw - 10)) + 'px');
    keyEl.classList.add('lporigin');
    st = {mode: 'slide', key: keyEl, cells: [...pop.children], idx: -1, movedOut: false, keyRect: kr,
          release: opts.release, onPick: opts.onPick, onClose: opts.onClose, variants, timer: 0};
    if (st.release === 'first') select(0);
    return true;
  }

  function select(i) {
    if (!st || i === st.idx) return;
    if (st.idx >= 0) { st.cells[st.idx].classList.remove('sel'); st.cells[st.idx].setAttribute('aria-selected', 'false'); }
    st.idx = i;
    if (i >= 0) { st.cells[i].classList.add('sel'); st.cells[i].setAttribute('aria-selected', 'true'); }
  }

  // Índice de la variante bajo (x,y): dentro del popup (con un margen generoso) gana la celda
  // más cercana, así el hueco entre celdas o el borde nunca deja «nada elegido».
  function hit(x, y) {
    const r = pop.getBoundingClientRect();
    const padX = r.width / Math.max(1, st.cells.length) / 2;
    // ±14 px en vertical cubre el hueco tecla↔popup (GAP) para que el deslizar no «parpadee»
    if (x < r.left - padX || x > r.right + padX || y < r.top - 14 || y > r.bottom + 14) return -1;
    let best = -1, bd = Infinity;
    st.cells.forEach((c, i) => {
      const b = c.getBoundingClientRect();
      const dx = x - (b.left + b.width / 2), dy = (y - (b.top + b.height / 2)) * 1.6;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  const inKey = (x, y) => { const k = st.keyRect; return x >= k.left && x <= k.right && y >= k.top && y <= k.bottom; };

  function move(x, y) {
    if (!st) return -1;
    if (st.mode === 'slide' && !inKey(x, y)) st.movedOut = true;
    let i = hit(x, y);
    if (i < 0 && st.mode === 'slide' && st.release === 'first' && !st.movedOut) i = 0;
    select(i);
    return i;
  }

  // Fin del gesto «slide». → {action: 'commit', value} | {action: 'sticky'} | {action: 'cancel'} | {action: 'none'}
  function release(x, y) {
    if (!st || st.mode !== 'slide') return {action: 'none'};
    move(x, y);
    if (st.idx >= 0) {
      const value = st.variants[st.idx];
      close('pick');
      return {action: 'commit', value};
    }
    if (!st.movedOut) { stick(); return {action: 'sticky'}; }
    close('cancel');
    return {action: 'cancel'};
  }

  // Convierte el gesto en popup «quieto» (también si el gesto se interrumpe sin soltar).
  function stick() {
    if (!st) return;
    st.mode = 'sticky';
    select(-1);
    clearTimeout(st.timer);
    st.timer = setTimeout(() => close('timeout'), STICKY_MS);
  }

  function pick(i) {
    if (!st || i < 0) return;
    const v = st.variants[i], cb = st.onPick;
    close('pick');
    if (cb) cb(v);
  }

  function close(reason) {
    if (!st) return;
    const s = st;
    st = null;
    clearTimeout(s.timer);
    s.key.classList.remove('lporigin');
    pop.hidden = true;
    pop.innerHTML = '';
    if (s.onClose) s.onClose(reason || 'close');
  }

  // ── popup quieto: tocar / pasar el ratón ─────────────────────────────
  pop.addEventListener('pointerdown', e => {
    if (!st) return;
    e.preventDefault();
    try { pop.setPointerCapture(e.pointerId); } catch (_) {}
    if (st.mode === 'sticky') { clearTimeout(st.timer); select(hit(e.clientX, e.clientY)); }
  });
  pop.addEventListener('pointermove', e => { if (st && st.mode === 'sticky') select(hit(e.clientX, e.clientY)); });
  pop.addEventListener('pointerup', e => {
    if (!st || st.mode !== 'sticky') return;
    const i = hit(e.clientX, e.clientY);
    if (i >= 0) pick(i);
    else { st.timer = setTimeout(() => close('timeout'), STICKY_MS); }
  });
  pop.addEventListener('pointerleave', () => { if (st && st.mode === 'sticky') select(-1); });
  // Toque fuera del popup: cierra y se CONSUME (no teclea la tecla tocada ni activa el botón
  // de la barra que haya debajo, como un menú). El click que sigue a ese pointerdown también.
  let swallowUntil = 0;
  document.addEventListener('pointerdown', e => {
    if (!st || pop.contains(e.target)) return;
    close('outside');
    swallowUntil = performance.now() + 800;
    e.preventDefault();
    e.stopPropagation();
  }, true);
  document.addEventListener('click', e => {
    if (performance.now() > swallowUntil) return;
    swallowUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  return {
    open, move, release, stick, close, pick,
    isOpen: () => !!st,
    mode: () => (st ? st.mode : null),
    selected: () => (st && st.idx >= 0 ? st.variants[st.idx] : null),
    CELL_REM,
  };
})();
