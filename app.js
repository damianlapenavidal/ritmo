/* Ritmo - personal training + nutrition app.
   Data lives in a private GitHub repo; this page reads and writes it through the GitHub API
   with a fine-grained token that is stored only in this browser. Demo mode uses ./demo/. */
(function () {
  "use strict";

  // ---------- utils ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const LB = 2.20462;
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const localISO = (dt = new Date()) => dt.toLocaleDateString("en-CA");
  const addDays = (iso, n) => { const t = new Date(iso + "T12:00:00"); t.setDate(t.getDate() + n); return localISO(t); };
  const mondayOf = (iso) => { const t = new Date(iso + "T12:00:00"); const wd = (t.getDay() + 6) % 7; return addDays(iso, -wd); };
  const round = (v, step = 1) => Math.round(v / step) * step;
  const sum = (arr, k) => arr.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const cap = (s) => String(s ?? "").charAt(0).toUpperCase() + String(s ?? "").slice(1);
  const phaseName = (s) => String(s ?? "").replace(/^phase-(\d+)$/i, "Phase $1");
  const fmtDay = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  // <option>s with lowercase values (what gets saved) and capitalized labels
  const options = (vals, cur) => vals.map((v) => `<option value="${esc(v)}" ${cur === v ? "selected" : ""}>${esc(cap(phaseName(v)))}</option>`).join("");
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
  };
  const b64encode = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; bytes.forEach((b) => (bin += String.fromCharCode(b))); return btoa(bin); };
  const b64decode = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
  const icon = {
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l10 18H2z"/><path d="M12 10v4M12 17.5v.5"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><path d="M5 12l5 5 9-10"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/></svg>',
  };
  icon.chat = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/></svg>';
  icon.gallery = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/></svg>';
  // The coach is a Claude Project; the app can only open it. "check-in" is the phrase its instructions answer to.
  // claude.ai/project/* isn't a universal link (it opens Safari), so the button uses the claude:// scheme to reach the iPhone app.
  const COACH_MSG = "check-in";
  const coachUrl = (link) => { try { const u = new URL(String(link || "").trim()); return u.protocol === "https:" && u.hostname === "claude.ai" && /^\/project\/[\w-]+\/?$/.test(u.pathname) ? `https://claude.ai${u.pathname.replace(/\/$/, "")}` : null; } catch { return null; } };
  const PHOTO_MAX = 1024; // long edge in px; enough detail for food, small upload

  function toast(msg, ms = 2600) {
    const t = document.createElement("div");
    t.className = "toast"; t.role = "status"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------- state ----------
  const S = {
    cfg: Object.assign({ owner: "", repo: "fitness-coach", branch: "main", token: "", demo: true }, store.get("ritmo.cfg", {})),
    data: null,
    view: "today",
    logTab: "workout",
    draft: null,
    meal: null,
    queue: store.get("ritmo.queue", []),
    pending: store.get("ritmo.pending", []), // photo meals waiting for the AI estimate
    photo: null,
    loadedAt: 0,
  };
  const savePending = () => store.set("ritmo.pending", S.pending);
  const live = () => !S.cfg.demo && S.cfg.token && S.cfg.owner && S.cfg.repo;

  // ---------- data layer ----------
  const api = (path) => `https://api.github.com/repos/${encodeURIComponent(S.cfg.owner)}/${encodeURIComponent(S.cfg.repo)}/contents/${path}`;
  const headers = (accept) => ({ Authorization: `Bearer ${S.cfg.token}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28" });

  async function readText(path) {
    if (!live()) {
      const r = await fetch(`demo/${path}`, { cache: "no-store" });
      return r.ok ? r.text() : null;
    }
    const r = await fetch(`${api(path)}?ref=${encodeURIComponent(S.cfg.branch)}`, { headers: headers("application/vnd.github.raw+json"), cache: "no-store" });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub ${r.status} reading ${path}`);
    return r.text();
  }
  const readJSON = async (path, d) => { const t = await readText(path); return t ? JSON.parse(t) : d; };
  const parseJsonl = (t) => (t || "").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)).sort((a, b) => (a.date < b.date ? -1 : 1));

  async function getFile(path) {
    const r = await fetch(`${api(path)}?ref=${encodeURIComponent(S.cfg.branch)}`, { headers: headers("application/vnd.github+json"), cache: "no-store" });
    if (r.status === 404) return { sha: null, text: "" };
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const j = await r.json();
    return { sha: j.sha, text: b64decode(j.content || "") };
  }
  async function putFile(path, text, sha, message) {
    const body = { message, content: b64encode(text), branch: S.cfg.branch };
    if (sha) body.sha = sha;
    const r = await fetch(api(path), { method: "PUT", headers: { ...headers("application/vnd.github+json"), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; }
  }
  async function appendLine(path, obj, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = await getFile(path);
      const text = (f.text && !f.text.endsWith("\n") ? f.text + "\n" : f.text) + JSON.stringify(obj) + "\n";
      try { return await putFile(path, text, f.sha, message); }
      catch (e) { if (e.status !== 409 && e.status !== 422) throw e; } // sha race: retry
    }
    throw new Error("Could not save after 3 tries");
  }

  // Replace (or delete, when next is null) one existing log line, matched by its exact JSON.
  async function replaceLine(path, orig, next, message) {
    const key = JSON.stringify(orig);
    for (let attempt = 0; attempt < 3; attempt++) {
      const f = await getFile(path);
      const lines = f.text.split("\n");
      const idx = lines.findIndex((l) => { try { return l.trim() && JSON.stringify(JSON.parse(l)) === key; } catch { return false; } });
      if (idx < 0) throw new Error("Couldn't find that entry in your repo. Pull down to refresh and try again.");
      if (next) lines[idx] = JSON.stringify(next); else lines.splice(idx, 1);
      try { return await putFile(path, lines.join("\n"), f.sha, message); }
      catch (e) { if (e.status !== 409 && e.status !== 422) throw e; }
    }
    throw new Error("Could not save after 3 tries");
  }

  const LOGS = { workout: "logs/workouts.jsonl", meal: "logs/nutrition.jsonl", body: "logs/body.jsonl", test: "logs/tests.jsonl" };
  const KEYS = { workout: "workouts", meal: "nutrition", body: "body", test: "tests" };

  async function saveEntry(kind, obj) {
    S.data[KEYS[kind]].push(obj);
    S.data[KEYS[kind]].sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!live()) { toast("Demo mode: shown here, not saved"); return true; }
    try {
      await appendLine(LOGS[kind], obj, `log: ${kind} ${obj.date}`);
      toast("Saved to your repo");
      return true;
    } catch (e) {
      S.queue.push({ kind, obj });
      store.set("ritmo.queue", S.queue);
      toast("Offline or error: saved on this device, will retry");
      return true;
    }
  }
  async function flushQueue() {
    if (!live() || !S.queue.length) return;
    const pending = [...S.queue];
    for (const item of pending) {
      try {
        await appendLine(LOGS[item.kind], item.obj, `log: ${item.kind} ${item.obj.date} (synced)`);
        S.queue.shift();
        store.set("ritmo.queue", S.queue);
      } catch { break; }
    }
    if (!S.queue.length) toast("Pending entries synced");
    render();
  }

  async function loadAll() {
    const [profile, program, exercises, foods, w, n, b, t, report, weekly] = await Promise.all([
      readJSON("data/profile.json", {}), readJSON("data/program.json", {}), readJSON("data/exercises.json", {}), readJSON("data/foods.json", { items: [] }),
      readText("logs/workouts.jsonl"), readText("logs/nutrition.jsonl"), readText("logs/body.jsonl"), readText("logs/tests.jsonl"),
      readJSON("reports/latest.json", null), latestWeekly(),
    ]);
    delete exercises._note;
    S.data = { profile, program, exercises, foods: foods.items || [], workouts: parseJsonl(w), nutrition: parseJsonl(n), body: parseJsonl(b), tests: parseJsonl(t), report, weekly };
    for (const q of S.queue) S.data[KEYS[q.kind]].push(q.obj); // show unsynced entries too
    S.loadedAt = Date.now();
    resolvePending(await readJSON("inbox/errors.json", {}).catch(() => ({})));
  }

  // ---------- photo meals ----------
  async function resizeImage(file, max = PHOTO_MAX, quality = 0.82) {
    const img = await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This browser can't open that photo format (often HEIC). Take a new photo, or share it as JPEG.")); };
      im.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  }

  // Match pending photos to estimated log lines (by photo_id) and pick up errors.
  function resolvePending(errors = {}) {
    if (!S.pending.length || !S.data) return [];
    const done = [];
    S.pending = S.pending.filter((p) => {
      const hit = S.data.nutrition.find((r) => r.photo_id === p.id);
      if (hit) { done.push(hit); return false; }
      p.error = errors[p.id]?.error || null;
      return true;
    });
    savePending();
    return done;
  }

  let pollTimer = null;
  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!S.pending.length || !live()) return;
    pollTimer = setTimeout(async () => {
      if (document.visibilityState === "visible") {
        try {
          const [n, errs] = await Promise.all([readText("logs/nutrition.jsonl"), readJSON("inbox/errors.json", {})]);
          S.data.nutrition = parseJsonl(n);
          for (const q of S.queue) if (q.kind === "meal") S.data.nutrition.push(q.obj);
          const done = resolvePending(errs);
          if (done.length) {
            const d = done[done.length - 1];
            toast(`Meal estimated: ${Math.round(d.kcal)} kcal, ${Math.round(d.protein_g)} g protein`, 4000);
            if (!["log", "settings"].includes(S.view)) render();
          } else if (S.view === "food" && S.pending.some((p) => p.error)) render();
        } catch { /* offline: try again next tick */ }
      }
      schedulePoll();
    }, 15000);
  }

  async function sendPhoto() {
    const m = S.meal, ph = S.photo;
    const id = `${m.date}-${Date.now().toString(36)}`;
    const thumb = await (async () => { try { const r = await fetch(ph.dataUrl); return await resizeImage(await r.blob(), 160, 0.7); } catch { return null; } })();
    const entry = { id, date: m.date, meal: m.meal, note: (m.note || "").trim(), thumb, at: Date.now() };
    if (!live()) {
      S.pending.push(entry); savePending();
      setTimeout(() => {
        S.data.nutrition.push({ date: m.date, meal: m.meal, items: "grilled chicken (1 breast), rice (1 cup), salad (1 bowl)", kcal: 520, protein_g: 48, carbs_g: 55, fat_g: 11, source: "photo-ai", photo_id: id, confidence: "medium", ai_comment: "Demo estimate: connect your repo for real ones." });
        const done = resolvePending();
        if (done.length) toast(`Demo: meal estimated, ${done[0].kcal} kcal`);
        if (!["log", "settings"].includes(S.view)) render();
      }, 2500);
      return;
    }
    const payload = { id, date: m.date, meal: m.meal, note: entry.note, media_type: "image/jpeg", image_b64: ph.dataUrl.split(",")[1], uploaded_at: new Date().toISOString() };
    await putFile(`inbox/meals/${id}.json`, JSON.stringify(payload), null, `photo: ${m.meal} ${m.date}`);
    S.pending.push(entry); savePending();
    schedulePoll();
  }

  // ---------- refresh (pull down, reopen the app, or the refresh button) ----------
  let refreshing = false;
  async function refresh({ manual = false } = {}) {
    if (refreshing) return;
    refreshing = true;
    document.body.classList.add("is-refreshing");
    try {
      await loadAll();
      if (live()) flushQueue();
      schedulePoll();
      // Don't wipe a half-filled form; other screens re-render with fresh data.
      if (!["log", "settings"].includes(S.view)) render();
      if (manual) toast("Up to date");
    } catch (err) {
      if (manual) toast(`Couldn't refresh: ${err.message}`);
    } finally {
      refreshing = false;
      document.body.classList.remove("is-refreshing");
    }
  }
  async function latestWeekly() {
    try {
      if (!live()) {
        const idx = await readJSON("reports/weekly/index.json", []);
        return idx.length ? { name: idx[idx.length - 1], text: await readText(`reports/weekly/${idx[idx.length - 1]}`) } : null;
      }
      const r = await fetch(`${api("reports/weekly")}?ref=${encodeURIComponent(S.cfg.branch)}`, { headers: headers("application/vnd.github+json"), cache: "no-store" });
      if (!r.ok) return null;
      const files = (await r.json()).filter((f) => f.name.endsWith(".md")).map((f) => f.name).sort();
      if (!files.length) return null;
      const name = files[files.length - 1];
      return { name, text: await readText(`reports/weekly/${name}`) };
    } catch { return null; }
  }

  // ---------- derived ----------
  const today = () => (live() ? localISO() : (S.data?.report?.as_of || localISO()));
  const loadUnit = () => S.data?.profile?.units?.load || "lb";
  const showLoad = (kg) => (loadUnit() === "lb" ? round(kg * LB, 1) : round(kg, 0.5));
  const toKg = (v) => (loadUnit() === "lb" ? v / LB : v);
  const targets = () => S.data?.report?.targets || {};
  const dayNutrition = (iso) => { const rows = S.data.nutrition.filter((r) => r.date.slice(0, 10) === iso); return { rows, kcal: sum(rows, "kcal"), protein_g: sum(rows, "protein_g"), carbs_g: sum(rows, "carbs_g"), fat_g: sum(rows, "fat_g") }; };
  const epley = (kg, reps) => (reps > 0 && kg > 0 ? (reps === 1 ? kg : kg * (1 + reps / 30)) : 0);
  function rolling(points, days = 7) {
    return points.map((p) => {
      const from = addDays(p.date, -(days - 1));
      const win = points.filter((q) => q.date >= from && q.date <= p.date);
      return { date: p.date, y: round(win.reduce((a, q) => a + q.y, 0) / win.length, 0.01) };
    });
  }
  function liftSeries() {
    const out = {};
    for (const s of S.data.workouts) for (const ex of s.exercises || []) {
      if (!S.data.exercises[ex.name]?.key) continue;
      const best = Math.max(0, ...(ex.sets || []).map((st) => epley(+st.load_kg || 0, +st.reps || 0)));
      if (best > 0) (out[ex.name] ||= []).push({ date: s.date.slice(0, 10), y: showLoad(best) });
    }
    return out;
  }
  function weeks(n = 8) {
    const end = mondayOf(today());
    return Array.from({ length: n }, (_, i) => addDays(end, -7 * (n - 1 - i)));
  }

  // ---------- views ----------
  const views = {};

  function statTile(label, value, unit, sub, pct) {
    return `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${value}${unit ? `<small>${esc(unit)}</small>` : ""}</div>${sub ? `<div class="sub">${sub}</div>` : ""}${pct != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${Math.min(100, pct)}%"></i></div>` : ""}</div>`;
  }

  views.today = () => {
    const d = S.data, iso = today();
    const dow = DAYS[new Date(iso + "T12:00:00").getDay()];
    const sess = d.program.week_template?.[dow] || { name: "No plan", type: "rest", blocks: [] };
    const tg = targets(), nut = dayNutrition(iso), r = d.report || {};
    const wkStart = mondayOf(iso);
    const doneWeek = d.workouts.filter((w) => w.date >= wkStart && w.date <= addDays(wkStart, 6));
    const planned = Object.values(d.program.week_template || {}).filter((v) => v.type !== "rest" && !v.optional).length;
    const doneToday = d.workouts.some((w) => w.date.slice(0, 10) === iso);
    const intensity = r.phase_week ? d.program.intensity_by_week?.[String(r.phase_week)] : null;
    const missing = tg.missing_profile_fields?.length;
    return `
      ${!live() ? `<div class="banner">You're looking at <b>made-up demo data</b>. Connect your repo in <a href="#settings">Settings</a> to see yours.</div>` : ""}
      ${S.queue.length ? `<div class="banner">${S.queue.length} entr${S.queue.length > 1 ? "ies" : "y"} waiting to sync. <button class="btn small" data-act="sync">Retry now</button></div>` : ""}
      <div><div class="eyebrow">${esc(new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</div><h1>${esc(sess.name)}</h1>${intensity ? `<p class="muted">${esc(intensity)}</p>` : ""}</div>
      <div class="grid">
        ${statTile("Calories today", Math.round(nut.kcal).toLocaleString(), "kcal", tg.kcal ? `of ${tg.kcal.toLocaleString()} target` : missing ? `<a href="#settings">Add profile for targets</a>` : "", tg.kcal ? (100 * nut.kcal) / tg.kcal : null)}
        ${statTile("Protein today", Math.round(nut.protein_g), "g", tg.protein_g ? `of ${tg.protein_g} g target` : "", tg.protein_g ? (100 * nut.protein_g) / tg.protein_g : null)}
        ${statTile("Weight, 7-day avg", r.weight?.avg7_kg ?? "–", r.weight?.avg7_kg ? "kg" : "", r.weight?.change_kg_per_week != null ? `${r.weight.change_kg_per_week > 0 ? "+" : ""}${r.weight.change_kg_per_week} kg vs last week` : "Log a weigh-in")}
        ${statTile("This week", doneWeek.length, `/ ${planned} sessions`, `${sum(doneWeek.filter((w) => w.type !== "lift"), "duration_min")} min conditioning`, (100 * doneWeek.length) / Math.max(planned, 1))}
      </div>
      <section class="card">
        <div class="card-head"><div class="session-title"><h2>Today's session</h2><span class="pill cap">${esc(sess.type)}</span>${doneToday ? `<span class="pill">${icon.check} Logged</span>` : ""}</div></div>
        ${sess.blocks?.length ? `<ul class="ex-list">${sess.blocks.map((b) => `<li${`${b.sets} × ${b.reps}`.length > 14 ? ' class="stacked"' : ""}><span>${esc(b.exercise)}</span><span class="dose">${esc(b.sets)} × ${esc(b.reps)}</span>${b.note ? `<span class="note">${esc(b.note)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Recovery day. A 20-30 min walk and some mobility work count.</p>`}
        ${d.program.warmup && sess.blocks?.length ? `<p class="small muted" style="margin-top:12px">Warm-up: ${esc(d.program.warmup)}</p>` : ""}
        <div class="session-actions">
          ${sess.blocks?.length ? `<button class="btn primary" data-act="log-session" data-dow="${dow}">Log this session</button>` : ""}
          <button class="btn" data-act="goto-log" data-tab="meal">+ Meal</button>
          <button class="btn" data-act="goto-log" data-tab="body">+ Check-in</button>
        </div>
      </section>
      <section class="card"><div class="card-head"><h2>Coach</h2>${r.flags?.length ? `<span class="small muted">flags updated ${esc(r.as_of || "")}</span>` : ""}</div>
        ${coachUrl(d.profile.coach_project_url)
          ? `<a class="btn coach-btn" href="${esc(coachUrl(d.profile.coach_project_url).replace("https://", "claude://"))}?q=${COACH_MSG}" data-act="coach">${icon.chat}Check in with coach</a>
             <p class="small muted coach-hint">Opens your Workout + Nutrition project in the Claude app with “${COACH_MSG}” copied. Paste it into a new chat and send. <a href="${esc(coachUrl(d.profile.coach_project_url))}?q=${COACH_MSG}" target="_blank" rel="noopener" data-act="coach">Open in the browser instead</a></p>`
          : `<a class="btn coach-btn" href="#settings">${icon.chat}Add your coach link</a>
             <p class="small muted coach-hint">Paste your Workout + Nutrition project link in Settings to start check-ins from here.</p>`}
        ${r.flags?.length ? `<div class="coach-flags">${r.flags.map((f) => `<div class="flag ${f.level === "warn" ? "warn" : "info"}">${f.level === "warn" ? icon.warn : icon.info}<span><span class="sr-only">${f.level}: </span>${esc(f.msg)}</span></div>`).join("")}</div>` : ""}
      </section>
    `;
  };

  // ---- log ----
  function newDraft(dow) {
    const tpl = dow ? S.data.program.week_template?.[dow] : null;
    const exNames = new Set(Object.keys(S.data.exercises));
    const exercises = (tpl?.blocks || []).filter((b) => exNames.has(b.exercise)).map((b) => ({ name: b.exercise, sets: Array.from({ length: +b.sets || 3 }, () => ({ reps: "", load: "", rpe: "" })) }));
    return { date: today(), type: tpl?.type === "conditioning" ? "conditioning" : "lift", session: tpl?.name || "", duration_min: "", notes: "", exercises: exercises.length ? exercises : tpl?.type === "conditioning" ? [] : [{ name: "", sets: [{ reps: "", load: "", rpe: "" }] }] };
  }
  const newMeal = () => ({ date: today(), meal: guessMeal(), items: [], kcal: "", protein_g: "", carbs_g: "", fat_g: "" });
  const guessMeal = () => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 16 ? "lunch" : h < 21 ? "dinner" : "snack"; };

  views.log = () => {
    const tabs = [["workout", "Workout"], ["meal", "Meal"], ["body", "Check-in"], ["test", "Benchmark"]];
    return `<h1>Log</h1>
      <div class="seg" role="group" aria-label="Entry type">${tabs.map(([k, l]) => `<button data-act="log-tab" data-tab="${k}" aria-pressed="${S.logTab === k}">${l}</button>`).join("")}</div>
      <form class="card stack" id="log-form" data-kind="${S.logTab}" novalidate>${({ workout: workoutForm, meal: mealForm, body: bodyForm, test: testForm })[S.logTab]()}</form>`;
  };

  function workoutForm() {
    S.draft ||= newDraft();
    const dr = S.draft, u = loadUnit();
    const names = Object.keys(S.data.exercises).sort();
    return `
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" data-f="date" value="${esc(dr.date)}"></label>
        <label class="field"><span>Type</span><select data-f="type">${options(["lift", "conditioning", "sport"], dr.type)}</select></label>
        <label class="field"><span>Session</span><input data-f="session" value="${esc(dr.session)}" placeholder="Gym A"></label>
        <label class="field"><span>Minutes</span><input type="number" inputmode="numeric" data-f="duration_min" value="${esc(dr.duration_min)}"></label>
      </div>
      <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div>${dr.exercises.map((ex, i) => `
        <div class="ex-block">
          <div style="display:flex;gap:8px;align-items:center;min-width:0">
            <input list="ex-names" data-ex="${i}" data-f="name" value="${esc(ex.name)}" placeholder="Exercise" aria-label="Exercise name">
            <button type="button" class="icon-btn" data-act="rm-ex" data-ex="${i}" aria-label="Remove exercise">${icon.x}</button>
          </div>
          <div class="set-row set-head"><span>#</span><span>Reps</span><span>${u}</span><span>RPE</span><span></span></div>
          ${ex.sets.map((st, j) => `<div class="set-row">
            <span class="muted small">${j + 1}</span>
            <input type="number" inputmode="numeric" data-ex="${i}" data-set="${j}" data-f="reps" value="${esc(st.reps)}" aria-label="Reps set ${j + 1}">
            <input type="number" inputmode="decimal" step="any" data-ex="${i}" data-set="${j}" data-f="load" value="${esc(st.load)}" aria-label="Load set ${j + 1}">
            <input type="number" inputmode="decimal" step="0.5" min="1" max="10" data-ex="${i}" data-set="${j}" data-f="rpe" value="${esc(st.rpe)}" aria-label="RPE set ${j + 1}">
            <button type="button" class="icon-btn" data-act="rm-set" data-ex="${i}" data-set="${j}" aria-label="Remove set">${icon.x}</button>
          </div>`).join("")}
          <button type="button" class="btn small ghost" style="margin-top:8px" data-act="add-set" data-ex="${i}">+ Set (copies last)</button>
        </div>`).join("")}
      </div>
      <button type="button" class="btn" data-act="add-ex">+ Exercise</button>
      <label class="field"><span>Notes</span><textarea data-f="notes" placeholder="How it felt, pain, distance, intervals...">${esc(dr.notes)}</textarea></label>
      <p class="small muted">RPE = effort out of 10 (10 = nothing left, 7 = about 3 reps left). Bodyweight moves: leave load empty.</p>
      <div class="btn-row"><button class="btn primary" type="submit">Save workout</button><button type="button" class="btn ghost" data-act="reset-draft">Clear</button></div>`;
  }

  function photoSection(m) {
    const ph = S.photo;
    return `
      <div class="photo-box">
        ${ph ? `<img class="photo-preview" src="${ph.dataUrl}" alt="Your meal photo">` : ""}
        <div class="photo-actions">
          <label class="btn ${ph ? "" : "primary"} photo-btn">${icon.camera}<span>${ph ? "Retake" : "Take photo"}</span><input type="file" accept="image/*" capture="environment" id="photo-input" class="sr-only photo-input"></label>
          <label class="btn photo-btn">${icon.gallery}<span>${ph ? "Pick another" : "From gallery"}</span><input type="file" accept="image/*" id="gallery-input" class="sr-only photo-input"></label>
        </div>
        ${ph ? `
          <label class="field"><span>Note for the AI (optional)</span><input data-m="note" value="${esc(m.note || "")}" placeholder="e.g. 2 scoops rice, ranch dressing, half eaten"></label>
          <div class="btn-row"><button type="button" class="btn primary" data-act="send-photo">Estimate with AI</button><button type="button" class="btn ghost" data-act="clear-photo">Remove photo</button></div>`
        : `<p class="small muted">Shoot from above with the whole plate in frame. The AI estimates portions and macros in about a minute, and you can edit the result.</p>`}
      </div>
      <div class="divider"><span>or enter it yourself</span></div>`;
  }

  function mealForm() {
    S.meal ||= newMeal();
    const m = S.meal, editing = !!m.editing;
    return `
      ${editing ? `<div class="banner">Editing ${esc(m.meal)} from ${esc(fmtDay(m.date))}${m.editing.source === "photo-ai" ? " (AI estimate)" : ""}</div>` : ""}
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" data-m="date" value="${esc(m.date)}"></label>
        <label class="field"><span>Meal</span><select data-m="meal">${options(["breakfast", "lunch", "dinner", "snack"], m.meal)}</select></label>
      </div>
      ${editing ? "" : photoSection(m)}
      <div><div class="eyebrow" style="margin-bottom:6px">Quick add (estimates)</div>
        <div class="chips">${S.data.foods.map((f, i) => `<button type="button" class="chip" data-act="add-food" data-i="${i}">${esc(f.name)}</button>`).join("")}</div>
      </div>
      ${m.items.length ? `<p class="small"><b>Items:</b> ${esc(m.items.join(", "))} <button type="button" class="btn small ghost" data-act="clear-food">Clear</button></p>` : ""}
      <div class="form-grid">
        ${[["kcal", "Calories"], ["protein_g", "Protein g"], ["carbs_g", "Carbs g"], ["fat_g", "Fat g"]].map(([k, l]) => `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" step="any" data-m="${k}" value="${esc(m[k])}"></label>`).join("")}
        <label class="field full"><span>What else</span><input data-m="extra" value="${esc(m.extra || "")}" placeholder="e.g. stir-fry station, extra chicken"></label>
      </div>
      <p class="small muted">For exact numbers, look the item up in <a href="https://web.uri.edu/dining/whatisnetnutrition" target="_blank" rel="noopener">URI NetNutrition</a> and type them in. Quick-add values are rough averages.</p>
      <div class="btn-row"><button class="btn primary" type="submit">${editing ? "Save changes" : "Save meal"}</button>${editing ? '<button type="button" class="btn ghost" data-act="cancel-edit">Cancel</button>' : ""}</div>`;
  }

  function bodyForm() {
    const last = S.data.body.filter((b) => b.weight_kg).slice(-1)[0];
    const scale = (name, label) => `<div><div class="eyebrow" style="margin-bottom:6px">${label}</div><div class="seg" role="radiogroup" aria-label="${label}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-act="pick" data-name="${name}" data-v="${v}" aria-pressed="false">${v}</button>`).join("")}</div><input type="hidden" name="${name}"></div>`;
    return `
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="date" value="${today()}"></label>
        <label class="field"><span>Weight kg</span><input type="number" inputmode="decimal" step="0.1" name="weight_kg" placeholder="${last ? last.weight_kg : ""}"></label>
        <label class="field"><span>Sleep hours</span><input type="number" inputmode="decimal" step="0.25" name="sleep_h"></label>
        <label class="field"><span>Waist cm</span><input type="number" inputmode="decimal" step="0.5" name="waist_cm" placeholder="Optional"></label>
      </div>
      ${scale("energy", "Energy (1 drained, 5 great)")}
      ${scale("soreness", "Soreness (1 none, 5 very sore)")}
      <label class="field"><span>Notes</span><textarea name="notes" placeholder="Pain anywhere? Stress? Sick?"></textarea></label>
      <p class="small muted">Weigh in most mornings, after the bathroom and before eating. The 7-day average matters, not single days.</p>
      <div class="btn-row"><button class="btn primary" type="submit">Save check-in</button></div>`;
  }

  function testForm() {
    const bms = S.data.program.benchmarks || [];
    return `
      <div class="form-grid">
        <label class="field full"><span>Test</span><select name="test">${bms.map((b) => `<option value="${esc(b.test)}" data-unit="${esc(b.unit)}">${esc(cap(b.test))} (${esc(b.unit)})</option>`).join("")}</select></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${today()}"></label>
        <label class="field"><span>Result</span><input type="number" inputmode="decimal" step="any" name="value" required></label>
      </div>
      <p class="small muted">Retest at the start, in week 6, and at each phase change, under the same conditions (warm-up, surface, time of day).</p>
      <div class="btn-row"><button class="btn primary" type="submit">Save result</button></div>`;
  }

  // ---- progress ----
  views.progress = () => `
    <h1>Progress</h1>
    <section class="card"><div class="card-head"><h2>Bodyweight</h2><span class="small muted">kg</span></div><div id="ch-weight"></div>
      <div class="legend"><span><i style="background:var(--series-1)"></i>7-day average</span><span><i style="background:var(--series-1);opacity:.45;height:8px;width:8px;border-radius:50%"></i>Daily weigh-in</span></div></section>
    <section class="card"><div class="card-head"><h2>Strength</h2><select id="lift-pick" style="width:auto;min-height:36px" aria-label="Lift"></select></div><div id="ch-lift"></div>
      <p class="small muted">Estimated 1-rep max in ${loadUnit()} (Epley formula), from your best set each session.</p></section>
    <div class="grid-2">
      <section class="card"><div class="card-head"><h2>Sessions per week</h2></div><div id="ch-sessions"></div></section>
      <section class="card"><div class="card-head"><h2>Conditioning minutes</h2></div><div id="ch-cond"></div></section>
    </div>
    <section class="card"><div class="card-head"><h2>Hard sets this week</h2><span class="small muted">line = 10-set reference</span></div><div id="muscles"></div></section>
    <section class="card"><div class="card-head"><h2>Benchmarks</h2></div><div id="bench" class="table-wrap"></div></section>`;

  function drawProgress() {
    const d = S.data;
    const w = d.body.filter((b) => b.weight_kg).map((b) => ({ date: b.date.slice(0, 10), y: +b.weight_kg }));
    Charts.line($("#ch-weight"), { label: "Bodyweight", series: [{ name: "Daily", color: "var(--series-1)", points: w, dots: true, line: false }, { name: "7-day avg", color: "var(--series-1)", points: rolling(w) }], yFmt: (v) => v.toFixed(1) });

    const lifts = liftSeries(), names = Object.keys(lifts);
    const pick = $("#lift-pick");
    pick.innerHTML = names.length ? names.map((n) => `<option>${esc(n)}</option>`).join("") : "<option>No key lifts yet</option>";
    const sel = store.get("ritmo.lift", names[0]);
    if (names.includes(sel)) pick.value = sel;
    const drawLift = () => { store.set("ritmo.lift", pick.value); Charts.line($("#ch-lift"), { label: `${pick.value} estimated 1RM`, series: [{ name: "e1RM", color: "var(--series-2)", points: lifts[pick.value] || [], dots: true, dotOpacity: 1 }], yFmt: (v) => `${Math.round(v)} ${loadUnit()}` }); };
    pick.onchange = drawLift; drawLift();

    const wks = weeks(8);
    const inWeek = (wk) => d.workouts.filter((x) => x.date >= wk && x.date <= addDays(wk, 6));
    const planned = Object.values(d.program.week_template || {}).filter((v) => v.type !== "rest" && !v.optional).length;
    Charts.bars($("#ch-sessions"), { label: "Sessions per week", color: "var(--series-1)", target: planned, height: 180, bars: wks.map((wk) => ({ label: Charts.fmtDate(wk), title: `Week of ${Charts.fmtDate(wk)}`, value: inWeek(wk).length })) });
    Charts.bars($("#ch-cond"), { label: "Conditioning minutes per week", color: "var(--series-3)", height: 180, bars: wks.map((wk) => ({ label: Charts.fmtDate(wk), title: `Week of ${Charts.fmtDate(wk)}`, value: sum(inWeek(wk).filter((x) => x.type !== "lift"), "duration_min") })), yFmt: (v) => `${v} min` });

    const ms = d.report?.this_week?.hard_sets_by_muscle || {};
    const entries = Object.entries(ms).sort((a, b) => b[1] - a[1]);
    const max = Math.max(12, ...entries.map((e) => e[1]));
    $("#muscles").innerHTML = entries.length ? entries.map(([m, v]) => `<div class="hbar"><span>${esc(m)}</span><span class="track"><i style="width:${(100 * v) / max}%"></i><b style="left:${(100 * 10) / max}%"></b></span><span class="num">${v}</span></div>`).join("") : '<div class="empty">No sets logged this week (updates after each saved workout)</div>';

    const bm = d.report?.benchmarks || {};
    const rows = Object.entries(bm);
    $("#bench").innerHTML = rows.length ? `<table><thead><tr><th>Test</th><th class="num">First</th><th class="num">Latest</th><th></th></tr></thead><tbody>${rows.map(([n, b]) => `<tr><td>${esc(cap(n))}</td><td class="num">${esc(b.first)} ${esc(b.unit || "")}</td><td class="num">${esc(b.latest)} ${esc(b.unit || "")}</td><td>${b.improved === true ? `<span class="pill">${icon.check} better</span>` : b.improved === false ? '<span class="pill">not yet</span>' : ""}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Log your first benchmarks in Log → Benchmark</div>';
  }

  // ---- food ----
  views.food = () => {
    const iso = today(), n = dayNutrition(iso), tg = targets();
    const cell = (k, label, unit) => `<div><span class="label">${label}</span><b>${Math.round(n[k]).toLocaleString()}</b><span class="small muted">${tg[k] ? `/ ${tg[k].toLocaleString()} ${unit}` : unit}</span></div>`;
    const pend = S.pending;
    const row = (r) => {
      const idx = S.data.nutrition.indexOf(r);
      const ai = r.source === "photo-ai" || r.source === "photo-estimate";
      return `<li>
        <span><b class="cap">${esc(r.meal)}</b>${ai ? ` <span class="pill">AI estimate${r.confidence ? ` · ${esc(r.confidence)}` : ""}${r.edited ? " · edited" : ""}</span>` : ""}<br><span class="muted small">${esc(r.items || "")}</span></span>
        <span class="dose">${Math.round(r.kcal || 0).toLocaleString()} kcal<br><span class="muted small">${Math.round(r.protein_g || 0)}P · ${Math.round(r.carbs_g || 0)}C · ${Math.round(r.fat_g || 0)}F</span></span>
        ${r.ai_comment ? `<span class="note">${esc(r.ai_comment)}</span>` : ""}
        <span class="row-actions"><button class="btn small ghost" data-act="edit-meal" data-idx="${idx}">Edit</button><button class="btn small ghost" data-act="delete-meal" data-idx="${idx}">Delete</button></span>
      </li>`;
    };
    return `<h1>Food</h1>
      <section class="card"><div class="card-head"><h2>Today</h2><button class="btn small" data-act="goto-log" data-tab="meal">${icon.camera} Meal</button></div>
        <div class="totals">${cell("kcal", "Calories", "kcal")}${cell("protein_g", "Protein", "g")}${cell("carbs_g", "Carbs", "g")}${cell("fat_g", "Fat", "g")}</div>
        ${pend.length ? `<div class="stack pending-list">${pend.map((p) => `<div class="pending ${p.error ? "is-error" : ""}">
            ${p.thumb ? `<img src="${p.thumb}" alt="">` : ""}
            <div><b>${esc(cap(p.meal))} photo</b><br><span class="small ${p.error ? "" : "muted"}">${p.error ? `${icon.warn} Couldn't estimate: ${esc(p.error)}` : "Estimating… usually about a minute"}</span></div>
            <button class="icon-btn" data-act="dismiss-pending" data-id="${esc(p.id)}" aria-label="Hide this photo">${icon.x}</button>
          </div>`).join("")}</div>` : ""}
        ${n.rows.length ? `<ul class="ex-list meal-list">${n.rows.map(row).join("")}</ul>` : pend.length ? "" : '<div class="empty">Nothing logged today</div>'}
      </section>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h2>Calories, last 14 days</h2></div><div id="ch-kcal"></div><div class="legend"><span><i class="dash"></i>Target</span></div></section>
        <section class="card"><div class="card-head"><h2>Protein, last 14 days</h2></div><div id="ch-protein"></div><div class="legend"><span><i class="dash"></i>Target</span></div></section>
      </div>
      <section class="card"><h2>Dining hall playbook</h2>
        <ul class="small" style="padding-left:18px;margin:12px 0 0">
          <li>Build every plate around a palm or two of protein first (grill, eggs, Greek yogurt, fish), then add carbs, then vegetables.</li>
          <li>Training days: an extra fist of rice, pasta, potatoes or fruit at the meal before or after the session.</li>
          <li>Keep a protein backup (Greek yogurt, milk, or a whey shake) for days the menu is thin.</li>
          <li>Don't need perfect logs. Log protein and a rough calorie number for most meals; the weekly trend does the rest.</li>
        </ul></section>`;
  };
  function drawFood() {
    const iso = today(), tg = targets();
    const days = Array.from({ length: 14 }, (_, i) => addDays(iso, i - 13));
    const lab = (s) => new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "narrow" });
    Charts.bars($("#ch-kcal"), { label: "Calories per day", color: "var(--series-2)", target: tg.kcal, height: 180, bars: days.map((s) => ({ label: lab(s), title: Charts.fmtDate(s), value: Math.round(dayNutrition(s).kcal) })), yFmt: (v) => `${Math.round(v).toLocaleString()} kcal` });
    Charts.bars($("#ch-protein"), { label: "Protein per day", color: "var(--series-1)", target: tg.protein_g, height: 180, bars: days.map((s) => ({ label: lab(s), title: Charts.fmtDate(s), value: Math.round(dayNutrition(s).protein_g) })), yFmt: (v) => `${Math.round(v)} g` });
  }

  // ---- plan ----
  function md(text) {
    const lines = (text || "").split("\n"); let html = "", inList = false;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/_(.+?)_/g, "<i>$1</i>");
    for (const l of lines) {
      if (/^\s*[-*] /.test(l)) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${inline(l.replace(/^\s*[-*] /, ""))}</li>`; continue; }
      if (inList) { html += "</ul>"; inList = false; }
      const h = l.match(/^(#{1,3}) (.*)/);
      if (h) html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
      else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    return html + (inList ? "</ul>" : "");
  }
  views.plan = () => {
    const p = S.data.program, r = S.data.report || {};
    const dow = DAYS[new Date(today() + "T12:00:00").getDay()];
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return `<div><div class="eyebrow">${esc(phaseName(p.phase || ""))}${r.phase_week ? ` · week ${r.phase_week} of ${p.weeks}` : ""}</div><h1>${esc(p.title || "Plan")}</h1></div>
      ${r.phase_week && p.intensity_by_week?.[r.phase_week] ? `<div class="banner">This week: ${esc(p.intensity_by_week[r.phase_week])}</div>` : ""}
      <section class="card"><h2>The week</h2>
        <ul class="ex-list" style="margin-top:12px">${order.map((k) => { const s = p.week_template?.[k] || {}; return `<li><span><b>${k}</b>${k === dow ? ' <span class="pill">today</span>' : ""}<br>${esc(s.name || "Rest")}</span><span class="dose muted cap">${esc(s.type || "")}</span>${s.blocks?.length ? `<span class="note">${s.blocks.map((b) => esc(b.exercise)).join(" · ")}</span>` : ""}</li>`; }).join("")}</ul>
      </section>
      <section class="card"><div class="card-head"><h2>Weekly report</h2><span class="small muted">${esc((S.data.weekly?.name || "").replace(/\.md$/, ""))}</span></div>
        <div class="md">${S.data.weekly ? md(S.data.weekly.text) : '<div class="empty">The first report appears the Monday after you start logging.</div>'}</div></section>
      <section class="card"><h2>Benchmarks</h2><ul class="ex-list" style="margin-top:12px">${(p.benchmarks || []).map((b) => `<li><span>${esc(b.test)}</span><span class="dose">${esc(b.unit)} · ${esc(b.better)} is better</span>${b.note ? `<span class="note">${esc(b.note)}</span>` : ""}</li>`).join("")}</ul></section>`;
  };

  // ---- settings ----
  views.settings = () => {
    const c = S.cfg, p = S.data?.profile || {};
    return `<h1>Settings</h1>
      <form class="card stack" id="cfg-form">
        <h2>Connect your repo</h2>
        <div class="form-grid">
          <label class="field"><span>GitHub owner</span><input name="owner" value="${esc(c.owner)}" autocomplete="off" autocapitalize="off"></label>
          <label class="field"><span>Repository</span><input name="repo" value="${esc(c.repo)}" autocomplete="off" autocapitalize="off"></label>
          <label class="field"><span>Branch</span><input name="branch" value="${esc(c.branch)}"></label>
          <label class="field"><span>Token</span><input name="token" type="password" value="${esc(c.token)}" autocomplete="off" placeholder="github_pat_..."></label>
        </div>
        <p class="small muted">Use a <b>fine-grained personal access token</b> limited to this one repository with <b>Contents: Read and write</b>. It is stored only in this browser on this device and sent only to api.github.com.</p>
        <div class="btn-row"><button class="btn primary" type="submit">Save and connect</button><button class="btn" type="button" data-act="demo">${c.demo ? "Demo mode is on" : "Switch to demo"}</button></div>
      </form>
      ${S.data ? `<form class="card stack" id="profile-form">
        <h2>Profile</h2>
        <p class="small muted">Used to calculate calorie and protein targets. Saved to data/profile.json in your repo.</p>
        <div class="form-grid">
          <label class="field"><span>Sex</span><select name="sex"><option value="">–</option>${options(["male", "female"], p.sex)}</select></label>
          <label class="field"><span>Birth year</span><input type="number" name="birth_year" value="${esc(p.birth_year || "")}"></label>
          <label class="field"><span>Height cm</span><input type="number" step="0.5" name="height_cm" value="${esc(p.height_cm || "")}"></label>
          <label class="field"><span>Start weight kg</span><input type="number" step="0.1" name="start_weight_kg" value="${esc(p.start_weight_kg || "")}"></label>
          <label class="field"><span>Gym load unit</span><select name="load"><option value="lb" ${loadUnit() === "lb" ? "selected" : ""}>lb</option><option value="kg" ${loadUnit() === "kg" ? "selected" : ""}>kg</option></select></label>
          <label class="field"><span>Phase</span><select name="phase">${options(["phase-1", "phase-2"], p.phase?.current)}</select></label>
          <label class="field full"><span>Phase start date</span><input type="date" name="start_date" value="${esc(p.phase?.start_date || "")}"></label>
          <label class="field full"><span>Coach project link</span><input type="url" name="coach_project_url" value="${esc(p.coach_project_url || "")}" placeholder="https://claude.ai/project/…" autocomplete="off" autocapitalize="off" spellcheck="false"></label>
        </div>
        <p class="small muted">Open your Workout + Nutrition project on claude.ai, copy its address and paste it here. It's saved in your private repo, so every phone gets the Check in button.</p>
        <div class="btn-row"><button class="btn primary" type="submit">Save profile</button></div>
      </form>` : ""}`;
  };

  // ---------- render + events ----------
  const after = { progress: drawProgress, food: drawFood };
  function render() {
    const v = S.view;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.view === v ? "page" : "false"));
    const r = S.data?.report;
    $("#phase-label").textContent = r ? `${phaseName(r.phase)}${r.phase_week ? ` · wk ${r.phase_week}` : ""}${live() ? "" : " · demo"}` : "";
    $("#view").innerHTML = S.data || v === "settings" ? views[v]() : '<div class="empty">Loading…</div>';
    if (S.data) after[v]?.(); // charts need data; skip while loading
  }
  function go(view) { location.hash = view; }
  window.addEventListener("hashchange", () => { S.view = (location.hash.slice(1) || "today"); if (!views[S.view]) S.view = "today"; render(); window.scrollTo(0, 0); });

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("[data-act],[data-view]");
    if (!t) return;
    if (t.dataset.view) return go(t.dataset.view);
    const a = t.dataset.act, i = +t.dataset.ex, j = +t.dataset.set;
    if (a === "log-tab") { S.logTab = t.dataset.tab; render(); }
    if (a === "goto-log") { S.logTab = t.dataset.tab; go("log"); }
    if (a === "log-session") { S.draft = newDraft(t.dataset.dow); S.logTab = "workout"; go("log"); }
    if (a === "add-ex") { S.draft.exercises.push({ name: "", sets: [{ reps: "", load: "", rpe: "" }] }); render(); }
    if (a === "rm-ex") { S.draft.exercises.splice(i, 1); render(); }
    if (a === "add-set") { const sets = S.draft.exercises[i].sets; sets.push({ ...(sets[sets.length - 1] || { reps: "", load: "", rpe: "" }) }); render(); }
    if (a === "rm-set") { S.draft.exercises[i].sets.splice(j, 1); render(); }
    if (a === "reset-draft") { S.draft = newDraft(); render(); }
    if (a === "add-food") {
      const f = S.data.foods[+t.dataset.i];
      for (const k of ["kcal", "protein_g", "carbs_g", "fat_g"]) S.meal[k] = round((+S.meal[k] || 0) + (f[k] || 0), 0.1);
      S.meal.items.push(f.name.replace(/\s*\(.*\)$/, ""));
      render();
    }
    if (a === "clear-food") { S.meal = { ...newMeal(), date: S.meal.date, meal: S.meal.meal }; render(); }
    if (a === "pick") {
      const grp = t.parentElement; grp.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === t));
      t.closest("form").querySelector(`input[name="${t.dataset.name}"]`).value = t.dataset.v;
    }
    if (a === "demo") { S.cfg.demo = !S.cfg.demo; store.set("ritmo.cfg", S.cfg); await boot(); go("today"); }
    if (a === "sync") flushQueue();
    if (a === "coach") { // let the link open; copy the message so it's one paste away
      navigator.clipboard?.writeText(COACH_MSG).then(() => toast(`“${COACH_MSG}” copied. Paste it in the new chat`), () => {});
    }
    if (a === "clear-photo") { S.photo = null; render(); }
    if (a === "send-photo") {
      t.disabled = true; t.textContent = "Sending…";
      try {
        await sendPhoto();
        toast(live() ? "Photo sent. Estimate ready in about a minute" : "Demo: estimating…");
        S.photo = null; S.meal = null; go("food");
      } catch (err) { toast(`Couldn't send the photo: ${err.message}`); t.disabled = false; t.textContent = "Estimate with AI"; }
    }
    if (a === "dismiss-pending") { S.pending = S.pending.filter((p) => p.id !== t.dataset.id); savePending(); render(); }
    if (a === "edit-meal") {
      const r = S.data.nutrition[+t.dataset.idx];
      if (!r) return;
      S.photo = null;
      S.meal = { date: r.date.slice(0, 10), meal: r.meal, items: [], extra: r.items || "", kcal: r.kcal ?? "", protein_g: r.protein_g ?? "", carbs_g: r.carbs_g ?? "", fat_g: r.fat_g ?? "", editing: r };
      S.logTab = "meal"; go("log");
    }
    if (a === "cancel-edit") { S.meal = null; go("food"); }
    if (a === "delete-meal") {
      if (!t.dataset.armed) { // two taps to delete, no pop-up
        t.dataset.armed = "1"; t.textContent = "Tap again to delete";
        setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = "Delete"; } }, 3000);
        return;
      }
      const r = S.data.nutrition[+t.dataset.idx];
      if (!r) return;
      t.disabled = true;
      try {
        if (live() && !S.queue.some((q) => q.obj === r)) await replaceLine(LOGS.meal, r, null, `log: delete ${r.meal} ${r.date}`);
        S.queue = S.queue.filter((q) => q.obj !== r); store.set("ritmo.queue", S.queue);
        S.data.nutrition.splice(S.data.nutrition.indexOf(r), 1);
        toast(live() ? "Deleted" : "Demo mode: deleted here only");
        render();
      } catch (err) { toast(err.message); t.disabled = false; }
    }
  });

  document.addEventListener("change", async (e) => {
    if (!e.target.classList?.contains("photo-input") || !e.target.files?.[0]) return;
    try {
      const dataUrl = await resizeImage(e.target.files[0]);
      S.photo = { dataUrl };
      render();
    } catch (err) { toast(err.message); }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.m && S.meal) S.meal[t.dataset.m] = t.value;
    if (!t.dataset.f || !S.draft || !t.closest("#log-form")) return;
    if (t.dataset.set != null) S.draft.exercises[+t.dataset.ex].sets[+t.dataset.set][t.dataset.f] = t.value;
    else if (t.dataset.ex != null) S.draft.exercises[+t.dataset.ex][t.dataset.f] = t.value;
    else S.draft[t.dataset.f] = t.value;
  });

  document.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector('[type="submit"]');
    if (btn) btn.disabled = true;
    try {
      if (f.id === "cfg-form") {
        const fd = Object.fromEntries(new FormData(f));
        Object.assign(S.cfg, { owner: fd.owner.trim(), repo: fd.repo.trim(), branch: fd.branch.trim() || "main", token: fd.token.trim(), demo: false });
        store.set("ritmo.cfg", S.cfg);
        await boot();
        if (S.data) { toast("Connected"); flushQueue(); go("today"); }
        return;
      }
      if (f.id === "profile-form") {
        const fd = Object.fromEntries(new FormData(f));
        const link = (fd.coach_project_url || "").trim();
        if (link && !coachUrl(link)) { toast("Not a claude.ai project link"); return; }
        const p = structuredClone(S.data.profile);
        if (link) p.coach_project_url = coachUrl(link); else delete p.coach_project_url;
        p.sex = fd.sex || null; p.birth_year = +fd.birth_year || null; p.height_cm = +fd.height_cm || null; p.start_weight_kg = +fd.start_weight_kg || null;
        p.units = { ...(p.units || {}), load: fd.load };
        p.phase = { ...(p.phase || {}), current: fd.phase, start_date: fd.start_date || null };
        S.data.profile = p;
        if (live()) { const cur = await getFile("data/profile.json"); await putFile("data/profile.json", JSON.stringify(p, null, 2) + "\n", cur.sha, "profile: update"); toast("Profile saved. Targets refresh in about a minute"); }
        else toast("Demo mode: not saved");
        return;
      }
      const kind = f.dataset.kind;
      if (kind === "workout") {
        const dr = S.draft;
        const exercises = dr.exercises.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), sets: x.sets.filter((s) => s.reps !== "" || s.load !== "").map((s) => ({ reps: +s.reps || 0, load_kg: s.load === "" ? 0 : round(toKg(+s.load), 0.1), ...(s.rpe !== "" ? { rpe: +s.rpe } : {}) })) })).filter((x) => x.sets.length);
        if (!exercises.length && !dr.duration_min) { toast("Add at least one set or the minutes"); return; }
        const obj = { date: dr.date, type: dr.type, session: dr.session || undefined, duration_min: dr.duration_min ? +dr.duration_min : undefined, exercises: exercises.length ? exercises : undefined, notes: dr.notes || undefined };
        await saveEntry("workout", JSON.parse(JSON.stringify(obj)));
        S.draft = null; go("today");
      } else if (kind === "meal") {
        const m = S.meal;
        if (!m.kcal && !m.protein_g) { toast("Add calories or protein"); return; }
        const items = [...m.items, m.extra].filter(Boolean).join(", ");
        const fields = { date: m.date, meal: m.meal, items: items || undefined, kcal: +m.kcal || 0, protein_g: +m.protein_g || 0, carbs_g: +m.carbs_g || 0, fat_g: +m.fat_g || 0 };
        if (m.editing) {
          const orig = m.editing;
          const next = JSON.parse(JSON.stringify({ ...orig, ...fields, ...(orig.source ? { edited: true } : {}) }));
          const queued = S.queue.find((q) => q.obj === orig);
          if (live() && !queued) await replaceLine(LOGS.meal, orig, next, `log: edit ${next.meal} ${next.date}`);
          if (queued) { queued.obj = next; store.set("ritmo.queue", S.queue); }
          S.data.nutrition[S.data.nutrition.indexOf(orig)] = next;
          toast(live() ? "Meal updated" : "Demo mode: updated here only");
        } else {
          await saveEntry("meal", fields);
        }
        S.meal = null; go("food");
      } else if (kind === "body") {
        const fd = Object.fromEntries(new FormData(f));
        const obj = { date: fd.date };
        for (const k of ["weight_kg", "sleep_h", "waist_cm", "energy", "soreness"]) if (fd[k] !== "" && fd[k] != null) obj[k] = +fd[k];
        if (fd.notes) obj.notes = fd.notes;
        if (Object.keys(obj).length < 2) { toast("Fill in at least one field"); return; }
        await saveEntry("body", obj); go("today");
      } else if (kind === "test") {
        const fd = Object.fromEntries(new FormData(f));
        const unit = f.querySelector('select[name="test"]').selectedOptions[0]?.dataset.unit;
        if (fd.value === "") { toast("Enter a result"); return; }
        await saveEntry("test", { date: fd.date, test: fd.test, value: +fd.value, unit }); go("progress");
      }
    } catch (err) {
      toast(err.message || "Something went wrong");
    } finally { if (btn) btn.disabled = false; }
  });

  // theme
  const applyTheme = (t) => { if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; };
  applyTheme(store.get("ritmo.theme", null));
  $("#theme-btn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark"; applyTheme(next); store.set("ritmo.theme", next); render();
  });
  $("#settings-btn").addEventListener("click", () => go("settings"));
  $("#refresh-btn").addEventListener("click", () => refresh({ manual: true }));
  window.addEventListener("online", flushQueue);

  // Home-screen apps resume without reloading: refresh when the app comes back to the front.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.data && Date.now() - S.loadedAt > 30000) refresh();
  });

  // Pull down from the top of the page to refresh.
  (() => {
    const ptr = $("#ptr");
    let startY = null, dist = 0;
    const reset = () => { startY = null; dist = 0; ptr.style.transform = ""; ptr.classList.remove("ready"); };
    window.addEventListener("touchstart", (e) => { if (window.scrollY <= 0 && !refreshing && e.touches.length === 1) startY = e.touches[0].clientY; }, { passive: true });
    window.addEventListener("touchmove", (e) => {
      if (startY == null) return;
      dist = e.touches[0].clientY - startY;
      if (dist <= 0 || window.scrollY > 0) { reset(); return; }
      const pull = Math.min(dist * 0.5, 80);
      ptr.style.transform = `translate(-50%, ${pull}px)`;
      ptr.classList.toggle("ready", pull >= 60);
    }, { passive: true });
    window.addEventListener("touchend", () => {
      if (startY != null && ptr.classList.contains("ready")) refresh({ manual: true });
      reset();
    });
  })();
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => S.data && after[S.view]?.(), 200); });

  async function boot() {
    S.data = null; render();
    try { await loadAll(); }
    catch (err) { S.data = null; toast(`Couldn't load data: ${err.message}. Check owner, repo and token.`, 5000); S.view = "settings"; }
    render();
    schedulePoll();
  }

  S.view = (location.hash.slice(1) || "today"); if (!views[S.view]) S.view = "today";
  boot();
})();
