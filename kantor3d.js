/* KANTOR3D — alat bersama untuk game diorama (Basket Kantor, Tenis Kantor):
   kepala kotak berwajah foto, orang, kamera isometrik, siang-malam, hujan, pulau melayang,
   suara sintetis, dompet Poin Kantor (sama dengan Ring Kantor & Hoki Kantor), dan layar taruhan. */
"use strict";
(function () {
  const K = {};
  const THREE = window.THREE;
  // ---------- util ----------
  K.TAU = Math.PI * 2;
  K.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  K.lerp = (a, b, t) => a + (b - a) * t;
  K.rand = (a, b) => a + Math.random() * (b - a);
  K.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  K.shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  K.wrapA = (a) => { while (a > Math.PI) a -= K.TAU; while (a < -Math.PI) a += K.TAU; return a; };
  K.fmt = (n) => Math.round(n).toLocaleString("id-ID");
  K.hex = (n) => "#" + n.toString(16).padStart(6, "0");
  K.$ = (id) => document.getElementById(id);
  K.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };
  const wallet = () => K.store.get("rk_wallet", {});
  K.getPts = (id) => { const w = wallet(); return w[id] == null ? 1000 : w[id]; };
  K.setPts = (id, v) => { const w = wallet(); w[id] = Math.max(0, Math.round(v)); K.store.set("rk_wallet", w); };
  K.statsOf = function (c) {
    let h = 2166136261;
    for (const ch of c.id + "ring") { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return 4 + (Math.abs(h) % 6); };
    const s = { power: r(), speed: r(), chin: r(), stamina: r() };
    s.rating = s.power + s.speed + s.chin + s.stamina;
    return s;
  };

  // ---------- suara ----------
  let actx = null, noiseBuf = null;
  K.sound = { on: K.store.get("k3_sound", true) };
  const ctx = () => {
    if (!K.sound.on) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); return actx; } catch (e) { return null; }
  };
  const unlock = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { /* abaikan */ } };
  addEventListener("pointerdown", unlock, { passive: true }); addEventListener("keydown", unlock); addEventListener("touchend", unlock, { passive: true });
  K.beep = function (freq, dur = 0.1, type = "square", vol = 0.06, slide = 0, delay = 0) {
    const a = ctx(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  K.noise = function (vol = 0.05, dur = 1, freq = 900, q = 0.6, type = "bandpass", attack = 0.04) {
    const a = ctx(); if (!a) return;
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
    s.buffer = noiseBuf; s.loop = dur > 1.9; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur + 0.05);
  };
  K.sfx = {
    whistle: () => { K.beep(2300, 0.35, "sine", 0.05); K.beep(2500, 0.25, "sine", 0.03, 0, 0.08); },
    bounce: (v = 1) => { K.beep(130, 0.09, "sine", 0.12 * v, -60); K.noise(0.05 * v, 0.06, 500, 1, "lowpass", 0.003); },
    swish: () => K.noise(0.08, 0.35, 4200, 0.7, "highpass", 0.02),
    rim: () => { K.beep(620, 0.25, "triangle", 0.06); K.beep(930, 0.2, "triangle", 0.03); },
    pok: (pitch = 1) => { K.beep(880 * pitch, 0.05, "triangle", 0.09, -300); K.noise(0.07, 0.04, 2500, 1, "bandpass", 0.002); },
    crowd: (v = 0.06, d = 1.4) => K.noise(v, d, 900, 0.6),
    applause: (v = 0.05, d = 1.6) => { for (let i = 0; i < 6; i++) setTimeout(() => K.noise(v * 0.7, 0.25, 2200, 0.5, "bandpass", 0.005), i * 90 + Math.random() * 60); K.noise(v * 0.6, d, 1800, 0.5); },
    ooh: () => K.beep(330, 0.6, "sine", 0.03, -120),
    click: () => K.beep(660, 0.05, "triangle", 0.05),
    coin: () => { K.beep(880, 0.08, "triangle", 0.06); K.beep(1320, 0.12, "triangle", 0.06, 0, 0.07); },
    thunder: () => K.noise(0.12, 1.8, 120, 0.3, "lowpass", 0.05),
  };
  // hujan: noise terus-menerus selama hujan
  let rainNode = null;
  K.rainSound = function (on) {
    const a = ctx();
    if (!a) return;
    if (on && !rainNode) {
      if (!noiseBuf) K.noise(0.0001, 0.01);
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noiseBuf; s.loop = true; f.type = "highpass"; f.frequency.value = 1500; g.gain.value = 0.025;
      s.connect(f); f.connect(g); g.connect(a.destination); s.start(); rainNode = { s, g };
    } else if (!on && rainNode) { try { rainNode.s.stop(); } catch (e) { /* abaikan */ } rainNode = null; }
  };
  // suara wasit (pakai suara bawaan HP/laptop, kalau ada)
  K.speakOn = K.store.get("k3_speak", true);
  K.speak = function (text) {
    if (!K.speakOn || !window.speechSynthesis) return;
    try { const u = new SpeechSynthesisUtterance(text); u.lang = "id-ID"; u.rate = 1.05; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) { /* abaikan */ }
  };

  // ---------- three.js dasar ----------
  const matCache = new Map();
  K.M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); return matCache.get(k); };
  K.INKM = new THREE.MeshBasicMaterial({ color: 0x1d1530, side: THREE.BackSide });
  K.BOXG = new THREE.BoxGeometry(1, 1, 1);
  K.box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(K.BOXG, typeof c === "number" ? K.M(c) : c); m.scale.set(w, h, d); m.position.set(x, y, z); return m; };
  K.obox = function (w, h, d, c, x = 0, y = 0, z = 0, t = 0.09) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const o = new THREE.Mesh(K.BOXG, K.INKM); o.scale.set(w + t, h + t, d + t);
    g.add(o, K.box(w, h, d, c)); return g;
  };
  K.grp = (...k) => { const g = new THREE.Group(); k.forEach((x) => g.add(x)); return g; };
  K.cyl = (r, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s), typeof c === "number" ? K.M(c) : c);
  K.canvasTex = function (w, h, draw, linear) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); if (linear) t.minFilter = THREE.LinearFilter; else t.magFilter = THREE.NearestFilter;
    t.userData = { canvas: cv }; return t;
  };
  K.textSprite = function (text, color, size = 2) {
    const t = K.canvasTex(256, 128, (g) => {
      g.font = "700 60px Silkscreen, Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      let s = 60; while (g.measureText(text).width > 236 && s > 20) { s -= 4; g.font = `700 ${s}px Silkscreen, Fredoka, sans-serif`; }
      g.lineWidth = 14; g.strokeStyle = "#1d1530"; g.strokeText(text, 128, 66);
      g.fillStyle = color; g.fillText(text, 128, 66);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(size, size / 2, 1); s.renderOrder = 20; return s;
  };
  K.signPlane = function (text, bg, fg, w, h) {
    const t = K.canvasTex(256, 64, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 256, 64); g.strokeStyle = "#1d1530"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 58); g.font = "700 30px Silkscreen, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = fg; g.fillText(text, 128, 34); });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  };

  // ---------- wajah ----------
  K.faceImg = {};
  K.loadCrew = function () {
    const crew = window.CREW || [];
    return Promise.all(crew.map((c) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { K.faceImg[c.id] = img; res(c); };
      img.onerror = () => res(null);
      img.src = "faces/" + c.id + ".png";
    }))).then((l) => l.filter(Boolean));
  };
  const headMats = {};
  K.headMaterials = function (c) {
    if (headMats[c.id]) return headMats[c.id];
    const img = K.faceImg[c.id];
    let hair = "#1d1a1a";
    if (img) {
      try {
        const cv = document.createElement("canvas"); cv.width = 16; cv.height = 8;
        const g = cv.getContext("2d");
        g.drawImage(img, img.width * 0.35, img.height * 0.05, img.width * 0.3, img.height * 0.09, 0, 0, 16, 8);
        const d = g.getImageData(0, 0, 16, 8).data; let r = 0, gg = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; n++; }
        if (n) hair = `rgb(${Math.round(r / n)},${Math.round(gg / n)},${Math.round(b / n)})`;
      } catch (e) { /* abaikan */ }
    }
    const texMat = (w, h, draw, nearest) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); if (nearest) t.magFilter = THREE.NearestFilter; else t.minFilter = THREE.LinearFilter; return new THREE.MeshLambertMaterial({ map: t }); };
    const front = texMat(128, 144, (g) => { g.fillStyle = c.skin; g.fillRect(0, 0, 128, 144); if (img) g.drawImage(img, img.width * 0.09, img.height * 0.1, img.width * 0.82, img.height * 0.78, 0, 0, 128, 144); });
    const sideDraw = (flip) => (g, w, h) => { g.fillStyle = c.skin; g.fillRect(0, 0, w, h); g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.32); g.fillRect(flip ? 0 : w * 0.55, 0, w * 0.45, h * 0.55); };
    const back = texMat(64, 72, (g, w, h) => { g.fillStyle = c.skin; g.fillRect(0, 0, w, h); g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.8); }, true);
    headMats[c.id] = [texMat(64, 72, sideDraw(true), true), texMat(64, 72, sideDraw(false), true), new THREE.MeshLambertMaterial({ color: new THREE.Color(hair) }), new THREE.MeshLambertMaterial({ color: new THREE.Color(c.skin) }), front, back];
    return headMats[c.id];
  };
  K.boxHead = function (c, sc, outline = true) {
    const g = new THREE.Group();
    const w = 1.0 * sc, h = 1.15 * sc, d = 0.95 * sc;
    if (outline) { const o = new THREE.Mesh(K.BOXG, K.INKM); o.scale.set(w + 0.1, h + 0.1, d + 0.1); g.add(o); }
    const m = new THREE.Mesh(K.BOXG, K.headMaterials(c)); m.scale.set(w, h, d); g.add(m);
    return g;
  };
  // orang: kaki & lengan bisa digerakkan, ada titik pegangan di tangan kanan
  K.makePerson = function (c, opt = {}) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const shirt = opt.shirt != null ? opt.shirt : new THREE.Color(c.shirt).getHex();
    const pants = opt.pants != null ? opt.pants : 0x2b3350;
    const skin = new THREE.Color(c.skin).getHex();
    const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.24, 1.0, 0); p.add(K.obox(0.36, 1.0, 0.4, pants, 0, -0.5, 0, 0.07)); if (opt.shoes != null) p.add(K.box(0.4, 0.18, 0.55, opt.shoes, 0, -0.95, 0.06)); body.add(p); return p; });
    body.add(K.obox(1.0, 1.15, 0.6, shirt, 0, 1.6, 0, 0.08));
    if (opt.number != null) {
      const t = K.canvasTex(64, 64, (x) => { x.fillStyle = "#ffffff"; x.font = "700 40px Silkscreen, monospace"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(String(opt.number), 32, 34); });
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: t, transparent: true })); n.position.set(0, 1.65, -0.32); n.rotation.y = Math.PI; body.add(n);
    }
    if (opt.shorts != null) body.add(K.obox(1.04, 0.45, 0.64, opt.shorts, 0, 1.05, 0, 0.07));
    if (opt.bow) body.add(K.box(0.4, 0.15, 0.08, 0x1d1530, 0, 2.05, 0.33));
    const hs = opt.hs || 1;
    const head = K.boxHead(c, hs); head.position.y = 2.25 + 0.575 * hs; body.add(head);
    const arms = [-1, 1].map((s) => {
      const piv = new THREE.Group(); piv.position.set(s * 0.62, 2.0, 0);
      const arm = new THREE.Group(); piv.add(arm);
      const upper = K.obox(0.26, 0.26, 1, shirt, 0, 0, 0.5, 0.06); arm.add(upper);
      const hand = K.obox(0.3, 0.3, 0.3, skin, 0, 0, 1, 0.06); arm.add(hand);
      const grip = new THREE.Group(); grip.position.z = 1.05; arm.add(grip);
      body.add(piv); return { piv, upper, hand, grip, len: 1 };
    });
    // arahkan lengan ke titik (x,y,z) dalam koordinat lokal orang
    const aim = (i, tx, ty, tz, len = 1) => {
      const a = arms[i], sx = (i ? 1 : -1) * 0.62, vx = tx - sx, vy = ty - 2.0, vz = Math.max(0.15, tz);
      a.piv.rotation.set(-Math.atan2(vy, Math.hypot(vx, vz)), Math.atan2(vx, vz), 0, "YXZ");
      a.len = len; a.upper.scale.z = len; a.upper.position.z = len / 2; a.hand.position.z = len; a.grip.position.z = len + 0.05;
    };
    aim(0, -0.5, 1.2, 0.3); aim(1, 0.5, 1.2, 0.3);
    return { g, body, legs, arms, head, aim };
  };
  K.makeFan = function (c) {
    const g = new THREE.Group();
    const shirt = new THREE.Color(c.shirt).getHex();
    g.add(K.box(0.9, 1.1, 0.6, shirt, 0, 0.75, 0));
    const head = K.boxHead(c, 0.85, false); head.position.y = 1.84; g.add(head);
    const arms = [-1, 1].map((s) => { const piv = new THREE.Group(); piv.position.set(s * 0.55, 1.2, 0); piv.add(K.box(0.22, 0.9, 0.24, shirt, 0, -0.4, 0)); g.add(piv); return { piv }; });
    return { g, arms, head };
  };
  K.animFans = function (fans, t, hype, yaw) {
    fans.forEach((p, i) => {
      const jump = hype > 0.4 ? Math.abs(Math.sin(t * 9 + i)) * hype * 0.8 : Math.abs(Math.sin(t * 2 + i)) * 0.05;
      p.g.position.y = p.baseY + jump;
      p.head.rotation.y = K.clamp(K.wrapA(yaw - p.face), -1.3, 1.3);
      p.arms.forEach((a, k) => a.piv.rotation.set(hype > 0.4 ? -2.6 + Math.sin(t * 10 + i + k) * 0.3 : -0.4, 0, 0));
    });
  };

  // ---------- panggung: renderer, kamera isometrik, kontrol ----------
  K.initStage = function (canvas, S) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6fa8ff);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -300, 500);
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6a5a9a, 0.75); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(12, 24, 8); scene.add(sun);
    const resize = () => {
      const w = innerWidth, h = innerHeight; if (!w || !h) return;
      renderer.setSize(w, h, false);
      renderer.setPixelRatio(S.px === 1 ? Math.min(devicePixelRatio || 1, 2) : 1 / S.px);
    };
    addEventListener("resize", resize); resize();
    const ptrs = new Map(); let pinch0 = 0, zoom0 = 0;
    canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.zoom; } });
    canvas.addEventListener("pointermove", (e) => {
      const p = ptrs.get(e.pointerId); if (!p) return;
      if (ptrs.size === 1) { S.yaw -= (e.clientX - p.x) * 0.008; S.pitch = K.clamp(S.pitch + (e.clientY - p.y) * 0.004, 0.25, 1.25); }
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) S.zoom = K.clamp(zoom0 * pinch0 / d, S.zoomMin || 3.5, S.zoomMax || 30); }
    });
    const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
    canvas.addEventListener("pointerup", endPtr); canvas.addEventListener("pointercancel", endPtr);
    canvas.addEventListener("wheel", (e) => { e.preventDefault(); S.zoom = K.clamp(S.zoom * (e.deltaY > 0 ? 1.1 : 0.9), S.zoomMin || 3.5, S.zoomMax || 30); }, { passive: false });
    const camT = new THREE.Vector3();
    let zoomEff = S.zoom;
    const render = (rdt, target) => {
      camT.lerp(target, Math.min(1, rdt * 3));
      zoomEff = K.lerp(zoomEff, S.zoom, Math.min(1, rdt * 3));
      const w = innerWidth || 1, h = innerHeight || 1, asp = w / h;
      const z = zoomEff * (asp < 1 ? Math.min(2.2, 0.85 / Math.max(asp, 0.4)) : 1);
      camera.left = -z * asp; camera.right = z * asp; camera.top = z; camera.bottom = -z; camera.updateProjectionMatrix();
      const sh = (S.shake || 0) * 0.5, D = 80;
      camera.position.set(camT.x + Math.sin(S.yaw) * Math.cos(S.pitch) * D + K.rand(-sh, sh), camT.y + Math.sin(S.pitch) * D, camT.z + Math.cos(S.yaw) * Math.cos(S.pitch) * D + K.rand(-sh, sh));
      camera.lookAt(camT);
      renderer.render(scene, camera);
    };
    return { renderer, scene, camera, hemi, sun, resize, render, snap: (v) => { camT.copy(v); zoomEff = S.zoom; } };
  };

  // ---------- pulau melayang ----------
  K.buildIsland = function (parent, W, D, top = 0xb9b4ad) {
    parent.add(K.obox(W, 1, D, top, 0, -0.5, 0, 0.15));
    parent.add(K.box(W, 3, D, 0x8a5a3c, 0, -2.5, 0), K.box(W + 0.1, 0.5, D + 0.1, 0x5cbf5a, 0, -1.2, 0));
    parent.add(K.box(W * 0.8, 3, D * 0.8, 0x7a4a30, 0, -5.5, 0), K.box(W * 0.56, 3, D * 0.56, 0x6b4029, 1, -8.5, -1), K.box(W * 0.3, 3, D * 0.3, 0x5a3622, -1, -11.5, 1));
  };
  K.tree = function (x, z, s = 1) {
    const g = K.grp(K.obox(0.5 * s, 1.8 * s, 0.5 * s, 0x8b5a3c, 0, 0.9 * s, 0, 0.06));
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 0), K.M(K.pick([0x4fb366, 0x5cc46e, 0x3f9a58])));
    c.position.y = 2.6 * s; g.add(c); g.position.set(x, 0, z); return g;
  };
  // lampu jalan: tiang + bola lampu + cahaya bulat di tanah (menyala waktu malam)
  K.lamp = function (x, z, h = 6) {
    const g = K.grp(K.obox(0.25, h, 0.25, 0x3a3f4a, 0, h / 2, 0, 0.06), K.obox(1.2, 0.2, 0.3, 0x3a3f4a, 0.5, h, 0, 0.06));
    const bulb = new THREE.Mesh(K.BOXG, new THREE.MeshBasicMaterial({ color: 0x777777 })); bulb.scale.set(0.5, 0.25, 0.4); bulb.position.set(0.9, h - 0.18, 0); g.add(bulb);
    const glow = new THREE.Mesh(new THREE.CircleGeometry(4.2, 24), new THREE.MeshBasicMaterial({ color: 0xffd89a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(0.9, 0.05, 0); g.add(glow);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, h - 0.3, 14, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    cone.position.set(0.9, (h - 0.3) / 2, 0); g.add(cone);
    g.position.set(x, 0, z);
    g.userData.lamp = { bulb, glow, cone };
    return g;
  };

  // ---------- siang-malam ----------
  // t: 0 = pagi, 0.35 = siang, 0.65 = sore, 1 = malam
  const SKY = [[0, 0xa8dcff, 0xfff1d6, 0.75, 0.65], [0.35, 0x6fb6ff, 0xffffff, 0.8, 0.75], [0.65, 0xff9a62, 0xffc08a, 0.6, 0.45], [0.82, 0x5a3f8a, 0xb08aff, 0.4, 0.15], [1, 0x14122e, 0x6f7fd0, 0.28, 0.05]];
  const cA = new THREE.Color(), cB = new THREE.Color();
  K.daylight = function (stage, t, lamps, rain) {
    let i = 0; while (i < SKY.length - 2 && t > SKY[i + 1][0]) i++;
    const a = SKY[i], b = SKY[i + 1], k = K.clamp((t - a[0]) / (b[0] - a[0]), 0, 1);
    cA.setHex(a[1]); cB.setHex(b[1]); stage.scene.background.copy(cA).lerp(cB, k);
    if (rain) stage.scene.background.lerp(cB.setHex(0x5a6070), 0.45);
    cA.setHex(a[2]); cB.setHex(b[2]); stage.sun.color.copy(cA).lerp(cB, k);
    stage.hemi.intensity = K.lerp(a[3], b[3], k) * (rain ? 0.8 : 1);
    stage.sun.intensity = K.lerp(a[4], b[4], k) * (rain ? 0.5 : 1);
    stage.sun.position.set(Math.cos(t * Math.PI) * 20, 10 + Math.sin(t * Math.PI) * 20, 8);
    const night = K.clamp((t - 0.62) / 0.2, 0, 1);
    lamps.forEach((l) => {
      const L = l.userData.lamp;
      L.bulb.material.color.setHex(night > 0.3 ? 0xfff3c0 : 0x777777);
      L.glow.material.opacity = night * (rain ? 0.55 : 0.4);
      L.cone.material.opacity = night * (rain ? 0.12 : 0.07);
    });
    return night;
  };

  // ---------- hujan ----------
  K.makeRain = function (scene, W, D, H = 26) {
    const N = 900, pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = K.rand(-W / 2, W / 2), y = K.rand(0, H), z = K.rand(-D / 2, D / 2); pos.set([x, y, z, x + 0.08, y - 0.7, z + 0.04], i * 6); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.55 }));
    lines.visible = false; scene.add(lines);
    const splashes = [];
    for (let i = 0; i < 30; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.18, 10), new THREE.MeshBasicMaterial({ color: 0xdbe8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })); m.rotation.x = -Math.PI / 2; scene.add(m); splashes.push({ m, t: Math.random() }); }
    return {
      on: false,
      set(on) { this.on = on; lines.visible = on; splashes.forEach((s) => (s.m.visible = on)); K.rainSound(on); },
      update(dt, floorY = 0.32) {
        if (!this.on) return;
        const p = geo.attributes.position.array;
        for (let i = 0; i < N; i++) {
          const o = i * 6; let y = p[o + 1] - 30 * dt;
          if (y < floorY) y += H;
          p[o + 1] = y; p[o + 4] = y - 0.7;
        }
        geo.attributes.position.needsUpdate = true;
        splashes.forEach((s) => {
          s.t += dt * 2.5; if (s.t > 1) { s.t = 0; s.m.position.set(K.rand(-W / 2, W / 2), floorY + 0.02, K.rand(-D / 2, D / 2)); }
          s.m.scale.setScalar(0.5 + s.t * 2); s.m.material.opacity = 0.7 * (1 - s.t);
        });
      },
    };
  };

  // ---------- teks di layar ----------
  K.feed = function (text, big) {
    const el = K.$("feed"); if (!el) return;
    [...el.children].forEach((c) => c.classList.add("old"));
    const d = document.createElement("div"); if (big) d.className = "big"; d.textContent = text; el.appendChild(d);
    while (el.children.length > 3) el.firstChild.remove();
  };
  K.announce = function (html, sec = 1.2) {
    document.querySelectorAll(".announce").forEach((e) => e.remove());
    const el = document.createElement("div"); el.className = "announce"; el.innerHTML = html; document.body.appendChild(el);
    setTimeout(() => el.remove(), sec * 1000);
  };

  // ---------- taruhan ----------
  // opts: { crew, options: [{label, mult}], onPlace(bet) }  -> buka jendela taruhan untuk orang c
  K.renderWho = function (el, crew, onPick) {
    el.innerHTML = crew.map((c) => `<button data-id="${c.id}"><img src="faces/${c.id}.png" alt="">${c.name}<small>💰${K.fmt(K.getPts(c.id))}</small></button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (b) { K.sfx.click(); onPick(crew.find((c) => c.id === b.dataset.id)); } };
  };
  K.betModal = function (c, options, onPlace) {
    let pts = K.getPts(c.id);
    if (pts <= 0) { K.setPts(c.id, 500); pts = 500; K.announce(`<small>${c.name} dapat modal 500 poin dari Bos 😄</small>`, 1.6); }
    const st = { pick: null, amount: Math.min(100, pts) };
    const modal = K.$("modal"), card = K.$("modal-card");
    const render = () => {
      const mult = st.pick != null ? options[st.pick].mult : 0;
      card.innerHTML = `<h3><img src="faces/${c.id}.png" alt="">${c.name} <small style="margin-left:auto">💰 ${K.fmt(pts)}</small></h3>
        <div class="lbl">Pilih jagoan</div>
        <div class="seg">${options.map((o, i) => `<button data-pick="${i}" aria-pressed="${st.pick === i}">${o.label} x${o.mult}</button>`).join("")}</div>
        <div class="lbl">Pasang berapa?</div>
        <div class="seg">${[50, 100, 250, 500].filter((v) => v <= pts).map((v) => `<button data-a="${v}" aria-pressed="${st.amount === v}">${v}</button>`).join("")}<button data-a="${pts}" aria-pressed="${st.amount === pts}">Semua (${K.fmt(pts)})</button></div>
        <div class="payout">${st.pick == null ? "Pilih jagoan dulu." : `Kalau menang dapat <b>${K.fmt(st.amount * mult)}</b> poin (x${mult}).`}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" id="m-cancel">Batal</button><button class="btn" id="m-ok" ${st.pick == null || st.amount <= 0 ? "disabled" : ""}>Pasang ✓</button></div>`;
      card.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { st.pick = +b.dataset.pick; K.sfx.click(); render(); });
      card.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { st.amount = +b.dataset.a; K.sfx.click(); render(); });
      K.$("m-cancel").onclick = () => { modal.hidden = true; };
      K.$("m-ok").onclick = () => {
        if (st.pick == null) return;
        K.setPts(c.id, pts - st.amount); K.sfx.coin();
        onPlace({ who: c.id, pick: st.pick, amount: st.amount, mult });
        modal.hidden = true;
      };
    };
    render(); modal.hidden = false;
    modal.onclick = (e) => { if (e.target === modal) modal.hidden = true; };
  };
  K.oddsFor = function (ratings) {
    const ws = ratings.map((r) => Math.exp(r / 3.4)), tot = ws.reduce((a, b) => a + b, 0);
    return ws.map((w) => Math.round(K.clamp(0.93 / (w / tot), 1.1, 25) * 20) / 20);
  };
  K.settle = function (bets, winnerIdx) {
    bets.forEach((b) => { b.res = b.pick === winnerIdx ? Math.round(b.amount * b.mult) : 0; if (b.res) K.setPts(b.who, K.getPts(b.who) + b.res); });
  };

  window.K3D = K;
})();
