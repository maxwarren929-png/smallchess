// Tiny WebAudio synth for sound effects.
(function (G) {
  'use strict';
  let ac, out, nbuf;
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      out = ac.createGain(); out.gain.value = .3; out.connect(ac.destination);
      nbuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
  }
  function tone(f, d, type = 'square', v = .25, slide = 1, delay = 0) {
    if (!ac) return;
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + d + .02);
  }
  function noise(d, v = .4, fq = 1200, delay = 0, sweep = 1) {
    if (!ac) return;
    const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = nbuf; s.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(fq, t);
    if (sweep !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, fq * sweep), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    s.connect(f); f.connect(g); g.connect(out); s.start(t); s.stop(t + d + .02);
  }
  const arp = (notes, step, type, v, len = .12) => notes.forEach((n, i) => tone(n, len, type, v, 1, i * step));
  const STEP = {};
  G.sfx = {
    init,
    sel: () => tone(700, .05, 'square', .12, 1.3),
    move: () => tone(300, .09, 'triangle', .3, 1.8),
    land: () => { tone(150, .08, 'triangle', .4, .5); noise(.05, .12, 2500); },
    cap: () => { noise(.2, .5, 1400, 0, .2); tone(120, .22, 'square', .25, .35); },
    boom: () => { noise(.6, .8, 900, 0, .08); tone(70, .5, 'sawtooth', .4, .3); },
    coin: () => { tone(1320, .05, 'square', .1); tone(1760, .12, 'square', .1, 1, .05); },
    buy: () => arp([523, 659, 784, 1047], .05, 'square', .13),
    err: () => tone(130, .16, 'sawtooth', .2, .7),
    win: () => arp([523, 659, 784, 1047, 1319, 1568], .08, 'square', .14, .2),
    lose: () => arp([440, 370, 311, 220, 147], .16, 'sawtooth', .16, .3),
    boss: () => { tone(55, 1.2, 'sawtooth', .4, .6); noise(1.2, .35, 300, 0, 3); arp([110, 104, 98], .3, 'square', .15, .35); },
    pop: () => tone(240 + Math.random() * 200, .07, 'triangle', .2, 2),
    bolt: () => { noise(.3, .7, 6000, 0, .1); tone(1800, .2, 'sawtooth', .2, .1); },
    wind: () => noise(.9, .5, 300, 0, 6),
    morph: () => { tone(200, .35, 'sine', .25, 4); tone(303, .35, 'sine', .15, 3, .05); },
    shoot: () => { noise(.12, .5, 3000, 0, .3); tone(500, .1, 'square', .2, .3); },
    shield: () => arp([880, 1320, 1760], .03, 'triangle', .2, .25),
    click: () => tone(440, .04, 'square', .1),
    tick: (f = 1) => tone((1000 + Math.random() * 300) * f, .03, 'square', .07),
    croak: (v = 1) => { tone(230, .07, 'square', .16 * v, .7); tone(190, .1, 'square', .16 * v, .65, .08); },
    whoosh: () => { noise(.4, .3, 300, 0, 7); tone(700, .35, 'sine', .07, .4); },
    squelch: () => { tone(130, .16, 'sine', .4, 2.4); noise(.09, .25, 900, .03, .4); },
    thud: () => { tone(75, .2, 'triangle', .55, .5); noise(.1, .4, 600, 0, .3); },
    stomp: () => { tone(52, .28, 'sine', .6, .5); noise(.16, .35, 380, 0, .3); },
    crack: () => { noise(.2, .6, 3800, 0, .15); tone(240, .09, 'square', .2, .4); noise(.3, .25, 500, .06, .5); },
    chain: () => { for (let i = 0; i < 6; i++) { noise(.025, .22, 5200 + Math.random() * 2000, i * .03); tone(1300 + Math.random() * 600, .025, 'square', .05, 1, i * .03); } },
    gallop: () => { tone(880, .035, 'triangle', .3, .6); tone(720, .035, 'triangle', .3, .6, .09); },
    fizz: () => noise(.25, .18, 7000, 0, .6),
    drum: d => { const n = Math.floor(d / .05); for (let i = 0; i < n; i++) noise(.04, .1 + .25 * i / n, 1800, i * .05, .5); tone(110, d, 'triangle', .12, 1.5); },
    step(m) { (STEP[m] || G.sfx.move)(); },
  };
  Object.assign(STEP, { frog: G.sfx.croak, ghost: G.sfx.whoosh, slime: G.sfx.squelch, ram: G.sfx.thud, golem: G.sfx.stomp, knight: G.sfx.gallop, bomb: G.sfx.fizz, hook: G.sfx.chain });
})(window.CL = window.CL || {});
