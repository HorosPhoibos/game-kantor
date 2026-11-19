/* OFFICE BRAWL — adu jotos 1 lawan 1 dengan kepala-foto teman kantor
   Jurus tiap orang diatur di characters.js (window.BRAWL). */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const err = (m) => { $("err").textContent = m; $("err").hidden = false; };
  if (!window.THREE) { err("Three.js gagal dimuat. Cek internet lalu refresh."); return; }
  let CREW = window.CREW || [];
  const BR = window.BRAWL || {};

  // ---------------- util ----------------
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => arr.map((v) => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };
  const isTouch = matchMedia("(pointer: coarse)").matches;
  const spOf = (c) => BR[c.id] || { type: "proj", obj: "box", name: "Lempar Kardus", pants: "#2b3350", say: "Hiyaaa!" };

  // ---------------- suara ----------------
  let actx = null, soundOn = store.get("br_sound", true);
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
    whoosh: () => beep(500, 0.08, "triangle", 0.03, -300),
    hit: () => { beep(160, 0.12, "square", 0.08, -90); beep(90, 0.15, "sawtooth", 0.05, -40); },
    big: () => { beep(120, 0.3, "sawtooth", 0.1, -80); setTimeout(() => beep(70, 0.3, "square", 0.07, -30), 60); },
    block: () => beep(900, 0.05, "square", 0.04),
    special: () => { [520, 660, 880, 1100].forEach((f, i) => setTimeout(() => beep(f, 0.09, "triangle", 0.06), i * 55)); },
    bell: () => { beep(1200, 0.5, "triangle", 0.07); beep(1800, 0.4, "sine", 0.04); },
    ko: () => { [400, 300, 200, 120].forEach((f, i) => setTimeout(() => beep(f, 0.18, "sawtooth", 0.07), i * 120)); },
    click: () => beep(660, 0.05, "triangle", 0.05),
    win: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, "triangle", 0.07), i * 120)); },
    wrong: () => beep(160, 0.15, "square", 0.05),
  };

  // ---------------- arena ----------------
  const ARENAS = [
    { id: "gudang", name: "🏭 Gudang Barang Masuk", desc: "Tumpukan CPU & printer" },
    { id: "kantor", name: "🏢 Ruang Kantor", desc: "Meja, kursi, lukisan gunung" },
    { id: "warung", name: "🍌 Warung Heri", desc: "Gorengan & galon" },
    { id: "ruko",   name: "🏪 Lorong Ruko", desc: "Rolling door berjejer" },
    { id: "parkir", name: "🚗 Parkiran Ruko", desc: "Kanopi & pagar besi" },
    { id: "resto",  name: "🍹 Rumah Makan", desc: "Es teh & sambal botol" },
  ];
  const DIFFS = {
    santai: { label: "😌 Santai", think: [0.4, 0.7], block: 0.12, atk: 0.45, sp: 0.35, dmg: 0.8 },
    normal: { label: "😤 Normal", think: [0.22, 0.42], block: 0.32, atk: 0.65, sp: 0.6, dmg: 1 },
    jago:   { label: "🔥 Jago", think: [0.12, 0.26], block: 0.55, atk: 0.85, sp: 0.9, dmg: 1.15 },
  };
  const MOVES = {
    punch: { start: 0.09, active: 0.1, rec: 0.16, range: 2.3, dmg: 6, push: 0.6, stun: 0.28, meter: 10 },
    kick:  { start: 0.17, active: 0.12, rec: 0.28, range: 3.0, dmg: 9, push: 1.2, stun: 0.36, meter: 12 },
  };
  const ROUND_TIME = 60, HP = 100;

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
    const t = new THREE.CanvasTexture(cv); t.minFilter = THREE.LinearFilter;
    faceTex[c.id] = t;
    return t;
  }

  // ---------------- three.js ----------------
  const canvas = $("game");
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch, powerPreference: "high-performance" }); }
  catch (e) { err("Browser ini belum mendukung grafik 3D (WebGL)."); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, isTouch ? 1.5 : 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a1d4a);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8a7a, 0.8));
  const key = new THREE.DirectionalLight(0xffffff, 0.55); key.position.set(6, 14, 12); scene.add(key);

  const matCache = new Map();
  const M = (c, o) => { const k = c + JSON.stringify(o || {}); if (!matCache.has(k)) matCache.set(k, new THREE.MeshLambertMaterial(Object.assign({ color: c }, o || {}))); return matCache.get(k); };
  const BOXG = new THREE.BoxGeometry(1, 1, 1);
  const box = (w, h, d, c, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(BOXG, typeof c === "number" ? M(c) : c); m.scale.set(w, h, d); m.position.set(x, y, z); return m; };
  const cyl = (rt, rb, h, c, s = 14) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s), M(c));
  const grp = (...k) => { const g = new THREE.Group(); k.forEach((x) => g.add(x)); return g; };
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
  function canvasTex(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 2; return t;
  }
  function planeTex(w, h, tex, x, y, z) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: tex })); m.position.set(x, y, z); return m; }
  function signTex(text, bg, fg = "#1d1530", w = 512, h = 128) {
    return canvasTex(w, h, (g) => {
      g.fillStyle = bg; g.fillRect(0, 0, w, h);
      g.strokeStyle = "#1d1530"; g.lineWidth = 10; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
      let s = h * 0.5; g.font = `700 ${s}px Fredoka, sans-serif`;
      while (g.measureText(text).width > w - 40 && s > 16) { s -= 2; g.font = `700 ${s}px Fredoka, sans-serif`; }
      g.fillText(text, w / 2, h / 2 + 3);
    });
  }
  const emojiCache = {};
  function emojiSprite(ch, size = 2) {
    if (!emojiCache[ch]) emojiCache[ch] = canvasTex(128, 128, (g) => { g.font = "100px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(ch, 64, 72); });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiCache[ch], transparent: true, depthTest: false }));
    s.scale.set(size, size, 1); s.renderOrder = 12; return s;
  }
  function textSprite(text, color, size = 3) {
    const t = canvasTex(256, 128, (g) => {
      g.font = "700 76px Fredoka, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 16; g.strokeStyle = "#1d1530"; g.strokeText(text, 128, 66);
      g.fillStyle = color; g.fillText(text, 128, 66);
    });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
    s.scale.set(size, size / 2, 1); s.renderOrder = 14; return s;
  }
  const shadowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, "rgba(0,0,0,.45)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  function blob(w, d) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; return m; }

  // ---------------- membangun arena ----------------
  let arenaGroup = null;
  function buildArena(id) {
    if (arenaGroup) scene.remove(arenaGroup);
    const g = new THREE.Group(); arenaGroup = g; scene.add(g);
    const floor = (c, tile) => {
      const tex = canvasTex(128, 128, (x) => { x.fillStyle = c; x.fillRect(0, 0, 128, 128); x.strokeStyle = tile; x.lineWidth = 4; x.strokeRect(0, 0, 128, 128); });
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(22, 15);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(90, 60), new THREE.MeshLambertMaterial({ map: tex }));
      f.rotation.x = -Math.PI / 2; f.position.z = 22; g.add(f);
    };
    const wall = (c) => g.add(box(64, 20, 0.5, c, 0, 10, -8));
    if (id === "gudang") {
      floor("#e3ded3", "#cfc8b8"); wall(0xefebe2);
      for (let k = 0; k < 7; k++) g.add(box(2.4, 0.6, 1.6, 0xf5f2ea, -14 + k * 1.1, 0.3 + k * 0.6, -6.5));     // tangga
      for (let k = 0; k < 5; k++) g.add(box(0.12, 4, 0.12, 0x1d1d24, -13.4 + k * 1.3, 2 + k * 0.6, -5.7));     // pegangan
      g.add(planeTex(5, 1.4, signTex("BARANG MASUK", "#ffffff"), 9, 6.5, -7.7));
      for (let k = 0; k < 9; k++) g.add(box(1.5, 1.4, 1.5, k % 3 === 1 ? 0xe9e9ee : 0x222228, 11 + (k % 3) * 1.6, 0.7 + Math.floor(k / 3) * 1.45, -6));
      g.add(box(2.2, 1.2, 1.6, 0xe9e9ee, -9, 0.6, -6), box(2.2, 1.2, 1.6, 0x222228, -9, 1.8, -6));
      const fan = grp(cyl(0.9, 0.9, 0.3, 0xdedede, 20), at(cyl(0.2, 0.2, 0.4, 0x6aa9d6, 10), 0, 0.2, 0)); fan.rotation.x = Math.PI / 2; fan.position.set(15, 9, -7.5); g.add(fan);
    } else if (id === "kantor") {
      floor("#ece7dc", "#d9d2c3"); wall(0xf4f1ea);
      for (let k = -2; k <= 2; k++) g.add(box(5.6, 9, 0.2, 0xcfe6f5, k * 6, 4.5, -7.4), box(0.3, 9, 0.4, 0x8a8f9a, k * 6 - 2.9, 4.5, -7.3));
      g.add(planeTex(4.4, 3, canvasTex(256, 176, (x) => { x.fillStyle = "#9fd2f0"; x.fillRect(0, 0, 256, 176); x.fillStyle = "#4c8f5a"; x.beginPath(); x.moveTo(0, 150); x.lineTo(80, 60); x.lineTo(140, 130); x.lineTo(200, 50); x.lineTo(256, 140); x.lineTo(256, 176); x.lineTo(0, 176); x.fill(); x.fillStyle = "#3a7ad0"; x.fillRect(0, 150, 256, 26); x.strokeStyle = "#c9a24a"; x.lineWidth = 14; x.strokeRect(0, 0, 256, 176); }), 6, 6, -7.2));
      [-11, 11].forEach((x) => { g.add(box(5, 0.3, 2.4, 0xc9a27a, x, 2.2, -5.5)); [-2.2, 2.2].forEach((dx) => g.add(box(0.2, 2.2, 2.2, 0x8a6a4a, x + dx, 1.1, -5.5))); g.add(box(1.6, 1.1, 0.2, 0x1d1d24, x, 3, -6.2)); });
      [-7, 14].forEach((x) => g.add(grp(at(box(1.4, 0.3, 1.4, 0x222228), 0, 1.3, 0), at(box(1.4, 1.6, 0.25, 0x222228), 0, 2.2, -0.6), at(cyl(0.08, 0.08, 1.2, 0x555555, 6), 0, 0.6, 0))).translateX(x).translateZ(-4.5));
    } else if (id === "warung") {
      floor("#d2b48c", "#b89770"); g.add(box(64, 6, 0.5, 0x2e7d4f, 0, 3, -8), box(64, 14, 0.5, 0xf2ede0, 0, 13, -8));
      g.add(planeTex(6, 1.6, signTex("WARUNG HERI", "#ffcf3f"), 0, 7.4, -7.7));
      const etalase = grp(box(5, 1.6, 2, 0x8b5a3c, 0, 0.8, 0), at(new THREE.Mesh(BOXG, new THREE.MeshLambertMaterial({ color: 0xcfefff, transparent: true, opacity: 0.45 })), 0, 2.4, 0));
      etalase.children[1].scale.set(4.8, 1.6, 1.8);
      for (let k = 0; k < 8; k++) etalase.add(at(box(0.6, 0.25, 0.4, k % 2 ? 0xd98c2b : 0xe6a640), -1.8 + (k % 4) * 1.2, 1.8 + Math.floor(k / 4) * 0.4, 0));
      etalase.position.set(-9, 0, -5.5); g.add(etalase);
      for (let k = 0; k < 3; k++) g.add(at(cyl(0.6, 0.6, 1.8, 0x5ab3ff, 16), 10 + k * 1.4, 0.9, -6));
      [-14, 5].forEach((x) => g.add(grp(at(box(1.3, 0.2, 1.3, 0xff4a4a), 0, 1.2, 0), at(box(1.3, 1.2, 0.2, 0xff4a4a), 0, 1.9, -0.55), ...[[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].map(([a, b]) => at(box(0.12, 1.2, 0.12, 0xff4a4a), a, 0.6, b))).translateX(x).translateZ(-5)));
    } else if (id === "ruko") {
      floor("#ebe6dc", "#d6cfbf"); wall(0xe6e2da);
      const door = canvasTex(128, 128, (x) => { x.fillStyle = "#c9ced8"; x.fillRect(0, 0, 128, 128); x.fillStyle = "#a3aab8"; for (let y = 4; y < 128; y += 10) x.fillRect(0, y, 128, 4); x.fillStyle = "rgba(255,120,60,.25)"; x.fillRect(10, 70, 40, 30); });
      for (let k = -2; k <= 2; k++) g.add(planeTex(5.4, 8, door, k * 6.4, 4, -7.7), box(0.6, 9, 0.6, 0xd9d4ca, k * 6.4 + 3.2, 4.5, -7.5));
      g.add(planeTex(6, 1.4, signTex("SERVIS KOMPUTER", "#2f6fe0", "#ffffff"), 0, 9.2, -7.6));
    } else if (id === "parkir") {
      floor("#c4c1ba", "#b1aea6"); wall(0xa9adb5);
      g.add(planeTex(4.5, 7, canvasTex(64, 96, (x) => { x.fillStyle = "#cfe6f5"; x.fillRect(0, 0, 64, 96); x.strokeStyle = "#555"; x.lineWidth = 4; x.strokeRect(2, 2, 60, 92); x.beginPath(); x.moveTo(32, 0); x.lineTo(32, 96); x.stroke(); }), 9, 3.5, -7.6));
      for (let k = 0; k < 22; k++) g.add(box(0.12, 4, 0.12, 0x1d1d24, -16 + k * 0.55, 2, -5));
      g.add(box(12, 0.12, 0.12, 0x1d1d24, -10, 4, -5), box(12, 0.12, 0.12, 0x1d1d24, -10, 0.6, -5));
      g.add(grp(at(box(4.4, 1.2, 2, 0xf4f6fa), 0, 1, 0), at(box(2.6, 0.9, 1.9, 0x23324d), -0.2, 2, 0)).translateX(-11).translateZ(-6.8));
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(64, 14), new THREE.MeshBasicMaterial({ color: 0x3a4a5a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
      roof.rotation.x = Math.PI / 2 - 0.15; roof.position.set(0, 12, -2); g.add(roof);
    } else {
      floor("#dccaa6", "#c4b088"); g.add(box(64, 7, 0.5, 0x8a3b2a, 0, 3.5, -8), box(64, 13, 0.5, 0xf6f3ec, 0, 13.5, -8));
      for (let y = 0.5; y < 7; y += 0.9) g.add(box(64, 0.08, 0.1, 0x6a2a1e, 0, y, -7.7));
      [-10, 10].forEach((x) => {
        g.add(box(5, 0.25, 3, 0xe9d9b8, x, 2.4, -5), box(0.4, 2.4, 0.4, 0x8a6a4a, x, 1.2, -5));
        g.add(at(cyl(0.3, 0.25, 0.9, 0xff3b6b, 12), x - 1.2, 3, -5), at(cyl(0.3, 0.25, 0.9, 0xb5651d, 12), x + 1.2, 3, -5));
        g.add(at(cyl(0.22, 0.22, 1.1, 0xd62828, 10), x, 3.1, -5.2), at(cyl(0.22, 0.22, 1.1, 0xe2582a, 10), x + 0.5, 3.1, -5.2));
      });
    }
  }

  // ---------------- model jagoan ----------------
  function makeFighter(c) {
    const sp = spOf(c);
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const shirt = new THREE.Color(c.shirt).getHex(), skin = new THREE.Color(c.skin).getHex(), pants = new THREE.Color(sp.pants || "#2b3350").getHex();
    const legs = [-1, 1].map((s) => { const p = at(new THREE.Group(), s * 0.34, 1.25, 0); p.add(box(0.55, 1.25, 0.6, pants, 0, -0.62, 0), box(0.6, 0.25, 0.8, 0x1d1d24, 0, -1.15, 0.1)); body.add(p); return p; });
    body.add(box(1.55, 1.55, 0.9, shirt, 0, 2.05, 0));
    body.add(box(1.6, 0.3, 0.95, new THREE.Color(shirt).multiplyScalar(0.8).getHex(), 0, 2.75, 0));
    const arms = [-1, 1].map((s) => { const a = at(new THREE.Group(), s * 1.0, 2.7, 0); a.add(box(0.42, 1.15, 0.46, shirt, 0, -0.5, 0), box(0.5, 0.5, 0.5, skin, 0, -1.2, 0)); body.add(a); return a; });
    const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: stickerTexture(c) }));
    head.scale.set(3.3, 4.1, 1); head.position.y = 4.85; body.add(head);
    const stars = emojiSprite("💫", 1.6); stars.position.y = 7.2; stars.visible = false; body.add(stars);
    root.add(blob(2.6, 1.6));
    scene.add(root);
    return { root, body, legs, arms, head, stars };
  }
  const OBJ = {
    box: () => grp(box(1.2, 1, 1, 0xc8955a), box(1.22, 0.15, 0.3, 0xe8d2a8, 0, 0.42, 0)),
    ball: () => { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 1), M(0xffffff, { flatShading: true })); const d = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), new THREE.MeshLambertMaterial({ color: 0x1d1d24, wireframe: true })); return grp(m, d); },
    cap: () => grp(at(cyl(0.55, 0.6, 0.45, 0x1f2c55, 16), 0, 0.2, 0), at(box(0.9, 0.08, 0.7, 0x1f2c55), 0, 0, 0.5)),
    cpu: () => grp(box(1.2, 2, 2, 0x222228), box(0.2, 0.2, 0.05, 0x6fffa0, 0.3, 0.6, 1.02)),
    printer: () => grp(box(2.6, 1.3, 2, 0xe9e9ee), box(1.8, 0.1, 1.2, 0xffffff, 0, 0.75, -0.2), box(1.2, 0.2, 0.05, 0x23324d, 0.4, 0.3, 1.01)),
    stamp: () => grp(box(2.6, 0.6, 2.6, 0xd62828), at(cyl(0.3, 0.3, 1.4, 0x8b5a3c, 10), 0, 1, 0), at(new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), M(0x8b5a3c)), 0, 1.9, 0)),
    gorengan: () => grp(...[0, 1, 2].map((k) => { const m = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6), M(k === 1 ? 0xe6a640 : 0xd98c2b)); m.scale.set(1.3, 0.6, 0.9); m.position.set(k * 0.5 - 0.5, k * 0.15, 0); return m; })),
  };
  function objFor(name) {
    if (OBJ[name]) return OBJ[name]();
    const em = { laptop: "💻", heart: "💖", thumb: "👍", eye: "👁️", clock: "⏱️", kentongan: "🔔", laugh: "😆", cable: "🔌", batik: "🌀" }[name] || "⭐";
    return emojiSprite(em, 2.2);
  }

  // ---------------- state ----------------
  const G = {
    state: "menu", mode: "cpu", easy: store.get("br_easy", true), diff: store.get("br_diff", "normal"), arena: "random",
    p1: null, p2: null, step: 1, ffaN: store.get("br_ffaN", 6), ffaH: 1, twoHuman: false, elim: [], hudF: [], f: [], round: 1, clock: ROUND_TIME, slow: 1, tour: null, timers: [], fx: [], projs: [], shake: 0, run: 0,
  };
  function later(sec, fn) { G.timers.push({ t: sec, fn, run: G.run }); }

  function newFighter(c, side, cpu) {
    const m = makeFighter(c);
    const f = { c, sp: spOf(c), side, cpu, m, x: side < 0 ? -3.5 : 3.5, vx: 0, face: side < 0 ? 1 : -1, hp: HP, shownHp: HP, meter: 0, st: "idle", t: 0, move: null, moveK: null, hitDone: false, stunDur: 0, cast: false, wins: 0,
      ctrl: { left: false, right: false, block: false, queue: [] }, ai: { t: 0.5, dir: 0, blockT: 0 } };
    return f;
  }
  function resetRound() {
    const N = G.f.length, B = bound();
    G.f.forEach((f, i) => {
      const x = N === 2 ? (i === 0 ? -3.5 : 3.5) : -B * 0.75 + i * ((1.5 * B) / (N - 1));
      Object.assign(f, { x, vx: 0, face: x < 0 ? 1 : -1, hp: HP, shownHp: HP, st: "idle", t: 0, move: null, hitDone: false, cast: false });
      f.z = N === 2 ? 0 : (i % 2 ? -0.8 : 0.8); f.m.root.position.z = f.z;
      f.ctrl.queue.length = 0; f.ai.blockT = 0;
      f.m.body.rotation.set(0, 0, 0); f.m.body.position.set(0, 0, 0); f.m.stars.visible = false;
    });
    G.projs.forEach((p) => scene.remove(p.mesh)); G.projs = [];
    G.fx.forEach((e) => scene.remove(e.o)); G.fx = [];
    G.clock = ffa() ? 99 : ROUND_TIME; G.slow = 1;
  }
  const canAct = (f) => f.st === "idle" || f.st === "walk" || f.st === "block";
  const ffa = () => G.mode === "ffa";
  const alive = () => G.f.filter((f) => f.st !== "ko");
  // lawan terdekat yang masih berdiri (mode tawuran bisa banyak lawan)
  const other = (f) => {
    let best = null, bd = 1e9;
    G.f.forEach((o) => { if (o === f || o.st === "ko") return; const d = Math.abs(o.x - f.x); if (d < bd) { bd = d; best = o; } });
    return best || G.f.find((o) => o !== f) || f;
  };
  const targetInFront = (f, range) => {
    let best = null, bd = 1e9;
    G.f.forEach((o) => { if (o === f || o.st === "ko") return; const dx = o.x - f.x; if (Math.sign(dx) === f.face && Math.abs(dx) <= range && Math.abs(dx) < bd) { bd = Math.abs(dx); best = o; } });
    return best;
  };
  const bound = () => (ffa() ? (camera.aspect < 1 ? 8 : 13) : (camera.aspect < 1 ? 6 : 10));

  // ---------------- efek ----------------
  function spark(x, y, text, color) {
    const s = textSprite(text, color, 3.4); s.position.set(x, y, 1.2); scene.add(s);
    G.fx.push({ o: s, t: 0, dur: 0.55, kind: "pop" });
  }
  function ring(x, color) {
    const r = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    r.rotation.x = -Math.PI / 2; r.position.set(x, 0.1, 0); scene.add(r);
    G.fx.push({ o: r, t: 0, dur: 0.5, kind: "ring" });
  }
  function bubble(f, text) {
    const el = document.createElement("div"); el.className = "say"; el.textContent = text; document.body.appendChild(el);
    G.fx.push({ el, f, t: 0, dur: 1.6, kind: "say" });
  }
  function announce(html, sec = 1.1) {
    const el = document.createElement("div"); el.className = "announce"; el.innerHTML = html; document.body.appendChild(el);
    setTimeout(() => el.remove(), sec * 1000);
  }

  // ---------------- serangan ----------------
  function hit(target, attacker, o) {
    if (target.st === "ko" || G.state !== "fight") return false;
    const dir = Math.sign(target.x - attacker.x) || attacker.face;
    const facing = target.face === -dir;
    const dmgMul = attacker.cpu ? DIFFS[G.diff].dmg : 1;
    if (target.st === "block" && facing && !o.unblockable) {
      target.hp -= o.dmg * 0.15 * dmgMul; target.vx = dir * o.push * 2; target.meter = Math.min(100, target.meter + 4);
      spark(target.x, 3.6, "TAHAN!", "#9fd8ff"); sfx.block();
    } else {
      target.hp -= o.dmg * dmgMul;
      target.vx = dir * o.push * 4;
      target.meter = Math.min(100, target.meter + 7);
      if (o.stunType) { target.st = "stun"; target.t = 0; target.stunDur = 1.5; target.m.stars.visible = true; }
      else { target.st = "hit"; target.t = 0; target.stunDur = o.stun; }
      target.move = null;
      spark(target.x, 3.8 + rand(-0.3, 0.5), o.big ? pick(["BOOM!", "DUAR!", "JDER!"]) : pick(["POW!", "BUK!", "DUG!", "PLAK!", "BAK!"]), o.big ? "#ffcf3f" : "#ffffff");
      if (o.big) { sfx.big(); G.shake = 0.45; } else { sfx.hit(); G.shake = Math.max(G.shake, 0.18); }
    }
    attacker.meter = Math.min(100, attacker.meter + (o.meter || 0));
    if (target.hp <= 0) { target.hp = 0; ko(target); }
    return true;
  }
  function startAttack(f, k) {
    f.st = "atk"; f.t = 0; f.move = MOVES[k]; f.moveK = k; f.hitDone = false; sfx.whoosh();
  }
  function startSpecial(f) {
    f.st = "special"; f.t = 0; f.cast = false; f.meter = 0; f.spinHit = new Set();
    sfx.special();
    announce(`<small>⭐ ${f.c.name}</small>${f.sp.name}!`, 1.0);
    bubble(f, f.sp.say || "Hiyaaa!");
  }
  function castSpecial(f) {
    const o = other(f), sp = f.sp;
    if (sp.type === "proj" || sp.type === "stun") {
      const mesh = objFor(sp.obj); mesh.position.set(f.x + f.face * 1.3, 2.6, 0.3); scene.add(mesh);
      G.projs.push({ owner: f, mesh, x: f.x + f.face * 1.3, vx: f.face * (sp.type === "stun" ? 11 : 15), kind: sp.type, life: 2 });
    } else if (sp.type === "wave") {
      ring(f.x, 0xffcf3f); ring(f.x, 0xff4f8b);
      const e = objFor(sp.obj); e.position.set(f.x, 5, 0.5); scene.add(e); G.fx.push({ o: e, t: 0, dur: 0.8, kind: "pop" });
      G.f.forEach((v) => { if (v !== f && v.st !== "ko" && Math.abs(v.x - f.x) < 5.5) hit(v, f, { dmg: 15, push: 2.6, stun: 0.55, big: true }); });
    } else if (sp.type === "drop") {
      const mesh = objFor(sp.obj), tx = o.x;
      mesh.position.set(tx, 14, 0); scene.add(mesh);
      const sh = blob(3.2, 2); sh.position.set(tx, 0.05, 0); scene.add(sh);
      G.projs.push({ owner: f, mesh, shadow: sh, x: tx, y: 14, kind: "drop", life: 0.75 });
    }
  }
  function ko(f) {
    f.st = "ko"; f.t = 0; f.m.stars.visible = false;
    if (ffa()) {
      G.elim.push(f); sfx.ko(); spark(f.x, 5, "TUMBANG!", "#ff4f8b"); bubble(f, pick(["Aduh…", "Ampun!", "Nanti aku balas!", "Kok aku duluan?"]));
      const al = alive(), humansLeft = al.some((h) => !h.cpu), hadHuman = G.f.some((h) => !h.cpu);
      if (al.length <= 1 || (hadHuman && !humansLeft)) {
        G.state = "roundEnd"; G.slow = 0.35; announce("K.O.!", 1.6);
        const w = al.length ? al.reduce((a, b) => (b.hp > a.hp ? b : a)) : null;
        endFFA(w);
      }
      return;
    }
    const w = other(f);
    G.state = "roundEnd"; G.slow = 0.35;
    sfx.ko(); announce("K.O.!", 1.6);
    endRound(w);
  }
  function endRound(winner) {
    if (winner) winner.wins++;
    G.f.forEach((f) => { f.ctrl.queue.length = 0; });
    later(1.6, () => {
      G.slow = 1;
      if (winner) { announce(`<small>${winner.c.name}</small>MENANG!`, 1.4); bubble(winner, pick(["Gampang!", "Siapa lagi?", winner.sp.say || "Yes!", "Hehe, maaf ya."])); }
      else announce("SERI!", 1.2);
    });
    later(3.4, () => {
      const champ = G.f.find((f) => f.wins >= 2);
      if (champ || G.round >= 5) matchEnd(champ || (G.f[0].wins >= G.f[1].wins ? G.f[0] : G.f[1]));
      else { G.round++; startRound(); }
    });
  }
  function endFFA(w) {
    later(1.6, () => { G.slow = 1; if (w) { announce(`<small>${w.c.name}</small>JUARA TAWURAN!`, 1.6); bubble(w, pick(["Siapa lagi?!", w.sp.say || "Yes!", "Gampang!"])); } });
    later(3.6, () => matchEnd(w));
  }
  function timeUp() {
    G.state = "roundEnd";
    announce("WAKTU<br>HABIS!", 1.4);
    if (ffa()) { const al = alive(); endFFA(al.length ? al.reduce((a, b) => (b.hp > a.hp ? b : a)) : null); return; }
    const [a, b] = G.f;
    endRound(Math.abs(a.hp - b.hp) < 0.5 ? null : a.hp > b.hp ? a : b);
  }

  // ---------------- kecerdasan komputer ----------------
  function aiThink(f, dt) {
    const o = other(f), D = DIFFS[G.diff], ai = f.ai, c = f.ctrl;
    ai.blockT -= dt;
    c.block = ai.blockT > 0;
    c.left = ai.dir < 0 && !c.block; c.right = ai.dir > 0 && !c.block;
    ai.t -= dt;
    if (ai.t > 0 || !canAct(f)) return;
    ai.t = rand(D.think[0], D.think[1]);
    const dx = o.x - f.x, d = Math.abs(dx), s = Math.sign(dx);
    const threat = (o.st === "atk" && o.move && o.t < o.move.start + o.move.active && d < 3.4) || (o.st === "special" && !o.cast);
    const dropNear = G.projs.find((p) => p.kind === "drop" && p.owner !== f && Math.abs(p.x - f.x) < 2);
    ai.dir = 0;
    if (dropNear && Math.random() < D.block + 0.3) { ai.dir = f.x > dropNear.x ? 1 : -1; return; }
    if (threat && Math.random() < D.block) { ai.blockT = 0.45; return; }
    if (f.meter >= 100 && Math.random() < D.sp && (f.sp.type !== "wave" && f.sp.type !== "spin" || d < 5)) { c.queue.push("special"); return; }
    if (d > 2.7) { ai.dir = s; return; }
    if (Math.random() < D.atk) { c.queue.push(d > 2.1 ? "kick" : Math.random() < 0.6 ? "punch" : "kick"); return; }
    if (Math.random() < 0.3) ai.dir = -s;
  }

  // ---------------- update jagoan ----------------
  function updateFighter(f, dt) {
    const o = other(f), c = f.ctrl;
    f.t += dt;
    if (f.cpu && G.state === "fight") aiThink(f, dt);
    if (G.state === "fight" && canAct(f)) {
      const q = c.queue.shift();
      if (q === "special") { if (f.meter >= 100) startSpecial(f); else if (!f.cpu) { sfx.wrong(); bubble(f, "Bar jurus belum penuh!"); } }
      else if (q) startAttack(f, q);
      else if (c.block) { f.st = "block"; }
      else {
        let dir = (c.right ? 1 : 0) - (c.left ? 1 : 0);
        if (!dir && !f.cpu && G.easy && Math.abs(o.x - f.x) > 2.5) dir = Math.sign(o.x - f.x) * 0.75;
        f.x += dir * 4.4 * dt;
        f.st = dir ? "walk" : "idle";
      }
    }
    if (f.st === "atk") {
      const mv = f.move;
      if (!f.hitDone && f.t >= mv.start && f.t < mv.start + mv.active) {
        const tg = targetInFront(f, mv.range);
        if (tg) { f.hitDone = true; hit(tg, f, mv); }
      }
      if (f.t >= mv.start + mv.active + mv.rec) { f.st = "idle"; f.move = null; }
    } else if (f.st === "hit") {
      if (f.t >= f.stunDur) f.st = "idle";
    } else if (f.st === "stun") {
      if (f.t >= f.stunDur) { f.st = "idle"; f.m.stars.visible = false; }
    } else if (f.st === "special") {
      if (f.sp.type === "spin") {
        if (f.t > 0.3 && f.t < 0.85) {
          f.x += f.face * 12 * dt;
          G.f.forEach((v) => { if (v !== f && v.st !== "ko" && !f.spinHit.has(v) && Math.abs(v.x - f.x) < 1.7) { f.spinHit.add(v); hit(v, f, { dmg: 17, push: 2.2, stun: 0.55, big: true }); } });
        }
        if (f.t >= 1.0) { f.st = "idle"; f.hitDone = false; }
      } else {
        if (!f.cast && f.t >= 0.35) { f.cast = true; castSpecial(f); }
        if (f.t >= 0.8) f.st = "idle";
      }
    } else if (f.st === "block" && !c.block) f.st = "idle";

    // fisika sederhana
    f.x += f.vx * dt; f.vx *= Math.exp(-8 * dt);
    const B = bound(); f.x = clamp(f.x, -B, B);
    if (f.st !== "atk" && f.st !== "special" && f.st !== "ko") f.face = Math.sign(o.x - f.x) || f.face;
  }
  function separate() {
    const al = alive(), min = ffa() ? 1.1 : 1.5, B = bound();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = al[i], b = al[j], d = b.x - a.x;
      if (Math.abs(d) < min) {
        const push = (min - Math.abs(d)) / 2, s = Math.sign(d) || (i % 2 ? 1 : -1);
        a.x = clamp(a.x - s * push, -B, B); b.x = clamp(b.x + s * push, -B, B);
      }
    }
  }
  function updateProjs(dt) {
    G.projs = G.projs.filter((p) => {
      p.life -= dt;
      if (p.kind === "drop") {
        p.y = Math.max(0.8, 14 * (p.life / 0.75)); p.mesh.position.set(p.x, p.y, 0); p.mesh.rotation.z += dt * 3;
        if (p.life <= 0) {
          scene.remove(p.shadow); ring(p.x, 0xffffff); G.shake = Math.max(G.shake, 0.3);
          const victims = G.f.filter((v) => v !== p.owner && v.st !== "ko" && Math.abs(v.x - p.x) < 1.8);
          if (victims.length) victims.forEach((v) => hit(v, p.owner, { dmg: 22, push: 1, stun: 0.7, big: true, unblockable: true }));
          else spark(p.x, 2.2, "MELESET!", "#cccccc");
          setTimeout(() => scene.remove(p.mesh), 400);
          return false;
        }
        return true;
      }
      p.x += p.vx * dt; p.mesh.position.x = p.x; p.mesh.rotation.z -= dt * 10 * Math.sign(p.vx);
      const o = G.f.find((v) => v !== p.owner && v.st !== "ko" && Math.abs(v.x - p.x) < 1.1);
      if (o) {
        hit(o, p.owner, p.kind === "stun" ? { dmg: 6, push: 0.6, stunType: true } : { dmg: 18, push: 1.8, stun: 0.55, big: true });
        scene.remove(p.mesh); return false;
      }
      if (p.life <= 0 || Math.abs(p.x) > 16) { scene.remove(p.mesh); return false; }
      return true;
    });
  }

  // ---------------- animasi model ----------------
  function animate(f, dt, time) {
    const m = f.m, b = m.body;
    m.root.position.x = f.x;
    m.root.rotation.y = f.face > 0 ? Math.PI / 2 : -Math.PI / 2;
    const k = Math.min(1, dt * 14);
    let armA = [-0.9, -0.9], legA = [0, 0], lean = 0, bodyY = 0, spin = 0, tilt = 0;
    const bob = Math.sin(time * 6 + f.side) * 0.06;
    if (f.st === "idle") { bodyY = bob; }
    else if (f.st === "walk") { const s = Math.sin(time * 12) * 0.6; legA = [s, -s]; bodyY = Math.abs(Math.sin(time * 12)) * 0.1; }
    else if (f.st === "block") { armA = [-2.3, -2.3]; bodyY = -0.15; lean = 0.15; }
    else if (f.st === "atk") {
      const mv = f.move, p = clamp(f.t / mv.start, 0, 1), on = f.t >= mv.start && f.t < mv.start + mv.active + 0.05;
      if (f.moveK === "punch") { armA = [-0.9, on ? -1.65 : lerp(-0.9, -0.4, p)]; lean = on ? 0.25 : 0; }
      else { legA = [0, on ? -1.5 : lerp(0, 0.4, p)]; lean = on ? -0.25 : 0; armA = [-0.6, -0.6]; }
    } else if (f.st === "hit") { lean = -0.45; armA = [-0.3, -0.3]; }
    else if (f.st === "stun") { tilt = Math.sin(time * 8) * 0.18; armA = [0, 0]; }
    else if (f.st === "special") {
      if (f.sp.type === "spin") { spin = f.t > 0.3 && f.t < 0.85 ? 1 : 0; armA = [-1.57, -1.57]; }
      else { const pre = f.t < 0.35; armA = pre ? [-2.8, -2.8] : [-1.7, -1.7]; lean = pre ? -0.2 : 0.3; }
    } else if (f.st === "ko") { lean = -1.45; bodyY = 0; armA = [-2.6, -2.6]; }
    m.arms[0].rotation.x = lerp(m.arms[0].rotation.x, armA[0], k);
    m.arms[1].rotation.x = lerp(m.arms[1].rotation.x, armA[1], k);
    m.legs[0].rotation.x = lerp(m.legs[0].rotation.x, legA[0], k);
    m.legs[1].rotation.x = lerp(m.legs[1].rotation.x, legA[1], k);
    b.rotation.x = lerp(b.rotation.x, lean, f.st === "ko" ? Math.min(1, dt * 5) : k);
    b.rotation.z = tilt;
    b.position.y = lerp(b.position.y, bodyY, k);
    if (spin) b.rotation.y += dt * 25; else b.rotation.y = lerp(b.rotation.y, 0, k);
    if (m.stars.visible) m.stars.material.rotation += dt * 4;
  }

  // ---------------- input ----------------
  const keys = {};
  const KEYMAP = [
    { left: ["KeyA"], right: ["KeyD"], block: ["KeyS"], punch: ["KeyF"], kick: ["KeyG"], special: ["KeyR"] },
    { left: ["ArrowLeft"], right: ["ArrowRight"], block: ["ArrowDown"], punch: ["KeyK"], kick: ["KeyL"], special: ["KeyO"] },
  ];
  function ownerOfKey(code) {
    for (let p = 0; p < 2; p++) for (const act in KEYMAP[p]) if (KEYMAP[p][act].includes(code)) return { p, act };
    return null;
  }
  addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if ((e.code === "Escape" || e.code === "KeyP") && (G.state === "fight" || G.state === "pause")) { togglePause(); return; }
    if (e.repeat) return;
    keys[e.code] = true;
    const k = ownerOfKey(e.code); if (!k) return;
    const p = G.twoHuman ? k.p : 0;          // main sendiri: dua set tombol sama-sama untuk pemain 1
    const f = G.f[p]; if (!f || f.cpu) return;
    if (k.act === "punch" || k.act === "kick" || k.act === "special") { if (G.state === "fight") f.ctrl.queue.push(k.act); }
    else f.ctrl[k.act] = true;
  });
  addEventListener("keyup", (e) => {
    keys[e.code] = false;
    const k = ownerOfKey(e.code); if (!k) return;
    const p = G.twoHuman ? k.p : 0, f = G.f[p]; if (!f || f.cpu) return;
    if (k.act === "left" || k.act === "right" || k.act === "block") {
      // jangan lepaskan kalau tombol lain untuk aksi yang sama masih ditekan
      const still = (G.twoHuman ? KEYMAP[p][k.act] : KEYMAP[0][k.act].concat(KEYMAP[1][k.act])).some((c) => keys[c]);
      if (!still) f.ctrl[k.act] = false;
    }
  });
  addEventListener("blur", () => { for (const c in keys) keys[c] = false; G.f.forEach((f) => { f.ctrl.left = f.ctrl.right = f.ctrl.block = false; }); });

  function buildPads() {
    const host = $("pads"); host.innerHTML = "";
    const two = G.twoHuman;
    const make = (p, cls, withMove) => {
      const d = document.createElement("div"); d.className = "pad " + cls + (two ? " small" : "");
      d.innerHTML = (withMove ? `<button class="mv" data-a="left" aria-label="Mundur/maju kiri">◀</button><button class="mv" data-a="right" aria-label="Maju/mundur kanan">▶</button>` : "") +
        (cls.includes("acts-only") || two ? `<div class="acts"><button class="b-punch" data-a="punch"><span>👊</span>PUKUL</button><button class="b-kick" data-a="kick"><span>🦵</span>TENDANG</button><button class="b-block" data-a="block"><span>🛡️</span>TANGKIS</button><button class="b-sp" data-a="special" data-p="${p}"><span>⭐</span>JURUS</button></div>` : "");
      d.querySelectorAll("button").forEach((b) => {
        const a = b.dataset.a;
        const down = (e) => {
          e.preventDefault(); const f = G.f[p]; if (!f || f.cpu) return;
          b.classList.add("on");
          if (a === "left" || a === "right" || a === "block") f.ctrl[a] = true;
          else if (G.state === "fight") f.ctrl.queue.push(a);
        };
        const up = () => { b.classList.remove("on"); const f = G.f[p]; if (f && (a === "left" || a === "right" || a === "block")) f.ctrl[a] = false; };
        b.addEventListener("pointerdown", down);
        ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => b.addEventListener(ev, up));
      });
      host.appendChild(d);
    };
    if (two) { make(0, "l", true); make(1, "r p2pad", true); }
    else { make(0, "l", true); make(0, "r acts-only", false); }
  }

  // ---------------- HUD ----------------
  function setHud(on) { $("hud").hidden = !on; $("pads").hidden = !on; $("back").hidden = on; $("roster").hidden = !on || !ffa(); }
  function hudInit() {
    G.hudF = ffa() ? [G.f[0], G.twoHuman ? G.f[1] : null] : [G.f[0], G.f[1]];
    G.hudF.forEach((f, i) => {
      document.querySelector(i ? ".side.r" : ".side.l").style.visibility = f ? "visible" : "hidden";
      if (!f) return;
      $("h-f" + (i + 1)).src = "faces/" + f.c.id + ".png";
      $("h-n" + (i + 1)).textContent = f.c.name + (f.cpu ? " 🤖" : "");
    });
    $("roster").innerHTML = ffa() ? G.f.map((f, i) => `<div class="rs${f.cpu ? "" : " me"}" id="rs${i}"><img src="faces/${f.c.id}.png" alt=""><i><b id="rsb${i}"></b></i></div>`).join("") : "";
  }
  function hudUpdate(dt) {
    if (ffa()) G.f.forEach((f, i) => { const b = $("rsb" + i); if (b) { b.style.width = (f.hp / HP) * 100 + "%"; $("rs" + i).classList.toggle("ko", f.st === "ko"); } });
    G.hudF.forEach((f, i) => {
      if (!f) return;
      const n = i + 1;
      f.shownHp = Math.max(f.hp, f.shownHp - dt * 30);
      $("h-hp" + n).style.width = (f.hp / HP) * 100 + "%";
      $("h-d" + n).style.width = (f.shownHp / HP) * 100 + "%";
      $("h-mp" + n).style.width = f.meter + "%";
      $("h-mpw" + n).classList.toggle("full", f.meter >= 100);
      $("h-w" + n).textContent = "🏆".repeat(f.wins);
    });
    $("h-clock").textContent = Math.ceil(G.clock);
    document.querySelectorAll(".b-sp").forEach((b) => { const f = G.f[+b.dataset.p]; b.classList.toggle("ready", !!f && f.meter >= 100); });
  }

  // ---------------- alur layar ----------------
  const screens = ["s-title", "s-pick", "s-pause", "s-result"];
  function show(id) { screens.forEach((s) => ($(s).hidden = s !== id)); }

  document.querySelectorAll(".modes button").forEach((b) => b.addEventListener("click", () => { sfx.click(); openPick(b.dataset.mode); }));
  const optEasy = $("opt-easy"), optSound = $("opt-sound");
  optEasy.checked = G.easy; optSound.checked = soundOn;
  optEasy.onchange = () => { G.easy = optEasy.checked; store.set("br_easy", G.easy); };
  optSound.onchange = () => { soundOn = optSound.checked; store.set("br_sound", soundOn); };

  function openPick(mode) {
    G.mode = mode; G.p1 = null; G.p2 = null; G.step = 1;
    $("ffa-wrap").hidden = mode !== "ffa";
    $("pick-extra").hidden = mode === "tour";
    $("diff-wrap").hidden = mode === "2p";
    $("b-fight").textContent = mode === "tour" ? "Mulai Turnamen 🏆" : mode === "ffa" ? "TAWURAN! 🔥" : "TARUNG! 🥊";
    renderPick(); show("s-pick");
  }
  function renderPick() {
    const st = $("pick-status");
    if (G.mode === "tour") st.textContent = G.p1 ? `Jagoanmu: ${G.p1.name}. Siap?` : "Pilih jagoanmu";
    else if (G.mode === "ffa") st.textContent = G.ffaH === 2 && G.step === 2 ? (G.p2 ? "Siap tawuran!" : "Pemain 2 (merah), pilih jagoan") : G.p1 ? `Jagoanmu: ${G.p1.name}. Sisanya diacak komputer.` : "Pilih jagoanmu";
    else if (G.mode === "2p") st.textContent = G.step === 1 ? "Pemain 1 (biru), pilih jagoan" : G.p2 ? "Siap tarung!" : "Pemain 2 (merah), pilih jagoan";
    else st.textContent = G.step === 1 ? "Pilih jagoanmu" : G.p2 ? "Siap tarung!" : "Pilih lawanmu (atau 🎲 Acak)";
    $("grid").innerHTML = CREW.map((c) => {
      const cls = G.p1 === c ? "p1" : G.p2 === c ? "p2" : "";
      const badge = G.p1 === c ? '<span class="badge">P1</span>' : G.p2 === c ? `<span class="badge">${G.mode === "2p" || G.mode === "ffa" ? "P2" : "LAWAN"}</span>` : "";
      return `<button class="fighter ${cls}" data-id="${c.id}">${badge}<img src="faces/${c.id}.png" alt=""><b>${c.name}</b><small>⭐ ${spOf(c).name}</small></button>`;
    }).join("");
    $("arenas").innerHTML = [{ id: "random", name: "🎲 Acak", desc: "Biar seru" }].concat(ARENAS).map((a) => `<button class="arena" data-id="${a.id}" aria-pressed="${G.arena === a.id}">${a.name}<small>${a.desc}</small></button>`).join("");
    $("ffa-n").innerHTML = [3, 4, 5, 6, 7, 8].filter((n) => n <= CREW.length).map((n) => `<button data-n="${n}" aria-pressed="${G.ffaN === n}">${n} orang</button>`).join("");
    $("ffa-h").innerHTML = [1, 2].map((n) => `<button data-h="${n}" aria-pressed="${G.ffaH === n}">${n === 1 ? "👤 Main sendiri" : "👥 Berdua"}</button>`).join("");
    $("diff").innerHTML = Object.entries(DIFFS).map(([k, d]) => `<button data-k="${k}" aria-pressed="${G.diff === k}">${d.label}</button>`).join("");
  }
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest(".fighter"); if (!b) return;
    const c = CREW.find((x) => x.id === b.dataset.id); sfx.click();
    if (G.mode === "tour" || (G.mode === "ffa" && G.ffaH === 1)) G.p1 = c;
    else if (G.step === 1) { G.p1 = c; if (G.p2 === c) G.p2 = null; G.step = 2; }
    else { if (c === G.p1) { G.p1 = c; G.step = 2; } else G.p2 = c; }
    renderPick();
  });
  $("ffa-n").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; G.ffaN = +b.dataset.n; store.set("br_ffaN", G.ffaN); sfx.click(); renderPick(); });
  $("ffa-h").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; G.ffaH = +b.dataset.h; G.p2 = null; G.step = 1; sfx.click(); renderPick(); });
  $("arenas").addEventListener("click", (e) => { const b = e.target.closest(".arena"); if (!b) return; G.arena = b.dataset.id; sfx.click(); renderPick(); });
  $("diff").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; G.diff = b.dataset.k; store.set("br_diff", G.diff); sfx.click(); renderPick(); });
  $("b-back").onclick = () => { sfx.click(); if (G.mode !== "tour" && G.step === 2) { G.step = 1; G.p2 = null; renderPick(); } else show("s-title"); };
  $("b-rand").onclick = () => {
    sfx.click();
    if (G.mode === "tour" || (G.mode === "ffa" && G.ffaH === 1)) G.p1 = pick(CREW);
    else if (G.step === 1) { G.p1 = pick(CREW); G.step = 2; if (G.p2 === G.p1) G.p2 = null; }
    else G.p2 = pick(CREW.filter((c) => c !== G.p1));
    renderPick();
  };
  $("b-fight").onclick = () => {
    if (!G.p1) G.p1 = pick(CREW);
    if (G.mode === "ffa") {
      if (G.ffaH === 2 && !G.p2) G.p2 = pick(CREW.filter((c) => c !== G.p1));
      G.tour = null;
      startFFA(G.ffaH === 2 ? [G.p1, G.p2] : [G.p1], G.ffaN, G.arena === "random" ? pick(ARENAS).id : G.arena, G.diff);
      return;
    }
    if (G.mode === "tour") {
      const opps = shuffle(CREW.filter((c) => c !== G.p1)).slice(0, 4);
      G.tour = { opps, idx: 0, diffs: ["santai", "normal", "normal", "jago"] };
      startMatch(G.p1, opps[0], pick(ARENAS).id, "santai");
      return;
    }
    if (!G.p2) G.p2 = pick(CREW.filter((c) => c !== G.p1));
    G.tour = null;
    startMatch(G.p1, G.p2, G.arena === "random" ? pick(ARENAS).id : G.arena, G.diff);
  };
  $("b-pause").onclick = () => togglePause();
  $("b-resume").onclick = () => togglePause();
  $("b-quit").onclick = () => quitToMenu();
  $("b-menu").onclick = () => quitToMenu();
  $("b-again").onclick = () => {
    if (G.tour) { G.tour.idx = 0; G.tour.opps = shuffle(CREW.filter((c) => c !== G.p1)).slice(0, 4); startMatch(G.p1, G.tour.opps[0], pick(ARENAS).id, "santai"); }
    else if (G.last.ffa) startFFA(G.last.humans, G.last.n, G.arena === "random" ? pick(ARENAS).id : G.arena, G.diff);
    else startMatch(G.last.a, G.last.b, G.last.arena === "random" ? pick(ARENAS).id : G.last.arena, G.diff);
  };
  $("b-next").onclick = () => { const t = G.tour; if (!t) return; startMatch(G.p1, t.opps[t.idx], pick(ARENAS).id, t.diffs[t.idx]); };

  function togglePause() {
    if (G.state === "fight") { G.prev = G.state; G.state = "pause"; show("s-pause"); }
    else if (G.state === "pause") { G.state = G.prev; show(null); }
  }
  function clearFight() {
    G.run++; G.timers = [];
    G.f.forEach((f) => scene.remove(f.m.root)); G.f = [];
    G.projs.forEach((p) => { scene.remove(p.mesh); if (p.shadow) scene.remove(p.shadow); }); G.projs = [];
    G.fx.forEach((e) => { if (e.o) scene.remove(e.o); if (e.el) e.el.remove(); }); G.fx = [];
    document.querySelectorAll(".announce").forEach((e) => e.remove());
  }
  function quitToMenu() { clearFight(); G.state = "menu"; setHud(false); show("s-title"); buildArena("gudang"); showcase(); }

  function startMatch(a, b, arenaId, diff) {
    clearFight();
    showMembers.forEach((m) => scene.remove(m.root)); showMembers = [];
    G.snapCam = true;
    G.last = { a, b, arena: G.mode === "tour" ? "random" : G.arena };
    if (diff) G.diff = diff;
    buildArena(arenaId);
    G.twoHuman = G.mode === "2p";
    G.f = [newFighter(a, -1, false), newFighter(b, 1, G.mode !== "2p")];
    G.round = 1;
    show(null); setHud(true); buildPads(); hudInit();
    const arena = ARENAS.find((x) => x.id === arenaId);
    announce(`<small>${a.name} vs ${b.name}</small>${arena ? arena.name.split(" ").slice(1).join(" ") : ""}`, 1.6);
    later(1.6, startRound);
    G.state = "intro";
    resetRound();
  }
  function startFFA(humans, n, arenaId, diff) {
    clearFight();
    showMembers.forEach((m) => scene.remove(m.root)); showMembers = [];
    G.snapCam = true;
    G.last = { ffa: true, humans, n };
    if (diff) G.diff = diff;
    buildArena(arenaId);
    const roster = humans.concat(shuffle(CREW.filter((c) => !humans.includes(c))).slice(0, Math.max(0, n - humans.length)));
    G.twoHuman = humans.length === 2;
    G.f = roster.map((c, i) => newFighter(c, i, i >= humans.length));
    // banyak orang: kepala dikecilkan sedikit biar tidak saling menutupi
    G.f.forEach((f) => { f.m.head.scale.set(3.3 * 0.75, 4.1 * 0.75, 1); f.m.head.position.y = 2.8 + (4.1 * 0.75) / 2; f.m.stars.position.y = 6.2; });
    G.round = 1; G.elim = [];
    resetRound();
    show(null); setHud(true); buildPads(); hudInit();
    G.state = "intro";
    announce(`<small>${roster.length} orang, yang terakhir berdiri menang!</small>TAWURAN!`, 1.8);
    sfx.bell();
    later(2.0, () => { announce("MULAI!", 0.8); G.state = "fight"; });
  }
  function startRound() {
    resetRound();
    G.state = "intro";
    announce(`RONDE ${G.round}`, 1.1);
    sfx.bell();
    later(1.2, () => { announce("TARUNG!", 0.8); G.state = "fight"; });
  }
  function matchEnd(winner) {
    G.state = "result";
    const human = G.f[0], youWin = winner === human;
    setHud(false);
    $("r-face").src = "faces/" + winner.c.id + ".png";
    $("b-next").hidden = true; $("r-ladder").innerHTML = "";
    if (ffa()) {
      const N = G.f.length, rank = (f) => (f === winner ? 1 : G.elim.includes(f) ? N - G.elim.indexOf(f) : 2);
      const humans = G.f.filter((f) => !f.cpu), won = humans.includes(winner);
      $("r-face").src = "faces/" + (winner || humans[0]).c.id + ".png";
      $("r-big").textContent = winner ? (won ? `👑 ${winner.c.name} JUARA TAWURAN!` : `${winner.c.name} juara tawuran`) : "Semua tumbang!";
      $("r-sub").textContent = humans.map((h) => `${h.c.name}: peringkat ${rank(h)} dari ${N}`).join(" · ");
      $("r-ladder").innerHTML = G.f.slice().sort((a, b) => rank(a) - rank(b)).map((f) => `<div class="${f === winner ? "now" : ""}"><img src="faces/${f.c.id}.png" alt="">#${rank(f)} ${f.c.name}</div>`).join("");
      won ? sfx.win() : sfx.ko();
      show("s-result");
      return;
    }
    if (G.mode === "2p") { $("r-big").textContent = winner.c.name + " MENANG! 🏆"; $("r-sub").textContent = `${G.f[0].c.name} ${G.f[0].wins} - ${G.f[1].wins} ${G.f[1].c.name}`; sfx.win(); }
    else if (G.tour) {
      const t = G.tour;
      if (youWin) {
        t.idx++;
        if (t.idx >= t.opps.length) { $("r-big").textContent = "👑 JUARA KANTOR!"; $("r-sub").textContent = `${human.c.name} mengalahkan semua lawan!`; store.set("br_champ", (store.get("br_champ", [])).concat([human.c.name]).slice(-10)); }
        else { $("r-big").textContent = "MENANG! 🎉"; $("r-sub").textContent = `Lawan berikutnya: ${t.opps[t.idx].name} (${DIFFS[t.diffs[t.idx]].label})`; $("b-next").hidden = false; }
        sfx.win();
      } else { $("r-big").textContent = "Yah, kalah… 😅"; $("r-sub").textContent = `${winner.c.name} terlalu kuat. Coba lagi dari awal!`; sfx.ko(); }
      $("r-ladder").innerHTML = t.opps.map((c, i) => `<div class="${i < t.idx ? "beat" : i === t.idx && t.idx < t.opps.length ? "now" : ""}"><img src="faces/${c.id}.png" alt="">${c.name}</div>`).join("");
    } else {
      $("r-big").textContent = youWin ? `${human.c.name} MENANG! 🏆` : "Yah, kalah… 😅";
      $("r-sub").textContent = youWin ? `Mantap, ${winner === human ? other(human).c.name : ""} KO!` : `${winner.c.name} menang kali ini. Balas dendam?`;
      youWin ? sfx.win() : sfx.ko();
    }
    show("s-result");
  }

  // ---------------- kamera & loop ----------------
  function resize() {
    const w = innerWidth, h = innerHeight;
    if (!w || !h) return;               // jendela tersembunyi: jangan rusak ukuran kamera
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener("resize", resize); resize();
  const camT = new THREE.Vector3(0, 3, 16);
  let showMembers = [];
  function showcase() {
    showMembers.forEach((m) => scene.remove(m.root)); showMembers = [];
    shuffle(CREW).slice(0, 2).forEach((c, i) => { const m = makeFighter(c); m.root.position.x = i ? 2.4 : -2.4; m.root.rotation.y = i ? -Math.PI / 2 : Math.PI / 2; showMembers.push(m); });
  }
  let t0 = performance.now(), time = 0, fpsAcc = 0, fpsN = 0, lowered = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    fpsAcc += rdt; fpsN++;
    if (fpsAcc > 3) { if (fpsN / fpsAcc < 35 && !lowered) { lowered = true; renderer.setPixelRatio(1); resize(); } fpsAcc = 0; fpsN = 0; }
    step(rdt);
    render(rdt);
  }
  function step(rdt) {
    if (G.state === "pause") return;
    const dt = rdt * G.slow; time += dt;
    // jadwal: kumpulkan dulu yang jatuh tempo, baru dijalankan (jadwal baru tidak boleh hilang)
    const due = [];
    G.timers = G.timers.filter((tm) => { if (tm.run !== G.run) return false; tm.t -= rdt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
    due.forEach((tm) => { if (tm.run === G.run) tm.fn(); });
    if (G.f.length >= 2) {
      if (G.state === "fight") { G.clock -= dt; if (G.clock <= 0) { G.clock = 0; timeUp(); } }
      G.f.forEach((f) => f.meter = Math.min(100, f.meter + (G.state === "fight" ? 2 * dt : 0)));
      G.f.forEach((f) => updateFighter(f, dt));
      separate();
      updateProjs(dt);
      G.f.forEach((f) => animate(f, dt, time));
    }
    G.fx = G.fx.filter((e) => {
      e.t += rdt; const k = e.t / e.dur;
      if (e.kind === "pop") { const s = 1 + Math.sin(Math.min(1, k * 3) * Math.PI / 2) * 0.3; e.o.scale.multiplyScalar(1); e.o.position.y += rdt * 1.2; e.o.material.opacity = 1 - Math.max(0, k - 0.6) / 0.4; e.o.material.transparent = true; if (!e.base) e.base = e.o.scale.clone(); e.o.scale.set(e.base.x * s, e.base.y * s, 1); }
      else if (e.kind === "ring") { e.o.scale.setScalar(1 + k * 6); e.o.material.opacity = 0.9 * (1 - k); }
      else if (e.kind === "say") {
        const p = new THREE.Vector3(e.f.x, 7.4, 0).project(camera);
        e.el.style.left = ((p.x + 1) / 2) * innerWidth + "px"; e.el.style.top = ((1 - p.y) / 2) * innerHeight + "px";
      }
      if (k >= 1) { if (e.o) scene.remove(e.o); if (e.el) e.el.remove(); return false; }
      return true;
    });
    if (G.f.length >= 2) hudUpdate(rdt);
  }
  function render(rdt) {
    let mid = 0, span = 4.8;
    if (G.f.length >= 2) {
      const al = alive().length >= 2 ? alive() : G.f;
      const xs = al.map((f) => f.x), lo = Math.min(...xs), hi = Math.max(...xs);
      mid = (lo + hi) / 2; span = hi - lo;
    }
    else { showMembers.forEach((m, i) => { m.body.position.y = Math.abs(Math.sin(performance.now() / 300 + i)) * 0.15; m.arms[1].rotation.x = -0.9 + Math.sin(performance.now() / 200 + i) * 0.5; }); }
    const tanH = Math.tan((camera.fov * Math.PI) / 360);
    const needW = span / 2 + 3.6, needH = 4.6;
    const D = clamp(Math.max(needW / (tanH * camera.aspect), needH / tanH), 13, 60);
    const portrait = camera.aspect < 1;
    camT.set(mid, portrait ? 1.0 + D * 0.12 : 4.0, D);
    if (G.snapCam) { camera.position.copy(camT); G.snapCam = false; }
    else camera.position.lerp(camT, Math.min(1, rdt * 4));
    G.shake = Math.max(0, G.shake - rdt);
    const sh = G.shake * 0.6;
    camera.position.x += rand(-sh, sh); camera.position.y += rand(-sh, sh);
    camera.lookAt(camera.position.x, portrait ? 2.4 - D * 0.04 : 2.7, 0);
    renderer.render(scene, camera);
  }

  // ---------------- mulai ----------------
  loadFaces().then(() => {
    CREW = CREW.filter((c) => faceImg[c.id]);
    if (CREW.length < 2) { err("Foto wajah kurang. Jalankan lewat server lokal (lihat README)."); return; }
    buildArena("gudang");
    showcase();
    setHud(false);
    show("s-title");
    window.__br = { G, cam: camera, scene, startMatch, ARENAS, CREW, hit, draw: () => { G.snapCam = true; render(0.016); }, sim(sec) { for (let t = 0; t < sec; t += 1 / 30) step(1 / 30); return { state: G.state, round: G.round, hp: G.f.map((f) => Math.round(f.hp)), st: G.f.map((f) => f.st), x: G.f.map((f) => +f.x.toFixed(2)), wins: G.f.map((f) => f.wins) }; } };
    requestAnimationFrame(frame);
  });
})();
