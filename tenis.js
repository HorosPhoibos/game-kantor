/* TENIS KANTOR — kompleks tenis mini (diorama pixel) dengan 4 lapangan.
   Pertandingan tunggal otomatis: servis, reli, out, net, ace, deuce, tiebreak.
   Siang-malam, hujan, suara wasit, dan taruhan Poin Kantor. Ukuran orang & lapangan proporsional. */
"use strict";
(function () {
  const K = window.K3D, $ = K.$;
  const err = (m) => { $("err").textContent = m; $("err").hidden = false; };
  if (!window.THREE || !K) { err("Gagal memuat. Cek internet lalu refresh."); return; }
  const { clamp, lerp, rand, pick, shuffle, fmt, hex, box, obox, grp, M, BOXG } = K;
  const THREE = window.THREE;
  let CREW = [];

  // ---------- ukuran asli (1 unit ≈ 1 meter) ----------
  const PS = 0.55;                 // orang ~1,9 m
  const CL = 11.9, CW = 4.1, OW = 5.5, SL = 6.4, NH = 0.95, FY = 0.2, BR = 0.12, GRAV = 12;
  const SURF = {
    clay:   { name: "Tanah Liat", c1: "#c8643a", c2: "#b8562f", out: 0xb04f2a, k: 0.72, b: 0.72 },
    grass:  { name: "Rumput", c1: "#57b35a", c2: "#4ca34f", out: 0x3f8f44, k: 0.92, b: 0.55 },
    hard:   { name: "Lapangan Keras", c1: "#2f6fbf", c2: "#2f6fbf", out: 0x3a8a5a, k: 0.84, b: 0.65 },
    carpet: { name: "Karpet", c1: "#7a4fd0", c2: "#7a4fd0", out: 0x5a3aa0, k: 0.86, b: 0.6 },
  };
  const SURF_KEYS = Object.keys(SURF);
  const COLORS = [0x3a7bff, 0xff4a5a];

  const S = {
    px: K.store.get("tn_px", 2), fmt: K.store.get("tn_fmt", "4"), surf: K.store.get("tn_surf", "acak"), speed: 1, paused: false,
    yaw: Math.PI / 4, pitch: 0.62, zoom: 13, zoomMin: 4, zoomMax: 40, shake: 0,
    tod: 0.3, autoTime: true, rain: false, phase: "menu", p: [], ball: null, gt: 0, hype: 0, bets: [], run: 0, timers: [], courtKey: "hard",
  };
  const stage = K.initStage($("game"), S);
  const scene = stage.scene;
  const world = new THREE.Group(); scene.add(world);
  const lamps = [], fans = [], ambient = [];
  let courtGroups = {}, rain = null, umpire = null;

  // ---------- kompleks 4 lapangan ----------
  const SLOTS = [[0, 0], [0, -(2 * OW + 7)], [-(2 * CL + 9), 0], [-(2 * CL + 9), -(2 * OW + 7)]];
  function courtTexture(sf) {
    return K.canvasTex(512, 256, (g, w, h) => {
      const L = CL + 2.5, W = OW + 1.5, sx = w / (2 * L), sz = h / (2 * W), X = (x) => (x + L) * sx, Z = (z) => (z + W) * sz;
      g.fillStyle = K.hex(sf.out); g.fillRect(0, 0, w, h);
      if (sf === SURF.grass) for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? sf.c1 : sf.c2; g.fillRect(X(-CL) + i * (2 * CL * sx) / 12, Z(-OW), (2 * CL * sx) / 12 + 1, 2 * OW * sz); }
      else { g.fillStyle = sf.c1; g.fillRect(X(-CL), Z(-OW), 2 * CL * sx, 2 * OW * sz); }
      g.strokeStyle = "#ffffff"; g.lineWidth = 3;
      g.strokeRect(X(-CL), Z(-OW), 2 * CL * sx, 2 * OW * sz);
      g.strokeRect(X(-CL), Z(-CW), 2 * CL * sx, 2 * CW * sz);
      [-SL, SL].forEach((x) => { g.beginPath(); g.moveTo(X(x), Z(-CW)); g.lineTo(X(x), Z(CW)); g.stroke(); });
      g.beginPath(); g.moveTo(X(-SL), Z(0)); g.lineTo(X(SL), Z(0)); g.stroke();
      [-CL, CL].forEach((x) => { g.beginPath(); g.moveTo(X(x), Z(-0.15)); g.lineTo(X(x - Math.sign(x) * 0.4), Z(-0.15)); g.stroke(); });
    });
  }
  function buildCourt(key, ox, oz) {
    const sf = SURF[key], g = new THREE.Group();
    const top = new THREE.MeshPhongMaterial({ map: courtTexture(sf), shininess: 4, specular: 0x111111 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * CL + 5, FY, 2 * OW + 3), [M(sf.out), M(sf.out), top, M(sf.out), M(sf.out), M(sf.out)]);
    slab.position.y = FY / 2; g.add(slab);
    // net
    g.add(obox(0.1, NH + 0.12, 0.1, 0x3a3f4a, 0, FY + (NH + 0.12) / 2, OW + 0.4, 0.04), obox(0.1, NH + 0.12, 0.1, 0x3a3f4a, 0, FY + (NH + 0.12) / 2, -OW - 0.4, 0.04));
    const nt = K.canvasTex(64, 16, (x) => { x.clearRect(0, 0, 64, 16); x.strokeStyle = "#e8e8e8"; x.lineWidth = 1; for (let i = 0; i <= 64; i += 4) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 16); x.stroke(); } for (let j = 0; j <= 16; j += 4) { x.beginPath(); x.moveTo(0, j); x.lineTo(64, j); x.stroke(); } x.fillStyle = "#ffffff"; x.fillRect(0, 0, 64, 2); });
    nt.wrapS = THREE.RepeatWrapping; nt.repeat.set(8, 1);
    const net = new THREE.Mesh(new THREE.PlaneGeometry(2 * OW + 0.8, NH), new THREE.MeshBasicMaterial({ map: nt, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    net.rotation.y = Math.PI / 2; net.position.set(0, FY + NH / 2, 0); g.add(net);
    // pagar rendah
    const fc = 0x2e5e3e;
    g.add(obox(2 * CL + 5, 0.9, 0.1, fc, 0, 0.45, -(OW + 1.5), 0.03), obox(0.1, 0.9, 2 * OW + 3, fc, -(CL + 2.5), 0.45, 0, 0.03), obox(0.1, 0.9, 2 * OW + 3, fc, CL + 2.5, 0.45, 0, 0.03));
    const label = K.textSprite(sf.name.toUpperCase(), "#ffffff", 4.5); label.position.set(-CL + 3, 2.4, -(OW + 1.5)); g.add(label);
    g.position.set(ox, 0, oz); world.add(g);
    return g;
  }
  function buildWorld() {
    const g0 = new THREE.Group(); g0.position.set(-17, 0, -9); world.add(g0);
    K.buildIsland(g0, 74, 44, 0x8fbf74);
    rebuildCourts("hard");
    // tribun & wasit di lapangan utama
    world.add(obox(2 * CL, 0.4, 1.2, 0x9a7ae8, 0, 0.2, -(OW + 3.0), 0.06), obox(2 * CL, 0.8, 1.2, 0x7a5ad0, 0, 0.4, -(OW + 4.2), 0.06));
    // lampu sorot
    [[-CL - 3, -OW - 2], [CL + 3, -OW - 2], [-CL - 3, OW + 2], [CL + 3, OW + 2], [-(2 * CL + 9) - CL - 3, OW + 2], [-(2 * CL + 9) + CL + 3, -(2 * OW + 7) - OW - 2]].forEach(([x, z]) => {
      const l = K.lamp(x, z, 8); l.rotation.y = Math.atan2(x, z) + Math.PI / 2; world.add(l); lamps.push(l);
    });
    // klub house & pepohonan
    const hut = grp(obox(8, 3.4, 5, 0xf2ead8, 0, 1.7, 0), obox(8.8, 0.4, 5.8, 0x2e7d4f, 0, 3.6, 0), obox(1.4, 2.2, 0.2, 0x6b4428, 0, 1.1, 2.55));
    const sign = K.signPlane("KLUB TENIS KANTOR", "#2e7d4f", "#ffffff", 7, 1); sign.position.set(0, 4.4, 2.6); hut.add(sign);
    hut.position.set(CL + 6, 0, -(2 * OW + 7)); world.add(hut);
    [[CL + 8, 6], [CL + 9, -4], [-46, 8], [-46, -26], [-12, -26], [12, -27], [-30, 9]].forEach(([x, z]) => world.add(K.tree(x, z, 1.1)));
    // kursi wasit
    const chair = grp(obox(0.15, 2.2, 0.15, 0xffffff, -0.4, 1.1, -0.4, 0.03), obox(0.15, 2.2, 0.15, 0xffffff, 0.4, 1.1, -0.4, 0.03), obox(0.15, 2.2, 0.15, 0xffffff, -0.4, 1.1, 0.4, 0.03), obox(0.15, 2.2, 0.15, 0xffffff, 0.4, 1.1, 0.4, 0.03), obox(1.1, 0.12, 1.1, 0x2e7d4f, 0, 2.2, 0, 0.03), obox(1.1, 0.8, 0.12, 0x2e7d4f, 0, 2.6, -0.5, 0.03));
    chair.position.set(0, 0, -(OW + 1.0)); world.add(chair);
    rain = K.makeRain(scene, 74, 44);
  }
  function rebuildCourts(mainKey) {
    Object.values(courtGroups).forEach((g) => world.remove(g)); courtGroups = {};
    const order = [mainKey].concat(SURF_KEYS.filter((k) => k !== mainKey));
    order.forEach((k, i) => { courtGroups[k] = buildCourt(k, SLOTS[i][0], SLOTS[i][1]); });
    S.courtKey = mainKey;
  }

  // ---------- orang ----------
  function racket(color) {
    const g = new THREE.Group();
    g.add(K.box(0.14, 0.14, 0.9, 0x1d1530, 0, 0, 0.45));
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 14), K.M(color)); head.position.z = 1.3; g.add(head);
    const str = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), new THREE.MeshBasicMaterial({ color: 0xf2f2f2, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); str.position.z = 1.3; g.add(str);
    return g;
  }
  function makePlayer(c, i) {
    const m = K.makePerson(c, { shorts: i ? 0xb0232f : 0x1f4fc0, pants: new THREE.Color(c.skin).getHex(), shoes: 0xffffff, hs: 1.1 });
    m.arms[1].grip.add(racket(COLORS[i]));
    const tag = K.textSprite(c.name, i ? "#ff8a95" : "#8ab4ff", 1.9 / PS); tag.position.y = 4.6; m.g.add(tag);
    m.g.scale.setScalar(PS); world.add(m.g);
    return { c, i, st: K.statsOf(c), m, x: 0, z: 0, a: 0, tx: 0, tz: 0, swing: 0, swingKind: "fh", moving: false, stats: { ace: 0, df: 0, win: 0, err: 0, pts: 0 } };
  }
  function makeAmbient(c1, c2, ox, oz) {
    const ps = [c1, c2].map((c, i) => { const m = K.makePerson(c, { pants: new THREE.Color(c.skin).getHex(), shoes: 0xffffff, hs: 1.1 }); m.arms[1].grip.add(racket(0xffcf3f)); m.g.scale.setScalar(PS); world.add(m.g); return m; });
    const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8ff3a })); world.add(ball);
    return { ps, ball, ox, oz, t: rand(0, 2), z: [0, 0] };
  }
  function stepAmbient(a, dt) {
    a.t += dt;
    const per = 1.6, ph = (a.t % (2 * per)) / per, dirn = ph < 1 ? 1 : -1, k = ph < 1 ? ph : ph - 1;
    const x0 = -(CL - 1) * dirn, x1 = (CL - 1) * dirn;
    a.z[0] = Math.sin(a.t * 0.9) * 2.5; a.z[1] = Math.sin(a.t * 0.7 + 1) * 2.5;
    const zf = dirn > 0 ? a.z[0] : a.z[1], zt = dirn > 0 ? a.z[1] : a.z[0];
    a.ball.position.set(a.ox + lerp(x0, x1, k), FY + 1 + Math.sin(k * Math.PI) * 1.6, a.oz + lerp(zf, zt, k));
    a.ps.forEach((m, i) => { m.g.position.set(a.ox + (i ? CL - 0.5 : -CL + 0.5), FY, a.oz + a.z[i]); m.g.rotation.y = i ? -Math.PI / 2 : Math.PI / 2; m.head.rotation.y = clamp(K.wrapA(S.yaw - m.g.rotation.y) * 0.5, -1, 1); const sw = (i === 0 && dirn > 0 && k < 0.15) || (i === 1 && dirn < 0 && k < 0.15); m.aim(1, sw ? 1.1 : 0.8, 2.0, sw ? 1.2 : -0.2, 1); });
  }

  // ---------- skor ----------
  const PN = ["0", "15", "30", "40"], PNI = ["kosong", "lima belas", "tiga puluh", "empat puluh"];
  const M_ = { pts: [0, 0], games: [0, 0], sets: [], setsWon: [0, 0], tb: null, server: 0, pointNo: 0 };
  const G_TARGET = () => (S.fmt === "6" ? 6 : 4), SETS_NEED = () => (S.fmt === "b3" ? 2 : 1);
  function callScore() {
    const [a, b] = M_.pts, sv = M_.server, rv = 1 - sv, P = S.p;
    if (M_.tb) return { text: `Tiebreak ${M_.tb[0]}-${M_.tb[1]}`, say: `${M_.tb[sv]} ${M_.tb[rv]}` };
    if (a >= 3 && b >= 3) { if (a === b) return { text: "DEUCE", say: "Deuce" }; const lead = a > b ? 0 : 1; return { text: `Keuntungan ${P[lead].c.name}`, say: `Keuntungan ${P[lead].c.name}` }; }
    return { text: `${PN[M_.pts[sv]]}-${PN[M_.pts[rv]]}`, say: `${PNI[M_.pts[sv]]}, ${PNI[M_.pts[rv]]}` };
  }
  function pointTo(w, why) {
    const o = 1 - w, P = S.p;
    (S.rallyLog = S.rallyLog || []).push(S.rally || 0);
    P[w].stats.pts++;
    let gameWon = false;
    if (M_.tb) {
      M_.tb[w]++;
      if (M_.tb[w] >= 7 && M_.tb[w] - M_.tb[o] >= 2) gameWon = true;
    } else {
      M_.pts[w]++;
      if (M_.pts[w] >= 4 && M_.pts[w] - M_.pts[o] >= 2) gameWon = true;
    }
    M_.pointNo++;
    K.sfx.applause(0.04, 1.2);
    if (gameWon) {
      M_.games[w]++; M_.pts = [0, 0];
      const G = G_TARGET();
      const setWon = (M_.tb && true) || (M_.games[w] >= G && M_.games[w] - M_.games[o] >= 2);
      M_.tb = null;
      if (setWon) {
        M_.sets.push(M_.games.slice()); M_.setsWon[w]++; M_.games = [0, 0];
        if (M_.setsWon[w] >= SETS_NEED()) { call(`GAME, SET & MATCH ${P[w].c.name}!`, `Game, set dan match, ${P[w].c.name}`); hud(); return endMatch(w); }
        call(`SET ${P[w].c.name}!`, `Set, ${P[w].c.name}`); K.announce(`<small>${why}</small>SET ${P[w].c.name.toUpperCase()}!`, 1.6);
      } else {
        call(`GAME ${P[w].c.name}`, `Game, ${P[w].c.name}`);
        if (M_.games[0] === G && M_.games[1] === G) { M_.tb = [0, 0]; M_.tbStart = 1 - M_.server; later(1.2, () => K.announce("TIEBREAK!", 1.2)); }
      }
      M_.server = 1 - M_.server; M_.pointNo = 0;
    } else {
      const c = callScore(); call(c.text, c.say);
    }
    if (M_.tb) { const n = M_.tb[0] + M_.tb[1]; M_.server = (M_.tbStart + Math.floor((n + 1) / 2)) % 2; }
    hud();
    S.phase = "between"; later(1.6, startPoint);
  }
  function call(text, say) { $("sb-call").textContent = text; K.speak(say || text); }

  // ---------- bola & poin ----------
  const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BR * 1.4, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8ff3a, emissive: 0x334400 }));
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.18, 10), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }));
  ballShadow.rotation.x = -Math.PI / 2;
  const later = (sec, fn) => S.timers.push({ t: sec, fn, run: S.run });
  const side = (i) => (i === 0 ? -1 : 1);                 // pemain 0 di x negatif
  const inCourt = (x, z, half) => Math.abs(z) <= CW + 0.05 && (half > 0 ? x >= 0 && x <= CL + 0.05 : x <= 0 && x >= -CL - 0.05);
  const inBox = (x, z, half, zs) => (half > 0 ? x >= 0 && x <= SL + 0.05 : x <= 0 && x >= -SL - 0.05) && (zs > 0 ? z >= -0.05 && z <= CW + 0.05 : z <= 0.05 && z >= -CW - 0.05);

  function launch(from, bx, bz, speed, hitter, kind, agg) {
    S.ball.agg = agg || 0.4;
    const hy = kind === "serve" ? 2.55 : 1.0;
    const dx = bx - from.x, dz = bz - from.z, D = Math.hypot(dx, dz);
    let T = Math.max(0.35, D / speed);
    // naikkan lengkungan kalau tidak lewat net (kecuali memang sengaja nyangkut)
    for (let i = 0; i < 12; i++) {
      const vy = (0 - hy + 0.5 * GRAV * T * T) / T, tn = Math.abs(from.x / (dx / T)) || 0;
      const yN = hy + vy * tn - 0.5 * GRAV * tn * tn;
      if (kind === "net" || Math.sign(from.x) === Math.sign(bx) || yN > NH + 0.25) break;
      T *= 1.1;
    }
    const B = S.ball;
    B.x = from.x; B.z = from.z; B.y = hy; B.vx = dx / T; B.vz = dz / T; B.vy = (0 - hy + 0.5 * GRAV * T * T) / T;
    B.live = true; B.hitter = hitter; B.bounces = 0; B.kind = kind; B.crossed = false; B.target = { x: bx, z: bz };
    K.sfx.pok(kind === "serve" ? 1.15 : rand(0.9, 1.1));
    planReturn();
  }
  // perkirakan titik pukul lawan, lalu putuskan dia sempat atau tidak
  function planReturn() {
    const B = S.ball, R = S.p[1 - B.hitter];
    let x = B.x, y = B.y, z = B.z, vx = B.vx, vy = B.vy, vz = B.vz, t = 0, bounced = false, tb = 0;
    const sf = SURF[S.courtKey];
    for (let i = 0; i < 600; i++) {
      const dt = 1 / 120; t += dt; vy -= GRAV * dt; x += vx * dt; y += vy * dt; z += vz * dt;
      if (y <= BR) { if (bounced) break; bounced = true; tb = t; y = BR; vy = Math.abs(vy) * sf.b; vx *= sf.k; vz *= sf.k; }
      if (bounced && t - tb >= 0.26) break;      // pukul saat bola naik setelah memantul
    }
    const firstIn = B.kind === "serve" ? inBox(B.target.x, B.target.z, side(1 - B.hitter), B.serveZ) : inCourt(B.target.x, B.target.z, side(1 - B.hitter));
    const reach = Math.hypot(x - R.x, z - R.z), spd = 4.9 + R.st.speed * 0.4, avail = t - 0.18;
    const ratio = reach / Math.max(0.1, spd * avail);
    // makin keras & makin jauh larinya, makin kecil peluang bola bisa dikembalikan
    const pReturn = clamp(0.97 - (B.agg || 0.4) * 0.21 - Math.max(0, ratio - 0.45) * 0.6, 0.05, 0.97);
    R.plan = { t: S.gt + t, x, z, ok: firstIn && ratio <= 1.05 && Math.abs(x) < CL + 5 && Math.random() < pReturn, stretch: ratio, spd, goingOut: !firstIn };
  }
  function startPoint() {
    if (S.phase === "over" || S.phase === "done") return;
    const sv = M_.server, P = S.p, srv = P[sv], rcv = P[1 - sv];
    const n = M_.tb ? M_.tb[0] + M_.tb[1] : M_.pts[0] + M_.pts[1];
    const zs = n % 2 === 0 ? 1 : -1;                         // sisi deuce / ad
    srv.x = side(sv) * (CL + 0.3); srv.z = zs * 1.6 * -side(sv);
    rcv.x = side(1 - sv) * (CL + 0.6); rcv.z = -srv.z * 1.1;
    srv.tx = srv.x; srv.tz = srv.z; rcv.tx = rcv.x; rcv.tz = rcv.z;
    srv.a = Math.atan2(-srv.x, 0); rcv.a = Math.atan2(-rcv.x, 0);
    rcv.plan = null; srv.plan = null;
    S.serveTry = 1; S.rally = 0;
    S.phase = "serve"; S.serveT = 0; S.serveZ = -srv.z;
    const B = S.ball; B.live = false; B.x = srv.x; B.z = srv.z; B.y = 1.2; B.vx = B.vy = B.vz = 0;
    hud();
  }
  function doServe() {
    const sv = M_.server, srv = S.p[sv], opp = side(1 - sv), zs = Math.sign(S.serveZ) || 1;
    const first = S.serveTry === 1, pw = srv.st.power;
    const faultP = first ? 0.3 - pw * 0.012 : 0.07 + (6 - Math.min(6, srv.st.chin)) * 0.01;
    let bx = opp * rand(2.5, SL - 0.4), bz = zs * rand(0.4, CW - 0.4), kind = "serve";
    if (Math.random() < faultP) { const t = pick(["long", "wide", "net"]); if (t === "long") bx = opp * rand(SL + 0.4, SL + 2); else if (t === "wide") bz = zs * rand(CW + 0.3, CW + 1.2); else { bx = opp * 0.7; kind = "net"; } }
    const speed = first ? 17 + pw * 0.8 : 12 + pw * 0.5;
    srv.swing = 0.4; srv.swingKind = "serve";
    S.ball.serveZ = zs;
    launch({ x: srv.x, z: srv.z }, bx, bz, speed, sv, kind === "net" ? "net" : "serve", first ? 0.1 + pw * 0.035 : 0.05);
    S.ball.kind = kind === "net" ? "serveNet" : "serve"; S.ball.serveZ = zs;
    planReturn();
    S.phase = "rally";
  }
  function fault(why) {
    const sv = M_.server, P = S.p;
    if (S.serveTry === 1) { S.serveTry = 2; call(`FAULT${why ? " · " + why : ""}`, "Fault"); S.phase = "between"; later(1.0, () => { S.phase = "serve"; S.serveT = 0; const B = S.ball; B.live = false; }); return; }
    P[sv].stats.df++; call("DOUBLE FAULT", "Double fault"); K.feed(`Double fault ${P[sv].c.name}! 🤦`, true); K.sfx.ooh();
    S.phase = "between"; later(0.6, () => pointTo(1 - sv, "Double fault"));
  }
  function returnShot(R) {
    const B = S.ball, h = R.i, opp = side(1 - h), O = S.p[1 - h];
    S.rally++;
    const a = clamp(rand(0.2, 0.85) + (R.st.power - 6) * 0.04, 0.1, 1);
    let e = 0.05 + a * 0.12 - (R.st.chin - 6) * 0.01 + Math.max(0, R.plan.stretch - 0.75) * 0.25 + S.rally * 0.003;
    let bx = opp * rand(Math.min(CL - 1, 5.5 + a * 3), CL - 0.6);
    let bz = O.z > 0 ? rand(-CW + 0.4, 0.8 - a) : rand(-0.8 + a, CW - 0.4);
    let kind = "shot";
    if (Math.random() < e) {
      const t = pick(["long", "wide", "net"]);
      if (t === "long") bx = opp * rand(CL + 0.3, CL + 1.6); else if (t === "wide") bz = Math.sign(bz || 1) * rand(CW + 0.2, CW + 1.2); else { bx = opp * 0.9; kind = "net"; }
    }
    const speed = 10 + R.st.power * 0.45 + a * 3.5;
    R.swing = 0.35; R.swingKind = Math.sign(B.z - R.z) * side(h) > 0 ? "fh" : "bh";
    launch({ x: R.x, z: R.z }, bx, bz, speed, h, kind, a);
    if (kind === "net") B.kind = "net";
    R.plan = null;
    // pemukul kembali ke tengah garis belakang
    R.tx = side(h) * rand(CL - 0.8, CL + 0.8); R.tz = rand(-1, 1);
  }
  function stepBall(dt) {
    const B = S.ball, sf = SURF[S.courtKey];
    if (S.phase === "serve") {
      const srv = S.p[M_.server]; S.serveT += dt;
      B.x = srv.x + Math.sin(srv.a) * 0.15; B.z = srv.z; B.y = 1.2 + Math.sin(clamp(S.serveT / 0.7, 0, 1) * Math.PI) * 1.6 + clamp(S.serveT / 0.7, 0, 1) * 0.3;
      if (S.serveT >= 0.7) doServe();
    } else if (B.live || S.phase === "dead") {
      const px = B.x;
      B.vy -= GRAV * dt; B.x += B.vx * dt; B.y += B.vy * dt; B.z += B.vz * dt;
      // menyentuh net
      if (B.live && Math.sign(px) !== Math.sign(B.x) && px !== 0) {
        if (B.y < NH + BR && Math.abs(B.z) < OW + 0.4) {
          B.live = false; B.vx *= -0.15; B.vz *= 0.2; B.vy = 0; K.sfx.bounce(0.5);
          const hit = B.hitter;
          if (B.kind === "serve" || B.kind === "serveNet") fault("net");
          else { S.p[hit].stats.err++; call("NET", "Net"); K.feed(`${S.p[hit].c.name} nyangkut di net.`); S.phase = "between"; later(0.8, () => pointTo(1 - hit, "Net")); }
          return;
        }
        B.crossed = true;
      }
      if (B.y <= BR) {
        B.y = BR;
        if (Math.abs(B.vy) > 1) K.sfx.bounce(0.6);
        B.vy = Math.abs(B.vy) * sf.b; B.vx *= sf.k; B.vz *= sf.k;
        if (B.live) {
          B.bounces++;
          const hit = B.hitter, half = side(1 - hit);
          if (B.bounces === 1) {
            const isServe = B.kind === "serve";
            const ok = isServe ? inBox(B.x, B.z, half, B.serveZ) : inCourt(B.x, B.z, half);
            if (!ok) {
              B.live = false; S.phase = "dead";
              if (isServe) { call("OUT", "Out"); fault("out"); }
              else { S.p[hit].stats.err++; call("OUT!", "Out"); K.feed(pick([`OUT! Pukulan ${S.p[hit].c.name} kepanjangan.`, `Keluar! ${S.p[hit].c.name} kurang tepat.`])); later(0.9, () => pointTo(1 - hit, "Out")); }
              return;
            }
          } else if (B.bounces >= 2) {
            B.live = false; S.phase = "dead";
            const winner = S.p[hit];
            if (B.kind === "serve" && S.rally === 0) { winner.stats.ace++; call("ACE!", "Ace"); K.announce(`<small>${winner.c.name}</small>ACE!`, 1.1); K.feed(`ACE! Servis ${winner.c.name} tidak tersentuh! 🎾`, true); K.sfx.crowd(0.08, 1.4); S.hype = 1; }
            else { winner.stats.win++; K.feed(pick([`Winner dari ${winner.c.name}! Bola tidak terkejar.`, `${winner.c.name} pukul tajam, lawan tidak sampai!`]), true); K.sfx.crowd(0.07, 1.2); S.hype = 0.8; }
            later(0.9, () => pointTo(hit, "Winner"));
            return;
          }
        }
      }
      if (S.phase === "dead" && Math.abs(B.x) > CL + 5) { B.vx = 0; B.vz = 0; }
    }
    // pemain lawan memukul balik kalau sudah sampai
    if (B.live && S.phase === "rally") {
      const R = S.p[1 - B.hitter];
      if (R.plan && R.plan.ok && S.gt >= R.plan.t && B.bounces === 1) {
        if (Math.hypot(R.x - B.x, R.z - B.z) < 1.4) returnShot(R);
        else R.plan.ok = false;
      }
    }
    ballMesh.position.set(B.x, FY + B.y, B.z);
    ballShadow.position.set(B.x, FY + 0.01, B.z); ballShadow.scale.setScalar(clamp(1 - B.y / 6, 0.3, 1));
  }
  function stepPlayers(dt) {
    S.p.forEach((p) => {
      let tx = p.tx, tz = p.tz, spd = 6.2 + p.st.speed * 0.45;
      if (p.plan && S.ball.live && S.ball.hitter !== p.i && !p.plan.goingOut) { tx = p.plan.x - Math.sign(p.plan.x) * 0.3; tz = p.plan.z + (p.i ? -0.35 : 0.35); }
      if (S.phase === "serve") { tx = p.x; tz = p.z; }
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      if (d > 0.05) { const s = Math.min(d, spd * dt); p.x += (dx / d) * s; p.z += (dz / d) * s; p.moving = true; } else p.moving = false;
      p.x = clamp(p.x, -CL - 3.5, CL + 3.5); p.z = clamp(p.z, -OW - 1, OW + 1);
      if (Math.sign(p.x) !== side(p.i)) p.x = side(p.i) * 0.6;
      const B = S.ball; p.a = Math.atan2(B.x - p.x, B.z - p.z) * 0.5 + Math.atan2(-side(p.i) * -1, 0) * 0.5 * 0 + (p.i ? -Math.PI / 2 : Math.PI / 2) * 0.5;
      if (p.swing > 0) p.swing -= dt;
    });
  }

  // ---------- animasi ----------
  function animate(p, t) {
    const m = p.m;
    m.g.position.set(p.x, FY, p.z); m.g.rotation.y = p.a;
    m.head.rotation.y = clamp(K.wrapA(S.yaw - p.a) * 0.55, -1.1, 1.1);
    const run = p.moving ? Math.sin(t * 14 + p.i) * 0.6 : 0;
    m.legs[0].rotation.x = run; m.legs[1].rotation.x = -run;
    m.body.position.y = p.moving ? Math.abs(Math.sin(t * 14)) * 0.12 : 0;
    if (S.phase === "serve" && S.p[M_.server] === p) { m.aim(0, -0.2, 3.6, 0.4); m.aim(1, 0.6, 3.2, -0.6, 1); }
    else if (p.swing > 0) {
      const k = 1 - p.swing / (p.swingKind === "serve" ? 0.4 : 0.35);
      if (p.swingKind === "serve") m.aim(1, 0.4, lerp(4.2, 1.4, k), lerp(-0.2, 1.4, k), 1);
      else { const s = p.swingKind === "fh" ? 1 : -1; m.aim(1, s * lerp(1.4, -0.6, k), 2.0, lerp(-0.8, 1.2, Math.sin(k * Math.PI / 2 + 0.2)), 1); }
      m.aim(0, -0.6, 1.8, 0.6);
    } else { m.aim(1, 0.7, 1.9, 0.5, 1); m.aim(0, -0.5, 1.6, 0.6); }
  }

  // ---------- HUD ----------
  function hud() {
    const P = S.p; if (P.length < 2) return;
    P.forEach((p, i) => {
      $("sb-f" + i).src = "faces/" + p.c.id + ".png"; $("sb-n" + i).textContent = p.c.name;
      $("sb-s" + i).textContent = M_.server === i ? "🎾" : "";
      $("sb-g" + i).innerHTML = M_.sets.map((s) => `<span>${s[i]}</span>`).join("") + `<span class="cur">${M_.games[i]}</span>`;
      $("sb-p" + i).textContent = M_.tb ? M_.tb[i] : (M_.pts[0] >= 3 && M_.pts[1] >= 3 ? (M_.pts[i] > M_.pts[1 - i] ? "AD" : "40") : PN[Math.min(3, M_.pts[i])]);
    });
  }
  function setHud(on) { ["sb", "feed", "ctrl"].forEach((k) => ($(k).hidden = !on)); $("back").hidden = on; }

  // ---------- alur ----------
  function clearMatch() {
    S.run++; S.timers = [];
    S.p.forEach((p) => world.remove(p.m.g)); S.p = [];
    ambient.forEach((a) => { a.ps.forEach((m) => world.remove(m.g)); world.remove(a.ball); }); ambient.length = 0;
    fans.forEach((f) => world.remove(f.g)); fans.length = 0;
    if (umpire) world.remove(umpire.g); umpire = null;
    world.remove(ballMesh); world.remove(ballShadow);
    document.querySelectorAll(".announce").forEach((e) => e.remove());
  }
  function populate(exclude) {
    const pool = shuffle(CREW.filter((c) => !exclude.includes(c)));
    let k = 0; const next = () => pool[k++ % Math.max(1, pool.length)] || CREW[0];
    const uc = next(); S.umpC = uc;
    umpire = K.makePerson(uc, { shirt: 0x2e7d4f, pants: 0x1d1d24 }); umpire.g.scale.setScalar(PS); umpire.g.position.set(0, 2.2 - 0.55, -(OW + 1.0)); world.add(umpire.g);
    for (let i = 1; i < 4; i++) ambient.push(makeAmbient(next(), next(), SLOTS[i][0], SLOTS[i][1]));
    for (let r = 0; r < 2; r++) for (let j = 0; j < 12; j++) {
      const f = K.makeFan(next()); f.g.scale.setScalar(PS); const y = r ? 0.8 : 0.4;
      f.g.position.set(-CL + 1 + j * 1.9, y, -(OW + 3.0 + r * 1.2)); f.g.rotation.y = 0; f.baseY = y; f.face = 0; world.add(f.g); fans.push(f);
    }
  }
  let pickSel = [];
  function startMatch(list) {
    clearMatch();
    const key = S.surf === "acak" ? pick(SURF_KEYS) : S.surf;
    rebuildCourts(key);
    S.p = list.map((c, i) => makePlayer(c, i));
    populate(list);
    world.add(ballMesh, ballShadow);
    S.ball = { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, live: false, bounces: 0 };
    Object.assign(M_, { pts: [0, 0], games: [0, 0], sets: [], setsWon: [0, 0], tb: null, server: Math.random() < 0.5 ? 0 : 1, pointNo: 0 });
    S.gt = 0; S.phase = "intro"; S.paused = false;
    show(null); setHud(true); hud(); $("c-pause").textContent = "⏸";
    stage.snap(new THREE.Vector3(0, 1, 0));
    K.announce(`<small>${SURF[key].name}</small>${list[0].name} vs ${list[1].name}`, 1.8);
    K.feed(`Selamat datang di Klub Tenis Kantor! Lapangan ${SURF[key].name}, wasit ${S.umpC ? S.umpC.name : "kantor"}.`);
    call(`${S.p[M_.server].c.name} servis duluan`, `${S.p[M_.server].c.name}, servis`);
    later(2.0, startPoint);
  }
  function endMatch(w) {
    S.phase = "over"; S.ball.live = false;
    K.sfx.applause(0.08, 2.6); S.hype = 1;
    K.announce(`<small>Game, set & match</small>${S.p[w].c.name.toUpperCase()} MENANG!`, 2.4);
    S.winner = w;
    later(3, showResult);
  }
  function showResult() {
    const w = S.winner, P = S.p;
    K.settle(S.bets, w);
    setHud(false);
    $("r-face").src = "faces/" + P[w].c.id + ".png";
    $("r-big").textContent = `${P[w].c.name} MENANG!`;
    $("r-how").textContent = `Skor: ${M_.sets.map((s) => `${s[0]}-${s[1]}`).join(", ")} · ${SURF[S.courtKey].name}`;
    $("r-box").innerHTML = P.map((p) => `<div><img src="faces/${p.c.id}.png" alt="" style="border-color:${hex(COLORS[p.i])}">${p.c.name}<span>${p.stats.pts} poin · ${p.stats.ace} ace · ${p.stats.win} winner · ${p.stats.err} error · ${p.stats.df} DF</span></div>`).join("");
    const bets = S.bets.map((b) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${CREW.find((c) => c.id === b.who).name} → ${P[b.pick].c.name} (${fmt(b.amount)})<span class="res ${b.res > 0 ? "win" : "lose"}">${b.res > 0 ? "+" + fmt(b.res) : "kalah"}</span></div>`).join("");
    $("r-bets-wrap").hidden = !bets; $("r-bets").innerHTML = bets;
    S.phase = "done";
    show("s-result");
  }

  // ---------- menu ----------
  const screens = ["s-title", "s-pick", "s-bet", "s-result"];
  function show(id) { screens.forEach((s) => ($(s).hidden = s !== id)); }
  function renderOpts() {
    $("opt-surf").innerHTML = '<span style="font-weight:700">Lapangan:</span>' + [["acak", "🎲 Acak"]].concat(SURF_KEYS.map((k) => [k, SURF[k].name])).map(([k, n]) => `<button class="chip" data-surf="${k}" aria-pressed="${S.surf === k}">${n}</button>`).join("");
    document.querySelectorAll("[data-fmt]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.fmt === S.fmt));
    document.querySelectorAll("[data-px]").forEach((b) => b.setAttribute("aria-pressed", +b.dataset.px === S.px));
    $("opt-sound").textContent = K.sound.on ? "🔊 Suara" : "🔇 Suara"; $("opt-sound").setAttribute("aria-pressed", K.sound.on);
    $("opt-speak").textContent = K.speakOn ? "🗣️ Suara wasit: ON" : "🗣️ Suara wasit: OFF"; $("opt-speak").setAttribute("aria-pressed", K.speakOn);
  }
  $("opt-surf").onclick = (e) => { const b = e.target.closest("[data-surf]"); if (!b) return; S.surf = b.dataset.surf; K.store.set("tn_surf", S.surf); K.sfx.click(); renderOpts(); if (S.surf !== "acak") rebuildCourts(S.surf); };
  document.querySelectorAll("[data-fmt]").forEach((b) => b.onclick = () => { S.fmt = b.dataset.fmt; K.store.set("tn_fmt", S.fmt); K.sfx.click(); renderOpts(); });
  document.querySelectorAll("[data-px]").forEach((b) => b.onclick = () => { S.px = +b.dataset.px; K.store.set("tn_px", S.px); stage.resize(); renderOpts(); });
  $("opt-sound").onclick = () => { K.sound.on = !K.sound.on; K.store.set("k3_sound", K.sound.on); if (!K.sound.on) K.rainSound(false); renderOpts(); };
  $("opt-speak").onclick = () => { K.speakOn = !K.speakOn; K.store.set("k3_speak", K.speakOn); renderOpts(); if (K.speakOn) K.speak("Suara wasit aktif"); };
  $("go-pick").onclick = () => { K.sfx.click(); pickSel = []; renderPick(); show("s-pick"); };
  $("go-rand").onclick = () => { K.sfx.click(); pickSel = shuffle(CREW).slice(0, 2); openBet(); };
  function renderPick() {
    $("pick-title").textContent = pickSel.length < 2 ? `Pilih pemain ${pickSel.length + 1} dari 2` : "Siap!";
    $("pick-grid").innerHTML = CREW.map((c) => { const i = pickSel.indexOf(c); return `<button class="pf" data-id="${c.id}" ${i >= 0 ? `style="background:${hex(COLORS[i])}55"` : ""}>${i >= 0 ? `<span class="tagc" style="background:${hex(COLORS[i])}">P${i + 1}</span>` : ""}<img src="faces/${c.id}.png" alt="">${c.name}<small>⭐ ${K.statsOf(c).rating}</small></button>`; }).join("");
    $("pick-ok").disabled = pickSel.length !== 2;
  }
  $("pick-grid").onclick = (e) => { const b = e.target.closest(".pf"); if (!b) return; const c = CREW.find((x) => x.id === b.dataset.id); K.sfx.click(); const i = pickSel.indexOf(c); if (i >= 0) pickSel.splice(i, 1); else if (pickSel.length < 2) pickSel.push(c); else pickSel[1] = c; renderPick(); };
  $("pick-rand").onclick = () => { pickSel = shuffle(CREW).slice(0, 2); renderPick(); };
  $("pick-back").onclick = () => show("s-title");
  $("pick-ok").onclick = () => openBet();
  function openBet() {
    S.bets = [];
    S.odds = K.oddsFor(pickSel.map((c) => K.statsOf(c).rating));
    $("bet-teams").innerHTML = pickSel.map((c, i) => { const st = K.statsOf(c); return `<div class="team" style="border-color:${hex(COLORS[i])}"><div class="faces"><img src="faces/${c.id}.png" alt="" style="width:72px;height:88px"></div><b>${c.name}</b><small>Tenaga ${st.power} · Lari ${st.speed} · Tenang ${st.chin}</small><br><span class="odds">x${S.odds[i]}</span></div>`; }).join('<div class="vs-mid">VS</div>');
    renderBets(); show("s-bet");
  }
  function whoPick(c) { K.betModal(c, pickSel.map((p, i) => ({ label: p.name, mult: S.odds[i] })), (bet) => { S.bets.push(bet); renderBets(); }); }
  function renderBets() {
    K.renderWho($("bet-who"), CREW, whoPick);
    $("bet-list").innerHTML = S.bets.map((b, i) => `<div class="bet"><img src="faces/${b.who}.png" alt="">${CREW.find((c) => c.id === b.who).name} pasang <b>${fmt(b.amount)}</b> untuk <b>${pickSel[b.pick].name}</b> · x${b.mult}<button class="x" data-i="${i}">✕</button></div>`).join("") || "<small>Belum ada taruhan. Boleh langsung mulai juga.</small>";
    $("bet-list").querySelectorAll(".x").forEach((x) => x.onclick = () => { const b = S.bets.splice(+x.dataset.i, 1)[0]; K.setPts(b.who, K.getPts(b.who) + b.amount); renderBets(); });
  }
  $("bet-back").onclick = () => { S.bets.forEach((b) => K.setPts(b.who, K.getPts(b.who) + b.amount)); S.bets = []; show("s-title"); };
  $("bet-go").onclick = () => startMatch(pickSel);
  $("r-again").onclick = () => openBet();
  $("r-menu").onclick = () => { clearMatch(); populate([]); S.phase = "menu"; show("s-title"); };

  // ---------- kontrol ----------
  document.querySelectorAll("[data-spd]").forEach((b) => b.onclick = () => { S.speed = +b.dataset.spd; document.querySelectorAll("[data-spd]").forEach((x) => x.setAttribute("aria-pressed", x === b)); });
  $("c-pause").onclick = () => { S.paused = !S.paused; $("c-pause").textContent = S.paused ? "▶" : "⏸"; };
  $("c-time").oninput = (e) => { S.tod = +e.target.value; S.autoTime = false; $("c-auto").setAttribute("aria-pressed", false); };
  $("c-auto").onclick = () => { S.autoTime = !S.autoTime; $("c-auto").setAttribute("aria-pressed", S.autoTime); };
  $("c-rain").onclick = () => { S.rain = !S.rain; rain.set(S.rain); $("c-rain").setAttribute("aria-pressed", S.rain); if (S.rain) K.sfx.thunder(); };
  $("c-rot").onclick = () => { S.yaw -= Math.PI / 2; };
  $("c-zin").onclick = () => { S.zoom = clamp(S.zoom * 0.85, S.zoomMin, S.zoomMax); };
  $("c-zout").onclick = () => { S.zoom = clamp(S.zoom * 1.18, S.zoomMin, S.zoomMax); };
  $("c-quit").onclick = () => { if (!confirm("Hentikan pertandingan? Taruhan dikembalikan.")) return; S.bets.forEach((b) => K.setPts(b.who, K.getPts(b.who) + b.amount)); S.bets = []; clearMatch(); populate([]); setHud(false); S.phase = "menu"; show("s-title"); };
  addEventListener("keydown", (e) => { if (!S.p.length) return; if (e.code === "Space") { e.preventDefault(); $("c-pause").click(); } });

  // ---------- loop ----------
  let t0 = performance.now(), time = 0;
  const camTgt = new THREE.Vector3();
  function tick(rdt) {
    if (S.paused) return;
    time += rdt;
    const gdt = rdt * (S.p.length ? S.speed : 1);
    const steps = Math.max(1, Math.ceil(gdt / (1 / 120)));
    for (let i = 0; i < steps; i++) {
      const dt = gdt / steps;
      S.gt += dt;
      const due = [];
      S.timers = S.timers.filter((tm) => { if (tm.run !== S.run) return false; tm.t -= dt; if (tm.t <= 0) { due.push(tm); return false; } return true; });
      due.forEach((tm) => { if (tm.run === S.run) tm.fn(); });
      if (S.p.length && S.ball && S.phase !== "done") { stepBall(dt); stepPlayers(dt); }
      ambient.forEach((a) => stepAmbient(a, dt));
    }
    if (S.autoTime) { S.tod = (S.tod + rdt * 0.006) % 1; $("c-time").value = S.tod; }
    K.daylight(stage, S.tod, lamps, S.rain);
    rain.update(rdt, FY);
    Object.values(courtGroups).forEach((g) => { const top = g.children[0].material[2]; top.color.setHex(S.rain ? 0x9aa3b8 : 0xffffff); top.shininess = S.rain ? 80 : 4; top.specular.setHex(S.rain ? 0x8899aa : 0x111111); });
    S.hype = Math.max(0, S.hype - rdt * 0.4);
    S.p.forEach((p) => animate(p, time));
    if (umpire) { umpire.head.rotation.y = clamp(K.wrapA(Math.atan2(S.ball ? S.ball.x : 0, 3)) * 0.6, -0.9, 0.9); umpire.aim(0, -0.5, 1.4, 0.5); umpire.aim(1, 0.5, 1.4, 0.5); umpire.legs.forEach((l) => (l.rotation.x = -1.4)); }
    K.animFans(fans, time, S.hype, S.yaw);
    if (!S.p.length) S.yaw += rdt * 0.05;
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const rdt = Math.min((now - t0) / 1000, 0.05); t0 = now;
    tick(rdt);
    if (S.p.length && S.ball) camTgt.set(clamp(S.ball.x * 0.35, -6, 6), 0.8, 0); else camTgt.set(-8, 1, -6);
    stage.render(rdt, camTgt);
  }

  // ---------- mulai ----------
  K.loadCrew().then((crew) => {
    CREW = crew;
    if (CREW.length < 4) { err("Butuh minimal 4 wajah. Jalankan lewat server lokal (lihat README)."); return; }
    buildWorld(); populate([]);
    renderOpts(); show("s-title");
    window.__tn = { S, M: M_, rallies: () => S.rallyLog, start: startMatch, CREW: () => CREW, draw: () => stage.render(0.016, camTgt), sim(sec) { for (let t = 0; t < sec; t += 0.05) tick(0.05); return { phase: S.phase, pts: M_.pts.slice(), games: M_.games.slice(), sets: M_.sets.slice(), tb: M_.tb }; } };
    requestAnimationFrame(frame);
  });
})();
