/* Resyst VK — sonido de tecla sintetizado (WebAudio, sin assets), 4 packs + volumen.
   click  : el click v3 (ráfaga filtrada + blip)          — neutro
   thock  : grave y redondo (lowpass + seno 150 Hz)        — teclado mecánico lubricado
   type   : máquina de escribir (golpe seco metálico; Intro = campanilla)
   bubble : pop tonal ascendente                           — juguetón, poco cansador */
'use strict';
window.VK = window.VK || {};

VK.Sound = (() => {
  let ctx = null, master = null;
  let pack = 'click';
  let volume = 0.7;

  // El AudioContext se crea en el primer gesto (política de autoplay de Chrome).
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function configure(opts) {
    if (opts.pack) pack = opts.pack;
    if (typeof opts.volume === 'number') {
      volume = Math.max(0, Math.min(1, opts.volume));
      if (master) master.gain.value = volume;
    }
  }

  function noise(c, dur, shape) {
    const n = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, shape);
    const src = c.createBufferSource();
    src.buffer = buf;
    return src;
  }
  function env(c, t, peak, dur) {
    const g = c.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    return g;
  }
  function tone(c, t, type, f0, f1, peak, dur) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.9);
    o.connect(env(c, t, peak, dur)).connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(c, t, dur, ftype, freq, q, peak, shape) {
    const src = noise(c, dur, shape);
    const f = c.createBiquadFilter();
    f.type = ftype; f.frequency.value = freq; f.Q.value = q;
    src.connect(f).connect(env(c, t, peak, dur)).connect(master);
    src.start(t);
  }

  const PACKS = {
    click(c, t, kind) {
      const dur = kind === 'space' ? 0.05 : 0.03;
      burst(c, t, dur, 'bandpass', kind === 'mod' ? 900 : 2100 + Math.random() * 500, 1.1,
            kind === 'space' ? 0.5 : 0.34, 2.2);
      tone(c, t, 'triangle', kind === 'mod' ? 420 : 640, kind === 'mod' ? 300 : 430, 0.12, 0.03);
    },
    thock(c, t, kind) {
      const big = kind === 'space' || kind === 'enter';
      burst(c, t, big ? 0.07 : 0.05, 'lowpass', big ? 520 : 700 + Math.random() * 120, 0.8, 0.55, 3);
      tone(c, t, 'sine', big ? 120 : 165 + Math.random() * 20, big ? 70 : 95, 0.32, big ? 0.08 : 0.06);
    },
    type(c, t, kind) {
      burst(c, t, 0.025, 'highpass', 2600, 0.7, 0.42, 4);
      burst(c, t + 0.004, 0.06, 'bandpass', 3400 + Math.random() * 300, 9, 0.16, 1.5);
      if (kind === 'enter') {
        tone(c, t + 0.05, 'sine', 2093, 2090, 0.18, 0.6);   // campanilla (C7)
        tone(c, t + 0.05, 'sine', 4186, 4180, 0.05, 0.35);
      } else if (kind === 'space') {
        burst(c, t, 0.07, 'lowpass', 900, 0.8, 0.3, 2);
      }
    },
    bubble(c, t, kind) {
      const base = kind === 'mod' ? 260 : kind === 'space' ? 200 : 340 + Math.random() * 80;
      tone(c, t, 'sine', base, base * 2.6, 0.26, kind === 'space' ? 0.09 : 0.06);
    },
  };

  function click(kind, packOverride) {
    const c = ensure();
    if (!c) return;
    (PACKS[packOverride || pack] || PACKS.click)(c, c.currentTime + 0.002, kind || 'key');
  }

  return { click, ensure, configure, packs: Object.keys(PACKS) };
})();
