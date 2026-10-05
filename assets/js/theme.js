/* Resyst VK — motor de apariencia: temas curados + acento propio + estilo de tecla.
   Todo se expresa como variables CSS en <html> y atributos data-* (sin reconstruir DOM). */
'use strict';
window.VK = window.VK || {};

VK.THEMES = {
  lab: {
    label: 'Midnight Laboratory', short: 'Midnight', dark: true,
    vars: {
      bg: '#08080f', bg2: '#0b0b14', key: '#15151f', keyTop: '#1a1a26', keyHi: '#21212f',
      keyMod: '#0f0f18', keyNum: '#171724', edge: '#2c2c3c', edgeHi: '#46465e',
      accent: '#c9a84c', text: '#e9e4d6', textMod: '#b8b2a2', muted: '#8f8a7a',
      ok: '#5cbf6a', bad: '#d0605a', shadow: 'rgba(0,0,0,.9)',
    },
  },
  slate: {
    label: 'Pizarra', short: 'Pizarra', dark: true,
    vars: {
      bg: '#0d1015', bg2: '#12161d', key: '#1a2029', keyTop: '#202733', keyHi: '#28303d',
      keyMod: '#151a22', keyNum: '#1d242e', edge: '#2e3745', edgeHi: '#4a5669',
      accent: '#7fb0ff', text: '#e3e8f0', textMod: '#b3bccb', muted: '#8a94a6',
      ok: '#5cc58a', bad: '#e0706a', shadow: 'rgba(0,0,0,.85)',
    },
  },
  arcade: {
    label: 'Noche de juego', short: 'Arcade', dark: true,
    vars: {
      bg: '#07060e', bg2: '#0c0a18', key: '#14112a', keyTop: '#1a1636', keyHi: '#231d46',
      keyMod: '#0f0c20', keyNum: '#17132f', edge: '#2c2650', edgeHi: '#4b4185',
      accent: '#3ee0cf', text: '#ece8ff', textMod: '#bdb6e0', muted: '#8f88b5',
      ok: '#4fd88a', bad: '#ff5c7a', shadow: 'rgba(0,0,0,.9)',
    },
  },
  paper: {
    label: 'Papiro', short: 'Papiro', dark: false,
    vars: {
      bg: '#efe9dc', bg2: '#e7e0d0', key: '#faf6ee', keyTop: '#fffdf8', keyHi: '#f1ebdf',
      keyMod: '#e3dcc9', keyNum: '#f3eee1', edge: '#c9c0ab', edgeHi: '#a89e85',
      accent: '#8a6d1f', text: '#3a352a', textMod: '#5d5748', muted: '#6e6754',
      ok: '#3e7d4c', bad: '#a8433d', shadow: 'rgba(58,53,42,.35)',
    },
  },
  hc: {
    label: 'Alto contraste', short: 'Contraste', dark: true, hc: true,
    vars: {
      bg: '#000000', bg2: '#0a0a0a', key: '#000000', keyTop: '#000000', keyHi: '#262626',
      keyMod: '#000000', keyNum: '#0d0d0d', edge: '#bdbdbd', edgeHi: '#ffffff',
      accent: '#ffd60a', text: '#ffffff', textMod: '#ffffff', muted: '#d6d6d6',
      ok: '#3ee07a', bad: '#ff6b6b', shadow: 'rgba(0,0,0,1)',
    },
  },
};

// Acentos curados (se corrigen por contraste contra la tecla del tema activo).
VK.ACCENTS = [
  ['#c9a84c', 'Ámbar Resyst'], ['#e2735a', 'Coral'], ['#e06c9f', 'Rosa'], ['#9b7bea', 'Violeta'],
  ['#5b9cf0', 'Azul'], ['#3cc8d8', 'Cian'], ['#4fc58f', 'Menta'], ['#a8c94c', 'Lima'], ['#e8e2d0', 'Marfil'],
];

VK.Look = (() => {
  const { isHex, rgba, contrast, ensureContrast, hslToHex } = VK.util;
  const ATTRS = ['shape', 'cap', 'press', 'font', 'density'];

  // Paleta efectiva (tema + acento propio con contraste garantizado ≥ 4.5:1 sobre la tecla).
  function palette(themeName, accent) {
    const t = VK.THEMES[themeName] || VK.THEMES.lab;
    const v = Object.assign({}, t.vars);
    const acc = ensureContrast(isHex(accent) ? accent : t.vars.accent, v.key, 4.5);
    v.accent = acc;
    const darkInk = t.dark ? v.bg : '#141210';
    v.accentInk = contrast(darkInk, acc) >= contrast('#ffffff', acc) ? darkInk : '#ffffff';
    v.accentSoft = rgba(acc, t.dark ? 0.13 : 0.12);
    v.dockGlow = rgba(acc, t.dark ? 0.16 : 0.18);
    v.accentGlow = rgba(acc, 0.45);
    v.ghost = rgba(v.text, 0.5);
    return {theme: t, vars: v};
  }

  // Acento desde un tono (0..360) con croma/luz pensados para el tema.
  function accentFromHue(h, themeName) {
    const t = VK.THEMES[themeName] || VK.THEMES.lab;
    return hslToHex(h, t.dark ? 70 : 62, t.dark ? 62 : 36);
  }

  function apply(s) {
    const {theme, vars} = palette(s.theme, s.accent);
    const r = document.documentElement;
    for (const [k, v] of Object.entries(vars)) {
      r.style.setProperty('--' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase()), v);
    }
    r.style.colorScheme = theme.dark ? 'dark' : 'light';
    r.dataset.theme = VK.THEMES[s.theme] ? s.theme : 'lab';
    for (const a of ATTRS) r.dataset[a] = s[a];
    r.dataset.sub = s.subLegends ? 'on' : 'off';
    r.dataset.lphint = s.longPress && s.lpHint ? 'on' : 'off';
    r.style.setProperty('--lp-delay', (s.lpDelay || 400) + 'ms');
    r.style.setProperty('--scale', s.scale);
    if (document.body) document.body.classList.toggle('light', !theme.dark);
    return vars;
  }

  return { palette, apply, accentFromHue };
})();

// Compatibilidad v3: applyTheme(nombre) sigue funcionando.
VK.applyTheme = name => VK.Look.apply(Object.assign({}, VK.Settings ? VK.Settings.get() : {}, {theme: name}));
