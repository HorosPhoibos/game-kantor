/* HOKI KANTOR — tampilan mesin hoki. Logika hitung ada di hoki-engine.js. */
"use strict";
(function () {
  const $ = (id) => document.getElementById(id);
  const E = window.HokiEngine;
  let CREW = window.CREW || [];
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* abaikan */ } },
  };
  const fmt = (n) => Math.round(n).toLocaleString("id-ID");
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const wallet = () => store.get("rk_wallet", {});
  const getPts = (id) => { const w = wallet(); return w[id] == null ? 1000 : w[id]; };
  const setPts = (id, v) => { const w = wallet(); w[id] = Math.max(0, Math.round(v)); store.set("rk_wallet", w); };

  // ---------- suara ----------
  let actx = null, soundOn = true;
  // browser (terutama HP) baru mengizinkan suara setelah layar disentuh: buka suara di sentuhan pertama
  const unlockAudio = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) { /* abaikan */ } };
  addEventListener("pointerdown", unlockAudio, { passive: true }); addEventListener("keydown", unlockAudio); addEventListener("touchend", unlockAudio, { passive: true });
  function beep(f, d = 0.1, type = "triangle", v = 0.05, delay = 0, slide = 0) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + delay;
      o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f + slide, t + d);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
    } catch (e) { /* abaikan */ }
  }
  const sfx = {
    spin: () => { for (let i = 0; i < 6; i++) beep(300 + i * 60, 0.05, "square", 0.025, i * 0.04); },
    drop: () => beep(220, 0.06, "triangle", 0.03, 0, -80),
    win: () => { [660, 880, 1100].forEach((f, i) => beep(f, 0.12, "triangle", 0.05, i * 0.07)); },
    mult: () => { [520, 780, 1040, 1560].forEach((f, i) => beep(f, 0.1, "square", 0.04, i * 0.05)); },
    scatter: () => { [400, 600, 800, 1000, 1200, 1600].forEach((f, i) => beep(f, 0.18, "triangle", 0.06, i * 0.09)); },
    big: () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, 0.22, "triangle", 0.07, i * 0.12)); },
    click: () => beep(660, 0.05, "triangle", 0.04),
    lose: () => beep(200, 0.15, "triangle", 0.03, 0, -60),
  };

  // ---------- simbol ----------
  const LOW = { kopi: ["☕", "#7a4a2a"], klip: ["📎", "#3a6ad0"], mouse: ["🖱️", "#5a5a6a"], disket: ["💾", "#2a8a7a"], printer: ["🖨️", "#8a6ad0"] };
  const FACE_PREF = ["monang", "pakrt", "josh", "paktas"];
  const FACE_COL = ["#22c27a", "#3a7bff", "#ff9f1c", "#ff4f8b"];
  let faces = {};
  function symHTML(cell) {
    if (cell.id === "sk") return { cls: "sk", html: "📜" };
    if (cell.id === "thr") return { cls: "thr", html: `🧧<b>x${cell.mult}</b>` };
    if (LOW[cell.id]) return { cls: "low", html: LOW[cell.id][0], style: `--bg:${LOW[cell.id][1]}` };
    const f = faces[cell.id];
    return { cls: "face", html: f ? `<img src="faces/${f.c.id}.png" alt="${f.c.name}">` : "⭐", style: `--c:${f ? f.col : "#fff"}` };
  }

  // ---------- grid ----------
  const gridEl = $("grid");
  const cells = [];
  for (let r = 0; r < E.ROWS; r++) for (let c = 0; c < E.COLS; c++) { const d = document.createElement("div"); d.className = "cell"; gridEl.appendChild(d); cells.push(d); }
  const cellAt = (c, r) => cells[r * E.COLS + c];
  function draw(grid, newMask) {
    for (let c = 0; c < E.COLS; c++) for (let r = 0; r < E.ROWS; r++) {
      const el = cellAt(c, r), s = symHTML(grid[c][r]);
      el.className = "cell " + s.cls; el.innerHTML = s.html; el.setAttribute("style", s.style || "");
      if (!newMask || newMask[c][r]) { el.classList.add("drop"); el.style.animationDelay = (newMask ? (E.ROWS - r) * 0.03 : c * 0.05 + (E.ROWS - r) * 0.03) + "s"; }
    }
  }

  // ---------- pemain ----------
  let player = null, bet = store.get("hk_bet", 20), turbo = store.get("hk_turbo", false), busy = false, autoLeft = 0;
  const BETS = [10, 20, 50, 100, 200];
  function renderPlayer() {
    $("p-face").src = "faces/" + player.id + ".png";
    $("p-name").textContent = player.name;
    $("p-pts").textContent = "💰 " + fmt(getPts(player.id));
    $("bet").textContent = bet;
    $("turbo").setAttribute("aria-pressed", turbo);
  }
  function pickPlayer() {
    const ov = $("ov");
    ov.innerHTML = `<div class="card"><h3>Siapa yang main?</h3><div class="who">${CREW.map((c) => `<button data-id="${c.id}" aria-pressed="${player && player.id === c.id}"><img src="faces/${c.id}.png" alt="">${c.name}<small>💰${fmt(getPts(c.id))}</small></button>`).join("")}</div><div style="text-align:right;margin-top:10px"><button class="btn" id="ov-close">Tutup</button></div></div>`;
    ov.hidden = false;
    ov.querySelector(".who").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; player = CREW.find((c) => c.id === b.dataset.id); store.set("hk_player", player.id); sfx.click(); ov.hidden = true; renderPlayer(); };
    $("ov-close").onclick = () => { if (player) ov.hidden = true; };
  }
  $("player").onclick = () => { if (!busy) pickPlayer(); };
  $("bet-dn").onclick = () => { if (busy) return; bet = BETS[Math.max(0, BETS.indexOf(bet) - 1)] || 10; store.set("hk_bet", bet); sfx.click(); renderPlayer(); };
  $("bet-up").onclick = () => { if (busy) return; bet = BETS[Math.min(BETS.length - 1, BETS.indexOf(bet) + 1)] || 20; store.set("hk_bet", bet); sfx.click(); renderPlayer(); };
  $("turbo").onclick = () => { turbo = !turbo; store.set("hk_turbo", turbo); renderPlayer(); };
  $("auto").onclick = () => {
    if (autoLeft > 0) { autoLeft = 0; $("auto").setAttribute("aria-pressed", false); $("auto").textContent = "Auto 10×"; return; }
    autoLeft = 10; $("auto").setAttribute("aria-pressed", true); runAuto();
  };
  async function runAuto() {
    while (autoLeft > 0) {
      $("auto").textContent = `Stop (${autoLeft})`;
      if (!busy) { const ok = await spinOnce(); if (!ok) break; autoLeft--; }
      await wait(turbo ? 150 : 400);
    }
    autoLeft = 0; $("auto").setAttribute("aria-pressed", false); $("auto").textContent = "Auto 10×";
  }

  // ---------- bos ----------
  function bossSay(t, zap) { $("boss-say").textContent = t; if (zap) { const b = $("boss"); b.classList.remove("zap"); void b.offsetWidth; b.classList.add("zap"); } }

  // ---------- satu putaran ----------
  let freeLeft = 0, freeMult = 0, freeTotal = 0;
  const T = (ms) => wait(turbo ? ms * 0.4 : ms);
  async function playSpin(free) {
    const res = E.spin(Math.random, bet, free);
    sfx.spin();
    let prev = null, prevWins = null;
    for (let i = 0; i < res.steps.length; i++) {
      const st = res.steps[i];
      let mask = null;
      if (prev) {
        const ids = new Set(prevWins.map((w) => w.id));
        mask = prev.map((col) => { const removed = col.filter((x) => ids.has(x.id)).length; return col.map((_, r) => r < removed); });
      }
      draw(st.grid, mask); sfx.drop();
      await T(i ? 380 : 520);
      if (!st.wins.length) break;
      const ids = new Set(st.wins.map((w) => w.id));
      for (let c = 0; c < E.COLS; c++) for (let r = 0; r < E.ROWS; r++) if (ids.has(st.grid[c][r].id)) cellAt(c, r).classList.add("win");
      sfx.win();
      const sum = st.wins.reduce((a, w) => a + w.pay, 0);
      $("status").innerHTML = `+${fmt(sum)}<small>${st.wins.map((w) => `${w.n}× ${faces[w.id] ? faces[w.id].c.name : LOW[w.id][0]}`).join(" · ")}</small>`;
      await T(700);
      for (let c = 0; c < E.COLS; c++) for (let r = 0; r < E.ROWS; r++) if (ids.has(st.grid[c][r].id)) { const el = cellAt(c, r); el.classList.remove("win"); el.classList.add("pop"); }
      await T(260);
      prev = st.grid; prevWins = st.wins;
    }
    // pengali & scatter di grid terakhir
    const last = res.steps[res.steps.length - 1].grid;
    let pay = 0;
    if (res.multSum > 0) {
      for (let c = 0; c < E.COLS; c++) for (let r = 0; r < E.ROWS; r++) if (last[c][r].id === "thr") cellAt(c, r).classList.add("glow");
      sfx.mult(); bossSay(`Bos ACC! x${res.multSum}`, true);
      await T(800);
    }
    if (free) {
      if (res.multSum > 0) freeMult += res.multSum;
      pay = res.baseWin * (res.baseWin > 0 && freeMult > 0 ? freeMult : 1) + res.scatterPay;
    } else pay = res.baseWin * (res.multSum || 1) + res.scatterPay;
    if (res.scatter >= 3) {
      for (let c = 0; c < E.COLS; c++) for (let r = 0; r < E.ROWS; r++) if (last[c][r].id === "sk") cellAt(c, r).classList.add("glow");
    }
    return { res, pay };
  }
  async function spinOnce() {
    if (busy || !player) return false;
    if (freeLeft <= 0) {
      let pts = getPts(player.id);
      if (pts < bet) {
        if (pts <= 0) { setPts(player.id, 500); bossSay("Nih modal 500 dari Bos 😄", true); renderPlayer(); return false; }
        $("status").innerHTML = "Poin kurang<small>Turunkan taruhan dulu ya</small>"; return false;
      }
      setPts(player.id, pts - bet); renderPlayer();
    }
    busy = true; $("spin").disabled = true;
    const free = freeLeft > 0;
    if (free) { freeLeft--; updateFree(); }
    const { res, pay } = await playSpin(free);
    if (pay > 0) {
      setPts(player.id, getPts(player.id) + pay);
      if (free) freeTotal += pay;
      $("status").innerHTML = `MENANG ${fmt(pay)}!<small>${res.multSum ? `pengali x${free ? freeMult : res.multSum}` : ""}${res.scatterPay ? ` · bonus SK +${fmt(res.scatterPay)}` : ""}</small>`;
      coins();
      if (!free) await bigWin(pay);
      bossSay(pay >= bet * 10 ? "Mantap, bonus cair!" : pick(["Lumayan!", "Asik!", "Hoki nih!"]));
    } else {
      $("status").innerHTML = free ? "Belum dapat…<small>putaran gratis lanjut</small>" : "Belum hoki…<small>coba lagi</small>";
      if (!free) { sfx.lose(); bossSay(pick(["Sabar, belum rezeki", "Kerja dulu, baru hoki", "Ayo lagi!"])); }
    }
    log(free ? "G" : "", pay);
    renderPlayer();
    if (res.freeSpins > 0) {
      sfx.scatter();
      const first = !free;
      freeLeft += res.freeSpins;
      if (first) { freeMult = 0; freeTotal = 0; }
      await banner(first ? "📜 SK NAIK GAJI!" : "📜 TAMBAH PUTARAN!", `${res.freeSpins} putaran gratis${first ? "" : " lagi"}`);
      updateFree();
      if (first) { busy = false; await runFree(); }
    }
    busy = false; $("spin").disabled = false;
    return true;
  }
  async function runFree() {
    bossSay("Putaran gratis! Pengali numpuk!", true);
    while (freeLeft > 0) { busy = false; await spinOnce(); await T(350); }
    busy = true;
    await banner("🎉 PUTARAN GRATIS SELESAI", `Total: ${fmt(freeTotal)} poin${freeMult ? ` (pengali x${freeMult})` : ""}`);
    if (freeTotal >= bet * 20) await bigWin(freeTotal);
    freeMult = 0; freeLeft = 0; updateFree();
  }
  function updateFree() {
    const el = $("free");
    el.hidden = freeLeft <= 0 && freeMult <= 0;
    el.textContent = `🎁 Putaran gratis: ${freeLeft}${freeMult ? ` · pengali x${freeMult}` : ""}`;
  }
  async function banner(title, sub) {
    const ov = $("ov");
    ov.innerHTML = `<div class="bigwin"><h2>${title}</h2><p>${sub}</p><button class="btn" id="ov-ok">Lanjut</button></div>`;
    ov.hidden = false;
    await new Promise((res) => { const done = () => { ov.hidden = true; res(); }; $("ov-ok").onclick = done; setTimeout(() => { if (!ov.hidden) done(); }, turbo ? 1800 : 3200); });
  }
  async function bigWin(pay) {
    const x = pay / bet;
    if (x < 20) return;
    sfx.big();
    const title = x >= 100 ? "👑 SULTAN KANTOR!" : x >= 50 ? "🤯 GILA!" : "🔥 MANTAP!";
    await banner(title, `+${fmt(pay)} poin (${Math.round(x)}× taruhan)`);
  }
  function coins() {
    const r = $("p-pts").getBoundingClientRect(), b = gridEl.getBoundingClientRect();
    for (let i = 0; i < 10; i++) {
      const el = document.createElement("div"); el.className = "coin"; el.textContent = "🪙";
      const x = b.left + Math.random() * b.width, y = b.top + Math.random() * b.height;
      el.style.left = x + "px"; el.style.top = y + "px";
      el.style.setProperty("--dx", r.left - x + "px"); el.style.setProperty("--dy", r.top - y + "px");
      el.style.animationDelay = i * 0.05 + "s";
      document.body.appendChild(el); setTimeout(() => el.remove(), 1500);
    }
  }
  const hist = [];
  function log(tag, pay) {
    hist.unshift({ tag, pay }); hist.length = Math.min(hist.length, 12);
    $("log").innerHTML = hist.map((h) => `<span class="${h.pay > 0 ? "w" : ""}">${h.tag ? "🎁 " : ""}${h.pay > 0 ? "+" + fmt(h.pay) : "0"}</span>`).join("");
  }
  $("spin").onclick = () => { if (!busy) spinOnce(); };
  addEventListener("keydown", (e) => { if (e.code === "Space") { e.preventDefault(); if (!busy && $("ov").hidden) spinOnce(); } });

  // ---------- mulai ----------
  Promise.all(CREW.map((c) => new Promise((res) => { const i = new Image(); i.onload = () => res(c); i.onerror = () => res(null); i.src = "faces/" + c.id + ".png"; }))).then((ok) => {
    CREW = ok.filter(Boolean);
    const chosen = FACE_PREF.map((id) => CREW.find((c) => c.id === id)).filter(Boolean);
    CREW.forEach((c) => { if (chosen.length < 4 && !chosen.includes(c)) chosen.push(c); });
    ["f1", "f2", "f3", "f4"].forEach((k, i) => { if (chosen[i]) faces[k] = { c: chosen[i], col: FACE_COL[i] }; });
    const boss = faces.f4 ? faces.f4.c : CREW[0];
    $("boss-face").src = "faces/" + boss.id + ".png";
    // tabel hadiah
    const rows = E.SYMBOLS.slice().reverse().map((s) => {
      const ic = LOW[s.id] ? `<div class="ic" style="background:${LOW[s.id][1]}">${LOW[s.id][0]}</div>` : `<div class="ic"><img src="faces/${faces[s.id].c.id}.png" alt=""></div>`;
      return `<div>${ic}<span>8+: x${s.pays[0]}<br>10+: x${s.pays[1]}<br>12+: x${s.pays[2]}</span></div>`;
    });
    rows.push(`<div><div class="ic" style="background:#ffb300">📜</div><span>SK Naik Gaji<br>4+ = 10 gratis</span></div>`);
    rows.push(`<div><div class="ic" style="background:#c4124f">🧧</div><span>Amplop THR<br>x2 sampai x100</span></div>`);
    $("pt").innerHTML = rows.join("");
    player = CREW.find((c) => c.id === store.get("hk_player", "")) || null;
    const start = E.spin(Math.random, 1, false).steps[0].grid;
    draw(start, null);
    if (player) renderPlayer(); else { $("p-name").textContent = "Pilih pemain"; pickPlayer(); }
    window.__hk = { spinOnce, get state() { return { freeLeft, freeMult, busy, player: player && player.id, pts: player && getPts(player.id) }; } };
  });
})();
