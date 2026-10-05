/* Resyst VK — emoji picker offline (tabla estática, sin red). */
'use strict';
window.VK = window.VK || {};

VK.EMOJI = (() => {
  const CATS = [
    {id: 'smileys', label: 'Caritas',   icon: '🙂'},
    {id: 'gestos',  label: 'Gestos',    icon: '👍'},
    {id: 'corazon', label: 'Corazones', icon: '❤️'},
    {id: 'objetos', label: 'Objetos',   icon: '💻'},
    {id: 'comida',  label: 'Comida',    icon: '🍕'},
    {id: 'natura',  label: 'Naturaleza',icon: '🌱'},
    {id: 'simb',    label: 'Símbolos',  icon: '✨'},
  ];
  const TABLE = {
    smileys: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖',
    gestos: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🫰 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👋 🤚 🖐️ ✋ 🖖 👏 🙌 🫶 👐 🤲 🤝 🙏 ✍️ 💅 💪 🦾 🦵 🦶 👂 👃 🧠 🫀 👀 👁️ 👅 👄 💋 🩸',
    corazon: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 💯 💢 💥 💫 ⭐ 🌟 ✨ ⭐️ 🔥 🌈 ☀️ ⛅',
    objetos: '💻 🖥️ ⌨️ 🖱️ 💾 📱 ☎️ 📞 📟 📠 🔋 🔌 💡 🔍 🔎 🔒 🔓 🔑 🗝️ 🔨 🪛 🔧 🔩 ⚙️ 🧰 🧲 💊 🩹 🩺 🧪 🔬 🔭 📡 📷 📹 🎥 💰 💵 💳 💸 🧾 ✏️ ✒️ 📝 📚 📖 📕 📗 📘 📙 📔 📒 📃 📄 📊 📈 📉 📅 📆 🗒️ 🗓️ 📇 🗃️ 🗄️ 🗑️ 📋 📁 📂 🗂️ 📰 🗞️ 📓 📔 📒 🏷️ 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🖊️ 🖋️ 🖌️ 🖍️ 🗞️',
    comida: '🍕 🍔 🍟 🌭 🥪 🌮 🌯 🥗 🍝 🍜 🍲 🍛 🍣 🍱 🍚 🍘 🍥 🥠 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🍵 🧋 🥤 🍶 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾 🍎 🍏 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭',
    natura: '🌱 🌲 🌳 🌴 🌵 🌾 🌿 ☘️ 🍀 🍁 🍂 🍃 🌼 🌸 💮 🏵️ 🌺 🌻 🌞 🌝 🌚 🌙 ⭐ 🌟 💫 ✨ ☁️ ⛅ 🌧️ 🌩️ ❄️ ☃️ ⛄ 🌊 💧 ☂️ 🌈 🔥 🌍 🌎 🌏 🪐 🌌 🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🐔 🐧 🐦 🐤 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪲 🦋 🐌 🐞 🐜 🕷️ 🦂 🐢 🐍 🦎 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆',
    simb: '✦ ✧ ⚡ ⚠️ ⛔ 🚫 ⭕ ❌ ❎ ✅ ✔️ ☑️ ✔️ 🔘 🔴 🟠 🟡 🟢 🔵 🟣 ⚫ ⚪ 🟤 🔺 🔻 🔸 🔹 🔶 🔷 🔳 🔲 ▪️ ▫️ ◾ ◽ ◼️ ◻️ 🟥 🟧 🟨 🟩 🟦 🟪 ⬛ ⬜ 🟫 ♻️ ⚜️ 🔱 📛 🔰 ⭕ ❗ ❕ ❓ ❔ ‼️ ⁉️ 🔅 🔆 〽️ ⚠️ 🚸 🔣 ℹ️ 🆗 🆕 🆙 🆒 🆓 🆖 ™️ ©️ ®️ 🅰️ 🅱️ 🆎 🅾️ 🆘 ⛔ 💹 ☮️ ☯️ 🕉️ ✝️ ☪️ 💡',
  };
  let panel = null;

  function build() {
    panel = document.createElement('div');
    panel.id = 'emojiPanel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Selector de emoji');
    panel.hidden = true;
    const cats = document.createElement('div');
    cats.className = 'emoji-cats';
    const body = document.createElement('div');
    body.className = 'emoji-body';
    body.setAttribute('role', 'listbox');
    body.setAttribute('aria-label', 'Emojis');
    CATS.forEach((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-cat' + (i === 0 ? ' on' : '');
      b.textContent = c.icon;
      b.title = c.label;
      b.setAttribute('aria-label', c.label);
      b.addEventListener('click', () => {
        panel.querySelectorAll('.emoji-cat').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        renderCat(c.id);
        body.focus();
      });
      cats.appendChild(b);
    });
    panel.appendChild(cats);
    panel.appendChild(body);
    panel._body = body;
    renderCat(CATS[0].id);
    return panel;
  }

  function renderCat(id) {
    const body = panel._body;
    body.innerHTML = '';
    for (const e of TABLE[id].split(' ')) {
      if (!e) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'emoji-cell';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-label', 'emoji ' + e);
      b.textContent = e;
      b.addEventListener('click', () => VK.emojiPick && VK.emojiPick(e));
      body.appendChild(b);
    }
  }

  return {
    mount(parent) { const p = build(); parent.appendChild(p); return p; },
    open() { if (panel) panel.hidden = false; },
    close() { if (panel) panel.hidden = true; },
    get visible() { return panel && !panel.hidden; },
    toggle() { if (panel) panel.hidden = !panel.hidden; },
  };
})();
