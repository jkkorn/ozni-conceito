// Ozni placement simulator — UI, drawing and interaction. Physics lives in model.js.
(function () {
  "use strict";
  const M = window.OzniModel, LAYOUTS = window.OzniLayouts, TXT = window.OzniText, AUDIO = window.OzniAudio;
  const P = { L0: 140, amb: 60, clip: 120, clockMs: 5 };
  const params = () => ({ L0: P.L0, amb: P.amb, clip: P.clip, clockTol: P.clockMs / 1000 });
  const FW_FALSE_GUN = 0.37;   // measured: share of held-out firecrackers the model called gunshot
  const UNMEASURED_RECALL = 0.8;

  let LANG = "pt", layoutKey = "escola", site, phones = [], mode = "phone", layer = "cov";
  let selected = -1, newModel = "pixel7", sound = false;
  let last = null, anim = null, drag = -1, incident = [], cov = null;
  const t = k => (TXT[k] ? TXT[k][LANG] : k);
  const $ = id => document.getElementById(id);
  const cv = $("cv"), ctx = cv.getContext("2d");

  function loadLayout(key) {
    layoutKey = key;
    const L = LAYOUTS[key];
    site = { outline: L.outline, rooms: L.rooms, walls: L.walls.map(w => w.slice()) };
    phones = L.phones.map(p => ({ pos: p.slice(), model: newModel }));
    selected = -1; last = null; incident = [];
  }

  /* ------------------------------------------------------------ view math */
  let view = { s: 10, ox: 0, oy: 0 };
  function fit() {
    const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const b = M.bounds(site), s = Math.min(r.width / (b.x1 - b.x0), r.height / (b.y1 - b.y0)) * 0.96;
    view = { s, ox: (r.width - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (r.height - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
  }
  const X = x => view.ox + x * view.s, Y = y => view.oy + y * view.s;
  const toW = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s]; };
  function segDist(p, w) {
    const vx = w[2] - w[0], vy = w[3] - w[1], u = Math.max(0, Math.min(1, ((p[0] - w[0]) * vx + (p[1] - w[1]) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(p[0] - (w[0] + u * vx), p[1] - (w[1] + u * vy));
  }

  /* -------------------------------------------------------------- drawing */
  function draw() {
    const r = cv.getBoundingClientRect(); ctx.clearRect(0, 0, r.width, r.height);
    const b = M.bounds(site);
    ctx.fillStyle = "#1a1f29"; ctx.fillRect(X(b.x0), Y(b.y0), (b.x1 - b.x0) * view.s, (b.y1 - b.y0) * view.s);
    ctx.beginPath(); site.outline.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Y(p[1])) : ctx.moveTo(X(p[0]), Y(p[1])))); ctx.closePath();
    ctx.fillStyle = "#252c39"; ctx.fill();
    if (layer !== "none" && cov) for (const c of cov.cells) {
      let col = null;
      if (layer === "cov") col = c.n >= 2 ? [76, 195, 138] : c.n === 1 ? [229, 163, 59] : [224, 93, 93];
      else if (c.allClip) col = [170, 110, 255];
      if (col) { ctx.fillStyle = `rgba(${col},${c.in ? 0.36 : 0.14})`; ctx.fillRect(X(c.p[0] - 0.5), Y(c.p[1] - 0.5), view.s + 0.5, view.s + 0.5); }
    }
    if (last && last.res && last.res.region && !anim) {
      ctx.fillStyle = "rgba(90,167,255,.55)";
      for (const c of last.res.region) ctx.fillRect(X(c.p[0] - 0.25), Y(c.p[1] - 0.25), view.s / 2 + 0.5, view.s / 2 + 0.5);
    }
    ctx.textAlign = "center"; ctx.font = "12px system-ui"; ctx.fillStyle = "rgba(232,236,243,.6)";
    for (const rm of site.rooms) ctx.fillText(rm[0], X((rm[1] + rm[3]) / 2), Y((rm[2] + rm[4]) / 2) - 14);
    ctx.fillStyle = "rgba(154,164,181,.65)"; ctx.fillText(t("street"), X(b.x0 + 12), Y(b.y0 + 3));
    ctx.lineCap = "round";
    for (const w of site.walls) {
      const m = M.MATERIALS[w[4]];
      ctx.strokeStyle = m.color; ctx.lineWidth = w[4] === "open" ? 1 : 2 + m.loss / 9;
      ctx.setLineDash(w[4] === "open" ? [3, 4] : []);
      ctx.beginPath(); ctx.moveTo(X(w[0]), Y(w[1])); ctx.lineTo(X(w[2]), Y(w[3])); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.strokeStyle = "#9aa4b5"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(b.x1 - 12), Y(b.y1 - 2)); ctx.lineTo(X(b.x1 - 2), Y(b.y1 - 2)); ctx.stroke();
    ctx.fillStyle = "#9aa4b5"; ctx.fillText("10 m", X(b.x1 - 7), Y(b.y1 - 2.6));
    if (last) {
      const src = last.at;
      if (anim) {
        ctx.strokeStyle = last.kind === "gun" ? "rgba(255,120,120,.9)" : last.kind === "fw" ? "rgba(255,200,90,.9)" : "rgba(140,190,255,.9)";
        ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(src[0]), Y(src[1]), Math.max(1, anim.r * view.s), 0, 7); ctx.stroke();
      }
      ctx.font = "18px system-ui"; ctx.fillText(last.kind === "gun" ? "💥" : last.kind === "fw" ? "🧨" : "🔊", X(src[0]), Y(src[1]) + 6);
    }
    phones.forEach((p, i) => {
      let ring = "#5aa7ff";
      if (last && last.res && last.res.dets && (!anim || anim.r >= M.dist(last.at, p.pos))) {
        const d = last.res.dets[i]; if (d) ring = d.heard ? (d.clip ? "#aa6eff" : "#4cc38a") : "#e05d5d";
      }
      ctx.fillStyle = "#0e1116"; ctx.strokeStyle = ring; ctx.lineWidth = i === selected ? 5 : 3;
      ctx.beginPath(); ctx.arc(X(p.pos[0]), Y(p.pos[1]), 11, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#e8ecf3"; ctx.font = "bold 11px system-ui"; ctx.fillText("C" + (i + 1), X(p.pos[0]), Y(p.pos[1]) + 4);
    });
  }

  /* ------------------------------------------------------------- panels */
  const pct = (v, n) => (n ? Math.round(100 * v / n) + "%" : "–");
  function renderStats() {
    cov = M.coverage(site, phones, params());
    const s = cov;
    $("stats").innerHTML =
      `<span>${t("s2")}</span><b style="color:var(--accent)">${pct(s.A2, s.Ain)}</b>` +
      `<span>${t("s1")}</span><b style="color:var(--warn)">${pct(s.A1, s.Ain)}</b>` +
      `<span>${t("s0")}</span><b style="color:var(--bad)">${pct(s.A0, s.Ain)}</b>` +
      `<span>${t("sclip")}</span><b style="color:#c9a2ff">${pct(s.Ac, s.Ain)}</b>` +
      `<span>${t("sout")}</span><b>${pct(s.O2, s.Oout)}</b>`;
  }
  const roomName = r => r || t("outside");
  const sharesText = sh => sh.slice(0, 3).map(s => `${roomName(s.room)} ${Math.round(s.frac * 100)}%`).join(" · ");

  function renderPhoneCard() {
    const el = $("phonecard");
    if (selected < 0 || !phones[selected]) { el.innerHTML = `<span class="note">${t("noSel")}</span>`; return; }
    const ph = phones[selected], spec = M.PHONES[ph.model];
    const opts = Object.entries(M.PHONES).map(([k, v]) => `<option value="${k}" ${k === ph.model ? "selected" : ""}>${v.name}</option>`).join("");
    const rec = spec.recall === null ? `<span class="note">${t("notMeasured")}</span>`
      : `<b>${Math.round(spec.recall * 100)}%</b> <span class="note">(n=${spec.n}, ${spec.src})</span>`;
    el.innerHTML = `<div class="card"><div><b>C${selected + 1}</b> · ${roomName(M.roomOf(site, ph.pos))}</div>` +
      `<select id="selModel" class="btn" style="width:100%;margin:6px 0">${opts}</select>` +
      `<div class="kv"><span>${t("recall")}</span><span>${rec}</span></div>` +
      (spec.recall !== null ? `<div class="note">${t("recallNote")}</div>` : "") +
      `<div class="note" style="margin-top:4px">${t("hwNote")}</div>` +
      (spec.os === "iOS" ? `<div class="note" style="margin-top:4px">${t("iosNote")}</div>` : "") + `</div>`;
    $("selModel").onchange = e => { ph.model = e.target.value; renderPhoneCard(); };
  }

  function renderIncident() {
    const el = $("incident");
    if (!incident.length) { el.innerHTML = `<span class="note">${t("noIncident")}</span>`; return; }
    const all = [].concat(...incident.map(e => e.region));
    const rows = incident.map((e, k) => `<div>#${k + 1} ${e.kind === "gun" ? "🔫" : e.kind === "fw" ? "🧨" : "🔊"} ` +
      `${e.region.length ? sharesText(M.roomShares(e.region)) : "–"} <span class="pill p-${e.prio}">${t(e.prio)}</span></div>`).join("");
    el.innerHTML = `<div class="verdict"><div>${t("shots")}: <b>${incident.length}</b></div>` +
      `<div>${t("area")}: <b>${all.length ? sharesText(M.roomShares(all)) : "–"}</b></div>${rows}` +
      `<div class="note" style="margin-top:4px">${t("areaNote")}</div></div>`;
  }

  function renderEvent() {
    const el = $("event");
    if (!phones.length) { el.textContent = t("nophones"); return; }
    if (!last) { el.textContent = t("noevent"); return; }
    const r = last.res;
    if (r.none) { el.innerHTML = `<div class="verdict">${t("nobody")}</div>`; return; }
    const rows = r.dets.map(d => `<tr><td>C${d.i + 1}</td><td>${roomName(M.roomOf(site, phones[d.i].pos))}</td>` +
      `<td>${Math.round(d.level)} dB</td><td>${d.heard ? Math.round(d.t * 1000) + " ms" : "–"}</td>` +
      `<td>${d.heard ? (d.clip ? t("clipped") : t("heard")) : t("missed")}</td>` +
      `<td>${d.heard ? (last.votes[d.i] ? t("aiGun") : t("aiFw")) : ""}</td></tr>`).join("");
    const lines = [];
    if (r.H.length === 1 && !r.flags.length) lines.push(t("single"));
    lines.push(r.consistent ? "✅ " + t("consistent") : "❌ " + t("inconsistent"));
    if (r.flags.includes("isolated")) lines.push(t("isolated"));
    if (r.region.length) lines.push(`${t("area")}: <b>${sharesText(M.roomShares(r.region))}</b>`);
    lines.push(`${t("near")}: <b>C${r.nearest.i + 1}</b> (${roomName(M.roomOf(site, phones[r.nearest.i].pos))})`);
    if (r.srcDb !== null) lines.push(`${t("srcest")}: <b>≤ ${Math.round(r.srcDb)} dB</b> ${t("at1m")}`);
    if (r.flags.includes("quiet")) lines.push(t("quiet"));
    if (last.kind === "spoof" && !r.flags.length && r.H.length === 2) lines.push(`<span class="note">${t("twoOnly")}</span>`);
    const votes = r.H.filter(d => last.votes[d.i]).length;
    lines.push(`${t("score")}: <b>${votes}/${r.H.length} ${t("aiGun")}</b>`);
    el.innerHTML = `<table><tr><th>${t("ph")}</th><th>${t("room")}</th><th>${t("lvl")}</th><th>${t("arr")}</th><th></th><th>${t("ai")}</th></tr>${rows}</table>` +
      `<div class="verdict">${lines.map(x => `<div>${x}</div>`).join("")}` +
      `<div style="margin-top:6px">${t("prio")}: <span class="pill p-${r.prio}">${t(r.prio)}</span></div>` +
      `<div class="note" style="margin-top:4px">${t("action")}</div></div>`;
  }

  function refresh() { renderStats(); renderPhoneCard(); renderIncident(); renderEvent(); draw(); }

  /* ------------------------------------------------------------- events */
  function fire(kind, p) {
    if (!phones.length) return;
    let L0 = P.L0, at = p;
    if (kind === "fw") L0 = P.L0 - 5;
    if (kind === "spoof") {                     // speaker 30 cm from the closest phone, ~100 dB at 1 m
      const i = phones.reduce((b, q, j) => (M.dist(q.pos, p) < M.dist(phones[b].pos, p) ? j : b), 0);
      at = [phones[i].pos[0] + 0.3, phones[i].pos[1]]; L0 = 100;
    }
    const dets = M.simulate(site, phones, at, L0, params(), Math.random);
    const votes = dets.map(d => {
      if (!d.heard) return false;
      const rec = M.PHONES[phones[d.i].model].recall;
      return Math.random() < (kind === "fw" ? FW_FALSE_GUN : rec === null ? UNMEASURED_RECALL : rec);
    });
    const heard = dets.filter(d => d.heard);
    const share = heard.length ? heard.filter(d => votes[d.i]).length / heard.length : 0;
    // majority "gun" → confident; a tie is genuinely unsure (normal), never high
    const gunScore = share > 0.5 ? 0.92 : share === 0.5 ? 0.6 : 0.3;
    const res = M.assess(site, phones, dets, params(), gunScore);
    last = { kind, at, res, votes };
    if (!res.none) incident.push({ kind, region: res.region, prio: res.prio });
    const listen = selected >= 0 && phones[selected] ? selected : res.none ? -1 : res.nearest.i;
    const maxR = Math.max(...phones.map(q => M.dist(at, q.pos))) + 2, start = performance.now();
    let played = false;
    if (anim) cancelAnimationFrame(anim.id);
    anim = { r: 0 };
    const step = now => {
      anim.r = (now - start) / 1000 * M.C / 10;          // 10× slow motion
      if (sound && !played && listen >= 0 && anim.r >= M.dist(at, phones[listen].pos)) {
        played = true;
        const d = dets[listen];
        if (d.heard) AUDIO.play(kind, d.level, M.wallsCrossed(site, at, phones[listen].pos));
      }
      if (anim.r >= maxR) { anim = null; refresh(); return; }
      draw(); anim.id = requestAnimationFrame(step);
    };
    anim.id = requestAnimationFrame(step);
    renderEvent();
  }

  cv.addEventListener("pointerdown", e => {
    const w = toW(e);
    if (mode === "phone") {
      const i = phones.findIndex(p => M.dist(p.pos, w) < 1.6);
      if (i >= 0) { drag = i; selected = i; cv.setPointerCapture(e.pointerId); renderPhoneCard(); draw(); return; }
      if (phones.length < 10) { phones.push({ pos: w, model: newModel }); selected = phones.length - 1; last = null; refresh(); }
    } else if (mode === "walls") {
      let best = -1, bd = 0.9;
      site.walls.forEach((wl, j) => { const d = segDist(w, wl); if (d < bd) { bd = d; best = j; } });
      if (best >= 0) {
        const o = M.MATERIAL_ORDER, wl = site.walls[best];
        wl[4] = o[(o.indexOf(wl[4]) + 1) % o.length]; last = null; refresh();
      }
    } else fire(mode, w);
  });
  cv.addEventListener("pointermove", e => { if (drag < 0) return; phones[drag].pos = toW(e); last = null; draw(); });
  cv.addEventListener("pointerup", () => { if (drag >= 0) { drag = -1; refresh(); } });
  cv.addEventListener("dblclick", e => {
    if (mode !== "phone") return;
    const w = toW(e), i = phones.findIndex(p => M.dist(p.pos, w) < 1.6);
    if (i >= 0) { phones.splice(i, 1); selected = -1; last = null; refresh(); }
  });

  /* ------------------------------------------------------------ controls */
  function buttons(id, items, cur, onPick) {
    const el = $(id); el.innerHTML = "";
    for (const [k, lab] of items) {
      const bt = document.createElement("button"); bt.className = "btn" + (cur === k ? " on" : "");
      bt.textContent = t(lab); bt.onclick = () => onPick(k); el.appendChild(bt);
    }
  }
  function buildUI() {
    document.documentElement.lang = LANG === "pt" ? "pt-BR" : "en";
    for (const k of ["title", "tag", "plan", "click", "phones", "k", "newModel", "selected", "map", "cov", "incident", "event", "params", "honest", "honesttext", "materials"])
      $("t-" + k).textContent = t(k);
    $("suggest").textContent = t("suggest"); $("clear").textContent = t("clear");
    $("newIncident").textContent = t("newIncident");
    $("lang").textContent = LANG === "pt" ? "EN" : "PT";
    $("sound").textContent = `${sound ? "🔊" : "🔈"} ${t("sound")}: ${sound ? t("on") : t("off")}`;
    $("sound").className = "btn" + (sound ? " on" : "");
    $("listen").textContent = selected >= 0 ? `${t("listen")} C${selected + 1}` : "";
    const sel = $("layout"); sel.innerHTML = "";
    for (const [k, v] of Object.entries(LAYOUTS)) sel.add(new Option(v.name[LANG], k, false, k === layoutKey));
    const nm = $("newModelSel"); nm.innerHTML = "";
    for (const [k, v] of Object.entries(M.PHONES)) nm.add(new Option(v.name, k, false, k === newModel));
    buttons("modes", [["phone", "m_phone"], ["walls", "m_walls"], ["gun", "m_gun"], ["fw", "m_fw"], ["spoof", "m_spoof"]], mode,
      k => { mode = k; buildUI(); });
    $("spoofHelp").textContent = t("spoof_help");
    $("spoofHelp").style.display = mode === "spoof" ? "block" : "none";
    buttons("layers", [["cov", "l_cov"], ["clip", "l_clip"], ["none", "l_none"]], layer, k => { layer = k; buildUI(); draw(); });
    $("legend").innerHTML = (layer === "clip"
      ? `<span><i class="sw" style="background:rgba(170,110,255,.8)"></i>${t("lgclip")}</span>`
      : `<span><i class="sw" style="background:#e05d5d"></i>${t("lg0")}</span><span><i class="sw" style="background:#e5a33b"></i>${t("lg1")}</span><span><i class="sw" style="background:#4cc38a"></i>${t("lg2")}</span>`) +
      `<span><i class="sw" style="background:#5aa7ff"></i>${t("lgregion")}</span>`;
    $("matLegend").innerHTML = M.MATERIAL_ORDER.map(k => { const m = M.MATERIALS[k];
      return `<span><i class="sw" style="background:${m.color}"></i>${m[LANG]} · ${m.loss} dB</span>`; }).join("");
    const sl = $("sliders"); sl.innerHTML = "";
    for (const [k, lab, min, max] of [["L0", "p_L0", 120, 160], ["amb", "p_amb", 40, 80], ["clip", "p_clip", 110, 135], ["clockMs", "p_clock", 1, 50]]) {
      const d = document.createElement("div"); d.className = "slider";
      d.innerHTML = `<label for="s-${k}">${t(lab)}</label><output>${P[k]}</output><input id="s-${k}" type="range" min="${min}" max="${max}" value="${P[k]}">`;
      d.querySelector("input").oninput = e => { P[k] = +e.target.value; d.querySelector("output").textContent = P[k]; last = null; refresh(); };
      sl.appendChild(d);
    }
    $("hint").textContent = mode === "phone" ? t("hint_phone") : mode === "walls" ? t("hint_walls") : mode === "spoof" ? t("hint_spoof") : t("hint_shot");
    refresh();
  }
  $("layout").onchange = e => { loadLayout(e.target.value); fit(); buildUI(); };
  $("newModelSel").onchange = e => { newModel = e.target.value; };
  $("suggest").onclick = () => {
    const k = Math.max(2, Math.min(8, +$("k").value || 4));
    phones = M.suggest(site, k, params()).map(p => ({ pos: p, model: newModel })); selected = -1; last = null; refresh();
  };
  $("clear").onclick = () => { phones = []; selected = -1; last = null; refresh(); };
  $("newIncident").onclick = () => { incident = []; last = null; refresh(); };
  $("sound").onclick = () => { sound = !sound; buildUI(); };
  $("lang").onclick = () => { LANG = LANG === "pt" ? "en" : "pt"; buildUI(); };
  window.addEventListener("resize", () => { fit(); draw(); });

  loadLayout(layoutKey); buildUI(); fit(); draw();
  window.OzniApp = { fire, state: () => ({ phones, site, last, incident }), setPhones: ps => { phones = ps; refresh(); } };
})();
