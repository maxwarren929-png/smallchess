// WebGL2 splat renderer: instanced surface-aligned gaussian splats drawn into a
// low-res target, then a pixel-art post pass (outline, dither, palette crush).
(function (G) {
  'use strict';
  const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQ;
layout(location=1) in vec3 aPos;
layout(location=2) in vec3 aNrm;
layout(location=3) in vec4 aCol;
layout(location=4) in vec4 aInf;
uniform mat4 uVP;
uniform mat4 uBones[8];
uniform vec3 uCam, uA, uB, uC, uL, uSun, uAmb;
uniform float uFlash, uScatter, uT;
uniform int uMode, uNSh;
uniform vec4 uTile[36];
uniform float uTileK[36];
uniform vec4 uSh[40];
out vec3 vCol; out vec2 vQ;
float h1(float n){ return fract(sin(n)*43758.5453); }
void main(){
  int mat=int(aInf.x+.5); float rnd=aCol.a, size=aInf.z, emis=0.;
  vec3 p, n, col=aCol.rgb;
  if(uMode==2){ p=aPos; n=normalize(uCam-p); emis=1.; }
  else { mat4 M=uBones[int(aInf.y+.5)]; p=(M*vec4(aPos,1.)).xyz; n=normalize(mat3(M)*aNrm); size*=length(M[0].xyz); }
  if(mat==0) col*=uA; else if(mat==1) col*=uB; else if(mat==4){ col*=uC*(1.+.25*sin(uT*2.+rnd*6.)); emis=1.; } else if(mat==3) emis=1.;
  if(uMode==1){
    int ti=int(aInf.w+.5)-1;
    if(ti>=0){
      vec4 t=uTile[ti]; p.y+=t.a; float k=uTileK[ti];
      if(k>0.){
        vec2 c=vec2(float(ti%6)-2.5, 2.5-float(ti/6)); vec2 d=abs(p.xz-c); float r=length(p.xz-c), m, e=max(d.x,d.y);
        bool lava=k>9.5 && k<19.5; if(lava) k-=10.; // +10 = burning-tile ring drawn outside whatever else is on the tile
        if(k>19.5) m=(k-20.)*.9; // 20..21 = fading full fill (blast flash)
        else if(k<.5) m=0.; else if(k<1.5) m=.5; else if(k<2.5) m=step(r,.17); else if(k<3.5) m=step(.33,e)*(lava?step(e,.4):1.); else m=.9;
        float top=step(.5,aNrm.y), pl=.82+.18*sin(uT*6.+float(ti));
        m*=top*pl; col=mix(col,t.rgb,m); emis=max(emis,m*.85);
        if(lava){ float l=step(.41,e)*top*pl; col=mix(col,vec3(1.,.5,.1),l); emis=max(emis,l*.85); }
      }
    }
    if(aNrm.y>.3 && p.y>-.5){
      float s=1.;
      for(int i=0;i<uNSh;i++){ vec4 q=uSh[i]; s*=1.-q.w*(1.-smoothstep(q.z*.3,q.z,length(p.xz-q.xy))); }
      col*=mix(.42,1.,s);
    }
  }
  if(uScatter>0.){
    float id=float(gl_InstanceID), s=uScatter;
    vec3 h=vec3(h1(id*.731+rnd),h1(id*1.37+.5),h1(id*2.11+rnd*3.))-.5;
    p+=h*s*1.7+vec3(sin(uT*4.+id)*.12*s, s*s*.9, cos(uT*4.+id)*.12*s);
    size*=1.-s*.8; n=normalize(mix(n,normalize(uCam-p),s));
  }
  vec3 v=normalize(uCam-p), lit=col;
  if(emis<.99){
    float ndl=dot(n,uL)+(rnd-.5)*.3;
    float band=ndl>.45?1.:(ndl>-.05?.6:.25);
    float rim=pow(1.-max(dot(n,v),0.),3.)*.3*step(-.2,n.y);
    lit=mix(col*mix(uAmb,uSun,band)+rim*uSun*col, col, emis);
  }
  vCol=mix(lit,vec3(1.),uFlash); vQ=aQ;
  vec3 f=normalize(mix(n,v,.45)), tx=normalize(cross(f,vec3(0.,1.,.013))), bx=cross(f,tx);
  p+=(tx*aQ.x+bx*aQ.y)*size;
  gl_Position=uVP*vec4(p,1.);
  if(uMode!=2 && uScatter<=0. && dot(n,v)<-.3) gl_Position=vec4(2.,2.,2.,1.);
}`;
  const FS = `#version 300 es
precision mediump float;
in vec3 vCol; in vec2 vQ; out vec4 o;
const float B[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
void main(){
  float d=dot(vQ,vQ); if(d>1.) discard;
  ivec2 c=ivec2(gl_FragCoord.xy)&3;
  if(exp(-d*2.) < .13+B[c.x+c.y*4]/16.*.4) discard;
  o=vec4(vCol,1.);
}`;
  const PV = `#version 300 es
void main(){ vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2)); gl_Position=vec4(p*2.-1.,0.,1.); }`;
  const PF = `#version 300 es
precision highp float;
uniform sampler2D uCol, uDep;
uniform vec3 uSkyA, uSkyB;
uniform vec2 uRes;
uniform float uT, uFlash, uGray, uFade, uNear, uFar;
out vec4 o;
const float B[16]=float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
float lin(float z){ return 2.*uNear*uFar/(uFar+uNear-(2.*z-1.)*(uFar-uNear)); }
void main(){
  ivec2 p=ivec2(gl_FragCoord.xy), mxp=ivec2(uRes)-1; vec2 uv=gl_FragCoord.xy/uRes;
  float z=texelFetch(uDep,p,0).r; vec3 c;
  if(z>=1.){
    c=mix(uSkyB,uSkyA,smoothstep(0.,.95,uv.y+.06*sin(uv.x*5.+uT*.15)));
    c+=uSkyB*.12*sin(uv.y*26.+uT*.3+2.*sin(uv.x*4.-uT*.1));
    float h=fract(sin(dot(vec2(p),vec2(12.9898,78.233)))*43758.5453);
    if(h>.9972) c+=vec3(.55)*(.5+.5*sin(uT*2.+h*900.));
  } else c=texelFetch(uCol,p,0).rgb;
  float l=lin(z), best=l; vec3 bc=c;
  ivec2 O[4]=ivec2[4](ivec2(1,0),ivec2(-1,0),ivec2(0,1),ivec2(0,-1));
  for(int i=0;i<4;i++){ ivec2 q=clamp(p+O[i],ivec2(0),mxp); float ln=lin(texelFetch(uDep,q,0).r); if(ln<best){ best=ln; bc=texelFetch(uCol,q,0).rgb; } }
  if(l-best>.2+l*.012) c=bc*.25;
  c*=1.-.4*pow(length(uv-.5)*1.25,2.5);
  c=mix(c,vec3(dot(c,vec3(.3,.6,.1)))*vec3(.9,.95,1.1),uGray);
  c=mix(c,vec3(1.),uFlash)*uFade;
  ivec2 b=p&3; float th=B[b.x+b.y*4]/16.-.47;
  c=floor(c*7.+.5+th*.85)/7.;
  o=vec4(c,1.);
}`;

  let gl, cv, prog, post, U, PU, fbo, colT, depT, W = 0, H = 0, px = 3, quad, pv, pb, empty;
  const models = {};
  const cam = { pos: [0, 8.6, 7.4], tgt: [0, .3, .1], fov: 36 * Math.PI / 180, aspect: 1.6, near: 1, far: 90, vp: new Float32Array(16), f: [0, 0, -1], r: [1, 0, 0], u: [0, 1, 0] };
  const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function mk(vs, fs) {
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name.replace('[0]', '')] = gl.getUniformLocation(p, name); }
    return [p, u];
  }
  function vao(buf) {
    const v = gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    [[1, 3, 0], [2, 3, 12], [3, 4, 24], [4, 4, 40]].forEach(([l, n, o]) => { gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, gl.FLOAT, false, 56, o); gl.vertexAttribDivisor(l, 1); });
    gl.bindVertexArray(null); return v;
  }
  function tex(ifmt, fmt, type) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, W, H, 0, fmt, type, null);
    for (const k of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, k, gl.NEAREST);
    for (const k of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, k, gl.CLAMP_TO_EDGE);
    return t;
  }
  function resize() {
    px = Math.max(2, Math.round(innerHeight / 360));
    const w = Math.ceil(innerWidth / px), h = Math.ceil(innerHeight / px);
    if (w === W && h === H) return;
    W = w; H = h; cv.width = W; cv.height = H; cv.style.width = W * px + 'px'; cv.style.height = H * px + 'px';
    cam.aspect = W / H;
    if (colT) { gl.deleteTexture(colT); gl.deleteTexture(depT); }
    colT = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE); depT = tex(gl.DEPTH_COMPONENT24, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colT, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depT, 0);
  }
  function init(canvas) {
    cv = canvas; gl = cv.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 required');
    [prog, U] = mk(VS, FS); [post, PU] = mk(PV, PF);
    quad = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, 6000 * 56, gl.DYNAMIC_DRAW); pv = vao(pb);
    empty = gl.createVertexArray(); fbo = gl.createFramebuffer();
    resize(); addEventListener('resize', resize);
  }
  function model(name, s) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, s.data, gl.STATIC_DRAW);
    models[name] = { v: vao(b), n: s.n };
  }
  function camUpdate() {
    const f = nrm([cam.tgt[0] - cam.pos[0], cam.tgt[1] - cam.pos[1], cam.tgt[2] - cam.pos[2]]), r = nrm(cross(f, [0, 1, 0])), u = cross(r, f), e = cam.pos;
    cam.f = f; cam.r = r; cam.u = u;
    const t = 1 / Math.tan(cam.fov / 2), n = cam.near, fa = cam.far, a = t / cam.aspect, c = (fa + n) / (n - fa), d = 2 * fa * n / (n - fa);
    const V = [r[0], u[0], -f[0], r[1], u[1], -f[1], r[2], u[2], -f[2], -dot(r, e), -dot(u, e), dot(f, e)], o = cam.vp;
    for (let i = 0; i < 4; i++) { const x = V[i * 3], y = V[i * 3 + 1], z = V[i * 3 + 2]; o[i * 4] = a * x; o[i * 4 + 1] = t * y; o[i * 4 + 2] = c * z + (i === 3 ? d : 0); o[i * 4 + 3] = -z; }
  }
  function begin(o) {
    camUpdate();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1); gl.clearDepth(1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.useProgram(prog);
    gl.uniformMatrix4fv(U.uVP, false, cam.vp); gl.uniform3fv(U.uCam, cam.pos);
    gl.uniform3fv(U.uL, nrm([-.5, .75, .45])); gl.uniform3fv(U.uSun, o.sun); gl.uniform3fv(U.uAmb, o.amb); gl.uniform3fv(U.uC, o.glow);
    gl.uniform1f(U.uT, o.time); gl.uniform4fv(U.uTile, o.tile); gl.uniform1fv(U.uTileK, o.tileK);
    gl.uniform4fv(U.uSh, o.sh); gl.uniform1i(U.uNSh, o.nsh);
  }
  const ONE = [1, 1, 1];
  function draw(name, bones, o) {
    const m = models[name];
    gl.uniformMatrix4fv(U.uBones, false, bones);
    gl.uniform3fv(U.uA, o.A || ONE); gl.uniform3fv(U.uB, o.B || ONE);
    gl.uniform1f(U.uFlash, o.flash || 0); gl.uniform1f(U.uScatter, o.scatter || 0); gl.uniform1i(U.uMode, o.mode || 0);
    gl.bindVertexArray(m.v); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, m.n);
  }
  function particles(data, n) {
    if (!n) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * 14);
    gl.uniform1f(U.uFlash, 0); gl.uniform1f(U.uScatter, 0); gl.uniform1i(U.uMode, 2);
    gl.bindVertexArray(pv); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }
  function end(o) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.disable(gl.DEPTH_TEST); gl.useProgram(post);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, colT); gl.uniform1i(PU.uCol, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, depT); gl.uniform1i(PU.uDep, 1);
    gl.uniform3fv(PU.uSkyA, o.skyA); gl.uniform3fv(PU.uSkyB, o.skyB); gl.uniform2f(PU.uRes, W, H);
    gl.uniform1f(PU.uT, o.time); gl.uniform1f(PU.uFlash, o.flash); gl.uniform1f(PU.uGray, o.gray); gl.uniform1f(PU.uFade, o.fade);
    gl.uniform1f(PU.uNear, cam.near); gl.uniform1f(PU.uFar, cam.far);
    gl.bindVertexArray(empty); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // nx, ny in -1..1 (y up) -> world ray
  function ray(nx, ny) {
    const t = Math.tan(cam.fov / 2), a = nx * t * cam.aspect, b = ny * t;
    return { o: cam.pos.slice(), d: nrm([cam.f[0] + cam.r[0] * a + cam.u[0] * b, cam.f[1] + cam.r[1] * a + cam.u[1] * b, cam.f[2] + cam.r[2] * a + cam.u[2] * b]) };
  }
  // world -> css pixels
  function project(p) {
    const m = cam.vp, x = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12], y = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13], w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(x / w * .5 + .5) * W * px, (1 - (y / w * .5 + .5)) * H * px];
  }
  G.gfx = { init, model, begin, draw, particles, end, ray, project, cam, size: () => [W * px, H * px] };
})(window.CL = window.CL || {});
