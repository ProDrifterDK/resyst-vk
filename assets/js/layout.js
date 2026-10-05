/* Resyst VK — definición de capas (grid 60 columnas) + fila personal.
   Módulo puro (sin DOM): lo cargan el widget y tools/check_grid.js (node). */
'use strict';
window.VK = window.VK || {};

VK.Layout = (() => {
  const COLS = 60;
  // w = ancho en columnas (4 = 1 unidad; cada fila suma 60)
  // {c, s, g} base / shift / altgr   {k,label,aria} keysym   {mod} shift|caps|altgr…
  // {layer} cambio de capa            r:1 repetición al mantener   {macro} id de macro
  const C = (c, s, extra) => Object.assign({c, s, w: 4}, extra);
  const K = (k, label, aria, extra) => Object.assign({k, label, aria, w: 4}, extra);
  const GAP = w => ({gap: true, w});
  const ARROWS = [K('Left','←','Flecha izquierda',{r:1, glyph:1}), K('Up','↑','Flecha arriba',{r:1, glyph:1}),
                  K('Down','↓','Flecha abajo',{r:1, glyph:1}), K('Right','→','Flecha derecha',{r:1, glyph:1})];
  // fila de acentos rápidos (fila 0 del qwerty)
  const ACCENTS = ['á','é','í','ó','ú','ü','ñ','¿','¡'];
  const ESC_TOP = () => K('Escape','Esc','Escape',{w:4, fn:1});

  const LAYERS = {
    qwerty: { label: 'Teclado (qwerty latam)', rows: [
      [ESC_TOP(),
       ...ACCENTS.map(c => C(c, null, {accent:1})),
       C('´', null, {accent:1}), C('ç', null, {accent:1}),
       C('@', null, {w:6}), C('€', null, {w:6})],
      [C('º','ª',{g:'\\'}), C('1','!'), C('2','"',{g:'@'}), C('3','#'), C('4','$'), C('5','%'),
       C('6','&'), C('7','/'), C('8','('), C('9',')'), C('0','='), C("'",'?'), C('¡','¿'),
       K('BackSpace','⌫','Retroceso',{w:8, fn:1, glyph:1, r:1})],
      [K('Tab','Tab','Tabulador',{w:6, fn:1}),
       ...'qwertyuiop'.split('').map(c => C(c)), C('`','^',{g:'['}), C('+','*',{g:']'}),
       K('Delete','Supr','Suprimir',{w:6, fn:1, r:1})],
      [{mod:'caps', label:'⇪', aria:'Bloqueo de mayúsculas', w:8},
       ...'asdfghjklñ'.split('').map(c => C(c)),
       K('Return','⏎','Intro',{w:12, fn:1, glyph:1})],
      [{mod:'shift', label:'⇧', aria:'Mayúsculas', w:8}, C('<','>'),
       ...'zxcvbnm'.split('').map(c => C(c)), C(',',';'), C('.',':'), C('-','_'),
       {mod:'shift', label:'⇧', aria:'Mayúsculas', w:8}],
      [{mod:'ctrl', label:'Ctrl', aria:'Control', w:6}, {mod:'alt', label:'Alt', aria:'Alt', w:6},
       {mod:'altgr', label:'AltGr', aria:'AltGr (tercer nivel)', w:6},
       {layer:'nav', label:'123', aria:'Capa de símbolos, navegación y números', w:6},
       C(' ', null, {w:20, label:'espacio', aria:'Espacio', space:1}), ...ARROWS],
    ]},
    nav: { label: 'Símbolos, navegación y números', rows: [
      [K('Escape','Esc','Escape',{w:6, fn:1}),
       ...Array.from({length: 12}, (_, i) => K('F'+(i+1), 'F'+(i+1), 'F'+(i+1), {fn:1})),
       K('Tab','Tab','Tabulador',{w:6, fn:1})],
      [...'\\|@#€~'.split('').map(c => C(c)),
       K('Insert','Ins','Insertar',{fn:1}), K('Home','Inicio','Inicio',{fn:1}), K('Prior','RePág','Página arriba',{fn:1, r:1}), GAP(4),
       ...'789/'.split('').map(c => C(c, null, {num:1})), K('BackSpace','⌫','Retroceso',{fn:1, glyph:1, r:1})],
      [...'[]{}<>'.split('').map(c => C(c)),
       K('Delete','Supr','Suprimir',{fn:1, r:1}), K('End','Fin','Fin',{fn:1}), K('Next','AvPág','Página abajo',{fn:1, r:1}), GAP(4),
       ...'456*('.split('').map(c => C(c, null, {num:1}))],
      [...'\'"`^&$'.split('').map(c => C(c)), ARROWS[1], GAP(12),
       ...'123-)'.split('').map(c => C(c, null, {num:1}))],
      [...'!?;:_%'.split('').map(c => C(c)), ARROWS[0], ARROWS[2], ARROWS[3], GAP(4),
       ...'0,.+='.split('').map(c => C(c, null, {num:1}))],
      [{mod:'shift', label:'⇧', aria:'Mayúsculas', w:6}, {mod:'ctrl', label:'Ctrl', aria:'Control', w:6},
       {mod:'alt', label:'Alt', aria:'Alt', w:6},
       {layer:'qwerty', label:'ABC', aria:'Capa de teclado principal', w:6},
       C(' ', null, {w:24, label:'espacio', aria:'Espacio', space:1}),
       K('Return','⏎','Intro',{w:12, fn:1, glyph:1})],
    ]},
  };

  // Máximo de macros fijadas que caben en la fila personal (56 columnas / 4).
  const PERSONAL_MAX = 14;

  // Reparte `total` columnas entre n teclas lo más parejo posible (enteros, suma exacta).
  function spread(n, total) {
    if (n <= 0) return [];
    const base = Math.floor(total / n), rem = total - base * n;
    return Array.from({length: n}, (_, i) => base + (i < rem ? 1 : 0));
  }

  // Fila 0 del qwerty con las macros fijadas por el usuario: Esc + hasta 14 macros.
  function personalRow(macros) {
    const list = (macros || []).slice(0, PERSONAL_MAX);
    const row = [ESC_TOP()];
    if (!list.length) {
      row.push({hint: 'Fila personal vacía · fija macros con ★ en el panel ⌘', w: COLS - 4});
      return row;
    }
    spread(list.length, COLS - 4).forEach((w, i) => {
      const m = list[i];
      row.push({macro: m.id, label: m.label, aria: 'Macro: ' + m.label, w});
    });
    return row;
  }

  // Filas efectivas de una capa según la preferencia de fila superior.
  // topRow: 'accents' (por defecto) | 'personal' | 'none' (tablero compacto, solo qwerty)
  function rowsFor(name, topRow, pinned) {
    const rows = LAYERS[name].rows;
    if (name !== 'qwerty' || topRow === 'accents') return rows;
    if (topRow === 'none') return rows.slice(1);
    return [personalRow(pinned)].concat(rows.slice(1));
  }

  // keysym para combos ctrl/alt + tecla de carácter
  const SYM = {' ':'space','+':'plus','-':'minus',',':'comma','.':'period','/':'slash','\\':'backslash',
    "'":'apostrophe','`':'grave','´':'acute','º':'masculine','¡':'exclamdown','¿':'questiondown',
    '<':'less','>':'greater','ñ':'ntilde','ç':'ccedilla','@':'at','#':'numbersign','€':'EuroSign',
    '*':'asterisk','=':'equal','[':'bracketleft',']':'bracketright','{':'braceleft','}':'braceright',
    '|':'bar','~':'asciitilde','^':'asciicircum','&':'ampersand','$':'dollar','%':'percent',
    '!':'exclam','?':'question',';':'semicolon',':':'colon','_':'underscore','"':'quotedbl',
    '(':'parenleft',')':'parenright','á':'aacute','é':'eacute','í':'iacute','ó':'oacute',
    'ú':'uacute','ü':'udiaeresis'};

  return { COLS, LAYERS, SYM, PERSONAL_MAX, spread, personalRow, rowsFor };
})();
