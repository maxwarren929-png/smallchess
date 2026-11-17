// Bestiary: every piece and relic, unlocked once seen in a run. Movement diagrams come straight from the rules.
(function (G) {
  'use strict';
  const KEY = 'chesslite.seen';
  let seen = { p: {}, r: {} };
  try { const v = JSON.parse(localStorage.getItem(KEY)); if (v && v.p && v.r) seen = v; } catch (e) { }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) { } };
  const mark = (kind, k) => { if (!seen[kind][k]) { seen[kind][k] = 1; save(); } };

  // 6x6 diagram, piece on c3. Each square is tested with a lone enemy on it, so line-of-sight pieces show their reach.
  const AT = 14;
  function diagram(t) {
    const R = G.R, cells = Array(36).fill(0);
    const mk = () => { const st = R.state(); st.b[AT] = { id: 1, t, s: 0 }; return st; };
    for (const m of R.moves(mk(), AT)) if (m.k === 0) cells[m.t] |= 1;
    for (let j = 0; j < 36; j++) {
      if (j === AT) continue;
      const st = mk(); st.b[j] = { id: 2, t: 'P', s: 1 };
      for (const m of R.moves(st, AT)) if (m.t === j && m.k) cells[j] |= m.k === 2 ? 4 : m.k === 3 ? 8 : m.k === 4 ? 16 : 2;
    }
    let h = '<div class="dg">';
    for (let y = 5; y >= 0; y--) for (let x = 0; x < 6; x++) {
      const i = x + y * 6, c = cells[i];
      h += '<i class="' + ((x + y) % 2 ? 'l' : 'd') + (i === AT ? ' me' : '') + (c & 1 ? ' mv' : '') + (c & 2 ? ' cp' : '') + (c & 4 ? ' sh' : '') + (c & 8 ? ' pl' : '') + (c & 16 ? ' ps' : '') + '"></i>';
    }
    return h + '</div>';
  }

  const ORDER = ['P', 'N', 'B', 'R', 'Q', 'K', 'F', 'X', 'G', 'C', 'H', 'M', 'S', 'O'];
  let tab = 'p';
  function render() {
    const D = G.data, el = document.getElementById('codex');
    const keys = tab === 'p' ? ORDER : Object.keys(D.RELICS), n = keys.filter(k => seen[tab][k]).length;
    let h = '<div class="cx-top"><button data-tab="p" class="' + (tab === 'p' ? 'on' : '') + '">PIECES</button><button data-tab="r" class="' + (tab === 'r' ? 'on' : '') + '">RELICS</button>' +
      '<span class="cx-n">' + n + '/' + keys.length + '</span><button data-x="1">&#10005;</button></div><div class="cx-grid">';
    for (const k of keys) {
      const ok = seen[tab][k];
      if (tab === 'p') {
        const [name, desc] = D.NAMES[k], price = D.PRICE[k];
        h += '<div class="card' + (ok ? '' : ' unk') + '"><b>' + (ok ? name : '???') + '</b>' + (ok ? diagram(k) : '<div class="dg q">?</div>') +
          '<span>' + (ok ? desc : '&nbsp;') + '</span>' + (ok && price ? '<em><i class="coin"></i>' + price + '</em>' : '') + '</div>';
      } else {
        const [price, name, desc] = D.RELICS[k];
        h += '<div class="card rel' + (ok ? '' : ' unk') + '"><b>' + (ok ? name : '???') + '</b><span>' + (ok ? desc : '&nbsp;') + '</span>' + (ok ? '<em><i class="coin"></i>' + price + '</em>' : '') + '</div>';
      }
    }
    h += '</div>';
    if (tab === 'p') h += '<div class="cx-key"><i class="mv"></i>move <i class="cp"></i>take <i class="sh"></i>shoot <i class="pl"></i>pull <i class="ps"></i>shove</div>';
    el.innerHTML = '<div class="cx-box">' + h + '</div>';
  }
  function open(v) {
    const el = document.getElementById('codex');
    el.classList.toggle('on', v); if (v) render();
  }
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.getElementById('codex');
    document.getElementById('book').onclick = () => { G.sfx && G.sfx.click(); open(!el.classList.contains('on')); };
    el.addEventListener('pointerdown', e => {
      const b = e.target.closest('button');
      if (b && b.dataset.tab) { tab = b.dataset.tab; G.sfx && G.sfx.sel(); render(); }
      else if ((b && b.dataset.x) || e.target === el) open(false);
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') open(false); if (e.key === 'b' || e.key === 'B') open(!el.classList.contains('on')); });
  });
  G.codex = { seen: t => mark('p', t), seenRel: k => mark('r', k), open };
})(window.CL = window.CL || {});
