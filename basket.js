/* BASKET KANTOR — streetball 3 lawan 3 otomatis di lapangan kompleks (diorama pixel).
   Bisa ganti waktu siang-malam, hujan, dan pasang taruhan Poin Kantor. */
"use strict";
(function () {
  const K = window.K3D, $ = K.$;
  const err = (m) => { $("err").textContent = m; $("err").hidden = false; };
  if (!window.THREE || !K) { err("Gagal memuat. Cek internet lalu refresh."); return; }
  const { clamp, lerp, rand, pick, shuffle, fmt, hex, box, obox, grp, cyl, M, BOXG } = K;
  const THREE = window.THREE;
  let CREW = [];

  // ---------- ukuran lapangan ----------
  const PS = 0.55;                            // skala orang (tinggi ~1,9 unit = ~1,9 m)
  const LX = 13, LZ = 7, FY = 0.35;           // setengah panjang/lebar, tinggi lantai
  const RIMX = 12, RIMY = 3.05, RIMR = 0.3, THREE_R = 6.7;
  const G = 20;                               // gravitasi bola
  const TEAMC = [0x3a7bff, 0xff4a5a], TEAMS = ["Biru", "Merah"];

  const S = {
    px: K.store.get("bk_px", 2), target: K.store.get("bk_target", 21), speed: 1, paused: false,
    yaw: Math.PI / 4, pitch: 0.6, zoom: 14, zoomMin: 4, zoomMax: 34, shake: 0,
    tod: K.store.get("bk_tod", 0.35), autoTime: false, rain: false,
    phase: "menu", p: [], ball: null, poss: 0, score: [0, 0], clock: 360, shotClock: 12, deadT: 0, gt: 0, hype: 0, bets: [], lastFeed: -9, run: 0, timers: [],
  };
  const stage = K.initStage($("game"), S);
  const scene = stage.scene;
  const world = new THREE.Group(); scene.add(world);
  const lamps = [], fans = [], windows = [];
  let netMeshes = [], scoreTex = null, courtMat = null, rain = null;

  // ---------- membangun kompleks ----------
  function buildWorld() {
    K.buildIsland(world, 60, 44, 0x9aa0a8);
    // jalan & trotoar
    world.add(box(60, 0.06, 4, 0x4a4d5a, 0, 0.03, 18.5), box(60, 0.08, 1, 0xd9d4ca, 0, 0.04, 16));
    for (let i = -7; i <= 7; i++) world.add(box(2, 0.07, 0.25, 0xffffff, i * 4, 0.05, 18.5));
    // lapangan dengan garis (tekstur kanvas)
    const tex = K.canvasTex(512, 300, (g, w, h) => {
      g.fillStyle = "#2f7fbf"; g.fillRect(0, 0, w, h);
      g.fillStyle = "#e0773a"; g.fillRect(14, 14, w - 28, h - 28);
      const sx = (w - 28) / (2 * LX), sz = (h - 28) / (2 * LZ), X = (x) => 14 + (x + LX) * sx, Z = (z) => 14 + (z + LZ) * sz;
      g.strokeStyle = "#ffffff"; g.lineWidth = 4;
      g.strokeRect(14, 14, w - 28, h - 28);
      g.beginPath(); g.moveTo(X(0), Z(-LZ)); g.lineTo(X(0), Z(LZ)); g.stroke();
      g.beginPath(); g.ellipse(X(0), Z(0), 1.8 * sx, 1.8 * sz, 0, 0, K.TAU); g.stroke();
      [-1, 1].forEach((s) => {
        g.fillStyle = "#c95e2a"; g.fillRect(Math.min(X(s * LX), X(s * (LX - 5.8))), Z(-2.45), 5.8 * sx, 4.9 * sz);
        g.strokeRect(Math.min(X(s * LX), X(s * (LX - 5.8))), Z(-2.45), 5.8 * sx, 4.9 * sz);
        g.beginPath(); g.ellipse(X(s * RIMX), Z(0), THREE_R * sx, THREE_R * sz, 0, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
      });
      g.fillStyle = "rgba(255,255,255,.35)"; g.font = "700 30px Silkscreen, monospace"; g.textAlign = "center"; g.fillText("KANTOR", X(0), Z(0) + 10);
    });
    courtMat = new THREE.MeshPhongMaterial({ map: tex, shininess: 5, specular: 0x111111 });
    const court = new THREE.Mesh(new THREE.BoxGeometry(2 * LX + 2, FY, 2 * LZ + 2), [M(0x2f7fbf), M(0x2f7fbf), courtMat, M(0x2f7fbf), M(0x2f7fbf), M(0x2f7fbf)]);
    court.position.y = FY / 2; world.add(court);
    // ring basket
    [-1, 1].forEach((s) => {
      const g = new THREE.Group();
      g.add(obox(0.25, RIMY + 0.7, 0.25, 0x3a3f4a, s * (LX + 1.0), (RIMY + 0.7) / 2, 0, 0.05));
      g.add(obox(1.6, 0.18, 0.18, 0x3a3f4a, s * (RIMX + 1.2), RIMY + 0.6, 0, 0.05));
      g.add(obox(0.08, 1.05, 1.8, 0xffffff, s * (RIMX + 0.45), RIMY + 0.35, 0, 0.05));
      g.add(box(0.1, 0.45, 0.6, 0xff4a5a, s * (RIMX + 0.44), RIMY + 0.25, 0));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(RIMR, 0.04, 6, 16), M(0xff7a1a)); rim.rotation.x = Math.PI / 2; rim.position.set(s * RIMX, RIMY, 0); g.add(rim);
      const net = new THREE.Mesh(new THREE.CylinderGeometry(RIMR, RIMR * 0.6, 0.55, 10, 2, true), new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.85 }));
      net.position.set(s * RIMX, RIMY - 0.28, 0); g.add(net); netMeshes.push(net);
      g.position.y = FY; world.add(g);
    });
    // pagar kawat di dua sisi belakang
    const fenceTex = K.canvasTex(32, 32, (g) => { g.clearRect(0, 0, 32, 32); g.strokeStyle = "#b8c0cc"; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(32, 32); g.moveTo(32, 0); g.lineTo(0, 32); g.stroke(); });
    fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
    const fence = (w, x, z, ry) => { const t = fenceTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, 4); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 5), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false })); m.position.set(x, 2.5, z); m.rotation.y = ry; world.add(m); for (let k = 0; k <= Math.round(w / 4); k++) world.add(obox(0.15, 5, 0.15, 0x6a7280, x + (ry ? 0 : -w / 2 + k * (w / Math.round(w / 4))), 2.5, z + (ry ? -w / 2 + k * (w / Math.round(w / 4)) : 0), 0.04)); };
    fence(2 * LX + 6, 0, -(LZ + 2.5), 0);
    fence(2 * LZ + 5, -(LX + 3), 0, Math.PI / 2);
    // gedung ruko & apartemen di belakang
    const winTex = (lit) => K.canvasTex(64, 64, (g) => { g.fillStyle = "#e8e2d4"; g.fillRect(0, 0, 64, 64); g.fillStyle = lit ? "#ffd27a" : "#6f86a8"; g.fillRect(8, 10, 18, 20); g.fillRect(38, 10, 18, 20); g.fillRect(8, 38, 18, 18); g.fillRect(38, 38, 18, 18); });
    const dayW = winTex(false), nightW = winTex(true);
    [[-15, -16.5, 11, 12, 0xe8e2d4], [-2, -17, 10, 8, 0xd9c7a8], [11, -16.5, 11, 14, 0xc9d6e8], [-24.5, 0, 6, 10, 0xe8d0c0]].forEach(([x, z, w, h, c]) => {
      const t = dayW.clone(); t.needsUpdate = true; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(Math.round(w / 2.5), Math.round(h / 2.8));
      const tn = nightW.clone(); tn.needsUpdate = true; tn.wrapS = tn.wrapT = THREE.RepeatWrapping; tn.repeat.copy(t.repeat);
      const mat = new THREE.MeshLambertMaterial({ map: t });
      const b = new THREE.Mesh(BOXG, [mat, mat, M(new THREE.Color(c).multiplyScalar(0.8).getHex()), mat, mat, mat]); b.scale.set(w, h, 5); b.position.set(x, h / 2, z); world.add(b);
      windows.push({ mat, t, tn });
    });
    const graf = K.canvasTex(256, 64, (g) => { g.fillStyle = "#c9c2b4"; g.fillRect(0, 0, 256, 64); g.font = "700 40px Silkscreen, monospace"; g.textAlign = "center"; ["#ff4f8b", "#3a7bff", "#ffcf3f"].forEach((c, i) => { g.fillStyle = c; g.fillText("KANTOR", 128 + i * 3, 46 + i * 2); }); });
    const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 0.4), [M(0xc9c2b4), M(0xc9c2b4), M(0xb8b0a0), M(0xc9c2b4), new THREE.MeshLambertMaterial({ map: graf }), M(0xc9c2b4)]);
    wall.position.set(4, 1.5, -(LZ + 4.2)); world.add(wall);
    // papan skor
    scoreTex = K.canvasTex(256, 96, () => {}, true);
    const sb = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.9), new THREE.MeshBasicMaterial({ map: scoreTex, side: THREE.DoubleSide }));
    sb.position.set(-6, 6.6, -(LZ + 2.6)); world.add(sb, obox(0.2, 5.6, 0.2, 0x3a3f4a, -6, 2.8, -(LZ + 2.7), 0.05));
    // lampu jalan
    [[-LX - 2, -LZ - 1.6], [LX + 2, -LZ - 1.6], [-LX - 2, LZ + 1.8], [LX + 2, LZ + 1.8]].forEach(([x, z], i) => { const l = K.lamp(x, z, 7); l.rotation.y = i < 2 ? -Math.PI / 2 : Math.PI / 2; world.add(l); lamps.push(l); });
    // bangku penonton & pohon
    world.add(obox(20, 0.35, 1.0, 0x8b5a3c, -1, 0.45, -(LZ + 1.6), 0.05), obox(1.0, 0.35, 10, 0x8b5a3c, -(LX + 1.8), 0.45, 0, 0.05));
    [[-26, -18], [24, -18], [-26, 14], [26, 13], [20, -11]].forEach(([x, z]) => world.add(K.tree(x, z, 1.2)));
    // mobil parkir & gerobak
    world.add(grp(obox(4.4, 1.1, 2.1, 0xff6f61, 0, 0.9, 0), obox(2.6, 0.9, 2.0, 0x23324d, -0.2, 1.8, 0)).translateX(-12).translateZ(18.5));
    rain = K.makeRain(scene, 60, 44);
  }
  function drawScoreboard() {
    const cv = scoreTex.userData.canvas, g = cv.getContext("2d");
    g.fillStyle = "#1d1530"; g.fillRect(0, 0, 256, 96); g.strokeStyle = "#ffcf3f"; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
    g.font = "700 46px Silkscreen, monospace"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#6fa8ff"; g.fillText(String(S.score[0]), 64, 54); g.fillStyle = "#ff7a85"; g.fillText(String(S.score[1]), 192, 54);
    g.fillStyle = "#ffcf3f"; g.font = "700 18px Silkscreen, monospace"; g.fillText("VS", 128, 54);
    scoreTex.needsUpdate = true;
  }

  // ---------- pemain & bola ----------
  function makePlayer(c, team, idx) {
    const m = K.makePerson(c, { shirt: TEAMC[team], shorts: team ? 0xb0232f : 0x1f4fc0, pants: new THREE.Color(c.skin).getHex(), shoes: 0xffffff, hs: 1.1, number: [7, 23, 11, 3, 30, 8][team * 3 + idx] });
    const tag = K.textSprite(c.name, team ? "#ff8a95" : "#8ab4ff", 1.9 / PS); tag.position.y = 4.6; m.g.add(tag);
    m.g.scale.setScalar(PS);
    world.add(m.g);
    return { c, team, idx, st: K.statsOf(c), m, x: 0, z: 0, y: 0, a: 0, state: "run", t: 0, spot: null, pts: 0, reb: 0, ast: 0, stl: 0, celebrate: 0 };
  }
  const ballMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), new THREE.MeshLambertMaterial({ color: 0xff8a1a, flatShading: true }));
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2;
  const dir = (team) => (team === 0 ? 1 : -1);
  const rimOf = (team) => ({ x: dir(team) * RIMX, z: 0 });
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const mates = (p) => S.p.filter((q) => q.team === p.team && q !== p);
  const foes = (team) => S.p.filter((q) => q.team !== team);
  const marker = (p) => S.p.find((q) => q.team !== p.team && q.idx === p.idx);
  const openness = (p) => { const f = foes(p.team); return Math.min(...f.map((q) => d2(p, q))); };
  const feed = (t, big) => { K.feed(t, big); S.lastFeed = S.gt; };
  const later = (sec, fn) => S.timers.push({ t: sec, fn, run: S.run });

  function giveBall(p) {
    const B = S.ball;
    B.state = "held"; B.holder = p; B.lastTouch = p; S.poss = p.team; S.shotClock = 12;
    p.state = "run"; p.wantDist = pick([1.0, 3.6, 4.6, 7.3]);
    assignSpots();
  }
  function assignSpots() {
    const t = S.poss, hx = dir(t) * RIMX;
    const spots = shuffle([{ x: hx - dir(t) * 7.4, z: 0 }, { x: hx - dir(t) * 5.0, z: 4.8 }, { x: hx - dir(t) * 5.0, z: -4.8 }, { x: hx - dir(t) * 2.0, z: 3.4 }, { x: hx - dir(t) * 2.0, z: -3.4 }]);
    S.p.filter((q) => q.team === t).forEach((q, i) => (q.spot = spots[i]));
  }
  function inbound(team) {
    const p = pick(S.p.filter((q) => q.team === team));
    p.x = -dir(team) * 3; p.z = rand(-2, 2);
    S.p.filter((q) => q.team === team && q !== p).forEach((q, i) => { q.x = -dir(team) * rand(0, 4); q.z = i ? 4 : -4; });
    giveBall(p);
  }

  // ---------- aksi bola ----------
  function shoot(p) {
    const B = S.ball, r = rimOf(p.team), d = d2(p, r), open = openness(p);
    const skill = (p.st.speed + p.st.power) / 2;
    const dunk = d < 1.4 && p.st.power >= 7 && Math.random() < 0.6;
    let prob = dunk ? 0.86 : d < 1.8 ? 0.6 : d < 4.5 ? 0.47 : d < THREE_R ? 0.4 : 0.35;
    prob += (skill - 6.5) * 0.03; if (open < 1.2 && !dunk) prob -= 0.12;
    const made = Math.random() < clamp(prob, 0.08, 0.95);
    const pts = d >= THREE_R ? 3 : 2;
    p.state = "shoot"; p.t = 0;
    B.state = "windup"; B.shot = { p, made, pts, dunk, d };
    if (dunk) { feed(`${p.c.name} lari ke ring…`); }
  }
  function releaseShot() {
    const B = S.ball, sh = B.shot, p = sh.p, r = rimOf(p.team);
    const T = sh.dunk ? 0.3 : 0.55 + sh.d * 0.05;
    const tx = sh.made ? r.x : r.x + rand(-1, 1) * RIMR * 1.3, tz = sh.made ? 0 : rand(-1, 1) * RIMR * 1.3;
    B.x = p.x + Math.sin(p.a) * 0.25; B.z = p.z + Math.cos(p.a) * 0.25; B.y = sh.dunk ? 3.3 : 2.2 + p.y;
    B.vx = (tx - B.x) / T; B.vz = (tz - B.z) / T; B.vy = (RIMY + 0.1 - B.y + 0.5 * G * T * T) / T;
    B.state = "shot"; B.t = 0; B.T = T; B.holder = null; B.lastTouch = p;
    if (sh.dunk) { K.announce(`<small>${p.c.name}</small>DUNK!`, 1.2); S.hype = 1; }
  }
  function pass(p, q) {
    const B = S.ball;
    B.state = "pass"; B.from = { x: p.x, z: p.z }; B.to = q; B.t = 0; B.T = 0.25 + d2(p, q) * 0.035; B.holder = null; B.lastTouch = p; B.passer = p;
    p.state = "run";
  }
  function scored(sh) {
    const p = sh.p;
    S.score[p.team] += sh.pts; p.pts += sh.pts;
    if (S.ball.passer && S.ball.passer.team === p.team && S.ball.passer !== p && S.gt - (S.ball.passT || 0) < 4) S.ball.passer.ast++;
    K.sfx.swish(); K.sfx.crowd(0.08, 1.6); S.hype = 1; S.shake = sh.dunk ? 0.5 : 0.15;
    netMeshes.forEach((n) => { if (Math.sign(n.position.x) === dir(p.team)) n.userData.shake = 1; });
    const msg = sh.dunk ? `DUNK! ${p.c.name} gantung di ring! (+2)` : sh.pts === 3 ? `TIGA ANGKA dari ${p.c.name}! 🔥` : pick([`${p.c.name} masuk! +2`, `Mulus! ${p.c.name} cetak 2 angka`]);
    feed(msg, sh.pts === 3 || sh.dunk);
    if (sh.pts === 3) K.announce(`<small>${p.c.name}</small>TIGA ANGKA!`, 1.1);
    S.p.filter((q) => q.team === p.team).forEach((q) => (q.celebrate = 1.2));
    drawScoreboard(); hudScore();
    S.ball.state = "dead"; S.deadT = 1.4;
    if (S.score[p.team] >= S.target) endGame(p.team, `${TEAMS[p.team]} sampai ${S.target} poin duluan`);
    else later(1.4, () => inbound(1 - p.team));
  }
  function looseBall(p) {
    const B = S.ball;
    B.state = "loose"; B.holder = null;
    B.vx = -dir(p.team) * rand(2, 5.5); B.vy = rand(4, 7); B.vz = rand(-3, 3);
    K.sfx.rim();
    if (S.gt - S.lastFeed > 1.5) feed(pick([`${p.c.name} gagal, bola mantul di ring!`, `Meleset! ${p.c.name} kurang tenaga.`, `Prang! Kena ring.`]));
  }

  // ---------- kecerdasan pemain ----------
  const speedOf = (p) => 3.2 + p.st.speed * 0.32;
  function moveTo(p, tx, tz, spd, dt) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d > 0.05) { const s = Math.min(d, spd * dt); p.x += (dx / d) * s; p.z += (dz / d) * s; p.a = Math.atan2(dx, dz); p.moving = true; } else p.moving = false;
    p.x = clamp(p.x, -LX - 0.6, LX + 0.6); p.z = clamp(p.z, -LZ - 0.6, LZ + 0.6);
    return d;
  }
  function stepPlayers(dt) {
    const B = S.ball;
    S.p.forEach((p) => {
      p.t += dt; p.moving = false;
      if (p.celebrate > 0) p.celebrate -= dt;
      if (p.state === "shoot") {
        if (B.state === "windup" && B.shot.p === p) {
          if (B.shot.dunk) { const r = rimOf(p.team); moveTo(p, r.x - dir(p.team) * 0.4, 0, speedOf(p) * 1.4, dt); p.y = Math.min(1.3, p.t * 4); }
          if (p.t >= (B.shot.dunk ? 0.38 : 0.28)) releaseShot();
        }
        if (p.t > 0.7) { p.state = "run"; p.y = 0; }
        else if (!B.shot || !B.shot.dunk) p.y = Math.sin(clamp(p.t / 0.6, 0, 1) * Math.PI) * 0.5;
        return;
      }
      p.y = 0;
      if (S.phase !== "play") return;
      const offense = p.team === S.poss;
      const spd = speedOf(p);
      if (B.state === "loose") {
        // kejar bola: dua terdekat tiap tim
        const near = S.p.filter((q) => q.team === p.team).sort((a, b) => d2(a, B) - d2(b, B));
        if (near.indexOf(p) < 2) moveTo(p, B.x, B.z, spd * 1.05, dt);
        else moveTo(p, p.x * 0.98, p.z * 0.98, spd * 0.5, dt);
        return;
      }
      if (B.state === "held" && B.holder === p) {
        // pemegang bola
        const r = rimOf(p.team), d = d2(p, r);
        if (d > p.wantDist) moveTo(p, r.x - dir(p.team) * p.wantDist * 0.8, clamp(p.z + rand(-0.4, 0.4), -3.5, 3.5), spd * 0.85, dt);
        p.decide = (p.decide || 0) - dt;
        if (p.decide <= 0) {
          p.decide = rand(0.3, 0.6);
          const open = openness(p);
          if (S.shotClock < 1.6) return shoot(p);
          if (d <= p.wantDist + 0.5 && (open > 1.1 || Math.random() < 0.45)) return shoot(p);
          const m = marker(p);
          if (m && d2(m, p) < 1.0 && Math.random() < 0.05 * (m.st.speed / p.st.speed)) { steal(m, p); return; }
          if (Math.random() < 0.16) {
            const best = mates(p).sort((a, b) => openness(b) - openness(a))[0];
            if (best) { pass(p, best); return; }
          }
        }
        return;
      }
      if (offense) {
        if (p.spot) moveTo(p, p.spot.x + Math.sin(S.gt + p.idx) * 0.4, p.spot.z, spd * 0.8, dt);
      } else {
        // jaga lawan dengan nomor sama, berdiri di antara dia dan ring
        const m = S.p.find((q) => q.team !== p.team && q.idx === p.idx), r = rimOf(1 - p.team);
        const dd = d2(m, r) || 1, k = Math.min(1.0, dd * 0.35);
        moveTo(p, m.x + ((r.x - m.x) / dd) * k, m.z + ((r.z - m.z) / dd) * k, spd, dt);
        p.a = Math.atan2(m.x - p.x, m.z - p.z);
      }
    });
    // jangan saling tembus
    for (let i = 0; i < S.p.length; i++) for (let j = i + 1; j < S.p.length; j++) {
      const a = S.p[i], b = S.p[j], d = d2(a, b);
      if (d < 0.7 && d > 0.001) { const k = (0.7 - d) / 2, ux = (b.x - a.x) / d, uz = (b.z - a.z) / d; a.x -= ux * k; a.z -= uz * k; b.x += ux * k; b.z += uz * k; }
    }
  }
  function steal(thief, victim) {
    thief.stl++;
    feed(`${thief.c.name} CURI bola dari ${victim.c.name}! 😱`, true);
    K.sfx.crowd(0.06, 1); giveBall(thief);
  }

  // ---------- fisika bola ----------
  function stepBall(dt) {
    const B = S.ball;
    if (B.state === "held") {
      const p = B.holder, side = 0.42;
      B.x = p.x + Math.sin(p.a + 0.6) * side; B.z = p.z + Math.cos(p.a + 0.6) * side;
      const ph = (S.gt * 3.2) % 1, hy = 0.75;
      B.y = p.moving ? Math.abs(Math.cos(ph * Math.PI)) * hy + 0.22 : 1.0;
      if (p.moving && ph < (B.lastPh || 0)) K.sfx.bounce(0.35);
      B.lastPh = ph;
      S.shotClock -= dt;
    } else if (B.state === "windup") {
      const p = B.shot.p; B.x = p.x + Math.sin(p.a) * 0.2; B.z = p.z + Math.cos(p.a) * 0.2; B.y = 2.3 + p.y;
    } else if (B.state === "pass") {
      B.t += dt; const k = clamp(B.t / B.T, 0, 1), q = B.to;
      B.x = lerp(B.from.x, q.x, k); B.z = lerp(B.from.z, q.z, k); B.y = 1.1 + Math.sin(k * Math.PI) * 0.6;
      if (k >= 1) {
        const thief = foes(B.passer.team).find((f) => d2(f, q) < 0.8);
        if (thief && Math.random() < 0.25) { feed(`Umpan ${B.passer.c.name} dipotong ${thief.c.name}!`, true); thief.stl++; giveBall(thief); }
        else { B.passT = S.gt; giveBall(q); B.passer = B.passer; if (Math.random() < 0.3 && S.gt - S.lastFeed > 2) feed(`Umpan ${B.passer.c.name} ke ${q.c.name}.`); }
      }
    } else if (B.state === "shot") {
      B.t += dt; B.vy -= G * dt;
      B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      if (B.t >= B.T) {
        const sh = B.shot;
        if (sh.made) { B.x = dir(sh.p.team) * RIMX; B.z = 0; B.y = RIMY; B.vx = 0; B.vz = 0; B.vy = -3; scored(sh); }
        else looseBall(sh.p);
      }
    } else if (B.state === "loose" || B.state === "dead") {
      B.vy -= G * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      if (B.y < 0.2) { B.y = 0.2; if (Math.abs(B.vy) > 2) K.sfx.bounce(Math.min(1, Math.abs(B.vy) / 8)); B.vy = Math.abs(B.vy) * 0.55; B.vx *= 0.8; B.vz *= 0.8; if (B.vy < 0.6) B.vy = 0; }
      if (Math.abs(B.x) > LX + 1) { B.x = Math.sign(B.x) * (LX + 1); B.vx *= -0.5; }
      if (Math.abs(B.z) > LZ + 1) { B.z = Math.sign(B.z) * (LZ + 1); B.vz *= -0.5; }
      if (B.state === "loose" && B.y < 2.0) {
        const p = S.p.filter((q) => d2(q, B) < 0.8).sort((a, b) => d2(a, B) - d2(b, B))[0];
        if (p) {
          p.reb++;
          const off = p.team === B.lastTouch.team;
          if (S.gt - S.lastFeed > 1) feed(off ? `Rebound serangan ${p.c.name}!` : `Rebound ${p.c.name}, ganti bola!`);
          giveBall(p);
        }
      }
    }
    if (S.ball.state === "held" && S.shotClock <= 0) { const p = B.holder; feed(`Waktu serang habis! Bola pindah.`); inbound(1 - p.team); }
    ballMesh.position.set(B.x, FY + B.y, B.z);
    ballMesh.rotation.x += dt * 6; ballMesh.rotation.z += dt * 4;
    ballShadow.position.set(B.x, FY + 0.02, B.z); ballShadow.scale.setScalar(clamp(1 - B.y / 8, 0.3, 1));
  }

  // ---------- animasi ----------
  function animate(p, dt, t) {
    const m = p.m;
    m.g.position.set(p.x, FY + p.y, p.z); m.g.rotation.y = p.a;
    m.head.rotation.y = clamp(K.wrapA(S.yaw - p.a) * 0.55, -1.1, 1.1);
    const run = p.moving ? Math.sin(t * 13 + p.idx) * 0.6 : 0;
    m.legs[0].rotation.x = run; m.legs[1].rotation.x = -run;
    m.body.position.y = p.moving ? Math.abs(Math.sin(t * 13 + p.idx)) * 0.12 : 0;
    const B = S.ball;
    if (p.celebrate > 0) { m.aim(0, -0.4, 4.4, 0.2); m.aim(1, 0.4, 4.4, 0.2); m.body.position.y = Math.abs(Math.sin(t * 10)) * 0.4; }
    else if (p.state === "shoot") { m.aim(0, -0.2, 4.2, 0.5); m.aim(1, 0.2, 4.2, 0.5); }
    else if (B.holder === p) { m.aim(0, -0.5, 1.6, 0.6); m.aim(1, 0.5, p.moving ? 1.0 : 1.9, 0.9); }
    else if (p.team !== S.poss && S.phase === "play") { m.aim(0, -0.9, 2.6, 0.6); m.aim(1, 0.9, 2.6, 0.6); }
    else { m.aim(0, -0.5, 1.2, 0.3 + run * 0.3); m.aim(1, 0.5, 1.2, 0.3 - run * 0.3); }
  }

  // ---------- HUD ----------
  function hudScore() {
    $("sc-0").textContent = S.score[0]; $("sc-1").textContent = S.score[1];
    $("sc-info").textContent = `SAMPAI ${S.target}`;
    const c = Math.max(0, Math.ceil(S.clock)); $("sc-clock").textContent = Math.floor(c / 60) + ":" + String(c % 60).padStart(2, "0");
  }
  function setHud(on) { ["score", "feed", "ctrl"].forEach((k) => ($(k).hidden = !on)); $("back").hidden = on; }

  // ---------- alur ----------
  function clearGame() {
    S.run++; S.timers = [];
    S.p.forEach((p) => world.remove(p.m.g)); S.p = [];
    fans.forEach((f) => world.remove(f.g)); fans.length = 0;
    world.remove(ballMesh); world.remove(ballShadow);
    document.querySelectorAll(".announce").forEach((e) => e.remove());
  }
  function placeFans(exclude) {
    fans.forEach((f) => world.remove(f.g)); fans.length = 0;
    const pool = shuffle(CREW.filter((c) => !exclude.includes(c)));
    if (!pool.length) return;
    const seats = [];
    for (let k = 0; k < 12; k++) seats.push({ x: -10.5 + k * 1.7, z: -(LZ + 1.6), face: 0 });
    for (let k = 0; k < 6; k++) seats.push({ x: -(LX + 1.8), z: -4.2 + k * 1.7, face: Math.PI / 2 });
    seats.forEach((s, i) => { const f = K.makeFan(pool[i % pool.length]); f.g.scale.setScalar(PS); f.g.position.set(s.x, 0.62, s.z); f.g.rotation.y = s.face; f.baseY = 0.62; f.face = s.face; world.add(f.g); fans.push(f); });
  }
  let teamsSel = [[], []];
  function startGame(teams) {
    clearGame();
    S.p = [];
    teams.forEach((list, t) => list.forEach((c, i) => S.p.push(makePlayer(c, t, i))));
    placeFans(teams[0].concat(teams[1]));
    world.add(ballMesh, ballShadow);
    S.ball = { state: "dead", x: 0, y: 3, z: 0, vx: 0, vy: 0, vz: 0, holder: null, lastTouch: S.p[0] };
    Object.assign(S, { score: [0, 0], clock: 360, gt: 0, phase: "intro", hype: 0.6, lastFeed: -9, paused: false });
    S.p.forEach((p) => { p.x = dir(p.team) * -2 - dir(p.team) * p.idx * 2; p.z = (p.idx - 1) * 3; p.a = Math.atan2(-p.x, 0); });
    drawScoreboard();
    $("sc-f0").innerHTML = teams[0].map((c) => `<img src="faces/${c.id}.png" alt="">`).join("");
    $("sc-f1").innerHTML = teams[1].map((c) => `<img src="faces/${c.id}.png" alt="">`).join("");
    show(null); setHud(true); hudScore();
    $("c-pause").textContent = "⏸";
    stage.snap(new THREE.Vector3(0, 1.2, 0));
    K.announce(`<small>Tim Biru vs Tim Merah</small>TIP OFF!`, 1.6);
    K.sfx.whistle(); K.sfx.crowd(0.08, 2);
    feed(`Pertandingan sampai ${S.target} poin. Siap-siap!`);
    later(1.8, () => {
      // lompatan bola awal
      const a = S.p.find((p) => p.team === 0), b = S.p.find((p) => p.team === 1);
      const w = (a.st.power + rand(0, 4)) > (b.st.power + rand(0, 4)) ? a : b;
      S.phase = "play"; K.sfx.whistle(); feed(`${w.c.name} menang lompatan awal!`); giveBall(w);
    });
  }
  function endGame(team, why) {
    if (S.phase === "over") return;
    S.phase = "over";
    K.sfx.whistle(); K.sfx.applause(0.07, 2.5);
    K.announce(`<small>${why}</small>TIM ${TEAMS[team].toUpperCase()} MENANG!`, 2.2);
    S.p.filter((q) => q.team === team).forEach((q) => (q.celebrate = 3));
    S.winner = team;
    later(3, showResult);
  }
  function showResult() {
    const w = S.winner;
    K.settle(S.bets, w);
    setHud(false);
    $("r-faces").innerHTML = S.p.filter((p) => p.team === w).map((p) => `<img class="result-face" style="width:96px;height:118px;margin-top:0" src="faces/${p.c.id}.png" alt="">`).join("");
    $("r-big").textContent = `TIM ${TEAMS[w].toUpperCase()} MENANG!`;
    $("r-how").textContent = `Skor akhir ${S.score[0]} – ${S.score[1]}`;
    const mvp = S.p.slice().sort((a, b) => b.pts - a.pts)[0];
    $("r-box").innerHTML = S.p.slice().sort((a, b) => b.pts - a.pts).map((p) => `<div><img src="faces/${p.c.id}.png" alt="" style="border-color:${hex(TEAMC[p.team])}">${p.c.name}${p === mvp ? " ⭐ MVP" : ""}<span>${p.pts} poin · ${p.reb} reb · ${p.ast} ast · ${p.stl} curi</span></div>`).join("");
    const bets = S.bets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${CREW.find((c) => c.id === b.who).name} → Tim ${TEAMS[b.pick]} (${fmt(b.amount)})<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "kalah"}</span></div>`).join("");
    $("r-bets-wrap").hidden = !bets; $("r-bets").innerHTML = bets;
    S.phase = "done";
    show("s-result");
  }

  // ---------- menu ----------
  const screens = ["s-title", "s-pick", "s-bet", "s-result"];
  function show(id) { screens.forEach((s) => ($(s).hidden = s !== id)); }
  function renderOpts() {
    document.querySelectorAll("[data-target]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.target === S.target));
    document.querySelectorAll("[data-px]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.px === S.px));
    $("opt-sound").textContent = K.sound.on ? "🔊 Suara" : "🔇 Suara"; $("opt-sound").setAttribute("aria-pressed", K.sound.on);
  }
  document.querySelectorAll("[data-target]").forEach((b) => b.onclick = () => { S.target = +b.dataset.target; K.store.set("bk_target", S.target); K.sfx.click(); renderOpts(); });
  document.querySelectorAll("[data-px]").forEach((b) => b.onclick = () => { S.px = +b.dataset.px; K.store.set("bk_px", S.px); stage.resize(); K.sfx.click(); renderOpts(); });
  $("opt-sound").onclick = () => { K.sound.on = !K.sound.on; K.store.set("k3_sound", K.sound.on); if (!K.sound.on) K.rainSound(false); renderOpts(); };
  const randTeams = () => { const l = shuffle(CREW).slice(0, 6); return [l.slice(0, 3), l.slice(3, 6)]; };
  $("go-pick").onclick = () => { K.sfx.click(); teamsSel = [[], []]; renderPick(); show("s-pick"); };
  $("go-rand").onclick = () => { K.sfx.click(); teamsSel = randTeams(); openBet(); };
  function renderPick() {
    $("pick-grid").innerHTML = CREW.map((c) => {
      const t = teamsSel[0].includes(c) ? 0 : teamsSel[1].includes(c) ? 1 : -1;
      return `<button class="pf" data-id="${c.id}" ${t >= 0 ? `style="background:${hex(TEAMC[t])}55"` : ""}>${t >= 0 ? `<span class="tagc" style="background:${hex(TEAMC[t])}">${TEAMS[t].toUpperCase()}</span>` : ""}<img src="faces/${c.id}.png" alt="">${c.name}<small>⭐ ${K.statsOf(c).rating}</small></button>`;
    }).join("");
    $("pick-title").textContent = `Biru ${teamsSel[0].length}/3 · Merah ${teamsSel[1].length}/3`;
    $("pick-ok").disabled = teamsSel[0].length !== 3 || teamsSel[1].length !== 3;
  }
  $("pick-grid").onclick = (e) => {
    const b = e.target.closest(".pf"); if (!b) return;
    const c = CREW.find((x) => x.id === b.dataset.id); K.sfx.click();
    if (teamsSel[0].includes(c)) { teamsSel[0] = teamsSel[0].filter((x) => x !== c); if (teamsSel[1].length < 3) teamsSel[1].push(c); }
    else if (teamsSel[1].includes(c)) teamsSel[1] = teamsSel[1].filter((x) => x !== c);
    else if (teamsSel[0].length < 3) teamsSel[0].push(c);
    else if (teamsSel[1].length < 3) teamsSel[1].push(c);
    renderPick();
  };
  $("pick-rand").onclick = () => { teamsSel = randTeams(); K.sfx.click(); renderPick(); };
  $("pick-back").onclick = () => show("s-title");
  $("pick-ok").onclick = () => openBet();
  function openBet() {
    S.bets = [];
    const odds = K.oddsFor(teamsSel.map((l) => l.reduce((s, c) => s + K.statsOf(c).rating, 0) / 3));
    S.odds = odds;
    $("bet-teams").innerHTML = [0, 1].map((t) => `<div class="team" style="border-color:${hex(TEAMC[t])}"><div class="faces">${teamsSel[t].map((c) => `<img src="faces/${c.id}.png" alt="">`).join("")}</div><b>Tim ${TEAMS[t]}</b><small>${teamsSel[t].map((c) => c.name).join(", ")}</small><br><span class="odds">x${odds[t]}</span></div>`).join('<div class="vs-mid">VS</div>');
    renderBets();
    show("s-bet");
  }
  function whoPick(c) { K.betModal(c, [0, 1].map((t) => ({ label: `Tim ${TEAMS[t]}`, mult: S.odds[t] })), (bet) => { S.bets.push(bet); renderBets(); K.renderWho($("bet-who"), CREW, whoPick); }); }
  function renderBets() {
    K.renderWho($("bet-who"), CREW, whoPick);
    $("bet-list").innerHTML = S.bets.map((b, i) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${CREW.find((c) => c.id === b.who).name} pasang <b>${fmt(b.amount)}</b> untuk <b>Tim ${TEAMS[b.pick]}</b> · x${b.mult}<button class="x" data-i="${i}">✕</button></div>`).join("") || "<small>Belum ada taruhan. Boleh langsung mulai juga.</small>";
    $("bet-list").querySelectorAll(".x").forEach((x) => x.onclick = () => { const b = S.bets.splice(+x.dataset.i, 1)[0]; K.setPts(b.who, K.getPts(b.who) + b.amount); renderBets(); });
  }
  $("bet-back").onclick = () => { S.bets.forEach((b) => K.setPts(b.who, K.getPts(b.who) + b.amount)); S.bets = []; show("s-title"); };
  $("bet-go").onclick = () => startGame(teamsSel);
  $("r-again").onclick = () => openBet();
  $("r-menu").onclick = () => { clearGame(); placeFans([]); S.phase = "menu"; show("s-title"); };

  // ---------- kontrol ----------
  document.querySelectorAll("[data-spd]").forEach((b) => b.onclick = () => { S.speed = +b.dataset.spd; document.querySelectorAll("[data-spd]").forEach((x) => x.setAttribute("aria-pressed", x === b)); });
  $("c-pause").onclick = () => { S.paused = !S.paused; $("c-pause").textContent = S.paused ? "▶" : "⏸"; };
  $("c-time").value = S.tod;
  $("c-time").oninput = (e) => { S.tod = +e.target.value; K.store.set("bk_tod", S.tod); S.autoTime = false; $("c-auto").setAttribute("aria-pressed", false); };
  $("c-auto").onclick = () => { S.autoTime = !S.autoTime; $("c-auto").setAttribute("aria-pressed", S.autoTime); };
  $("c-rain").onclick = () => { S.rain = !S.rain; rain.set(S.rain); $("c-rain").setAttribute("aria-pressed", S.rain); if (S.rain) K.sfx.thunder(); };
  $("c-rot").onclick = () => { S.yaw -= Math.PI / 2; };
  $("c-zin").onclick = () => { S.zoom = clamp(S.zoom * 0.85, S.zoomMin, S.zoomMax); };
  $("c-zout").onclick = () => { S.zoom = clamp(S.zoom * 1.18, S.zoomMin, S.zoomMax); };
  $("c-quit").onclick = () => { if (!confirm("Hentikan pertandingan? Taruhan dikembalikan.")) return; S.bets.forEach((b) => K.setPts(b.who, K.getPts(b.who) + b.amount)); S.bets = []; clearGame(); placeFans([]); setHud(false); S.phase = "menu"; show("s-title"); };
  addEventListener("keydown", (e) => { if (!S.p.length) return; if (e.code === "Space") { e.preventDefault(); $("c-pause").click(); } if (e.code === "KeyR") $("c-rain").click(); });

  // ---------- loop ----------
  let t0 = performance.now(), time = 0;
  const camTgt = new THREE.Vector3();
  function tick(rdt) {
    if (S.paused) return;
    time += rdt;
    const gdt = rdt * (S.p.length ? S.speed : 1);
    const steps = Math.max(1, Math.ceil(gdt / (1 / 60)));
    for (let i = 0; i < steps; i++) {
      const dt = gdt / steps;
      S.gt += dt;
      const due = [];
      S.timers = S.timers.filter((tm) => { if (tm.run !== S.run) return false; tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
      due.forEach((tm) => { if (tm.run === S.run) tm.fn(); });
      if (S.p.length && S.phase !== "done") {
        if (S.phase === "play") {
          S.clock -= dt;
          if (S.clock <= 0 && S.ball.state !== "shot" && S.ball.state !== "windup") {
            if (S.score[0] !== S.score[1]) endGame(S.score[0] > S.score[1] ? 0 : 1, "Waktu habis");
            else if (!S.golden) { S.golden = true; feed("Seri! Siapa cetak angka berikutnya, menang!", true); K.announce("BOLA EMAS!", 1.2); S.target = Math.max(S.score[0], S.score[1]) + 1; }
          }
        }
        stepPlayers(dt); stepBall(dt);
      }
    }
    if (S.autoTime) { S.tod = (S.tod + rdt * 0.012) % 1; $("c-time").value = S.tod; }
    const night = K.daylight(stage, S.tod, lamps, S.rain);
    windows.forEach((w) => {
      const lit = night > 0.4;
      if (w.lit !== lit) { w.lit = lit; w.mat.map = lit ? w.tn : w.t; w.mat.emissiveMap = lit ? w.tn : null; w.mat.emissive.setHex(lit ? 0xffffff : 0x000000); w.mat.emissiveIntensity = 0.75; w.mat.needsUpdate = true; }
    });
    courtMat.color.setHex(S.rain ? 0x8a93a8 : 0xffffff); courtMat.shininess = S.rain ? 80 : 5; courtMat.specular.setHex(S.rain ? 0x8899aa : 0x111111);
    rain.update(rdt, FY);
    netMeshes.forEach((n) => { if (n.userData.shake > 0) { n.userData.shake -= rdt * 2; n.scale.y = 1 + Math.sin(time * 40) * 0.25 * n.userData.shake; } else n.scale.y = 1; });
    S.hype = Math.max(0, S.hype - rdt * 0.4); S.shake = Math.max(0, S.shake - rdt);
    S.p.forEach((p) => animate(p, rdt, time));
    K.animFans(fans, time, S.hype, S.yaw);
    if (S.phase === "play" || S.phase === "intro") hudScore();
    if (!S.p.length) S.yaw += rdt * 0.06;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    tick(rdt);
    if (S.p.length && S.ball) camTgt.set(lerp(0, S.ball.x, 0.5), 1.2, lerp(0, S.ball.z, 0.3)); else camTgt.set(0, 1.2, 0);
    stage.render(rdt, camTgt);
  }

  // ---------- mulai ----------
  K.loadCrew().then((crew) => {
    CREW = crew;
    if (CREW.length < 6) { err("Butuh minimal 6 wajah. Jalankan lewat server lokal (lihat README)."); return; }
    buildWorld(); drawScoreboard(); placeFans([]);
    renderOpts(); show("s-title");
    window.__bk = { S, start: startGame, CREW: () => CREW, draw: () => stage.render(0.016, camTgt), sim(sec) { for (let t = 0; t < sec; t += 0.05) tick(0.05); return { phase: S.phase, score: S.score.slice(), ball: S.ball && S.ball.state, clock: Math.round(S.clock) }; } };
    requestAnimationFrame(frame);
  });
})();
