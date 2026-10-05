/* Resyst VK — predicción de palabras offline (lexicón de frecuencia, sin red). */
'use strict';
window.VK = window.VK || {};

VK.Suggest = (() => {
  const DICT = window.VK.LEXICON || {es: [], en: []};
  const cache = new Map();          // "lang|prefix" → lista
  const MAX_LEN = 12;               // no sugerir a partir de este largo de prefijo

  // ¿la palabra empieza exactamente por el prefijo (con acentos correctos)?
  const starts = (w, p) => w.startsWith(p);

  function candidates(lang, prefix) {
    const p = (prefix || '').toLowerCase();
    if (!p || p.length > MAX_LEN) return [];
    const ck = lang + '|' + p;
    if (cache.has(ck)) return cache.get(ck);
    const dict = DICT[lang] || DICT.es;
    const out = [];
    // El lexicón viene ordenado por frecuencia: recorrer en orden basta.
    for (let i = 0; i < dict.length && out.length < 12; i++) {
      const w = dict[i];
      if (w.length > p.length && starts(w, p)) out.push(w);
    }
    if (cache.size > 400) cache.clear();
    cache.set(ck, out);
    return out;
  }

  return { candidates };
})();
