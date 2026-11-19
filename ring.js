/* RING KANTOR v2 — smackdown kantor otomatis bergaya diorama pixel.
   Duel 1 lawan 1 atau Tawuran 3–8 orang di 5 arena. Petinju bisa memukul, membanting, suplex,
   melempar lawan keluar arena, menghantam pakai barang kantor, lompat dari tumpukan kardus,
   dan memakai jurus khas masing-masing (window.RING di characters.js).
   Penonton bertaruh pakai Poin Kantor (bukan uang). */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const err = (m) => { $("err").textContent = m; $("err").hidden = false; };
  if (!window.THREE) { err("Three.js gagal dimuat. Cek internet lalu refresh."); return; }
  let CREW = window.CREW || [];
  const RINGSIG = window.RING || {};

  // ================= util =================
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
  const byId = (id) => CREW.find((c) => c.id === id);
  const hex = (n) => "#" + n.toString(16).padStart(6, "0");

  // ================= suara =================
  let actx = null, soundOn = store.get("rk_sound", true), noiseBuf = null;
  function ac() {
    if (!soundOn) return null;
    try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); return actx; } catch (e) { return null; }
  }
  function beep(freq, dur = 0.1, type = "square", vol = 0.06, slide = 0, delay = 0) {
    const a = ac(); if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(vol = 0.05, dur = 1.2, freq = 900, q = 0.6) {
    const a = ac(); if (!a) return;
    if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * 2, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(), t = a.currentTime;
    s.buffer = noiseBuf; f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(t); s.stop(t + dur + 0.05);
  }
  const sfx = {
    bell: () => { beep(1250, 0.7, "triangle", 0.08); beep(1870, 0.5, "sine", 0.04); },
    bell3: () => { [0, 0.25, 0.5].forEach((d) => beep(1250, 0.4, "triangle", 0.07, 0, d)); },
    jab: () => beep(220, 0.06, "square", 0.05, -80),
    heavy: () => { beep(120, 0.16, "sawtooth", 0.09, -60); beep(70, 0.2, "square", 0.05, -20); },
    slam: () => { beep(70, 0.45, "sawtooth", 0.12, -30); noise(0.08, 0.5, 300, 0.8); },
    crash: () => { noise(0.1, 0.45, 2600, 0.5); beep(180, 0.2, "square", 0.05, -100); },
    splash: () => { noise(0.12, 0.9, 700, 0.4); },
    meow: () => { beep(700, 0.25, "sawtooth", 0.05, 500); beep(1100, 0.3, "triangle", 0.04, -400, 0.2); },
    special: () => { [520, 660, 880, 1100].forEach((f, i) => beep(f, 0.09, "triangle", 0.06, 0, i * 0.055)); },
    block: () => beep(700, 0.04, "square", 0.035),
    whiff: () => beep(500, 0.06, "triangle", 0.02, -300),
    count: () => beep(880, 0.08, "square", 0.04),
    coin: () => { beep(880, 0.08, "triangle", 0.06); beep(1320, 0.12, "triangle", 0.06, 0, 0.07); },
    click: () => beep(660, 0.05, "triangle", 0.05),
    crowd: (v = 0.06, d = 1.2) => noise(v, d, 900, 0.6),
  };

  // ================= petinju =================
  function statsOf(c) {
    let h = 2166136261;
    for (const ch of c.id + "ring") { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const r = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return 4 + (Math.abs(h) % 6); };
    const s = { power: r(), speed: r(), chin: r(), stamina: r() };
    s.rating = s.power + s.speed + s.chin + s.stamina;
    return s;
  }
  const sigOf = (c) => RINGSIG[c.id] || { sig: "weapon", obj: "monitor", name: "Monitor Melayang" };
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
  const TEAM = [0x3a7bff, 0xff4a5a, 0x22c27a, 0xffcf3f, 0xa45cff, 0xff9f1c, 0x2ad1d1, 0xff6fb5];
  const PROPS = {
    cpu:       { name: "CPU", dmg: 16, color: 0x222228 },
    monitor:   { name: "monitor", dmg: 15, color: 0x1d2a44 },
    printer:   { name: "printer", dmg: 18, color: 0xe9e9ee },
    kursi:     { name: "kursi kantor", dmg: 17, color: 0x2b2b33 },
    galon:     { name: "galon", dmg: 14, color: 0x5ab3ff },
    keyboard:  { name: "keyboard", dmg: 10, color: 0x3a3a44 },
    palu:      { name: "palu tukang", dmg: 20, color: 0x8b5a3c },
    kentongan: { name: "pentungan ronda", dmg: 16, color: 0x8b5a3c },
    stempel:   { name: "stempel ACC", dmg: 18, color: 0xd62828 },
  };

  // ================= wajah & kepala kotak =================
  const faceImg = {};
  function loadFaces() {
    return Promise.all(CREW.map((c) => new Promise((res) => {
      const img = new Image();
      img.onload = () => { faceImg[c.id] = img; res(); };
      img.onerror = () => res();
      img.src = "faces/" + c.id + ".png";
    })));
  }
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
    const texMat = (w, h, draw, nearest) => { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d"), w, h); const t = new THREE.CanvasTexture(cv); if (nearest) t.magFilter = THREE.NearestFilter; else t.minFilter = THREE.LinearFilter; return new THREE.MeshLambertMaterial({ map: t }); };
    const front = texMat(128, 144, (g) => { g.fillStyle = c.skin; g.fillRect(0, 0, 128, 144); if (img) g.drawImage(img, img.width * 0.09, img.height * 0.1, img.width * 0.82, img.height * 0.78, 0, 0, 128, 144); });
    const sideDraw = (flip) => (g, w, h) => { g.fillStyle = c.skin; g.fillRect(0, 0, w, h); g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.32); g.fillRect(flip ? 0 : w * 0.55, 0, w * 0.45, h * 0.55); };
    const back = texMat(64, 72, (g, w, h) => { g.fillStyle = c.skin; g.fillRect(0, 0, w, h); g.fillStyle = hair; g.fillRect(0, 0, w, h * 0.8); }, true);
    headMats[c.id] = [texMat(64, 72, sideDraw(true), true), texMat(64, 72, sideDraw(false), true), new THREE.MeshLambertMaterial({ color: new THREE.Color(hair) }), new THREE.MeshLambertMaterial({ color: new THREE.Color(c.skin) }), front, back];
    return headMats[c.id];
  }

  // ================= three.js =================
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
  function obox(w, h, d, c, x = 0, y = 0, z = 0, t = 0.09) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    const o = new THREE.Mesh(BOXG, INKM); o.scale.set(w + t, h + t, d + t);
    g.add(o, box(w, h, d, c)); return g;
  }
  const grp = (...k) => { const g = new THREE.Group(); k.forEach((x) => g.add(x)); return g; };
  const cyl = (r, h, c, s = 10) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, s), typeof c === "number" ? M(c) : c);
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.magFilter = THREE.NearestFilter; return t;
  }
  function textSprite(text, color, size = 2) {
    const t = canvasTex(256, 128, (g) => {
      g.font = "700 60px Silkscreen, Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      let s = 60; while (g.measureText(text).width > 236 && s > 20) { s -= 4; g.font = `700 ${s}px Silkscreen, Fredoka, sans-serif`; }
      g.lineWidth = 14; g.strokeStyle = "#1d1530"; g.strokeText(text, 128, 66);
      g.fillStyle = color; g.fillText(text, 128, 66);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(size, size / 2, 1); s.renderOrder = 20; return s;
  }
  function signPlane(text, bg, fg, w, h) {
    const t = canvasTex(256, 64, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 256, 64); g.strokeStyle = "#1d1530"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 58); g.font = "700 30px Silkscreen, monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = fg; g.fillText(text, 128, 34); });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
  }

  // ================= pulau dasar =================
  const world = new THREE.Group(); scene.add(world);
  const anims = [];
  function buildIsland() {
    world.add(obox(30, 1, 30, 0xb9b4ad, 0, -0.5, 0, 0.15));
    world.add(box(30, 3, 30, 0x8a5a3c, 0, -2.5, 0), box(30.1, 0.5, 30.1, 0x5cbf5a, 0, -1.2, 0));
    world.add(box(24, 3, 24, 0x7a4a30, 0, -5.5, 0), box(17, 3, 17, 0x6b4029, 1, -8.5, -1), box(9, 3, 9, 0x5a3622, -1, -11.5, 1), box(4, 2, 4, 0x4a2c1c, 0, -14, 0));
    [[0, 14.7, 30, 0.6], [0, -14.7, 30, 0.6], [14.7, 0, 0.6, 30], [-14.7, 0, 0.6, 30]].forEach(([x, z, w, d]) => world.add(obox(w, 1.2, d, 0xd9d4ca, x, 0.6, z, 0.1)));
    const tank = grp(obox(0.3, 3, 0.3, 0x555a66, -1, 1.5, -1), obox(0.3, 3, 0.3, 0x555a66, 1, 1.5, -1), obox(0.3, 3, 0.3, 0x555a66, -1, 1.5, 1), obox(0.3, 3, 0.3, 0x555a66, 1, 1.5, 1));
    const tk = cyl(1.6, 2.6, 0x3a8be0); tk.position.y = 4.3; tank.add(tk); tank.position.set(-12.8, 0, -12.8); world.add(tank);
    for (let k = 0; k < 2; k++) world.add(obox(1.6, 1.1, 1.0, 0xeef0f2, 12.8, 0.55, -12.8 + k * 1.8));
    const banner = signPlane("RING KANTOR", "#ff4a5a", "#ffffff", 9, 2.2); banner.position.set(0, 9.2, -14.2); world.add(banner, obox(0.3, 10, 0.3, 0x555a66, -4.8, 5, -14.2), obox(0.3, 10, 0.3, 0x555a66, 4.8, 5, -14.2));
    for (let k = 0; k < 8; k++) {
      const c = grp(box(3, 1, 2, 0xffffff), box(2, 1.2, 1.6, 0xffffff, 1.2, 0.5, 0), box(1.8, 0.8, 1.4, 0xffffff, -1.4, 0.2, 0.2));
      const a = rand(0, TAU), r = rand(26, 40);
      c.position.set(Math.cos(a) * r, rand(-10, 8), Math.sin(a) * r); world.add(c);
      const sp = rand(0.02, 0.05); let ang = a;
      anims.push((dt) => { ang += sp * dt; c.position.x = Math.cos(ang) * r; c.position.z = Math.sin(ang) * r; });
    }
    for (let k = 0; k < 3; k++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 16, 16, 1, true), new THREE.MeshBasicMaterial({ color: [0xfff3b0, 0xff9fd2, 0x9fd8ff][k], transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const piv = new THREE.Group(); piv.position.y = 17; cone.position.y = -8; piv.add(cone); world.add(piv);
      anims.push((dt, t) => { piv.rotation.z = Math.sin(t * 0.5 + k * 2) * 0.35; piv.rotation.x = Math.cos(t * 0.4 + k) * 0.35; });
    }
  }

  // ================= arena =================
  const ARENAS = {
    ring:   { name: "🥊 Ring Atap Gudang", desc: "Ring tinju klasik", half: 4.3, fy: 1.2, edge: "ropes", props: ["cpu", "kursi", "monitor"], seatD: 7.6 },
    gudang: { name: "🏭 Gudang Barang Masuk", desc: "Tumpukan CPU & printer", half: 7, fy: 0.35, edge: "walls", props: ["cpu", "printer", "monitor", "keyboard", "cpu", "kursi"], seatD: 10.4 },
    kolam:  { name: "🏊 Rakit di Kolam", desc: "Terlempar = kecebur!", half: 5.4, fy: 0.75, edge: "water", props: ["galon", "kursi", "keyboard"], seatD: 10.8 },
    warung: { name: "🍌 Warung Heri", desc: "Galon, kursi, gorengan", half: 6, fy: 0.35, edge: "walls", props: ["galon", "kursi", "galon", "keyboard", "monitor"], seatD: 9.6 },
    parkir: { name: "🚚 Parkiran Ruko", desc: "Lompat dari atap mobil box", half: 7, fy: 0.35, edge: "walls", props: ["cpu", "galon", "kursi", "printer", "keyboard"], seatD: 10.4 },
  };
  let arenaGroup = null, A = ARENAS.ring, seats = [], spots = [];
  const arenaAnims = [];
  function buildArena(id) {
    if (arenaGroup) world.remove(arenaGroup);
    arenaAnims.length = 0;
    A = ARENAS[id]; A.id = id;
    const g = new THREE.Group(); arenaGroup = g; world.add(g);
    seats = []; spots = [];
    const H = A.half;
    const floorTex = (c1, c2, n) => { const t = canvasTex(32, 32, (x) => { x.fillStyle = c1; x.fillRect(0, 0, 32, 32); x.fillStyle = c2; x.fillRect(0, 0, 32, 2); x.fillRect(0, 0, 2, 32); }); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n, n); return new THREE.MeshLambertMaterial({ map: t }); };
    const floor = (mat, size) => { const f = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat); f.rotation.x = -Math.PI / 2; f.position.y = A.fy + 0.01; g.add(f); };
    if (id === "ring") {
      g.add(obox(11, A.fy, 11, 0x2f4fd0, 0, A.fy / 2, 0, 0.15));
      const mat = canvasTex(128, 128, (x) => { x.fillStyle = "#f2efe6"; x.fillRect(0, 0, 128, 128); x.font = "700 18px Silkscreen, monospace"; x.textAlign = "center"; x.fillStyle = "#d9d2c2"; x.fillText("KANTOR", 64, 70); });
      floor(new THREE.MeshLambertMaterial({ map: mat }), 10.6);
      [[-1, -1, 0x3a7bff], [1, 1, 0xff4a5a], [1, -1, 0xffffff], [-1, 1, 0xffffff]].forEach(([sx, sz, c]) => { g.add(obox(0.4, 2.4, 0.4, c, sx * 5.1, A.fy + 1.2, sz * 5.1)); spots.push({ x: sx * 4.5, z: sz * 4.5, h: 1.6, name: "tiang ring" }); });
      [0.7, 1.35, 2.0].forEach((h, i) => {
        const c = [0xff4a5a, 0xffffff, 0x3a7bff][i];
        g.add(box(10.2, 0.12, 0.12, c, 0, A.fy + h, 5.1), box(10.2, 0.12, 0.12, c, 0, A.fy + h, -5.1), box(0.12, 0.12, 10.2, c, 5.1, A.fy + h, 0), box(0.12, 0.12, 10.2, c, -5.1, A.fy + h, 0));
      });
      g.add(obox(0.8, 0.8, 0.8, 0x3a7bff, -6.2, 0.4, -6.2), obox(0.8, 0.8, 0.8, 0xff4a5a, 6.2, 0.4, 6.2));
    } else if (id === "gudang") {
      g.add(obox(2 * H + 1, A.fy, 2 * H + 1, 0xc9c4b8, 0, A.fy / 2, 0, 0.12));
      floor(floorTex("#d8d3c6", "#c4bdae", 8), 2 * H + 1);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const x = sx * (H - 0.6), z = sz * (H - 0.6);
        g.add(obox(1.1, 0.8, 1.1, 0xc8955a, x, A.fy + 0.4, z), obox(1.1, 0.8, 1.1, 0xb5824a, x, A.fy + 1.2, z));
        spots.push({ x, z, h: 1.6, name: "tumpukan kardus" });
      });
      const rack = grp(); for (let i = 0; i < 6; i++) { rack.add(obox(1.4, 1.2, 1.2, i % 3 === 1 ? 0xe9e9ee : 0x222228, -4 + i * 1.6, A.fy + 0.6, 0)); rack.add(obox(1.4, 1.2, 1.2, i % 2 ? 0x222228 : 0xc8955a, -4 + i * 1.6, A.fy + 1.8, 0)); }
      rack.position.z = -(H + 1.4); g.add(rack);
      const sign = signPlane("BARANG MASUK", "#ffffff", "#1d1530", 5, 1.25); sign.position.set(0, A.fy + 4.2, -(H + 2.2)); g.add(sign, obox(10, 4.8, 0.3, 0xefebe2, 0, A.fy + 2.4, -(H + 2.4)));
      const fk = grp(obox(1.6, 1.2, 2.2, 0xffb020, 0, 0.9, 0), obox(1.4, 1.0, 0.1, 0x23324d, 0, 1.9, 0.3), obox(0.1, 2.6, 0.1, 0x333333, -0.5, 1.6, 1.2), obox(0.1, 2.6, 0.1, 0x333333, 0.5, 1.6, 1.2), obox(1.2, 0.1, 1.0, 0x555555, 0, 0.4, 1.8));
      fk.position.set(H + 2.3, A.fy, 2); fk.rotation.y = -Math.PI / 2; g.add(fk);
    } else if (id === "kolam") {
      const water = new THREE.Mesh(new THREE.BoxGeometry(22, 0.6, 22), new THREE.MeshLambertMaterial({ color: 0x3fb6ff, transparent: true, opacity: 0.85 }));
      water.position.y = 0.1; g.add(water);
      [[0, 11.3, 23, 0.8], [0, -11.3, 23, 0.8], [11.3, 0, 0.8, 23], [-11.3, 0, 0.8, 23]].forEach(([x, z, w, d]) => g.add(obox(w, 0.7, d, 0xf2efe6, x, 0.35, z, 0.1)));
      const raft = grp(); const n = 9, wPl = (2 * H + 0.4) / n;
      for (let i = 0; i < n; i++) raft.add(obox(2 * H + 0.4, 0.4, wPl - 0.05, i % 2 ? 0xb5824a : 0xc8955a, 0, A.fy - 0.2, -H - 0.2 + (i + 0.5) * wPl, 0.06));
      g.add(raft);
      arenaAnims.push((dt, t) => { raft.position.y = Math.sin(t * 1.3) * 0.05; });
      const duck = grp(obox(1.2, 0.8, 1.6, 0xffdd33, 0, 0.6, 0), obox(0.8, 0.8, 0.8, 0xffdd33, 0, 1.3, 0.6), obox(0.4, 0.2, 0.4, 0xff8a1a, 0, 1.2, 1.1));
      duck.position.set(7.5, 0, 6); g.add(duck); arenaAnims.push((dt, t) => { duck.position.y = Math.sin(t * 2) * 0.1; duck.rotation.y = t * 0.3; });
      spots.push({ x: -(H - 0.5), z: -(H - 0.5), h: 1.4, name: "galon tumpuk" });
      g.add(obox(0.9, 1.4, 0.9, 0x5ab3ff, -(H - 0.5), A.fy + 0.7, -(H - 0.5)));
      const palm = (x, z) => { const p = grp(); for (let i = 0; i < 5; i++) p.add(obox(0.4, 0.8, 0.4, 0x9a6a3e, i * 0.08, 0.4 + i * 0.75, 0)); for (let k = 0; k < 5; k++) { const lp = new THREE.Group(); lp.add(box(2.2, 0.08, 0.5, 0x2ecc71, 1.1, 0, 0)); lp.position.y = 4; lp.rotation.set(0, (k / 5) * TAU, -0.4); p.add(lp); } p.position.set(x, 0.7, z); g.add(p); };
      palm(12.6, -12.6); palm(-12.6, 12.6);
    } else if (id === "warung") {
      g.add(obox(2 * H + 1, A.fy, 2 * H + 1, 0xd2b48c, 0, A.fy / 2, 0, 0.12));
      floor(floorTex("#e0c39a", "#c9a77a", 6), 2 * H + 1);
      const stall = grp(obox(8, 1.4, 1.4, 0x8b5a3c, 0, 0.7, 0), obox(7.6, 1.2, 1.2, 0xcfefff, 0, 2.0, 0));
      for (let i = 0; i < 6; i++) stall.add(obox(0.6, 0.25, 0.4, i % 2 ? 0xd98c2b : 0xe6a640, -2.5 + i, 2.0, 0));
      const awn = canvasTex(64, 16, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? "#ffffff" : "#2e9e5a"; x.fillRect(i * 8, 0, 8, 16); } });
      const aw = new THREE.Mesh(new THREE.BoxGeometry(9, 0.2, 2.4), new THREE.MeshLambertMaterial({ map: awn })); aw.position.set(0, 4.2, 0.4); aw.rotation.x = 0.25; stall.add(aw, obox(0.2, 4, 0.2, 0x555555, -4.3, 2, 1.3), obox(0.2, 4, 0.2, 0x555555, 4.3, 2, 1.3));
      const sign = signPlane("WARUNG HERI", "#ffcf3f", "#1d1530", 5, 1.2); sign.position.set(0, 5.4, -0.2); stall.add(sign);
      stall.position.set(0, A.fy, -(H + 1.6)); g.add(stall);
      [[-(H - 1.2), H - 1.2], [H - 1.2, -(H - 1.4)]].forEach(([x, z]) => {
        g.add(obox(1.8, 0.15, 1.8, 0xff4a4a, x, A.fy + 1.2, z), obox(0.15, 1.2, 0.15, 0xff4a4a, x, A.fy + 0.6, z));
        spots.push({ x, z, h: 1.3, name: "meja warung" });
      });
      for (let k = 0; k < 4; k++) { const gl = cyl(0.45, 1.1, 0x5ab3ff, 10); gl.position.set(H + 1.5, A.fy + 0.55, -3 + k); g.add(gl); }
    } else {
      g.add(obox(2 * H + 1, A.fy, 2 * H + 1, 0xbdbab3, 0, A.fy / 2, 0, 0.12));
      floor(floorTex("#c4c1ba", "#b1aea6", 6), 2 * H + 1);
      for (let k = -2; k <= 2; k++) g.add(box(0.2, 0.02, 3, 0xffffff, k * 2.6, A.fy + 0.03, -H + 1.6));
      const tr = grp(obox(2.6, 1.9, 1.9, 0xf4f6fa, 0, 1.5, 2.2), obox(2.8, 2.8, 4.2, 0xffffff, 0, 2.0, -1.0), obox(2.3, 0.7, 0.1, 0x23324d, 0, 1.95, 3.2));
      [-1.3, 1.3].forEach((x) => [2.2, -1.8].forEach((z) => { const w = cyl(0.55, 0.4, 0x1d1d24, 10); w.rotation.z = Math.PI / 2; w.position.set(x, 0.55, z); tr.add(w); }));
      tr.position.set(-(H - 1.6), A.fy, -(H - 2.4)); g.add(tr);
      spots.push({ x: -(H - 1.6), z: -(H - 2.0), h: 3.4, name: "atap mobil box" });
      const mpv = grp(obox(2.2, 1.1, 4.4, 0xc0c4cc, 0, 0.95, 0), obox(2.1, 1.0, 3.2, 0xc0c4cc, 0, 1.95, -0.3), obox(2.14, 0.5, 3.0, 0x23324d, 0, 2.0, -0.3));
      mpv.position.set(H + 2.5, A.fy, 3); g.add(mpv);
      for (let k = 0; k < 3; k++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8), M(0xff7a1a)); cone.position.set(H - 0.3, A.fy + 0.45, -2 + k * 1.6); g.add(cone); }
    }
    // tribun di dua sisi belakang
    const D = A.seatD;
    [[0, -1], [-1, 0]].forEach(([sx, sz]) => {
      for (let row = 0; row < 3; row++) {
        const d = D + row * 1.8, h = 0.4 + row * 0.85;
        const along = sx === 0 ? [1, 0] : [0, 1];
        g.add(obox(along[0] ? 2 * D : 1.6, h, along[1] ? 2 * D : 1.6, row % 2 ? 0x7a5ad0 : 0x9a7ae8, sx * d, h / 2, sz * d, 0.1));
        const n = Math.floor((2 * D - 2) / 1.8);
        for (let k = 0; k < n; k++) {
          const o = -D + 1.4 + k * 1.8;
          seats.push({ x: sx * d + along[0] * o, y: h, z: sz * d + along[1] * o, face: Math.atan2(-sx, -sz) });
        }
      }
    });
  }

  // ================= orang =================
  function boxHead(c, sc, outline = true) {
    const g = new THREE.Group();
    const w = 1.0 * sc, h = 1.15 * sc, d = 0.95 * sc;
    if (outline) { const o = new THREE.Mesh(BOXG, INKM); o.scale.set(w + 0.1, h + 0.1, d + 0.1); g.add(o); }
    const m = new THREE.Mesh(BOXG, headMaterials(c)); m.scale.set(w, h, d); g.add(m);
    return g;
  }
  function makePerson(c, opt = {}) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const shirt = opt.shirt != null ? opt.shirt : new THREE.Color(c.shirt).getHex();
    const pants = opt.pants != null ? opt.pants : 0x2b3350;
    const skin = new THREE.Color(c.skin).getHex();
    const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.24, 1.0, 0); p.add(obox(0.36, 1.0, 0.4, pants, 0, -0.5, 0, 0.07)); body.add(p); return p; });
    body.add(obox(1.0, 1.15, 0.6, shirt, 0, 1.6, 0, 0.08));
    if (opt.shorts != null) body.add(obox(1.04, 0.45, 0.64, opt.shorts, 0, 1.05, 0, 0.07));
    if (opt.bow) body.add(box(0.4, 0.15, 0.08, 0x1d1530, 0, 2.05, 0.33));
    const hs = opt.hs || 1;
    const head = boxHead(c, hs); head.position.y = 2.25 + 0.575 * hs; body.add(head);
    const arms = [-1, 1].map((s) => {
      const piv = new THREE.Group(); piv.position.set(s * 0.62, 2.0, 0);
      const arm = new THREE.Group(); piv.add(arm);
      const upper = obox(0.26, 0.26, 1, opt.gloves != null ? skin : shirt, 0, 0, 0.5, 0.06); arm.add(upper);
      const glove = obox(0.42, 0.42, 0.46, opt.gloves != null ? opt.gloves : skin, 0, 0, 1, 0.07); arm.add(glove);
      body.add(piv); return { piv, upper, glove, len: 0.8 };
    });
    const hold = new THREE.Group(); hold.position.set(0, 2.4, 0.8); body.add(hold);
    return { g, body, legs, arms, head, hold };
  }
  function makeFan(c) {
    const g = new THREE.Group();
    const shirt = new THREE.Color(c.shirt).getHex();
    g.add(box(0.9, 1.1, 0.6, shirt, 0, 0.75, 0));
    const head = boxHead(c, 0.85, false); head.position.y = 1.84; g.add(head);
    const arms = [-1, 1].map((s) => { const piv = new THREE.Group(); piv.position.set(s * 0.55, 1.2, 0); piv.add(box(0.22, 0.9, 0.24, shirt, 0, -0.4, 0)); g.add(piv); return { piv }; });
    return { g, arms, head };
  }
  function setArm(a, len) { a.len = len; a.upper.scale.z = len; a.upper.position.z = len / 2; a.glove.position.z = len; }

  // ================= barang & benda lempar =================
  function propMesh(kind) {
    if (kind === "cpu") return grp(obox(0.6, 1.0, 1.0, 0x222228, 0, 0.5, 0), box(0.2, 0.08, 0.04, 0x6fffa0, 0.1, 0.8, 0.52));
    if (kind === "monitor") return grp(obox(1.2, 0.8, 0.15, 0x1d2a44, 0, 0.75, 0), box(1.05, 0.65, 0.02, 0x6fb8ff, 0, 0.75, 0.08), obox(0.15, 0.35, 0.15, 0x333333, 0, 0.2, 0), obox(0.6, 0.06, 0.4, 0x333333, 0, 0.03, 0));
    if (kind === "printer") return grp(obox(1.1, 0.6, 0.9, 0xe9e9ee, 0, 0.3, 0), box(0.7, 0.05, 0.6, 0xffffff, 0, 0.64, -0.1));
    if (kind === "kursi") return grp(obox(0.9, 0.15, 0.9, 0x2b2b33, 0, 0.8, 0), obox(0.9, 0.9, 0.15, 0x2b2b33, 0, 1.3, -0.4), obox(0.1, 0.7, 0.1, 0x777777, 0, 0.4, 0), obox(0.9, 0.06, 0.1, 0x777777, 0, 0.05, 0), obox(0.1, 0.06, 0.9, 0x777777, 0, 0.05, 0));
    if (kind === "galon") { const m = cyl(0.42, 1.1, M(0x5ab3ff, { transparent: true, opacity: 0.85 })); m.position.y = 0.55; return grp(m, box(0.25, 0.2, 0.25, 0x1f6fd0, 0, 1.2, 0)); }
    if (kind === "palu") return grp(obox(0.14, 1.4, 0.14, 0x8b5a3c, 0, 0.7, 0), obox(0.7, 0.32, 0.32, 0x6b6f78, 0, 1.45, 0));
    if (kind === "kentongan") return grp(obox(0.22, 1.5, 0.22, 0x8b5a3c, 0, 0.75, 0), obox(0.3, 0.3, 0.3, 0x6b4428, 0, 1.4, 0));
    if (kind === "stempel") return grp(obox(0.9, 0.4, 0.9, 0xd62828, 0, 0.2, 0), obox(0.2, 0.7, 0.2, 0x8b5a3c, 0, 0.75, 0), obox(0.4, 0.3, 0.4, 0x8b5a3c, 0, 1.2, 0));
    return grp(obox(1.2, 0.08, 0.42, 0x3a3a44, 0, 0.05, 0), box(1.1, 0.03, 0.34, 0xc9c9d2, 0, 0.11, 0));
  }
  function throwMesh(obj) {
    if (obj === "bola") { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), M(0xffffff)); return grp(m, box(0.2, 0.2, 0.2, 0x1d1530, 0, 0.32, 0.25)); }
    if (obj === "sp") return grp(obox(0.9, 0.08, 1.2, 0xffffff), box(0.6, 0.02, 0.2, 0xd62828, 0, 0.06, -0.3), box(0.6, 0.02, 0.06, 0x1d1530, 0, 0.06, 0.1));
    if (obj === "tas") return grp(obox(1.0, 0.7, 0.35, 0x5a3a22), obox(0.5, 0.15, 0.1, 0x3a2412, 0, 0.45, 0));
    if (obj === "laptop") return grp(obox(1.0, 0.06, 0.7, 0x9aa1b0), obox(1.0, 0.7, 0.05, 0x9aa1b0, 0, 0.35, -0.35), box(0.9, 0.6, 0.02, 0x22ff88, 0, 0.35, -0.32));
    if (obj === "gorengan") return grp(...[0, 1, 2].map((k) => box(0.45, 0.2, 0.3, k === 1 ? 0xe6a640 : 0xd98c2b, k * 0.35 - 0.35, k * 0.1, 0)));
    if (obj === "kucing") return grp(obox(0.6, 0.5, 1.1, 0xff9f43, 0, 0.35, 0), obox(0.55, 0.5, 0.5, 0xff9f43, 0, 0.75, 0.6), box(0.14, 0.24, 0.14, 0xff9f43, -0.18, 1.08, 0.6), box(0.14, 0.24, 0.14, 0xff9f43, 0.18, 1.08, 0.6), box(0.12, 0.12, 0.7, 0xff9f43, 0, 0.7, -0.8));
    return grp(obox(1.0, 0.8, 0.8, 0xc8955a), box(1.02, 0.12, 0.25, 0xe8d2a8, 0, 0.34, 0));
  }
  function spawnProp(kind, x, z, fromSky) {
    const mesh = propMesh(kind);
    const p = { kind, mesh, x, z, y: fromSky ? 12 : 0, vy: 0, holder: null, claim: null, alive: true };
    mesh.position.set(x, A.fy + p.y, z); mesh.rotation.y = rand(0, TAU);
    world.add(mesh); S.props.push(p);
    return p;
  }

  // ================= partikel =================
  const PART_MAX = 200, parts = [], decals = [];
  for (let i = 0; i < PART_MAX; i++) { const m = new THREE.Mesh(BOXG, new THREE.MeshBasicMaterial({ color: 0xffffff })); m.visible = false; scene.add(m); parts.push({ m, life: 0 }); }
  let partIdx = 0;
  function emit(x, y, z, n, color, opt = {}) {
    for (let i = 0; i < n; i++) {
      const p = parts[partIdx = (partIdx + 1) % PART_MAX];
      p.m.visible = true; p.m.material.color.setHex(Array.isArray(color) ? pick(color) : color);
      const s = (opt.size || 0.16) * rand(0.6, 1.3); p.m.scale.set(s, s, s);
      p.m.position.set(x + rand(-0.2, 0.2), y + rand(-0.2, 0.2), z + rand(-0.2, 0.2));
      const sp = opt.speed || 4;
      p.vx = rand(-1, 1) * sp; p.vy = rand(0.4, 1.2) * sp * (opt.up || 1); p.vz = rand(-1, 1) * sp;
      p.life = opt.life || rand(0.6, 1.1); p.grav = opt.grav == null ? 18 : opt.grav; p.blood = !!opt.blood;
    }
  }
  const decalGeo = new THREE.CircleGeometry(1, 10), decalMat = new THREE.MeshBasicMaterial({ color: 0xb3121f, transparent: true, opacity: 0.85, depthWrite: false });
  function decal(x, z) {
    if (!S.blood) return;
    const m = new THREE.Mesh(decalGeo, decalMat); m.rotation.x = -Math.PI / 2; const s = rand(0.15, 0.4); m.scale.set(s, s, 1);
    m.position.set(x, A.fy + 0.03, z); world.add(m); decals.push(m);
    if (decals.length > 80) world.remove(decals.shift());
  }
  function bleed(f, amount) {
    if (!S.blood) return;
    emit(f.x, A.fy + f.y + 3.0, f.z, Math.round(amount), [0xd0121f, 0xa80d18, 0xff2a3a], { speed: 3.2, blood: true, size: 0.14 });
  }
  function updateParts(dt) {
    parts.forEach((p) => {
      if (p.life <= 0) return;
      p.life -= dt; p.vy -= p.grav * dt;
      const m = p.m.position; m.x += p.vx * dt; m.y += p.vy * dt; m.z += p.vz * dt;
      p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6;
      const floorY = A.fy + 0.05;
      if (m.y < floorY && Math.abs(m.x) < A.half + 0.6 && Math.abs(m.z) < A.half + 0.6) {
        if (p.blood) { decal(m.x, m.z); p.life = 0; }
        else { m.y = floorY; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      }
      if (p.life <= 0 || m.y < -6) { p.life = 0; p.m.visible = false; }
    });
  }

  // ================= state =================
  const S = {
    phase: "menu", mode: "duel", speed: 1, rounds: store.get("rk_rounds", 3), px: store.get("rk_px", 2),
    blood: store.get("rk_blood", true), cine: store.get("rk_cine", true),
    f: [], ref: null, refC: null, crowdP: [], props: [], projs: [], round: 1, clock: 60, restT: 0, timers: [], fx: [],
    cards: [[0, 0], [0, 0], [0, 0]], bets: [], hype: 0, lastFeed: -9, result: null, tour: null, paused: false, elim: [],
    yaw: Math.PI / 4, pitch: 0.62, zoom: 8.5, zoomEff: 8.5, follow: true, run: 0, gt: 0, shake: 0, slowT: 0, cineT: 0, cineX: 0, cineZ: 0, propT: 6,
  };
  const ROUND_LEN = 60, FFA_LEN = 150;
  const ffa = () => S.mode === "ffa";
  const later = (sec, fn) => S.timers.push({ t: sec, fn, run: S.run });
  const wallet = () => store.get("rk_wallet", {});
  const getPts = (id) => { const w = wallet(); return w[id] == null ? 1000 : w[id]; };
  const setPts = (id, v) => { const w = wallet(); w[id] = Math.max(0, Math.round(v)); store.set("rk_wallet", w); };
  function oddsFor(list) {
    const ws = list.map((c) => Math.exp(statsOf(c).rating / 3.4)), tot = ws.reduce((a, b) => a + b, 0);
    return ws.map((w) => Math.round(clamp(0.93 / (w / tot), 1.1, 25) * 20) / 20);
  }

  function makeFighter(c, i) {
    const st = statsOf(c), color = TEAM[i % TEAM.length];
    const m = makePerson(c, { shorts: color, gloves: color, pants: 0x1d1d24, hs: 1.15 });
    const tag = textSprite(c.name, hex(color), 2.6); tag.position.y = 4.5; m.g.add(tag);
    const stars = textSprite("@ @", "#ffcf3f", 1.6); stars.position.y = 4.0; stars.visible = false; m.g.add(stars);
    world.add(m.g);
    return {
      c, st, i, color, m, tag, stars, sig: sigOf(c), sigCharge: rand(0, 30), x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, a: 0, hp: 100, sta: 100, plan: "auto",
      state: "free", t: 0, act: null, think: rand(0.3, 0.8), react: 0, reactKind: "", target: null, prop: null, grab: null, spot: null, stunT: 0,
      kdRound: 0, kdTotal: 0, landed: 0, thrown: 0, roundDmg: 0, roundLand: 0, downT: 0, count: 0, counting: false, circle: rand(-1, 1), elimT: 0, gone: false, airDmg: 0, by: null,
    };
  }
  const isUp = (f) => !f.gone && f.state !== "ko";
  const canBeHit = (f) => ["free", "punch", "swing", "fetch", "climbTo", "stun"].includes(f.state);
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const other = (f) => S.f.find((o) => o !== f);
  function chooseTarget(f) {
    const es = S.f.filter((o) => o !== f && isUp(o) && !["air", "swim"].includes(o.state));
    if (!es.length) return null;
    if (!ffa()) return es[0];
    if (f.target && es.includes(f.target) && Math.random() > 0.12) return f.target;
    // tawuran: cari lawan yang belum dikeroyok, biar menyebar jadi duel-duel kecil
    const busy = (o) => S.f.filter((x) => x !== f && x.target === o && isUp(x)).length;
    const score = (o) => dist(f, o) + busy(o) * 4 + (Math.random() < 0.3 ? -o.hp * 0.03 : 0) + rand(0, 2);
    return es.reduce((a, b) => (score(b) < score(a) ? b : a));
  }

  // ================= komentator & efek =================
  function feed(text, big) {
    const el = $("feed");
    [...el.children].forEach((c) => c.classList.add("old"));
    const d = document.createElement("div"); if (big) d.className = "big"; d.textContent = text; el.appendChild(d);
    while (el.children.length > 3) el.firstChild.remove();
    S.lastFeed = S.gt;
  }
  const L = {
    jab: ["{a} jab cepat ke muka {b}.", "Jab {a} masuk lagi."],
    straight: ["Straight kanan {a} kena!", "{a} lepas pukulan lurus, masuk!"],
    hook: ["HOOK KERAS dari {a}! {b} goyang!", "Hook {a} mendarat di pipi {b}!"],
    uppercut: ["UPPERCUT! Dagu {b} terangkat!", "{a} selipkan uppercut, ngeri!"],
    "pukulan badan": ["{a} hajar perut {b}.", "Pukulan badan dari {a}, {b} meringis."],
    block: ["{b} tangkis dengan rapi.", "Pertahanan {b} rapat."],
    dodge: ["{b} menghindar, lincah juga!", "Meleset! {b} geser kepala."],
    counter: ["Serangan balik {b}!", "{b} langsung balas!"],
    slam: ["{a} angkat {b} lalu BANTING ke lantai!", "BANTINGAN KERAS! {b} remuk!"],
    suplex: ["SUPLEX! {a} lempar {b} lewat kepala!", "{a} kasih suplex ala smackdown!"],
    throw: ["{a} lempar {b} kayak karung beras!", "{b} DILEMPAR jauh oleh {a}!"],
    prop: ["{a} HANTAM {b} PAKAI {p}!", "{p} melayang ke kepala {b}! Ulah {a}!"],
    dive: ["{a} lompat dari {s}! SMACKDOWN!", "ELBOW DROP dari {s}! {b} gepeng!"],
    pickup: ["{a} ambil {p}! Bahaya nih!", "{a} angkat {p}, penonton teriak!"],
    tired: ["{a} mulai ngos-ngosan…", "Napas {a} sudah berat."],
  };
  const say = (k, a, b, extra = {}) => pick(L[k]).replace(/\{a\}/g, a.c.name).replace(/\{b\}/g, b ? b.c.name : "").replace(/\{p\}/g, extra.p || "").replace(/\{s\}/g, extra.s || "");
  function announce(html, sec = 1.2) {
    document.querySelectorAll(".announce").forEach((e) => e.remove());
    const el = document.createElement("div"); el.className = "announce"; el.innerHTML = html; document.body.appendChild(el);
    setTimeout(() => el.remove(), sec * 1000);
  }
  function popText(x, y, z, text, color, size = 2.4) {
    const s = textSprite(text, color, size); s.position.set(x, y, z); world.add(s);
    S.fx.push({ o: s, t: 0, dur: 0.9 });
  }
  function flash() { const f = $("flash"); f.classList.add("on"); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove("on"))); }
  function cine(x, z, label) {
    S.hype = 1; sfx.crowd(0.1, 1.8);
    if (label) popText(x, A.fy + 6, z, label, "#ffcf3f", 3.6);
    if (!S.cine) return;
    S.cineT = 1.3; S.cineX = x; S.cineZ = z; S.slowT = 0.55; flash();
  }

  // ================= kerusakan =================
  function damage(o, dmg, by, opt = {}) {
    if (!isUp(o) || o.state === "swim") return;
    if (!ffa() && opt.big) dmg *= 0.5;          // duel lebih panjang: bantingan & senjata tidak langsung KO
    o.hp -= dmg; S.hype = Math.min(1, S.hype + dmg / 16);
    o.sigCharge = Math.min(100, o.sigCharge + dmg * 2);
    if (by) { by.roundDmg += dmg; by.roundLand++; by.landed++; by.sigCharge = Math.min(100, by.sigCharge + dmg * 3.5); }
    if (dmg >= 5) bleed(o, dmg * (opt.big ? 1.6 : 0.9));
    if (opt.big) S.shake = Math.max(S.shake, 0.5);
    if (o.hp <= 0) {
      o.hp = 0;
      if (ffa()) eliminate(o, by, opt.reason || "TUMBANG");
      else knockdown(o, by);
    }
  }
  function dropProp(f) {
    const p = f.prop; if (!p) return;
    f.prop = null; p.holder = null; p.claim = null;
    f.m.hold.remove(p.mesh);
    if (p.sig) return;                       // senjata pribadi hilang kalau terlepas
    world.add(p.mesh);
    p.x = clamp(f.x + rand(-0.5, 0.5), -A.half, A.half); p.z = clamp(f.z + rand(-0.5, 0.5), -A.half, A.half); p.y = 0;
    p.mesh.position.set(p.x, A.fy, p.z); p.mesh.rotation.set(0, rand(0, TAU), 0); p.mesh.scale.setScalar(1);
  }
  function breakProp(p, x, y, z) {
    p.alive = false;
    if (p.holder) { p.holder.m.hold.remove(p.mesh); p.holder.prop = null; }
    if (p.mesh.parent) p.mesh.parent.remove(p.mesh);
    S.props = S.props.filter((q) => q !== p);
    emit(x, y, z, 22, [PROPS[p.kind].color, 0x9aa1b0, 0xffffff], { speed: 5, size: 0.22 });
    sfx.crash();
  }
  function knockdown(f, by) {
    if (f.grab) releaseGrab(f);
    f.state = "down"; f.counting = true; f.act = null; dropProp(f); f.stars.visible = false;
    f.kdRound++; f.kdTotal++; f.count = 0; f.downT = 0;
    S.shake = 0.5; sfx.crowd(0.1, 2.2);
    announce(`<small>${f.c.name}</small>JATUH!`, 1.2);
    feed(`${f.c.name} JATUH! Wasit ${S.refC.name} mulai menghitung!`, true);
    if (f.kdRound >= 3) { f.count = 10; S.phase = "end"; later(1.2, () => endFight(by || other(f), "TKO", `${f.c.name} jatuh 3 kali dalam satu ronde`)); }
  }
  function releaseGrab(f) {
    const g = f.grab; f.grab = null;
    if (g && g.o && g.o.state === "grabbed") { g.o.state = "down"; g.o.downT = 0.8; g.o.y = 0; }
    if (g && g.coil && g.coil.parent) g.coil.parent.remove(g.coil);
  }
  function eliminate(f, by, reason) {
    if (f.state === "ko") return;
    dropProp(f);
    if (f.grab) releaseGrab(f);
    f.state = "ko"; f.elimT = 0; f.act = null; f.y = 0;
    S.elim.push(f);
    announce(`<small>${f.c.name}</small>${reason}!`, 1.3);
    feed(`${f.c.name} ${reason.toLowerCase()}${by ? ` oleh ${by.c.name}` : ""}! Sisa ${S.f.filter(isUp).length} orang.`, true);
    cine(f.x, f.z, reason);
    const left = S.f.filter(isUp);
    if (left.length <= 1 && S.phase === "fight") {
      S.phase = "end";
      later(2.2, () => endFight(left[0] || by, "Tawuran", left[0] ? "Orang terakhir yang masih berdiri" : ""));
    }
  }
  function outOfArena(f) {
    if (A.edge === "water") {
      sfx.splash(); emit(f.x, 0.4, f.z, 26, [0xffffff, 0x9fe0ff, 0x3fb6ff], { speed: 4, up: 1.6, size: 0.2 });
      if (ffa()) { eliminate(f, f.by, "KECEBUR"); f.gone = true; f.m.g.visible = false; }
      else {
        f.state = "swim"; f.t = 0; f.m.g.visible = false; feed(`${f.c.name} KECEBUR ke kolam! 💦`, true); cine(f.x, f.z, "BYURR!");
        f.hp = Math.max(1, f.hp - 8);
      }
    } else {
      sfx.slam(); emit(f.x, 0.2, f.z, 14, [0xcfc8b8, 0xffffff], { speed: 3, size: 0.2 });
      eliminate(f, f.by, "TERLEMPAR KELUAR");
    }
  }

  // ================= kecerdasan =================
  const planOf = (f) => {
    if (ffa()) return "auto";
    if (f.plan !== "auto") return f.plan;
    const o = other(f);
    if (f.sta < 30) return "bertahan";
    if (o && f.hp < o.hp - 25) return "serang";
    if (o && o.sta < 35) return "serang";
    return f.st.speed >= 7 ? "balas" : "auto";
  };
  function startPunch(f, k) {
    const mv = MOVES[k], slow = f.sta < 30 ? 1.35 : 1;
    f.act = { k, mv, t: 0, wind: mv.wind * slow * (1.25 - f.st.speed * 0.04), resolved: false };
    f.state = "punch"; f.thrown++; f.sta = Math.max(0, f.sta - mv.cost * (1.2 - f.st.stamina * 0.04));
  }
  function decide(f) {
    f.target = chooseTarget(f);
    const o = f.target; if (!o) return;
    const d = dist(f, o), plan = planOf(f), P = PLANS[plan];
    f.think = rand(0.22, 0.55) * (1.3 - f.st.speed * 0.05) * (f.sta < 30 ? 1.4 : 1);
    if (o.state === "down" && !ffa()) return;
    if (f.sigCharge >= 100 && trySignature(f, o, d)) return;
    if (f.prop) { if (d < 2.4 && canBeHit(o)) { f.state = "swing"; f.t = 0; f.swung = false; } return; }
    const free = S.props.filter((p) => !p.holder && !p.claim && p.y <= 0.01);
    if (free.length && Math.random() < 0.18) {
      const p = free.reduce((a, b) => (Math.hypot(b.x - f.x, b.z - f.z) < Math.hypot(a.x - f.x, a.z - f.z) ? b : a));
      if (Math.hypot(p.x - f.x, p.z - f.z) < 5.5) { p.claim = f; f.state = "fetch"; f.wantProp = p; f.t = 0; return; }
    }
    if (spots.length && f.sta > 40 && Math.random() < 0.035) {
      const s = spots.reduce((a, b) => (Math.hypot(b.x - f.x, b.z - f.z) < Math.hypot(a.x - f.x, a.z - f.z) ? b : a));
      if (Math.hypot(s.x - f.x, s.z - f.z) < 7 && Math.hypot(s.x - o.x, s.z - o.z) < 7) { f.state = "climbTo"; f.spot = s; f.t = 0; return; }
    }
    if (d > 2.5 || f.sta < 8) return;
    if (d < 1.6 && canBeHit(o) && f.sta > 20 && Math.random() < (ffa() ? 0.32 : 0.22)) {
      const ok = Math.random() < clamp(0.5 + (f.st.power - o.st.speed) * 0.05 + (o.sta < 30 ? 0.15 : 0), 0.2, 0.85);
      if (ok) { startGrab(f, o); return; }
      feed(`${o.c.name} lepas dari pegangan ${f.c.name}!`);
      return;
    }
    if (Math.random() > P.rate) return;
    const w = { jab: 4, cross: 3, hook: 2, upper: 1, body: 2 };
    if (plan === "serang") { w.hook = 3.5; w.upper = 2; }
    if (plan === "badan") { w.body = 7; w.hook = 1; }
    if (plan === "balas") { w.cross = 5; w.jab = 2; }
    if (d > 2.0) { w.hook = 0.3; w.upper = 0; }
    if (d < 1.6) { w.jab = 1; w.upper += 2; w.body += 1; }
    startPunch(f, wpick(w));
  }
  function startGrab(f, o) {
    dropProp(o);
    const nearEdge = Math.max(Math.abs(o.x), Math.abs(o.z)) > A.half - 2;
    const canOut = A.edge === "water" || (ffa() && A.edge === "ropes");
    const kind = wpick({ slam: 3, suplex: 2.5, throw: canOut && nearEdge ? 6 : 2.5 });
    f.state = "grab"; f.t = 0; f.grab = { o, kind, done: false };
    o.state = "grabbed"; o.act = null; o.stars.visible = false;
    f.sta = Math.max(0, f.sta - 10);
  }
  // ---------- jurus khas ----------
  function trySignature(f, o, d) {
    const s = f.sig;
    if (s.sig === "weapon") {
      if (f.prop) return false;
      const mesh = propMesh(s.obj);
      const p = { kind: PROPS[s.obj] ? s.obj : "monitor", mesh, holder: f, alive: true, sig: true };
      f.prop = p; f.m.hold.add(mesh); mesh.scale.setScalar(0.9);
    } else if (s.sig === "throw" || s.sig === "cat") {
      if (d > 9 || !canBeHit(o)) return false;
      const mesh = throwMesh(s.sig === "cat" ? "kucing" : s.obj);
      mesh.position.set(f.x, A.fy + 2.4, f.z); world.add(mesh);
      S.projs.push({ owner: f, target: o, mesh, sx: f.x, sz: f.z, t: 0, T: s.sig === "cat" ? 0.75 : 0.6, kind: s.sig, stun: !!s.stun, name: s.name });
      if (s.sig === "cat") sfx.meow();
    } else if (s.sig === "choke") {
      if (d > 1.8 || !canBeHit(o)) return false;
      dropProp(o);
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 6, 14), M(s.obj === "mouse" ? 0x1d1d24 : 0x2a7de1));
      coil.rotation.x = Math.PI / 2; coil.position.y = 2.25; o.m.body.add(coil);
      f.state = "grab"; f.t = 0; f.grab = { o, kind: "choke", done: false, coil, tick: 0 };
      o.state = "grabbed"; o.act = null;
    } else return false;
    f.sigCharge = 0;
    sfx.special();
    announce(`<small>⭐ ${f.c.name}</small>${s.name}!`, 1.3);
    feed(`⭐ ${f.c.name} keluarkan jurus: ${s.name}!`, true);
    popText(f.x, A.fy + 5.4, f.z, "JURUS!", hex(f.color), 2.8);
    return true;
  }
  function stepProjs(dt) {
    S.projs = S.projs.filter((p) => {
      p.t += dt;
      const o = p.target, k = clamp(p.t / p.T, 0, 1);
      const tx = o.x, tz = o.z;
      p.mesh.position.set(lerp(p.sx, tx, k), A.fy + lerp(2.4, 1.6, k) + Math.sin(Math.PI * k) * (p.kind === "cat" ? 2.2 : 1.4), lerp(p.sz, tz, k));
      if (p.kind !== "cat") { p.mesh.rotation.x += dt * 10; p.mesh.rotation.y += dt * 7; } else p.mesh.rotation.y = Math.atan2(tx - p.sx, tz - p.sz);
      if (k < 1) return true;
      world.remove(p.mesh);
      if (!isUp(o) || !canBeHit(o) || dist(o, { x: tx, z: tz }) > 1.8) { popText(tx, A.fy + 3, tz, "MELESET!", "#cccccc"); return false; }
      const f = p.owner;
      if (p.kind === "cat") {
        sfx.meow(); emit(o.x, A.fy + 2.8, o.z, 16, [0xff9f43, 0xffd29a], { speed: 3, size: 0.15 });
        cine(o.x, o.z, "CAKAR KUCING!");
        feed(`Kucing ${f.c.name} loncat ke muka ${o.c.name}! Cakar-cakar! 🐈`, true);
        damage(o, 12, f, { big: true });
        if (isUp(o)) { o.state = "stun"; o.stunT = 1.4; o.t = 0; }
      } else {
        sfx.heavy(); cine(o.x, o.z, p.stun ? "PUSING!" : "KENA!");
        feed(`${p.name} dari ${f.c.name} mendarat di ${o.c.name}!`, true);
        damage(o, p.stun ? 8 : 13, f, { big: true });
        if (isUp(o) && !(o.state === "down" && o.counting)) { if (p.stun) { o.state = "stun"; o.stunT = 1.8; o.t = 0; } else { o.state = "down"; o.downT = 1.0; } }
      }
      return false;
    });
  }

  // ================= pukulan biasa =================
  function resolve(f) {
    const o = f.target, mv = f.act.mv;
    if (!o || !canBeHit(o)) { sfx.whiff(); return; }
    const d = dist(f, o), ang = wrapA(Math.atan2(o.x - f.x, o.z - f.z) - f.a);
    if (d > mv.range + 0.25 || Math.abs(ang) > 0.9) { sfx.whiff(); return; }
    const oplan = planOf(o), busy = o.state !== "free";
    let dodge = busy ? 0 : 0.04 + o.st.speed * 0.022 + (oplan === "balas" ? 0.08 : 0);
    let block = busy ? 0 : 0.14 + (oplan === "bertahan" ? 0.28 : 0) + (o.sta > 50 ? 0.05 : 0);
    if (mv.target === "body") block *= 0.5;
    if (ffa()) { dodge *= 0.7; block *= 0.6; }
    const r = Math.random();
    if (r < dodge) {
      o.react = 0.25; o.reactKind = "dodge"; sfx.whiff();
      if (S.gt - S.lastFeed > 2.5 && Math.random() < 0.4) feed(say("dodge", f, o));
      if (oplan === "balas" && Math.random() < 0.6 && o.state === "free" && o.sta > 10) { o.target = f; startPunch(o, Math.random() < 0.6 ? "cross" : "hook"); if (Math.random() < 0.5) feed(say("counter", f, o)); }
      return;
    }
    if (r < dodge + block) {
      o.react = 0.18; o.reactKind = "block"; o.sta = Math.max(0, o.sta - 1.5); sfx.block();
      if (S.gt - S.lastFeed > 3 && Math.random() < 0.25) feed(say("block", f, o));
      return;
    }
    let dmg = 0.7 * mv.dmg * (0.7 + f.st.power * 0.06) * (f.sta < 30 ? 0.7 : 1) * (1.15 - o.st.chin * 0.03) * rand(0.85, 1.15);
    if (busy) dmg *= 1.25;
    if (mv.target === "body") { o.sta = Math.max(0, o.sta - mv.sdmg); dmg *= 0.6; }
    o.react = 0.3; o.reactKind = mv.target === "body" ? "body" : "head";
    const pa = Math.atan2(o.x - f.x, o.z - f.z), push = 0.25 + dmg * 0.03;
    o.x += Math.sin(pa) * push; o.z += Math.cos(pa) * push;
    const big = dmg >= 6;
    if (big) { sfx.heavy(); sfx.crowd(0.06, 1.1); S.shake = Math.max(S.shake, 0.25); popText(o.x, A.fy + 5.2, o.z, pick(["BAK!", "DUG!", "POW!"]), "#ffcf3f"); }
    else sfx.jab();
    if (big || S.gt - S.lastFeed > 2.2) feed(say(mv.name, f, o), big);
    damage(o, dmg, f);
    if (!ffa() && isUp(o) && o.state !== "down" && mv.target === "head" && dmg >= 5 && o.hp < 22 && Math.random() < 0.18 * (dmg / 5)) knockdown(o, f);
  }

  // ================= update per petinju =================
  function walkToward(f, tx, tz, want, spd, dt, strafe) {
    const d = Math.hypot(tx - f.x, tz - f.z) || 0.01, ang = Math.atan2(tx - f.x, tz - f.z);
    const fwd = clamp((d - want) * 2, -1, 1);
    if (strafe) { f.circle += rand(-0.6, 0.6) * dt; f.circle = clamp(f.circle, -1, 1); }
    const c = strafe ? f.circle * 0.45 : 0;
    f.x += (Math.sin(ang) * fwd + Math.cos(ang) * c) * spd * dt;
    f.z += (Math.cos(ang) * fwd - Math.sin(ang) * c) * spd * dt;
    f.a = ang;
    const lim = A.half - (A.edge === "water" ? 0.5 : 0.2);
    f.x = clamp(f.x, -lim, lim); f.z = clamp(f.z, -lim, lim);
    return d;
  }
  const speedOf = (f) => (1.3 + f.st.speed * 0.18) * (f.sta < 30 ? 0.7 : 1);
  function stepFighter(f, dt) {
    if (f.gone) return;
    f.t += dt;
    if (f.react > 0) f.react -= dt;
    if (f.state === "ko") { f.elimT += dt; if (f.elimT > 3) { f.gone = true; f.m.g.visible = false; } return; }
    if (f.state !== "punch" && f.state !== "grab") f.sta = Math.min(100, f.sta + (2.5 + f.st.stamina * 0.45) * dt);
    const fight = S.phase === "fight";
    switch (f.state) {
      case "free": {
        if (!fight) break;
        f.sigCharge = Math.min(100, f.sigCharge + dt * 2.5);
        const o = f.target && isUp(f.target) ? f.target : chooseTarget(f);
        f.target = o;
        if (o) {
          let want = f.prop ? 1.8 : PLANS[planOf(f)].dist;
          if (!ffa() && o.state === "down") want = 5;
          walkToward(f, o.x, o.z, want, speedOf(f) * (f.prop ? 0.85 : 1), dt, true);
        }
        f.think -= dt; if (f.think <= 0) decide(f);
        if (f.sta < 25 && Math.random() < dt * 0.05 && S.gt - S.lastFeed > 4) feed(say("tired", f));
        break;
      }
      case "punch": {
        const a = f.act; a.t += dt;
        if (f.target) walkToward(f, f.target.x, f.target.z, 1.6, speedOf(f) * 0.3, dt, false);
        if (!a.resolved && a.t >= a.wind) { a.resolved = true; resolve(f); }
        if (f.state === "punch" && a.t >= a.wind + a.mv.act + a.mv.rec) { f.state = "free"; f.act = null; }
        break;
      }
      case "stun": {
        f.stunT -= dt; f.a += dt * 3;
        if (f.stunT <= 0) { f.state = "free"; f.think = 0.3; }
        break;
      }
      case "fetch": {
        const p = f.wantProp;
        if (!p || !p.alive || p.holder) { f.state = "free"; if (p && p.claim === f) p.claim = null; break; }
        const d = walkToward(f, p.x, p.z, 0, speedOf(f) * 1.1, dt, false);
        if (d < 0.8) {
          p.holder = f; p.claim = null; f.prop = p; f.wantProp = null;
          world.remove(p.mesh); f.m.hold.add(p.mesh); p.mesh.position.set(0, 0, 0); p.mesh.rotation.set(0, 0, 0); p.mesh.scale.setScalar(0.85);
          feed(say("pickup", f, null, { p: PROPS[p.kind].name }));
          f.state = "free"; f.think = 0.2;
        } else if (f.t > 4) { f.state = "free"; p.claim = null; }
        break;
      }
      case "swing": {
        const o = f.target;
        if (o) f.a = Math.atan2(o.x - f.x, o.z - f.z);
        if (f.t >= 0.42 && !f.swung) {
          f.swung = true;
          const p = f.prop;
          if (p && o && canBeHit(o) && dist(f, o) < 2.7) {
            const dmg = PROPS[p.kind].dmg * (0.8 + f.st.power * 0.04);
            o.react = 0.4; o.reactKind = "head";
            const pa = Math.atan2(o.x - f.x, o.z - f.z); o.x += Math.sin(pa) * 0.8; o.z += Math.cos(pa) * 0.8;
            feed(say("prop", f, o, { p: PROPS[p.kind].name.toUpperCase() }), true);
            breakProp(p, o.x, A.fy + 3, o.z);
            cine(o.x, o.z, `PAKAI ${PROPS[p.kind].name.toUpperCase()}!`);
            damage(o, dmg, f, { big: true });
            if (isUp(o) && o.state !== "down") { o.state = "down"; o.downT = 1.0; }
          } else sfx.whiff();
        }
        if (f.t >= 0.85) { f.state = "free"; f.swung = false; }
        break;
      }
      case "climbTo": {
        const s = f.spot;
        const d = walkToward(f, s.x, s.z, 0, speedOf(f), dt, false);
        if (d < 0.5) { f.state = "perch"; f.t = 0; f.x = s.x; f.z = s.z; }
        else if (f.t > 4) f.state = "free";
        break;
      }
      case "perch": {
        const s = f.spot;
        f.y = lerp(0, s.h, clamp(f.t / 0.35, 0, 1));
        const o = chooseTarget(f); f.target = o;
        if (o) f.a = Math.atan2(o.x - f.x, o.z - f.z);
        if (f.t >= 0.6) {
          f.state = "air"; f.airDmg = 0;
          if (!o) { f.vx = 0; f.vz = 0; f.vy = 2; f.diving = false; break; }
          const T = 0.7;
          f.vx = (o.x - f.x) / T; f.vz = (o.z - f.z) / T; f.vy = (0 - s.h) / T + 0.5 * 22 * T;
          f.diving = true; f.diveTarget = o;
          feed(say("dive", f, o, { s: s.name }), true);
        }
        break;
      }
      case "grab": stepGrab(f, dt); break;
      case "air": stepAir(f, dt); break;
      case "down": {
        f.y = 0;
        if (f.counting) { updateCount(f, dt); break; }
        f.downT -= dt;
        if (f.downT <= 0 && f.hp > 0) { f.state = "free"; f.think = 0.5; }
        break;
      }
      case "swim": {
        if (f.t > 1.8) {
          f.m.g.visible = true;
          const lim = A.half - 0.6;
          f.x = clamp(f.x, -lim, lim); f.z = clamp(f.z, -lim, lim); f.y = 0;
          f.state = "free";
          feed(`${f.c.name} naik lagi ke rakit, basah kuyup! 😂`);
        }
        break;
      }
      default: break;
    }
  }
  function stepGrab(f, dt) {
    const G = f.grab, o = G && G.o;
    if (!o || !isUp(o) || o.state !== "grabbed") { if (G) releaseGrab(f); f.state = "free"; return; }
    const fx = Math.sin(f.a), fz = Math.cos(f.a), t = f.t, lim = A.half;
    const place = (off, y) => { o.x = f.x + fx * off; o.z = f.z + fz * off; o.y = y; o.a = f.a + Math.PI; };
    if (G.kind === "slam") {
      if (t < 0.5) place(0.9, 3.2 * (t / 0.5));
      else if (t < 0.62) place(0.9, 3.2 * (1 - (t - 0.5) / 0.12));
      else if (!G.done) {
        G.done = true; place(1.0, 0); o.x = clamp(o.x, -lim, lim); o.z = clamp(o.z, -lim, lim);
        sfx.slam(); emit(o.x, A.fy + 0.2, o.z, 12, [0xcfc8b8, 0xffffff], { speed: 3, size: 0.2 });
        feed(say("slam", f, o), true); cine(o.x, o.z, "BANTING!");
        o.state = "down"; o.downT = 1.3; o.y = 0; f.grab = null;
        damage(o, 13 * (0.8 + f.st.power * 0.04), f, { big: true });
      }
      if (t >= 1.0) { f.state = "free"; f.grab = null; f.think = 0.4; }
    } else if (G.kind === "suplex") {
      if (t < 0.7) { const th = Math.PI * (t / 0.7); place(0.9 * Math.cos(th), 2.6 * Math.sin(th)); }
      else if (!G.done) {
        G.done = true; place(-1.0, 0); o.x = clamp(o.x, -lim, lim); o.z = clamp(o.z, -lim, lim);
        sfx.slam(); emit(o.x, A.fy + 0.2, o.z, 12, [0xcfc8b8, 0xffffff], { speed: 3, size: 0.2 });
        feed(say("suplex", f, o), true); cine(o.x, o.z, "SUPLEX!");
        o.state = "down"; o.downT = 1.4; o.y = 0; f.grab = null;
        damage(o, 15 * (0.8 + f.st.power * 0.04), f, { big: true });
      }
      if (t >= 1.15) { f.state = "free"; f.grab = null; f.think = 0.5; }
    } else if (G.kind === "choke") {
      place(0.75, 0);
      G.tick += dt;
      if (G.tick >= 0.3) { G.tick = 0; damage(o, 2.6, f); emit(o.x, A.fy + 2.4, o.z, 3, 0xffffff, { speed: 1.5, size: 0.1 }); }
      if (t > 0.05 && !G.said) { G.said = true; cine(o.x, o.z, "DILILIT!"); feed(`${f.c.name} lilit leher ${o.c.name} pakai ${f.sig.obj === "mouse" ? "kabel mouse" : "kabel LAN"}! 😵`, true); }
      if (t >= 1.6 || !isUp(o)) { releaseGrab(f); f.state = "free"; f.think = 0.4; }
    } else {
      if (t < 0.3) place(0.9, 1.0 + t);
      else if (!G.done) {
        G.done = true;
        const pw = 9 + f.st.power * 0.6;
        o.state = "air"; o.vx = fx * pw; o.vz = fz * pw; o.vy = 6; o.y = 1.3; o.airDmg = 9 * (0.8 + f.st.power * 0.04); o.by = f; o.diving = false;
        f.grab = null;
        feed(say("throw", f, o), true); sfx.whiff();
      }
      if (t >= 0.6) { f.state = "free"; f.grab = null; f.think = 0.4; }
    }
  }
  function stepAir(f, dt) {
    f.vy -= 22 * dt;
    f.x += f.vx * dt; f.z += f.vz * dt; f.y += f.vy * dt;
    const H = A.half;
    const outside = Math.abs(f.x) > H + 0.3 || Math.abs(f.z) > H + 0.3;
    const canFlyOut = A.edge === "water" || (A.edge === "ropes" && ffa() && f.y > 1.0);
    if (!canFlyOut) {
      if (Math.abs(f.x) > H) { f.x = Math.sign(f.x) * H; f.vx *= -0.4; }
      if (Math.abs(f.z) > H) { f.z = Math.sign(f.z) * H; f.vz *= -0.4; }
    }
    const nowOut = Math.abs(f.x) > H + 0.3 || Math.abs(f.z) > H + 0.3;
    const ground = nowOut ? (A.edge === "water" ? 0.25 - A.fy : -A.fy) : 0;
    if (f.y > ground) return;
    f.y = 0;
    if (nowOut && canFlyOut) { f.x = clamp(f.x, -H - 2.5, H + 2.5); f.z = clamp(f.z, -H - 2.5, H + 2.5); outOfArena(f); return; }
    f.x = clamp(f.x, -H, H); f.z = clamp(f.z, -H, H);
    if (f.diving) {
      const o = f.diveTarget; f.diving = false;
      if (o && canBeHit(o) && dist(f, o) < 1.8) {
        sfx.slam(); cine(o.x, o.z, "SMACKDOWN!");
        damage(o, 18 * (0.8 + f.st.power * 0.04), f, { big: true });
        if (isUp(o) && !(o.state === "down" && o.counting)) { o.state = "down"; o.downT = 1.4; }
        if (isUp(f)) { f.state = "down"; f.downT = 0.6; }
      } else {
        popText(f.x, A.fy + 4, f.z, "MELESET!", "#cccccc"); sfx.slam();
        if (isUp(f)) { f.state = "down"; f.downT = 1.0; }
        damage(f, 5, null);
      }
      return;
    }
    sfx.slam(); emit(f.x, A.fy + 0.2, f.z, 10, [0xcfc8b8, 0xffffff], { speed: 3, size: 0.2 });
    if (isUp(f)) { f.state = "down"; f.downT = 1.2; }
    if (f.airDmg) { const dmg = f.airDmg; f.airDmg = 0; cine(f.x, f.z, "GEDEBUK!"); damage(f, dmg, f.by, { big: true }); }
  }
  function updateCount(f, dt) {
    f.downT += dt;
    if (f.count >= 10 || S.phase !== "fight") return;
    if (f.downT >= 1) {
      f.downT = 0; f.count++; sfx.count();
      if (S.ref) popText(S.ref.g.position.x, A.fy + 4.8, S.ref.g.position.z, String(f.count), "#ffffff");
      if (f.count >= 3 && f.count < 10) {
        const p = clamp((f.st.chin * 0.07 + f.sta / 250) * (1 - 0.22 * (f.kdTotal - 1)), 0.05, 0.85) * (f.count >= 6 ? 1.2 : 0.6);
        if (Math.random() < p) {
          f.state = "free"; f.counting = false; f.hp = Math.max(f.hp, 14 + f.st.chin * 2.5); f.think = 0.8;
          feed(`${f.c.name} bangun lagi! Penonton bergemuruh!`, true); sfx.crowd(0.08, 1.8);
          return;
        }
      }
      if (f.count >= 10) { const w = other(f); announce("K.O.!", 2); feed(`K.O.! ${w.c.name} MENANG!`, true); sfx.crowd(0.12, 3); cine(f.x, f.z, "K.O.!"); S.phase = "end"; later(1.6, () => endFight(w, "KO", `KO di ronde ${S.round}`)); }
    }
  }
  function separate() {
    const solid = S.f.filter((f) => !f.gone && ["free", "punch", "swing", "fetch", "climbTo", "down", "stun"].includes(f.state));
    for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
      const a = solid[i], b = solid[j], d = dist(a, b);
      const minD = ffa() && a.target !== b && b.target !== a ? 1.8 : 1.1;
      if (d < minD && d > 0.001) {
        const k = (minD - d) / 2, ux = (b.x - a.x) / d, uz = (b.z - a.z) / d;
        if (a.state !== "down") { a.x -= ux * k; a.z -= uz * k; }
        if (b.state !== "down") { b.x += ux * k; b.z += uz * k; }
      }
    }
  }
  function stepProps(dt) {
    S.props.forEach((p) => {
      if (p.holder || p.y <= 0) return;
      p.vy -= 20 * dt; p.y = Math.max(0, p.y + p.vy * dt);
      p.mesh.position.set(p.x, A.fy + p.y, p.z); p.mesh.rotation.x += dt * 4;
      if (p.y === 0) { p.mesh.rotation.x = 0; sfx.crash(); emit(p.x, A.fy + 0.3, p.z, 6, 0xffffff, { speed: 2 }); }
    });
    S.propT -= dt;
    if (S.propT <= 0 && S.phase === "fight") {
      S.propT = rand(7, 12);
      if (S.props.length < A.props.length) {
        const kind = pick(A.props);
        spawnProp(kind, rand(-A.half + 1, A.half - 1), rand(-A.half + 1, A.half - 1), true);
        feed(`Penonton lempar ${PROPS[kind].name} ke arena! 😱`);
      }
    }
  }
  function simStep(dt) {
    S.gt += dt;
    if (S.phase === "fight") {
      S.clock -= dt;
      S.f.forEach((f) => stepFighter(f, dt));
      separate(); stepProps(dt); stepProjs(dt);
      if (S.clock <= 0 && S.phase === "fight") {
        if (ffa()) { const left = S.f.filter(isUp); S.phase = "end"; announce("WAKTU<br>HABIS!", 1.4); const w = left.reduce((a, b) => (b.hp > a.hp ? b : a), left[0]); later(1.6, () => endFight(w, "Tawuran", "Nyawa paling banyak waktu habis")); }
        else if (!S.f.some((f) => f.state === "down" && f.counting)) endRound();
      }
    } else if (S.phase === "rest") {
      S.restT -= dt;
      S.f.forEach((f) => { const cx = f.i ? 3.6 : -3.6; f.x = lerp(f.x, cx, Math.min(1, dt * 2)); f.z = lerp(f.z, cx, Math.min(1, dt * 2)); f.a = Math.atan2(-f.x, -f.z); });
      const el = $("rest-t"); if (el) el.textContent = Math.ceil(Math.max(0, S.restT)) + " dtk";
      if (S.restT <= 0) startRound();
    } else if (S.phase === "end" || S.phase === "over") {
      S.f.forEach((f) => { if (["air", "ko", "grab", "down", "stun", "swim"].includes(f.state)) stepFighter(f, dt); });
      stepProjs(dt);
    }
    S.hype = Math.max(0, S.hype - dt * 0.4);
    if (S.ref) {
      const up = S.f.filter((f) => !f.gone);
      const mx = up.reduce((s, f) => s + f.x, 0) / Math.max(1, up.length), mz = up.reduce((s, f) => s + f.z, 0) / Math.max(1, up.length);
      const down = S.f.find((f) => f.state === "down" && f.counting);
      const tx = down ? down.x + 1.4 : clamp(mx + 2.4, -A.half, A.half), tz = down ? down.z + 1.4 : clamp(mz + 2.4, -A.half, A.half);
      const r = S.ref.g.position; r.x = lerp(r.x, tx, Math.min(1, dt * 2)); r.z = lerp(r.z, tz, Math.min(1, dt * 2)); r.y = A.fy;
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
    S.projs.forEach((p) => world.remove(p.mesh)); S.projs = [];
    S.f.forEach((f) => { if (f.grab) releaseGrab(f); f.state = "free"; f.y = 0; f.act = null; f.m.g.visible = true; f.stars.visible = false; });
    if (S.round >= S.rounds) {
      let wa = 0, wb = 0;
      S.cards.forEach(([x, y]) => { if (x > y) wa++; else if (y > x) wb++; });
      const w = wa > wb ? S.f[0] : wb > wa ? S.f[1] : null;
      announce("BEL<br>AKHIR!", 1.4);
      S.phase = "end";
      later(1.6, () => endFight(w, w ? "Angka" : "Seri", w ? `Menang angka (${wa}-${wb} juri)` : "Juri bilang seri"));
      return;
    }
    S.restT = 8;
    announce(`<small>Selesai ronde ${S.round}</small>ISTIRAHAT`, 1.3);
    S.f.forEach((f) => { f.sta = Math.min(100, f.sta + 30 + f.st.stamina * 2); f.hp = Math.min(100, f.hp + 6); });
    showRest();
  }
  function startRound() {
    S.round++; S.clock = ffa() ? FFA_LEN : ROUND_LEN; S.phase = "fight";
    S.f.forEach((f) => { f.kdRound = 0; f.roundDmg = 0; f.roundLand = 0; if (isUp(f) && f.state !== "swim") { f.state = "free"; f.y = 0; } f.think = rand(0.3, 0.8); });
    $("rest").hidden = true;
    sfx.bell();
    if (ffa()) { announce("TAWURAN!", 1.2); feed(`Tawuran ${S.f.length} orang dimulai! Bebas pakai apa saja!`, true); }
    else { announce(`RONDE ${S.round}`, 1.1); feed(`Ronde ${S.round} dimulai!`); }
  }
  function endFight(winner, method, how) {
    if (S.phase === "over" || S.phase === "done") return;
    S.phase = "over";
    sfx.bell3();
    S.result = { winner, method, how };
    if (winner && isUp(winner)) { if (winner.grab) releaseGrab(winner); winner.state = "celebrate"; winner.t = 0; winner.y = 0; winner.m.g.visible = true; emit(winner.x, A.fy + 6, winner.z, 60, [0xffcf3f, 0xff4f8b, 0x3a7bff, 0x5cf08a, 0xffffff], { speed: 5, up: 0.6, grav: 4, life: 2.5, size: 0.2 }); }
    later(2.6, showResult);
  }

  // ================= animasi =================
  function animate(f, dt, t) {
    const m = f.m, g = m.g, b = m.body;
    if (f.gone) return;
    g.position.set(f.x, A.fy + f.y, f.z);
    g.rotation.y = f.a;
    m.head.rotation.y = clamp(wrapA(S.yaw - f.a) * 0.55, -1.1, 1.1);
    f.stars.visible = f.state === "down" || f.state === "ko" || f.state === "stun";
    if (f.stars.visible) f.stars.material.rotation += dt * 3;
    const k = Math.min(1, dt * 12);
    let lean = 0, roll = 0, liftY = 0, spin = false;
    const lying = f.state === "down" || f.state === "ko";
    if (lying) lean = -1.45;
    else if (f.state === "grabbed") { const choke = S.f.some((o) => o.grab && o.grab.o === f && o.grab.kind === "choke"); lean = choke ? -0.2 : -1.45; roll = Math.sin(t * 10) * 0.2; }
    else if (f.state === "air") spin = true;
    else if (f.state === "stun") roll = Math.sin(t * 8) * 0.2;
    else if (f.state === "grab" && f.grab && f.grab.kind === "suplex") lean = -clamp(f.t / 0.7, 0, 1) * 1.2;
    else if (f.react > 0) lean = f.reactKind === "head" ? -0.3 : f.reactKind === "body" ? 0.3 : 0;
    else if (f.state === "celebrate") liftY = Math.abs(Math.sin(t * 8)) * 0.5;
    if (spin) b.rotation.x += dt * 12; else b.rotation.x = lerp(b.rotation.x, lean, lying ? Math.min(1, dt * 6) : k);
    b.rotation.z = roll;
    b.position.y = lying ? 0.3 : (f.state === "free" ? Math.abs(Math.sin(t * 7 + f.i)) * 0.08 : 0) + liftY;
    const walking = ["free", "fetch", "climbTo"].includes(f.state);
    const step = walking ? Math.sin(t * 9 + f.i * 2) * 0.35 : 0;
    m.legs[0].rotation.x = step; m.legs[1].rotation.x = -step;
    m.head.position.x = f.react > 0 && f.reactKind === "dodge" ? 0.4 * (f.i % 2 ? 1 : -1) : lerp(m.head.position.x, 0, Math.min(1, dt * 8));
    if (f.prop) {
      const sw = f.state === "swing" ? (f.t < 0.42 ? -2.4 * (f.t / 0.42) : lerp(-2.4, 1.2, clamp((f.t - 0.42) / 0.15, 0, 1))) : -0.2;
      m.hold.rotation.x = sw; m.hold.position.y = f.state === "swing" ? 2.9 : 2.4;
    }
    const guardY = f.sta < 30 ? 2.3 : f.react > 0 && f.reactKind === "block" ? 3.1 : 2.8;
    m.arms.forEach((a, i) => {
      const side = i ? 1 : -1;
      let tx = side * 0.35, ty = guardY, tz = 1.0, len = 0.85;
      if (f.prop || f.state === "grab" || f.state === "celebrate") { ty = f.state === "celebrate" ? 4.2 : 3.0; tz = f.state === "celebrate" ? 0.2 : 0.8; len = 1.0; }
      else if (lying || f.state === "grabbed" || f.state === "air" || f.state === "stun") { tx = side * 1.2; ty = 2.2; tz = 0.3; }
      else if (f.state === "punch" && f.act && f.act.mv.arm === i && f.target) {
        const A2 = f.act, mv = A2.mv, p = A2.t / A2.wind, hitT = A2.t - A2.wind;
        const ext = p < 1 ? Math.max(0, p - 0.6) * 0.5 : hitT < mv.act ? 1 : Math.max(0, 1 - (hitT - mv.act) / mv.rec);
        const ty2 = mv.target === "body" ? 1.8 : 3.0, dd = dist(f, f.target);
        tx = mv.arc ? side * (1.4 * (1 - ext) + 0.1) : side * 0.2;
        ty = mv.up ? lerp(1.6, ty2, ext) : lerp(guardY, ty2, ext);
        tz = lerp(0.9, dd - 0.3, ext);
        len = lerp(0.85, Math.max(0.9, Math.min(2.2, dd - 0.5)), ext);
      }
      const sx = side * 0.62, vx = tx - sx, vy = ty - 2.0, vz = Math.max(0.2, tz);
      a.piv.rotation.set(-Math.atan2(vy, Math.hypot(vx, vz)), Math.atan2(vx, vz), 0, "YXZ");
      setArm(a, lerp(a.len, len, Math.min(1, dt * 30)));
    });
  }
  function animateCrowd(t) {
    S.crowdP.forEach((p, i) => {
      const jump = S.hype > 0.4 ? Math.abs(Math.sin(t * 9 + i)) * S.hype * 0.9 : Math.abs(Math.sin(t * 2 + i)) * 0.06;
      p.g.position.y = p.seat.y + jump;
      p.head.rotation.y = clamp(wrapA(S.yaw - p.seat.face), -1.3, 1.3);
      p.arms.forEach((a, k) => a.piv.rotation.set(S.hype > 0.4 ? -2.6 + Math.sin(t * 10 + i + k) * 0.3 : -0.4, 0, 0));
    });
  }

  // ================= kamera =================
  const camTarget = new THREE.Vector3(0, 2.5, 0);
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(S.px === 1 ? Math.min(devicePixelRatio || 1, 2) : 1 / S.px);
  }
  addEventListener("resize", resize);
  const ptrs = new Map(); let pinch0 = 0, zoom0 = 0;
  canvas.addEventListener("pointerdown", (e) => { canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.zoom; } });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1) { S.yaw -= (e.clientX - p.x) * 0.008; S.pitch = clamp(S.pitch + (e.clientY - p.y) * 0.004, 0.25, 1.2); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (pinch0) S.zoom = clamp(zoom0 * pinch0 / d, 3.5, 22); }
  });
  const endPtr = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; };
  canvas.addEventListener("pointerup", endPtr); canvas.addEventListener("pointercancel", endPtr);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); S.zoom = clamp(S.zoom * (e.deltaY > 0 ? 1.1 : 0.9), 3.5, 22); }, { passive: false });
  const defaultZoom = () => (ffa() ? A.half * 1.45 + 2 : A.half + 4.2);
  canvas.addEventListener("dblclick", () => { S.yaw = Math.PI / 4; S.pitch = 0.62; S.zoom = defaultZoom(); });

  // ================= HUD =================
  function hudInit() {
    $("hud").classList.toggle("ffa", ffa());
    $("roster").hidden = !ffa();
    if (ffa()) $("roster").innerHTML = S.f.map((f, i) => `<div class="rs" id="rs${i}" style="--c:${hex(f.color)}"><img src="faces/${f.c.id}.png" alt="">${f.c.name}<i><b id="rsb${i}"></b></i></div>`).join("");
    else S.f.forEach((f, i) => { $("h-f" + i).src = "faces/" + f.c.id + ".png"; $("h-n" + i).textContent = f.c.name; });
    $("feed").innerHTML = "";
    const mine = S.bets.map((b) => `${byId(b.who).name} → ${S.f[b.pick].c.name}`);
    $("mybet").hidden = !mine.length; $("mybet").innerHTML = "🎟️ " + mine.slice(0, 4).join("<br>🎟️ ") + (mine.length > 4 ? `<br>+${mine.length - 4} lagi` : "");
  }
  function hudUpdate() {
    if (ffa()) S.f.forEach((f, i) => { const b = $("rsb" + i); if (b) { b.style.width = clamp(f.hp, 0, 100) + "%"; $("rs" + i).classList.toggle("ko", !isUp(f)); } });
    else S.f.forEach((f, i) => {
      $("h-hp" + i).style.width = clamp(f.hp, 0, 100) + "%";
      $("h-st" + i).style.width = clamp(f.sta, 0, 100) + "%";
      $("h-kd" + i).textContent = (f.kdTotal ? "⬇".repeat(f.kdTotal) + " jatuh " : "") + (f.sigCharge >= 100 ? "⭐ jurus siap" : "");
    });
    $("h-rd").textContent = ffa() ? `TAWURAN · sisa ${S.f.filter(isUp).length}` : `RONDE ${Math.max(1, S.round)}/${S.rounds}`;
    const c = Math.max(0, Math.ceil(S.clock)); $("h-clk").textContent = Math.floor(c / 60) + ":" + String(c % 60).padStart(2, "0");
  }
  function setHud(on) { ["hud", "feed", "ctrl"].forEach((k) => ($(k).hidden = !on)); $("back").hidden = on; if (!on) { $("rest").hidden = true; $("mybet").hidden = true; $("roster").hidden = true; } }
  function showRest() {
    const el = $("rest");
    const row = (f, i) => `<div class="row ${i ? "red" : ""}"><img src="faces/${f.c.id}.png" alt=""><b>${f.c.name}</b>${Object.entries(PLANS).map(([k, p]) => `<button class="chip" data-f="${i}" data-plan="${k}" aria-pressed="${f.plan === k}">${p.label}</button>`).join("")}</div>`;
    el.innerHTML = `<h3><span>🪑 Istirahat · atur strategi pojok</span><span id="rest-t">8 dtk</span></h3>${S.f.map(row).join("")}<div class="tip">Ketuk strategi untuk tiap petinju. Ronde berikutnya mulai otomatis.</div><div style="text-align:right;margin-top:6px"><button class="btn" id="rest-go" style="padding:6px 16px;font-size:16px">Lanjut ▶</button></div>`;
    el.hidden = false;
    el.querySelectorAll("[data-plan]").forEach((b) => b.onclick = () => { const f = S.f[+b.dataset.f]; f.plan = b.dataset.plan; sfx.click(); el.querySelectorAll(`[data-f="${b.dataset.f}"]`).forEach((x) => x.setAttribute("aria-pressed", x === b)); });
    $("rest-go").onclick = () => { S.restT = 0; };
  }

  // ================= layar & menu =================
  const screens = ["s-title", "s-pick", "s-bet", "s-tour", "s-wallet", "s-result"];
  function show(id) { screens.forEach((s) => ($(s).hidden = s !== id)); }
  function renderOpts() {
    document.querySelectorAll("[data-rounds]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.rounds === S.rounds));
    document.querySelectorAll("[data-px]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.px === S.px));
    $("opt-sound").setAttribute("aria-pressed", soundOn); $("opt-sound").textContent = soundOn ? "🔊 Suara" : "🔇 Suara";
    $("opt-blood").setAttribute("aria-pressed", S.blood); $("opt-blood").textContent = S.blood ? "🩸 Darah: ON" : "🩸 Darah: OFF";
    $("opt-cine").setAttribute("aria-pressed", S.cine); $("opt-cine").textContent = S.cine ? "🎬 Sinematik: ON" : "🎬 Sinematik: OFF";
  }
  document.querySelectorAll("[data-rounds]").forEach((b) => b.onclick = () => { S.rounds = +b.dataset.rounds; store.set("rk_rounds", S.rounds); sfx.click(); renderOpts(); });
  document.querySelectorAll("[data-px]").forEach((b) => b.onclick = () => { S.px = +b.dataset.px; store.set("rk_px", S.px); resize(); sfx.click(); renderOpts(); });
  $("opt-sound").onclick = () => { soundOn = !soundOn; store.set("rk_sound", soundOn); renderOpts(); sfx.click(); };
  $("opt-blood").onclick = () => { S.blood = !S.blood; store.set("rk_blood", S.blood); if (!S.blood) { decals.forEach((d) => world.remove(d)); decals.length = 0; } renderOpts(); sfx.click(); };
  $("opt-cine").onclick = () => { S.cine = !S.cine; store.set("rk_cine", S.cine); renderOpts(); sfx.click(); };
  document.querySelectorAll("[data-go]").forEach((b) => b.onclick = () => {
    sfx.click();
    const g = b.dataset.go;
    if (g === "duel" || g === "ffa") openPick(g);
    else if (g === "tour") openTour();
    else openWallet();
  });

  // ---------- pilih arena & petinju ----------
  let pickSel = [], pickMode = "duel", arenaSel = store.get("rk_arena", "acak");
  if (arenaSel !== "acak" && !ARENAS[arenaSel]) arenaSel = "acak";
  function openPick(mode) { pickMode = mode; pickSel = []; S.tour = null; renderPick(); show("s-pick"); }
  function renderPick() {
    $("arena-row").innerHTML = [["acak", "🎲 Acak", "Biar seru"]].concat(Object.entries(ARENAS).map(([k, a]) => [k, a.name, a.desc])).map(([k, n, d]) => `<button data-ar="${k}" aria-pressed="${arenaSel === k}">${n}<small>${d}</small></button>`).join("");
    const need = pickMode === "duel" ? 2 : 3;
    $("pick-title").textContent = pickMode === "duel"
      ? (pickSel.length === 0 ? "Pilih petinju pojok BIRU" : pickSel.length === 1 ? "Pilih petinju pojok MERAH" : "Siap!")
      : `Pilih 3–8 jagoan (${pickSel.length} dipilih)`;
    $("pick-grid").innerHTML = CREW.map((c) => {
      const i = pickSel.indexOf(c), s = statsOf(c);
      const style = i >= 0 ? `style="background:${hex(TEAM[i])}55"` : "";
      return `<button class="pf" data-id="${c.id}" ${style}>${i >= 0 ? `<span class="tagc" style="background:${hex(TEAM[i])}">${pickMode === "duel" ? (i ? "MERAH" : "BIRU") : "#" + (i + 1)}</span>` : ""}<img src="faces/${c.id}.png" alt="">${c.name}<small>⭐ ${s.rating} · ${sigOf(c).name}</small></button>`;
    }).join("");
    $("pick-ok").disabled = pickSel.length < need;
  }
  $("arena-row").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; arenaSel = b.dataset.ar; store.set("rk_arena", arenaSel); sfx.click(); renderPick(); };
  $("pick-grid").onclick = (e) => {
    const b = e.target.closest(".pf"); if (!b) return;
    const c = byId(b.dataset.id); sfx.click();
    const i = pickSel.indexOf(c), max = pickMode === "duel" ? 2 : 8;
    if (i >= 0) pickSel.splice(i, 1); else if (pickSel.length < max) pickSel.push(c); else if (pickMode === "duel") pickSel[1] = c;
    renderPick();
  };
  $("pick-rand").onclick = () => { pickSel = shuffle(CREW).slice(0, pickMode === "duel" ? 2 : Math.min(6, CREW.length)); sfx.click(); renderPick(); };
  $("pick-back").onclick = () => show("s-title");
  $("pick-ok").onclick = () => { if (pickSel.length >= (pickMode === "duel" ? 2 : 3)) openBet(pickSel.slice(), pickMode); };
  const resolveArena = () => (arenaSel === "acak" ? pick(Object.keys(ARENAS)) : arenaSel);

  // ---------- taruhan ----------
  let betList = null, betMode = "duel";
  function statBars(c) { const s = statsOf(c); return `<div class="stats">${[["Tenaga", s.power], ["Kecepatan", s.speed], ["Dagu kuat", s.chin], ["Stamina", s.stamina]].map(([n, v]) => `<div class="st">${n}<i style="--v:${v * 10}%"></i></div>`).join("")}</div><small style="font-size:12px">⭐ ${sigOf(c).name}</small>`; }
  function openBet(list, mode) {
    betList = list; betMode = mode; S.bets = [];
    const od = oddsFor(list);
    $("bet-title").textContent = S.tour ? `Turnamen · ${S.tour.label}` : mode === "ffa" ? `Taruhan Tawuran ${list.length} Orang` : "Pasang Taruhan";
    if (mode === "duel") {
      $("bet-vs").hidden = false; $("bet-field").hidden = true;
      const [a, b] = list;
      $("bet-vs").innerHTML = `<div class="corner blue"><img src="faces/${a.id}.png" alt=""><b>${a.name}</b><span class="odds">x${od[0]}</span>${statBars(a)}</div><div class="vs-mid">VS</div><div class="corner red"><img src="faces/${b.id}.png" alt=""><b>${b.name}</b><span class="odds">x${od[1]}</span>${statBars(b)}</div>`;
    } else {
      $("bet-vs").hidden = true; $("bet-field").hidden = false;
      $("bet-field").innerHTML = list.map((c, i) => `<div class="corner" style="border-color:${hex(TEAM[i])}"><img src="faces/${c.id}.png" alt=""><b>${c.name}</b><span class="odds">x${od[i]}</span></div>`).join("");
    }
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
    $("bet-list").innerHTML = S.bets.map((b, i) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} pasang <b>${fmt(b.amount)}</b> untuk <b>${betList[b.pick].name}</b>${b.method !== "any" ? ` (${b.method === "ko" ? "menang KO" : "menang angka"})` : ""} · x${b.mult}<button class="x" data-i="${i}">✕</button></div>`).join("") || "<small>Belum ada taruhan. Boleh langsung mulai juga.</small>";
    $("bet-list").querySelectorAll(".x").forEach((x) => x.onclick = () => { const b = S.bets.splice(+x.dataset.i, 1)[0]; setPts(b.who, getPts(b.who) + b.amount); renderBetList(); renderWho($("bet-who"), (c) => betModal(c, "match")); });
  }
  function betModal(c, kind) {
    let pts = getPts(c.id);
    if (pts <= 0) { setPts(c.id, 500); pts = 500; announce(`<small>${c.name} dapat modal 500 poin dari Bos 😄</small>`, 1.6); }
    const list = kind === "match" ? betList : S.tour.players;
    const od = kind === "match" ? oddsFor(betList) : S.tour.champOdds;
    const st = { pick: null, method: "any", amount: Math.min(100, pts) };
    const card = $("modal-card");
    const render = () => {
      let mult = 0;
      if (st.pick != null) mult = kind === "match" && betMode === "duel" ? Math.round(od[st.pick] * (st.method === "any" ? 1 : st.method === "ko" ? 1.8 : 1.4) * 20) / 20 : od[st.pick];
      card.innerHTML = `<h3><img src="faces/${c.id}.png" alt="">${c.name} <small style="margin-left:auto">💰 ${fmt(pts)}</small></h3>
        <div class="lbl">${kind === "match" ? "Jagoanmu siapa?" : "Siapa yang bakal juara?"}</div>
        <div class="seg">${list.map((p, i) => `<button data-pick="${i}" aria-pressed="${st.pick === i}" ${st.pick === i ? `style="background:${hex(TEAM[i % 8])};color:#fff"` : ""}>${p.name} x${od[i]}</button>`).join("")}</div>
        ${kind === "match" && betMode === "duel" ? `<div class="lbl">Menang dengan cara?</div><div class="seg"><button data-m="any" aria-pressed="${st.method === "any"}">Bebas</button><button data-m="ko" aria-pressed="${st.method === "ko"}">KO (x1.8)</button><button data-m="angka" aria-pressed="${st.method === "angka"}">Angka (x1.4)</button></div>` : ""}
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
  $("bet-back").onclick = () => {
    S.bets.forEach((b) => setPts(b.who, getPts(b.who) + b.amount)); S.bets = [];
    if (S.tour) { renderTour(); show("s-tour"); } else { renderPick(); show("s-pick"); }
  };
  $("bet-go").onclick = () => startMatch(betMode, betList, S.tour ? pick(Object.keys(ARENAS)) : resolveArena());

  // ---------- turnamen ----------
  function openTour() {
    const players = shuffle(CREW).slice(0, CREW.length >= 8 ? 8 : 4);
    S.tour = {
      players, champBets: [], locked: false, champOdds: oddsFor(players).map((o) => Math.round(clamp(o * 1.6, 2, 30) * 2) / 2),
      rounds: [players.map((p, i) => i).reduce((acc, i) => (i % 2 ? acc : acc.concat([[i, i + 1]])), []).map(([a, b]) => ({ a, b, w: null }))],
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
    const T = S.tour, n = T.players.length, total = Math.log2(n), nx = tourNext();
    let html = "";
    for (let r = 0; r < total; r++) {
      const ms = T.rounds[r] || [], cnt = n >> (r + 1);
      html += `<div class="col"><b style="font-size:12px;text-align:center">${stageName(r, n)}</b>` + Array.from({ length: cnt }, (_, i) => {
        const m = ms[i];
        if (!m) return '<div class="bm">…<br>…</div>';
        const line = (pi) => { const p = T.players[pi]; const cls = m.w == null ? "" : m.w === pi ? "w" : "l"; return `<div class="${cls}"><img src="faces/${p.id}.png" alt="">${p.name}</div>`; };
        return `<div class="bm ${nx && nx.m === m ? "now" : ""}">${line(m.a)}${line(m.b)}</div>`;
      }).join("") + "</div>";
    }
    if (total < 3) html += '<div class="col"></div>';
    $("bracket").innerHTML = html;
    const fin = T.rounds[total - 1] && T.rounds[total - 1][0];
    $("tour-title").textContent = fin && fin.w != null ? `👑 Juara: ${T.players[fin.w].name}` : "Turnamen Ring Kantor";
    $("champ-sub").textContent = T.locked ? "Tebakan sudah dikunci." : "Ketuk wajahmu, lalu pilih siapa yang bakal juara. Hanya sebelum pertandingan pertama.";
    $("champ-who").hidden = T.locked;
    if (!T.locked) renderWho($("champ-who"), (c) => betModal(c, "champ"));
    $("champ-list").innerHTML = T.champBets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} tebak <b>${T.players[b.pick].name}</b> juara · ${fmt(b.amount)} x${b.mult}${b.res != null ? `<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "kalah"}</span>` : ""}</div>`).join("") || "<small>Belum ada tebakan.</small>";
    $("tour-go").hidden = !nx;
    if (nx) $("tour-go").textContent = `${stageName(nx.r, n)}: ${T.players[nx.m.a].name} vs ${T.players[nx.m.b].name} ▶`;
  }
  $("tour-go").onclick = () => {
    const nx = tourNext(); if (!nx) return;
    S.tour.locked = true; S.tour.label = stageName(nx.r, S.tour.players.length); S.tour.curMatch = nx;
    openBet([S.tour.players[nx.m.a], S.tour.players[nx.m.b]], "duel");
  };
  $("tour-quit").onclick = () => {
    if (S.tour && !S.tour.locked) S.tour.champBets.forEach((b) => setPts(b.who, getPts(b.who) + b.amount));
    S.tour = null; show("s-title");
  };

  // ---------- dompet ----------
  function openWallet() {
    const list = CREW.map((c) => ({ c, p: getPts(c.id) })).sort((a, b) => b.p - a.p);
    $("lead").innerHTML = list.map((x, i) => `<div>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1 + "."}<img src="faces/${x.c.id}.png" alt="">${x.c.name}<span>💰 ${fmt(x.p)}</span></div>`).join("");
    show("s-wallet");
  }
  $("wallet-back").onclick = () => show("s-title");
  $("wallet-reset").onclick = () => { if (confirm("Reset poin semua orang jadi 1.000?")) { store.set("rk_wallet", {}); openWallet(); } };

  // ================= mulai & selesai =================
  function clearFight() {
    S.run++; S.timers = [];
    S.f.forEach((f) => world.remove(f.m.g)); S.f = [];
    if (S.ref) world.remove(S.ref.g); S.ref = null;
    S.crowdP.forEach((p) => world.remove(p.g)); S.crowdP = [];
    S.props.forEach((p) => { if (p.mesh.parent) p.mesh.parent.remove(p.mesh); }); S.props = [];
    S.projs.forEach((p) => world.remove(p.mesh)); S.projs = [];
    S.fx.forEach((e) => world.remove(e.o)); S.fx = [];
    decals.forEach((d) => world.remove(d)); decals.length = 0;
    parts.forEach((p) => { p.life = 0; p.m.visible = false; });
    document.querySelectorAll(".announce").forEach((e) => e.remove());
    S.elim = []; S.cineT = 0; S.slowT = 0;
  }
  function fillCrowd(exclude) {
    const pool = CREW.filter((c) => !exclude.includes(c));
    const order = shuffle(pool.length ? pool : CREW);
    seats.forEach((s, i) => {
      const p = makeFan(order[i % order.length]);
      p.g.position.set(s.x, s.y, s.z); p.g.rotation.y = s.face; p.seat = s;
      world.add(p.g); S.crowdP.push(p);
    });
  }
  function startMatch(mode, list, arenaId) {
    clearFight();
    S.mode = mode;
    buildArena(arenaId);
    S.f = list.map((c, i) => makeFighter(c, i));
    const n = S.f.length, r = mode === "duel" ? 2.6 : Math.min(A.half - 1, 1.2 + n * 0.5);
    S.f.forEach((f, i) => { const ang = (i / n) * TAU + Math.PI / 4; f.x = Math.cos(ang) * r; f.z = Math.sin(ang) * r; f.a = Math.atan2(-f.x, -f.z); });
    const refPool = CREW.filter((c) => !list.includes(c));
    S.refC = pick(refPool.length ? refPool : CREW);
    if (mode === "duel") { const p = makePerson(S.refC, { shirt: 0xffffff, pants: 0x1d1d24, bow: true }); S.ref = p; p.g.position.set(0, A.fy, 3); world.add(p.g); }
    fillCrowd(list.concat([S.refC]));
    A.props.forEach((kind, i) => { const ang = (i / A.props.length) * TAU; spawnProp(kind, Math.cos(ang) * (A.half - 0.9), Math.sin(ang) * (A.half - 0.9), false); });
    Object.assign(S, { round: 0, clock: mode === "ffa" ? FFA_LEN : ROUND_LEN, phase: "intro", cards: [[0, 0], [0, 0], [0, 0]], hype: 0.6, gt: 0, lastFeed: -9, result: null, paused: false, propT: 8 });
    S.zoom = defaultZoom(); S.zoomEff = S.zoom;
    show(null); setHud(true); hudInit(); hudUpdate();
    $("c-pause").textContent = "⏸";
    announce(`<small>${A.name}</small>${mode === "ffa" ? "TAWURAN!" : list[0].name + " vs " + list[1].name}`, 1.8);
    feed(mode === "duel" ? `Selamat datang di ${A.name}! Wasit hari ini: ${S.refC.name}.` : `${n} orang masuk ${A.name}. Tidak ada aturan!`);
    sfx.crowd(0.08, 2);
    later(2.0, startRound);
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
    $("r-big").textContent = w ? (ffa() ? `👑 ${w.c.name} JUARA TAWURAN!` : `${w.c.name} MENANG!`) : "SERI!";
    const stat = S.f.map((f) => `${f.c.name} ${f.landed}`).join(", ");
    $("r-how").textContent = `${R0.method === "Seri" || R0.method === "Tawuran" ? "" : R0.method + " · "}${R0.how} · Serangan masuk: ${stat}`;
    $("r-cards-wrap").hidden = ffa() || R0.method === "KO" || R0.method === "TKO";
    $("r-cards").innerHTML = S.cards.map(([x, y], j) => `<div>Juri ${j + 1}<br>${x} - ${y}</div>`).join("");
    $("r-rank-wrap").hidden = !ffa();
    if (ffa()) {
      const standing = S.f.filter((f) => isUp(f) && f !== w).sort((a, b) => b.hp - a.hp);
      const ranked = (w ? [w] : []).concat(standing, S.elim.slice().reverse().filter((f) => f !== w));
      $("r-rank").innerHTML = ranked.map((f, i) => `<div>${i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1 + "."}<img src="faces/${f.c.id}.png" alt="">${f.c.name}<span>${f === w ? "juara" : isUp(f) ? "masih berdiri" : "tumbang ke-" + (S.elim.indexOf(f) + 1)}</span></div>`).join("");
    }
    let bets = S.bets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} → ${S.f[b.pick].c.name} (${fmt(b.amount)})<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "kalah"}</span></div>`).join("");
    const T = S.tour;
    if (T && T.curMatch) {
      const m = T.curMatch.m;
      const winIdx = w ? (w.c === T.players[m.a] ? m.a : m.b) : (Math.random() < 0.5 ? m.a : m.b);
      if (!w) bets += `<div class="bet">Seri! Lewat undian koin: <b>${T.players[winIdx].name}</b> lanjut.</div>`;
      m.w = winIdx;
      const r = T.curMatch.r, ms = T.rounds[r];
      if (ms.every((x) => x.w != null) && ms.length > 1) { const next = []; for (let i = 0; i < ms.length; i += 2) next.push({ a: ms[i].w, b: ms[i + 1].w, w: null }); T.rounds[r + 1] = next; }
      T.curMatch = null;
      if (!tourNext()) {
        T.champBets.forEach((b) => { b.res = b.pick === winIdx ? Math.round(b.amount * b.mult) : 0; if (b.res) setPts(b.who, getPts(b.who) + b.res); });
        bets += `<div class="bet">👑 <b>${T.players[winIdx].name}</b> JUARA TURNAMEN!</div>` + T.champBets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${byId(b.who).name} tebak juara ${T.players[b.pick].name}<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "meleset"}</span></div>`).join("");
      }
    }
    $("r-bets-wrap").hidden = !bets; $("r-bets").innerHTML = bets;
    $("r-next").hidden = !T; $("r-next").textContent = T && tourNext() ? "Lanjut Turnamen ▶" : "Lihat Bagan ▶";
    $("r-again").hidden = !!T;
    S.phase = "done";
    show("s-result");
  }
  $("r-next").onclick = () => { renderTour(); show("s-tour"); };
  $("r-again").onclick = () => openBet(S.f.map((f) => f.c), S.mode);
  $("r-menu").onclick = () => { clearFight(); S.tour = null; show("s-title"); idleCrowd(); };

  document.querySelectorAll("[data-spd]").forEach((b) => b.onclick = () => { S.speed = +b.dataset.spd; document.querySelectorAll("[data-spd]").forEach((x) => x.setAttribute("aria-pressed", x === b)); sfx.click(); });
  $("c-pause").onclick = () => { S.paused = !S.paused; $("c-pause").textContent = S.paused ? "▶" : "⏸"; };
  $("c-rotl").onclick = () => { S.yaw += Math.PI / 2; };
  $("c-rotr").onclick = () => { S.yaw -= Math.PI / 2; };
  $("c-zin").onclick = () => { S.zoom = clamp(S.zoom * 0.85, 3.5, 22); };
  $("c-zout").onclick = () => { S.zoom = clamp(S.zoom * 1.18, 3.5, 22); };
  $("c-follow").onclick = () => { S.follow = !S.follow; $("c-follow").setAttribute("aria-pressed", S.follow); };
  $("c-quit").onclick = () => {
    if (!confirm("Hentikan pertandingan? Taruhan dikembalikan.")) return;
    S.bets.forEach((b) => setPts(b.who, getPts(b.who) + b.amount)); S.bets = [];
    clearFight(); setHud(false);
    if (S.tour) { renderTour(); show("s-tour"); } else show("s-title");
    idleCrowd();
  };
  addEventListener("keydown", (e) => {
    if (!S.f.length) return;
    if (e.code === "Space") { e.preventDefault(); $("c-pause").click(); }
    if (e.code === "KeyQ") S.yaw += Math.PI / 2;
    if (e.code === "KeyE") S.yaw -= Math.PI / 2;
    if (["Digit1", "Digit2", "Digit4"].includes(e.code)) document.querySelector(`[data-spd="${e.code.slice(-1)}"]`).click();
  });
  function idleCrowd() { S.crowdP.forEach((p) => world.remove(p.g)); S.crowdP = []; fillCrowd([]); S.hype = 0; }

  // ================= loop =================
  let t0 = performance.now(), time = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    tick(rdt); render(rdt);
  }
  function tick(rdt) {
    if (S.paused) return;
    time += rdt;
    S.slowT = Math.max(0, S.slowT - rdt);
    const slow = S.slowT > 0 ? 0.35 : 1;
    const gdt = rdt * (S.f.length ? S.speed : 1) * slow;
    const steps = Math.max(1, Math.ceil(gdt / (1 / 60)));
    for (let i = 0; i < steps; i++) {
      const dt = gdt / steps;
      const due = [];
      S.timers = S.timers.filter((tm) => { if (tm.run !== S.run) return false; tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
      due.forEach((tm) => { if (tm.run === S.run) tm.fn(); });
      if (S.f.length && S.phase !== "done") simStep(dt);
      updateParts(dt);
    }
    S.fx = S.fx.filter((e) => { e.t += rdt; e.o.position.y += rdt * 1.5; e.o.material.opacity = 1 - Math.max(0, e.t / e.dur - 0.5) * 2; if (e.t >= e.dur) { world.remove(e.o); return false; } return true; });
    if (S.f.length) { S.f.forEach((f) => animate(f, gdt, time)); hudUpdate(); }
    anims.forEach((fn) => fn(rdt, time));
    arenaAnims.forEach((fn) => fn(rdt, time));
  }
  function render(rdt) {
    animateCrowd(time);
    const tgt = new THREE.Vector3(0, A.fy + 1.5, 0);
    const up = S.f.filter((f) => !f.gone);
    if (S.follow && up.length) { tgt.x = up.reduce((s, f) => s + f.x, 0) / up.length; tgt.z = up.reduce((s, f) => s + f.z, 0) / up.length; }
    S.cineT = Math.max(0, S.cineT - rdt);
    let zoom = S.zoom;
    if (S.cineT > 0) { tgt.x = S.cineX; tgt.z = S.cineZ; zoom = Math.min(S.zoom, 4.8); }
    if (!S.f.length) S.yaw += rdt * 0.08;
    S.zoomEff = lerp(S.zoomEff, zoom, Math.min(1, rdt * (S.cineT > 0 ? 6 : 2.5)));
    camTarget.lerp(tgt, Math.min(1, rdt * (S.cineT > 0 ? 6 : 3)));
    const w = innerWidth || 1, h = innerHeight || 1, asp = w / h;
    const z = S.zoomEff * (asp < 1 ? Math.min(2.2, 0.85 / Math.max(asp, 0.4)) : 1);
    camera.left = -z * asp; camera.right = z * asp; camera.top = z; camera.bottom = -z; camera.updateProjectionMatrix();
    S.shake = Math.max(0, S.shake - rdt);
    const sh = S.shake * 0.5, D = 60;
    camera.position.set(camTarget.x + Math.sin(S.yaw) * Math.cos(S.pitch) * D + rand(-sh, sh), camTarget.y + Math.sin(S.pitch) * D, camTarget.z + Math.cos(S.yaw) * Math.cos(S.pitch) * D + rand(-sh, sh));
    camera.lookAt(camTarget);
    renderer.render(scene, camera);
  }

  // ================= mulai =================
  loadFaces().then(() => {
    CREW = CREW.filter((c) => faceImg[c.id]);
    if (CREW.length < 3) { err("Foto wajah kurang. Jalankan lewat server lokal (lihat README)."); return; }
    buildIsland();
    buildArena(arenaSel === "acak" ? "ring" : arenaSel);
    idleCrowd();
    renderOpts();
    resize();
    show("s-title");
    window.__rk = {
      S, start: startMatch, ARENAS, CREW: () => CREW, oddsFor, statsOf, draw: () => render(0.016),
      sim(sec) { for (let t = 0; t < sec; t += 0.05) tick(0.05); return { phase: S.phase, round: S.round, hp: S.f.map((f) => Math.round(f.hp)), st: S.f.map((f) => f.state), result: S.result && { w: S.result.winner && S.result.winner.c.name, m: S.result.method } }; },
    };
    requestAnimationFrame(frame);
  });
})();
