// Pure game rules + AI. No rendering. 6x6 board, king capture wins.
(function (G) {
  'use strict';
  const W = 6, H = 6, N = 36;
  const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 1000, F: 3, X: 3, G: 5, C: 5 };
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = D8.slice(0, 4), DIAG = D8.slice(4);
  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

  const state = () => ({ b: Array(N).fill(null), f: { shield: 0 }, turn: 0, again: null, w: -1, doom: null });
  const clone = st => ({ b: st.b.slice(), f: { ...st.f }, turn: st.turn, again: st.again, w: st.w, doom: st.doom });

  // move: {f, t, k}  k: 0 move, 1 capture, 2 ranged shot (shooter stays)
  function moves(st, i, out = []) {
    const p = st.b[i]; if (!p) return out;
    const x = i % W, y = (i / W) | 0, s = p.s, b = st.b;
    const step = (dx, dy, mode) => { // mode 0 both, 1 move only, 2 capture only
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      const j = nx + ny * W, q = b[j];
      if (!q) { if (mode !== 2) out.push({ f: i, t: j, k: 0 }); }
      else if (q.s !== s && mode !== 1) out.push({ f: i, t: j, k: 1 });
    };
    const slide = (dirs, rng, phase) => {
      for (const [dx, dy] of dirs) {
        let nx = x + dx, ny = y + dy, r = 0;
        while (r < rng && nx >= 0 && ny >= 0 && nx < W && ny < H) {
          const j = nx + ny * W, q = b[j];
          if (!q) out.push({ f: i, t: j, k: 0 });
          else { if (q.s !== s) out.push({ f: i, t: j, k: 1 }); if (!phase) break; }
          nx += dx; ny += dy; r++;
        }
      }
    };
    switch (p.t) {
      case 'P': {
        const d = s ? -1 : 1; step(0, d, 1); step(1, d, 2); step(-1, d, 2);
        if (!s && st.f.wings) { step(1, 0, 1); step(-1, 0, 1); }
        break;
      }
      case 'N': for (const d of KN) step(d[0], d[1], 0); break;
      case 'B': slide(DIAG, 9); break;
      case 'R': slide(ORTH, 9); break;
      case 'Q': slide(D8, 9); break;
      case 'K': if (!s && st.f.crown) slide(D8, 2); else for (const d of D8) step(d[0], d[1], 0); break;
      case 'F': for (const d of D8) step(d[0] * 2, d[1] * 2, 0); for (const d of ORTH) step(d[0], d[1], 1); break;
      case 'X': for (const d of D8) step(d[0], d[1], 0); break;
      case 'G': slide(D8, 3, true); break;
      case 'C':
        for (const d of ORTH) step(d[0], d[1], 1);
        for (const [dx, dy] of ORTH) {
          let nx = x + dx, ny = y + dy, r = 0;
          while (r < 3 && nx >= 0 && ny >= 0 && nx < W && ny < H) {
            const j = nx + ny * W, q = b[j];
            if (q) { if (q.s !== s) out.push({ f: i, t: j, k: 2 }); break; }
            nx += dx; ny += dy; r++;
          }
        }
        break;
    }
    return out;
  }

  function all(st, s) {
    const out = [];
    if (st.again != null) {
      const i = st.b.findIndex(p => p && p.id === st.again);
      if (i >= 0) moves(st, i, out);
      return out;
    }
    for (let i = 0; i < N; i++) { const p = st.b[i]; if (p && p.s === s) moves(st, i, out); }
    return out;
  }

  // Remove the piece on tile j (shield may save it). src = tile idx or world pos of the cause.
  function kill(st, j, ev, src, boomQ) {
    const q = st.b[j]; if (!q) return false;
    if (q.s === 0 && st.f.shield > 0) { st.f.shield--; ev && ev.push({ e: 'shield', id: q.id, at: j }); return false; }
    st.b[j] = null; if (q.t === 'K') st.w = 1 - q.s;
    ev && ev.push({ e: 'die', id: q.id, at: j, src });
    if (q.t === 'X') boomQ.push(j);
    return true;
  }
  function booms(st, ev, boomQ) {
    while (boomQ.length) {
      const at = boomQ.shift(), x = at % W, y = (at / W) | 0;
      ev && ev.push({ e: 'boom', at });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = nx + ny * W, q = st.b[j];
        if (q && q.t !== 'K') kill(st, j, ev, at, boomQ);
      }
    }
  }

  function apply(st, m, ev) {
    const p = st.b[m.f], boomQ = [];
    let cap = false;
    if (m.k === 2) {
      ev && ev.push({ e: 'shoot', id: p.id, f: m.f, t: m.t });
      cap = kill(st, m.t, ev, m.f, boomQ);
    } else {
      const q = st.b[m.t];
      if (q && q.s === 0 && st.f.shield > 0) { // blocked: attacker bounces off
        st.f.shield--;
        ev && ev.push({ e: 'bump', id: p.id, f: m.f, t: m.t });
        st.again = null; st.turn ^= 1; return;
      }
      st.b[m.f] = null; st.b[m.t] = p;
      ev && ev.push({ e: 'move', id: p.id, f: m.f, t: m.t, cap: q ? q.id : null });
      if (q) {
        cap = true;
        if (q.t === 'K') st.w = 1 - q.s;
        if (q.t === 'X') boomQ.push(m.t);
        if (p.t === 'X') { st.b[m.t] = null; ev && ev.push({ e: 'die', id: p.id, at: m.t, src: m.f }); boomQ.push(m.t); }
        else if (q.s === 0 && q.t === 'P' && st.f.thorns && p.t !== 'K') kill(st, m.t, ev, m.f, boomQ);
      }
      const pp = st.b[m.t];
      if (pp && pp.t === 'P' && ((m.t / W) | 0) === (pp.s ? 0 : H - 1)) {
        st.b[m.t] = { ...pp, t: 'Q' }; ev && ev.push({ e: 'promo', id: pp.id, at: m.t });
      }
    }
    booms(st, ev, boomQ);
    const still = st.b[m.k === 2 ? m.f : m.t];
    if (cap && p.s === 0 && st.f.frenzy && st.again == null && still && still.id === p.id && st.w < 0) st.again = p.id;
    else { st.again = null; st.turn ^= 1; }
  }

  function evalS(st, s) {
    let v = 0;
    for (let i = 0; i < N; i++) {
      const p = st.b[i]; if (!p) continue;
      let a = VAL[p.t];
      if (p.t !== 'K') {
        if (st.doom && st.doom[i]) a = 0;
        else {
          a += .06 * (2.5 - Math.abs((i % W) - 2.5));
          if (p.t === 'P') { const y = (i / W) | 0; a += .12 * (p.s ? H - 1 - y : y); }
        }
      }
      v += p.s === s ? a : -a;
    }
    return v;
  }
  const order = (st, ms) => ms.sort((a, b) => (b.k ? VAL[st.b[b.t].t] : 0) - (a.k ? VAL[st.b[a.t].t] : 0));

  function search(st, d, al, be) {
    if (st.w >= 0) return st.w === st.turn ? 5000 + d : -5000 - d;
    if (d <= 0) return evalS(st, st.turn);
    const ms = all(st, st.turn);
    if (!ms.length) { const c = clone(st); c.again = null; c.turn ^= 1; return -search(c, d - 1, -be, -al); }
    order(st, ms);
    let best = -1e9;
    for (const m of ms) {
      const c = clone(st); apply(c, m, null);
      const v = c.turn === st.turn ? search(c, d - 1, al, be) : -search(c, d - 1, -be, -al);
      if (v > best) best = v; if (v > al) al = v; if (al >= be) break;
    }
    return best;
  }
  function best(st, depth) {
    const ms = all(st, st.turn); if (!ms.length) return null;
    order(st, ms);
    let bv = -1e9, bm = null;
    for (const m of ms) {
      const c = clone(st); apply(c, m, null);
      const v = (c.turn === st.turn ? search(c, depth - 1, -1e9, 1e9) : -search(c, depth - 1, -1e9, -bv + .5)) + Math.random() * .3;
      if (v > bv) { bv = v; bm = m; }
    }
    return bm;
  }

  G.R = { W, H, N, VAL, state, clone, moves, all, apply, kill, booms, best };
})(typeof window !== 'undefined' ? (window.CL = window.CL || {}) : (globalThis.CL = globalThis.CL || {}));
