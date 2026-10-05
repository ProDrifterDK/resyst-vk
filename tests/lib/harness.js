/* Resyst VK — harness E2E del widget (Playwright headless + server en VK_DRY_RUN).
   No toca el escritorio: el server dry-run solo registra argv, y Chromium es headless. */
'use strict';
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

function loadPlaywright() {
  const candidates = [
    process.env.VK_PLAYWRIGHT,
    'playwright-core',
  ].filter(Boolean);
  for (const c of candidates) {
    try { return require(c); } catch (_) {}
  }
  throw new Error('playwright-core no encontrado (define VK_PLAYWRIGHT=/ruta/a/playwright-core)');
}

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.VK_TEST_PORT || 17699);
const BASE = 'http://127.0.0.1:' + PORT;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function startServer(extraEnv) {
  // Si ya hay algo en el puerto (p. ej. un server huérfano de una corrida que crasheó), el poll de
  // /health de abajo lo «encontraría» y el suite correría contra estado viejo: fallar claro.
  try {
    await fetch(BASE + '/health', {signal: AbortSignal.timeout(500)});
    throw new Error('puerto ' + PORT + ' ocupado (¿server dry-run huérfano?): ciérralo o usa VK_TEST_PORT');
  } catch (e) { if (/ocupado/.test(e.message)) throw e; }
  const stateDir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'vk-e2e-state-'));
  const proc = spawn('python3', [path.join(ROOT, 'vk_server.py')], {
    env: Object.assign({}, process.env, {VK_PORT: String(PORT), VK_DRY_RUN: '1', VK_STATE_DIR: stateDir}, extraEnv || {}),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  proc.stdout.on('data', d => { log += d; });
  proc.stderr.on('data', d => { log += d; });
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(BASE + '/health'); if (r.ok) return {proc, stateDir, log: () => log}; } catch (_) {}
    await sleep(100);
  }
  proc.kill();
  throw new Error('server dry-run no arrancó: ' + log);
}

async function calls() {
  const r = await fetch(BASE + '/debug/calls');
  return (await r.json()).calls;
}
async function resetCalls() { await fetch(BASE + '/debug/calls', {method: 'DELETE'}); }

class Suite {
  constructor(name) { this.name = name; this.results = []; }
  ok(name, cond, detail) {
    this.results.push({name, pass: !!cond, detail: cond ? '' : String(detail === undefined ? '' : detail)});
    console.log((cond ? 'PASS ' : 'FAIL ') + name + (cond ? '' : ' :: ' + detail));
  }
  get failed() { return this.results.filter(r => !r.pass).length; }
  summary() {
    const n = this.results.length, f = this.failed;
    console.log(f ? `SOME FAILED (${f}/${n})` : `ALL PASS (${n})`);
    return f;
  }
}

module.exports = { loadPlaywright, ROOT, PORT, BASE, sleep, startServer, calls, resetCalls, Suite };
