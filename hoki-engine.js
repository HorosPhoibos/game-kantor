/* HOKI KANTOR — mesin hitung (tanpa tampilan). Dipakai halaman hoki.html dan skrip uji.
   Grid 6 kolom x 5 baris. Menang kalau ada 8+ simbol sama di mana saja.
   Simbol yang menang hilang, sisanya jatuh, simbol baru turun (tumble).
   SK Naik Gaji (scatter) 4+ = 10 putaran gratis. Amplop THR = pengali yang dijumlah di akhir tumble.
   Poin di sini poin bohongan, bukan uang. */
(function (root) {
  "use strict";
  const COLS = 6, ROWS = 5;
  // pays: [8-9, 10-11, 12+] dikali taruhan
  const SYMBOLS = [
    { id: "kopi",    w: 20, pays: [0.25, 0.75, 2] },
    { id: "klip",    w: 19, pays: [0.4, 0.9, 4] },
    { id: "mouse",   w: 18, pays: [0.5, 1, 5] },
    { id: "disket",  w: 16, pays: [0.8, 1.2, 8] },
    { id: "printer", w: 14, pays: [1, 1.5, 10] },
    { id: "f1",      w: 11, pays: [1.5, 2, 12] },
    { id: "f2",      w: 9,  pays: [2, 5, 15] },
    { id: "f3",      w: 7,  pays: [2.5, 10, 25] },
    { id: "f4",      w: 5,  pays: [10, 25, 50] },
  ];
  const SCATTER = { id: "sk", w: 2.3, wFree: 1.8 };
  const MULT = { id: "thr", w: 1.45, wFree: 3.0 };
  const MULT_VALUES = [[2, 30], [3, 22], [4, 16], [5, 12], [8, 8], [10, 6], [15, 3], [20, 2], [25, 1.2], [50, 0.5], [100, 0.15]];
  const SCATTER_PAY = { 4: 3, 5: 5, 6: 100 };

  function weighted(rng, list, key) {
    let tot = 0; for (const s of list) tot += s[key];
    let r = rng() * tot;
    for (const s of list) { r -= s[key]; if (r <= 0) return s; }
    return list[list.length - 1];
  }
  function newCell(rng, free) {
    const pool = SYMBOLS.map((s) => ({ s, w: s.w })).concat([{ s: SCATTER, w: free ? SCATTER.wFree : SCATTER.w }, { s: MULT, w: free ? MULT.wFree : MULT.w }]);
    const pickd = weighted(rng, pool, "w").s;
    if (pickd === MULT) {
      const v = weighted(rng, MULT_VALUES.map(([v, w]) => ({ v, w })), "w").v;
      return { id: "thr", mult: v };
    }
    return { id: pickd.id };
  }
  function payOf(id, n) {
    const s = SYMBOLS.find((x) => x.id === id); if (!s || n < 8) return 0;
    return n >= 12 ? s.pays[2] : n >= 10 ? s.pays[1] : s.pays[0];
  }
  // grid[col][row], row 0 = atas
  function fill(rng, free) { const g = []; for (let c = 0; c < COLS; c++) { g.push([]); for (let r = 0; r < ROWS; r++) g[c].push(newCell(rng, free)); } return g; }
  const clone = (g) => g.map((col) => col.map((x) => Object.assign({}, x)));

  /* Satu putaran penuh. Hasil berisi langkah-langkah tumble untuk dianimasikan.
     freeMode: true kalau sedang putaran gratis (pengali disimpan ke totalMult). */
  function spin(rng, bet, freeMode) {
    const steps = [];
    let grid = fill(rng, freeMode);
    let win = 0;
    for (let guard = 0; guard < 40; guard++) {
      const counts = {};
      grid.forEach((col) => col.forEach((x) => { if (x.id !== "sk" && x.id !== "thr") counts[x.id] = (counts[x.id] || 0) + 1; }));
      const wins = Object.keys(counts).filter((id) => counts[id] >= 8).map((id) => ({ id, n: counts[id], pay: payOf(id, counts[id]) * bet }));
      steps.push({ grid: clone(grid), wins });
      if (!wins.length) break;
      wins.forEach((w) => (win += w.pay));
      const ids = new Set(wins.map((w) => w.id));
      grid = grid.map((col) => {
        const keep = col.filter((x) => !ids.has(x.id));
        const add = []; for (let i = keep.length; i < ROWS; i++) add.push(newCell(rng, freeMode));
        return add.concat(keep);
      });
    }
    const last = steps[steps.length - 1].grid;
    let scat = 0, multSum = 0;
    last.forEach((col) => col.forEach((x) => { if (x.id === "sk") scat++; if (x.id === "thr") multSum += x.mult; }));
    // pengali hanya berlaku kalau ada kemenangan di putaran ini
    const multApplied = win > 0 && multSum > 0 ? multSum : 0;
    const scatterPay = (SCATTER_PAY[Math.min(6, scat)] || 0) * bet;
    const freeSpins = freeMode ? (scat >= 3 ? 5 : 0) : (scat >= 4 ? 10 : 0);
    return { steps, baseWin: win, multSum: multApplied, scatter: scat, scatterPay, freeSpins };
  }

  const api = { COLS, ROWS, SYMBOLS, SCATTER, MULT, spin, payOf };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.HokiEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
