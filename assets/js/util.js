/* Resyst VK — utilidades compartidas (clásico script, compatible con file://).
   Cada módulo aporta al namespace global VK. */
'use strict';
window.VK = window.VK || {};

VK.util = (() => {

  const LS_PREFIX = 'resyst-vk.';

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch (_) {}
  }
  function lsDel(key) {
    try { localStorage.removeItem(LS_PREFIX + key); } catch (_) {}
  }

  function debounce(fn, ms) {
    let t = 0;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.cancel = () => clearTimeout(t);
    return d;
  }

  function throttle(fn, ms) {
    let last = 0, t = 0;
    return (...a) => {
      const now = Date.now();
      if (now - last >= ms) { last = now; fn(...a); }
      else { clearTimeout(t); t = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }
    };
  }

  const escapeHtml = s => String(s).replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  class Evt {
    constructor() { this.m = new Map(); }
    on(ev, fn) {
      if (!this.m.has(ev)) this.m.set(ev, new Set());
      this.m.get(ev).add(fn);
      return () => this.off(ev, fn);
    }
    off(ev, fn) { const s = this.m.get(ev); if (s) s.delete(fn); }
    emit(ev, ...args) {
      const s = this.m.get(ev);
      if (s) for (const fn of [...s]) { try { fn(...args); } catch (e) { console.error(e); } }
    }
  }

  // Fusión superficial de objetos planos (los defaults ganan solo donde falta la clave).
  function applyDefaults(target, defaults) {
    for (const k of Object.keys(defaults)) {
      if (target[k] === undefined) target[k] = defaults[k];
    }
    return target;
  }

  const fmtTime = ts => new Date(ts).toLocaleTimeString('es', {hour12: false});

  // ── color (sRGB, WCAG 2.x) ──────────────────────────────────────────
  const HEX_RE = /^#([0-9a-f]{6})$/i;
  const isHex = s => typeof s === 'string' && HEX_RE.test(s);
  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = rgb => '#' + rgb.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));
  const rgba = (h, a) => 'rgba(' + hexToRgb(h).join(',') + ',' + a + ')';
  function luminance(h) {
    const [r, g, b] = hexToRgb(h).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }
  // Acerca `fg` a blanco (fondo oscuro) o negro (fondo claro) hasta lograr `min`:1 sobre `bg`.
  function ensureContrast(fg, bg, min) {
    const target = luminance(bg) < 0.4 ? '#ffffff' : '#000000';
    let c = fg;
    for (let t = 0.05; contrast(c, bg) < min && t <= 1.0001; t += 0.05) c = mix(fg, target, t);
    return c;
  }

  function hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
  }

  return { clamp, lsGet, lsSet, lsDel, debounce, throttle, escapeHtml, Evt, applyDefaults, fmtTime,
           isHex, hexToRgb, rgbToHex, mix, rgba, luminance, contrast, ensureContrast, hslToHex };
})();
