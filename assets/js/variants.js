/* Resyst VK — variantes por carácter para «mantener pulsado».
   Módulo puro (sin DOM): lo cargan el widget y los tests (node).

   Cómo extender: agrega una entrada  'base': ['var1', 'var2', …]  en TABLE.
   - La clave es el carácter que la tecla escribe en ese momento (con Shift/Bloq ya aplicados).
   - Letras: se define solo la minúscula; la mayúscula se deriva sola (É, Ñ, Ç…).
   - Orden = orden en el popup. La PRIMERA es la «favorita» (modo «escribir la primera»):
     pon ahí la más usada en español.
   - Filas superiores (q…p) terminan con su dígito, como en los teclados móviles. */
'use strict';
window.VK = window.VK || {};

VK.Variants = (() => {
  const TABLE = {
    // ── vocales: acentos ES primero, luego el resto del latín ─────────
    a: ['á', 'à', 'â', 'ä', 'ã', 'å', 'ª', 'æ'],
    e: ['é', 'è', 'ê', 'ë', '€', '3'],
    i: ['í', 'ì', 'î', 'ï', '8'],
    o: ['ó', 'ò', 'ô', 'ö', 'õ', 'ø', 'º', 'œ', '9'],
    u: ['ú', 'ü', 'ù', 'û', '7'],
    // ── consonantes ───────────────────────────────────────────────────
    n: ['ñ'],
    c: ['ç', '©', '¢'],
    s: ['ß', '§', '$'],
    y: ['ý', 'ÿ', '¥', '6'],
    // fila superior sin acentos: solo su dígito
    q: ['1'], w: ['2'], r: ['4', '®'], t: ['5', '™'], p: ['0', '¶'],
    // ── dígitos: Shift, AltGr y parientes (coherente con la fila 1 del layout) ──
    '1': ['!', '|', '¹', '½', '¼'],
    '2': ['"', '@', '²'],
    '3': ['#', '·', '³', '¾'],
    '4': ['$', '~', '⁴'],
    '5': ['%', '€', '‰'],
    '6': ['&', '¬'],
    '7': ['/', '{', '\\'],
    '8': ['(', '[', '∞'],
    '9': [')', ']'],
    '0': ['=', '}', '°'],
    // ── signos ES ─────────────────────────────────────────────────────
    '?': ['¿', '‽'], '¿': ['¡', '?'], '!': ['¡', '‼'], '¡': ['¿', '!'],
    'º': ['ª', '°'], 'ª': ['º', '°'],
    "'": ['?', '"', '‘', '’', '´', '`'],
    '"': ['“', '”', '«', '»', '„'],
    // ── relaciones / tipografía ───────────────────────────────────────
    '<': ['≤', '«', '‹', '←'], '>': ['≥', '»', '›', '→'],
    '-': ['–', '—', '_', '±', '−'], '_': ['–', '—'],
    '.': ['…', '·', '•', ':'], ',': [';', '„'],
    '+': ['±', '×', '÷', '*'], '*': ['×', '•', '†', '★'],
    '=': ['≠', '≈', '≡', '≤', '≥'], '/': ['÷', '\\', '|'],
    '%': ['‰'], '&': ['§', '¶'], '#': ['№'], '~': ['≈', '¬'], '|': ['¦', '‖'], '\\': ['|', '/'],
    '(': ['[', '{', '<'], ')': [']', '}', '>'],
    '`': ['´', '^', '¨'], '´': ['`', '¨', '^'], '^': ['¨', '`', '´'],
    // ── monedas / @ ───────────────────────────────────────────────────
    '$': ['€', '£', '¥', '¢'], '€': ['$', '£', '¥', '¢'], '@': ['©', '®', '™'],
  };

  // Mayúscula de una variante; si no es 1 carácter (ß → SS) se deja tal cual.
  const upper = v => { const u = v.toUpperCase(); return Array.from(u).length === 1 ? u : v; };

  // Variantes para lo que la tecla escribe AHORA (ch ya con Shift/Bloq aplicados).
  function variantsFor(ch) {
    if (typeof ch !== 'string' || !ch) return [];
    if (TABLE[ch]) return TABLE[ch].slice();
    const lower = ch.toLowerCase();
    if (lower !== ch && TABLE[lower]) return TABLE[lower].map(upper).filter(v => v !== ch);
    return [];
  }

  return { TABLE, variantsFor };
})();
