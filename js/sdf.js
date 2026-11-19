// SDF shapes -> surface splats. Every model is a smooth union of primitives;
// each primitive belongs to a bone so the shape can be animated / ripped apart.
(function (G) {
  'use strict';
  const rng = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const H = (a, b, c = 0) => Math.sqrt(a * a + b * b + c * c), mx = Math.max, mn = Math.min, ab = Math.abs;
  const STRIDE = 14; // pos3 nrm3 col3 rand | mat bone size extra

  function prep(pt) {
    if (pt.e) return;
    pt.m = pt.m ?? 0; pt.b = pt.b ?? 0; pt.c = pt.c || [1, 1, 1];
    if (pt.r) { // R = Ry * Rx * Rz, row-major, world = R * local
      const [a, b, c] = pt.r, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
      pt.R = [cb * cc + sb * sa * sc, -cb * sc + sb * sa * cc, sb * ca, ca * sc, ca * cc, -sa, -sb * cc + cb * sa * sc, sb * sc + cb * sa * cc, cb * ca];
    }
    const s = pt.s; let e;
    switch (pt.k) {
      case 'sph': e = [s[0], s[0], s[0]]; break;
      case 'ell': case 'box': e = [s[0], s[1], s[2]]; break;
      case 'cyl': e = [s[0], s[1], s[0]]; break;
      case 'cone': { const m = mx(s[0], s[1]); e = [m, s[2], m]; break; }
      case 'tor': e = [s[0] + s[1], s[1], s[0] + s[1]]; break;
    }
    const pad = .03 + (pt.n ? pt.n[0] : 0);
    pt.e = e.map(v => v + pad);
  }

  function pd(pt, x, y, z) {
    let dx = x - pt.p[0], dy = y - pt.p[1], dz = z - pt.p[2];
    const R = pt.R;
    if (R) { const a = R[0] * dx + R[3] * dy + R[6] * dz, b = R[1] * dx + R[4] * dy + R[7] * dz, c = R[2] * dx + R[5] * dy + R[8] * dz; dx = a; dy = b; dz = c; }
    const s = pt.s; let d;
    switch (pt.k) {
      case 'sph': d = H(dx, dy, dz) - s[0]; break;
      case 'ell': { const k0 = H(dx / s[0], dy / s[1], dz / s[2]), k1 = H(dx / (s[0] * s[0]), dy / (s[1] * s[1]), dz / (s[2] * s[2])); d = k1 < 1e-9 ? -mn(s[0], s[1], s[2]) : k0 * (k0 - 1) / k1; break; }
      case 'box': { const r = s[3] || 0, qx = ab(dx) - s[0] + r, qy = ab(dy) - s[1] + r, qz = ab(dz) - s[2] + r; d = H(mx(qx, 0), mx(qy, 0), mx(qz, 0)) + mn(mx(qx, qy, qz), 0) - r; break; }
      case 'cyl': { const r = s[2] || 0, a = H(dx, dz) - s[0] + r, b = ab(dy) - s[1] + r; d = mn(mx(a, b), 0) + H(mx(a, 0), mx(b, 0)) - r; break; }
      case 'cone': {
        const r1 = s[0], r2 = s[1], h = s[2], qx = H(dx, dz), qy = dy, k2x = r2 - r1, k2y = 2 * h;
        const cax = qx - mn(qx, qy < 0 ? r1 : r2), cay = ab(qy) - h;
        let t = ((r2 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y); t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cbx = qx - r2 + k2x * t, cby = qy - h + k2y * t;
        d = ((cbx < 0 && cay < 0) ? -1 : 1) * Math.sqrt(mn(cax * cax + cay * cay, cbx * cbx + cby * cby)); break;
      }
      case 'tor': d = H(H(dx, dz) - s[0], dy) - s[1]; break;
    }
    if (pt.n) { const f = pt.n[1]; d += pt.n[0] * Math.sin(x * f + 1.3) * Math.sin(y * f + 2.1) * Math.sin(z * f + .7); }
    return d;
  }

  let near = 0;
  function ev(parts, k, x, y, z) {
    let d = 1e9, nd = 1e9;
    for (let i = 0; i < parts.length; i++) {
      const a = pd(parts[i], x, y, z);
      if (a < nd) { nd = a; near = i; }
      if (k > 0) { const h = mx(k - ab(d - a), 0) / k; d = mn(d, a) - h * h * k * .25; } else d = mn(d, a);
    }
    return d;
  }

  // Scatter N splats on the model surface: sample a thin band around each
  // primitive, reject points buried in the union, project onto the surface.
  function sample(model, N, seed = 1) {
    return sampleN(model, N, seed);
  }
  function sampleN(model, N, seed) {
    const parts = model.parts; parts.forEach(prep);
    const k = model.k ?? .03, band = .012, rnd = rng(seed), size = model.size ?? .05, jit = model.jit ?? .3;
    let vol = 0; for (const p of parts) vol += 8 * p.e[0] * p.e[1] * p.e[2];
    const rho = N * 4 / vol, acc = [], E = .004;
    for (let round = 0; round < 300 && acc.length < N * 7 * 1.1; round++) {
      for (const pt of parts) {
        let n = rho * 8 * pt.e[0] * pt.e[1] * pt.e[2]; n = (n | 0) + (rnd() < n % 1 ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const lx = (rnd() * 2 - 1) * pt.e[0], ly = (rnd() * 2 - 1) * pt.e[1], lz = (rnd() * 2 - 1) * pt.e[2], R = pt.R;
          let x, y, z;
          if (R) { x = pt.p[0] + R[0] * lx + R[1] * ly + R[2] * lz; y = pt.p[1] + R[3] * lx + R[4] * ly + R[5] * lz; z = pt.p[2] + R[6] * lx + R[7] * ly + R[8] * lz; }
          else { x = pt.p[0] + lx; y = pt.p[1] + ly; z = pt.p[2] + lz; }
          if (ab(pd(pt, x, y, z)) > band) continue;
          let d = ev(parts, k, x, y, z); if (d < -band * 2.5 || d > band * 2.5) continue;
          let nx = 0, ny = 1, nz = 0;
          for (let it = 0; it < 2; it++) {
            nx = ev(parts, k, x + E, y, z) - ev(parts, k, x - E, y, z);
            ny = ev(parts, k, x, y + E, z) - ev(parts, k, x, y - E, z);
            nz = ev(parts, k, x, y, z + E) - ev(parts, k, x, y, z - E);
            const l = H(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
            x -= nx * d; y -= ny * d; z -= nz * d; d = ev(parts, k, x, y, z);
          }
          if (ab(d) > .012) continue;
          if (model.keep && !model.keep(x, y, z)) continue;
          acc.push(x, y, z, nx, ny, nz, near);
        }
      }
    }
    const total = acc.length / 7, idx = Array.from({ length: total }, (_, i) => i);
    for (let i = total - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0, t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const n = mn(N, total), data = new Float32Array(n * STRIDE), cent = [], cnt = [];
    for (let q = 0; q < n; q++) {
      const a = idx[q] * 7, x = acc[a], y = acc[a + 1], z = acc[a + 2], nx = acc[a + 3], ny = acc[a + 4], nz = acc[a + 5], pt = parts[acc[a + 6]];
      const r = rnd(); let mul = 1 + (r - .5) * jit;
      if (pt.m < 3) mul *= .5 + .5 * mx(0, mn(1, ev(parts, k, x + nx * .07, y + ny * .07, z + nz * .07) / .07));
      const o = q * STRIDE;
      data[o] = x; data[o + 1] = y; data[o + 2] = z; data[o + 3] = nx; data[o + 4] = ny; data[o + 5] = nz;
      data[o + 6] = pt.c[0] * mul * (1 + (rnd() - .5) * .08); data[o + 7] = pt.c[1] * mul; data[o + 8] = pt.c[2] * mul * (1 + (rnd() - .5) * .08);
      data[o + 9] = r; data[o + 10] = pt.m; data[o + 11] = pt.b; data[o + 12] = size * (.75 + .5 * rnd()); data[o + 13] = 0;
      const c = cent[pt.b] || (cent[pt.b] = [0, 0, 0]); c[0] += x; c[1] += y; c[2] += z; cnt[pt.b] = (cnt[pt.b] || 0) + 1;
    }
    for (let b = 0; b < cent.length; b++) { if (!cent[b]) cent[b] = [0, 0, 0]; else { cent[b][0] /= cnt[b]; cent[b][1] /= cnt[b]; cent[b][2] /= cnt[b]; } }
    return { data, n, cent, nb: cent.length };
  }

  // ---------------------------------------------------------------- models
  const P = (k, p, s, o) => Object.assign({ k, p, s }, o);
  const base = r => [P('cyl', [0, .05, 0], [r, .05, .03], { m: 1 }), P('cyl', [0, .13, 0], [r * .76, .04, .02])];
  const ring = (n, r, y, f) => Array.from({ length: n }, (_, i) => { const a = i / n * 6.2832 + .3; return f(Math.cos(a) * r, y, Math.sin(a) * r, i); });
  const GOLD = [1, .78, .28], DARK = [.1, .08, .13], STONE = [.55, .53, .62], BONE = [.93, .9, .8];
  const fx = (c, m = 2) => ({ m, c });

  function models() {
    const M = {};
    M.pawn = [...base(.24), P('cone', [0, .3, 0], [.17, .09, .14], { b: 1 }), P('tor', [0, .45, 0], [.11, .03], { m: 1, b: 1 }), P('sph', [0, .59, 0], [.145], { b: 2 })];
    M.rook = [...base(.28), P('cyl', [0, .38, 0], [.18, .22, .03], { b: 1 }), P('cyl', [0, .66, 0], [.24, .07, .02], { b: 2 }),
      ...[[.17, 0], [-.17, 0], [0, .17], [0, -.17]].map(([x, z], i) => P('box', [x, .77, z], [.06, .055, .06, .015], { m: 1, b: 3 + i }))];
    M.knight = [...base(.27), P('cone', [0, .28, 0], [.2, .13, .13], { b: 1 }), P('ell', [0, .5, 0], [.12, .22, .14], { r: [.25, 0, 0], b: 1 }),
      P('ell', [0, .7, .13], [.1, .1, .2], { r: [.45, 0, 0], b: 2 }), P('cone', [.06, .84, .04], [.035, .005, .06], { m: 1, b: 2 }), P('cone', [-.06, .84, .04], [.035, .005, .06], { m: 1, b: 2 }),
      P('box', [0, .6, -.13], [.025, .2, .04, .02], { r: [.25, 0, 0], m: 1, b: 1 })];
    M.bishop = [...base(.26), P('cone', [0, .34, 0], [.18, .08, .2], { b: 1 }), P('tor', [0, .56, 0], [.1, .03], { m: 1, b: 1 }),
      P('ell', [0, .72, 0], [.12, .17, .12], { b: 2 }), P('sph', [0, .92, 0], [.05], { m: 1, b: 3 })];
    M.queen = [...base(.29), P('cone', [0, .38, 0], [.2, .09, .25], { b: 1 }), P('tor', [0, .64, 0], [.11, .03], { m: 1, b: 1 }),
      P('cone', [0, .76, 0], [.09, .17, .08], { b: 2 }), P('sph', [0, .84, 0], [.09], { b: 2 }),
      ...ring(6, .16, .88, (x, y, z) => P('sph', [x, y, z], [.042], { m: 1, b: 3 })), P('sph', [0, .96, 0], [.05], { m: 1, b: 3 })];
    M.king = [...base(.3), P('cone', [0, .4, 0], [.21, .11, .27], { b: 1 }), P('tor', [0, .68, 0], [.13, .035], { m: 1, b: 1 }),
      P('cyl', [0, .8, 0], [.15, .09, .03], { b: 2 }), P('box', [0, 1.03, 0], [.035, .13, .035, .012], { m: 1, b: 3 }), P('box', [0, 1.05, 0], [.1, .035, .035, .012], { m: 1, b: 3 })];
    M.frog = [P('ell', [.22, .09, -.05], [.1, .08, .16], { m: 1 }), P('ell', [-.22, .09, -.05], [.1, .08, .16], { m: 1 }),
      P('ell', [0, .2, 0], [.25, .17, .27], { b: 1 }), P('ell', [0, .13, .09], [.19, .1, .2], { m: 1, b: 1 }),
      P('sph', [.11, .38, .12], [.085], { b: 2 }), P('sph', [-.11, .38, .12], [.085], { b: 2 }),
      P('sph', [.11, .4, .18], [.042], { ...fx(DARK), b: 2 }), P('sph', [-.11, .4, .18], [.042], { ...fx(DARK), b: 2 })];
    M.bomb = [P('cyl', [0, .04, 0], [.16, .04, .02], { m: 1 }), P('sph', [0, .32, 0], [.26], { b: 1 }), P('tor', [0, .32, 0], [.255, .03], { m: 1, b: 1 }),
      P('cyl', [0, .6, 0], [.08, .04, .01], { m: 1, b: 2 }), P('cyl', [.03, .7, 0], [.022, .07, .01], { r: [0, 0, -.4], ...fx([.5, .36, .22]), b: 2 }),
      P('sph', [.07, .79, 0], [.055], { ...fx([1, .7, .2], 3), b: 3 })];
    M.ghost = [...ring(5, .19, .12, (x, y, z) => P('sph', [x, y, z], [.075])), P('cone', [0, .26, 0], [.24, .19, .12], { b: 1 }), P('tor', [0, .4, 0], [.2, .022], { m: 1, b: 1 }),
      P('ell', [0, .52, 0], [.21, .27, .21], { b: 2 }), P('sph', [.08, .58, .18], [.04], { ...fx(DARK), b: 2 }), P('sph', [-.08, .58, .18], [.04], { ...fx(DARK), b: 2 })];
    M.cannon = [...base(.28), P('cyl', [0, .22, 0], [.2, .1, .03], { b: 1 }), P('sph', [0, .42, 0], [.17], { b: 1 }),
      P('cyl', [0, .56, .14], [.085, .2, .02], { r: [1, 0, 0], m: 1, b: 2 }), P('tor', [0, .66, .3], [.085, .025], { r: [1, 0, 0], b: 2 })];
    M.hook = [...base(.26), P('cyl', [0, .42, 0], [.055, .3, .02], { b: 1 }), P('tor', [0, .2, 0], [.13, .035], { m: 1, b: 1 }),
      P('tor', [0, .8, .1], [.11, .04], { r: [0, 1.5708, 1.5708], m: 1, b: 2 }), P('cone', [0, .74, .22], [.05, .005, .08], { m: 1, b: 2 }), P('sph', [0, .72, 0], [.07], { b: 2 })];
    M.ram = [...base(.27), P('ell', [0, .36, -.02], [.2, .19, .22], { b: 1 }), P('sph', [0, .56, .1], [.14], { b: 2 }), P('ell', [0, .5, .23], [.08, .065, .07], { m: 1, b: 2 }),
      ...[1, -1].map((sx, i) => P('tor', [sx * .15, .6, .06], [.075, .032], { r: [0, 0, 1.5708], m: 1, b: 3 + i })),
      P('sph', [.06, .6, .21], [.028], { ...fx(DARK), b: 2 }), P('sph', [-.06, .6, .21], [.028], { ...fx(DARK), b: 2 })];
    M.slime = [P('ell', [0, .19, 0], [.28, .19, .28], { b: 1 }), P('sph', [0, .38, -.02], [.15], { b: 2 }), ...ring(5, .26, .05, (x, y, z) => P('sph', [x, y, z], [.06], { m: 1 })),
      P('sph', [.09, .3, .22], [.045], { ...fx(DARK), b: 2 }), P('sph', [-.09, .3, .22], [.045], { ...fx(DARK), b: 2 })];
    M.golem = [...base(.29), P('box', [0, .44, 0], [.2, .19, .15, .05], { b: 1 }), P('box', [0, .73, .02], [.12, .1, .1, .04], { b: 2 }),
      P('box', [.28, .4, 0], [.07, .17, .08, .03], { m: 1, b: 3 }), P('box', [-.28, .4, 0], [.07, .17, .08, .03], { m: 1, b: 4 }),
      P('sph', [.05, .74, .12], [.026], { ...fx([.4, 1, .9], 3), b: 2 }), P('sph', [-.05, .74, .12], [.026], { ...fx([.4, 1, .9], 3), b: 2 })];
    M.boss = [...base(.34), P('cone', [0, .42, 0], [.26, .14, .3], { b: 1 }), P('tor', [0, .74, 0], [.16, .04], { m: 1, b: 1 }), P('sph', [0, .9, 0], [.19], { b: 2 }),
      P('cone', [.21, 1.05, 0], [.06, .008, .15], { r: [0, 0, -.55], m: 1, b: 3 }), P('cone', [-.21, 1.05, 0], [.06, .008, .15], { r: [0, 0, .55], m: 1, b: 4 }),
      P('sph', [.075, .93, .16], [.038], { ...fx([1, .35, .2], 3), b: 2 }), P('sph', [-.075, .93, .16], [.038], { ...fx([1, .35, .2], 3), b: 2 }),
      ...ring(3, .08, 1.13, (x, y, z) => P('cone', [x, y, z], [.04, .005, .07], { m: 1, b: 5 }))];
    M.lever = [P('box', [0, .1, 0], [.2, .1, .16, .04], fx([.42, .38, .5])), P('box', [0, .21, 0], [.05, .02, .12, .01], fx(DARK)), P('box', [0, .13, .165], [.12, .05, .01, .01], fx(GOLD)),
      P('cyl', [0, .5, 0], [.035, .3, .01], { ...fx([.75, .75, .82]), b: 1 }), P('sph', [0, .84, 0], [.11], { ...fx([1, .28, .3]), b: 1 }), P('sph', [.04, .88, .07], [.03], { ...fx([1, .85, .85], 3), b: 1 })];
    M.ped = [P('cyl', [0, .06, 0], [.3, .06, .02], fx(STONE)), P('cyl', [0, .2, 0], [.2, .1, .02], fx([.45, .44, .55])), P('cyl', [0, .33, 0], [.28, .04, .02], fx(STONE))];
    // relics
    M.shield = [P('ell', [0, .3, 0], [.2, .24, .07], fx([.4, .58, .9])), P('sph', [0, .3, .06], [.075], fx(GOLD)), P('box', [0, .3, .04], [.025, .2, .03, .01], fx(GOLD)), P('box', [0, .34, .04], [.16, .025, .03, .01], fx(GOLD))];
    M.frenzy = [P('sph', [0, .34, 0], [.18], fx(BONE)), P('box', [0, .18, .03], [.1, .07, .09, .03], fx(BONE)), P('sph', [.07, .34, .14], [.055], fx(DARK)), P('sph', [-.07, .34, .14], [.055], fx(DARK)),
      P('sph', [.07, .34, .17], [.022], fx([1, .2, .15], 3)), P('sph', [-.07, .34, .17], [.022], fx([1, .2, .15], 3))];
    M.crown = [P('tor', [0, .22, 0], [.16, .05], fx(GOLD)), ...ring(5, .16, .36, (x, y, z) => P('cone', [x, y, z], [.055, .005, .1], fx(GOLD))), ...ring(5, .2, .22, (x, y, z) => P('sph', [x, y, z], [.035], fx([1, .25, .35], 3)))];
    M.wings = [P('sph', [0, .28, 0], [.07], fx(GOLD)), ...[1, -1].flatMap(s => [P('ell', [s * .19, .36, 0], [.17, .09, .035], { r: [0, 0, s * .5], ...fx([.95, .97, 1]) }), P('ell', [s * .2, .24, 0], [.13, .06, .03], { r: [0, 0, s * .15], ...fx([.8, .88, 1]) })])];
    M.purse = [P('sph', [0, .22, 0], [.19], fx([.62, .42, .24])), P('cone', [0, .43, 0], [.06, .12, .06], fx([.62, .42, .24])), P('tor', [0, .38, 0], [.07, .028], fx(GOLD)), P('cyl', [0, .23, .17], [.08, .02, .01], { r: [1.57, 0, 0], ...fx(GOLD, 3) })];
    M.bolt = [P('box', [0, .45, 0], [.04, .13, .035, .01], { r: [0, 0, -.45], ...fx([1, .9, .3], 3) }), P('box', [.02, .31, 0], [.09, .035, .035, .01], fx([1, .9, .3], 3)), P('box', [.04, .17, 0], [.04, .13, .035, .01], { r: [0, 0, -.45], ...fx([1, .9, .3], 3) })];
    M.egg = [P('ell', [0, .26, 0], [.16, .21, .16], fx([.96, .92, .82])), P('sph', [.1, .3, .1], [.05], fx([.55, .78, .55])), P('sph', [-.08, .2, .12], [.045], fx([.55, .78, .55])), P('sph', [0, .4, -.1], [.05], fx([.55, .78, .55])), P('sph', [-.12, .32, -.06], [.04], fx([.55, .78, .55]))];
    const TH = fx([.8, .9, .45]);
    M.thorns = [P('sph', [0, .28, 0], [.14], fx([.28, .58, .32])), P('cone', [0, .47, 0], [.05, .005, .08], TH), P('cone', [0, .09, 0], [.05, .005, .08], { r: [3.1416, 0, 0], ...TH }),
      P('cone', [.19, .28, 0], [.05, .005, .08], { r: [0, 0, -1.5708], ...TH }), P('cone', [-.19, .28, 0], [.05, .005, .08], { r: [0, 0, 1.5708], ...TH }),
      P('cone', [0, .28, .19], [.05, .005, .08], { r: [1.5708, 0, 0], ...TH }), P('cone', [0, .28, -.19], [.05, .005, .08], { r: [-1.5708, 0, 0], ...TH })];
    M.heart = [P('sph', [.075, .36, 0], [.11], fx([1, .25, .32])), P('sph', [-.075, .36, 0], [.11], fx([1, .25, .32])), P('cone', [0, .22, 0], [.005, .17, .11], fx([1, .25, .32])), P('sph', [.06, .4, .09], [.03], fx([1, .8, .8], 3))];
    M.boots = [P('box', [0, .3, -.04], [.08, .13, .08, .03], fx([.6, .3, .2])), P('box', [0, .13, .04], [.09, .06, .15, .04], fx([.6, .3, .2])), P('box', [0, .07, .04], [.095, .02, .155, .01], fx(DARK)),
      P('cone', [0, .5, -.04], [.07, .005, .1], fx([1, .6, .15], 3))];
    M.anchor = [P('box', [0, .3, 0], [.03, .18, .03, .01], fx(STONE)), P('tor', [0, .53, 0], [.06, .022], { r: [1.5708, 0, 0], ...fx(STONE) }), P('box', [0, .42, 0], [.11, .022, .025, .01], fx(STONE)),
      P('tor', [0, .2, 0], [.15, .03], { r: [1.5708, 0, 0], ...fx(STONE) }), P('cone', [.15, .25, 0], [.04, .005, .06], fx(STONE)), P('cone', [-.15, .25, 0], [.04, .005, .06], fx(STONE))];
    const PINK = fx([1, .62, .72]);
    M.piggy = [P('ell', [0, .25, 0], [.2, .15, .15], PINK), P('cyl', [0, .26, .16], [.055, .03, .01], { r: [1.5708, 0, 0], ...PINK }), P('cone', [.1, .4, .05], [.04, .005, .06], PINK), P('cone', [-.1, .4, .05], [.04, .005, .06], PINK),
      P('box', [0, .405, 0], [.05, .012, .015, .005], fx(DARK)), P('cyl', [0, .44, 0], [.04, .012, .005], { r: [1.5708, 0, 0], ...fx(GOLD, 3) }),
      ...[[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, z]) => P('cyl', [x * .1, .07, z * .07], [.035, .06, .01], PINK))];
    M.clover = [...ring(4, .1, .32, (x, y, z) => P('sph', [x, y, z], [.09], fx([.35, .8, .4]))), P('sph', [0, .32, 0], [.05], fx([.6, 1, .5], 3)), P('box', [.03, .14, 0], [.02, .12, .02, .01], { r: [0, 0, .3], ...fx([.3, .6, .3]) })];
    M.fuse = [...ring(3, .08, .25, (x, y, z) => P('cyl', [x, y, z], [.065, .16, .02], fx([.85, .25, .2]))), P('tor', [0, .25, 0], [.15, .02], fx([.6, .45, .3])),
      P('cyl', [0, .48, 0], [.012, .08, .005], fx(DARK)), P('sph', [0, .58, 0], [.045], fx([1, .8, .3], 3))];
    M.scope = [P('cyl', [0, .3, 0], [.065, .2, .02], { r: [1, 0, 0], ...fx(GOLD) }), P('cyl', [0, .38, .12], [.085, .04, .01], { r: [1, 0, 0], ...fx(GOLD) }),
      P('sph', [0, .4, .16], [.06], fx([.5, .85, 1], 3)), P('cyl', [0, .08, 0], [.12, .03, .01], fx(STONE)), P('box', [0, .16, 0], [.025, .08, .025, .01], fx(STONE))];
    M.horn = [P('cone', [0, .3, 0], [.04, .12, .2], { r: [0, 0, 1.2], ...fx(BONE) }), P('tor', [-.1, .26, 0], [.065, .022], { r: [0, 0, 1.2], ...fx(GOLD) }), P('sph', [-.21, .22, 0], [.03], fx(GOLD))];
    // newer pieces
    const WOOD = [.5, .33, .2], STEEL = [.78, .8, .88];
    M.archer = [...base(.25), P('cone', [0, .3, 0], [.17, .08, .16], { b: 1 }), P('tor', [0, .46, 0], [.09, .028], { m: 1, b: 1 }),
      P('ell', [0, .58, 0], [.1, .12, .1], { b: 2 }), P('cone', [0, .7, -.03], [.08, .005, .09], { r: [-.3, 0, 0], m: 1, b: 2 }),
      P('tor', [.2, .45, .02], [.17, .016], { r: [0, 0, 1.5708], ...fx(WOOD), b: 3 }), P('box', [.2, .45, -.05], [.006, .17, .006, .003], { ...fx(BONE), b: 3 }),
      P('cyl', [-.05, .5, -.14], [.05, .13, .01], { r: [-.35, 0, .2], m: 1, b: 4 }), ...[0, 1, 2].map(k => P('cone', [-.08 + k * .03, .66, -.18], [.02, .003, .04], { ...fx([1, .35, .3]), b: 4 }))];
    M.mage = [...base(.26), P('cone', [0, .38, 0], [.2, .07, .28], { b: 1 }), P('tor', [0, .6, 0], [.08, .025], { m: 1, b: 1 }), P('sph', [0, .7, 0], [.1], { b: 2 }),
      P('cyl', [0, .78, 0], [.17, .015, .01], { m: 1, b: 3 }), P('cone', [0, .92, -.02], [.11, .005, .14], { r: [-.15, 0, 0], m: 1, b: 3 }),
      P('cyl', [.21, .45, .05], [.02, .36, .01], { ...fx(WOOD), b: 4 }), P('sph', [.21, .84, .05], [.06], { ...fx([.5, .8, 1], 3), b: 4 })];
    M.vampire = [...base(.27), P('cone', [0, .36, 0], [.21, .1, .22], { b: 1 }), P('ell', [0, .42, -.1], [.2, .26, .06], { m: 1, b: 1 }),
      P('sph', [0, .72, 0], [.12], { b: 2 }), ...[1, -1].map(sx => P('cone', [sx * .12, .74, -.06], [.06, .005, .11], { r: [0, 0, -sx * .5], m: 1, b: 2 })),
      P('sph', [.045, .75, .1], [.022], { ...fx([1, .15, .2], 3), b: 2 }), P('sph', [-.045, .75, .1], [.022], { ...fx([1, .15, .2], 3), b: 2 })];
    M.lancer = [...base(.27), P('cyl', [0, .36, 0], [.16, .18, .03], { b: 1 }), P('sph', [0, .66, 0], [.13], { b: 2 }),
      P('box', [0, .66, .11], [.09, .022, .04, .01], { ...fx(DARK), b: 2 }), P('cone', [0, .84, -.03], [.05, .005, .08], { m: 1, b: 2 }),
      P('ell', [-.19, .4, .04], [.035, .15, .12], { m: 1, b: 3 }), P('cone', [.17, .58, .14], [.045, .005, .34], { r: [.9, 0, 0], ...fx(STEEL), b: 4 })];
    // newer relics
    M.goblet = [P('cyl', [0, .05, 0], [.11, .03, .01], fx(GOLD)), P('cyl', [0, .15, 0], [.025, .08, .01], fx(GOLD)), P('cone', [0, .33, 0], [.05, .14, .11], fx(GOLD)),
      P('cyl', [0, .43, 0], [.12, .012, .005], fx([.6, .05, .15])), P('sph', [0, .3, .11], [.03], fx([1, .2, .3], 3))];
    M.saddle = [P('ell', [0, .22, 0], [.2, .08, .15], fx([.55, .3, .18])), P('ell', [0, .28, -.1], [.14, .08, .05], fx([.55, .3, .18])),
      P('sph', [0, .32, .12], [.045], fx(GOLD)), ...[1, -1].map(sx => P('tor', [sx * .2, .08, 0], [.045, .014], { r: [0, 0, 1.5708], ...fx(GOLD) }))];
    M.coupon = [P('box', [0, .3, 0], [.18, .11, .012, .01], { r: [0, 0, .15], ...fx([.95, .88, .7]) }), P('box', [-.02, .3, .013], [.12, .025, .004, .002], { r: [0, 0, .15], ...fx([.85, .2, .2]) }),
      P('sph', [.11, .34, .016], [.03], { ...fx(GOLD, 3) })];
    M.scythe = [P('cyl', [0, .3, 0], [.02, .28, .01], { r: [0, 0, .2], ...fx(WOOD) }), P('cone', [-.1, .54, 0], [.045, .005, .17], { r: [0, 0, 1.3], ...fx(STEEL) }),
      P('sph', [-.05, .56, 0], [.03], fx(DARK)), P('sph', [-.22, .5, 0], [.02], fx([.6, 1, .5], 3))];
    M.medal = [P('cyl', [0, .25, 0], [.12, .02, .01], { r: [1.5708, 0, 0], ...fx(GOLD) }), P('sph', [0, .25, .02], [.045], fx([1, .3, .25], 3)),
      ...[1, -1].map(sx => P('box', [sx * .05, .45, 0], [.035, .1, .01, .005], { r: [0, 0, sx * .3], ...fx([.3, .45, 1]) }))];
    // relics, wave 3
    const IRON = [.42, .42, .5], FIRE = [1, .5, .15];
    M.bell = [P('cone', [0, .3, 0], [.17, .07, .15], fx(GOLD)), P('tor', [0, .16, 0], [.165, .025], fx(GOLD)), P('sph', [0, .1, 0], [.045], fx(DARK)),
      P('tor', [0, .5, 0], [.05, .018], { r: [1.5708, 0, 0], ...fx(GOLD) })];
    M.ledger = [P('box', [0, .22, 0], [.17, .04, .13, .01], { r: [0, .3, 0], ...fx([.3, .45, .32]) }), P('box', [0, .22, .005], [.155, .033, .125, .005], { r: [0, .3, 0], ...fx([.95, .9, .78]) }),
      P('box', [0, .27, 0], [.17, .008, .13, .004], { r: [0, .3, 0], ...fx([.3, .45, .32]) }), P('cyl', [.07, .33, .04], [.045, .012, .005], fx(GOLD, 3))];
    M.hourglass = [P('cyl', [0, .07, 0], [.13, .025, .01], fx(WOOD)), P('cyl', [0, .5, 0], [.13, .025, .01], fx(WOOD)),
      P('cone', [0, .18, 0], [.1, .015, .1], fx([.75, .9, 1])), P('cone', [0, .39, 0], [.015, .1, .1], fx([.75, .9, 1])), P('cone', [0, .14, 0], [.07, .01, .06], fx([1, .82, .45], 3)),
      ...[1, -1].map(sx => P('cyl', [sx * .11, .29, 0], [.012, .2, .005], fx(WOOD)))];
    M.phoenix = [P('ell', [0, .3, 0], [.08, .1, .12], fx(FIRE, 3)), P('sph', [0, .44, .08], [.06], fx([1, .7, .2], 3)), P('cone', [0, .45, .16], [.025, .002, .04], { r: [1.5708, 0, 0], ...fx(GOLD) }),
      ...[1, -1].map(sx => P('ell', [sx * .17, .38, -.02], [.15, .05, .08], { r: [0, 0, sx * -.6], ...fx([1, .35, .1], 3) })),
      P('cone', [0, .2, -.14], [.06, .005, .12], { r: [-1, 0, 0], ...fx([1, .8, .3], 3) })];
    M.vigil = [P('cyl', [0, .05, 0], [.12, .03, .01], fx(IRON)), P('cyl', [0, .2, 0], [.075, .14, .02], fx(BONE)), P('cyl', [0, .35, 0], [.006, .02, .002], fx(DARK)),
      P('ell', [0, .42, 0], [.04, .07, .04], fx([1, .85, .4], 3)), P('tor', [0, .12, 0], [.08, .02], fx(BONE))];
    M.rally = [P('cyl', [-.12, .3, 0], [.015, .3, .005], fx(WOOD)), P('box', [.04, .45, 0], [.15, .1, .01, .005], fx([.85, .2, .25])),
      P('box', [.04, .45, .012], [.05, .05, .003, .002], fx(GOLD, 3)), P('sph', [-.12, .62, 0], [.03], fx(GOLD))];
    M.shackles = [...[1, -1].map(sx => P('tor', [sx * .12, .2, 0], [.08, .025], { r: [1.5708, 0, 0], ...fx(IRON) })),
      ...[0, 1, 2].map(k => P('tor', [-.05 + k * .05, .3, 0], [.03, .012], { r: [k % 2 ? 0 : 1.5708, 0, 1.5708], ...fx(IRON) }))];
    // wearables: small enough to hover over a piece's head
    M.lens = [P('tor', [0, .25, 0], [.11, .025], { r: [1.5708, 0, 0], ...fx(GOLD) }), P('cyl', [0, .25, 0], [.095, .012, .005], { r: [1.5708, 0, 0], ...fx([.55, .9, 1], 3) }),
      P('box', [0, .08, 0], [.02, .08, .02, .01], fx(GOLD))];
    M.cloak = [P('cone', [0, .25, 0], [.16, .06, .2], fx([.25, .2, .45])), P('sph', [0, .45, 0], [.08], fx([.25, .2, .45])), P('sph', [0, .38, .04], [.03], fx(GOLD, 3))];
    M.treads = [...[1, -1].map(sx => P('box', [sx * .12, .1, 0], [.05, .07, .17, .04], fx(IRON))), P('box', [0, .18, 0], [.12, .03, .1, .01], fx([.6, .45, .3])),
      ...[-.1, 0, .1].map(z => P('cyl', [0, .1, z], [.03, .17, .005], { r: [0, 0, 1.5708], ...fx(DARK) }))];
    M.striders = [...[1, -1].map(sx => P('box', [sx * .08, .2, 0], [.05, .12, .06, .02], fx([.6, .9, .7]))), ...[1, -1].map(sx => P('box', [sx * .08, .07, .04], [.055, .03, .11, .02], fx([.4, .7, .5]))),
      ...[1, -1].map(sx => P('ell', [sx * .17, .25, -.04], [.08, .03, .05], { r: [0, 0, sx * -.4], ...fx([.95, .97, 1]) }))];
    const out = {};
    for (const k in M) out[k] = { parts: M[k], k: .035, size: .05 };
    return out;
  }

  // Copy sampled splats with an offset / material / bone / extra override.
  function xf(s, o) {
    const d = s.data.slice();
    for (let i = 0; i < d.length; i += STRIDE) {
      if (o.off) { d[i] += o.off[0]; d[i + 1] += o.off[1]; d[i + 2] += o.off[2]; }
      if (o.mat != null) d[i + 10] = o.mat; if (o.bone != null) d[i + 11] = o.bone; if (o.extra != null) d[i + 13] = o.extra;
    }
    return d;
  }

  // Static world: 36 tiles (extra = tile index + 1), island, crystal pillars, drifting rocks.
  function env(q = 1) {
    const out = [], rnd = rng(77), sample = (m, n, s) => sampleN(m, Math.ceil(n * q), s);
    const tiles = [0, 1, 2, 3].map(s => sample({ parts: [P('box', [0, -.11, 0], [.47, .11, .47, .04], {})], k: 0, size: .062, jit: .13 }, 1800, 10 + s));
    for (let i = 0; i < 36; i++) {
      const x = i % 6, y = (i / 6) | 0;
      out.push(xf(tiles[(i * 7 + y) % 4], { off: [x - 2.5, 0, 2.5 - y], mat: (x + y) % 2 ? 0 : 1, extra: i + 1 }));
    }
    out.push(sample({
      parts: [P('box', [0, -.4, 0], [3.3, .2, 3.3, .1], fx([.5, .47, .6])), P('box', [0, -.27, 0], [3.37, .05, 3.37, .04], fx([.78, .62, .36])),
        P('cone', [0, -2, 0], [.5, 3.6, 1.4], { ...fx([.4, .33, .4]), n: [.2, 1.6] })],
      k: .12, size: .085, jit: .4,
    }, 40000, 5).data);
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz], i) => {
      const x = sx * 3.12, z = sz * 3.12;
      out.push(sample({ parts: [P('cyl', [x, -.02, z], [.14, .2, .03], fx(STONE)), P('cyl', [x, .19, z], [.18, .04, .02], fx([.78, .62, .36]))], size: .05 }, 1300, 20 + i).data);
      out.push(xf(sample({ parts: [P('cone', [x, .66, z], [.1, .005, .14], fx([1, 1, 1], 4)), P('cone', [x, .42, z], [.005, .1, .1], fx([1, 1, 1], 4))], k: .01, size: .045, jit: .5 }, 900, 30 + i), { bone: 1 + i }));
    });
    for (let i = 0; i < 18; i++) {
      const a = rnd() * 6.2832, r = 5.5 + rnd() * 6; let x = Math.cos(a) * r, z = Math.sin(a) * r * .8 - 2, y = -3 + rnd() * 4.5;
      if (z > 1.5) y = -2.5 - rnd() * 2;
      if (x < -3 && x > -6.5 && z > -1.5) x -= 3.5;
      const s = .4 + rnd() * .8, g = .34 + rnd() * .12;
      const parts = [P('ell', [x, y, z], [s, s * (.5 + rnd() * .4), s * (.7 + rnd() * .5)], { ...fx([g + .04, g, g + .08]), n: [.12, 2.6] })];
      if (i % 3 === 0) parts.push(P('cone', [x, y + s * .6 + .12, z], [.12, .005, .25], fx([1, 1, 1], 4)));
      out.push(xf(sample({ parts, k: .05, size: .09, jit: .4 }, 1500 + ((s * 900) | 0), 50 + i), { bone: 5 + i % 3 }));
    }
    let n = 0; for (const d of out) n += d.length;
    const data = new Float32Array(n); n = 0;
    for (const d of out) { data.set(d, n); n += d.length; }
    return { data, n: n / STRIDE };
  }

  G.S = { STRIDE, sample, models, env, rng };
})(typeof window !== 'undefined' ? (window.CL = window.CL || {}) : (globalThis.CL = globalThis.CL || {}));
