// Pure game rules + AI. No rendering. 6x6 board, king capture wins.
(function (G) {
  'use strict';
  const W = 6, H = 6, N = 36;
  const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 1000, F: 3, X: 3, G: 4, C: 5, H: 5, M: 3, S: 3, O: 4, A: 3, W: 3, V: 4, L: 4 };
  // hit points: golems take an extra hit
  const hpOf = t => t === 'O' ? 2 : 1;
  const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const ORTH = D8.slice(0, 4), DIAG = D8.slice(4);
  const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

  // f[s]: relic flags for side s (shield, crown, wings, frenzy, thorns, fuse, scope, saddle, medal)
  // hole: tiles that crumbled away (collapse boss) -- nothing can stand on or pass through them
  const state = () => ({ b: Array(N).fill(null), f: [{ shield: 0 }, { shield: 0 }], turn: 0, again: null, w: -1, doom: null, nid: 1e6, fz: null, hole: null });
  const clone = st => ({ b: st.b.slice(), f: [{ ...st.f[0] }, { ...st.f[1] }], turn: st.turn, again: st.again, w: st.w, doom: st.doom, nid: st.nid, fz: st.fz, hole: st.hole });
  // wearables (p.g): lens +2 range on shots/pulls, cloak can't be shot or hooked, treads can't be shoved/pulled, striders also step 1 any way
  // p.wd = warded (rally): can't be captured or killed until the other side has had its first turn
  const shootable = (q, s) => q.s !== s && q.g !== 'cloak' && !q.wd;

  // move: {f, t, k}  k: 0 move, 1 capture, 2 ranged shot (shooter stays), 3 hook pull, 4 ram push, 5 swap with an ally
  // p.hp = hits left (golem), p.dz = turns left stunned (hook: 1, shackles: 2)
  function moves(st, i, out = []) {
    const p = st.b[i]; if (!p) return out;
    if (p.t !== 'K' && ((st.fz && st.fz[i]) || p.dz)) return out; // frozen in place (frost boss) or stunned (hook)
    const x = i % W, y = (i / W) | 0, s = p.s, b = st.b, n0 = out.length, hole = st.hole, lens = p.g === 'lens' ? 2 : 0;
    const step = (dx, dy, mode) => { // mode 0 both, 1 move only, 2 capture only
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
      const j = nx + ny * W, q = b[j]; if (hole && hole[j]) return;
      if (!q) { if (mode !== 2) out.push({ f: i, t: j, k: 0 }); }
      else if (q.s !== s && mode !== 1 && !q.wd) out.push({ f: i, t: j, k: 1 });
    };
    const slide = (dirs, rng, phase) => {
      for (const [dx, dy] of dirs) {
        let nx = x + dx, ny = y + dy, r = 0;
        while (r < rng && nx >= 0 && ny >= 0 && nx < W && ny < H) {
          const j = nx + ny * W, q = b[j];
          if (hole && hole[j]) { if (!phase) break; }
          else if (!q) out.push({ f: i, t: j, k: 0 });
          else { if (q.s !== s && !q.wd) out.push({ f: i, t: j, k: 1 }); if (!phase) break; }
          nx += dx; ny += dy; r++;
        }
      }
    };
    // ranged: the first piece in a straight line within rng tiles; holes block the line
    const ray = (dx, dy, rng, fn) => {
      let nx = x + dx, ny = y + dy, r = 0;
      while (r < rng && nx >= 0 && ny >= 0 && nx < W && ny < H) {
        const j = nx + ny * W; if (hole && hole[j]) return;
        if (b[j]) return fn(j, b[j], r);
        nx += dx; ny += dy; r++;
      }
    };
    switch (p.t) {
      case 'P': {
        const d = s ? -1 : 1; step(0, d, 1); step(1, d, 2); step(-1, d, 2);
        if (st.f[s].wings) { step(1, 0, 1); step(-1, 0, 1); }
        break;
      }
      case 'N': for (const d of KN) step(d[0], d[1], 0); if (st.f[s].saddle) for (const d of ORTH) step(d[0], d[1], 0); break;
      case 'B': slide(DIAG, 9); break;
      case 'R': slide(ORTH, 9); break;
      case 'Q': slide(D8, 9); break;
      case 'K': if (st.f[s].crown) slide(D8, 2); else for (const d of D8) step(d[0], d[1], 0); break;
      case 'F': for (const d of D8) step(d[0] * 2, d[1] * 2, 0); for (const d of ORTH) step(d[0], d[1], 1); break;
      case 'X': for (const d of D8) step(d[0], d[1], 0); break;
      case 'G': slide(DIAG, 2, true); break;
      case 'C': case 'H': { // cannon shoots the first piece in a line; hook pulls it next to itself (and can bite adjacent foes)
        const hook = p.t === 'H', rng = (hook ? 5 : 3) + (st.f[s].scope ? 3 : 0) + lens;
        for (const d of hook ? D8 : ORTH) step(d[0], d[1], hook ? 0 : 1); // hook steps/bites any way, cannon only walks straight
        for (const [dx, dy] of ORTH) ray(dx, dy, rng, (j, q, r) => {
          if (hook ? r > 0 && q.s !== s && q.g !== 'cloak' && q.g !== 'treads' : shootable(q, s)) out.push({ f: i, t: j, k: hook ? 3 : 2 });
        });
        break;
      }
      case 'M': // ram: walks, and shoves an adjacent enemy one tile, diagonals too (crushing it against walls/pieces)
        for (const [dx, dy] of D8) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = nx + ny * W, q = b[j]; if (hole && hole[j]) continue;
          if (!q) out.push({ f: i, t: j, k: 0 }); else if (q.s !== s && q.g !== 'treads') out.push({ f: i, t: j, k: 4 });
        }
        break;
      case 'S': for (const d of D8) step(d[0], d[1], 0); break;
      case 'O': for (const d of ORTH) step(d[0], d[1], 0); break;
      case 'A': // archer: walks straight, shoots the first piece up to 2 tiles diagonally
        for (const d of ORTH) step(d[0], d[1], 1);
        for (const [dx, dy] of DIAG) ray(dx, dy, 2 + lens, (j, q) => { if (shootable(q, s)) out.push({ f: i, t: j, k: 2 }); });
        break;
      case 'W': // mage: steps diagonally, or trades places with an ally up to 2 tiles away
        for (const d of DIAG) step(d[0], d[1], 0);
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx, ny = y + dy; if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = nx + ny * W, q = b[j];
          if (q && q.s === s && !(st.fz && st.fz[j])) out.push({ f: i, t: j, k: 5 });
        }
        break;
      case 'V': slide(D8, 1 + (p.kills || 0)); break; // vampire: every kill adds a tile of reach (see apply), up to 4
      case 'L': slide(ORTH, 3, true); break; // lancer: charges 3 straight, leaping blockers
    }
    if (p.g === 'striders') { // one extra step any way, on top of whatever the piece already does
      const had = new Set(); for (let k = n0; k < out.length; k++) had.add(out[k].t);
      const n1 = out.length; for (const d of D8) step(d[0], d[1], 0);
      let w = n1; for (let k = n1; k < out.length; k++) if (!had.has(out[k].t)) out[w++] = out[k];
      out.length = w;
    }
    if (st.again === p.id) { // fury's bonus move is a reposition only: no attacks
      let w = n0; for (let k = n0; k < out.length; k++) if (out[k].k === 0 || out[k].k === 5) out[w++] = out[k];
      out.length = w;
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

  // Remove the piece on tile j (shield / hit points may save it). src = tile idx or world pos of the cause.
  function kill(st, j, ev, src, boomQ) {
    const q = st.b[j]; if (!q) return false;
    if (q.wd) { ev && ev.push({ e: 'ward', id: q.id, at: j }); return false; }
    if (st.f[q.s].shield > 0) { st.f[q.s].shield--; ev && ev.push({ e: 'shield', id: q.id, at: j }); return false; }
    if (q.hp > 1) { st.b[j] = { ...q, hp: q.hp - 1 }; ev && ev.push({ e: 'hit', id: q.id, at: j }); return false; }
    st.b[j] = null; if (q.t === 'K') st.w = 1 - q.s;
    ev && ev.push({ e: 'die', id: q.id, at: j, src });
    gone(st, q, j, ev, boomQ);
    return true;
  }
  // after-death effects: bombs go off, slimes split into pawns
  function gone(st, q, j, ev, boomQ) {
    if (q.t === 'X') boomQ.push({ at: j, r: st.f[q.s].fuse ? 2 : 1 });
    if (q.t === 'S') {
      const x = j % W, y = (j / W) | 0; let n = 2;
      for (const [dx, dy] of D8) {
        const nx = x + dx, ny = y + dy; if (!n || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = nx + ny * W; if (st.b[k] || (st.hole && st.hole[k])) continue;
        const id = st.nid++; st.b[k] = { id, t: 'P', s: q.s }; n--;
        ev && ev.push({ e: 'spawn', id, t: 'P', s: q.s, at: k, src: j });
      }
    }
  }
  function booms(st, ev, boomQ) {
    while (boomQ.length) {
      const { at, r } = boomQ.shift(), x = at % W, y = (at / W) | 0;
      ev && ev.push({ e: 'boom', at, r });
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (r > 1 && dx && dy && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) continue; // big blast = 3x3 plus a cross
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = nx + ny * W, q = st.b[j];
        if (q && q.t !== 'K') kill(st, j, ev, at, boomQ);
      }
    }
  }
  // end of a side's turn: its stunned pieces tick down, the other side's rally ward wears off, then the other side moves
  const end = st => {
    for (let i = 0; i < N; i++) {
      const p = st.b[i]; if (!p) continue;
      if (p.dz && p.s === st.turn) st.b[i] = { ...st.b[i], dz: p.dz - 1 };
      if (p.wd && p.s !== st.turn) st.b[i] = { ...st.b[i], wd: 0 };
    }
    st.again = null; st.turn ^= 1;
  };

  function apply(st, m, ev) {
    const p = st.b[m.f], boomQ = [];
    let cap = false;
    if (m.k === 2) {
      ev && ev.push({ e: 'shoot', id: p.id, f: m.f, t: m.t });
      cap = kill(st, m.t, ev, m.f, boomQ);
    } else if (m.k === 3) { // hook: drag the target to the tile next to the hook; it's stunned for a turn (kings shrug it off)
      const q = st.b[m.t], fx = m.f % W, fy = (m.f / W) | 0, dx = Math.sign((m.t % W) - fx), dy = Math.sign(((m.t / W) | 0) - fy), to = fx + dx + (fy + dy) * W;
      const dz = q.t !== 'K';
      st.b[m.t] = null; st.b[to] = dz ? { ...q, dz: Math.max(1, q.dz || 0) } : q;
      ev && ev.push({ e: 'pull', id: p.id, tid: q.id, f: m.t, t: to, dz });
    } else if (m.k === 5) { // mage: trade places with an ally
      const q = st.b[m.t]; st.b[m.t] = p; st.b[m.f] = q;
      ev && ev.push({ e: 'swap', id: p.id, tid: q.id, f: m.f, t: m.t });
    } else if (m.k === 4) { // ram: shove the target one tile; if it can't move it gets crushed
      const q = st.b[m.t], dx = (m.t % W) - (m.f % W), dy = ((m.t / W) | 0) - ((m.f / W) | 0), nx = (m.t % W) + dx, ny = ((m.t / W) | 0) + dy;
      const free = nx >= 0 && ny >= 0 && nx < W && ny < H && !st.b[nx + ny * W] && !(st.hole && st.hole[nx + ny * W]);
      ev && ev.push({ e: 'ram', id: p.id, f: m.f, t: m.t, tid: q.id, to: free ? nx + ny * W : null });
      if (free) { st.b[nx + ny * W] = q; st.b[m.t] = null; }
      else cap = kill(st, m.t, ev, m.f, boomQ);
      if (!st.b[m.t]) { st.b[m.f] = null; st.b[m.t] = p; ev && ev.push({ e: 'move', id: p.id, f: m.f, t: m.t, cap: null }); }
    } else {
      const q = st.b[m.t];
      if (q && st.f[q.s].shield > 0) { // blocked: attacker bounces off
        st.f[q.s].shield--;
        ev && ev.push({ e: 'bump', id: p.id, f: m.f, t: m.t });
        return end(st);
      }
      if (q && q.hp > 1) { // tough target: takes a hit, attacker bounces off
        st.b[m.t] = { ...q, hp: q.hp - 1 };
        ev && ev.push({ e: 'bump', id: p.id, f: m.f, t: m.t, hit: q.id });
        return end(st);
      }
      st.b[m.f] = null; st.b[m.t] = p;
      ev && ev.push({ e: 'move', id: p.id, f: m.f, t: m.t, cap: q ? q.id : null });
      if (q) {
        cap = true;
        if (q.t === 'K') st.w = 1 - q.s;
        if (p.t === 'X') { st.b[m.t] = null; ev && ev.push({ e: 'die', id: p.id, at: m.t, src: m.f }); boomQ.push({ at: m.t, r: st.f[p.s].fuse ? 2 : 1 }); }
        else if (q.t === 'P' && st.f[q.s].thorns && p.t !== 'K') kill(st, m.t, ev, m.f, boomQ);
        gone(st, q, m.t, ev, boomQ);
        const v = st.b[m.t];
        if (v && v.id === p.id && p.t === 'V' && (v.kills || 0) < 3) { st.b[m.t] = { ...v, kills: (v.kills || 0) + 1 }; ev && ev.push({ e: 'grow', id: p.id, at: m.t }); }
      }
      const pp = st.b[m.t], row = (m.t / W) | 0;
      if (pp && pp.t === 'P' && (row === (pp.s ? 0 : H - 1) || (st.f[pp.s].medal && row === (pp.s ? 1 : H - 2)))) {
        st.b[m.t] = { ...pp, t: 'Q', hp: 1 }; ev && ev.push({ e: 'promo', id: pp.id, at: m.t });
      }
    }
    booms(st, ev, boomQ);
    const still = st.b[m.k === 2 || m.k === 3 ? m.f : m.t];
    if (cap && st.f[p.s].frenzy && st.again == null && still && still.id === p.id && st.w < 0) st.again = p.id;
    else end(st);
  }

  // Can side s take the enemy king with its very next move (as if it were s's turn right now)?
  function threat(st, s) {
    const c = clone(st); c.again = null; c.turn = s;
    for (const m of all(c, s)) { const d = clone(c); apply(d, m, null); if (d.w === s) return true; }
    return false;
  }
  // For the side to move: 0 = fine, 1 = checkmate (every move loses the king, and it's attacked now),
  // 2 = stalemate (not attacked, but every move -- or having no move at all -- hands the king over).
  // Conservative: a fury bonus move counts as an escape, so it never calls mate too early.
  function status(st) {
    const s = st.turn, o = 1 - s;
    for (const m of all(st, s)) {
      const c = clone(st); apply(c, m, null);
      if (c.w === s || c.turn === s) return 0;
      if (c.w < 0 && !threat(c, o)) return 0;
    }
    return threat(st, o) ? 1 : 2;
  }

  function evalS(st, s) {
    let v = 0;
    for (let i = 0; i < N; i++) {
      const p = st.b[i]; if (!p) continue;
      let a = VAL[p.t] + (p.hp > 1 ? (p.hp - 1) * 1.5 : 0) + (p.g ? .8 : 0);
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
  const ov = (st, m) => m.k && m.k !== 5 ? VAL[st.b[m.t].t] : 0;
  const order = (st, ms) => ms.sort((a, b) => ov(st, b) - ov(st, a));

  function search(st, d, al, be) {
    if (st.w >= 0) return st.w === st.turn ? 5000 + d : -5000 - d;
    if (d <= 0) return evalS(st, st.turn);
    const ms = all(st, st.turn);
    if (!ms.length) { const c = clone(st); end(c); return -search(c, d - 1, -be, -al); }
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

  G.R = { W, H, N, VAL, hpOf, state, clone, moves, all, apply, kill, booms, best, pass: end, status, threat };
})(typeof window !== 'undefined' ? (window.CL = window.CL || {}) : (globalThis.CL = globalThis.CL || {}));
