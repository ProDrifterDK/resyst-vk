#!/usr/bin/env node
/* Verificador del grid de Resyst VK: cada fila de cada capa (y de cada variante de fila
   superior: acentos / personal con 0..20 macros / compacta) debe sumar exactamente 60
   columnas y no contener teclas sin `w` (fantasmas). Uso: node tools/check_grid.js (exit 0 = OK) */
'use strict';
globalThis.window = globalThis;
globalThis.VK = {};
require('../assets/js/layout.js');
const { LAYERS, COLS, rowsFor } = VK.Layout;

let allOK = true;
let checked = 0;
function checkRows(tag, rows) {
  rows.forEach((row, i) => {
    checked++;
    const sum = row.reduce((a, k) => a + (k.w || 0), 0);
    const ghosts = row.filter(k => !k.gap && !(Number.isInteger(k.w) && k.w > 0)).length;
    if (sum !== COLS || ghosts) {
      allOK = false;
      console.log(`MAL ${tag} fila ${i}: suma=${sum} (esperado ${COLS}), fantasmas=${ghosts}`);
    }
  });
}

for (const name of Object.keys(LAYERS)) {
  checkRows(name, LAYERS[name].rows);
  checkRows(name + '/compacta', rowsFor(name, 'none', []));
  for (let n = 0; n <= 20; n++) {
    const pinned = Array.from({length: n}, (_, i) => ({id: 'm' + i, label: 'M' + i}));
    checkRows(`${name}/personal(${n})`, rowsFor(name, 'personal', pinned));
  }
}
console.log(allOK ? `TODAS LAS FILAS = ${COLS} (${checked} filas verificadas), SIN TECLAS FANTASMA ✓` : 'HAY FILAS MAL');
process.exit(allOK ? 0 : 1);
