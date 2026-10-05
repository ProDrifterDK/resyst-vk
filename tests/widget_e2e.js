#!/usr/bin/env node
/* Resyst VK — E2E del widget (personalización r3). Headless + server VK_DRY_RUN en :17699.
   No toca el escritorio. Artefactos: reports/r3-shots/*.png + reports/r3-shots/widget_e2e.json
   Uso: node tests/widget_e2e.js   (exit 0 = todo pasa)

   Modos de fallo que este suite busca (escritos ANTES de implementar):
    F1  la migración v3→v4 pierde ajustes guardados (escala, sonido, repetición, idioma)
    F2  un perfil no aplica todo (tema/acento/forma/fila/ventana) o deja restos del anterior
    F3  el atajo global (/profile → /events) no llega o llega tarde (>1.5 s)
    F4  el modo composición filtra teclas al escritorio (/type o /key durante la edición)
    F5  una macro de texto/atajo ejecuta algo distinto a lo guardado; variables sin expandir
    F6  la fila personal rompe el grid (filas ≠ 60 columnas en el DOM real)
    F7  borrar el perfil de Chrome (/tmp) pierde la personalización (debe volver desde el server)
    F8  el modo automático por app pelea con la elección manual o no vuelve al perfil base
    F9  un acento propio queda ilegible (< 4.5:1 sobre la tecla) en algún tema
    F10 arrastrar la ventana no persiste la posición en el perfil
    F11 importar basura corrompe el estado

   Mantener pulsado → variantes (r4). Modos de fallo (escritos antes de los casos; el código de
   la feature se escribió primero — orden invertido respecto a F1–F11):
    L1  un toque corto ya no escribe exactamente la letra (o escribe dos veces / abre el popup)
    L2  el popup abre antes del retardo, o no abre, o muestra variantes equivocadas
    L3  mantener y soltar sin moverse no escribe la favorita (modo «escribe la 1ª»)
    L4  deslizar a otra variante y soltar escribe otra cosa (o la letra base además)
    L5  soltar lejos del popup escribe algo (debe cancelar)
    L6  con Shift/Bloq las variantes no salen en mayúscula, o Shift no se consume
    L7  con la opción apagada, mantener abre popup o retrasa la escritura
    L8  el retardo configurable no se respeta
    L9  modo «queda abierto»: tocar fuera teclea la tecla tocada; tocar variante no escribe
    L10 dos teclas rápidas (rollover) salen en desorden
    L11 en modo composición la variante se fuga al escritorio
    L12 el popup altera el grid (cambia hijos / filas ≠ 60)
    L13 Ctrl armado + mantener: abre popup en vez de mandar el atajo al bajar
    L14 touch no funciona igual que el ratón
    L15 en la fila superior el popup se sale de la ventana
    L16 los ajustes no persisten (sanitize / server) o aceptan basura
    L17 Esc no cierra el popup */
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./lib/harness');

const SHOTS = path.join(H.ROOT, 'reports', 'r3-shots');
const T = new H.Suite('widget');

async function main() {
  fs.mkdirSync(SHOTS, {recursive: true});
  const {chromium} = H.loadPlaywright();
  const srv = await H.startServer();
  // un crash del suite no debe dejar el server dry-run vivo en :17699 (la siguiente corrida lo reusaría con prefs viejas)
  process.on('exit', () => { try { srv.proc.kill(); } catch (_) {} });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 780, height: 430}});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  const URL = 'file://' + H.ROOT + '/vk.html?port=' + H.PORT;
  const shot = name => page.screenshot({path: path.join(SHOTS, name + '.png')});
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const until = async (fn, arg, ms = 4000) => {
    const t0 = Date.now();
    for (;;) {
      if (await ev(fn, arg)) return Date.now() - t0;
      if (Date.now() - t0 > ms) return -1;
      await wait(50);
    }
  };
  const lastCalls = async () => (await H.calls()).filter(c => c[0] !== 'windowgeom' && c[0] !== 'xprop');
  const post = (p, body) => fetch(H.BASE + p, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}).then(r => r.json());

  // Teclea con el propio teclado en pantalla (cambia de capa si hace falta).
  async function tapKey(sel) { await page.click(sel); }
  async function typeOnKb(text) {
    for (const ch of text) {
      const lower = ch.toLowerCase();
      const found = await ev(c => {
        const vis = document.querySelector('.layer:not([hidden])');
        const k = [...vis.querySelectorAll('.key')].find(e => e.dataset.key === c);
        if (k) return 'here';
        const other = [...document.querySelectorAll('.layer[hidden] .key')].find(e => e.dataset.key === c);
        return other ? other.closest('.layer').id.replace('layer-', '') : null;
      }, lower);
      if (!found) throw new Error('tecla no encontrada: ' + ch);
      if (found !== 'here') await tapKey('.layer:not([hidden]) .key[data-key="layer:' + found + '"]');
      if (ch !== lower) await tapKey('.layer:not([hidden]) .key[data-key="mod:shift"]');
      await tapKey('.layer:not([hidden]) .key[data-key="' + lower.replace(/["\\]/g, '\\$&') + '"]');
    }
    await ev(() => { if (document.getElementById('layer-nav').hidden === false) document.querySelector('#layer-nav .key[data-key="layer:qwerty"]').click(); });
  }
  const gridRowsOK = () => ev(() => {
    const bad = [];
    for (const g of document.querySelectorAll('.layer')) {
      const rows = {};
      for (const el of g.children) {
        const r = el.style.gridRow, w = parseInt(el.style.gridColumn.replace('span ', ''), 10);
        rows[r] = (rows[r] || 0) + w;
      }
      for (const [r, sum] of Object.entries(rows)) if (sum !== 60) bad.push(g.id + ' fila ' + r + '=' + sum);
    }
    return bad;
  });

  // ══ r4: mantener pulsado → variantes ══════════════════════════════════
  async function longPressSuite() {
    const LP_SHOTS = path.join(H.ROOT, 'reports', 'r4-shots');
    fs.mkdirSync(LP_SHOTS, {recursive: true});
    const lshot = (name, p) => (p || page).screenshot({path: path.join(LP_SHOTS, name + '.png')});
    const typedTexts = async () => (await lastCalls()).filter(c => c[0] === 'type').map(c => c[c.length - 1]);
    const center = async (sel, p) => { const b = await (p || page).locator(sel).boundingBox(); return {x: b.x + b.width / 2, y: b.y + b.height / 2}; };
    const keySel = k => '.layer:not([hidden]) .key[data-key="' + k.replace(/["\\]/g, '\\$&') + '"]';
    const popState = (p) => (p || page).evaluate(() => {
      const el = document.getElementById('lpop');
      return {open: !el.hidden, items: [...el.querySelectorAll('.lv')].map(x => x.textContent).join(' '),
              sel: VK.LongPress.selected(), mode: VK.LongPress.mode(), side: el.dataset.side, rect: el.getBoundingClientRect().toJSON()};
    });
    async function holdDown(k, ms) {
      const c = await center(keySel(k));
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      if (ms) await wait(ms);
      return c;
    }
    const cellCenter = i => center('#lpop .lv[data-i="' + i + '"]');
    const kbSig = () => ev(() => [...document.querySelectorAll('.layer')].map(g => g.id + ':' + g.children.length + ':' + g.style.gridTemplateRows).join('|')
                                 + '|kb=' + document.getElementById('kb').children.length + '|lpopInKb=' + !!document.querySelector('#kb #lpop'));

    await ev(() => VK.App.switchProfile('noche'));
    await ev(() => VK.Settings.set({longPress: true, lpDelay: 400, lpRelease: 'first', lpSize: 'm', lpHint: true, topRow: 'accents', press: 'sink'}));
    await wait(200);

    // L16: defaults + sanitize + perfiles v4 antiguos sin estos campos
    const defs = await ev(() => {
      const d = VK.Settings.PROFILE_DEFAULTS;
      const junk = VK.Settings.sanitizeProfile({lpDelay: 5, lpRelease: 'zzz', lpSize: 99, longPress: 'yes', lpHint: 0});
      const big = VK.Settings.sanitizeProfile({lpDelay: 99999});
      const old = VK.Settings.sanitizeStore({v: 4, active: 'x', order: ['x'], profiles: {x: {name: 'X', s: {theme: 'lab'}}}});
      return {d: [d.longPress, d.lpDelay, d.lpRelease], junk: [junk.lpDelay, junk.lpRelease, junk.lpSize, junk.longPress, junk.lpHint], big: big.lpDelay,
              old: [old.profiles.x.s.longPress, old.profiles.x.s.lpDelay]};
    });
    T.ok('L16 default ON · 400 ms · escribe la 1ª', JSON.stringify(defs.d) === '[true,400,"first"]', JSON.stringify(defs));
    T.ok('L16 sanitize: basura → límites/valores válidos', JSON.stringify(defs.junk) === '[200,"first","m",true,false]' && defs.big === 1200, JSON.stringify(defs));
    T.ok('L16 perfil v4 previo (sin campos) hereda ON/400', JSON.stringify(defs.old) === '[true,400]', JSON.stringify(defs.old));

    // L1: toques cortos idénticos a antes (secuencia mixta con y sin variantes, en orden)
    await H.resetCalls();
    await typeOnKb('hola ñandu 3.-x');
    await wait(300);
    const seq = (await typedTexts()).join('');
    T.ok('L1 toques cortos escriben exactamente lo tocado, en orden', seq === 'hola ñandu 3.-x', JSON.stringify(seq));
    T.ok('L1 ningún toque corto abrió el popup', !(await popState()).open);

    // L2: no abre antes del retardo; abre después, con las variantes de la tabla
    await H.resetCalls();
    await holdDown('e', 250);
    const early = await popState();
    T.ok('L2 a 250 ms (retardo 400) el popup aún no abre ni se escribió nada', !early.open && (await typedTexts()).length === 0, JSON.stringify(early));
    T.ok('L2 la tecla muestra la carga (clase holding)', await ev(() => document.querySelector('#layer-qwerty .key[data-key="e"]').classList.contains('holding')));
    await wait(300);
    const opened = await popState();
    T.ok('L2 a 550 ms el popup abre con é è ê ë € 3', opened.open && opened.items === 'é è ê ë € 3', JSON.stringify(opened));
    T.ok('L2 popup encima de la tecla, dentro de la ventana', opened.side === 'above' && opened.rect.left >= 0 && opened.rect.right <= 780 && opened.rect.top >= 0, JSON.stringify(opened.rect));
    T.ok('L3 la favorita (é) viene preseleccionada', opened.sel === 'é', opened.sel);
    // L12: el popup es overlay, el grid no cambia
    T.ok('L12 popup abierto: grid DOM = 60 por fila', (await gridRowsOK()).length === 0, (await gridRowsOK()).join(', '));
    await lshot('01-popup-e-midnight');
    await page.mouse.up();
    await wait(250);
    T.ok('L3 mantener + soltar sin moverse → é (una sola vez, sin la e)', JSON.stringify(await typedTexts()) === '["é"]', JSON.stringify(await typedTexts()));
    T.ok('L3 popup cerrado tras elegir', !(await popState()).open);

    // L4: deslizar a ê y soltar
    const sig0 = await kbSig();
    await H.resetCalls();
    await holdDown('e', 550);
    const sigOpen = await kbSig();
    const c2 = await cellCenter(2);
    await page.mouse.move(c2.x, c2.y, {steps: 6});
    T.ok('L4 deslizar resalta ê', (await popState()).sel === 'ê', (await popState()).sel);
    await lshot('02-slide-e-circumflex');
    await page.mouse.up();
    await wait(250);
    T.ok('L4 deslizar a ê y soltar → solo ê', JSON.stringify(await typedTexts()) === '["ê"]', JSON.stringify(await typedTexts()));
    T.ok('L12 el DOM del teclado es idéntico con y sin popup', sig0 === sigOpen && sig0 === await kbSig(), sig0 + ' vs ' + sigOpen);

    // L5: soltar lejos del popup cancela
    await H.resetCalls();
    await holdDown('a', 550);
    const sp = await center(keySel(' '));
    await page.mouse.move(sp.x, sp.y, {steps: 6});
    T.ok('L5 fuera del popup no hay selección', (await popState()).sel === null, (await popState()).sel);
    await page.mouse.up();
    await wait(250);
    T.ok('L5 soltar fuera → nada escrito, popup cerrado', (await typedTexts()).length === 0 && !(await popState()).open, JSON.stringify(await typedTexts()));
    T.ok('L5 la tecla de origen no queda marcada', await ev(() => !document.querySelector('#layer-qwerty .key.down, #layer-qwerty .key.lporigin')));

    // L6: Shift → variantes en mayúscula y Shift se consume; Bloq Mayús persiste
    await H.resetCalls();
    await tapKey(keySel('mod:shift'));
    await holdDown('n', 550);
    const up = await popState();
    T.ok('L6 con Shift: popup muestra Ñ', up.items === 'Ñ', up.items);
    await page.mouse.up();
    await wait(250);
    T.ok('L6 Shift + mantener n → Ñ y Shift se consume', JSON.stringify(await typedTexts()) === '["Ñ"]' && await ev(() => !VK.App.state.shift), JSON.stringify(await typedTexts()));
    await tapKey(keySel('mod:caps'));
    await H.resetCalls();
    await holdDown('a', 550);
    await page.mouse.up();
    await wait(250);
    T.ok('L6 Bloq Mayús + mantener a → Á, Bloq sigue activo', JSON.stringify(await typedTexts()) === '["Á"]' && await ev(() => VK.App.state.caps), JSON.stringify(await typedTexts()));
    await tapKey(keySel('mod:caps'));

    // dígitos y signos
    await H.resetCalls();
    await holdDown('3', 550);
    T.ok('dígito 3 → # · ³ ¾', (await popState()).items === '# · ³ ¾', (await popState()).items);
    const c1 = await cellCenter(1);
    await page.mouse.move(c1.x, c1.y, {steps: 4});
    await page.mouse.up();
    await wait(250);
    T.ok('mantener 3 y deslizar a · → ·', JSON.stringify(await typedTexts()) === '["·"]', JSON.stringify(await typedTexts()));

    // L13: Ctrl armado → atajo al bajar, sin popup
    await H.resetCalls();
    await tapKey(keySel('mod:ctrl'));
    await holdDown('e', 600);
    T.ok('L13 Ctrl + mantener e: sin popup', !(await popState()).open);
    await page.mouse.up();
    await wait(200);
    T.ok('L13 Ctrl + e → /key ctrl+e (al bajar)', JSON.stringify(await lastCalls()) === '[["key","--clearmodifiers","--","ctrl+e"]]', JSON.stringify(await lastCalls()));

    // L17: Esc cierra
    await holdDown('o', 550);
    await page.mouse.up();   // modo first: escribe ó; reabrir en modo stay para Esc
    await ev(() => VK.Settings.set({lpRelease: 'stay'}));
    await H.resetCalls();
    await holdDown('o', 550);
    await page.mouse.up();
    await wait(150);
    const sticky = await popState();
    T.ok('L9 modo «queda abierto»: soltar sin moverse deja el popup y no escribe', sticky.open && sticky.mode === 'sticky' && (await typedTexts()).length === 0, JSON.stringify(sticky));
    await lshot('03-sticky-o');
    await page.keyboard.press('Escape');
    await wait(100);
    T.ok('L17 Esc cierra el popup sin escribir', !(await popState()).open && (await typedTexts()).length === 0);

    // L9: tocar fuera se consume; tocar una variante la escribe
    await holdDown('e', 550);
    await page.mouse.up();
    await tapKey(keySel('q'));
    await wait(200);
    T.ok('L9 tocar otra tecla con el popup abierto: cierra y NO teclea', !(await popState()).open && (await typedTexts()).length === 0, JSON.stringify(await typedTexts()));
    await tapKey('#btnCfg');
    await wait(100);
    T.ok('L9 …ni activa el botón de la barra', await ev(() => VK.PrefsUI.isOpen()) === true, 'sin popup el botón sí debe abrir');
    await tapKey('#sheetWrap .x');
    await holdDown('e', 550);
    await page.mouse.up();
    await tapKey('#btnCfg');
    await wait(100);
    T.ok('L9 con popup abierto, tocar ⚙ solo cierra el popup', await ev(() => !VK.PrefsUI.isOpen()) && !(await popState()).open);
    await holdDown('e', 550);
    await page.mouse.up();
    await tapKey('#lpop .lv[data-i="3"]');
    await wait(250);
    T.ok('L9 tocar ë en el popup → ë', JSON.stringify(await typedTexts()) === '["ë"]', JSON.stringify(await typedTexts()));
    // en modo stay, deslizar y soltar sobre una variante sigue funcionando
    await H.resetCalls();
    await holdDown('u', 550);
    const cu = await cellCenter(1);
    await page.mouse.move(cu.x, cu.y, {steps: 5});
    await page.mouse.up();
    await wait(250);
    T.ok('L9 modo stay: deslizar a ü y soltar → ü', JSON.stringify(await typedTexts()) === '["ü"]', JSON.stringify(await typedTexts()));
    await ev(() => VK.Settings.set({lpRelease: 'first'}));

    // L7: apagado → escribe al bajar, nunca popup
    await ev(() => VK.Settings.set({longPress: false}));
    await wait(100);
    await H.resetCalls();
    await holdDown('e', 80);
    T.ok('L7 apagado: la e se escribe al BAJAR (como antes)', JSON.stringify(await typedTexts()) === '["e"]', JSON.stringify(await typedTexts()));
    await wait(600);
    T.ok('L7 apagado: mantener 680 ms no abre popup', !(await popState()).open);
    await page.mouse.up();
    await wait(200);
    T.ok('L7 apagado: soltar no escribe nada más', JSON.stringify(await typedTexts()) === '["e"]', JSON.stringify(await typedTexts()));
    T.ok('L7 apagado: sin punto de pista', await ev(() => document.documentElement.dataset.lphint === 'off'));
    await ev(() => VK.Settings.set({longPress: true}));

    // L8: retardo configurable
    await ev(() => VK.Settings.set({lpDelay: 800}));
    await H.resetCalls();
    await holdDown('i', 550);
    const at550 = (await popState()).open;
    await wait(400);
    const at950 = (await popState()).open;
    await page.mouse.up();
    await wait(200);
    T.ok('L8 retardo 800 ms: cerrado a 550, abierto a 950', !at550 && at950, at550 + '/' + at950);
    T.ok('L8 y escribe la favorita í', JSON.stringify(await typedTexts()) === '["í"]', JSON.stringify(await typedTexts()));
    await ev(() => VK.Settings.set({lpDelay: 400}));

    // L15: fila superior (acentos) → el popup se abre debajo y dentro de la ventana
    await holdDown('¿', 550);
    const top = await popState();
    T.ok('L15 tecla de la fila superior: popup debajo, dentro de la ventana',
         top.open && top.side === 'below' && top.rect.top >= 0 && top.rect.bottom <= 430 && top.rect.left >= 0 && top.rect.right <= 780, JSON.stringify(top));
    await lshot('04-top-row-below');
    await page.mouse.move(5, 425, {steps: 4});
    await page.mouse.up();
    await holdDown('€', 550);
    const edge = await popState();
    T.ok('L15 tecla en el borde derecho: popup no se sale', edge.open && edge.rect.right <= 780 - 3, JSON.stringify(edge.rect));
    await page.mouse.move(5, 425, {steps: 4});
    await page.mouse.up();

    // L11: modo composición → la variante entra al campo, nada al escritorio
    await H.resetCalls();
    await ev(() => { VK.App.Compose.start({kind: 'text', label: 'Prueba'}); });
    await holdDown('a', 550);
    const ca = await cellCenter(1);
    await page.mouse.move(ca.x, ca.y, {steps: 4});
    await page.mouse.up();
    await tapKey(keySel('n'));
    await wait(200);
    const cv = await ev(() => VK.App.Compose.value);
    T.ok('L11 composición: mantener a→à + tap n = «àn» en el campo', cv === 'àn', JSON.stringify(cv));
    T.ok('L11 composición: nada llegó al escritorio', (await lastCalls()).length === 0, JSON.stringify(await lastCalls()));
    await ev(() => VK.App.Compose.finish(null));

    // tamaño + temas (capturas)
    await ev(() => VK.Settings.set({lpSize: 'l'}));
    await holdDown('o', 550);
    const big = (await popState()).rect.height;
    await lshot('05-popup-large');
    await page.mouse.move(5, 425, {steps: 4}); await page.mouse.up();
    await ev(() => VK.Settings.set({lpSize: 's'}));
    await holdDown('o', 550);
    const small = (await popState()).rect.height;
    await page.mouse.move(5, 425, {steps: 4}); await page.mouse.up();
    T.ok('tamaño del popup configurable (grande > chico)', big > small * 1.3, big + ' vs ' + small);
    await ev(() => VK.Settings.set({lpSize: 'm'}));
    await ev(() => VK.App.switchProfile('dia'));
    await wait(1400);   // que el toast de perfil (1.1 s) no tape la captura
    await holdDown('a', 550);
    await lshot('06-popup-a-papiro');
    await page.mouse.move(5, 425, {steps: 4}); await page.mouse.up();
    await ev(() => VK.App.switchProfile('noche'));
    await wait(1400);

    // ajustes: sección visible + toggle desde la UI + persistencia en el server
    await tapKey('#btnCfg');
    await tapKey('#sheetRail [data-tab="board"]');
    await wait(100);
    const ui = await ev(() => ({sec: !!document.querySelector('#sheetContent h3.sec'), slider: document.querySelector('#rgLpDelay') && document.querySelector('#rgLpDelay').value,
                               seg: !!document.querySelector('[data-seg="lpRelease"]')}));
    T.ok('ajustes › Teclado muestra la sección (switch, tiempo, modo, tamaño, pista)', ui.sec && ui.slider === '400' && ui.seg, JSON.stringify(ui));
    await page.locator('#sheetContent').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await lshot('07-ajustes-longpress');
    await page.locator('#rgLpDelay').fill('650');
    await tapKey('#sheetContent [data-seg="longPress"] [data-v="0"]');
    const off = await ev(() => ({on: VK.Settings.get().longPress, slider: !!document.querySelector('#rgLpDelay'), d: VK.Settings.get().lpDelay}));
    T.ok('UI: slider fija 650 ms; switch apaga y oculta las opciones', off.on === false && !off.slider && off.d === 650, JSON.stringify(off));
    await wait(900);
    const disk = JSON.parse(fs.readFileSync(path.join(srv.stateDir, 'prefs.json'), 'utf8'));
    T.ok('L16 persistido en el server (perfil activo: off, 650 ms)', disk.profiles.noche.s.longPress === false && disk.profiles.noche.s.lpDelay === 650,
         JSON.stringify({lp: disk.profiles.noche.s.longPress, d: disk.profiles.noche.s.lpDelay}));
    T.ok('L16 por perfil: Día sigue encendido', disk.profiles.dia.s.longPress === true);
    await tapKey('#sheetContent [data-seg="longPress"] [data-v="1"]');
    await page.locator('#rgLpDelay').fill('400');
    await tapKey('#sheetWrap .x');

    // L14: touch (CDP) — mismo comportamiento que el ratón + rollover de dos dedos
    const tctx = await browser.newContext({viewport: {width: 780, height: 430}, hasTouch: true});
    const tp = await tctx.newPage();
    tp.on('pageerror', e => errors.push('touch pageerror: ' + e));
    await tp.goto(URL);
    await tp.waitForFunction(() => window.VK && VK.Settings && document.querySelector('#layer-qwerty .key[data-key="e"]'));
    await tp.evaluate(() => VK.Settings.sync());
    await tp.waitForTimeout(400);
    await tp.evaluate(() => VK.Settings.set({longPress: true, lpDelay: 400, lpRelease: 'first'}));
    const cdp = await tctx.newCDPSession(tp);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: pts.map((p, i) => ({x: p.x, y: p.y, id: p.id === undefined ? i : p.id}))});
    const te = await center('#layer-qwerty .key[data-key="e"]', tp);
    await H.resetCalls();
    await touch('touchStart', [te]); await tp.waitForTimeout(80); await touch('touchEnd', []);
    await tp.waitForTimeout(250);
    T.ok('L14 touch: toque corto → e', JSON.stringify(await typedTexts()) === '["e"]', JSON.stringify(await typedTexts()));
    await H.resetCalls();
    await touch('touchStart', [te]);
    await tp.waitForTimeout(550);
    const tpop = await popState(tp);
    T.ok('L14 touch: mantener abre el popup', tpop.open && tpop.items === 'é è ê ë € 3', JSON.stringify(tpop));
    const t1 = await center('#lpop .lv[data-i="1"]', tp);
    for (let i = 1; i <= 5; i++) { await touch('touchMove', [{x: te.x + (t1.x - te.x) * i / 5, y: te.y + (t1.y - te.y) * i / 5}]); await tp.waitForTimeout(20); }
    await tp.screenshot({path: path.join(LP_SHOTS, '08-touch-slide.png')});
    await touch('touchEnd', []);
    await tp.waitForTimeout(250);
    T.ok('L14 touch: deslizar a è y levantar → è', JSON.stringify(await typedTexts()) === '["è"]', JSON.stringify(await typedTexts()));
    // L10: rollover: e (pendiente) + x antes de soltar e → «ex» en orden
    const tx = await center('#layer-qwerty .key[data-key="x"]', tp);
    await H.resetCalls();
    await touch('touchStart', [{x: te.x, y: te.y, id: 0}]);
    await tp.waitForTimeout(60);
    await touch('touchStart', [{x: te.x, y: te.y, id: 0}, {x: tx.x, y: tx.y, id: 1}]);
    await tp.waitForTimeout(60);
    await touch('touchEnd', []);
    await tp.waitForTimeout(600);
    T.ok('L10 rollover (e pendiente + x) → «e», «x» en orden, sin popup', JSON.stringify(await typedTexts()) === '["e","x"]' && !(await popState(tp)).open,
         JSON.stringify(await typedTexts()));
    await tctx.close();

    T.ok('L12 grid DOM final = 60 por fila', (await gridRowsOK()).length === 0, (await gridRowsOK()).join(', '));
  }

  // VK_E2E_ONLY=longpress → solo la suite r4 sobre un estado de fábrica (iteración rápida / mutaciones)
  if (process.env.VK_E2E_ONLY === 'longpress') {
    await page.goto(URL);
    await ev(() => localStorage.clear());
    await page.reload();
    await wait(700);
    await longPressSuite();
    T.ok('sin errores JS en toda la sesión', errors.length === 0, errors.join(' | '));
    const f = T.summary();
    await browser.close(); srv.proc.kill(); fs.rmSync(srv.stateDir, {recursive: true, force: true});
    process.exit(f ? 1 : 0);
  }

  // ── F1: migración v3 → v4 ─────────────────────────────────────────────
  await page.goto(URL);
  await ev(() => { localStorage.clear(); localStorage.setItem('resyst-vk.settings', JSON.stringify(
    {theme: 'lab', scale: 1.15, opacity: 1, sound: true, repeatStart: 400, suggest: true, lang: 'en'})); });
  await page.reload();
  await wait(700);
  const mig = await ev(() => ({s: VK.Settings.get(), active: VK.Settings.active(), n: VK.Settings.profiles().length,
                              scale: getComputedStyle(document.documentElement).getPropertyValue('--scale').trim()}));
  T.ok('F1 migración: perfil activo = noche', mig.active === 'noche', mig.active);
  T.ok('F1 migración conserva escala/sonido/repetición/idioma',
       mig.s.scale === 1.15 && mig.s.sound === true && mig.s.repeatStart === 400 && mig.s.lang === 'en', JSON.stringify(mig.s));
  T.ok('F1 migración: --scale aplicado', mig.scale === '1.15', mig.scale);
  T.ok('F1 4 perfiles sembrados', mig.n === 4, mig.n);
  const juegoS = await ev(() => VK.Settings.profile('juego').s);
  T.ok('F1 perfiles nuevos heredan escala/idioma del usuario', juegoS.scale === 1.15 && juegoS.lang === 'en', JSON.stringify(juegoS));
  T.ok('carga sin errores JS', errors.length === 0, errors.join(' | '));
  T.ok('F6 grid DOM inicial = 60 por fila', (await gridRowsOK()).length === 0, (await gridRowsOK()).join(', '));
  await H.resetCalls();
  await tapKey('#layer-qwerty .key[data-key="h"]');
  await wait(250);
  T.ok('teclear sigue funcionando tras migrar', JSON.stringify(await lastCalls()).includes('"--","h"'), JSON.stringify(await lastCalls()));
  await shot('01-noche-midnight');

  // ── F7: copia durable en el server ────────────────────────────────────
  await wait(600);
  const disk = JSON.parse(fs.readFileSync(path.join(srv.stateDir, 'prefs.json'), 'utf8'));
  T.ok('F7 prefs.json escrito por el widget', disk.v === 4 && disk.profiles && disk.profiles.noche, Object.keys(disk));

  // ── F2: cambio de perfil desde la barra ───────────────────────────────
  await H.resetCalls();
  await tapKey('#btnProfile');
  T.ok('menú de perfiles abre con 4 + auto + administrar', await ev(() => !document.getElementById('profMenu').hidden && document.querySelectorAll('#profMenu button').length === 6));
  await shot('02-menu-perfiles');
  await tapKey('#profMenu [data-p="dia"]');
  await wait(300);
  const dia = await ev(() => ({theme: document.documentElement.dataset.theme, bg: getComputedStyle(document.body).backgroundColor,
    btn: document.querySelector('#btnProfile .pn').textContent, toast: document.getElementById('toast').classList.contains('show'),
    space: document.querySelector('#layer-qwerty .key.space .lg').textContent}));
  T.ok('F2 Día: tema papiro aplicado', dia.theme === 'paper' && dia.bg === 'rgb(239, 233, 220)', JSON.stringify(dia));
  T.ok('F2 Día: botón + toast + barra espaciadora muestran el perfil', dia.btn === 'Día' && dia.toast && dia.space === 'en · Día', JSON.stringify(dia));
  await shot('03-dia-papiro');

  // ── F3: atajo global → /profile → long-poll ───────────────────────────
  const t0 = Date.now();
  await post('/profile', {id: 'juego'});
  const dt = await until(() => VK.Settings.active() === 'juego', null, 3000);
  T.ok('F3 atajo global llega al widget (< 1.5 s)', dt >= 0 && Date.now() - t0 < 1500, 'dt=' + dt);
  await wait(300);
  const juego = await ev(() => ({theme: document.documentElement.dataset.theme, rows: document.getElementById('layer-qwerty').style.gridTemplateRows,
    sug: VK.Settings.get().suggest, press: document.documentElement.dataset.press}));
  T.ok('F2 Juego: arcade + tablero compacto (5 filas) + sin sugerencias + brillo',
       juego.theme === 'arcade' && juego.rows.startsWith('repeat(5') && juego.sug === false && juego.press === 'glow', JSON.stringify(juego));
  const geo = (await H.calls()).filter(c => c[0] === 'windowgeom').pop();
  T.ok('F2 Juego: ventana preset chico abajo-derecha', geo && geo[3] === 640 && geo[4] === 330 && geo[1] === 1270, JSON.stringify(geo));
  T.ok('F6 grid DOM compacto = 60 por fila', (await gridRowsOK()).length === 0, (await gridRowsOK()).join(', '));
  await shot('04-juego-arcade-compacto');
  await post('/profile', {id: 'next'});
  T.ok('F3 profile next → escritura', await until(() => VK.Settings.active() === 'escritura') >= 0);
  await post('/profile', {id: 'Noche'});
  T.ok('F3 profile por nombre (Noche)', await until(() => VK.Settings.active() === 'noche') >= 0);
  await post('/profile', {id: 'no-existe'});
  await wait(400);
  T.ok('F3 perfil desconocido → aviso, sin cambio', await ev(() => VK.Settings.active() === 'noche' && /desconocido/.test(document.getElementById('msg').textContent)));

  // ── F9: contraste del acento en todos los temas × acentos ──────────────
  const worst = await ev(() => {
    let min = 99, at = '';
    for (const th of Object.keys(VK.THEMES)) {
      for (const [hex] of VK.ACCENTS.concat([['#ffff00'], ['#101010'], ['#ffffff'], [null]])) {
        const v = VK.Look.palette(th, hex).vars;
        const c1 = VK.util.contrast(v.accent, v.key), c2 = VK.util.contrast(v.accentInk, v.accent);
        if (Math.min(c1, c2 * 4.5 / 4.5) < min) { min = Math.min(c1, c2); at = th + '/' + hex + ' acc=' + c1.toFixed(2) + ' ink=' + c2.toFixed(2); }
      }
    }
    return {min, at};
  });
  T.ok('F9 acento ≥ 4.5:1 sobre tecla y tinta ≥ 4.5:1 sobre acento (todas las combinaciones)', worst.min >= 4.5, JSON.stringify(worst));

  // ── hoja de personalización: apariencia en vivo ───────────────────────
  await tapKey('#btnCfg');
  await tapKey('#sheetRail [data-tab="look"]');
  await tapKey('#sheetContent [data-accent="#4fc58f"]');
  await tapKey('#sheetContent [data-seg="shape"] [data-v="round"]');
  await tapKey('#sheetContent [data-seg="cap"] [data-v="outline"]');
  await wait(150);
  const look = await ev(() => ({acc: getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
    radius: getComputedStyle(document.querySelector('#layer-qwerty .key')).borderTopLeftRadius,
    bg: getComputedStyle(document.querySelector('#layer-qwerty .key[data-key="q"]')).backgroundColor,
    saved: VK.Settings.get()}));
  T.ok('acento propio aplicado en vivo (menta)', look.acc === '#4fc58f' && look.saved.accent === '#4fc58f', look.acc);
  T.ok('forma redonda + tecla contorno aplicadas', look.radius === '14px' && look.bg === 'rgba(0, 0, 0, 0)', JSON.stringify(look));
  await shot('05-ajustes-apariencia');
  await tapKey('#sheetContent [data-theme="hc"]');
  await wait(100);
  await shot('06-alto-contraste');
  await tapKey('#sheetContent [data-theme="lab"]');
  await tapKey('#sheetContent [data-accent=""]');
  await tapKey('#sheetContent [data-seg="shape"] [data-v="soft"]');
  await tapKey('#sheetContent [data-seg="cap"] [data-v="raised"]');
  const otherUntouched = await ev(() => VK.Settings.profile('dia').s.shape === 'soft' && VK.Settings.profile('dia').s.accent === null);
  T.ok('F2 editar un perfil no toca los otros', otherUntouched);

  // ── F6/F5: fila personal + macros ─────────────────────────────────────
  await tapKey('#sheetRail [data-tab="board"]');
  await tapKey('#sheetContent [data-seg="topRow"] [data-v="personal"]');
  await wait(150);
  const prow = await ev(() => [...document.querySelectorAll('#layer-qwerty .key.macro')].map(k => k.textContent));
  T.ok('fila personal muestra las 9 macros sembradas', prow.length === 9 && prow[0] === 'Copiar', JSON.stringify(prow));
  T.ok('F6 grid DOM personal = 60 por fila', (await gridRowsOK()).length === 0, (await gridRowsOK()).join(', '));
  await shot('07-ajustes-teclado');
  await tapKey('#sheetWrap .x');
  await shot('08-fila-personal');
  await H.resetCalls();
  await tapKey('#layer-qwerty .key[data-key="macro:copy"]');
  await wait(250);
  T.ok('F5 macro Copiar → /key ctrl+c', JSON.stringify(await lastCalls()) === '[["key","--clearmodifiers","--","ctrl+c"]]', JSON.stringify(await lastCalls()));

  // ── F4: crear macro de texto con el propio teclado (sin fugas) ────────
  await tapKey('#btnMacros');
  await shot('09-macros');
  await tapKey('#macroBody [data-new]');
  await H.resetCalls();
  await tapKey('#macroBody [data-f="label"]');
  T.ok('composición: panel oculto + barra visible', await ev(() => document.getElementById('macroWrap').hidden && !document.getElementById('compose').hidden));
  await typeOnKb('Firma');
  await shot('10-composicion');
  await tapKey('#cOk');
  await tapKey('#macroBody [data-f="body"]');
  await typeOnKb('Saludos, Alan {fecha}');
  await tapKey('.layer:not([hidden]) .key[data-key="Return"]');   // multilinea → salto
  await typeOnKb('ok');
  await tapKey('#cOk');
  const leaked = await lastCalls();
  T.ok('F4 ninguna tecla llegó al escritorio durante la edición', leaked.length === 0, JSON.stringify(leaked));
  const draft = await ev(() => document.querySelector('#macroBody .editor') && document.querySelector('#macroBody [data-f="body"]').textContent);
  T.ok('F4 texto compuesto con mayúsculas, signos, llaves y salto', draft === 'Saludos, Alan {fecha}↵ok', JSON.stringify(draft));
  await shot('11-editor-macro');
  await tapKey('#macroBody [data-f="save"]');
  const saved = await ev(() => VK.Settings.macros().find(m => m.label === 'Firma'));
  T.ok('F5 macro guardada tal cual', saved && saved.kind === 'text' && saved.body === 'Saludos, Alan {fecha}\nok', JSON.stringify(saved));
  await tapKey('#macroBody [data-pin="' + saved.id + '"]');
  T.ok('macro fijada en la fila personal (10 teclas)', await ev(() => document.querySelectorAll('#layer-qwerty .key.macro').length === 10));
  T.ok('F6 grid DOM con 10 macros = 60 por fila', (await gridRowsOK()).length === 0, (await gridRowsOK()).join(', '));
  await tapKey('#macroWrap .x');
  await H.resetCalls();
  await tapKey('#layer-qwerty .key[data-key="macro:' + saved.id + '"]');
  await wait(300);
  const d = new Date(); const p2 = n => String(n).padStart(2, '0');
  const today = p2(d.getDate()) + '-' + p2(d.getMonth() + 1) + '-' + d.getFullYear();
  const typed = await lastCalls();
  T.ok('F5 {fecha} expandida y salto preservado al ejecutar', typed.length === 1 && typed[0][typed[0].length - 1] === 'Saludos, Alan ' + today + '\nok', JSON.stringify(typed));

  // ── F4/F5: grabar macro de atajo ──────────────────────────────────────
  await tapKey('#btnMacros');
  await tapKey('#macroBody [data-new]');
  await tapKey('#macroBody [data-f="kind:keys"]');
  await H.resetCalls();
  await tapKey('#macroBody [data-f="body"]');
  await tapKey('.layer:not([hidden]) .key[data-key="mod:ctrl"]');
  await tapKey('.layer:not([hidden]) .key[data-key="mod:shift"]');
  await tapKey('.layer:not([hidden]) .key[data-key="t"]');
  await tapKey('#cSuper');
  await tapKey('.layer:not([hidden]) .key[data-key="Left"]');
  await tapKey('#cOk');
  const rec = await ev(() => document.querySelector('#macroBody [data-f="body"]').textContent);
  T.ok('F4 grabación sin fugas', (await lastCalls()).length === 0, JSON.stringify(await lastCalls()));
  T.ok('F5 atajo grabado = ctrl+shift+t super+Left', rec === 'ctrl+shift+tsuper+Left', rec);
  await tapKey('#macroBody [data-f="save"]');
  const km = await ev(() => VK.Settings.macros().find(m => m.kind === 'keys' && m.body === 'ctrl+shift+t super+Left'));
  T.ok('F5 macro de atajo guardada', !!km, JSON.stringify(km));
  await tapKey('#macroWrap .x');

  // ── F8: perfil automático por app ─────────────────────────────────────
  await ev(() => VK.Settings.assignApp('juego', 'steam'));
  await post('/debug/focus', {class: 'steam'});
  const ta = await until(() => VK.Settings.active() === 'juego', null, 5000);
  T.ok('F8 enfocar steam → Juego automático', ta >= 0, 'ta=' + ta);
  T.ok('F8 indicador AUTO visible', await ev(() => !document.querySelector('#btnProfile .auto').hidden));
  await shot('12-auto-juego');
  await post('/debug/focus', {class: 'kate'});
  T.ok('F8 salir de steam → vuelve a Noche (base)', await until(() => VK.Settings.active() === 'noche', null, 5000) >= 0);
  await post('/debug/focus', {class: 'steam'});
  await until(() => VK.Settings.active() === 'juego', null, 5000);
  await tapKey('#btnProfile');
  await tapKey('#profMenu [data-p="escritura"]');
  await wait(4500);   // dos ciclos de /health con steam aún enfocado
  T.ok('F8 elección manual dentro de la app asociada se respeta', await ev(() => VK.Settings.active() === 'escritura'));
  await post('/debug/focus', {class: 'kate'});
  T.ok('F8 al salir vuelve a la elección manual (Escritura), no a Noche', await until(() => VK.Settings.active() === 'escritura', null, 3000) >= 0
       && await ev(() => VK.Settings.active() === 'escritura'));
  await post('/debug/focus', {class: ''});
  await tapKey('#btnProfile');
  await tapKey('#profMenu [data-p="noche"]');

  // ── F10: arrastrar la ventana ─────────────────────────────────────────
  await H.resetCalls();
  const g = await page.locator('#grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
  await page.mouse.down();
  await wait(150);
  for (let i = 1; i <= 6; i++) { await page.mouse.move(g.x + g.width / 2 - 40 * i, g.y + g.height / 2 - 20 * i); await wait(60); }
  await page.mouse.up();
  await wait(400);
  const win = await ev(() => VK.Settings.get().win);
  const moves = (await H.calls()).filter(c => c[0] === 'windowgeom');
  T.ok('F10 arrastre mueve la ventana (varias llamadas)', moves.length >= 2, JSON.stringify(moves));
  T.ok('F10 posición libre persistida en el perfil', win.anchor === 'free' && win.x === 1130 - 240 && win.y === 620 - 120, JSON.stringify(win));

  // ── F11: importar basura no corrompe ──────────────────────────────────
  const before = await ev(() => JSON.stringify(VK.Settings.store()));
  const imp = await ev(() => { try { VK.Settings.importJSON('{"hola":1}'); return 'aceptó'; } catch (e) { return e.message; } });
  T.ok('F11 import inválido rechazado sin tocar el estado', imp === 'formato no reconocido' && before === await ev(() => JSON.stringify(VK.Settings.store())), imp);
  const roundtrip = await ev(() => { const j = VK.Settings.exportJSON(); VK.Settings.importJSON(j); return JSON.parse(j).format; });
  T.ok('F11 export → import ida y vuelta', roundtrip === 'resyst-vk/4', roundtrip);

  // ── F7: borrar el perfil de Chrome y volver ───────────────────────────
  await ev(() => VK.Settings.set({accent: '#e06c9f'}));
  await wait(900);
  await ev(() => localStorage.clear());
  await page.reload();
  T.ok('F7 tras borrar localStorage, la personalización vuelve del server',
       await until(() => VK.Settings.get().accent === '#e06c9f' && VK.Settings.macros().some(m => m.label === 'Firma'), null, 4000) >= 0,
       await ev(() => JSON.stringify({acc: VK.Settings.get().accent, n: VK.Settings.macros().length})));
  T.ok('F7 la fila personal se reconstruye tras restaurar', await until(() => document.querySelectorAll('#layer-qwerty .key.macro').length === 10, null, 3000) >= 0);
  await ev(() => VK.Settings.set({accent: null}));

  // ── capturas de los temas restantes ───────────────────────────────────
  await ev(() => VK.App.switchProfile('escritura'));
  await wait(300); await shot('13-escritura-pizarra');
  await tapKey('#btnCfg'); await tapKey('#sheetRail [data-tab="profiles"]'); await wait(100); await shot('14-ajustes-perfiles');
  await tapKey('#sheetRail [data-tab="window"]'); await wait(300); await shot('15-ajustes-ventana');
  await tapKey('#sheetRail [data-tab="sound"]'); await wait(100); await shot('16-ajustes-sonido');
  await tapKey('#sheetWrap .x');
  await ev(() => VK.App.switchProfile('noche'));
  await wait(200);

  await longPressSuite();

  T.ok('sin errores JS en toda la sesión', errors.length === 0, errors.join(' | '));
  const failed = T.summary();
  fs.writeFileSync(path.join(SHOTS, 'widget_e2e.json'), JSON.stringify({
    when: new Date().toISOString(), passed: T.results.length - failed, failed, results: T.results,
  }, null, 2));
  await browser.close();
  srv.proc.kill();
  fs.rmSync(srv.stateDir, {recursive: true, force: true});
  process.exit(failed ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(2); });
