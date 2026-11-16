// Chesslite: run flow, battles, bosses, shop, animation and input.
(function () {
  'use strict';
  const { R, S, gfx, sfx } = CL;
  const $ = s => document.querySelector(s);
  const Q = new URLSearchParams(location.search);
  const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const TP = i => [(i % 6) - 2.5, 0, 2.5 - ((i / 6) | 0)]; // tile -> world

  const MODEL = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king', F: 'frog', X: 'bomb', G: 'ghost', C: 'cannon' };
  const PRICE = { P: 2, N: 5, B: 5, R: 8, Q: 14, F: 5, X: 6, G: 8, C: 8 };
  const NAMES = { P: ['PAWN'], N: ['KNIGHT'], B: ['BISHOP'], R: ['ROOK'], Q: ['QUEEN'], F: ['FROG', 'leaps 2'], X: ['BOMB', 'explodes'], G: ['GHOST', 'phases'], C: ['CANNON', 'shoots 3'] };
  const RELICS = {
    shield: [9, 'AEGIS', 'blocks 1 capture'], frenzy: [12, 'FURY', 'capture = go again'], crown: [8, 'CROWN', 'king strides 2'], wings: [6, 'WINGS', 'pawns sidestep'],
    purse: [7, 'PURSE', '+1 per capture'], bolt: [8, 'BOLT', 'smites a foe'], egg: [6, 'EGG', 'free pawn'], thorns: [8, 'THORNS', 'pawns bite back'],
  };
  const BOSS = ['inferno', 'tempest', 'chaos'];
  const PA = [.97, .92, .8], PB = [.25, .78, .82], EA = [.36, .27, .5], EB = [.98, .36, .32];
  const BOSSCOL = { inferno: [[.3, .13, .12], [1, .6, .15]], tempest: [[.2, .32, .42], [.7, 1, 1]], chaos: [[.14, .1, .2], [1, .3, .9]] };
  const C = { sel: [1, .85, .3], move: [.3, .95, 1], danger: [1, .6, .2], cap: [1, .25, .2], foe: [.85, .3, .7], hover: [1, 1, 1], last: [.7, .4, .9], lava: [1, .5, .1], wind: [.8, 1, 1], gold: [1, .8, .3], no: [.5, .3, .35] };
  const TH = {
    a0: { skyA: [.06, .07, .2], skyB: [.2, .38, .52], tA: [.9, .84, .7], tB: [.33, .52, .56], glow: [.3, .95, 1], sun: [1.1, 1.04, .92], amb: [.42, .45, .7] },
    a1: { skyA: [.12, .05, .24], skyB: [.55, .27, .52], tA: [.92, .8, .82], tB: [.5, .36, .62], glow: [1, .5, .9], sun: [1.1, 1, .98], amb: [.5, .4, .7] },
    a2: { skyA: [.03, .03, .09], skyB: [.3, .13, .24], tA: [.8, .78, .8], tB: [.3, .29, .4], glow: [1, .3, .45], sun: [1.05, 1, 1.05], amb: [.4, .38, .6] },
    inferno: { skyA: [.16, .03, .02], skyB: [.8, .32, .08], tA: [.86, .68, .5], tB: [.4, .22, .2], glow: [1, .6, .1], sun: [1.2, .98, .76], amb: [.6, .36, .4] },
    tempest: { skyA: [.07, .12, .17], skyB: [.42, .58, .6], tA: [.8, .88, .88], tB: [.3, .44, .52], glow: [.7, 1, 1], sun: [1, 1.06, 1.1], amb: [.42, .52, .66] },
    chaos: { skyA: [.08, .02, .12], skyB: [.3, .1, .4], tA: [.85, .8, .9], tB: [.28, .22, .4], glow: [1, .3, .9], sun: [1.1, 1, 1.1], amb: [.45, .36, .62] },
  };

  // ------------------------------------------------------------ state
  let phase = 'title', run, B = null, shop = null, sel = null, selMoves = [], peek = null, peekMoves = [], hover = -1, lastMv = null, uid = 1;
  let time = 0, tscale = 1, tsReal = 0, shake = 0, punch = 0, sflash = 0, gray = 0, last = 0, demoT = 1;
  const ents = new Map(), all = new Set(), shelf = [], MD = {};
  const tile = new Float32Array(144), tileK = new Float32Array(36), ty = new Float32Array(36), tv = new Float32Array(36), shBuf = new Float32Array(160);
  const envBones = new Float32Array(128), mouse = { x: 0, y: 0, nx: 0, ny: 0 };
  const cur = JSON.parse(JSON.stringify(TH.a0)); let theme = TH.a0;

  // ------------------------------------------------------------ tweens
  const tweens = [];
  const tw = (d, fn) => new Promise(res => tweens.push({ t: 0, d, fn, res }));
  const wait = d => tw(d, () => { });
  const hitstop = (s = .07, k = .04) => { tscale = k; tsReal = s; };

  // ------------------------------------------------------------ entities
  const rx = a => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
  const ry = a => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
  const rz = a => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
  const mul3 = (a, b) => { const o = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]); return o; };
  function setBone(o, off, Rm, sx, sy, sz, tx, ty_, tz) {
    o[off] = Rm[0] * sx; o[off + 1] = Rm[3] * sx; o[off + 2] = Rm[6] * sx; o[off + 3] = 0;
    o[off + 4] = Rm[1] * sy; o[off + 5] = Rm[4] * sy; o[off + 6] = Rm[7] * sy; o[off + 7] = 0;
    o[off + 8] = Rm[2] * sz; o[off + 9] = Rm[5] * sz; o[off + 10] = Rm[8] * sz; o[off + 11] = 0;
    o[off + 12] = tx; o[off + 13] = ty_; o[off + 14] = tz; o[off + 15] = 1;
  }

  class Ent {
    constructor(m, p) {
      this.m = m; this.p = [p[0], p[1] || 0, p[2]]; this.pp = [p[0], p[2]]; this.yaw = 0; this.sc = 1; this.A = PA; this.B = PB;
      this.sq = 1; this.sqv = 0; this.lean = [0, 0]; this.lv = [0, 0]; this.sca = 0; this.flash = 0; this.rag = null;
      this.spin = 0; this.lift = 0; this.bob = 0; this.wob = 0; this.ph = rand(9); this.side = -1; this.dead = false; this.king = false;
      this.bones = new Float32Array(128);
    }
    upd(dt) {
      const p = this.p, md = MD[this.m], sc = this.sc, t = time + this.ph;
      if (dt > 0) {
        const vx = (p[0] - this.pp[0]) / dt, vz = (p[2] - this.pp[1]) / dt; this.pp[0] = p[0]; this.pp[1] = p[2];
        const tx = clamp(-vx * .05, -.5, .5), tz = clamp(-vz * .05, -.5, .5);
        this.lv[0] += ((tx - this.lean[0]) * 170 - this.lv[0] * 10) * dt; this.lv[1] += ((tz - this.lean[1]) * 170 - this.lv[1] * 10) * dt;
        this.lean[0] += this.lv[0] * dt; this.lean[1] += this.lv[1] * dt;
        this.sqv += ((1 - this.sq) * 280 - this.sqv * 11) * dt; this.sq = clamp(this.sq + this.sqv * dt, .45, 1.7);
        this.flash = Math.max(0, this.flash - dt * 5); this.yaw += this.spin * dt;
      }
      if (this.rag) { // ripped apart: every bone is its own rigid body
        const Ry = ry(this.yaw);
        for (let b = 0; b < md.nb; b++) {
          const q = this.rag[b], c = md.cent[b];
          if (dt > 0) {
            q.v[1] -= 17 * dt; for (let k = 0; k < 3; k++) { q.p[k] += q.v[k] * dt; q.e[k] += q.w[k] * dt; }
            const fl = .1 * sc;
            if (q.p[1] < fl && q.p[1] > -.35 && q.v[1] < 0 && Math.abs(q.p[0]) < 3.3 && Math.abs(q.p[2]) < 3.3) {
              q.p[1] = fl; q.v[1] *= -.45; q.v[0] *= .7; q.v[2] *= .7; for (let k = 0; k < 3; k++) q.w[k] *= .6;
            }
          }
          const Rm = mul3(mul3(mul3(ry(q.e[1]), rx(q.e[0])), rz(q.e[2])), Ry), cx = c[0] * sc, cy = c[1] * sc, cz = c[2] * sc;
          setBone(this.bones, b * 16, Rm, sc, sc, sc, q.p[0] - (Rm[0] * cx + Rm[1] * cy + Rm[2] * cz), q.p[1] - (Rm[3] * cx + Rm[4] * cy + Rm[5] * cz), q.p[2] - (Rm[6] * cx + Rm[7] * cy + Rm[8] * cz));
        }
        return;
      }
      const sq = this.sq * (1 + Math.sin(t * 2.2) * .014), sxz = 1 / Math.sqrt(sq);
      const Ry = ry(this.yaw + this.wob * Math.sin(t * 10) * .14);
      const y = p[1] + this.lift + (this.m === 'ghost' ? .1 + Math.sin(t * 2.5) * .05 : 0) + this.bob * Math.sin(t * 2);
      for (let b = 0; b < md.nb; b++) {
        const w = Math.min(1.5, md.cent[b][1] * 1.5);
        const Rm = mul3(mul3(rx(this.lean[1] * w), rz(-this.lean[0] * w)), Ry);
        setBone(this.bones, b * 16, Rm, sc * sxz, sc * sq, sc * sxz, p[0], y + Math.sin(t * 2.2 + 1) * .012 * w, p[2]);
      }
    }
  }
  function mkEnt(m, p, o) { const e = Object.assign(new Ent(m, p), o); all.add(e); return e; }
  const appear = (e, d = .35) => { e.sca = 1; return tw(d, k => e.sca = 1 - k); };
  const vanish = (e, d = .35) => tw(d, k => e.sca = k).then(() => all.delete(e));
  const morph = (e, m) => tw(.22, k => e.sca = k).then(() => { e.m = m; e.flash = 1; return tw(.25, k => e.sca = 1 - k); });

  function hop(e, to, d, h, cb) {
    const fx = e.p[0], fz = e.p[2]; let done = false; e.sqv += 4;
    return tw(d, k => {
      const s = k * k * (3 - 2 * k); e.p[0] = lerp(fx, to[0], s); e.p[2] = lerp(fz, to[2], s); e.p[1] = 4 * h * k * (1 - k);
      if (cb && !done && k > .6) { done = true; cb(); }
    });
  }
  function land(e, i) {
    e.sqv -= 7; if (i >= 0) tv[i] -= 1.5; sfx.land();
    for (let k = 0; k < 7; k++) { const a = rand(6.28); spark(e.p[0] + Math.cos(a) * .2, .05, e.p[2] + Math.sin(a) * .2, Math.cos(a) * 1.6, rand(.4, 1.2), Math.sin(a) * 1.6, [.9, .88, .8], .05, .35, { g: 4 }); }
  }
  function rip(e, dx, dz) {
    const md = MD[e.m], c = Math.cos(e.yaw), s = Math.sin(e.yaw); e.rag = [];
    for (let b = 0; b < md.nb; b++) {
      const q = md.cent[b], x = q[0] * e.sc, y = q[1] * e.sc, z = q[2] * e.sc;
      e.rag.push({ p: [e.p[0] + c * x + s * z, e.p[1] + e.lift + y, e.p[2] - s * x + c * z], v: [dx * rand(2, 5.5) + rand(-1.6, 1.6), rand(3, 7.5), dz * rand(2, 5.5) + rand(-1.6, 1.6)], e: [0, 0, 0], w: [rand(-13, 13), rand(-13, 13), rand(-13, 13)] });
    }
    wait(.8).then(() => vanish(e, .45));
  }

  // ------------------------------------------------------------ particles
  const PT = [], pdata = new Float32Array(6000 * 14);
  function spark(x, y, z, vx, vy, vz, c, size, life, o = {}) {
    if (PT.length < 5900) PT.push({ x, y, z, vx, vy, vz, c, size, life, max: life, g: o.g ?? 12, drag: o.drag ?? .5 });
  }
  function burst(p, c, n, sp, o) {
    for (let i = 0; i < n; i++) {
      const a = rand(6.28), u = rand(-.3, 1), r = Math.sqrt(1 - u * u * .9), v = sp * rand(.4, 1);
      spark(p[0], p[1], p[2], Math.cos(a) * r * v, u * v + 1.5, Math.sin(a) * r * v, c, rand(.05, .1), rand(.4, .9), o);
    }
  }
  function updParticles(dt) {
    let n = 0;
    for (let i = PT.length - 1; i >= 0; i--) {
      const q = PT[i]; q.life -= dt;
      if (q.life <= 0) { PT[i] = PT[PT.length - 1]; PT.pop(); continue; }
      q.vy -= q.g * dt; const d = 1 - q.drag * dt; q.vx *= d; q.vz *= d; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < .03 && q.vy < 0 && q.y > -.3 && Math.abs(q.x) < 3.3 && Math.abs(q.z) < 3.3) { q.y = .03; q.vy *= -.4; q.vx *= .6; q.vz *= .6; }
    }
    for (const q of PT) {
      const o = n++ * 14;
      pdata[o] = q.x; pdata[o + 1] = q.y; pdata[o + 2] = q.z; pdata[o + 6] = q.c[0]; pdata[o + 7] = q.c[1]; pdata[o + 8] = q.c[2];
      pdata[o + 9] = .5; pdata[o + 10] = 3; pdata[o + 11] = 0; pdata[o + 12] = q.size * Math.min(1, q.life / q.max * 2.5); pdata[o + 13] = 0;
    }
    return n;
  }

  // ------------------------------------------------------------ effects
  function coins(p, n) {
    run.gold += n; hud(); sfx.coin();
    const g = $('#gold'); g.classList.add('bump'); setTimeout(() => g.classList.remove('bump'), 90);
    for (let i = 0; i < n * 3 + 2; i++) spark(p[0], .5, p[2], rand(-1.5, 1.5), rand(4, 7), rand(-1.5, 1.5), [1, rand(.7, .9), .25], .08, rand(.6, 1));
  }
  function smash(v, src) {
    if (!v || v.dead) return; v.dead = true;
    for (const [id, e] of ents) if (e === v) ents.delete(id);
    const dx = v.p[0] - src[0], dz = v.p[2] - src[2], l = Math.hypot(dx, dz) || 1;
    rip(v, dx / l, dz / l);
    burst([v.p[0], .45, v.p[2]], v.A, 24, 4.5); burst([v.p[0], .45, v.p[2]], v.B, 14, 5.5);
    shake = Math.max(shake, v.king ? .8 : .35); punch = 1; sflash = Math.max(sflash, .12); sfx.cap();
    if (v.king) { tscale = .2; tsReal = .9; } else hitstop();
    if (v.side === 1 && B) coins(v.p, 1 + (run.relics.includes('purse') ? 1 : 0));
  }
  function boomFx(p) {
    burst([p[0], .3, p[2]], [1, .55, .15], 60, 8); burst([p[0], .3, p[2]], [1, .9, .4], 40, 5); burst([p[0], .3, p[2]], [.25, .2, .25], 30, 6, { g: 3 });
    shake = Math.max(shake, .7); sflash = .5; punch = 1.5; sfx.boom();
    for (let i = 0; i < 36; i++) { const q = TP(i), d = Math.hypot(q[0] - p[0], q[2] - p[2]); if (d < 2.2) tv[i] -= 3 / (1 + d); }
  }
  function shieldFx(p) {
    sfx.shield(); sflash = Math.max(sflash, .15);
    for (let i = 0; i < 40; i++) { const a = i / 40 * 6.28; spark(p[0] + Math.cos(a) * .45, .5 + Math.sin(a * 3) * .3, p[2] + Math.sin(a) * .45, Math.cos(a) * 2, 1, Math.sin(a) * 2, [.5, .8, 1], .09, .6, { g: 0, drag: 3 }); }
  }
  function boltFx(p) {
    sfx.bolt(); sflash = .6; shake = Math.max(shake, .5);
    let x = p[0], z = p[2];
    for (let y = 0; y < 7; y += .12) { x += rand(-.09, .09); z += rand(-.05, .05); spark(x, y, z, rand(-.3, .3), 0, rand(-.3, .3), [1, 1, .6], .1, rand(.2, .4), { g: 0 }); }
  }
  function splash(txt, mode, sub) {
    const b = $('#big'); b.className = ''; if (!txt) return;
    b.innerHTML = txt + (sub ? '<small>' + sub + '</small>' : ''); void b.offsetWidth; b.className = mode;
  }

  // ------------------------------------------------------------ hud
  function hud() {
    $('#gold span').textContent = run.gold;
    $('#track').innerHTML = Array.from({ length: 9 }, (_, i) => `<i class="${i % 3 === 2 ? 'boss ' : ''}${i < run.round ? 'done' : i === run.round ? 'now' : ''}"></i>`).join('');
    let t = '';
    if (B && (B.boss === 'tempest' || B.boss === 'chaos')) {
      t = B.boss === 'chaos' ? '?' : B.wind[0] > 0 ? '&rarr;' : B.wind[0] < 0 ? '&larr;' : B.wind[1] > 0 ? '&uarr;' : '&darr;';
      t += [2, 1].map(k => `<i class="${B.timer >= k ? '' : 'on'}"></i>`).join('') + '<i></i>'.repeat(0);
    }
    $('#timer').innerHTML = t;
    $('#bar').classList.toggle('on', phase === 'shop');
    if (shop) $('#reroll span').textContent = shop.reroll;
  }
  const prices = [...document.querySelectorAll('.price')];
  function labels() {
    prices.forEach((el, k) => {
      const o = shop && shop.offers[k];
      if (!o || o.sold || phase !== 'shop') { el.style.display = 'none'; return; }
      const [x, y] = gfx.project([o.ped.p[0], 0, o.ped.p[2] + .62]);
      el.style.display = 'block'; el.style.left = x + 'px'; el.style.top = y + 'px';
      el.className = 'price' + (run.gold < o.price ? ' no' : ''); el.innerHTML = '<i class="coin"></i>' + o.price;
    });
  }

  // ------------------------------------------------------------ run / army
  function clearAll() {
    all.clear(); ents.clear(); shelf.length = 0; shop = null; B = null; sel = peek = lastMv = null; selMoves = []; PT.length = 0; tweens.length = 0; gray = 0; tscale = 1;
  }
  function addUnit(t, slot) { const u = { t, slot, id: uid++ }; run.army.push(u); return u; }
  function unitEnt(u, pop) {
    const e = mkEnt(MODEL[u.t], TP(u.slot), { side: 0, yaw: Math.PI, king: u.t === 'K' });
    ents.set(u.id, e); if (pop) appear(e); return e;
  }
  function newRun() {
    clearAll();
    run = { gold: +(Q.get('g') || 3), round: +(Q.get('r') || 0), relics: [], army: [] };
    [['K', 2], ['N', 3], ['P', 7], ['P', 8], ['P', 9]].forEach(([t, s]) => unitEnt(addUnit(t, s), true));
    (Q.get('relics') || '').split(',').filter(k => RELICS[k]).forEach(addRelic);
    (Q.get('army') || '').split('').filter(t => PRICE[t]).forEach(t => { const s = freeSlot(t); if (s >= 0) unitEnt(addUnit(t, s), true); });
    theme = TH['a' + Math.min(2, (run.round / 3) | 0)];
    phase = 'title'; hud(); splash('CHESSLITE', 'show', '&#9654;');
  }
  function freeSlot(t) {
    const used = new Set(run.army.map(u => u.slot));
    const ord = t === 'P' ? [8, 9, 7, 10, 6, 11, 2, 3, 1, 4, 0, 5] : [2, 3, 1, 4, 0, 5, 8, 9, 7, 10, 6, 11];
    const s = ord.find(i => !used.has(i)); return s === undefined ? -1 : s;
  }
  function addRelic(k) {
    run.relics.push(k);
    const n = shelf.length, e = mkEnt(k, [-4 - (n > 5 ? .8 : 0), .15, 2.4 - (n % 6) * .8], { sc: .85, spin: .8, bob: .06 });
    shelf.push({ k, e }); appear(e); return e;
  }

  function genEnemy(r) {
    const act = (r / 3) | 0, boss = r % 3 === 2, budget = [4, 7, 11, 13, 17, 22, 22, 27, 34][r];
    const pool = [['N', 'B', 'F'], ['N', 'B', 'F', 'R', 'X', 'G'], ['N', 'B', 'R', 'X', 'G', 'C', 'Q', 'F']][act];
    let pawns = Math.min(6, 2 + act + ((Math.random() * 2) | 0) + (boss ? 1 : 0)), left = budget - pawns; const big = [];
    while (left >= 3 && big.length < 5) { const c = pool.filter(t => R.VAL[t] <= left); if (!c.length) break; const t = pick(c); big.push(t); left -= R.VAL[t]; }
    pawns = Math.min(6, pawns + left);
    const kx = 2 + ((Math.random() * 2) | 0), out = [{ t: 'K', i: 30 + kx, boss }];
    const near = () => [0, 1, 2, 3, 4, 5].map(x => [x, Math.abs(x - kx) + rand(1.2)]).sort((a, b) => a[1] - b[1]).map(a => a[0]);
    const back = near().filter(x => x !== kx).sort(() => rand() - .5); big.forEach((t, k) => out.push({ t, i: 30 + back[k] }));
    near().slice(0, pawns).forEach(x => out.push({ t: 'P', i: 24 + x }));
    return out;
  }

  // ------------------------------------------------------------ battle
  async function startBattle() {
    phase = 'anim'; sel = peek = lastMv = null; selMoves = [];
    const r = run.round, boss = r % 3 === 2 ? BOSS[(r / 3) | 0] : null, has = k => run.relics.includes(k);
    theme = TH[boss || 'a' + ((r / 3) | 0)];
    const st = R.state();
    for (const u of run.army) st.b[u.slot] = { id: u.id, t: u.t, s: 0 };
    st.f = { shield: has('shield') ? 1 : 0, crown: has('crown'), wings: has('wings'), frenzy: has('frenzy'), thorns: has('thorns') };
    B = { st, boss, n: 0, marks: [], wind: [1, 0], timer: 2 };
    hud();
    for (const f of genEnemy(r)) {
      const id = uid++; st.b[f.i] = { id, t: f.t, s: 1 };
      const col = f.boss ? BOSSCOL[boss] : [EA, boss ? BOSSCOL[boss][1] : EB];
      const e = mkEnt(f.boss ? 'boss' : MODEL[f.t], TP(f.i), { side: 1, A: col[0], B: col[1], king: f.t === 'K', sc: f.boss ? 1.2 : 1 });
      ents.set(id, e); appear(e); sfx.pop(); tv[f.i] -= 1; await wait(.06);
    }
    await wait(.3);
    if (boss) { splash(boss.toUpperCase(), 'flash'); sfx.boss(); shake = .6; await wait(1.2); }
    if (has('egg')) {
      const i = [8, 9, 7, 10, 6, 11, 2, 3, 1, 4, 0, 5].find(i => !st.b[i]);
      if (i !== undefined) { const id = uid++; st.b[i] = { id, t: 'P', s: 0 }; const e = mkEnt('pawn', TP(i), { side: 0, yaw: Math.PI }); ents.set(id, e); appear(e); sfx.pop(); flashRelic('egg'); await wait(.3); }
    }
    if (has('bolt')) {
      const c = []; st.b.forEach((p, i) => { if (p && p.s === 1 && p.t !== 'K') c.push(i); });
      if (c.length) { const i = pick(c), ev = [], q = []; flashRelic('bolt'); boltFx(TP(i)); R.kill(st, i, ev, i, q); R.booms(st, ev, q); await play(ev); await wait(.3); }
    }
    if (boss === 'inferno') addMarks(3);
    if (boss === 'tempest') B.wind = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    doom(); hud();
    if (await checkEnd()) return;
    phase = 'player';
  }
  function flashRelic(k) { const s = shelf.find(s => s.k === k); if (s) { s.e.flash = 1; s.e.sqv += 8; } }
  function addMarks(n) {
    const free = []; for (let i = 0; i < 36; i++) if (!B.marks.some(m => m.i === i)) free.push(i);
    for (let k = 0; k < n && free.length; k++) B.marks.push({ i: free.splice((Math.random() * free.length) | 0, 1)[0], s: 1 });
  }
  const edge = ([dx, dy]) => { const o = []; for (let i = 0; i < 36; i++) { const x = (i % 6) + dx, y = ((i / 6) | 0) + dy; if (x < 0 || y < 0 || x > 5 || y > 5) o.push(i); } return o; };
  function doom() { // tiles that will kill at the next boss tick (AI avoids them)
    const d = new Uint8Array(36); let any = false;
    for (const m of B.marks) if (m.s === 2) { d[m.i] = 1; any = true; }
    if (B.boss === 'tempest' && B.timer === 1) for (const i of edge(B.wind)) { d[i] = 1; any = true; }
    B.st.doom = any ? d : null;
  }

  async function play(evs) {
    for (const e of evs) {
      const en = ents.get(e.id);
      switch (e.e) {
        case 'move': {
          const to = TP(e.t), d = Math.hypot(to[0] - en.p[0], to[2] - en.p[2]), jump = en.m === 'knight' || en.m === 'frog';
          const v = e.cap != null ? ents.get(e.cap) : null, from = [en.p[0], 0, en.p[2]];
          sfx.move();
          await hop(en, to, .15 + d * .045, jump ? .7 : .2 + d * .05, v && (() => smash(v, from)));
          land(en, e.t); if (v) await wait(.12); break;
        }
        case 'die': smash(en, typeof e.src === 'number' ? TP(e.src) : e.src); await wait(.12); break;
        case 'boom': boomFx(TP(e.at)); await wait(.12); break;
        case 'shoot': {
          const a = TP(e.f), b = TP(e.t); en.sqv -= 7; sfx.shoot();
          for (let k = 0; k <= 14; k++) spark(lerp(a[0], b[0], k / 14), .55, lerp(a[2], b[2], k / 14), rand(-.3, .3), rand(.5), rand(-.3, .3), [1, .9, .5], .09, .2 + k * .012, { g: 0 });
          await wait(.1); break;
        }
        case 'promo': sfx.morph(); sflash = .2; await morph(en, 'queen'); break;
        case 'shield': flashRelic('shield'); shieldFx(TP(e.at)); await wait(.15); break;
        case 'bump': {
          const a = [en.p[0], 0, en.p[2]], b = TP(e.t);
          sfx.move(); await hop(en, [lerp(a[0], b[0], .6), 0, lerp(a[2], b[2], .6)], .12, .2);
          flashRelic('shield'); shieldFx(b); shake = .3; await hop(en, a, .2, .35); land(en, e.f); break;
        }
      }
    }
  }

  function select(i) {
    const st = B.st, id = st.b[i].id; sel = i; peek = null; selMoves = R.moves(st, i);
    for (const m of selMoves) { // flag moves that leave the piece hanging
      const c = R.clone(st); R.apply(c, m, null); m.d = false;
      if (c.w < 0 && c.turn === 1) { const j = c.b.findIndex(p => p && p.id === id); if (j >= 0) m.d = R.all(c, 1).some(x => x.t === j && x.k > 0); }
    }
    const e = ents.get(id); if (e) { e.sqv += 5; e.wob = 1; }
    sfx.sel();
  }
  function deselect() { if (sel != null && B) { const p = B.st.b[sel], e = p && ents.get(p.id); if (e) e.wob = 0; } sel = null; selMoves = []; }

  async function playerMove(m) {
    const st = B.st, ev = []; deselect(); peek = null; lastMv = null; phase = 'anim';
    R.apply(st, m, ev); await play(ev);
    if (await checkEnd()) return;
    if (st.turn === 0) { // fury: the same piece goes again
      const i = st.b.findIndex(p => p && p.id === st.again);
      if (i >= 0 && R.moves(st, i).length) { flashRelic('frenzy'); phase = 'player'; select(i); return; }
      st.again = null; st.turn = 1;
    }
    await enemyTurn();
  }
  async function enemyTurn(guard = 0) {
    const st = B.st; phase = 'anim';
    await wait(.22);
    const m = R.best(st, 3);
    if (m) { const ev = []; R.apply(st, m, ev); lastMv = m; await play(ev); } else st.turn = 0;
    if (await checkEnd()) return;
    await bossTick();
    if (await checkEnd()) return;
    if (!R.all(st, 0).length) {
      st.turn = 1;
      if (guard > 3 || !R.all(st, 1).length) { st.w = 1; return checkEnd(); }
      return enemyTurn(guard + 1);
    }
    phase = 'player';
  }
  async function checkEnd() {
    const st = B.st; if (st.w < 0) return false;
    await wait(.5); if (st.w === 0) await win(); else await lose();
    return true;
  }

  async function bossTick() {
    const st = B.st; B.n++;
    if (B.boss === 'inferno') {
      const ev = [], q = []; let any = false;
      for (const m of B.marks) if (m.s === 2) {
        const p = TP(m.i), pc = st.b[m.i]; any = true; tv[m.i] -= 3;
        for (let k = 0; k < 26; k++) spark(p[0] + rand(-.35, .35), .1, p[2] + rand(-.35, .35), rand(-.6, .6), rand(4, 11), rand(-.6, .6), [1, rand(.3, .8), .1], rand(.07, .13), rand(.4, .9), { g: 8 });
        if (pc && pc.t !== 'K') R.kill(st, m.i, ev, m.i, q);
      }
      R.booms(st, ev, q);
      if (any) { sfx.boom(); shake = Math.max(shake, .45); sflash = .2; await wait(.15); }
      await play(ev);
      B.marks = B.marks.filter(m => m.s < 2); B.marks.forEach(m => m.s = 2); addMarks(B.n > 5 ? 3 : 2);
    } else if (B.boss === 'tempest') {
      if (--B.timer <= 0) { await gust(); B.timer = 2; B.wind = pick([[1, 0], [-1, 0], [0, 1], [0, -1]]); }
    } else if (B.boss === 'chaos') {
      if (--B.timer <= 0) { await mutate(); B.timer = 2; }
    }
    doom(); hud();
  }
  async function gust() {
    const st = B.st, [dx, dy] = B.wind, ev = [], q = [], slides = [];
    sfx.wind(); shake = Math.max(shake, .3);
    for (let k = 0; k < 160; k++) spark(rand(-4, 4) - dx * 3, rand(.1, 1.6), rand(-4, 4) + dy * 3, dx * rand(9, 15), 0, -dy * rand(9, 15), [.85, 1, 1], rand(.05, .09), rand(.4, .8), { g: 0, drag: 0 });
    for (let k = 5; k >= 0; k--) for (let j = 0; j < 6; j++) { // leading edge first
      const x = dx ? (dx > 0 ? k : 5 - k) : j, y = dy ? (dy > 0 ? k : 5 - k) : j, i = x + y * 6, p = st.b[i];
      if (!p || p.t === 'K') continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 5 || ny > 5) { const w = TP(i); R.kill(st, i, ev, [w[0] - dx * 2, 0, w[2] + dy * 2], q); }
      else if (!st.b[nx + ny * 6]) { st.b[nx + ny * 6] = p; st.b[i] = null; slides.push([ents.get(p.id), TP(nx + ny * 6), nx + ny * 6]); }
    }
    R.booms(st, ev, q);
    await Promise.all(slides.map(([e, to]) => e ? hop(e, to, .28, .12) : 0));
    slides.forEach(([e, , i]) => e && land(e, i));
    await play(ev);
  }
  async function mutate() {
    const st = B.st, jobs = [], bag = ['P', 'P', 'N', 'N', 'B', 'B', 'R', 'F', 'F', 'X', 'G', 'C', 'Q'];
    sfx.morph(); sflash = .35; shake = Math.max(shake, .3);
    for (let i = 0; i < 36; i++) {
      const p = st.b[i]; if (!p || p.t === 'K') continue;
      const t = pick(bag.filter(t => t !== p.t)); st.b[i] = { ...p, t };
      const e = ents.get(p.id); if (e) jobs.push(morph(e, MODEL[t]));
    }
    await Promise.all(jobs);
  }

  async function win() {
    phase = 'anim'; sfx.win(); B.marks = []; lastMv = null;
    for (const [id, e] of [...ents]) if (e.side === 1) { ents.delete(id); e.dead = true; vanish(e); burst([e.p[0], .4, e.p[2]], e.B, 8, 3); await wait(.05); }
    coins([0, 0, 0], 4 + run.round); await wait(.9);
    if (run.round >= 8) {
      phase = 'over'; splash('VICTORY', 'show', '&#9654;');
      for (let k = 0; k < 12; k++) wait(k * .25).then(() => burst([rand(-3, 3), rand(1, 3), rand(-3, 3)], [rand(.4, 1), rand(.4, 1), rand(.4, 1)], 40, 6, { g: 5 }));
      return;
    }
    enterShop();
  }
  async function lose() {
    phase = 'anim'; sfx.lose(); await tw(.6, k => gray = k);
    splash('DEFEAT', 'show', '&#9654;'); phase = 'over';
  }

  // ------------------------------------------------------------ shop
  async function enterShop() {
    phase = 'anim'; B = null; deselect(); peek = null;
    for (const [id, e] of [...ents]) if (!run.army.some(u => u.id === id)) { ents.delete(id); vanish(e); }
    for (const u of run.army) {
      const e = ents.get(u.id);
      if (!e) { unitEnt(u, true); continue; }
      if (e.m !== MODEL[u.t]) morph(e, MODEL[u.t]);
      hop(e, TP(u.slot), .35, .5).then(() => land(e, u.slot));
    }
    shop = { offers: [], reroll: 1 }; roll();
    await wait(.5); phase = 'shop'; hud();
  }
  function roll() {
    for (const o of shop.offers) if (!o.sold) { vanish(o.ped); vanish(o.item); }
    const act = Math.min(2, ((run.round + 1) / 3) | 0);
    const pool = [['P', 'P', 'N', 'B', 'F'], ['P', 'N', 'B', 'R', 'F', 'X'], ['N', 'B', 'R', 'Q', 'G', 'C', 'X']][act];
    const rel = Object.keys(RELICS).filter(k => !run.relics.includes(k)).sort(() => rand() - .5);
    const offs = [{ t: pick(pool) }, { t: pick(pool) }, rel.length > 1 && rand() < .5 ? { rel: rel[1] } : { t: pick(['F', 'X', 'G', 'C']) }, rel.length ? { rel: rel[0] } : { t: pick(pool) }];
    shop.offers = offs.map((o, k) => {
      const i = 19 + k, p = TP(i), ped = mkEnt('ped', p, {}), item = mkEnt(o.rel || MODEL[o.t], p, { lift: .5, spin: 1.2, sc: .85, bob: .05 });
      wait(k * .07).then(() => { sfx.pop(); tv[i] -= 1.5; }); ped.sca = item.sca = 1; wait(k * .07).then(() => { appear(ped); appear(item); });
      return { ...o, i, ped, item, price: o.rel ? RELICS[o.rel][0] : PRICE[o.t], sold: false };
    });
  }
  function nope(o) { sfx.err(); o.item.wob = 1; o.item.sqv += 6; setTimeout(() => o.item.wob = 0, 350); }
  function buy(o) {
    if (o.sold) return;
    const e = o.item;
    if (run.gold < o.price) return nope(o);
    if (o.t) {
      const slot = freeSlot(o.t); if (slot < 0) return nope(o);
      const u = addUnit(o.t, slot); ents.set(u.id, e);
      Object.assign(e, { spin: 0, bob: 0, side: 0 }); tw(.4, k => { e.lift = .5 * (1 - k); e.sc = lerp(.85, 1, k); e.yaw = lerp(e.yaw % 6.2832, Math.PI, k); });
      hop(e, TP(slot), .45, 1.1).then(() => land(e, slot));
    } else {
      all.delete(e); const s = addRelic(o.rel); s.sca = 0; const to = s.p.slice(); s.p[0] = e.p[0]; s.p[1] = .5; s.p[2] = e.p[2];
      tw(.5, k => { const q = k * k * (3 - 2 * k); s.p[0] = lerp(e.p[0], to[0], q); s.p[2] = lerp(e.p[2], to[2], q); s.p[1] = lerp(.5, to[1], q) + Math.sin(k * 3.14) * 1.2; });
    }
    run.gold -= o.price; o.sold = true; vanish(o.ped); sfx.buy(); hud();
    burst([o.ped.p[0], .6, o.ped.p[2]], [1, .8, .3], 18, 4);
  }
  function shopClick(i) {
    const o = shop.offers.find(o => o.i === i && !o.sold); if (o) { deselect(); return buy(o); }
    const at = s => run.army.find(u => u.slot === s);
    if (sel != null && i >= 0 && i < 12 && i !== sel) {
      const a = at(sel), b = at(i); a.slot = i; hop(ents.get(a.id), TP(i), .25, .5).then(() => land(ents.get(a.id), i));
      if (b) { b.slot = sel; hop(ents.get(b.id), TP(sel), .25, .3); }
      ents.get(a.id).wob = 0; sel = null; sfx.move(); return;
    }
    if (sel != null) ents.get(at(sel).id).wob = 0;
    if (i >= 0 && i < 12 && at(i) && i !== sel) { sel = i; const e = ents.get(at(i).id); e.wob = 1; e.sqv += 5; sfx.sel(); } else sel = null;
  }
  function go() {
    if (phase !== 'shop') return;
    if (sel != null) { const u = run.army.find(u => u.slot === sel); if (u) ents.get(u.id).wob = 0; sel = null; }
    for (const o of shop.offers) if (!o.sold) { vanish(o.ped); vanish(o.item); }
    shop = null; run.round++; sfx.click(); startBattle(); hud();
  }
  $('#go').onclick = go;
  $('#reroll').onclick = () => {
    if (phase !== 'shop') return;
    if (run.gold < shop.reroll) return sfx.err();
    run.gold -= shop.reroll; shop.reroll++; sfx.click(); roll(); hud();
  };

  // ------------------------------------------------------------ input
  const rayPlane = (r, y) => { const t = (y - r.o[1]) / r.d[1]; return [r.o[0] + r.d[0] * t, r.o[2] + r.d[2] * t]; };
  const tileAt = (x, z) => { const tx = Math.floor(x + 3), ty_ = Math.floor(3 - z); return tx < 0 || ty_ < 0 || tx > 5 || ty_ > 5 ? -1 : tx + ty_ * 6; };
  function rayDist(r, p) {
    const v = [p[0] - r.o[0], p[1] - r.o[1], p[2] - r.o[2]], t = v[0] * r.d[0] + v[1] * r.d[1] + v[2] * r.d[2];
    return Math.hypot(v[0] - r.d[0] * t, v[1] - r.d[1] * t, v[2] - r.d[2] * t);
  }
  function pickTile() {
    const r = gfx.ray(mouse.nx, mouse.ny);
    if (shop) for (const o of shop.offers) if (!o.sold && rayDist(r, [o.ped.p[0], .75, o.ped.p[2]]) < .42) return o.i;
    const occ = i => B ? B.st.b[i] : run.army.some(u => u.slot === i);
    const [hx, hz] = rayPlane(r, .5), t1 = tileAt(hx, hz);
    if (t1 >= 0 && occ(t1)) { const c = TP(t1); if (Math.hypot(hx - c[0], hz - c[2]) < .42) return t1; }
    const [gx, gz] = rayPlane(r, 0); return tileAt(gx, gz);
  }
  function click(i) {
    if (phase === 'shop') return shopClick(i);
    if (phase !== 'player') return;
    const st = B.st, m = sel != null && selMoves.find(m => m.t === i);
    if (m) return playerMove(m);
    if (st.again != null) { deselect(); st.again = null; st.turn = 1; return enemyTurn(); } // decline the fury move
    const p = i >= 0 && st.b[i];
    deselect(); peek = null;
    if (p && p.s === 0) select(i);
    else if (p) { peek = i; peekMoves = R.moves(st, i); sfx.sel(); }
  }
  function setMouse(e) {
    const [w, h] = gfx.size(); mouse.x = e.clientX; mouse.y = e.clientY; mouse.nx = e.clientX / w * 2 - 1; mouse.ny = 1 - e.clientY / h * 2;
    hover = run ? pickTile() : -1;
  }
  let downTile = -1;
  const cv = $('#c');
  cv.addEventListener('pointermove', setMouse);
  cv.addEventListener('pointerdown', e => {
    sfx.init(); setMouse(e);
    if (phase === 'title') { splash(null); sfx.click(); return startBattle(); }
    if (phase === 'over') { sfx.click(); return newRun(); }
    downTile = hover; click(hover);
  });
  cv.addEventListener('pointerup', e => { // drag & drop
    setMouse(e);
    if (hover < 0 || hover === downTile || sel == null) return;
    if ((phase === 'player' && selMoves.some(m => m.t === hover)) || (phase === 'shop' && hover < 12)) click(hover);
  });
  function tip() {
    const el = $('#tip'); let t = null;
    if (run && (phase === 'shop' || phase === 'player')) {
      const r = gfx.ray(mouse.nx, mouse.ny);
      for (const s of shelf) if (rayDist(r, [s.e.p[0], s.e.p[1] + .3, s.e.p[2]]) < .4) t = RELICS[s.k].slice(1);
      const o = shop && shop.offers.find(o => o.i === hover && !o.sold); if (o) t = o.rel ? RELICS[o.rel].slice(1) : NAMES[o.t];
    }
    if (!t) { el.style.display = 'none'; return; }
    el.style.display = 'block'; el.style.left = mouse.x + 'px'; el.style.top = mouse.y + 'px'; el.innerHTML = '<b>' + t[0] + '</b>' + (t[1] || '');
  }

  // ------------------------------------------------------------ frame
  function glows() {
    tileK.fill(0);
    const set = (i, k, c) => { if (i < 0) return; tileK[i] = k; tile[i * 4] = c[0]; tile[i * 4 + 1] = c[1]; tile[i * 4 + 2] = c[2]; };
    if (B) {
      if (lastMv) { set(lastMv.f, 3, C.last); set(lastMv.t, 3, C.last); }
      if (B.boss === 'tempest' && B.timer === 1) for (const i of edge(B.wind)) set(i, 3, C.wind);
      for (const m of B.marks) set(m.i, m.s === 2 ? 4 : 3, C.lava);
      if (peek != null) for (const m of peekMoves) set(m.t, m.k ? 3 : 2, C.foe);
      if (sel != null) { set(sel, 1, C.sel); for (const m of selMoves) set(m.t, m.k ? 3 : 2, m.k ? C.cap : m.d ? C.danger : C.move); }
    } else if (shop && phase === 'shop') {
      for (const o of shop.offers) if (!o.sold) set(o.i, 3, run.gold >= o.price ? C.gold : C.no);
      if (sel != null) { for (let i = 0; i < 12; i++) set(i, 2, C.move); set(sel, 1, C.sel); }
    }
    if (hover >= 0 && !tileK[hover] && (phase === 'player' || phase === 'shop')) set(hover, 1, C.hover);
    for (let i = 0; i < 36; i++) tile[i * 4 + 3] = ty[i];
  }
  function ambient(dt) {
    if (rand() < dt * 14) spark(rand(-6, 6), rand(-1, 3), rand(-6, 4), rand(-.1, .1), rand(.1, .4), 0, cur.glow, rand(.03, .06), rand(2, 4), { g: -.15, drag: 0 });
    if (!B) return;
    for (const m of B.marks) if (rand() < dt * (m.s === 2 ? 14 : 4)) { const p = TP(m.i); spark(p[0] + rand(-.4, .4), .05, p[2] + rand(-.4, .4), 0, rand(.8, 2), 0, [1, rand(.4, .8), .1], .06, rand(.4, .9), { g: -1 }); }
    if (B.boss === 'tempest' && rand() < dt * (B.timer === 1 ? 50 : 14)) {
      const [dx, dy] = B.wind; spark(rand(-4, 4) - dx * 4, rand(.2, 1.8), rand(-4, 4) + dy * 4, dx * rand(4, 7), 0, -dy * rand(4, 7), [.8, 1, 1], .05, rand(.8, 1.6), { g: 0, drag: 0 });
    }
    for (const e of all) if (e.m === 'bomb' && !e.rag && e.sca < .1 && rand() < dt * 12) spark(e.p[0] + .07, e.p[1] + .82 * e.sq, e.p[2], rand(-.5, .5), rand(.5, 1.5), rand(-.5, .5), [1, rand(.5, .9), .2], .04, .3, { g: 2 });
  }
  function hsv(h, s, v) { const f = n => { const k = (n + h * 6) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return [f(5), f(3), f(1)]; }

  function frame(ms) {
    requestAnimationFrame(frame);
    const rdt = Math.min(.05, (ms - last) / 1000 || 0); last = ms;
    if (tsReal > 0) { tsReal -= rdt; if (tsReal <= 0) tscale = 1; }
    const dt = rdt * tscale; time += dt;
    for (let i = tweens.length - 1; i >= 0; i--) { const t = tweens[i]; t.t += dt; const k = Math.min(1, t.t / t.d); t.fn(k); if (k >= 1) { tweens.splice(tweens.indexOf(t), 1); t.res(); } }
    if (theme === TH.chaos) { TH.chaos.glow = hsv(time * .15 % 1, .75, 1); TH.chaos.skyB = hsv((time * .15 + .5) % 1, .7, .42); }
    for (const k in cur) for (let i = 0; i < 3; i++) cur[k][i] += (theme[k][i] - cur[k][i]) * Math.min(1, rdt * 2.5);
    shake *= Math.exp(-rdt * 8); punch *= Math.exp(-rdt * 7); sflash *= Math.exp(-rdt * 9);
    const cam = gfx.cam, kz = Math.max(1, 1.5 / cam.aspect) * (1 - punch * .035);
    cam.pos = [mouse.nx * .4 + rand(-1, 1) * shake * .4, 8.6 * kz + rand(-1, 1) * shake * .4, 7.4 * kz]; cam.tgt = [mouse.nx * .1, .3, .1];
    for (let i = 0; i < 36; i++) { tv[i] += (-ty[i] * 320 - tv[i] * 13) * dt; ty[i] = clamp(ty[i] + tv[i] * dt, -.25, .2); }
    ambient(dt);
    let nsh = 0;
    for (const e of all) {
      e.upd(dt);
      if (!e.rag && e.sca < .6 && nsh < 40 && Math.abs(e.p[0]) < 3.2) { shBuf[nsh * 4] = e.p[0]; shBuf[nsh * 4 + 1] = e.p[2]; shBuf[nsh * 4 + 2] = .42 * e.sc; shBuf[nsh * 4 + 3] = .6 * (1 - e.sca) * clamp(1 - (e.p[1] + e.lift) * .6, .2, 1); nsh++; }
    }
    const np = updParticles(dt);
    glows();
    envBones.fill(0);
    for (let b = 0; b < 8; b++) { const o = b * 16; envBones[o] = envBones[o + 5] = envBones[o + 10] = envBones[o + 15] = 1; envBones[o + 13] = b === 0 ? 0 : b < 5 ? Math.sin(time * 1.6 + b * 1.7) * .06 : Math.sin(time * .5 + b * 2.1) * .3; }
    gfx.begin({ sun: cur.sun, amb: cur.amb, glow: cur.glow, time, tile, tileK, sh: shBuf, nsh });
    gfx.draw('env', envBones, { A: cur.tA, B: cur.tB, mode: 1 });
    for (const e of all) if (e.sca < .995) gfx.draw(e.m, e.bones, { A: e.A, B: e.B, flash: e.flash, scatter: e.sca });
    gfx.particles(pdata, np);
    gfx.end({ skyA: cur.skyA, skyB: cur.skyB, time, flash: sflash, gray, fade: 1 });
    labels(); tip();
    if (Q.has('demo') && (demoT -= rdt) < 0) { // self-playing mode for testing
      demoT = .35;
      if (phase === 'title') { splash(null); startBattle(); }
      else if (phase === 'player') { const m = R.best(B.st, 2); if (m) playerMove(m); }
      else if (phase === 'shop') { const o = shop.offers.find(o => !o.sold && run.gold >= o.price && (o.rel || freeSlot(o.t) >= 0)); if (o) buy(o); else go(); }
      else if (phase === 'over') newRun();
    }
  }

  // ------------------------------------------------------------ boot
  gfx.init(cv);
  const t0 = performance.now(), defs = S.models();
  let seed = 1, total = 0; const LO = Q.has('lo') ? .12 : 1;
  for (const k in defs) {
    const s = S.sample(defs[k], LO * (k === 'boss' ? 4200 : k === 'ped' ? 1600 : RELICS[k] ? 1500 : 3000) | 0, seed++);
    gfx.model(k, s); MD[k] = { cent: s.cent, nb: s.nb }; total += s.n;
  }
  const env = S.env(LO); gfx.model('env', env);
  console.log('splats: env', env.n, 'models', total, 'in', (performance.now() - t0) | 0, 'ms');
  CL.dbg = { get st() { return { phase, run, B, shop, ents, all }; } };
  newRun();
  if (Q.has('shop')) { splash(null); enterShop(); }
  requestAnimationFrame(frame);
})();
