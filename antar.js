/* ANTAR RAKIT — game antar komputer 3D isometrik
   Cara main utama: ketuk tujuan (tombol kuning / gedung / kartu order), mobil jalan sendiri.
   Pilihan lain: panah / WASD untuk nyetir sendiri.
   Data kru ada di characters.js. */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const err = (m) => { $("err").textContent = m; $("err").hidden = false; };
  if (!window.THREE) { err("Three.js gagal dimuat. Cek internet lalu refresh."); return; }
  let CREW = window.CREW || [];

  // ---------------- util ----------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
  const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const money = (n) => "Rp " + (Math.round(n) * 1000).toLocaleString("id-ID");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };
  const isTouch = matchMedia("(pointer: coarse)").matches;

  // ---------------- suara ----------------
  let actx = null, soundOn = store.get("ar_sound", true);
  function beep(freq, dur = 0.1, type = "square", vol = 0.06, slide = 0) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { /* abaikan */ }
  }
  const sfx = {
    coin: () => { beep(880, 0.08); setTimeout(() => beep(1320, 0.12), 70); },
    bump: () => beep(140, 0.18, "sawtooth", 0.08, -80),
    crash: () => beep(90, 0.3, "sawtooth", 0.1, -50),
    power: () => { beep(520, 0.08, "triangle"); setTimeout(() => beep(780, 0.08, "triangle"), 70); setTimeout(() => beep(1040, 0.14, "triangle"), 140); },
    horn: () => { beep(392, 0.28, "square", 0.05); beep(494, 0.28, "square", 0.04); },
    click: () => beep(660, 0.05, "triangle", 0.05),
    wrong: () => beep(160, 0.2, "square", 0.06),
    load: () => beep(300, 0.12, "triangle", 0.06, 200),
    alert: () => { beep(988, 0.07, "square", 0.05); setTimeout(() => beep(988, 0.07, "square", 0.05), 110); },
    good: () => beep(740, 0.1, "triangle", 0.06, 300),
  };

  // ---------------- data dunia ----------------
  const CELL = 22, ROAD = 7, NB = 8, LANE = 1.6;
  const HALF = (NB * CELL) / 2;
  const RL = (k) => k * CELL - HALF;                 // garis tengah jalan ke-k (0..NB)
  const BL = (i) => (RL(i) + RL(i + 1)) / 2;         // tengah blok ke-i (0..NB-1)
  const BHALF = (CELL - ROAD) / 2;

  const ITEMS = {
    pc:      { icon: "🖥️", fragile: 1.0 },
    monitor: { icon: "📺", fragile: 1.25 },
    printer: { icon: "🖨️", fragile: 0.85 },
    laptop:  { icon: "💻", fragile: 1.1 },
    server:  { icon: "🗄️", fragile: 1.5 },
    ups:     { icon: "🔋", fragile: 0.7 },
  };
  const ITEM_KEYS = Object.keys(ITEMS);

  const PLACES = [
    { key: "sekolah", label: "SD Harapan",    icon: "🏫", b: [0, 1], color: 0xff8a5c, roof: 0xd94f2a, h: 6 },
    { key: "bank",    label: "Bank Sentosa",  icon: "🏦", b: [6, 0], color: 0x3d7bff, roof: 0x1f4fc0, h: 11 },
    { key: "warnet",  label: "Warnet GG",     icon: "🎮", b: [7, 3], color: 0x9b5cff, roof: 0x6a2fd0, h: 5 },
    { key: "rs",      label: "RS Sehat",      icon: "🏥", b: [3, 7], color: 0xffffff, roof: 0xff4a4a, h: 9 },
    { key: "kantor",  label: "Kantor Pajak",  icon: "🏢", b: [1, 5], color: 0x2bb3a3, roof: 0x16786d, h: 13 },
    { key: "ruko",    label: "Ruko Jaya",     icon: "🏪", b: [4, 2], color: 0xffc23f, roof: 0xe0901a, h: 5 },
    { key: "kampus",  label: "Kampus",        icon: "🎓", b: [0, 7], color: 0xc0504d, roof: 0x8a2a28, h: 8 },
    { key: "hotel",   label: "Hotel Melati",  icon: "🏨", b: [7, 6], color: 0xff6fa8, roof: 0xd63a7a, h: 12 },
    { key: "kafe",    label: "Kafe Senja",    icon: "☕", b: [2, 0], color: 0xa0673f, roof: 0x6b3f22, h: 5 },
    { key: "bengkel", label: "Bengkel Maju",  icon: "🔧", b: [5, 5], color: 0x7d8597, roof: 0x3d4555, h: 6 },
    { key: "bangun",  label: "Toko Bangunan", icon: "🧱", b: [5, 7], color: 0xe07a3a, roof: 0x9e4a1a, h: 6 },
    { key: "klinik",  label: "Klinik Gigi",   icon: "🦷", b: [1, 3], color: 0x7fd1c8, roof: 0x2a8f86, h: 7 },
  ];
  const DEPOT = { key: "depot", b: [3, 4], label: "Gudang", icon: "🏭" };
  const placeOf = (key) => (key === "depot" ? DEPOT : PLACES.find((p) => p.key === key));

  const CARS = {
    mpv: { name: "MPV Kilat", desc: "Mobil keluarga 7 kursi. Cepat, tapi muatnya cuma 4 barang.", max: 20, acc: 16, turn: 2.6, cap: 4, armor: 1, r: 1.6,
           stats: { Kecepatan: 90, Muatan: 40, Tahan: 50 } },
    box: { name: "Box Gajah", desc: "Mobil box. Lebih lambat, tapi muat 9 barang dan barang lebih aman.", max: 15, acc: 11, turn: 2.0, cap: 9, armor: 0.7, r: 2.0,
           stats: { Kecepatan: 60, Muatan: 95, Tahan: 80 } },
  };
  const SHIFT = 240;

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
  function stickerTexture(c) {
    if (faceTex[c.id]) return faceTex[c.id];
    const W = 256, H = 320, cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const g = cv.getContext("2d");
    const oval = (pad) => { g.beginPath(); g.ellipse(W / 2, H / 2, W / 2 - pad, H / 2 - pad, 0, 0, TAU); };
    oval(2); g.fillStyle = "#1d1530"; g.fill();
    oval(9); g.fillStyle = "#ffffff"; g.fill();
    oval(18); g.save(); g.clip();
    g.fillStyle = c.skin; g.fillRect(0, 0, W, H);
    if (faceImg[c.id]) g.drawImage(faceImg[c.id], 0, 0, W, H);
    g.restore();
    const t = new THREE.CanvasTexture(cv);
    t.minFilter = THREE.LinearFilter;
    faceTex[c.id] = t;
    return t;
  }

  // ---------------- three.js dasar ----------------
  const canvas = $("game");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: "high-performance" }); }
  catch (e) { err("Browser ini belum mendukung grafik 3D (WebGL)."); return; }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbfe8ff);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
  const CAM_OFF = new THREE.Vector3(40, 46, 40);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8aa070, 0.78));
  const sun = new THREE.DirectionalLight(0xffffff, 0.6);
  sun.position.set(30, 60, 10);
  scene.add(sun);

  const matCache = new Map();
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); return matCache.get(k); };
  const BOXG = new THREE.BoxGeometry(1, 1, 1);
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(BOXG, typeof c === "number" ? M(c) : c); m.scale.set(w, h, d); m.position.set(x, y, z); return m; };
  const grp = (...k) => { const g = new THREE.Group(); k.forEach((x) => g.add(x)); return g; };
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 2; return t;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function labelSprite(text, bg, scale = 1) {
    const t = canvasTex(512, 128, (g, w, h) => {
      g.fillStyle = "#1d1530"; roundRect(g, 4, 4, w - 8, h - 8, 40); g.fill();
      g.fillStyle = bg; roundRect(g, 12, 12, w - 24, h - 24, 32); g.fill();
      g.fillStyle = "#1d1530"; g.textAlign = "center"; g.textBaseline = "middle";
      let s = 62; g.font = `700 ${s}px Fredoka, sans-serif`;
      while (g.measureText(text).width > w - 50 && s > 24) { s -= 3; g.font = `700 ${s}px Fredoka, sans-serif`; }
      g.fillText(text, w / 2, h / 2 + 3);
    });
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false }));
    sp.scale.set(11 * scale, 2.75 * scale, 1);
    sp.renderOrder = 10;
    return sp;
  }
  const shadowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(0,0,0,.42)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const blobMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false });
  const PLANE = new THREE.PlaneGeometry(1, 1);
  function blob(w, d) { const m = new THREE.Mesh(PLANE, blobMat); m.scale.set(w, d, 1); m.rotation.x = -Math.PI / 2; m.position.y = 0.06; return m; }
  const winTex = canvasTex(64, 64, (g) => { g.fillStyle = "#fff"; g.fillRect(0, 0, 64, 64); g.fillStyle = "#7d97bd"; g.fillRect(10, 14, 18, 22); g.fillRect(36, 14, 18, 22); g.fillStyle = "#eef2f7"; g.fillRect(0, 50, 64, 6); });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const hitMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

  // ---------------- kota ----------------
  const solids = [];        // kotak padat untuk mode nyetir sendiri
  const bumps = [];         // polisi tidur {x,z,axis}
  const zones = {};         // titik berhenti {x,z,door}
  const tapTargets = [];    // kotak tak terlihat yang bisa diketuk
  function addSolid(cx, cz, w, d) { solids.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }); }
  function addTap(key, cx, cz, h) { const m = box(BHALF * 2, h, BHALF * 2, hitMat, cx, h / 2, cz); m.userData.target = key; scene.add(m); tapTargets.push(m); }

  function buildCity() {
    const ground = new THREE.Mesh(PLANE, M(0xb9e39a)); ground.scale.set(HALF * 2 + 80, HALF * 2 + 80, 1);
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    const roadM = M(0x5a5d6a), curbM = M(0xe8e3d6);
    const L = HALF * 2 + ROAD;
    for (let k = 0; k <= NB; k++) {
      scene.add(box(L, 0.1, ROAD, roadM, 0, 0.05, RL(k)));
      scene.add(box(ROAD, 0.1, L, roadM, RL(k), 0.06, 0));
    }
    // garis putus-putus: satu InstancedMesh supaya ringan
    const dashes = [];
    for (let k = 0; k <= NB; k++) for (let s = 0; s < NB; s++) for (let d = -2; d <= 2; d++) {
      dashes.push([BL(s) + d * 3, RL(k), 1.6, 0.25]);
      dashes.push([RL(k), BL(s) + d * 3, 0.25, 1.6]);
    }
    const dm = new THREE.InstancedMesh(BOXG, M(0xffffff), dashes.length);
    const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    dashes.forEach(([x, z, w, d], i) => { dm.setMatrixAt(i, mx.compose(v.set(x, 0.08, z), q, sc.set(w, 0.1, d))); });
    scene.add(dm);
    // pagar luar
    const e = HALF + ROAD / 2 + 0.5;
    [[0, -e, L + 2, 1], [0, e, L + 2, 1], [-e, 0, 1, L + 2], [e, 0, 1, L + 2]].forEach(([x, z, w, d]) => { scene.add(box(w, 1, d, 0xffffff, x, 0.5, z)); addSolid(x, z, w, d); });

    for (let i = 0; i < NB; i++) for (let j = 0; j < NB; j++) {
      const cx = BL(i), cz = BL(j);
      scene.add(box(BHALF * 2, 0.35, BHALF * 2, curbM, cx, 0.17, cz));
      addSolid(cx, cz, BHALF * 2, BHALF * 2);
      const place = PLACES.find((p) => p.b[0] === i && p.b[1] === j);
      if (i === DEPOT.b[0] && j === DEPOT.b[1]) buildDepot(cx, cz);
      else if (place) buildPlace(place, cx, cz);
      else buildFiller(cx, cz, i, j);
    }
    // polisi tidur (tidak di depan gudang/klien)
    const zoneSeg = new Set(Object.values(zones).map((z) => z.x + "," + z.z));
    const segs = [];
    for (let k = 0; k <= NB; k++) for (let s = 0; s < NB; s++) { segs.push({ x: BL(s), z: RL(k), axis: "x" }); segs.push({ x: RL(k), z: BL(s), axis: "z" }); }
    segs.filter((b) => !zoneSeg.has(b.x + "," + b.z)).sort(() => Math.random() - 0.5).slice(0, 18).forEach((b) => {
      const along = b.axis === "x";
      scene.add(along ? box(0.9, 0.3, ROAD - 0.4, 0xffd23f, b.x, 0.15, b.z) : box(ROAD - 0.4, 0.3, 0.9, 0xffd23f, b.x, 0.15, b.z));
      for (let s = -1; s <= 1; s++) scene.add(along ? box(0.92, 0.32, 0.7, 0x1d1530, b.x, 0.15, b.z + s * 2) : box(0.7, 0.32, 0.92, 0x1d1530, b.x + s * 2, 0.15, b.z));
      bumps.push(b);
    });
  }
  function building(w, h, d, color, x, z, roofColor) {
    const tex = winTex.clone(); tex.needsUpdate = true;
    tex.repeat.set(Math.max(1, Math.round(w / 2.4)), Math.max(1, Math.round(h / 2.6)));
    const side = new THREE.MeshLambertMaterial({ color, map: tex });
    const top = M(roofColor != null ? roofColor : new THREE.Color(color).multiplyScalar(0.88).getHex());
    const m = new THREE.Mesh(BOXG, [side, side, top, top, side, side]);
    m.scale.set(w, h, d); m.position.set(x, h / 2 + 0.35, z);
    scene.add(m);
    return m;
  }
  const crownGeo = new THREE.IcosahedronGeometry(1.5, 0);
  function tree(x, z, s = 1) {
    const g = grp(box(0.5 * s, 1.6 * s, 0.5 * s, 0x8b5a3c, 0, 0.8 * s, 0));
    const crown = new THREE.Mesh(crownGeo, M(pick([0x5cc46e, 0x6fd17a, 0x4fb366])));
    crown.scale.setScalar(s); crown.position.y = 2.4 * s; g.add(crown);
    g.position.set(x, 0.35, z); scene.add(g);
  }
  function house(x, z, rot) {
    const c = pick([0xf3ead7, 0xe9e4ee, 0xe4ede4, 0xf1e6dc]);
    const g = grp(box(4.6, 3, 4.6, c, 0, 1.5, 0));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.2, 4), M(pick([0xc9a28a, 0xb7aaa0, 0xa9b4c4])));
    roof.rotation.y = Math.PI / 4; roof.position.y = 4.1; g.add(roof);
    g.position.set(x, 0.35, z); g.rotation.y = rot; scene.add(g);
  }
  // gedung biasa dibuat pucat, supaya gedung klien yang berwarna langsung kelihatan
  function buildFiller(cx, cz, i, j) {
    const r = (i * 7 + j * 13) % 5;
    if (r === 0) {
      scene.add(box(BHALF * 2 - 1, 0.4, BHALF * 2 - 1, 0x9fdc84, cx, 0.2, cz));
      for (let k = 0; k < 4; k++) tree(cx + rand(-5, 5), cz + rand(-5, 5), rand(0.8, 1.2));
    } else if (r === 1 || r === 2) {
      [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]].forEach(([dx, dz]) => house(cx + dx, cz + dz, pick([0, Math.PI / 2, Math.PI, -Math.PI / 2])));
    } else {
      building(9, rand(5, 11), 9, pick([0xdfe3ea, 0xe8e2d4, 0xdde6e0]), cx - 1, cz - 1);
      tree(cx + 5, cz + 5, 0.8);
    }
  }
  function buildPlace(p, cx, cz) {
    const bz = cz - 1.5;
    building(11, p.h, 9, p.color, cx, bz, p.roof);
    scene.add(box(3, 2.6, 0.3, 0x2b2140, cx, 1.6, bz + 4.55));
    scene.add(box(4.4, 0.4, 1.8, p.roof, cx, 3.2, bz + 5));
    if (p.key === "rs") scene.add(box(3.6, 1.1, 0.3, 0xff3b3b, cx, p.h - 1.5, bz + 4.6), box(1.1, 3.6, 0.3, 0xff3b3b, cx, p.h - 1.5, bz + 4.6));
    const lab = labelSprite(p.icon + " " + p.label, "#ffffff", 1);
    lab.position.set(cx, p.h + 3.4, bz);
    scene.add(lab);
    addTap(p.key, cx, cz, p.h + 4);
    zones[p.key] = { x: cx, z: RL(p.b[1] + 1), door: new THREE.Vector3(cx + 2.6, 0.35, cz + BHALF - 1.4), lab };
  }
  function buildDepot(cx, cz) {
    const g = new THREE.Group();
    g.add(box(13, 7, 10, 0x2f6fe0, 0, 3.85, -1));
    g.add(box(14, 0.6, 11, 0xffcf3f, 0, 7.6, -1));
    const doorMat = new THREE.MeshLambertMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = "#c9ced8"; c.fillRect(0, 0, 64, 64); c.fillStyle = "#9aa1b0"; for (let y = 4; y < 64; y += 8) c.fillRect(0, y, 64, 3); }) });
    for (let k = -1; k <= 1; k++) g.add(box(3.4, 4, 0.3, doorMat, k * 4.1, 2.35, 4.05));
    for (let k = 0; k < 7; k++) g.add(box(1.2, 1.2, 1.2, 0xc8955a, 5.2 - (k % 3) * 1.3, 0.95 + Math.floor(k / 3) * 1.2, 4.8));
    g.position.set(cx, 0, cz); scene.add(g);
    const lab = labelSprite("🏭 GUDANG · BARANG MASUK", "#ffcf3f", 1.2);
    lab.position.set(cx, 11, cz - 1); scene.add(lab);
    addTap("depot", cx, cz, 9);
    zones.depot = { x: cx, z: RL(DEPOT.b[1] + 1), door: new THREE.Vector3(cx, 0.35, cz + 5.6), lab };
  }

  // ---------------- karakter kepala-foto ----------------
  function makePerson(c, scale = 1) {
    const g = new THREE.Group();
    const shirt = new THREE.Color(c.shirt).getHex(), skin = new THREE.Color(c.skin).getHex();
    const legs = [-1, 1].map((s) => { const p = new THREE.Group(); p.position.set(s * 0.26, 1.0, 0); p.add(box(0.42, 1.0, 0.45, 0x2b3350, 0, -0.5, 0)); g.add(p); return p; });
    g.add(box(1.15, 1.2, 0.7, shirt, 0, 1.6, 0));
    const arms = [-1, 1].map((s) => { const a = new THREE.Group(); a.position.set(s * 0.75, 2.1, 0); a.add(box(0.32, 1.0, 0.36, shirt, 0, -0.45, 0)); a.add(box(0.3, 0.3, 0.3, skin, 0, -1.05, 0)); g.add(a); return a; });
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: stickerTexture(c) }));
    head.scale.set(3.0, 3.75, 1); head.position.y = 3.9; g.add(head);
    const carry = grp(box(1.3, 1.0, 1.0, 0xc8955a, 0, 0, 0), box(1.32, 0.15, 0.3, 0xe8d2a8, 0, 0.42, 0));
    carry.position.set(0, 1.75, 0.75); carry.visible = false; g.add(carry);
    g.add(blob(2, 2));
    g.scale.setScalar(scale);
    return { g, legs, arms, head, carry, c, walk: 0 };
  }

  // ---------------- mobil ----------------
  function makeCar(type, driver) {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const glass = M(0x23324d), wheelM = M(0x1d1d24);
    const wheel = (x, z, r = 0.55) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.45, 10), wheelM); w.rotation.z = Math.PI / 2; w.position.set(x, r, z); body.add(w); };
    let headY, headZ;
    if (type === "mpv") {
      body.add(box(2.3, 1.1, 4.6, 0xf4f6fa, 0, 0.95, 0));
      body.add(box(2.2, 1.0, 3.5, 0xf4f6fa, 0, 1.95, -0.35));
      body.add(box(2.24, 0.55, 3.3, glass, 0, 2.0, -0.35));
      body.add(box(2.0, 0.6, 0.08, glass, 0, 2.0, 1.42));
      body.add(box(2.32, 0.18, 4.62, 0xff7a1a, 0, 1.15, 0));
      body.add(box(2.1, 0.12, 2.6, 0x9aa3b5, 0, 2.5, -0.4));
      body.add(box(0.5, 0.25, 0.1, 0xfff4a8, -0.75, 1.05, 2.31), box(0.5, 0.25, 0.1, 0xfff4a8, 0.75, 1.05, 2.31));
      body.add(box(0.45, 0.25, 0.1, 0xff3b3b, -0.8, 1.05, -2.31), box(0.45, 0.25, 0.1, 0xff3b3b, 0.8, 1.05, -2.31));
      wheel(-1.1, 1.45); wheel(1.1, 1.45); wheel(-1.1, -1.45); wheel(1.1, -1.45);
      headY = 4.3; headZ = 0.3;
    } else {
      body.add(box(2.4, 1.9, 1.9, 0xf4f6fa, 0, 1.5, 2.0));
      body.add(box(2.3, 0.7, 0.08, glass, 0, 1.95, 2.96));
      body.add(box(2.44, 0.6, 1.2, glass, 0, 1.95, 2.0));
      body.add(box(2.42, 0.2, 1.92, 0x2f6fe0, 0, 0.75, 2.0));
      const side = new THREE.MeshLambertMaterial({ map: canvasTex(256, 128, (c, w, h) => { c.fillStyle = "#ffffff"; c.fillRect(0, 0, w, h); c.fillStyle = "#2f6fe0"; c.fillRect(0, h - 26, w, 26); c.fillStyle = "#1d1530"; c.font = "700 40px Fredoka, sans-serif"; c.textAlign = "center"; c.fillText("ANTAR RAKIT", w / 2, 62); c.font = "500 22px Fredoka, sans-serif"; c.fillText("komputer · servis · pasang", w / 2, 92); }) });
      const white = M(0xffffff);
      const cargo = new THREE.Mesh(BOXG, [side, side, white, white, white, white]);
      cargo.scale.set(2.6, 2.8, 4.2); cargo.position.set(0, 2.15, -1.1); body.add(cargo);
      body.add(box(0.5, 0.25, 0.1, 0xfff4a8, -0.8, 0.95, 2.96), box(0.5, 0.25, 0.1, 0xfff4a8, 0.8, 0.95, 2.96));
      wheel(-1.2, 2.0, 0.6); wheel(1.2, 2.0, 0.6); wheel(-1.2, -1.8, 0.6); wheel(1.2, -1.8, 0.6); wheel(-1.2, -2.7, 0.6); wheel(1.2, -2.7, 0.6);
      headY = 4.4; headZ = 2.0;
    }
    g.add(blob(type === "mpv" ? 4 : 4.4, type === "mpv" ? 6.2 : 7.6));
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: stickerTexture(driver) }));
    head.scale.set(3.4, 4.25, 1); head.position.set(0, headY, headZ); body.add(head);
    const roofBoxes = [];
    if (type === "mpv") for (let k = 0; k < 4; k++) { const b = box(0.8, 0.6, 0.8, 0xc8955a, (k % 2 ? 0.45 : -0.45), 2.9, -0.9 - Math.floor(k / 2) * 0.9); b.visible = false; body.add(b); roofBoxes.push(b); }
    return { g, body, head, headY, roofBoxes };
  }
  function makeNpcCar(driver) {
    const g = new THREE.Group();
    const c = pick([0xff4d6d, 0x3ec1ff, 0x9bde4a, 0xffa53f, 0xb08cff, 0x333a4a]);
    g.add(box(2.0, 0.9, 3.8, c, 0, 0.8, 0), box(1.8, 0.8, 2.0, 0x23324d, 0, 1.6, -0.2), box(1.7, 0.1, 1.9, c, 0, 2.05, -0.2));
    g.add(blob(3.6, 5.6));
    if (driver) { const h = new THREE.Sprite(new THREE.SpriteMaterial({ map: stickerTexture(driver) })); h.scale.set(2.2, 2.75, 1); h.position.set(0, 3.4, -0.2); g.add(h); }
    return g;
  }
  function makeCat() {
    const g = grp(box(0.6, 0.5, 1.2, 0xff9f43, 0, 0.6, 0), box(0.6, 0.55, 0.55, 0xff9f43, 0, 1.0, 0.7), box(0.15, 0.25, 0.15, 0xff9f43, -0.2, 1.35, 0.7), box(0.15, 0.25, 0.15, 0xff9f43, 0.2, 1.35, 0.7), box(0.12, 0.12, 0.7, 0xff9f43, 0, 0.9, -0.8));
    g.add(blob(1.4, 1.8));
    const lab = labelSprite("🐈 MEONG!", "#ffe1b8", 0.45); lab.position.y = 2.6; g.add(lab);
    return g;
  }

  // ---------------- state ----------------
  const S = {
    mode: "menu", prevMode: "play", driver: null, carType: "mpv",
    x: 0, z: 0, a: 0, v: 0, time: SHIFT, score: 0, delivered: 0, stars: 0, failed: 0, bumpsHit: 0,
    orders: [], nextId: 1, spawnT: 0, boost: 0, kopi: 2, hitCd: 0, bumpCd: 0, brakeT: 0,
    route: null, s: 0, manual: false, zoneLock: null, react: null, catT: 18, cat: null,
    npcs: [], clients: [], mini: null, beacons: {}, run: 0,
  };
  let carMesh = null, driverPerson = null;
  const tweens = [];
  function tween(dur, fn) { return new Promise((res) => tweens.push({ t: 0, dur, fn, res })); }
  function updateTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; tw.t = Math.min(tw.dur, tw.t + dt);
      tw.fn(tw.t / tw.dur);
      if (tw.t >= tw.dur) { tweens.splice(i, 1); tw.res(); }
    }
  }

  // penanda tujuan & titik rute
  const marker = (() => {
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0xffd23f, depthTest: false });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 4), m); cone.rotation.x = Math.PI; g.add(cone);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.2, 28), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    g.traverse((o) => (o.renderOrder = 15));
    g.visible = false; scene.add(g);
    return { g, cone, ring };
  })();
  const DOTS = 260;
  const dots = new THREE.InstancedMesh(BOXG, new THREE.MeshBasicMaterial({ color: 0xffd23f }), DOTS);
  dots.count = 0; scene.add(dots);
  function beacon(color) {
    const g = new THREE.Group();
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }));
    col.position.y = 13; g.add(col);
    g.visible = false; scene.add(g); return g;
  }

  // ---------------- rute di jaringan jalan ----------------
  const nk = (i, j) => i * (NB + 1) + j;
  function snapToRoad(x, z) {
    const kx = clamp(Math.round((x + HALF) / CELL), 0, NB), kz = clamp(Math.round((z + HALF) / CELL), 0, NB);
    const dx = Math.abs(x - RL(kx)), dz = Math.abs(z - RL(kz));
    if (dz <= dx) {
      const cx = clamp(x, -HALF, HALF), i0 = clamp(Math.floor((cx + HALF) / CELL), 0, NB - 1);
      return { x: cx, z: RL(kz), A: [i0, kz], B: [i0 + 1, kz] };
    }
    const cz = clamp(z, -HALF, HALF), j0 = clamp(Math.floor((cz + HALF) / CELL), 0, NB - 1);
    return { x: RL(kx), z: cz, A: [kx, j0], B: [kx, j0 + 1] };
  }
  const nodePt = ([i, j]) => ({ x: RL(i), z: RL(j) });
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function shortest(st, en) {
    const N = (NB + 1) * (NB + 1), dist = new Array(N).fill(Infinity), prev = new Array(N).fill(-1), done = new Array(N).fill(false);
    dist[nk(...st.A)] = d2(st, nodePt(st.A));
    dist[nk(...st.B)] = Math.min(dist[nk(...st.B)], d2(st, nodePt(st.B)));
    for (;;) {
      let u = -1, best = Infinity;
      for (let n = 0; n < N; n++) if (!done[n] && dist[n] < best) { best = dist[n]; u = n; }
      if (u < 0) break;
      done[u] = true;
      const ui = Math.floor(u / (NB + 1)), uj = u % (NB + 1);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([di, dj]) => {
        const a = ui + di, b = uj + dj; if (a < 0 || a > NB || b < 0 || b > NB) return;
        const n = nk(a, b); if (dist[u] + CELL < dist[n]) { dist[n] = dist[u] + CELL; prev[n] = u; }
      });
    }
    const cC = dist[nk(...en.A)] + d2(en, nodePt(en.A)), cD = dist[nk(...en.B)] + d2(en, nodePt(en.B));
    let n = cC <= cD ? nk(...en.A) : nk(...en.B);
    const path = [];
    while (n >= 0) { path.unshift({ x: RL(Math.floor(n / (NB + 1))), z: RL(n % (NB + 1)) }); n = prev[n]; }
    return path;
  }
  function centerPath(from, to) {
    const st = snapToRoad(from.x, from.z), en = snapToRoad(to.x, to.z);
    const same = st.A[0] === en.A[0] && st.A[1] === en.A[1] && st.B[0] === en.B[0] && st.B[1] === en.B[1];
    const pts = same ? [st, en] : [st, ...shortest(st, en), en];
    return pts.map((p) => ({ x: p.x, z: p.z })).filter((p, i, arr) => i === 0 || d2(p, arr[i - 1]) > 0.01);
  }
  // geser ke lajur kiri (Indonesia jalan di kiri)
  function laneOffset(pts) {
    if (pts.length < 2) return pts.slice();
    const nrm = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const dx = pts[k + 1].x - pts[k].x, dz = pts[k + 1].z - pts[k].z, l = Math.hypot(dx, dz) || 1;
      nrm.push({ x: dz / l, z: -dx / l });
    }
    return pts.map((p, k) => {
      let n;
      if (k === 0) n = nrm[0];
      else if (k === pts.length - 1) n = nrm[k - 1];
      else {
        const a = nrm[k - 1], b = nrm[k], dot = a.x * b.x + a.z * b.z;
        n = dot > 0.5 ? b : dot < -0.5 ? { x: 0, z: 0 } : { x: a.x + b.x, z: a.z + b.z };
      }
      return { x: p.x + n.x * LANE, z: p.z + n.z * LANE };
    });
  }
  function planRoute(key) {
    const z = zones[key];
    const off = laneOffset(centerPath({ x: S.x, z: S.z }, z));
    const pts = [{ x: S.x, z: S.z }, ...off].filter((p, i, arr) => i === 0 || d2(p, arr[i - 1]) > 0.05);
    const cum = [0];
    for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + d2(pts[k], pts[k - 1]));
    const turns = pts.map((p, k) => {
      if (k === 0 || k === pts.length - 1) return false;
      const a = Math.atan2(p.x - pts[k - 1].x, p.z - pts[k - 1].z), b = Math.atan2(pts[k + 1].x - p.x, pts[k + 1].z - p.z);
      return Math.abs(wrapA(b - a)) > 0.3;
    });
    // polisi tidur yang dilewati rute
    const hits = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const p = pts[k], q = pts[k + 1];
      bumps.forEach((b) => {
        let s = -1;
        if (Math.abs(p.z - q.z) < 0.01 && b.axis === "x" && Math.abs(p.z - b.z) < 2.6 && b.x >= Math.min(p.x, q.x) && b.x <= Math.max(p.x, q.x)) s = cum[k] + Math.abs(b.x - p.x);
        if (Math.abs(p.x - q.x) < 0.01 && b.axis === "z" && Math.abs(p.x - b.x) < 2.6 && b.z >= Math.min(p.z, q.z) && b.z <= Math.max(p.z, q.z)) s = cum[k] + Math.abs(b.z - p.z);
        if (s > 1.5) hits.push({ s, state: "wait" });
      });
    }
    hits.sort((a, b) => a.s - b.s);
    S.route = { key, pts, cum, turns, total: cum[cum.length - 1], bumps: hits };
    S.s = 0;
  }
  function pointAt(s) {
    const r = S.route; let k = 1;
    while (k < r.pts.length - 1 && r.cum[k] < s) k++;
    const a = r.pts[k - 1], b = r.pts[k], seg = r.cum[k] - r.cum[k - 1] || 1, t = clamp((s - r.cum[k - 1]) / seg, 0, 1);
    return { x: lerp(a.x, b.x, t), z: lerp(a.z, b.z, t), dir: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  // ---------------- order ----------------
  const skill = (k) => S.driver && S.driver.skill === k;
  const loadedOrders = () => S.orders.filter((o) => o.status === "load");
  const waitingOrders = () => S.orders.filter((o) => o.status === "wait");
  const loadedCount = () => loadedOrders().reduce((s, o) => s + o.items.length, 0);
  function spawnOrder() {
    const busy = new Set(S.orders.map((o) => o.place.key));
    const free = PLACES.filter((p) => !busy.has(p.key));
    if (!free.length) return;
    const place = pick(free);
    const n = Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
    const items = Array.from({ length: n }, () => pick(ITEM_KEYS));
    const others = CREW.filter((c) => c.id !== S.driver.id);
    const client = pick(others.length ? others : CREW);
    const d = Math.hypot(zones[place.key].x - zones.depot.x, zones[place.key].z - zones.depot.z);
    const limit = Math.round(55 + d * 0.7 + (skill("tikus") ? 15 : 0));
    S.orders.push({ id: S.nextId++, place, items, client, limit, left: limit, status: "wait", cond: 1, fresh: true });
    renderOrders();
  }
  function showClient(order) {
    const z = zones[order.place.key];
    const p = makePerson(order.client, 0.9);
    p.g.position.copy(z.door); p.g.rotation.y = 0.6;
    scene.add(p.g); p.order = order.id; S.clients.push(p);
  }
  function hideClient(order) {
    S.clients = S.clients.filter((p) => { if (p.order === order.id) { scene.remove(p.g); return false; } return true; });
  }

  // ---------------- lalu lintas ----------------
  function setupTraffic() {
    S.npcs.forEach((n) => scene.remove(n.g));
    S.npcs = [];
    const drivers = shuffle(CREW.filter((c) => c !== S.driver));
    for (let k = 0; k < 10; k++) {
      const i = Math.floor(rand(0, NB + 1)), j = Math.floor(rand(0, NB + 1));
      const driver = drivers.length ? drivers[k % drivers.length] : null;
      const n = { g: makeNpcCar(driver), driver, i, j, ti: i, tj: j, pi: -1, pj: -1, t: 1, sp: rand(6, 8.5), x: RL(i), z: RL(j), a: 0, hold: 0 };
      scene.add(n.g); S.npcs.push(n);
    }
  }
  function npcNext(n) {
    n.pi = n.i; n.pj = n.j; n.i = n.ti; n.j = n.tj;
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([di, dj]) => {
      const a = n.i + di, b = n.j + dj;
      return a >= 0 && a <= NB && b >= 0 && b <= NB && !(a === n.pi && b === n.pj);
    });
    const [di, dj] = pick(opts);
    n.ti = n.i + di; n.tj = n.j + dj; n.t = 0;
  }
  function updateTraffic(dt) {
    S.npcs.forEach((n) => {
      // mengalah kalau mobil kita ada di depan
      const fx = Math.sin(n.a), fz = Math.cos(n.a), px = S.x - n.x, pz = S.z - n.z;
      const ahead = px * fx + pz * fz, side = Math.abs(px * fz - pz * fx);
      if (n.hold > 0) n.hold -= dt;
      const blocked = n.hold > 0 || (S.mode !== "menu" && ahead > 0 && ahead < 6.5 && side < 2.6);
      if (!blocked) {
        if (n.t >= 1) npcNext(n);
        n.t = Math.min(1, n.t + (n.sp * dt) / CELL);
      }
      const ax = RL(n.i), az = RL(n.j), bx = RL(n.ti), bz = RL(n.tj);
      const dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
      n.x = lerp(ax, bx, n.t) + dz * LANE; n.z = lerp(az, bz, n.t) - dx * LANE;
      if (dx || dz) n.a = Math.atan2(dx, dz);
      n.g.position.set(n.x, 0, n.z); n.g.rotation.y = n.a;
    });
  }

  // ---------------- input ----------------
  const keys = {};
  const DRIVE_KEYS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"];
  addEventListener("keydown", (e) => {
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (S.mode === "mini") {
      // keyboard di mini-game: 1/2/3 untuk kabel, spasi untuk install
      if (S.mini && S.mini.kind === "kabel" && ["Digit1", "Digit2", "Digit3"].includes(e.code)) { const b = document.querySelectorAll("#plugs button")[+e.code.slice(-1) - 1]; if (b) b.click(); }
      if (S.mini && S.mini.kind === "tap" && (e.code === "Space" || e.code === "Enter") && !e.repeat) tapInstall();
      return;
    }
    if ((e.code === "Escape" || e.code === "KeyP") && (S.mode === "play" || S.mode === "pause")) { togglePause(); return; }
    if (S.mode !== "play") return;
    if (e.code === "Space" && S.react) { doReact(); return; }
    if (e.code === "Enter" && !e.repeat) nextAction();
    if (e.code === "KeyK" && !e.repeat) drinkKopi();
    if (e.code === "KeyH" && !e.repeat) { sfx.horn(); say(pick(["Tiiin tiiin!", "Permisi, Pak!"])); }
    if (DRIVE_KEYS.includes(e.code) && !S.manual) {
      S.manual = true; S.route = null; clearReact();
      say("Oke, nyetir sendiri! 🚗");
    }
  });
  addEventListener("keyup", (e) => { keys[e.code] = false; });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; });

  // ketuk peta
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let downAt = null;
  canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 12) return;
    downAt = null;
    if (S.mode !== "play") return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(tapTargets, false)[0];
    if (hit) goTo(hit.object.userData.target, true);
  });

  // ---------------- HUD ----------------
  let bubbleT = 0;
  function say(text) { const b = $("bubble"); b.textContent = text; b.hidden = false; b.style.animation = "none"; void b.offsetWidth; b.style.animation = ""; bubbleT = 2.6; }
  function toast(text) {
    const t = document.createElement("div"); t.className = "toast"; t.textContent = text; document.body.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  }
  function renderOrders() {
    const target = S.route ? S.route.key : null;
    $("orders").innerHTML = S.orders.map((o) => {
      const st = o.status === "load" ? "🚐 di mobil" : "📦 di gudang";
      const items = o.items.map((k) => ITEMS[k].icon).join("");
      const isT = (o.status === "load" && target === o.place.key) || (o.status === "wait" && target === "depot");
      return `<button class="order ${o.status === "load" ? "loaded" : ""}${o.left < 15 ? " urgent" : ""}${o.fresh ? " new" : ""}${isT ? " target" : ""}" data-id="${o.id}">
        <img src="faces/${o.client.id}.png" alt=""><span class="o-txt">${o.place.icon} ${o.place.label}<small>${o.client.name} · ${items}</small></span>
        <span class="o-st">${st}</span><i class="bar" style="width:${(o.left / o.limit) * 100}%"></i></button>`;
    }).join("");
    S.orders.forEach((o) => (o.fresh = false));
  }
  $("orders").addEventListener("click", (e) => {
    const b = e.target.closest(".order"); if (!b || S.mode !== "play") return;
    const o = S.orders.find((x) => x.id === +b.dataset.id); if (!o) return;
    goTo(o.status === "load" ? o.place.key : "depot", true);
  });
  function updateOrderBars() {
    S.orders.forEach((o) => {
      const el = document.querySelector(`.order[data-id="${o.id}"]`);
      if (!el) return;
      el.querySelector(".bar").style.width = (o.left / o.limit) * 100 + "%";
      el.classList.toggle("urgent", o.left < 15);
    });
  }
  function renderCargo() {
    const cap = CARS[S.carType].cap, list = [];
    loadedOrders().forEach((o) => o.items.forEach((k) => list.push({ k, c: o.cond })));
    let h = '<span class="cargo-lab">Muatan</span>';
    for (let i = 0; i < cap; i++) {
      const it = list[i];
      if (it) { const col = it.c > 0.7 ? "#22c27a" : it.c > 0.4 ? "#ffb020" : "#ff4a4a"; h += `<div class="slot full">${ITEMS[it.k].icon}<i style="width:${Math.max(8, it.c * 85)}%;background:${col}"></i></div>`; }
      else h += '<div class="slot"></div>';
    }
    $("cargo").innerHTML = h;
    if (carMesh) carMesh.roofBoxes.forEach((b, i) => (b.visible = i < list.length));
  }
  function renderKopi() {
    $("kopi-n").textContent = S.boost > 0 ? Math.ceil(S.boost) + "s" : S.kopi + "x";
    $("b-kopi").disabled = S.kopi <= 0 && S.boost <= 0;
    $("b-kopi").classList.toggle("on", S.boost > 0);
  }
  // tombol kuning besar: selalu menunjukkan langkah berikutnya
  function suggestion() {
    const loaded = loadedOrders();
    if (loaded.length) {
      let best = null, bd = 1e9;
      loaded.forEach((o) => { const z = zones[o.place.key], d = Math.hypot(z.x - S.x, z.z - S.z); if (d < bd) { bd = d; best = o; } });
      return { key: best.place.key, html: `▶ Antar ke ${best.place.icon} ${best.place.label}<small>${best.client.name} sudah nunggu</small>` };
    }
    if (waitingOrders().length) return { key: "depot", html: "▶ Ambil barang di 🏭 Gudang<small>Ada order baru masuk</small>" };
    return null;
  }
  let lastBtn = "";
  function renderNext() {
    const b = $("b-next");
    let html, cls;
    if (S.mode !== "play") { html = lastBtn ? null : "…"; cls = b.className; }
    if (S.mode === "play") {
      if (S.route) { const p = placeOf(S.route.key); html = `🚐 Lagi jalan ke ${p.icon} ${p.label}…<small>Ketuk gedung lain kalau mau ganti tujuan</small>`; cls = "go busy"; }
      else if (S.manual) { const sg = suggestion(); html = sg ? sg.html.replace("▶", "▶ Jalan otomatis:") : "⏳ Tunggu order baru…"; cls = "go"; }
      else { const sg = suggestion(); html = sg ? sg.html : "⏳ Tunggu order baru…<small>Sebentar lagi ada yang pesan</small>"; cls = sg ? "go pulse" : "go busy"; }
    }
    if (html && html !== lastBtn) { b.innerHTML = html; lastBtn = html; }
    if (cls && b.className !== cls) b.className = cls;
  }

  // ---------------- aksi pemain ----------------
  function goTo(key, fromTap) {
    if (S.mode !== "play") return;
    if (key !== "depot") {
      const o = S.orders.find((x) => x.place.key === key);
      if (!o) { say(`Belum ada order dari ${placeOf(key).label}.`); sfx.wrong(); return; }
      if (o.status === "wait") { say(`Barang buat ${o.place.label} masih di gudang. Ambil dulu ya!`); key = "depot"; }
    } else if (!waitingOrders().length) {
      say(loadedOrders().length ? "Antar dulu barang yang di mobil." : "Belum ada barang di gudang."); sfx.wrong(); return;
    }
    if (fromTap) sfx.click();
    S.manual = false; S.zoneLock = null; clearReact();
    const z = zones[key];
    if (Math.hypot(S.x - z.x, S.z - z.z) < 4.5) { S.route = null; arrive(key); return; }
    planRoute(key);
    renderOrders();
    const p = placeOf(key);
    say(pick(["Otw ", "Gas ke ", "Meluncur ke "]) + p.label + "!");
  }
  function nextAction() {
    if (S.mode !== "play" || S.route) return;
    const sg = suggestion();
    if (sg) goTo(sg.key, true); else say("Belum ada order. Tunggu sebentar ya.");
  }
  function drinkKopi() {
    if (S.mode !== "play" || S.kopi <= 0 || S.boost > 0) return;
    S.kopi--; S.boost = 7; sfx.power(); toast("☕ NGEBUT!"); say("Ngopi dulu biar melek ☕"); renderKopi();
  }
  $("b-next").onclick = () => nextAction();
  $("b-kopi").onclick = () => drinkKopi();

  // ---------------- tombol reaksi (PELAN / REM) ----------------
  function showReact(kind, secs) {
    const b = $("b-react");
    b.className = "react" + (kind === "bump" ? " slow" : "");
    b.innerHTML = (kind === "bump" ? "<span>🐢</span>PELAN!" : kind === "car" ? "<span>🚗</span>REM!" : "<span>✋</span>REM!") + `<i style="--d:${secs.toFixed(2)}s"></i>`;
    b.hidden = false; sfx.alert();
  }
  function clearReact() { S.react = null; $("b-react").hidden = true; }
  function doReact() {
    const r = S.react; if (!r) return;
    if (r.kind === "bump") { r.hit.state = "slow"; say(pick(["Pelan-pelan… aman!", "Sip, barang aman."])); }
    else if (r.kind === "car") { S.brakeT = 1.6; S.carCd = 2.5; say(pick(["Hampir nabrak! Fiuh…", "Woy, mobilnya nyelonong!"])); }
    else { S.brakeT = 1.4; say("Eh, ada kucing! Hampir aja."); }
    sfx.good(); toast("👍 Aman!");
    clearReact();
  }
  $("b-react").addEventListener("pointerdown", (e) => { e.preventDefault(); doReact(); });

  // ---------------- tiba di tujuan ----------------
  function sideSpot(target) {
    const lx = Math.cos(S.a), lz = -Math.sin(S.a);
    const a = { x: S.x + lx * 2.2, z: S.z + lz * 2.2 }, b = { x: S.x - lx * 2.2, z: S.z - lz * 2.2 };
    return d2(a, target) < d2(b, target) ? a : b;
  }
  async function walkTo(p, to, speed = 5.5) {
    const from = p.g.position.clone(), dist = Math.hypot(to.x - from.x, to.z - from.z);
    p.g.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    await tween(Math.max(0.3, dist / speed), (k) => {
      p.g.position.x = lerp(from.x, to.x, k); p.g.position.z = lerp(from.z, to.z, k);
      const sw = Math.sin(k * dist * 2.2) * 0.6;
      p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw;
      if (!p.carry.visible) { p.arms[0].rotation.x = -sw; p.arms[1].rotation.x = sw; }
    });
    p.legs.forEach((l) => (l.rotation.x = 0));
  }
  function holdBox(p, on) { p.carry.visible = on; p.arms.forEach((a) => (a.rotation.x = on ? -1.2 : 0)); }
  async function hopOut(door) {
    const st = sideSpot(door);
    driverPerson.g.position.set(st.x, 0.35, st.z); driverPerson.g.visible = true; carMesh.head.visible = false;
    holdBox(driverPerson, false);
    return st;
  }
  function hopIn() { driverPerson.g.visible = false; carMesh.head.visible = true; holdBox(driverPerson, false); }

  function arrive(key) {
    S.route = null; S.v = 0; clearReact(); S.zoneLock = key;
    renderOrders();
    if (key === "depot") doLoad(); else doDeliver(key);
  }
  async function doLoad() {
    const waiting = waitingOrders();
    if (!waiting.length) { say("Belum ada barang di gudang."); return; }
    const room = CARS[S.carType].cap - loadedCount();
    const fit = []; let free = room;
    waiting.forEach((o) => { if (o.items.length <= free) { fit.push(o); free -= o.items.length; } });
    if (!fit.length) { say("Mobil penuh! Antar dulu barangnya."); sfx.wrong(); return; }
    const run = S.run;
    S.mode = "anim";
    const door = zones.depot.door;
    const st = await hopOut(door);
    await walkTo(driverPerson, { x: door.x, z: door.z });
    if (run !== S.run) return;
    await wait(250);
    holdBox(driverPerson, true); sfx.load();
    await walkTo(driverPerson, st, 4.5);
    if (run !== S.run) return;
    hopIn();
    fit.forEach((o) => { if (S.orders.includes(o)) { o.status = "load"; o.cond = 1; showClient(o); } });
    toast("📦 Barang dimuat!");
    say(fit.length > 1 ? `Muat ${fit.length} order, gas!` : "Kardus aman, Bos. Siap antar!");
    S.mode = "play";
    renderOrders(); renderCargo();
  }
  async function doDeliver(key) {
    const o = loadedOrders().find((x) => x.place.key === key);
    if (!o) {
      const w = S.orders.find((x) => x.place.key === key);
      say(w ? "Barangnya masih di gudang. Ambil dulu ya!" : "Ordernya sudah batal 😢");
      return;
    }
    const run = S.run;
    S.mode = "anim";
    const client = S.clients.find((c) => c.order === o.id);
    const door = zones[key].door;
    const spot = { x: door.x - 2.0, z: door.z + 0.6 };
    const st = await hopOut(door);
    holdBox(driverPerson, true);
    await walkTo(driverPerson, spot, 4.5);
    if (run !== S.run) return;
    driverPerson.g.rotation.y = Math.PI / 2;
    if (client) client.g.rotation.y = -Math.PI / 2;
    holdBox(driverPerson, false);
    openMini(o, async () => {
      if (run !== S.run) return;
      S.mode = "anim";
      await walkTo(driverPerson, st);
      if (run !== S.run) return;
      hopIn();
      S.mode = "play";
    });
  }

  // ---------------- mini-game pasang ----------------
  const COLORS = [["#ff4a4a", "MERAH"], ["#2f6fe0", "BIRU"], ["#22c27a", "HIJAU"]];
  function openMini(order, after) {
    S.mode = "mini";
    const base = 10 + (skill("teknisi") ? 3 : 0);
    const kind = Math.random() < 0.5 ? "kabel" : "tap";
    const m = { order, kind, t: base, T: base, step: 0, done: false, seq: [], taps: 0, need: 8 + order.items.length * 2, after };
    S.mini = m;
    $("mini-face").src = "faces/" + order.client.id + ".png";
    $("mini-name").textContent = order.client.name + " · " + order.place.label;
    $("mini-say").textContent = pick(["Akhirnya dateng juga! Tolong pasangin ya.", "Wah cepet! Langsung colok aja.", "Udah ditungguin dari tadi nih 😅", "Mantap, pasang di meja itu ya."]);
    const body = $("mini-body");
    if (kind === "kabel") {
      $("mini-title").textContent = "🔌 Colok kabelnya!";
      $("mini-help").textContent = "Ketuk tombol warna sesuai urutan kotak di atas, dari kiri.";
      m.seq = [0, 1, 2].sort(() => Math.random() - 0.5);
      body.innerHTML = `<div class="seq">${m.seq.map((c, i) => `<span style="background:${COLORS[c][0]}" class="${i === 0 ? "next" : ""}">${i + 1}</span>`).join("")}</div>
        <div class="plugs" id="plugs">${[0, 1, 2].map((c) => `<button data-c="${c}" style="background:${COLORS[c][0]};color:#fff">🔌<br><small style="font-size:14px">${COLORS[c][1]}</small></button>`).join("")}</div>`;
      $("plugs").onclick = (e) => {
        const b = e.target.closest("button"); if (!b || m.done) return;
        if (+b.dataset.c === m.seq[m.step]) {
          sfx.click(); m.step++;
          body.querySelectorAll(".seq span").forEach((s, i) => { s.className = i < m.step ? "done" : i === m.step ? "next" : ""; });
          if (m.step >= m.seq.length) finishMini(true);
        } else {
          sfx.wrong(); m.t = Math.max(0.5, m.t - 1);
          const pl = $("plugs"); pl.classList.remove("shake"); void pl.offsetWidth; pl.classList.add("shake");
        }
      };
    } else {
      $("mini-title").textContent = "💿 Install programnya!";
      $("mini-help").textContent = "Ketuk tombol biru berkali-kali sampai 100%.";
      body.innerHTML = `<div class="prog"><i id="prog"></i><span id="prog-t">0%</span></div><button class="btn tapper" id="tapper" style="background:#bfe0ff">KETUK! 👆</button>`;
      $("tapper").onpointerdown = (e) => { e.preventDefault(); tapInstall(); };
    }
    $("mini").hidden = false;
    $("mini-bar").style.width = "100%";
  }
  function tapInstall() {
    const m = S.mini; if (!m || m.done || m.kind !== "tap") return;
    m.taps++; beep(300 + m.taps * 30, 0.05, "triangle", 0.04);
    const p = Math.min(100, (m.taps / m.need) * 100);
    $("prog").style.width = p + "%"; $("prog-t").textContent = Math.round(p) + "%";
    if (m.taps >= m.need) finishMini(true);
  }
  function finishMini(ok) {
    const m = S.mini; if (!m || m.done) return; m.done = true;
    const o = m.order, cond = clamp(o.cond, 0, 1);
    let pay = o.items.length * 70 * (0.35 + 0.65 * cond) + o.left * 1.5 + (ok ? 60 : 0);
    if (skill("lobi")) pay *= 1.3;
    if (!ok) pay *= 0.6;
    const stars = ok ? (cond > 0.8 ? 3 : cond > 0.5 ? 2 : 1) : 1;
    S.score += pay; S.delivered++; S.stars += stars;
    S.orders = S.orders.filter((x) => x !== o);
    $("mini-title").textContent = (ok ? "Beres! " : "Kelamaan… ") + "⭐".repeat(stars);
    $("mini-help").textContent = cond < 0.6 ? "Barangnya agak penyok karena kebanting di jalan." : "";
    $("mini-say").textContent = ok ? pick(["Makasih banyak! Nanti order lagi ya.", "Mantap, langsung nyala!", "Rapi banget pasangnya 👍"]) : "Ya udah deh, makasih… 😐";
    sfx.coin();
    const run = S.run;
    setTimeout(() => {
      if (run !== S.run) return;
      $("mini").hidden = true; S.mini = null;
      hideClient(o);
      toast("+" + money(pay));
      say(ok ? pick(["Beres, Bos!", "Satu lagi kelar!", "Gampang itu mah."]) : "Waduh, kurang cepet…");
      renderOrders(); renderCargo();
      m.after();
    }, 1300);
  }

  // ---------------- kerusakan ----------------
  function damage(amount, reason) {
    const k = amount * CARS[S.carType].armor * (skill("halus") ? 0.65 : 1);
    let any = false;
    loadedOrders().forEach((o) => { const f = Math.max(...o.items.map((i) => ITEMS[i].fragile)); o.cond = Math.max(0, o.cond - k * f); any = true; });
    if (reason) say(reason);
    if (any) renderCargo();
  }

  // ---------------- update logika ----------------
  function stepPlay(dt) {
    const car = CARS[S.carType];
    S.time -= dt;
    if (S.time <= 0) { S.time = 0; endShift(false); return; }
    S.spawnT -= dt;
    if (S.orders.length < 4 && S.spawnT <= 0) { spawnOrder(); S.spawnT = rand(6, 10); }
    let changed = false;
    S.orders.slice().forEach((o) => {
      o.left -= dt;
      if (o.left <= 0) {
        S.orders = S.orders.filter((x) => x !== o); hideClient(o); S.failed++; S.score = Math.max(0, S.score - 30); changed = true;
        toast("⏰ " + o.client.name + " kecewa…"); sfx.wrong();
      }
    });
    if (changed) { renderOrders(); renderCargo(); }
    S.boost = Math.max(0, S.boost - dt); S.brakeT = Math.max(0, S.brakeT - dt);
    S.hitCd = Math.max(0, S.hitCd - dt); S.bumpCd = Math.max(0, S.bumpCd - dt);
    const vmax = car.max * (S.boost > 0 ? 1.5 : 1) * (skill("ngebut") ? 1.1 : 1);

    if (S.manual) stepManual(dt, car, vmax);
    else if (S.route) stepAuto(dt, car, vmax);
    else S.v = 0;

    // keluar dari zona -> boleh berhenti lagi di zona itu
    if (S.zoneLock) { const z = zones[S.zoneLock]; if (Math.hypot(S.x - z.x, S.z - z.z) > 7) S.zoneLock = null; }
  }
  // nabrak mobil orang = bayar ganti rugi ke sopirnya
  function payFine(n, base) {
    const fine = Math.round(base + rand(0, 40));
    S.score = Math.max(0, S.score - fine); S.fines += fine; S.crashes++;
    n.hold = 1.6;
    const who = n.driver ? n.driver.name : "sopir";
    toast(`💸 Ganti rugi ${money(fine)}`);
    say(`${who}: "Woy! Ganti rugi!" 😤`);
    if (n.driver) showFine(n.driver, fine);
  }
  function showFine(c, fine) {
    let el = $("fine");
    if (!el) { el = document.createElement("div"); el.id = "fine"; el.className = "fine"; document.body.appendChild(el); }
    el.innerHTML = `<img src="faces/${c.id}.png" alt=""><div><b>${c.name} minta ganti rugi!</b><br>Mobilnya penyok. Kamu bayar <b>${money(fine)}</b> 💸</div>`;
    el.hidden = false; el.style.animation = "none"; void el.offsetWidth; el.style.animation = "";
    clearTimeout(showFine.t); showFine.t = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function crashInto(n) {
    S.v = 0; S.brakeT = 0.9; S.carCd = 4; S.shake = 0.5;
    sfx.crash(); carMesh.body.position.y = 0.4;
    damage(0.18, null);
    payFine(n, 50);
  }
  function stepAuto(dt, car, vmax) {
    const r = S.route, left = r.total - S.s;
    let target = vmax;
    for (let k = 1; k < r.pts.length - 1; k++) if (r.turns[k] && r.cum[k] > S.s) { const d = r.cum[k] - S.s; if (d < 7) target = Math.min(target, 6 + d * 1.4); break; }
    target = Math.min(target, Math.sqrt(2 * 14 * Math.max(0, left)) + 1);
    r.bumps.forEach((b) => { if (b.state === "slow" && Math.abs(b.s - S.s) < 4) target = Math.min(target, 4.5); });
    if (S.brakeT > 0) target = 0;
    if (S.v < target) S.v = Math.min(target, S.v + car.acc * dt); else S.v = Math.max(target, S.v - 32 * dt);
    S.s = Math.min(r.total, S.s + S.v * dt);
    const p = pointAt(S.s);
    S.x = p.x; S.z = p.z;
    S.a += wrapA(p.dir - S.a) * Math.min(1, dt * 9);

    // polisi tidur
    r.bumps.forEach((b) => {
      if (b.state === "done") return;
      const ahead = b.s - S.s;
      if (b.state === "wait" && !S.react && ahead > 0 && ahead < 14 && S.v > 7) {
        S.react = { kind: "bump", hit: b }; showReact("bump", Math.max(0.6, ahead / S.v));
      }
      if (ahead <= 0) {
        if (S.react && S.react.hit === b) clearReact();
        carMesh.body.position.y = 0.5; sfx.bump();
        if (b.state !== "slow" && S.v > 8) { damage(0.16, pick(["Gedebuk! Polisi tidur 😵", "Aduh, barangnya kebanting!"])); S.bumpsHit++; S.shake = 0.35; }
        b.state = "done";
      }
    });
    // kucing nyebrang
    S.catT -= dt;
    if (S.catT <= 0 && !S.react && !S.cat && left > 26 && S.v > 8) {
      const at = S.s + 15, p2 = pointAt(at);
      const g = makeCat(); g.position.set(p2.x - Math.cos(p2.dir) * 4, 0, p2.z + Math.sin(p2.dir) * 4);
      g.rotation.y = p2.dir + Math.PI / 2; scene.add(g);
      S.cat = { g, at, t: 0, from: g.position.clone(), to: new THREE.Vector3(p2.x + Math.cos(p2.dir) * 4, 0, p2.z - Math.sin(p2.dir) * 4) };
      S.react = { kind: "cat" }; showReact("cat", Math.max(0.8, 11 / S.v));
      S.catT = rand(16, 26);
    }
    if (S.cat) {
      const c = S.cat; c.t += dt / 2.2;
      c.g.position.lerpVectors(c.from, c.to, clamp(c.t, 0, 1));
      if (S.react && S.react.kind === "cat" && S.s >= c.at - 5) {
        clearReact(); S.brakeT = 0.8; damage(0.12, "Rem mendadak! Barangnya kebanting 😬"); sfx.crash(); S.shake = 0.35;
      }
      if (c.t >= 1) { scene.remove(c.g); S.cat = null; if (S.react && S.react.kind === "cat") clearReact(); }
    }
    // mobil lain nyelonong di depan
    S.carCd = Math.max(0, S.carCd - dt);
    {
      const fx = Math.sin(S.a), fz = Math.cos(S.a);
      let hitN = null, hd = 1e9;
      S.npcs.forEach((n) => { const px = n.x - S.x, pz = n.z - S.z, ah = px * fx + pz * fz, sd = Math.abs(px * fz - pz * fx); if (ah > 0 && ah < 10 && sd < 2.4 && ah < hd) { hd = ah; hitN = n; } });
      if (S.react && S.react.kind === "car" && (!hitN || S.v < 3)) clearReact();
      if (hitN && S.carCd <= 0 && S.v > 6) {
        if (!S.react) { S.react = { kind: "car", npc: hitN }; showReact("car", Math.max(0.6, (hd - 3.4) / S.v)); }
        else if (S.react.kind === "car" && hd < 3.4) { clearReact(); crashInto(hitN); }
      }
    }
    if (S.s >= r.total - 0.01) arrive(r.key);
  }
  function stepManual(dt, car, vmax) {
    let wx = 0, wz = 0;
    // panah: tiap tombol = satu arah jalan (jalan di layar miring)
    if (keys.ArrowLeft || keys.KeyA) wx -= 1;
    if (keys.ArrowRight || keys.KeyD) wx += 1;
    if (keys.ArrowUp || keys.KeyW) wz -= 1;
    if (keys.ArrowDown || keys.KeyS) wz += 1;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 0.1) {
      const diff = wrapA(Math.atan2(wx, wz) - S.a), fwd = Math.cos(diff);
      S.a += clamp(diff * 3, -1, 1) * car.turn * (fwd < 0.3 ? 1.7 : 1) * clamp(Math.abs(S.v) / 6, 0.7, 1) * dt;
      if (fwd < 0.3) S.v -= Math.sign(S.v) * Math.min(Math.abs(S.v), 25 * dt);
      else S.v += car.acc * mag * Math.max(0.3, fwd) * dt;
    } else S.v -= Math.sign(S.v) * Math.min(Math.abs(S.v), 12 * dt);
    if (keys.Space) S.v -= Math.sign(S.v) * Math.min(Math.abs(S.v), 40 * dt);
    S.v = clamp(S.v, -4, vmax);
    let nx = S.x + Math.sin(S.a) * S.v * dt, nz = S.z + Math.cos(S.a) * S.v * dt;
    const r = car.r;
    for (const b of solids) {
      if (nx > b.x0 - r && nx < b.x1 + r && nz > b.z0 - r && nz < b.z1 + r) {
        const px = Math.min(nx - (b.x0 - r), (b.x1 + r) - nx), pz = Math.min(nz - (b.z0 - r), (b.z1 + r) - nz);
        if (px < pz) nx = nx - (b.x0 - r) < (b.x1 + r) - nx ? b.x0 - r : b.x1 + r;
        else nz = nz - (b.z0 - r) < (b.z1 + r) - nz ? b.z0 - r : b.z1 + r;
        if (Math.abs(S.v) > 8 && S.hitCd <= 0) { damage(Math.abs(S.v) * 0.01, pick(["Aduh, nabrak trotoar!", "Waduh, hati-hati!"])); S.hitCd = 0.6; S.shake = 0.35; sfx.crash(); }
        S.v *= 0.35;
      }
    }
    S.x = nx; S.z = nz;
    S.npcs.forEach((n) => {
      const dx = S.x - n.x, dz = S.z - n.z, d = Math.hypot(dx, dz), min = r + 1.6;
      if (d < min && d > 0.001) {
        S.x += (dx / d) * (min - d); S.z += (dz / d) * (min - d);
        if (S.hitCd <= 0 && Math.abs(S.v) > 5) { damage(0.1, null); S.hitCd = 1.2; S.shake = 0.4; sfx.crash(); payFine(n, 30 + Math.abs(S.v) * 2); }
        S.v *= 0.4;
      }
    });
    for (const b of bumps) {
      const on = b.axis === "x" ? Math.abs(S.x - b.x) < 0.9 && Math.abs(S.z - b.z) < ROAD / 2 : Math.abs(S.z - b.z) < 0.9 && Math.abs(S.x - b.x) < ROAD / 2;
      if (on && S.bumpCd <= 0) {
        S.bumpCd = 0.6; carMesh.body.position.y = 0.5; sfx.bump();
        if (Math.abs(S.v) > 10) { damage(0.16, "Gedebuk! Pelan-pelan 😵"); S.bumpsHit++; }
      }
    }
    // berhenti di depan gudang / klien = otomatis muat / antar
    if (Math.abs(S.v) < 3) {
      for (const key of Object.keys(zones)) {
        if (key === S.zoneLock) continue;
        const z = zones[key];
        if (Math.hypot(S.x - z.x, S.z - z.z) < 5) {
          const relevant = key === "depot" ? waitingOrders().length > 0 : loadedOrders().some((o) => o.place.key === key);
          if (relevant) { S.v = 0; arrive(key); return; }
        }
      }
    }
  }
  function tick(dt) {
    if (S.mode === "play") stepPlay(dt);
    if (S.mode === "play" || S.mode === "anim" || S.mode === "mini") updateTweens(dt);
    if (S.mode === "mini" && S.mini && !S.mini.done) {
      S.mini.t -= dt;
      $("mini-bar").style.width = Math.max(0, (S.mini.t / S.mini.T) * 100) + "%";
      if (S.mini.t <= 0) finishMini(false);
    }
    if (S.mode !== "pause") updateTraffic(dt);
  }

  // ---------------- alur layar ----------------
  const screens = ["s-title", "s-pick", "s-pause", "s-result"];
  function show(id) { screens.forEach((s) => ($(s).hidden = s !== id)); }
  function setHud(on) { ["hud", "hud-b"].forEach((k) => ($(k).hidden = !on)); if (!on) { $("bubble").hidden = true; clearReact(); } }
  function renderBoard(el) {
    const list = store.get("ar_scores", []);
    el.innerHTML = "<h3>🏆 Kurir Terbaik (di HP/laptop ini)</h3>" + (list.length
      ? "<ol>" + list.slice(0, 8).map((s) => `<li><b>${s.name}</b> — ${money(s.score)} · ${s.car}</li>`).join("") + "</ol>"
      : '<div class="empty">Belum ada. Jadilah yang pertama!</div>');
  }
  function buildMenus() {
    $("title-faces").innerHTML = CREW.map((c, i) => `<img src="faces/${c.id}.png" alt="${c.name}" style="animation-delay:${i * 0.12}s">`).join("");
    renderBoard($("board-title"));
    const last = store.get("ar_last", {});
    S.driver = CREW.find((c) => c.id === last.d) || CREW[0];
    S.carType = CARS[last.c] ? last.c : "mpv";
    $("crew-grid").innerHTML = CREW.map((c) => `<button class="crew" data-id="${c.id}" aria-pressed="${c === S.driver}"><img src="faces/${c.id}.png" alt=""><b>${c.name}</b><small>⭐ ${c.skillName}</small></button>`).join("");
    $("crew-grid").onclick = (e) => {
      const b = e.target.closest(".crew"); if (!b) return;
      S.driver = CREW.find((c) => c.id === b.dataset.id); sfx.click();
      [...$("crew-grid").children].forEach((x) => x.setAttribute("aria-pressed", x === b));
    };
    $("cars").innerHTML = Object.entries(CARS).map(([k, c]) => `<button class="car" data-k="${k}" aria-pressed="${k === S.carType}"><b>${k === "mpv" ? "🚐" : "🚚"} ${c.name}</b><p>${c.desc}</p>${Object.entries(c.stats).map(([n, v]) => `<div class="stat">${n}<i style="--v:${v}%"></i></div>`).join("")}</button>`).join("");
    $("cars").onclick = (e) => {
      const b = e.target.closest(".car"); if (!b) return;
      S.carType = b.dataset.k; sfx.click();
      [...$("cars").children].forEach((x) => x.setAttribute("aria-pressed", x === b));
    };
  }
  $("b-play").onclick = () => { sfx.click(); show("s-pick"); };
  $("b-back").onclick = () => { sfx.click(); show("s-title"); };
  $("b-go").onclick = () => { store.set("ar_last", { d: S.driver.id, c: S.carType }); startShift(); };
  $("b-pause").onclick = () => togglePause();
  $("b-resume").onclick = () => togglePause();
  $("b-quit").onclick = () => endShift(true);
  $("b-again").onclick = () => startShift();
  $("b-menu").onclick = () => show("s-pick");
  const optRetro = $("opt-retro"), optSound = $("opt-sound");
  optRetro.checked = store.get("ar_retro", false); optSound.checked = soundOn;
  optRetro.onchange = () => { store.set("ar_retro", optRetro.checked); applyQuality(); };
  optSound.onchange = () => { soundOn = optSound.checked; store.set("ar_sound", soundOn); };

  function togglePause() {
    if (S.mode === "play" || S.mode === "anim" || S.mode === "mini") {
      if (S.mode === "mini") return;          // mini-game cuma sebentar, tidak bisa dijeda
      S.prevMode = S.mode; S.mode = "pause"; show("s-pause");
    } else if (S.mode === "pause") { S.mode = S.prevMode; show(null); }
  }
  function clearWorld() {
    tweens.length = 0;
    S.clients.forEach((p) => scene.remove(p.g)); S.clients = [];
    if (S.cat) { scene.remove(S.cat.g); S.cat = null; }
    if (carMesh) scene.remove(carMesh.g);
    if (driverPerson) scene.remove(driverPerson.g);
    $("mini").hidden = true; S.mini = null;
  }
  function startShift() {
    show(null);
    S.run++;
    clearWorld();
    carMesh = makeCar(S.carType, S.driver); scene.add(carMesh.g);
    driverPerson = makePerson(S.driver, 0.9); driverPerson.g.visible = false; scene.add(driverPerson.g);
    const z = zones.depot;
    Object.assign(S, { mode: "play", x: z.x + 9, z: z.z - LANE, a: Math.PI / 2, v: 0, time: SHIFT, score: 0, delivered: 0, stars: 0, failed: 0, bumpsHit: 0, fines: 0, crashes: 0, carCd: 0,
      orders: [], spawnT: 0, boost: 0, kopi: 2, hitCd: 0, bumpCd: 0, brakeT: 0, route: null, s: 0, manual: false, zoneLock: null, catT: 14 });
    clearReact(); setupTraffic();
    spawnOrder(); spawnOrder();
    $("hud-face").src = "faces/" + S.driver.id + ".png";
    lastBtn = "";
    setHud(true); renderOrders(); renderCargo(); renderKopi(); renderNext();
    say("Pencet tombol kuning di bawah ya, Bos! 👇");
    sfx.power();
  }
  function endShift(quit) {
    S.run++;
    S.mode = "menu"; setHud(false); clearWorld(); carMesh = null; driverPerson = null; S.route = null;
    if (quit) { show("s-title"); renderBoard($("board-title")); return; }
    const sc = Math.round(S.score);
    const list = store.get("ar_scores", []);
    list.push({ name: S.driver.name, score: sc, car: CARS[S.carType].name, at: Date.now() });
    list.sort((a, b) => b.score - a.score); store.set("ar_scores", list.slice(0, 20));
    $("r-face").src = "faces/" + S.driver.id + ".png";
    $("r-score").textContent = money(sc);
    const rank = sc >= 1600 ? "👑 Raja Antar Se-Kota" : sc >= 1000 ? "🏅 Kurir Andalan Bos" : sc >= 500 ? "🙂 Kurir Lumayan" : "🐢 Kurir Magang";
    $("r-rank").textContent = S.driver.name + " — " + rank;
    const avg = S.delivered ? (S.stars / S.delivered).toFixed(1) : "-";
    $("r-stats").innerHTML = `<div><b>${S.delivered}</b>terkirim</div><div><b>${avg}⭐</b>rata-rata</div><div><b>${S.failed}</b>telat</div><div><b>${S.bumpsHit}</b>kebanting</div><div><b>${S.crashes}</b>nabrak (−${money(S.fines)})</div>`;
    renderBoard($("board-result")); renderBoard($("board-title"));
    show("s-result");
  }

  // ---------------- render ----------------
  let viewH = 22;
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;               // jendela tersembunyi: jangan rusak ukuran kamera
    renderer.setSize(w, h, false);
    const asp = w / h;
    viewH = clamp(asp < 1 ? (24 / asp) * 0.62 : 21, 19, 34);
    camera.left = -viewH * asp; camera.right = viewH * asp; camera.top = viewH; camera.bottom = -viewH;
    camera.updateProjectionMatrix();
  }
  let basePR = 1;
  function applyQuality() {
    const retro = optRetro.checked;
    document.body.classList.toggle("retro", retro);
    basePR = Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2);
    renderer.setPixelRatio(retro ? basePR / 3 : basePR);
    resize();
  }
  addEventListener("resize", resize);
  const camPos = new THREE.Vector3(), tmp = new THREE.Vector3(), mtx = new THREE.Matrix4(), qI = new THREE.Quaternion(), vA = new THREE.Vector3(), vS = new THREE.Vector3(0.55, 0.06, 0.55);
  let t0 = performance.now(), elapsed = 0, fpsAcc = 0, fpsN = 0, lowered = 0;
  S.shake = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - t0) / 1000, 0.05); t0 = now; elapsed += dt;
    // kalau berat: turunkan resolusi bertahap
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 3) {
      const fps = fpsN / fpsAcc;
      if (fps < 35 && lowered < 2 && !optRetro.checked) { lowered++; renderer.setPixelRatio(lowered === 1 ? Math.min(basePR, 1) : 0.75); resize(); }
      fpsAcc = 0; fpsN = 0;
    }
    tick(dt);
    if (bubbleT > 0) { bubbleT -= dt; if (bubbleT <= 0) $("bubble").hidden = true; }

    const inGame = carMesh && S.mode !== "menu";
    if (inGame) {
      carMesh.g.position.set(S.x, 0, S.z);
      carMesh.g.rotation.y = S.a;
      carMesh.body.position.y = lerp(carMesh.body.position.y, 0, Math.min(1, dt * 8));
      carMesh.head.position.y = carMesh.headY + Math.abs(Math.sin(elapsed * 9)) * 0.12 * Math.min(1, Math.abs(S.v) / 8);
    }
    const fx = inGame ? S.x + Math.sin(S.a) * S.v * 0.22 : Math.sin(elapsed * 0.08) * 30;
    const fz = inGame ? S.z + Math.cos(S.a) * S.v * 0.22 : Math.cos(elapsed * 0.08) * 30;
    camPos.lerp(tmp.set(fx, 0, fz), inGame ? Math.min(1, dt * 4) : 1);
    S.shake = Math.max(0, S.shake - dt);
    const sh = S.shake * 0.8;
    camera.position.set(camPos.x + CAM_OFF.x + rand(-sh, sh), CAM_OFF.y, camPos.z + CAM_OFF.z + rand(-sh, sh));
    camera.lookAt(camPos.x, 0, camPos.z);

    // titik rute & penanda tujuan
    let n = 0;
    if (inGame && S.route) {
      for (let s = S.s + 3; s < S.route.total && n < DOTS; s += 2.2) {
        const p = pointAt(s); dots.setMatrixAt(n++, mtx.compose(vA.set(p.x, 0.14, p.z), qI, vS));
      }
      const z = zones[S.route.key];
      marker.g.visible = true;
      marker.g.position.set(z.x, 0.2, z.z);
      marker.cone.position.y = 7 + Math.sin(elapsed * 5) * 0.6;
      marker.ring.scale.setScalar(1 + Math.sin(elapsed * 4) * 0.08);
    } else marker.g.visible = false;
    dots.count = n; dots.instanceMatrix.needsUpdate = true;
    const want = {};
    if (inGame) {
      loadedOrders().forEach((o) => (want[o.place.key] = true));
      if (waitingOrders().length) want.depot = true;
    }
    Object.keys(zones).forEach((k) => {
      if (!S.beacons[k]) { S.beacons[k] = beacon(k === "depot" ? 0xffcf3f : 0x22c27a); S.beacons[k].position.set(zones[k].x, 0, zones[k].z); }
      S.beacons[k].visible = !!want[k];
      const lab = zones[k].lab, sc = want[k] ? 1.12 + Math.sin(elapsed * 4) * 0.06 : 1;
      lab.scale.set(11 * sc * (k === "depot" ? 1.2 : 1), 2.75 * sc * (k === "depot" ? 1.2 : 1), 1);
    });
    S.clients.forEach((p, i) => { p.arms[1].rotation.z = 2.4 + Math.sin(elapsed * 8 + i) * 0.5; p.head.position.y = 3.9 + Math.abs(Math.sin(elapsed * 4 + i)) * 0.15; });
    if (inGame) {
      if (S.mode === "play") {
        const m = Math.floor(S.time / 60), s = Math.floor(S.time % 60);
        const te = $("hud-time"); te.textContent = m + ":" + String(s).padStart(2, "0"); te.classList.toggle("low", S.time < 20);
        $("hud-score").textContent = money(S.score);
        updateOrderBars(); renderKopi();
      }
      renderNext();
    }
    renderer.render(scene, camera);
  }

  // ---------------- mulai ----------------
  buildCity();
  loadFaces().then(() => {
    CREW = CREW.filter((c) => faceImg[c.id]);   // yang fotonya belum ada disembunyikan dulu
    if (!CREW.length) { err("Foto wajah tidak ketemu. Jalankan game lewat server lokal (lihat README)."); return; }
    buildMenus();
    // kru menyambut di depan gudang
    CREW.slice(0, 4).forEach((c, i) => { const p = makePerson(c, 0.8); p.g.position.set(zones.depot.x - 6.5 + i * 1.6, 0.35, zones.depot.z - 5.8); p.g.rotation.y = 0.5; scene.add(p.g); });
    // alat tes: __ar.sim(detik) menjalankan logika tanpa menunggu layar
    window.__ar = { S, keys, goTo, nextAction, doReact, sim(sec) { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30); return { x: +S.x.toFixed(2), z: +S.z.toFixed(2), v: +S.v.toFixed(2), mode: S.mode, route: S.route && S.route.key, orders: S.orders.map((o) => o.place.key + ":" + o.status) }; } };
    applyQuality();
    show("s-title");
    requestAnimationFrame(frame);
  });
})();
