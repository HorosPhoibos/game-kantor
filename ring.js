/* RING KANTOR — tinju otomatis bergaya diorama pixel.
   Pemain menonton, mengatur strategi pojok, dan bertaruh Poin Kantor (bukan uang). */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const err = (m) => { $("err").textContent = m; $("err").hidden = false; };
  if (!window.THREE) { err("Three.js gagal dimuat. Cek internet lalu refresh."); return; }
  let CREW = window.CREW || [];

  // ---------------- util ----------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const wpick = (w) => { let s = 0; for (const k in w) s += w[k]; let r = Math.random() * s; for (const k in w) { r -= w[k]; if (r <= 0) return k; } return Object.keys(w)[0]; };
  const fmt = (n) => Math.round(n).toLocaleString("id-ID");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const byId = (id) => CREW.find((c) => c.id === id);

  // ---------------- suara ----------------
  let actx = null, soundOn = store.get("rk_sound", true), noiseBuf = null;
  function ac() {
    if (!soundOn) return null;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      return actx;
    } catch (e) { return null; }
  }
  function beep(freq, dur = 0.1, type = "square", vol = 0.06, slide = 0, delay = 0) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function crowd(vol = 0.05, dur = 1.2) {
    const a = ac(); if (!a) return;
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
    s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur + 0.05);
  }
  const sfx = {
    bell: () => { beep(1250, 0.7, "triangle", 0.08); beep(1870, 0.5, "sine", 0.04); },
    bell3: () => { [0, 0.25, 0.5].forEach((d) => beep(1250, 0.4, "triangle", 0.07, 0, d)); },
    jab: () => beep(220, 0.06, "square", 0.05, -80),
    heavy: () => { beep(120, 0.16, "sawtooth", 0.09, -60); beep(70, 0.2, "square", 0.05, -20); },
    block: () => beep(700, 0.04, "square", 0.035),
    whiff: () => beep(500, 0.06, "triangle", 0.02, -300),
    count: () => beep(880, 0.08, "square", 0.04),
    coin: () => { beep(880, 0.08, "triangle", 0.06); beep(1320, 0.12, "triangle", 0.06, 0, 0.07); },
    click: () => beep(660, 0.05, "triangle", 0.05),
  };

  // ---------------- data petinju ----------------
  // statistik dibuat tetap dari nama (sama terus tiap main), 4..9
  function statsOf(c) {
    let h = 2166136261;
    for (const ch of c.id + "ring") { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return 4 + (Math.abs(h) % 6); };
    const s = { power: r(), speed: r(), chin: r(), stamina: r() };
    s.rating = s.power + s.speed + s.chin + s.stamina;
    return s;
  }
  const PLANS = {
    auto: { label: "🤖 Otomatis", rate: 0.55, dist: 1.9 },
    serang: { label: "🔥 Serang Terus", rate: 0.78, dist: 1.6 },
    balas: { label: "🎯 Tunggu & Balas", rate: 0.35, dist: 2.3 },
    badan: { label: "🫃 Incar Badan", rate: 0.62, dist: 1.7 },
    bertahan: { label: "🛡️ Bertahan", rate: 0.3, dist: 2.4 },
  };
  const MOVES = {
    jab:   { wind: 0.12, act: 0.08, rec: 0.16, dmg: 3, cost: 2, range: 2.4, target: "head", arm: 0, name: "jab" },
    cross: { wind: 0.2,  act: 0.08, rec: 0.28, dmg: 6, cost: 4, range: 2.4, target: "head", arm: 1, name: "straight" },
    hook:  { wind: 0.26, act: 0.1,  rec: 0.34, dmg: 8, cost: 6, range: 1.9, target: "head", arm: 0, name: "hook", arc: 1 },
    upper: { wind: 0.3,  act: 0.1,  rec: 0.38, dmg: 10, cost: 7, range: 1.6, target: "head", arm: 1, name: "uppercut", up: 1 },
    body:  { wind: 0.22, act: 0.1,  rec: 0.3,  dmg: 4, cost: 4, range: 2.0, target: "body", arm: 1, name: "pukulan badan", sdmg: 9 },
  };

  // ---------------- wajah ----------------
  const faceImg = {}, faceTex = {};
  function loadFaces() {
    return Promise.all(CREW.map((c) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { faceImg[c.id] = img; res(); };
      img.onerror = () => res();
      img.src = "faces/" + c.id + ".png";
    })));
  }
  // kepala kotak 3D: foto di muka, rambut & kulit di sisi lain (warna rambut diambil dari foto)
  const headMats = {};
  function headMaterials(c) {
    if (headMats[c.id]) return headMats[c.id];
    const img = faceImg[c.id];
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
    const tex = (draw) => { const cv = document.createElement("canvas"); cv.width = 64; cv.height = 72; draw(cv.getContext("2d"), 64, 72); const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; return new THREE.MeshLambertMaterial({ map: t }); };
    const front = (() => {
      const cv = document.createElement("canvas"); cv.width = 128; cv.height = 144;
      const g = cv.getContext("2d"); g.fillStyle = c.skin; g.fillRect(0, 0, 128, 144);
      if (img) g.drawImage(img, img.width * 0.09, img.height * 0.1, img.width * 0.82, img.height * 0.78, 0, 0, 128, 144);
      const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; return new THREE.MeshLambertMaterial({ map: t });
    })();
    const side = tex((g, w, h) => { g.fillStyle = c.skin; g.fillRect(0, 0, w, h); g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.32); g.fillRect(w * 0.55, 0, w * 0.45, h * 0.55); });
    const top = new THREE.MeshLambertMaterial({ color: new THREE.Color(hair) });
    const back = tex((g, w, h) => { g.fillStyle = c.skin; g.fillRect(0, 0, w, h); g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.8); });
    const sideL = side.clone(); sideL.map = side.map.clone(); sideL.map.needsUpdate = true; sideL.map.wrapS = THREE.RepeatWrapping; sideL.map.repeat.x = -1;
    // urutan muka kotak: +x, -x, +y, -y, +z(depan), -z(belakang)
    headMats[c.id] = [sideL, side, top, new THREE.MeshLambertMaterial({ color: new THREE.Color(c.skin) }), front, back];
    return headMats[c.id];
  }
  function faceSprite(c, w, h) {
    if (!faceTex[c.id]) {
      const W = 128, H = 160, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const g = cv.getContext("2d");
      const oval = (p) => { g.beginPath(); g.ellipse(W / 2, H / 2, W / 2 - p, H / 2 - p, 0, 0, TAU); };
      oval(1); g.fillStyle = "#1d1530"; g.fill();
      oval(6); g.save(); g.clip(); g.fillStyle = c.skin; g.fillRect(0, 0, W, H);
      if (faceImg[c.id]) g.drawImage(faceImg[c.id], 0, 0, W, H);
      g.restore();
      const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter; faceTex[c.id] = t;
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: faceTex[c.id] }));
    s.scale.set(w, h, 1); return s;
  }

  // ---------------- three.js ----------------
  const canvas = $("game");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" }); }
  catch (e) { err("Browser ini belum mendukung grafik 3D (WebGL)."); return; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6fa8ff);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -200, 400);
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6a5a9a, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.7); sun.position.set(12, 24, 8); scene.add(sun);

  const matCache = new Map();
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); return matCache.get(k); };
  const INKM = new THREE.MeshBasicMaterial({ color: 0x1d1530, side: THREE.BackSide });
  const BOXG = new THREE.BoxGeometry(1, 1, 1);
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(BOXG, typeof c === "number" ? M(c) : c); m.scale.set(w, h, d); m.position.set(x, y, z); return m; };
  // kotak dengan garis tepi hitam (gaya pixel-art)
  function obox(w, h, d, c, x = 0, y = 0, z = 0, t = 0.09) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const o = new THREE.Mesh(BOXG, INKM); o.scale.set(w + t, h + t, d + t);
    g.add(o, box(w, h, d, c)); return g;
  }
  const grp = (...k) => { const g = new THREE.Group(); k.forEach((x) => g.add(x)); return g; };
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; return t;
  }
  function textSprite(text, color, size = 2, font = "Silkscreen") {
    const t = canvasTex(256, 128, (g) => {
      g.font = `700 64px ${font}, Fredoka, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 14; g.strokeStyle = "#1d1530"; g.strokeText(text, 128, 66);
      g.fillStyle = color; g.fillText(text, 128, 66);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(size, size / 2, 1); s.renderOrder = 20; return s;
  }

  // ---------------- diorama: atap gudang melayang ----------------
  const R = 4.2;                 // batas gerak di dalam ring
  const RING_Y = 1.2;
  const world = new THREE.Group(); scene.add(world);
  const seats = [];
  const lights = [];
  function buildWorld() {
    // pulau
    world.add(obox(30, 1, 30, 0xb9b4ad, 0, -0.5, 0, 0.15));
    world.add(box(30, 3, 30, 0x8a5a3c, 0, -2.5, 0), box(30.1, 0.5, 30.1, 0x5cbf5a, 0, -1.2, 0));
    world.add(box(24, 3, 24, 0x7a4a30, 0, -5.5, 0), box(17, 3, 17, 0x6b4029, 1, -8.5, -1), box(9, 3, 9, 0x5a3622, -1, -11.5, 1), box(4, 2, 4, 0x4a2c1c, 0, -14, 0));
    // pagar tembok atap
    [[0, 14.7, 30, 0.6], [0, -14.7, 30, 0.6], [14.7, 0, 0.6, 30], [-14.7, 0, 0.6, 30]].forEach(([x, z, w, d]) => world.add(obox(w, 1.2, d, 0xd9d4ca, x, 0.6, z, 0.1)));
    // tandon, AC, parabola
    const tank = grp(obox(0.3, 3, 0.3, 0x555a66, -1, 1.5, -1), obox(0.3, 3, 0.3, 0x555a66, 1, 1.5, -1), obox(0.3, 3, 0.3, 0x555a66, -1, 1.5, 1), obox(0.3, 3, 0.3, 0x555a66, 1, 1.5, 1));
    const tk = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.6, 10), M(0x3a8be0)); tk.position.y = 4.3; tank.add(tk);
    tank.position.set(-12, 0, -12); world.add(tank);
    for (let k = 0; k < 3; k++) world.add(obox(1.6, 1.1, 1.0, 0xeef0f2, 11.5, 0.55, -12 + k * 1.8));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6, 0, TAU, 0, Math.PI / 2.5), M(0xdedede, { side: THREE.DoubleSide }));
    dish.rotation.x = -2.2; dish.position.set(12, 2, 12); world.add(dish, obox(0.2, 1.6, 0.2, 0x555a66, 12, 0.8, 12));
    // spanduk
    const ban = canvasTex(256, 64, (g) => { g.fillStyle = "#ff4a5a"; g.fillRect(0, 0, 256, 64); g.fillStyle = "#ffcf3f"; g.fillRect(0, 0, 256, 6); g.fillRect(0, 58, 256, 6); g.font = "700 34px Silkscreen, monospace"; g.textAlign = "center"; g.fillStyle = "#fff"; g.fillText("RING KANTOR", 128, 44); });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: ban, side: THREE.DoubleSide }));
    banner.position.set(0, 7.6, -13.5); world.add(banner, obox(0.3, 8.6, 0.3, 0x555a66, -4.8, 4.3, -13.5), obox(0.3, 8.6, 0.3, 0x555a66, 4.8, 4.3, -13.5));
    // ring
    world.add(obox(11, RING_Y, 11, 0x2f4fd0, 0, RING_Y / 2, 0, 0.15));
    const mat = canvasTex(128, 128, (g) => { g.fillStyle = "#f2efe6"; g.fillRect(0, 0, 128, 128); g.fillStyle = "#e3ded2"; g.fillRect(0, 0, 128, 4); g.font = "700 18px Silkscreen, monospace"; g.textAlign = "center"; g.fillStyle = "#c9c1b0"; g.fillText("KANTOR", 64, 70); });
    const canvasTop = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 10.6), new THREE.MeshLambertMaterial({ map: mat }));
    canvasTop.rotation.x = -Math.PI / 2; canvasTop.position.y = RING_Y + 0.01; world.add(canvasTop);
    const postC = [[-1, -1, 0x3a7bff], [1, 1, 0xff4a5a], [1, -1, 0xffffff], [-1, 1, 0xffffff]];
    postC.forEach(([sx, sz, c]) => world.add(obox(0.4, 2.4, 0.4, c, sx * 5.1, RING_Y + 1.2, sz * 5.1)));
    [0.7, 1.35, 2.0].forEach((h, i) => {
      const c = [0xff4a5a, 0xffffff, 0x3a7bff][i];
      world.add(box(10.2, 0.12, 0.12, c, 0, RING_Y + h, 5.1), box(10.2, 0.12, 0.12, c, 0, RING_Y + h, -5.1), box(0.12, 0.12, 10.2, c, 5.1, RING_Y + h, 0), box(0.12, 0.12, 10.2, c, -5.1, RING_Y + h, 0));
    });
    // kursi pojok
    world.add(obox(0.8, 0.8, 0.8, 0x3a7bff, -6.2, 0.4, -6.2), obox(0.8, 0.8, 0.8, 0xff4a5a, 6.2, 0.4, 6.2));
    // tribun di 2 sisi belakang (sisi yang menghadap kamera dibiarkan terbuka biar ring kelihatan)
    const sides = [[0, -1], [-1, 0]];
    sides.forEach(([sx, sz]) => {
      for (let row = 0; row < 3; row++) {
        const d = 8.6 + row * 1.9, h = 0.4 + row * 0.9;
        const along = sx === 0 ? [1, 0] : [0, 1];
        world.add(obox(along[0] ? 16 : 1.6, h, along[1] ? 16 : 1.6, row ? 0x7a5ad0 : 0x9a7ae8, sx * d, h / 2, sz * d, 0.1));
        for (let k = 0; k < 8; k++) {
          const o = -7 + k * 2;
          seats.push({ x: sx * d + along[0] * o, y: h, z: sz * d + along[1] * o, face: Math.atan2(-sx, -sz) });
        }
      }
    });
    // lampu tali
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * TAU;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 4), new THREE.MeshBasicMaterial({ color: [0xffcf3f, 0xff4a5a, 0x3a7bff, 0x5cf08a][k % 4] }));
      l.position.set(Math.cos(a) * 9, 6 + Math.sin(a * 3) * 0.3, Math.sin(a) * 9); world.add(l); lights.push(l);
    }
    // awan
    for (let k = 0; k < 8; k++) {
      const c = grp(box(3, 1, 2, 0xffffff), box(2, 1.2, 1.6, 0xffffff, 1.2, 0.5, 0), box(1.8, 0.8, 1.4, 0xffffff, -1.4, 0.2, 0.2));
      const a = rand(0, TAU), r = rand(24, 38);
      c.position.set(Math.cos(a) * r, rand(-10, 8), Math.sin(a) * r); c.userData.sp = rand(0.02, 0.05); c.userData.a = a; c.userData.r = r;
      world.add(c); lights.push(c);
    }
  }

  // ---------------- orang & petinju ----------------
  function boxHead(c, sc, outline = true) {
    const g = new THREE.Group();
    const w = 1.0 * sc, h = 1.15 * sc, d = 0.95 * sc;
    if (outline) { const o = new THREE.Mesh(BOXG, INKM); o.scale.set(w + 0.1, h + 0.1, d + 0.1); g.add(o); }
    const m = new THREE.Mesh(BOXG, headMaterials(c)); m.scale.set(w, h, d); g.add(m);
    return g;
  }
  function makePerson(c, opt = {}) {
    const g = new THREE.Group();
    const shirt = opt.shirt != null ? opt.shirt : new THREE.Color(c.shirt).getHex();
    const pants = opt.pants != null ? opt.pants : 0x2b3350;
    const skin = new THREE.Color(c.skin).getHex();
    const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.24, 1.0, 0); p.add(obox(0.36, 1.0, 0.4, pants, 0, -0.5, 0, 0.07)); g.add(p); return p; });
    const torso = obox(1.0, 1.15, 0.6, shirt, 0, 1.6, 0, 0.08); g.add(torso);
    if (opt.shorts != null) g.add(obox(1.04, 0.45, 0.64, opt.shorts, 0, 1.05, 0, 0.07));
    if (opt.bow) g.add(box(0.4, 0.15, 0.08, 0x1d1530, 0, 2.05, 0.33));
    const hs = opt.hs || 1;
    const head = boxHead(c, hs); head.position.y = 2.25 + 0.575 * hs; g.add(head);
    // lengan: pivot di bahu, ujung sarung tinju di depan (+z)
    const arms = [-1, 1].map((s) => {
      const piv = new THREE.Group(); piv.position.set(s * 0.62, 2.0, 0);
      const arm = new THREE.Group(); piv.add(arm);
      const upper = obox(0.26, 0.26, 1, opt.gloves != null ? skin : shirt, 0, 0, 0.5, 0.06); arm.add(upper);
      const glove = obox(0.42, 0.42, 0.46, opt.gloves != null ? opt.gloves : skin, 0, 0, 1, 0.07); arm.add(glove);
      g.add(piv); return { piv, upper, glove, len: 0.8 };
    });
    return { g, legs, arms, head, torso };
  }
  // penonton: versi ringan (sedikit kotak) supaya HP tetap lancar
  function makeFan(c) {
    const g = new THREE.Group();
    const shirt = new THREE.Color(c.shirt).getHex();
    g.add(box(0.9, 1.1, 0.6, shirt, 0, 0.75, 0));
    const head = boxHead(c, 0.85, false); head.position.y = 1.35 + 0.49; g.add(head);
    const arms = [-1, 1].map((s) => { const piv = new THREE.Group(); piv.position.set(s * 0.55, 1.2, 0); piv.add(box(0.22, 0.9, 0.24, shirt, 0, -0.4, 0)); g.add(piv); return { piv }; });
    return { g, arms, head };
  }
  function setArm(a, len) { a.len = len; a.upper.scale.z = len; a.upper.position.z = len / 2; a.glove.position.z = len; }

  // ---------------- state pertandingan ----------------
  const S = {
    mode: "menu", flow: null, speed: 1, rounds: store.get("rk_rounds", 3), px: store.get("rk_px", 2),
    f: [], ref: null, refC: null, crowdP: [], round: 1, clock: 60, phase: "idle", restT: 0, timers: [], fx: [],
    cards: [[0, 0], [0, 0], [0, 0]], bets: [], champBets: [], hype: 0, lastFeed: 0, result: null, tour: null, paused: false,
    yaw: Math.PI / 4, pitch: 0.62, zoom: 7.5, follow: true, run: 0,
  };
  const ROUND_LEN = 60;
  const wallet = () => store.get("rk_wallet", {});
  const getPts = (id) => { const w = wallet(); return w[id] == null ? 1000 : w[id]; };
  const setPts = (id, v) => { const w = wallet(); w[id] = Math.max(0, Math.round(v)); store.set("rk_wallet", w); };

  function oddsOf(a, b) {
    const ra = statsOf(a).rating, rb = statsOf(b).rating;
    const p = 1 / (1 + Math.exp(-(ra - rb) / 3.5));
    const o = (x) => Math.round(clamp(0.94 / x, 1.1, 8) * 20) / 20;
    return [o(p), o(1 - p)];
  }

  function makeBoxer(c, corner) {
    const st = statsOf(c);
    const color = corner ? 0xff4a5a : 0x3a7bff;
    const m = makePerson(c, { shorts: color, gloves: color, pants: 0x1d1d24, hs: 1.15 });
    const tag = textSprite(c.name, corner ? "#ff8a95" : "#8ab4ff", 3.2); tag.position.y = 4.4; m.g.add(tag);
    m.g.position.y = RING_Y;
    world.add(m.g);
    return {
      c, corner, st, m, x: corner ? 2.5 : -2.5, z: corner ? 0.8 : -0.8, a: 0, hp: 100, sta: 100, plan: "auto",
      state: "free", act: null, think: rand(0.3, 0.8), react: 0, reactKind: "", kdRound: 0, kdTotal: 0, landed: 0, thrown: 0, roundDmg: 0, roundLand: 0, downT: 0, count: 0, circle: rand(-1, 1),
    };
  }
  const opp = (f) => (S.f[0] === f ? S.f[1] : S.f[0]);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---------------- komentator ----------------
  function feed(text, big) {
    const el = $("feed");
    [...el.children].forEach((c) => c.classList.add("old"));
    const d = document.createElement("div"); if (big) d.className = "big"; d.textContent = text; el.appendChild(d);
    while (el.children.length > 3) el.firstChild.remove();
    S.lastFeed = S.gt;
  }
  const L = {
    jab: ["{a} jab cepat ke muka {b}.", "Jab {a} masuk lagi.", "{a} pancing pakai jab."],
    straight: ["Straight kanan {a} kena!", "{a} lepas pukulan lurus, masuk!"],
    hook: ["HOOK KERAS dari {a}! {b} goyang!", "Hook kiri {a} mendarat di pipi {b}!"],
    uppercut: ["UPPERCUT! Dagu {b} terangkat!", "{a} selipkan uppercut, ngeri!"],
    "pukulan badan": ["{a} hajar perut {b}.", "Pukulan badan dari {a}, {b} meringis."],
    block: ["{b} tangkis dengan rapi.", "Pertahanan {b} rapat."],
    dodge: ["{b} menghindar, lincah juga!", "Meleset! {b} geser kepala."],
    counter: ["Serangan balik {b}!", "{b} langsung balas!"],
    tired: ["{a} mulai ngos-ngosan…", "Napas {a} sudah berat."],
  };
  const say = (k, a, b) => pick(L[k]).replace(/\{a\}/g, a.c.name).replace(/\{b\}/g, b.c.name);

  function announce(html, sec = 1.2) {
    const el = document.createElement("div"); el.className = "announce"; el.innerHTML = html; document.body.appendChild(el);
    setTimeout(() => el.remove(), sec * 1000);
  }
  function popText(x, y, z, text, color) {
    const s = textSprite(text, color, 2.2); s.position.set(x, y, z); world.add(s);
    S.fx.push({ o: s, t: 0, dur: 0.7 });
  }

  // ---------------- simulasi ----------------
  function planOf(f) {
    if (f.plan !== "auto") return f.plan;
    const o = opp(f);
    if (f.sta < 30) return "bertahan";
    if (f.hp < o.hp - 25) return "serang";
    if (o.sta < 35) return "serang";
    return f.st.speed >= 7 ? "balas" : "auto";
  }
  function startPunch(f, k) {
    const mv = MOVES[k], slow = f.sta < 30 ? 1.35 : 1;
    f.act = { k, mv, t: 0, wind: mv.wind * slow * (1.25 - f.st.speed * 0.04), resolved: false };
    f.state = "punch"; f.thrown++; f.sta = Math.max(0, f.sta - mv.cost * (1.2 - f.st.stamina * 0.04));
  }
  function decide(f) {
    const o = opp(f), d = dist(f, o), plan = planOf(f), P = PLANS[plan];
    f.think = rand(0.22, 0.55) * (1.3 - f.st.speed * 0.05) * (f.sta < 30 ? 1.4 : 1);
    if (o.state === "down") return;
    if (d > 2.5) return;                       // masih mendekat
    if (f.sta < 8) return;
    if (Math.random() > P.rate) return;
    const w = { jab: 4, cross: 3, hook: 2, upper: 1, body: 2 };
    if (plan === "serang") { w.hook = 3.5; w.upper = 2; }
    if (plan === "badan") { w.body = 7; w.hook = 1; }
    if (plan === "balas") { w.cross = 5; w.jab = 2; }
    if (d > 2.0) { w.hook = 0.3; w.upper = 0; }
    if (d < 1.6) { w.jab = 1; w.upper += 2; w.body += 1; }
    startPunch(f, wpick(w));
  }
  function resolve(f) {
    const o = opp(f), mv = f.act.mv, d = dist(f, o);
    if (o.state === "down") return;
    if (d > mv.range + 0.25) { sfx.whiff(); return; }
    const oplan = planOf(o);
    const busy = o.state === "punch" && o.act && !o.act.resolved;
    let dodge = busy ? 0 : 0.04 + o.st.speed * 0.022 + (oplan === "balas" ? 0.08 : 0);
    let block = busy ? 0 : 0.14 + (oplan === "bertahan" ? 0.28 : 0) + (o.sta > 50 ? 0.05 : 0);
    if (mv.target === "body") block *= 0.5;
    if (o.state === "hit") { dodge *= 0.3; block *= 0.4; }
    const r = Math.random();
    if (r < dodge) {
      o.react = 0.25; o.reactKind = "dodge"; sfx.whiff();
      if (S.gt - S.lastFeed > 2.5 && Math.random() < 0.4) feed(say("dodge", f, o));
      if (oplan === "balas" && Math.random() < 0.6 && o.state === "free" && o.sta > 10) { startPunch(o, Math.random() < 0.6 ? "cross" : "hook"); if (Math.random() < 0.5) feed(say("counter", f, o)); }
      return;
    }
    if (r < dodge + block) {
      o.react = 0.18; o.reactKind = "block"; o.sta = Math.max(0, o.sta - 1.5); sfx.block();
      if (S.gt - S.lastFeed > 3 && Math.random() < 0.25) feed(say("block", f, o));
      return;
    }
    // kena
    let dmg = 0.7 * mv.dmg * (0.7 + f.st.power * 0.06) * (f.sta < 30 ? 0.7 : 1) * (1.15 - o.st.chin * 0.03) * rand(0.85, 1.15);
    if (busy) dmg *= 1.25;                     // kena saat sedang memukul = lebih sakit
    if (mv.target === "body") { o.sta = Math.max(0, o.sta - mv.sdmg); dmg *= 0.6; }
    o.hp -= dmg; f.landed++; f.roundDmg += dmg; f.roundLand++;
    o.react = 0.3; o.reactKind = mv.target === "body" ? "body" : "head";
    const push = 0.25 + dmg * 0.03, ang = Math.atan2(o.x - f.x, o.z - f.z);
    o.x += Math.sin(ang) * push; o.z += Math.cos(ang) * push;
    S.hype = Math.min(1, S.hype + dmg / 18);
    const big = dmg >= 7;
    if (big) { sfx.heavy(); crowd(0.06, 1.1); S.shake = 0.25; popText(o.x, RING_Y + 5.2, o.z, pick(["BAK!", "DUG!", "POW!"]), "#ffcf3f"); }
    else sfx.jab();
    if (big || S.gt - S.lastFeed > 2.2) feed(say(mv.name, f, o), big);
    if (o.hp <= 0 || (mv.target === "head" && dmg >= 6 && o.hp < 22 && Math.random() < 0.18 * (dmg / 6))) knockdown(o, f);
  }
  function knockdown(f, by) {
    f.state = "down"; f.act = null; f.hp = Math.max(0, f.hp); f.kdRound++; f.kdTotal++; f.count = 0; f.downT = 0;
    S.shake = 0.5; crowd(0.1, 2.2);
    announce(`<small>${f.c.name}</small>JATUH!`, 1.2);
    feed(`${f.c.name} JATUH! Wasit ${S.refC.name} mulai menghitung!`, true);
    if (f.kdRound >= 3) { S.later(1.2, () => endFight(by, "TKO", `${f.c.name} jatuh 3 kali dalam satu ronde`)); f.count = 10; }
  }
  function updateDown(f, dt) {
    f.downT += dt;
    if (f.count >= 10 || S.phase !== "fight") return;
    if (f.downT >= 1) {
      f.downT = 0; f.count++; sfx.count();
      popText(S.ref.g.position.x, RING_Y + 4.8, S.ref.g.position.z, String(f.count), "#ffffff");
      if (f.count >= 3 && f.count < 10) {
        const p = clamp((f.st.chin * 0.07 + f.sta / 250) * (1 - 0.22 * (f.kdTotal - 1)), 0.05, 0.85) * (f.count >= 6 ? 1.2 : 0.6);
        if (Math.random() < p) {
          f.state = "free"; f.hp = Math.max(f.hp, 14 + f.st.chin * 2.5); f.think = 0.8;
          feed(`${f.c.name} bangun lagi! Penonton bergemuruh!`, true); crowd(0.08, 1.8);
          return;
        }
      }
      if (f.count >= 10) { const w = opp(f); announce("K.O.!", 2); feed(`K.O.! ${w.c.name} MENANG!`, true); crowd(0.12, 3); S.later(1.5, () => endFight(w, "KO", `KO di ronde ${S.round}`)); }
    }
  }
  function moveFighter(f, dt) {
    const o = opp(f);
    if (f.state === "down") return;
    const d = dist(f, o) || 0.01;
    let want = PLANS[planOf(f)].dist;
    if (o.state === "down") want = 5;          // menjauh ke pojok netral
    const ang = Math.atan2(o.x - f.x, o.z - f.z);
    const spd = (1.2 + f.st.speed * 0.18) * (f.sta < 30 ? 0.7 : 1) * (f.state === "punch" ? 0.3 : 1);
    const fwd = clamp((d - want) * 2, -1, 1);
    f.circle += rand(-0.6, 0.6) * dt; f.circle = clamp(f.circle, -1, 1);
    f.x += (Math.sin(ang) * fwd + Math.cos(ang) * f.circle * 0.45) * spd * dt;
    f.z += (Math.cos(ang) * fwd - Math.sin(ang) * f.circle * 0.45) * spd * dt;
    f.x = clamp(f.x, -R, R); f.z = clamp(f.z, -R, R);
    // jangan tembus
    if (d < 1.1) { f.x -= Math.sin(ang) * (1.1 - d) * 0.5; f.z -= Math.cos(ang) * (1.1 - d) * 0.5; }
    f.a = ang;
  }
  function simStep(dt) {
    S.gt += dt;
    if (S.phase === "fight") {
      S.clock -= dt;
      S.f.forEach((f) => {
        if (f.react > 0) f.react -= dt;
        if (f.state === "down") { updateDown(f, dt); return; }
        if (f.state !== "punch") f.sta = Math.min(100, f.sta + (2.5 + f.st.stamina * 0.45) * dt);
        moveFighter(f, dt);
        if (f.state === "free") { f.think -= dt; if (f.think <= 0) decide(f); }
        else if (f.state === "punch") {
          const a = f.act; a.t += dt;
          if (!a.resolved && a.t >= a.wind) { a.resolved = true; resolve(f); }
          if (f.state === "punch" && a.t >= a.wind + a.mv.act + a.mv.rec) { f.state = "free"; f.act = null; }
        }
        if (f.sta < 25 && Math.random() < dt * 0.05 && S.gt - S.lastFeed > 4) feed(say("tired", f, opp(f)));
      });
      if (S.clock <= 0 && S.phase === "fight" && !S.f.some((f) => f.state === "down")) endRound();
    } else if (S.phase === "rest") {
      S.restT -= dt;
      S.f.forEach((f) => { const cx = f.corner ? 3.8 : -3.8; f.x = lerp(f.x, cx, Math.min(1, dt * 2)); f.z = lerp(f.z, cx, Math.min(1, dt * 2)); f.a = Math.atan2(-f.x, -f.z); });
      $("rest-t") && ($("rest-t").textContent = Math.ceil(Math.max(0, S.restT)) + " dtk");
      if (S.restT <= 0) startRound();
    }
    S.hype = Math.max(0, S.hype - dt * 0.4);
    // wasit menjaga jarak di samping petinju
    if (S.ref && S.f.length === 2) {
      const [a, b] = S.f, mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ang = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      const down = S.f.find((f) => f.state === "down");
      const tx = down ? down.x + 1.4 : clamp(mx + Math.sin(ang) * 2.4, -R, R), tz = down ? down.z + 1.4 : clamp(mz + Math.cos(ang) * 2.4, -R, R);
      const r = S.ref.g.position; r.x = lerp(r.x, tx, Math.min(1, dt * 2)); r.z = lerp(r.z, tz, Math.min(1, dt * 2));
      S.ref.g.rotation.y = Math.atan2(mx - r.x, mz - r.z);
      S.ref.head.rotation.y = clamp(wrapA(S.yaw - S.ref.g.rotation.y) * 0.7, -1.2, 1.2);
    }
  }
  function scoreRound() {
    const [a, b] = S.f;
    for (let j = 0; j < 3; j++) {
      const sa = (a.roundDmg + a.roundLand * 0.5) * rand(0.85, 1.15), sb = (b.roundDmg + b.roundLand * 0.5) * rand(0.85, 1.15);
      let pa = 10, pb = 10;
      if (Math.abs(sa - sb) > 1.5) { if (sa > sb) pb = 9; else pa = 9; }
      pa -= a.kdRound; pb -= b.kdRound;
      S.cards[j][0] += Math.max(7, pa); S.cards[j][1] += Math.max(7, pb);
    }
  }
  function endRound() {
    S.phase = "rest"; sfx.bell(); scoreRound();
    S.f.forEach((f) => { f.state = "free"; f.act = null; });
    if (S.round >= S.rounds) {
      // keputusan juri
      let wa = 0, wb = 0;
      S.cards.forEach(([x, y]) => { if (x > y) wa++; else if (y > x) wb++; });
      const w = wa > wb ? S.f[0] : wb > wa ? S.f[1] : null;
      announce("BEL<br>AKHIR!", 1.4);
      S.later(1.6, () => endFight(w, w ? "Angka" : "Seri", w ? `Menang angka (${wa}-${wb} juri)` : "Juri bilang seri"));
      S.phase = "end";
      return;
    }
    S.restT = 8;
    announce(`<small>Selesai ronde ${S.round}</small>ISTIRAHAT`, 1.3);
    S.f.forEach((f) => { f.sta = Math.min(100, f.sta + 30 + f.st.stamina * 2); f.hp = Math.min(100, f.hp + 6); });
    showRest();
  }
  function startRound() {
    S.round++; S.clock = ROUND_LEN; S.phase = "fight";
    S.f.forEach((f) => { f.kdRound = 0; f.roundDmg = 0; f.roundLand = 0; f.state = "free"; f.think = rand(0.3, 0.8); });
    $("rest").hidden = true;
    sfx.bell(); announce(`RONDE ${S.round}`, 1.1); feed(`Ronde ${S.round} dimulai!`);
  }
  function endFight(winner, method, how) {
    if (S.phase === "over") return;
    S.phase = "over";
    sfx.bell3();
    S.result = { winner, method, how };
    S.later(2.2, showResult);
  }

  // ---------------- animasi model ----------------
  function animate(f, dt, t) {
    const m = f.m, o = opp(f);
    m.g.position.x = f.x; m.g.position.z = f.z;
    m.g.rotation.y = f.a;
    // kepala sedikit menoleh ke kamera biar wajahnya kelihatan (gaya siaran TV)
    m.head.rotation.y = clamp(wrapA(S.yaw - f.a) * 0.55, -1.1, 1.1);
    const g = m.g;
    if (f.state === "down") {
      g.rotation.x = lerp(g.rotation.x, -1.45, Math.min(1, dt * 6));
      g.position.y = RING_Y + 0.25;
      m.arms.forEach((a) => { a.piv.rotation.set(-0.3, 0, 0); setArm(a, 0.8); });
      return;
    }
    g.rotation.x = lerp(g.rotation.x, f.react > 0 && f.reactKind === "head" ? -0.3 : f.react > 0 && f.reactKind === "body" ? 0.3 : 0, Math.min(1, dt * 12));
    g.position.y = RING_Y + Math.abs(Math.sin(t * 7 + f.corner)) * 0.08;
    const step = Math.sin(t * 9 + f.corner * 2) * 0.35;
    m.legs[0].rotation.x = step; m.legs[1].rotation.x = -step;
    m.head.position.x = f.react > 0 && f.reactKind === "dodge" ? 0.4 * (f.corner ? 1 : -1) : lerp(m.head.position.x, 0, Math.min(1, dt * 8));
    // lengan
    const guardY = f.sta < 30 ? 2.3 : f.react > 0 && f.reactKind === "block" ? 3.1 : 2.8;
    m.arms.forEach((a, i) => {
      const side = i ? 1 : -1;
      let tx = side * 0.35, ty = guardY, tz = 1.0, len = 0.85;
      if (f.state === "punch" && f.act && f.act.mv.arm === i) {
        const A = f.act, mv = A.mv, p = A.t / A.wind;
        const hitT = A.t - A.wind;
        const ext = p < 1 ? Math.max(0, p - 0.6) * 0.5 : hitT < mv.act ? 1 : Math.max(0, 1 - (hitT - mv.act) / mv.rec);
        // titik sasaran di koordinat lokal petinju
        const ty2 = mv.target === "body" ? 1.8 : 3.0;
        const dd = dist(f, o);
        tx = mv.arc ? side * (1.4 * (1 - ext) + 0.1) : side * 0.2;
        ty = mv.up ? lerp(1.6, ty2, ext) : lerp(guardY, ty2, ext);
        tz = lerp(0.9, dd - 0.3, ext);
        len = lerp(0.85, Math.max(0.9, Math.min(2.2, dd - 0.5)), ext);
      }
      // arahkan lengan ke titik (tx,ty,tz) relatif bahu
      const sx = side * 0.62, sy = 2.0;
      const vx = tx - sx, vy = ty - sy, vz = Math.max(0.2, tz);
      a.piv.rotation.set(-Math.atan2(vy, Math.hypot(vx, vz)), Math.atan2(vx, vz), 0, "YXZ");
      setArm(a, lerp(a.len, len, Math.min(1, dt * 30)));
    });
  }
  function animateCrowd(dt, t) {
    S.crowdP.forEach((p, i) => {
      const jump = S.hype > 0.4 ? Math.abs(Math.sin(t * 9 + i)) * S.hype * 0.9 : Math.abs(Math.sin(t * 2 + i)) * 0.06;
      p.g.position.y = p.seat.y + jump;
      p.head.rotation.y = clamp(wrapA(S.yaw - p.seat.face), -1.3, 1.3);
      p.arms.forEach((a, k) => { a.piv.rotation.set(S.hype > 0.4 ? -2.6 + Math.sin(t * 10 + i + k) * 0.3 : -0.4, 0, 0); });
    });
  }

  // ---------------- kamera ----------------
  const camTarget = new THREE.Vector3(0, RING_Y + 1.5, 0);
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;               // jendela tersembunyi: jangan rusak ukuran kamera
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(S.px === 1 ? Math.min(devicePixelRatio || 1, 2) : 1 / S.px);
    updateCam();
  }
  function updateCam() {
    if (!innerWidth || !innerHeight) return;
    const asp = innerWidth / innerHeight;
    const z = S.zoom * (asp < 1 ? 1.35 / Math.max(asp, 0.45) * 0.6 : 1);
    camera.left = -z * asp; camera.right = z * asp; camera.top = z; camera.bottom = -z; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize);
  const ptrs = new Map(); let pinch0 = 0, zoom0 = 0;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.zoom; } });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { S.yaw -= (e.clientX - p.x) * 0.008; S.pitch = clamp(S.pitch + (e.clientY - p.y) * 0.004, 0.25, 1.2); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) { S.zoom = clamp(zoom0 * pinch0 / d, 3.5, 22); updateCam(); } }
  });
  const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  canvas.addEventListener("pointerup", endPtr); canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); S.zoom = clamp(S.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 3.5, 22); updateCam(); }, { passive: false });
  canvas.addEventListener("dblclick", () => { S.yaw = Math.PI / 4; S.pitch = 0.62; S.zoom = 7.5; updateCam(); });

  // ---------------- HUD ----------------
  function hudInit() {
    S.f.forEach((f, i) => { $("h-f" + i).src = "faces/" + f.c.id + ".png"; $("h-n" + i).textContent = f.c.name; });
    $("feed").innerHTML = "";
    const mine = S.bets.map((b) => `${byId(b.who).name} → ${S.f[b.pick].c.name}`);
    $("mybet").hidden = !mine.length; $("mybet").innerHTML = "🎟️ " + mine.slice(0, 4).join("<br>🎟️ ") + (mine.length > 4 ? `<br>+${mine.length - 4} lagi` : "");
  }
  function hudUpdate() {
    S.f.forEach((f, i) => {
      $("h-hp" + i).style.width = clamp(f.hp, 0, 100) + "%";
      $("h-st" + i).style.width = clamp(f.sta, 0, 100) + "%";
      $("h-kd" + i).textContent = f.kdTotal ? "⬇".repeat(f.kdTotal) + " jatuh" : "";
    });
    $("h-rd").textContent = `RONDE ${S.round}/${S.rounds}`;
    const c = Math.max(0, Math.ceil(S.clock)); $("h-clk").textContent = Math.floor(c / 60) + ":" + String(c % 60).padStart(2, "0");
  }
  function setHud(on) { ["hud", "feed", "ctrl"].forEach((k) => ($(k).hidden = !on)); $("back").hidden = on; if (!on) { $("rest").hidden = true; $("mybet").hidden = true; } }
  function showRest() {
    const el = $("rest");
    const row = (f, i) => `<div class="row ${f.corner ? "red" : ""}"><img src="faces/${f.c.id}.png" alt=""><b>${f.c.name}</b>${Object.entries(PLANS).map(([k, p]) => `<button class="chip" data-f="${i}" data-plan="${k}" aria-pressed="${f.plan === k}">${p.label}</button>`).join("")}</div>`;
    el.innerHTML = `<h3><span>🪑 Istirahat · atur strategi pojok</span><span id="rest-t">8 dtk</span></h3>${S.f.map(row).join("")}<div class="tip">Ketuk strategi untuk tiap petinju. Ronde berikutnya mulai otomatis.</div><div style="text-align:right;margin-top:6px"><button class="btn" id="rest-go" style="padding:6px 16px;font-size:16px">Lanjut ▶</button></div>`;
    el.hidden = false;
    el.querySelectorAll("[data-plan]").forEach((b) => b.onclick = () => { const f = S.f[+b.dataset.f]; f.plan = b.dataset.plan; sfx.click(); el.querySelectorAll(`[data-f="${b.dataset.f}"]`).forEach((x) => x.setAttribute("aria-pressed", x === b)); });
    $("rest-go").onclick = () => { S.restT = 0; };
  }

  // ---------------- alur layar ----------------
  const screens = ["s-title", "s-pick", "s-bet", "s-tour", "s-wallet", "s-result"];
  function show(id) { screens.forEach((s) => ($(s).hidden = s !== id)); }
  S.later = (sec, fn) => S.timers.push({ t: sec, fn, run: S.run });

  // opsi judul
  function renderOpts() {
    document.querySelectorAll("[data-rounds]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.rounds === S.rounds));
    document.querySelectorAll("[data-px]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.px === S.px));
    $("opt-sound").setAttribute("aria-pressed", soundOn); $("opt-sound").textContent = soundOn ? "🔊 Suara" : "🔇 Suara";
  }
  document.querySelectorAll("[data-rounds]").forEach((b) => b.onclick = () => { S.rounds = +b.dataset.rounds; store.set("rk_rounds", S.rounds); sfx.click(); renderOpts(); });
  document.querySelectorAll("[data-px]").forEach((b) => b.onclick = () => { S.px = +b.dataset.px; store.set("rk_px", S.px); resize(); sfx.click(); renderOpts(); });
  $("opt-sound").onclick = () => { soundOn = !soundOn; store.set("rk_sound", soundOn); renderOpts(); sfx.click(); };
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => {
    sfx.click();
    if (b.dataset.go === "exhib") openPick();
    else if (b.dataset.go === "tour") openTour();
    else openWallet();
  });

  // pilih petinju
  let pickSel = [];
  function openPick() { pickSel = []; S.tour = null; renderPick(); show("s-pick"); }
  function renderPick() {
    $("pick-title").textContent = pickSel.length === 0 ? "Pilih petinju pojok BIRU" : pickSel.length === 1 ? "Pilih petinju pojok MERAH" : "Siap!";
    $("pick-grid").innerHTML = CREW.map((c) => {
      const i = pickSel.indexOf(c), s = statsOf(c);
      const cls = i === 0 ? "blue" : i === 1 ? "red" : "";
      return `<button class="pf ${cls}" data-id="${c.id}">${i >= 0 ? `<span class="tagc">${i ? "MERAH" : "BIRU"}</span>` : ""}<img src="faces/${c.id}.png" alt="">${c.name}<small>⭐ ${s.rating}</small></button>`;
    }).join("");
    $("pick-ok").disabled = pickSel.length < 2;
  }
  $("pick-grid").onclick = (e) => {
    const b = e.target.closest(".pf"); if (!b) return;
    const c = byId(b.dataset.id); sfx.click();
    const i = pickSel.indexOf(c);
    if (i >= 0) pickSel.splice(i, 1); else if (pickSel.length < 2) pickSel.push(c); else pickSel[1] = c;
    renderPick();
  };
  $("pick-rand").onclick = () => { pickSel = shuffle(CREW).slice(0, 2); sfx.click(); renderPick(); };
  $("pick-back").onclick = () => show("s-title");
  $("pick-ok").onclick = () => { if (pickSel.length === 2) openBet(pickSel[0], pickSel[1]); };

  // taruhan
  let betPair = null;
  function statBars(c) { const s = statsOf(c); return `<div class="stats">${[["Tenaga", s.power], ["Kecepatan", s.speed], ["Dagu kuat", s.chin], ["Stamina", s.stamina]].map(([n, v]) => `<div class="st">${n}<i style="--v:${v * 10}%"></i></div>`).join("")}</div>`; }
  function openBet(a, b) {
    betPair = [a, b]; S.bets = [];
    const od = oddsOf(a, b);
    $("bet-title").textContent = S.tour ? `Turnamen · ${S.tour.label}` : "Pasang Taruhan";
    $("bet-vs").innerHTML = `<div class="corner blue"><img src="faces/${a.id}.png" alt=""><b>${a.name}</b><span class="odds">x${od[0]}</span>${statBars(a)}</div><div class="vs-mid">VS</div><div class="corner red"><img src="faces/${b.id}.png" alt=""><b>${b.name}</b><span class="odds">x${od[1]}</span>${statBars(b)}</div>`;
    $("bet-back").textContent = S.tour ? "◀ Bagan" : "◀";
    renderWho($("bet-who"), (c) => betModal(c, "match"));
    renderBetList();
    show("s-bet");
  }
  function renderWho(el, onPick) {
    el.innerHTML = CREW.map((c) => `<button data-id="${c.id}"><img src="faces/${c.id}.png" alt="">${c.name}<small>💰${fmt(getPts(c.id))}</small></button>`).join("");
    el.onclick = (e) => { const b = e.target.closest("button"); if (b) { sfx.click(); onPick(byId(b.dataset.id)); } };
  }
  function renderBetList() {
    $("bet-list").innerHTML = S.bets.map((b, i) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} pasang <b>${fmt(b.amount)}</b> untuk <b>${betPair[b.pick].name}</b>${b.method !== "any" ? ` (${b.method === "ko" ? "menang KO" : "menang angka"})` : ""} · x${b.mult}<button class="x" data-i="${i}">✕</button></div>`).join("") || '<small>Belum ada taruhan. Boleh langsung mulai juga.</small>';
    $("bet-list").querySelectorAll(".x").forEach((x) => x.onclick = () => { const b = S.bets.splice(+x.dataset.i, 1)[0]; setPts(b.who, getPts(b.who) + b.amount); renderBetList(); renderWho($("bet-who"), (c) => betModal(c, "match")); });
  }
  function betModal(c, kind) {
    let pts = getPts(c.id);
    if (pts <= 0) { setPts(c.id, 500); pts = 500; feedToast(`${c.name} dapat modal 500 poin dari Bos 😄`); }
    const pair = kind === "match" ? betPair : null;
    const od = pair ? oddsOf(pair[0], pair[1]) : null;
    const st = { pick: null, method: "any", amount: Math.min(100, pts) };
    const card = $("modal-card");
    const render = () => {
      let mult = 0;
      if (kind === "match" && st.pick != null) mult = Math.round(od[st.pick] * (st.method === "any" ? 1 : st.method === "ko" ? 1.8 : 1.4) * 20) / 20;
      if (kind === "champ" && st.pick != null) mult = S.tour.champOdds[st.pick];
      card.innerHTML = `<h3><img src="faces/${c.id}.png" alt="">${c.name} <small style="margin-left:auto">💰 ${fmt(pts)}</small></h3>
        <div class="lbl">${kind === "match" ? "Jagoanmu siapa?" : "Siapa yang bakal juara?"}</div>
        <div class="seg">${kind === "match" ? pair.map((p, i) => `<button class="${i ? "red" : "blue"}" data-pick="${i}" aria-pressed="${st.pick === i}">${p.name} x${od[i]}</button>`).join("")
          : S.tour.players.map((p, i) => `<button data-pick="${i}" aria-pressed="${st.pick === i}">${p.name} x${S.tour.champOdds[i]}</button>`).join("")}</div>
        ${kind === "match" ? `<div class="lbl">Menang dengan cara?</div><div class="seg"><button data-m="any" aria-pressed="${st.method === "any"}">Bebas</button><button data-m="ko" aria-pressed="${st.method === "ko"}">KO (x1.8)</button><button data-m="angka" aria-pressed="${st.method === "angka"}">Angka (x1.4)</button></div>` : ""}
        <div class="lbl">Pasang berapa?</div>
        <div class="seg">${[50, 100, 250, 500].filter((v) => v <= pts).map((v) => `<button data-a="${v}" aria-pressed="${st.amount === v}">${v}</button>`).join("")}<button data-a="${pts}" aria-pressed="${st.amount === pts}">Semua (${fmt(pts)})</button></div>
        <div class="payout">${st.pick == null ? "Pilih jagoan dulu." : `Kalau menang dapat <b>${fmt(st.amount * mult)}</b> poin (x${mult}).`}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn ghost" id="m-cancel">Batal</button><button class="btn" id="m-ok" ${st.pick == null || st.amount <= 0 ? "disabled" : ""}>Pasang ✓</button></div>`;
      card.querySelectorAll("[data-pick]").forEach((b) => b.onclick = () => { st.pick = +b.dataset.pick; sfx.click(); render(); });
      card.querySelectorAll("[data-m]").forEach((b) => b.onclick = () => { st.method = b.dataset.m; sfx.click(); render(); });
      card.querySelectorAll("[data-a]").forEach((b) => b.onclick = () => { st.amount = +b.dataset.a; sfx.click(); render(); });
      $("m-cancel").onclick = () => { $("modal").hidden = true; };
      $("m-ok").onclick = () => {
        if (st.pick == null) return;
        setPts(c.id, pts - st.amount); sfx.coin();
        const bet = { who: c.id, pick: st.pick, method: st.method, amount: st.amount, mult };
        if (kind === "match") { S.bets.push(bet); renderBetList(); renderWho($("bet-who"), (x) => betModal(x, "match")); }
        else { S.tour.champBets.push(bet); renderTour(); }
        $("modal").hidden = true;
      };
    };
    render(); $("modal").hidden = false;
  }
  $("modal").onclick = (e) => { if (e.target === $("modal")) $("modal").hidden = true; };
  function feedToast(text) { announce(`<small>${text}</small>`, 1.6); }
  $("bet-back").onclick = () => {
    // kembalikan poin taruhan yang batal
    S.bets.forEach((b) => setPts(b.who, getPts(b.who) + b.amount)); S.bets = [];
    if (S.tour) { renderTour(); show("s-tour"); } else { renderPick(); show("s-pick"); }
  };
  $("bet-go").onclick = () => startFight(betPair[0], betPair[1]);

  // turnamen
  function openTour() {
    const players = shuffle(CREW).slice(0, Math.min(8, CREW.length >= 8 ? 8 : 4));
    const ws = players.map((p) => Math.exp(statsOf(p).rating / 3)), tot = ws.reduce((a, b) => a + b, 0);
    S.tour = {
      players, champBets: [], locked: false,
      champOdds: ws.map((w) => Math.round(clamp(0.9 / (w / tot), 2, 25) * 2) / 2),
      rounds: [players.map((p, i) => i).reduce((acc, i) => (i % 2 ? acc : acc.concat([[i, i + 1]])), []).map(([a, b]) => ({ a, b, w: null }))],
      cur: 0,
    };
    renderTour(); show("s-tour");
  }
  function tourNext() {
    const T = S.tour;
    for (let r = 0; r < T.rounds.length; r++) for (const m of T.rounds[r]) if (m.w == null) return { r, m };
    return null;
  }
  function stageName(r, n) { const left = n >> r; return left === 2 ? "Final" : left === 4 ? "Semifinal" : "Perempat Final"; }
  function renderTour() {
    const T = S.tour, n = T.players.length;
    const total = Math.log2(n);
    let html = "";
    for (let r = 0; r < total; r++) {
      const ms = T.rounds[r] || [];
      const cnt = n >> (r + 1);
      const nx = tourNext();
      html += `<div class="col"><b style="font-size:12px;text-align:center">${stageName(r, n)}</b>` + Array.from({ length: cnt }, (_, i) => {
        const m = ms[i];
        if (!m) return `<div class="bm">…<br>…</div>`;
        const line = (pi) => { const p = T.players[pi]; const cls = m.w == null ? "" : m.w === pi ? "w" : "l"; return `<div class="${cls}"><img src="faces/${p.id}.png" alt="">${p.name}</div>`; };
        return `<div class="bm ${nx && nx.m === m ? "now" : ""}">${line(m.a)}${line(m.b)}</div>`;
      }).join("") + "</div>";
    }
    const champ = T.rounds[total - 1] && T.rounds[total - 1][0] && T.rounds[total - 1][0].w;
    if (total < 3) html += '<div class="col"></div>';
    $("bracket").innerHTML = html;
    $("tour-title").textContent = champ != null ? `👑 Juara: ${T.players[champ].name}` : "Turnamen Ring Kantor";
    $("champ-sub").textContent = T.locked ? "Tebakan sudah dikunci." : "Ketuk wajahmu, lalu pilih siapa yang bakal juara. Hanya sebelum pertandingan pertama.";
    $("champ-who").hidden = T.locked;
    if (!T.locked) renderWho($("champ-who"), (c) => betModal(c, "champ"));
    $("champ-list").innerHTML = T.champBets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} tebak <b>${T.players[b.pick].name}</b> juara · ${fmt(b.amount)} x${b.mult}${b.res != null ? `<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "kalah"}</span>` : ""}</div>`).join("") || "<small>Belum ada tebakan.</small>";
    const nx = tourNext();
    $("tour-go").hidden = !nx;
    if (nx) $("tour-go").textContent = `${stageName(nx.r, n)}: ${T.players[nx.m.a].name} vs ${T.players[nx.m.b].name} ▶`;
  }
  $("tour-go").onclick = () => {
    const nx = tourNext(); if (!nx) return;
    S.tour.locked = true;
    S.tour.label = stageName(nx.r, S.tour.players.length);
    S.tour.curMatch = nx;
    openBet(S.tour.players[nx.m.a], S.tour.players[nx.m.b]);
  };
  $("tour-quit").onclick = () => {
    if (S.tour && !S.tour.locked) S.tour.champBets.forEach((b) => setPts(b.who, getPts(b.who) + b.amount));
    S.tour = null; show("s-title");
  };

  // dompet
  function openWallet() {
    const list = CREW.map((c) => ({ c, p: getPts(c.id) })).sort((a, b) => b.p - a.p);
    $("lead").innerHTML = list.map((x, i) => `<div>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1 + "."}<img src="faces/${x.c.id}.png" alt="">${x.c.name}<span>💰 ${fmt(x.p)}</span></div>`).join("");
    show("s-wallet");
  }
  $("wallet-back").onclick = () => show("s-title");
  $("wallet-reset").onclick = () => { if (confirm("Reset poin semua orang jadi 1.000?")) { store.set("rk_wallet", {}); openWallet(); } };

  // ---------------- mulai & selesai tanding ----------------
  function clearFight() {
    S.run++; S.timers = [];
    S.f.forEach((f) => world.remove(f.m.g)); S.f = [];
    if (S.ref) world.remove(S.ref.g); S.ref = null;
    S.crowdP.forEach((p) => world.remove(p.g)); S.crowdP = [];
    S.fx.forEach((e) => world.remove(e.o)); S.fx = [];
    document.querySelectorAll(".announce").forEach((e) => e.remove());
  }
  function fillCrowd(exclude) {
    const pool = CREW.filter((c) => !exclude.includes(c));
    if (!pool.length) return;
    const order = shuffle(pool);
    seats.forEach((s, i) => {
      const c = order[i % order.length];
      const p = makeFan(c);
      p.g.position.set(s.x, s.y, s.z); p.g.rotation.y = s.face; p.seat = s;
      world.add(p.g); S.crowdP.push(p);
    });
  }
  function startFight(a, b) {
    clearFight();
    S.f = [makeBoxer(a, 0), makeBoxer(b, 1)];
    const refPool = CREW.filter((c) => c !== a && c !== b);
    S.refC = pick(refPool.length ? refPool : CREW);
    S.ref = makePerson(S.refC, { shirt: 0xffffff, pants: 0x1d1d24, bow: true });
    S.ref.g.position.set(0, RING_Y, 3); world.add(S.ref.g);
    fillCrowd([a, b, S.refC]);
    Object.assign(S, { round: 0, clock: ROUND_LEN, phase: "intro", cards: [[0, 0], [0, 0], [0, 0]], hype: 0.6, gt: 0, lastFeed: -9, result: null, paused: false });
    show(null); setHud(true); hudInit(); hudUpdate();
    $("c-pause").textContent = "⏸";
    announce(`<small>${a.name} vs ${b.name}</small>DING DING!`, 1.6);
    feed(`Selamat datang di Ring Kantor! Wasit hari ini: ${S.refC.name}.`);
    crowd(0.08, 2);
    S.later(1.8, startRound);
  }
  function settle(winnerIdx, method) {
    const isKO = method === "KO" || method === "TKO", isDec = method === "Angka";
    S.bets.forEach((b) => {
      const ok = winnerIdx === b.pick && (b.method === "any" || (b.method === "ko" && isKO) || (b.method === "angka" && isDec));
      b.res = ok ? Math.round(b.amount * b.mult) : 0;
      if (ok) setPts(b.who, getPts(b.who) + b.res);
    });
  }
  function showResult() {
    const R0 = S.result, w = R0.winner, wi = w ? S.f.indexOf(w) : -1;
    settle(wi, R0.method);
    setHud(false);
    $("r-face").src = "faces/" + (w ? w.c.id : S.refC.id) + ".png";
    $("r-big").textContent = w ? `${w.c.name} MENANG!` : "SERI!";
    $("r-how").textContent = `${R0.method === "Seri" ? "" : R0.method + " · "}${R0.how} · Pukulan masuk ${S.f[0].c.name} ${S.f[0].landed}/${S.f[0].thrown}, ${S.f[1].c.name} ${S.f[1].landed}/${S.f[1].thrown}`;
    $("r-cards-wrap").hidden = R0.method === "KO" || R0.method === "TKO";
    $("r-cards").innerHTML = S.cards.map(([x, y], j) => `<div>Juri ${j + 1}<br>${x} - ${y}</div>`).join("");
    let bets = S.bets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} → ${S.f[b.pick].c.name} (${fmt(b.amount)})<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "kalah"}</span></div>`).join("");
    // turnamen
    const T = S.tour;
    if (T && T.curMatch) {
      const m = T.curMatch.m;
      const winIdx = w ? (w.c === T.players[m.a] ? m.a : m.b) : (Math.random() < 0.5 ? m.a : m.b);
      if (!w) bets += `<div class="bet">Seri! Lewat undian koin: <b>${T.players[winIdx].name}</b> lanjut.</div>`;
      m.w = winIdx;
      const r = T.curMatch.r, ms = T.rounds[r];
      if (ms.every((x) => x.w != null) && ms.length > 1) {
        const next = []; for (let i = 0; i < ms.length; i += 2) next.push({ a: ms[i].w, b: ms[i + 1].w, w: null });
        T.rounds[r + 1] = next;
      }
      T.curMatch = null;
      if (!tourNext()) {
        const champ = winIdx;
        T.champBets.forEach((b) => { b.res = b.pick === champ ? Math.round(b.amount * b.mult) : 0; if (b.res) setPts(b.who, getPts(b.who) + b.res); });
        bets += `<div class="bet">👑 <b>${T.players[champ].name}</b> JUARA TURNAMEN!</div>` + T.champBets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} tebak juara ${T.players[b.pick].name}<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "meleset"}</span></div>`).join("");
      }
    }
    $("r-bets-wrap").hidden = !bets;
    $("r-bets").innerHTML = bets;
    $("r-next").hidden = !T;
    $("r-next").textContent = T && tourNext() ? "Lanjut Turnamen ▶" : "Lihat Bagan ▶";
    $("r-again").hidden = !!T;
    S.phase = "done";
    show("s-result");
  }
  $("r-next").onclick = () => { renderTour(); show("s-tour"); };
  $("r-again").onclick = () => openBet(S.f[0].c, S.f[1].c);
  $("r-menu").onclick = () => { clearFight(); S.tour = null; show("s-title"); idleCrowd(); };

  // kontrol tanding
  document.querySelectorAll("[data-spd]").forEach((b) => b.onclick = () => { S.speed = +b.dataset.spd; document.querySelectorAll("[data-spd]").forEach((x) => x.setAttribute("aria-pressed", x === b)); sfx.click(); });
  $("c-pause").onclick = () => { S.paused = !S.paused; $("c-pause").textContent = S.paused ? "▶" : "⏸"; };
  $("c-rotl").onclick = () => { S.yaw += Math.PI / 2; };
  $("c-rotr").onclick = () => { S.yaw -= Math.PI / 2; };
  $("c-zin").onclick = () => { S.zoom = clamp(S.zoom * 0.85, 3.5, 22); updateCam(); };
  $("c-zout").onclick = () => { S.zoom = clamp(S.zoom * 1.18, 4, 22); updateCam(); };
  $("c-follow").onclick = () => { S.follow = !S.follow; $("c-follow").setAttribute("aria-pressed", S.follow); };
  $("c-quit").onclick = () => {
    if (!confirm("Hentikan pertandingan? Taruhan dikembalikan.")) return;
    S.bets.forEach((b) => setPts(b.who, getPts(b.who) + b.amount)); S.bets = [];
    clearFight(); setHud(false);
    if (S.tour) { renderTour(); show("s-tour"); } else show("s-title");
    idleCrowd();
  };
  addEventListener("keydown", (e) => {
    if (S.f.length !== 2) return;
    if (e.code === "Space") { e.preventDefault(); $("c-pause").click(); }
    if (e.code === "KeyQ") S.yaw += Math.PI / 2;
    if (e.code === "KeyE") S.yaw -= Math.PI / 2;
    if (["Digit1", "Digit2", "Digit4"].includes(e.code)) document.querySelector(`[data-spd="${e.code.slice(-1)}"]`).click();
  });

  // penonton saat di menu
  function idleCrowd() { S.crowdP.forEach((p) => world.remove(p.g)); S.crowdP = []; fillCrowd([]); S.hype = 0; }

  // ---------------- loop ----------------
  let t0 = performance.now(), time = 0;
  S.gt = 0; S.shake = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min((now - t0) / 1000, 0.05); t0 = now; time += rdt;
    tick(rdt);
    render(rdt);
  }
  function tick(rdt) {
    if (S.paused) return;
    const gdt = rdt * (S.f.length === 2 ? S.speed : 1);
    const steps = Math.max(1, Math.ceil(gdt / (1 / 60)));
    for (let i = 0; i < steps; i++) {
      const dt = gdt / steps;
      const due = [];
      S.timers = S.timers.filter((tm) => { if (tm.run !== S.run) return false; tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
      due.forEach((tm) => { if (tm.run === S.run) tm.fn(); });
      if (S.f.length === 2 && S.phase !== "done") simStep(dt);
    }
    S.fx = S.fx.filter((e) => { e.t += rdt; e.o.position.y += rdt * 1.5; e.o.material.opacity = 1 - Math.max(0, e.t / e.dur - 0.5) * 2; if (e.t >= e.dur) { world.remove(e.o); return false; } return true; });
    if (S.f.length === 2) { S.f.forEach((f) => animate(f, gdt, time)); hudUpdate(); }
  }
  function render(rdt) {
    animateCrowd(rdt, time);
    lights.forEach((l, i) => { if (l.userData.sp) { l.userData.a += l.userData.sp * rdt; l.position.x = Math.cos(l.userData.a) * l.userData.r; l.position.z = Math.sin(l.userData.a) * l.userData.r; } else l.visible = Math.sin(time * 4 + i) > -0.6; });
    const tgt = new THREE.Vector3(0, RING_Y + 1.2, 0);
    if (S.follow && S.f.length === 2) { tgt.x = (S.f[0].x + S.f[1].x) / 2; tgt.z = (S.f[0].z + S.f[1].z) / 2; }
    if (S.f.length !== 2) S.yaw += rdt * 0.08;
    camTarget.lerp(tgt, Math.min(1, rdt * 3));
    S.shake = Math.max(0, S.shake - rdt);
    const sh = S.shake * 0.5;
    const D = 60;
    camera.position.set(camTarget.x + Math.sin(S.yaw) * Math.cos(S.pitch) * D + rand(-sh, sh), camTarget.y + Math.sin(S.pitch) * D, camTarget.z + Math.cos(S.yaw) * Math.cos(S.pitch) * D + rand(-sh, sh));
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  // ---------------- mulai ----------------
  loadFaces().then(() => {
    CREW = CREW.filter((c) => faceImg[c.id]);
    if (CREW.length < 2) { err("Foto wajah kurang. Jalankan lewat server lokal (lihat README)."); return; }
    buildWorld();
    idleCrowd();
    renderOpts();
    resize();
    show("s-title");
    window.__rk = { S, startFight, CREW: () => CREW, oddsOf, statsOf, sim(sec) { for (let t = 0; t < sec; t += 0.05) tick(0.05); return { phase: S.phase, round: S.round, hp: S.f.map((f) => Math.round(f.hp)), sta: S.f.map((f) => Math.round(f.sta)), st: S.f.map((f) => f.state), landed: S.f.map((f) => f.landed + "/" + f.thrown), result: S.result && { w: S.result.winner && S.result.winner.c.name, m: S.result.method } }; } };
    requestAnimationFrame(frame);
  });
})();
