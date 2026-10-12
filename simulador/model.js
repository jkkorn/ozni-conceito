// Ozni placement simulator — acoustic model and cross-device checks.
// Mirrors spike/analysis/site_consistency.py; keep the two in step.
// Illustrative physics: spherical spreading + a fixed loss per wall crossed. No echoes,
// diffraction around corners, open-window paths or per-phone microphone differences.
(function (root) {
  "use strict";
  const C = 343;                 // speed of sound, m/s
  const DETECT_MARGIN = 15;      // dB above ambient for a candidate to be detected
  const LOUD_SNR = 40, NEIGH_M = 25;
  const GUN_MIN_SOURCE = 125;    // quietest plausible firearm at 1 m (conservative)
  const FIT_TOL = 3;             // dB level-calibration tolerance per phone
  const MARGIN = 8;              // metres of street drawn around the building

  // Illustrative transmission loss for impulsive sound. Low-frequency booms pass walls
  // more easily than these single numbers suggest; measure on site before trusting them.
  const MATERIALS = {
    open:     { loss: 0,  color: "#4a5366", pt: "Aberto (vão / porta aberta)", en: "Open (doorway)" },
    drywall:  { loss: 10, color: "#a9bcd2", pt: "Gesso / drywall", en: "Drywall" },
    door:     { loss: 12, color: "#d1a86e", pt: "Porta fechada", en: "Closed door" },
    block:    { loss: 15, color: "#8c97ab", pt: "Bloco / tijolo fino", en: "Thin block / brick" },
    glass:    { loss: 18, color: "#6fd3ff", pt: "Vidro / janela", en: "Glass / window" },
    masonry:  { loss: 25, color: "#dfe6f2", pt: "Alvenaria grossa", en: "Thick masonry" },
    concrete: { loss: 35, color: "#ffffff", pt: "Concreto", en: "Concrete" },
  };
  const MATERIAL_ORDER = ["open", "drywall", "door", "block", "glass", "masonry", "concrete"];

  // recall = share of held-out gunshots the K1 model called "gunshot" on recordings made
  // with this phone (2026-10-11). Different ranges/guns/distances per source: not a
  // clean device ranking. null = not measured yet.
  const PHONES = {
    pixel7: { name: "Google Pixel 7", os: "Android", recall: 0.973, n: 700, src: "C3GD" },
    tabA9:  { name: "Samsung Galaxy Tab A9+", os: "Android", recall: 0.984, n: 621, src: "C3GD" },
    s21:    { name: "Samsung Galaxy S21", os: "Android", recall: 0.882, n: 228, src: "Kabealo" },
    s8:     { name: "Samsung Galaxy S8", os: "Android", recall: 0.790, n: 124, src: "Kabealo" },
    s9:     { name: "Samsung Galaxy S9", os: "Android", recall: 0.710, n: 310, src: "Kabealo" },
    a56:    { name: "Samsung Galaxy A56", os: "Android", recall: null, n: 0, src: null },
    g75:    { name: "Motorola moto g75", os: "Android", recall: null, n: 0, src: null },
    iphone: { name: "iPhone", os: "iOS", recall: null, n: 0, src: null },
  };

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  function crosses(a, b, w) {
    const den = (b[0] - a[0]) * (w[3] - w[1]) - (b[1] - a[1]) * (w[2] - w[0]);
    if (Math.abs(den) < 1e-12) return false;
    const u = ((w[0] - a[0]) * (w[3] - w[1]) - (w[1] - a[1]) * (w[2] - w[0])) / den;
    const v = ((w[0] - a[0]) * (b[1] - a[1]) - (w[1] - a[1]) * (b[0] - a[0])) / den;
    return u > 1e-9 && u < 1 - 1e-9 && v >= 0 && v <= 1;
  }
  function wallLoss(site, a, b) {
    let s = 0;
    for (const w of site.walls) if (crosses(a, b, w)) s += MATERIALS[w[4]].loss;
    return s;
  }
  function wallsCrossed(site, a, b) {
    return site.walls.filter(w => MATERIALS[w[4]].loss > 0 && crosses(a, b, w)).length;
  }
  function level(site, src, ph, L0) {
    return L0 - 20 * Math.log10(Math.max(dist(src, ph), 0.5)) - wallLoss(site, src, ph);
  }
  function inside(site, p) {
    let c = false; const o = site.outline;
    for (let i = 0, j = o.length - 1; i < o.length; j = i++) {
      const [xi, yi] = o[i], [xj, yj] = o[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function roomOf(site, p) {
    for (const r of site.rooms) if (p[0] >= r[1] && p[0] <= r[3] && p[1] >= r[2] && p[1] <= r[4]) return r[0];
    return null;                                       // outside the building
  }
  function bounds(site) {
    const xs = site.outline.map(p => p[0]), ys = site.outline.map(p => p[1]);
    return { x0: Math.min(...xs) - MARGIN, y0: Math.min(...ys) - MARGIN,
             x1: Math.max(...xs) + MARGIN, y1: Math.max(...ys) + MARGIN };
  }
  const cellCache = new Map();
  function cells(site, step) {
    const key = site.outline.join(";") + "|" + step;
    if (cellCache.has(key)) return cellCache.get(key);
    const b = bounds(site), out = [];
    for (let y = b.y0 + step / 2; y < b.y1; y += step)
      for (let x = b.x0 + step / 2; x < b.x1; x += step)
        out.push({ p: [x, y], in: inside(site, [x, y]), room: roomOf(site, [x, y]) });
    cellCache.set(key, out);
    return out;
  }

  /** What each phone records for one sound. rng() in [0,1) adds clock error. */
  function simulate(site, phones, src, L0, params, rng) {
    const det = params.amb + DETECT_MARGIN;
    return phones.map((ph, i) => {
      const lv = level(site, src, ph.pos, L0), r = dist(src, ph.pos), clip = lv >= params.clip;
      return { i, level: lv, reported: clip ? params.clip : lv, heard: lv >= det, clip,
               t: r / C + (rng() * 2 - 1) * params.clockTol * 0.8, snr: lv - params.amb };
    });
  }

  /** Every position (0.5 m grid) that could have produced these recordings: arrival-time
   *  gaps within clock tolerance, calibrated levels from one point source through the
   *  walls, and too quiet for the phones that heard nothing. src = implied level at 1 m. */
  function originRegion(site, phones, dets, params) {
    const H = dets.filter(d => d.heard), clean = H.filter(d => !d.clip);
    const silent = dets.filter(d => !d.heard), det = params.amb + DETECT_MARGIN, tol = params.clockTol;
    const out = [];
    for (const c of cells(site, 0.5)) {
      const r = dets.map(d => dist(c.p, phones[d.i].pos));
      if (H.length >= 2) {
        const ref = H[0];
        if (H.some(d => Math.abs((d.t - ref.t) - (r[d.i] - r[ref.i]) / C) > 2 * tol)) continue;
      }
      const loss = dets.map(d => 20 * Math.log10(Math.max(r[d.i], 0.5)) + wallLoss(site, c.p, phones[d.i].pos));
      let src, lower = -Infinity;
      for (const d of H) if (d.clip) lower = Math.max(lower, params.clip - FIT_TOL + loss[d.i]);
      if (clean.length) {
        const imp = clean.map(d => d.reported + loss[d.i]);
        if (Math.max(...imp) - Math.min(...imp) > 2 * FIT_TOL) continue;
        src = imp.reduce((a, b) => a + b, 0) / imp.length;
        if (src < lower) continue;
      } else src = Infinity;                       // every hearing phone clipped: unbounded
      const minSrc = clean.length ? src : lower;
      if (silent.some(d => minSrc - loss[d.i] > det + FIT_TOL)) continue;
      out.push({ p: c.p, room: c.room, src });
    }
    return out;
  }

  function assess(site, phones, dets, params, gunScore) {
    const H = dets.filter(d => d.heard);
    if (!H.length) return { none: true, dets };
    const tol = params.clockTol, flags = [];
    let consistent = true;
    for (let a = 0; a < H.length; a++) for (let b = a + 1; b < H.length; b++) {
      const lim = dist(phones[H[a].i].pos, phones[H[b].i].pos) / C + 2 * tol;
      if (Math.abs(H[a].t - H[b].t) > lim) consistent = false;
    }
    if (H.length === 1 && H[0].snr >= LOUD_SNR &&
        phones.some((p, j) => j !== H[0].i && dist(p.pos, phones[H[0].i].pos) <= NEIGH_M)) flags.push("isolated");
    const region = originRegion(site, phones, dets, params);
    const finite = region.filter(c => Number.isFinite(c.src));
    const srcDb = H.length >= 2 && finite.length === region.length && finite.length
      ? Math.max(...finite.map(c => c.src)) : null;
    if (srcDb !== null && srcDb < GUN_MIN_SOURCE) flags.push("quiet");
    const gaps = [];
    for (let a = 0; a < H.length; a++) for (let b = a + 1; b < H.length; b++)
      gaps.push(dist(phones[H[a].i].pos, phones[H[b].i].pos) / C);
    const nearest = gaps.length && 2 * tol < Math.min(...gaps) / 2
      ? H.reduce((x, y) => (y.t < x.t ? y : x)) : H.reduce((x, y) => (y.level > x.level ? y : x));
    let prio;
    if (gunScore < 0.5) prio = "low";
    else if (consistent && !flags.length && H.length >= 2 && gunScore >= 0.9) prio = "high";
    else prio = "normal";
    return { dets, H, consistent, flags, nearest, prio, gunScore, srcDb, region, action: "human_review" };
  }

  /** Share of the origin area per room (null room = outside), largest first. */
  function roomShares(region) {
    const n = {};
    for (const c of region) n[c.room || ""] = (n[c.room || ""] || 0) + 1;
    return Object.entries(n).map(([room, k]) => ({ room: room || null, frac: k / region.length }))
      .sort((a, b) => b.frac - a.frac);
  }
  const topRoom = (site, region) => (region.length ? roomShares(region)[0].room : null);

  /** Coverage of a gunshot at every 1 m cell: how many phones hear it, and whether all clip. */
  function coverage(site, phones, params) {
    const det = params.amb + DETECT_MARGIN, cs = cells(site, 1);
    const s = { A2: 0, A1: 0, A0: 0, Ac: 0, Ain: 0, O2: 0, Oout: 0, cells: [] };
    for (const c of cs) {
      let n = 0, clean = 0;
      for (const ph of phones) { const l = level(site, c.p, ph.pos, params.L0); if (l >= det) { n++; if (l < params.clip) clean++; } }
      const allClip = n > 0 && clean === 0;
      s.cells.push({ p: c.p, in: c.in, n, allClip });
      if (c.in) { s.Ain++; if (n >= 2) s.A2++; else if (n === 1) s.A1++; else s.A0++; if (allClip) s.Ac++; }
      else { s.Oout++; if (n >= 2) s.O2++; }
    }
    return s;
  }

  /** Greedy placement of k phones (+ one swap pass): favour 2+ phones hearing every
   *  indoor spot, some clean (unclipped) phone, and partial credit for the street. */
  function suggest(site, k, params) {
    const det = params.amb + DETECT_MARGIN, cs = cells(site, 1), b = bounds(site), cands = [];
    for (let y = b.y0 + MARGIN + 0.8; y < b.y1 - MARGIN; y += 1.5)
      for (let x = b.x0 + MARGIN + 0.8; x < b.x1 - MARGIN; x += 1.5) if (inside(site, [x, y])) cands.push([x, y]);
    const H = cands.map(cd => cs.map(c => { const l = level(site, c.p, cd, params.L0); return l < det ? 0 : l >= params.clip ? 2 : 1; }));
    const w = cs.map(c => (c.in ? 1 : 0.25));
    const score = sel => { let s = 0;
      for (let j = 0; j < cs.length; j++) { let n = 0, clean = 0;
        for (const i of sel) { const h = H[i][j]; if (h) { n++; if (h === 1) clean++; } }
        s += w[j] * ((n >= 2 ? 1 : n === 1 ? 0.55 : 0) - (n > 0 && clean === 0 ? 0.3 : 0) + (n >= 3 ? 0.05 : 0)); }
      return s; };
    let sel = [];
    for (let step = 0; step < k; step++) { let best = -1, bs = -1e9;
      for (let i = 0; i < cands.length; i++) { if (sel.includes(i)) continue; const s = score([...sel, i]); if (s > bs) { bs = s; best = i; } }
      sel.push(best); }
    for (let a = 0; a < sel.length; a++) { let cur = score(sel);
      for (let i = 0; i < cands.length; i++) { if (sel.includes(i)) continue; const tr = sel.slice(); tr[a] = i;
        const s = score(tr); if (s > cur + 1e-9) { cur = s; sel = tr; } } }
    return sel.map(i => cands[i].slice());
  }

  const M = { C, DETECT_MARGIN, GUN_MIN_SOURCE, MATERIALS, MATERIAL_ORDER, PHONES, dist, level, wallLoss,
    wallsCrossed, inside, roomOf, bounds, cells, simulate, originRegion, assess, roomShares, topRoom,
    coverage, suggest };
  if (typeof module !== "undefined") module.exports = M; else root.OzniModel = M;
})(this);
