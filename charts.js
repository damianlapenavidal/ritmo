/* Minimal SVG charts with hover tooltips. No dependencies. */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const DAY = 86400000;
  const toDay = (s) => Math.round(new Date(s + "T12:00:00").getTime() / DAY);
  const fmtDate = (s) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function el(tag, attrs = {}, parent) {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  }

  function niceRange(min, max, ticks = 4) {
    if (min === max) { min -= 1; max += 1; }
    const span = max - min;
    const step0 = span / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step / 2; v += step) out.push(+v.toFixed(6));
    return { lo, hi, ticks: out };
  }

  function frame(container, height) {
    container.innerHTML = "";
    container.classList.add("chart");
    // draw at the container's real pixel width so text stays 11px on phones
    const W = Math.max(280, Math.round(container.clientWidth || 640));
    const H = Math.round((height || 220) * (W < 500 ? 0.9 : 1)), m = { t: 12, r: 12, b: 26, l: 44 };
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, role: "img" }, container);
    const tip = document.createElement("div");
    tip.className = "tooltip"; tip.hidden = true;
    container.appendChild(tip);
    return { svg, tip, W, H, m, iw: W - m.l - m.r, ih: H - m.t - m.b };
  }

  function yAxis(f, range, fmt) {
    for (const t of range.ticks) {
      const y = f.m.t + f.ih - ((t - range.lo) / (range.hi - range.lo)) * f.ih;
      el("line", { x1: f.m.l, x2: f.W - f.m.r, y1: y, y2: y, class: "grid-line" }, f.svg);
      const tx = el("text", { x: f.m.l - 6, y: y + 4, "text-anchor": "end", class: "axis-text" }, f.svg);
      tx.textContent = fmt ? fmt(t) : t;
    }
  }

  function showTip(f, container, px, py, html) {
    const box = container.getBoundingClientRect();
    const scale = box.width / f.W;
    f.tip.innerHTML = html;
    f.tip.hidden = false;
    const left = Math.min(Math.max(px * scale, 70), box.width - 70);
    f.tip.style.left = left + "px";
    f.tip.style.top = py * scale + "px";
  }

  /* series: [{name, color, points:[{date, y}], dots, line, width}] */
  function line(container, { series, target, yFmt, height, label, minY }) {
    const pts = series.flatMap((s) => s.points);
    if (!pts.length) { container.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const f = frame(container, height);
    f.svg.setAttribute("aria-label", label || "Line chart");
    const days = pts.map((p) => toDay(p.date));
    const x0 = Math.min(...days), x1 = Math.max(...days, x0 + 1);
    const ys = pts.map((p) => p.y).concat(target != null ? [target] : []);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo) * 0.1 || 1;
    const range = niceRange(minY != null ? Math.min(minY, lo) : lo - pad, hi + pad);
    const X = (s) => f.m.l + ((toDay(s) - x0) / (x1 - x0)) * f.iw;
    const Y = (v) => f.m.t + f.ih - ((v - range.lo) / (range.hi - range.lo)) * f.ih;
    yAxis(f, range, yFmt);
    // x labels: first, middle, last
    const uniq = [...new Set(pts.map((p) => p.date))].sort();
    [uniq[0], uniq[Math.floor(uniq.length / 2)], uniq[uniq.length - 1]].forEach((s, i) => {
      const t = el("text", { x: X(s), y: f.H - 6, "text-anchor": ["start", "middle", "end"][i], class: "axis-text" }, f.svg);
      t.textContent = fmtDate(s);
    });
    if (target != null) el("line", { x1: f.m.l, x2: f.W - f.m.r, y1: Y(target), y2: Y(target), class: "target" }, f.svg);
    for (const s of series) {
      const sorted = [...s.points].sort((a, b) => (a.date < b.date ? -1 : 1));
      if (s.line !== false && sorted.length > 1) {
        el("path", { d: sorted.map((p, i) => `${i ? "L" : "M"}${X(p.date).toFixed(1)},${Y(p.y).toFixed(1)}`).join(""), fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round" }, f.svg);
      }
      if (s.dots) for (const p of sorted) el("circle", { cx: X(p.date), cy: Y(p.y), r: 3.5, fill: s.color, "fill-opacity": s.dotOpacity || 0.45 }, f.svg);
    }
    // hover
    const cross = el("line", { y1: f.m.t, y2: f.m.t + f.ih, class: "crosshair", visibility: "hidden" }, f.svg);
    const hit = el("rect", { x: f.m.l, y: 0, width: f.iw, height: f.H, fill: "transparent" }, f.svg);
    const move = (ev) => {
      const r = f.svg.getBoundingClientRect();
      const vx = ((ev.clientX - r.left) / r.width) * f.W;
      let best = uniq[0], bd = Infinity;
      for (const s of uniq) { const dd = Math.abs(X(s) - vx); if (dd < bd) { bd = dd; best = s; } }
      cross.setAttribute("x1", X(best)); cross.setAttribute("x2", X(best)); cross.setAttribute("visibility", "visible");
      const rows = series.map((s) => { const p = s.points.find((q) => q.date === best); return p ? `${s.name}: <b>${yFmt ? yFmt(p.y) : p.y}</b>` : ""; }).filter(Boolean);
      const top = Math.min(...series.map((s) => { const p = s.points.find((q) => q.date === best); return p ? Y(p.y) : f.H; }));
      showTip(f, container, X(best), top, `${fmtDate(best)}<br>${rows.join("<br>")}`);
    };
    hit.addEventListener("pointermove", move);
    hit.addEventListener("pointerdown", move);
    hit.addEventListener("pointerleave", () => { f.tip.hidden = true; cross.setAttribute("visibility", "hidden"); });
  }

  /* bars: [{label, value, title}] */
  function bars(container, { bars, target, color, yFmt, height, label }) {
    if (!bars.length) { container.innerHTML = '<div class="empty">No data yet</div>'; return; }
    const f = frame(container, height);
    f.svg.setAttribute("aria-label", label || "Bar chart");
    const vals = bars.map((b) => b.value).concat(target != null ? [target] : []);
    const range = niceRange(0, Math.max(...vals, 1) * 1.05);
    const Y = (v) => f.m.t + f.ih - ((v - range.lo) / (range.hi - range.lo)) * f.ih;
    yAxis(f, range, yFmt);
    const slot = f.iw / bars.length, bw = Math.max(4, Math.min(28, slot - 2));
    bars.forEach((b, i) => {
      const cx = f.m.l + slot * i + slot / 2;
      const h = Math.max(0, f.m.t + f.ih - Y(b.value));
      if (h > 0) el("path", { d: roundedTop(cx - bw / 2, Y(b.value), bw, h, Math.min(4, bw / 2)), fill: color }, f.svg);
      const every = Math.max(1, Math.ceil(52 / slot)); // ~52px per label, anchored on the latest bar
      const showLabel = (bars.length - 1 - i) % every === 0;
      if (showLabel) { const t = el("text", { x: cx, y: f.H - 6, "text-anchor": "middle", class: "axis-text" }, f.svg); t.textContent = b.label; }
      const hit = el("rect", { x: f.m.l + slot * i, y: f.m.t, width: slot, height: f.ih, fill: "transparent" }, f.svg);
      const show = () => showTip(f, container, cx, Y(b.value), `${b.title || b.label}<br><b>${yFmt ? yFmt(b.value) : b.value}</b>`);
      hit.addEventListener("pointerenter", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", () => (f.tip.hidden = true));
    });
    if (target != null) el("line", { x1: f.m.l, x2: f.W - f.m.r, y1: Y(target), y2: Y(target), class: "target" }, f.svg);
  }

  function roundedTop(x, y, w, h, r) {
    r = Math.min(r, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  window.Charts = { line, bars, fmtDate };
})();
