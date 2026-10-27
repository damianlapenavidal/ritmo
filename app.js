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
  // rounds to a step without float noise (30 lb -> 13.6 kg, not 13.600000000000001)
  const round = (v, step = 1) => { const r = Math.round(v / step) * step, d = (String(step).split(".")[1] || "").length; return d ? +r.toFixed(d) : r; };
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
  icon.swap = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/></svg>';
  icon.back = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 5l-7 7 7 7"/></svg>';
  icon.search = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
  icon.target = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/></svg>';
  icon.play = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M10 8.5v7l6-3.5z" fill="currentColor"/></svg>';
  icon.link = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  icon.box = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/></svg>';
  icon.up = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  icon.down = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  icon.sort = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true"><path d="M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4"/></svg>';
  icon.chevron = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';
  // The coach is a Claude Project; the app can only open it. Weekly check-ins run as a scheduled task, so this is for questions.
  // claude.ai/project/* isn't a universal link (it opens Safari), so the button uses the claude:// scheme to reach the iPhone app.
  // Ask coach opens a new Claude cloud session with both repos (live data, can change the plan) in the "Quick" environment
  // (Haiku), per claude.ai/code's pre-fill parameters. Damian's choice: every new coach chat is one of these.
  const COACH_ENV = "Quick";
  const coachSessionUrl = () => {
    const owner = S.cfg?.owner || "damianlapenavidal", repo = S.cfg?.repo || "fitness-coach";
    return `https://claude.ai/code?${new URLSearchParams({ repositories: `${owner}/${repo},${owner}/ritmo`, environment: COACH_ENV })}`;
  };
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
    sheet: [], // bottom-sheet stack: exercise details, exercise picker, program preview
    lib: null, // exercise library (library/exercises.json), loaded on first use
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

  // Write several files as ONE commit (Git Data API, same Contents permission), so a plan switch never lands half-done.
  async function commitFiles(files, message) {
    const git = `https://api.github.com/repos/${encodeURIComponent(S.cfg.owner)}/${encodeURIComponent(S.cfg.repo)}/git`;
    const call = async (url, method = "GET", body) => {
      const r = await fetch(url, { method, headers: { ...headers("application/vnd.github+json"), ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
      if (!r.ok) { const e = new Error(`GitHub ${r.status}`); e.status = r.status; throw e; }
      return r.json();
    };
    const branch = encodeURIComponent(S.cfg.branch);
    for (let attempt = 0; attempt < 3; attempt++) {
      const head = (await call(`${git}/ref/heads/${branch}`)).object.sha;
      const base = (await call(`${git}/commits/${head}`)).tree.sha;
      const tree = await call(`${git}/trees`, "POST", { base_tree: base, tree: files.map((f) => ({ path: f.path, mode: "100644", type: "blob", content: f.text })) });
      const commit = await call(`${git}/commits`, "POST", { message, tree: tree.sha, parents: [head] });
      try { return await call(`${git}/refs/heads/${branch}`, "PATCH", { sha: commit.sha }); }
      catch (e) { if (e.status !== 422 && e.status !== 409) throw e; } // someone pushed in between: rebuild on the new head
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
    const [profile, program, exercises, w, n, b, t, report, weekly, programs, st] = await Promise.all([
      readJSON("data/profile.json", {}), readJSON("data/program.json", {}), readJSON("data/exercises.json", {}),
      readText("logs/workouts.jsonl"), readText("logs/nutrition.jsonl"), readText("logs/body.jsonl"), readText("logs/tests.jsonl"),
      readJSON("reports/latest.json", null), latestWeekly(), readJSON("data/programs/index.json", null).catch(() => null),
      readText("logs/steps.jsonl").catch(() => null),
    ]);
    delete exercises._note;
    // Phone steps (iPhone Shortcut → Action). A day can sync more than once: the last line for a date wins.
    const steps = {};
    for (const r of parseJsonl(st)) if (r.date && Number.isFinite(+r.steps)) steps[String(r.date).slice(0, 10)] = +r.steps;
    S.data = { profile, program, exercises, workouts: parseJsonl(w), nutrition: parseJsonl(n), body: parseJsonl(b), tests: parseJsonl(t), report, weekly, programs, steps };
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
      const hit = S.data.nutrition.find((r) => r.photo_id === p.id || r.request_id === p.id);
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

  // A meal for the AI estimate: a photo, or (no photo) a typed description. Both go to inbox/meals/ in the private repo.
  async function sendPhoto() {
    const m = S.meal, ph = S.photo;
    const text = !ph ? (m.description || "").trim() : "";
    if (!ph && text.length < 3) throw new Error("Write what you ate");
    const place = !m.location ? (m.place || "").trim() : "";
    const id = `${m.date}-${Date.now().toString(36)}`;
    const thumb = ph ? await (async () => { try { const r = await fetch(ph.dataUrl); return await resizeImage(await r.blob(), 160, 0.7); } catch { return null; } })() : null;
    const entry = { id, date: m.date, meal: m.meal, note: (m.note || "").trim(), location: m.location || undefined, place: place || undefined, text: text || undefined, thumb, at: Date.now() };
    if (!live()) {
      S.pending.push(entry); savePending();
      setTimeout(() => {
        S.data.nutrition.push({ date: m.date, meal: m.meal, items: "grilled chicken (1 breast), rice (1 cup), salad (1 bowl)", kcal: 520, protein_g: 48, carbs_g: 55, fat_g: 11, source: text ? "text-ai" : "photo-ai", request_id: id, confidence: "medium", ai_comment: "Demo estimate: connect your repo for real ones.", ...(entry.location ? { location: entry.location } : {}), ...(place ? { place } : {}) });
        const done = resolvePending();
        if (done.length) toast(`Demo: meal estimated, ${done[0].kcal} kcal`);
        if (!["log", "settings"].includes(S.view)) render();
      }, 2500);
      return;
    }
    const payload = { id, date: m.date, meal: m.meal, ...(entry.location ? { location: entry.location } : {}), ...(place ? { place } : {}),
      ...(ph ? { note: entry.note, media_type: "image/jpeg", image_b64: ph.dataUrl.split(",")[1] } : { description: text }), uploaded_at: new Date().toISOString() };
    await putFile(`inbox/meals/${id}.json`, JSON.stringify(payload), null, `${ph ? "photo" : "meal"}: ${m.meal} ${m.date}`);
    S.pending.push(entry); savePending();
    schedulePoll();
  }

  // ---------- refresh (pull down or reopen the app) ----------
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

  // ---------- exercise library + progression ----------
  const GROUPS = ["chest", "back", "shoulders", "arms", "quads", "hamstrings", "glutes", "calves", "adductors", "core"];
  let libPromise = null;
  // library/exercises.json ships with the app (Free Exercise DB, public domain; see library/README.md). ~160 KB gzipped.
  function ensureLibrary() {
    if (S.lib) return Promise.resolve(S.lib);
    libPromise ||= fetch("library/exercises.json").then((r) => { if (!r.ok) throw new Error(`library ${r.status}`); return r.json(); }).then((doc) => {
      doc.byId = new Map(doc.exercises.map((e) => [e.id, e]));
      doc.byName = new Map(doc.exercises.map((e) => [e.name.toLowerCase(), e]));
      return (S.lib = doc);
    }).catch((e) => { libPromise = null; throw e; });
    return libPromise;
  }
  const libEntry = (ref, name) => (ref && S.lib?.byId.get(ref)) || (name && S.lib?.byName.get(String(name).toLowerCase())) || null;
  const imgUrl = (path) => (S.lib ? S.lib.image_base + String(path).split("/").map(encodeURIComponent).join("/") : "");
  // Coach metadata (data/exercises.json); for a library pick, a best guess from the library entry.
  function exInfo(name, ref) {
    const mine = S.data.exercises[name];
    if (mine) return mine;
    const lib = libEntry(ref, name);
    if (!lib) return { muscles: [], step_lb: 5, alternatives: [], cues: [] };
    const lower = lib.groups.some((g) => ["quads", "hamstrings", "glutes"].includes(g));
    const load = ({ barbell: "bar", "e-z curl bar": "bar", kettlebells: "one", cable: "stack", machine: "stack", "medicine ball": "ball", "body only": "none" })[lib.equipment];
    return { muscles: lib.groups, ref: lib.id, step_lb: lib.equipment === "body only" ? 0 : lib.equipment === "barbell" && lower ? 10 : 5, per_hand: lib.equipment === "dumbbell", load, alternatives: [], cues: [] };
  }
  // What number goes in the weight box (exercises.json `load`): head = the column label, hint = one plain line.
  function loadRule(info) {
    const u = loadUnit(), kg = u === "kg";
    const kind = info?.load || (info?.per_hand ? "each" : "");
    return ({
      bar: { head: `${u} total`, hint: `Weight: bar + plates. An empty bar is ${kg ? "20 kg" : "45 lb"}.` },
      each: { head: `${u} each`, hint: `Weight: one dumbbell. Two ${kg ? "12 kg" : "30 lb"} dumbbells = ${kg ? "12" : "30"}.` },
      one: { head: u, hint: "Weight: the one dumbbell or kettlebell you hold." },
      stack: { head: u, hint: "Weight: the number on the stack." },
      stack_each: { head: `${u} each`, hint: "Weight: one side's stack." },
      plates: { head: u, hint: "Weight: only the plates you add, not the machine." },
      assist: { head: `${u} help`, hint: "Weight: the machine's help. Less help = harder." },
      held: { head: u, hint: "Weight: the plate or dumbbell you hold or rest on your hips. Blank = none." },
      ball: { head: u, hint: "Weight: the ball." },
      none: { head: "", hint: "", none: true },
    })[kind] || { head: u, hint: "" };
  }
  // Phase week from the profile's start date (same rule as analyze.py), so it's right even before the report refreshes.
  function phaseWeek() {
    const start = S.data.profile?.phase?.start_date;
    if (!start) return S.data.report?.phase_week || null;
    return Math.floor(Math.round((new Date(today() + "T12:00:00") - new Date(start + "T12:00:00")) / 864e5) / 7) + 1;
  }
  function weekCtx() {
    const p = S.data.program, wk = phaseWeek(), rpes = p.rpe_by_week || {};
    const keys = Object.keys(rpes).map(Number).sort((a, b) => a - b);
    const k = keys.filter((x) => wk && x <= wk).pop() ?? keys[0];
    return { week: wk, targetRpe: k != null ? +rpes[String(k)] : 7, deload: !!wk && (p.deload_weeks || []).includes(wk) };
  }
  function planReps(name) {
    for (const day of Object.values(S.data.program.week_template || {})) for (const b of day.blocks || []) if (b.exercise === name) return b.reps;
    return null;
  }
  // Your own notes on an exercise from the log (exercise `notes`), newest first: [{date, text}]
  function exNotes(name, n = 5) {
    const out = [];
    for (const w of S.data.workouts || []) for (const ex of w.exercises || []) if (ex.name === name && String(ex.notes || "").trim()) out.push({ date: String(w.date).slice(0, 10), text: String(ex.notes).trim() });
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, n);
  }
  // the plan's one-line note for an exercise ("Lower slowly, 3 seconds"): today's session first, then any day
  function planNote(name) {
    const wt = S.data.program.week_template || {};
    for (const day of [wt[dowOf(today())], ...Object.values(wt)]) for (const b of day?.blocks || []) if (b.exercise === name && b.note) return b.note;
    return "";
  }
  function suggestFor(name, reps, ref) {
    if (!window.Progression || !name) return null;
    const ctx = weekCtx();
    return Progression.suggest({ name, reps: reps ?? planReps(name) ?? "8-12", info: exInfo(name, ref), workouts: S.data.workouts, targetRpe: ctx.targetRpe, deload: ctx.deload, unit: loadUnit() });
  }

  // ---------- views ----------
  const views = {};

  function statTile(label, value, unit, sub, pct) {
    return `<div class="card stat"><div class="label">${esc(label)}</div><div class="value">${value}${unit ? `<small>${esc(unit)}</small>` : ""}</div>${sub ? `<div class="sub">${sub}</div>` : ""}${pct != null ? `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${Math.min(100, pct)}%"></i></div>` : ""}</div>`;
  }

  // "Gym A - Strength + power" -> ["Gym A", "Strength + power"]
  const splitName = (name) => { const [a, ...b] = String(name || "").split(" - "); return [a, b.join(" - ")]; };
  const dowOf = (iso) => DAYS[new Date(iso + "T12:00:00").getDay()];
  const fmtClock = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`; };

  // One planned block, kept short: name, sets × reps, today's weight. Everything else is one tap away.
  function sessionRow(b, k, dow) {
    const known = !!S.data.exercises[b.exercise];
    const sg = known ? suggestFor(b.exercise, b.reps) : null;
    const load = sg?.load != null && sg.kind !== "first" ? `<span class="load">${esc(sg.short)}</span>` : "";
    const act = known ? `data-act="ex-info" data-name="${esc(b.exercise)}"` : `data-act="drill-info" data-dow="${dow}" data-k="${k}"`;
    return `<li><button type="button" class="row-link" ${act}><span class="row-name">${esc(b.exercise)}</span><span class="dose">${esc(b.sets)} × ${esc(b.reps)}${load}</span></button></li>`;
  }
  // A session in the order it's done, split into parts so the shape is clear: jumps and sprints first (fresh),
  // then the main lifts, then the small extras, then cardio. Only contiguous runs are grouped; the order never changes.
  const GROUPS_ORDER = { power: "Jumps + speed", strength: "Strength", extras: "Extras", cardio: "Cardio" };
  function blockGroup(name) {
    const info = S.data.exercises[name];
    if (!info) { const k = drillKind(name); return k === "sprints" || k === "agility" ? "power" : k === "other" ? "strength" : "cardio"; }
    return info.pattern === "plyo" ? "power" : ["isolation", "core"].includes(info.pattern) ? "extras" : "strength";
  }
  function groupBlocks(blocks) {
    const out = [], keys = (blocks || []).map((b) => blockGroup(b.exercise));
    // a small move between main lifts (Lateral Raise before Hip Thrust) stays in Strength; Extras are the tail
    const lastStrength = keys.lastIndexOf("strength");
    keys.forEach((g, k) => { if (g === "extras" && k < lastStrength) keys[k] = "strength"; });
    (blocks || []).forEach((b, k) => {
      const g = keys[k], last = out[out.length - 1];
      if (last && last.key === g) last.items.push({ b, k }); else out.push({ key: g, items: [{ b, k }] });
    });
    // "Finisher" only after lifting; on a run day (jumps, then intervals) the cardio is the main part
    for (const g of out) g.label = g.key === "cardio" && out.some((x) => x.key === "strength") && g === out[out.length - 1] ? "Finisher" : GROUPS_ORDER[g.key];
    return out;
  }
  const groupHead = (label) => `<li class="grp"><span class="eyebrow">${esc(label)}</span></li>`;
  function sessionList(sess, dow, withWarmup = true) {
    const groups = groupBlocks(sess.blocks), heads = groups.length > 1;
    return `<ul class="ex-list tap-list${heads ? " grouped" : ""}">
      ${withWarmup && sess.blocks?.length && S.data.program.warmup ? `<li><button type="button" class="row-link" data-act="warmup-info" data-gym="${sess.type === "lift" ? 1 : 0}"><span class="row-name">Warm-up</span><span class="dose muted">${routineMin(S.data.program.warmup)} min</span></button></li>` : ""}
      ${groups.map((g) => (heads ? groupHead(g.label) : "") + g.items.map(({ b, k }) => sessionRow(b, k, dow)).join("")).join("")}
      ${withWarmup && sess.blocks?.length && S.data.program.cooldown ? `${heads ? groupHead("After") : ""}<li><button type="button" class="row-link" data-act="cooldown-info"><span class="row-name">Cool-down</span><span class="dose muted">${routineMin(S.data.program.cooldown)} min</span></button></li>` : ""}</ul>`;
  }
  // Banner for a workout that's been started or partly logged (it's saved on the phone).
  function draftBanner() {
    const dr = S.draft, p = draftProgress(dr);
    if (!dr || (!p && !dr.startedAt)) return "";
    const label = dr.editing ? `Editing ${esc(fmtDay(dr.date))}` : esc(splitName(dr.session)[0] || "Workout");
    return `<button type="button" class="resume" data-act="goto-log" data-tab="workout">
      ${dr.startedAt && !dr.editing ? `<span class="clock" data-timer="${dr.startedAt}">${fmtClock(Date.now() - dr.startedAt)}</span>` : icon.target}
      <span><b>${label} in progress</b><br><span class="small">${esc(p?.text || "started")}${dr.date !== today() && !dr.editing ? ` · from ${esc(fmtDay(dr.date))}` : ""}</span></span>${icon.chevron}</button>`;
  }

  // Today stays short: one line about the session; the full list lives in Plan → that day (the same sheet opens from here).
  function todaySummary(sess, dow) {
    const n = sess.blocks.length, mins = sess.type === "lift" ? S.data.profile?.schedule?.session_minutes || 60 : null;
    return `<ul class="ex-list tap-list"><li><button type="button" class="row-link" data-act="day-info" data-dow="${esc(dow)}">
      <span class="row-name">${n} exercise${n === 1 ? "" : "s"}${mins ? ` · about ${mins} min` : ""}</span><span class="dose muted">See the plan</span></button></li></ul>`;
  }
  views.today = () => {
    const d = S.data, iso = today();
    const dow = dowOf(iso);
    const sess = d.program.week_template?.[dow] || { name: "Rest", type: "rest", blocks: [] };
    const [title, sub] = splitName(sess.name);
    const tg = targets(), nut = dayNutrition(iso), r = d.report || {};
    const wkStart = mondayOf(iso);
    const doneWeek = d.workouts.filter((w) => w.date >= wkStart && w.date <= addDays(wkStart, 6));
    const planned = Object.values(d.program.week_template || {}).filter((v) => v.type !== "rest" && !v.optional).length;
    const todayIdx = d.workouts.map((w, i) => [w, i]).filter(([w]) => w.date.slice(0, 10) === iso).map(([, i]) => i).pop();
    const wk = phaseWeek(), effort = wk > 0 ? weekCtx().targetRpe : null;
    const missing = tg.missing_profile_fields?.length;
    const inProgress = !!(S.draft && (draftProgress(S.draft) || S.draft.startedAt));
    const train = sess.blocks?.length;
    return `
      ${!live() ? `<div class="banner">You're looking at <b>made-up demo data</b>. Connect your repo in <a href="#settings">Settings</a> to see yours.</div>` : ""}
      ${S.queue.length ? `<div class="banner">${S.queue.length} entr${S.queue.length > 1 ? "ies" : "y"} waiting to sync. <button class="btn small" data-act="sync">Retry now</button></div>` : ""}
      ${draftBanner()}
      <div><div class="eyebrow">${esc(new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</div>
        <h1>${esc(train ? title : sess.name)}</h1>
        ${train ? `<p class="subline">${esc(sub)}${effort ? `${sub ? " · " : ""}<button type="button" class="link-btn" data-act="effort-info">effort ${esc(effort)}/10</button>` : ""}</p>` : ""}</div>
      <section class="card">
        ${train ? todaySummary(sess, dow) : `<p class="muted" style="margin:0">${/busy/i.test(sess.name) ? "Busy day: nothing planned." : "Rest day."} A walk always counts.</p>`}
        <div class="session-actions">
          ${inProgress ? `<button class="btn primary" data-act="goto-log" data-tab="workout">Continue workout</button>`
            : todayIdx != null ? `<button class="btn primary" data-act="edit-workout" data-idx="${todayIdx}">${icon.check} Logged · Edit</button>`
            : train ? `<button class="btn primary" data-act="start-workout" data-dow="${dow}">Start workout</button>`
            : `<button class="btn primary" data-act="log-choice" data-choice="walk">Log a walk</button>`}
          <button class="btn" data-act="goto-log" data-tab="meal">+ Meal</button>
          <button class="btn" data-act="goto-log" data-tab="body">+ Morning check</button>
        </div>
      </section>
      <div class="grid">
        ${statTile("Calories today", Math.round(nut.kcal).toLocaleString(), "kcal", tg.kcal ? `of ${tg.kcal.toLocaleString()}` : missing ? `<a href="#settings">Add profile for targets</a>` : "", tg.kcal ? (100 * nut.kcal) / tg.kcal : null)}
        ${statTile("Protein today", Math.round(nut.protein_g), "g", tg.protein_g ? `of ${tg.protein_g} g` : "", tg.protein_g ? (100 * nut.protein_g) / tg.protein_g : null)}
        ${statTile("Weight, 7-day avg", r.weight?.avg7_kg ?? "–", r.weight?.avg7_kg ? "kg" : "", r.weight?.change_kg_per_week != null ? `${r.weight.change_kg_per_week > 0 ? "+" : ""}${r.weight.change_kg_per_week} kg vs last week` : "Log your weight")}
        ${statTile("This week", doneWeek.length, `/ ${planned} sessions`, "", (100 * doneWeek.length) / Math.max(planned, 1))}
      </div>
      <section class="card"><div class="card-head"><h2>Coach</h2></div>
        <a class="btn coach-btn" href="${esc(coachSessionUrl())}" target="_blank" rel="noopener">${icon.chat}Ask coach</a>
        <p class="small muted coach-hint">Opens a new coach session with your latest data.</p>
      </section>
    `;
  };

  // ---- log ----
  // The workout being logged (S.draft) is saved on this device after every change, so a reload mid-workout loses nothing.
  // Shape: {v, date, type, session, tplName, duration_min, rpe, notes, exercises[], drills[], sport{}, editing?}
  const DRAFT_V = 2;
  const saveDraft = () => store.set("ritmo.draft", S.draft || null);
  S.draft = (() => { const d = store.get("ritmo.draft", null); return d && d.v === DRAFT_V ? d : null; })();
  // What has actually been done in a draft: sets ticked or typed, drills done or filled, minutes, notes.
  function draftProgress(dr) {
    if (!dr) return null;
    const sets = (dr.exercises || []).reduce((n, ex) => n + ex.sets.filter((s) => s.done || s.reps !== "" || s.rpe !== "" || (s.load !== "" && !s.auto)).length, 0);
    const drills = (dr.drills || []).filter(drillTouched).length;
    const exNoted = (dr.exercises || []).some((ex) => String(ex.note || "").trim());
    if (!sets && !drills && !exNoted && !dr.duration_min && !dr.notes && !dr.rpe && !dr.editing) return null;
    return { sets, drills, text: [sets ? `${sets} set${sets > 1 ? "s" : ""} done` : "", drills ? `${drills} drill${drills > 1 ? "s" : ""}` : ""].filter(Boolean).join(", ") || "started" };
  }
  // Set column: reps, seconds (holds like "30s/side") or meters (carries like "30 m").
  const setUnit = (planned) => (/\d\s*(s|sec)\b/i.test(planned || "") ? "sec" : /\d\s*m\b/i.test(planned || "") ? "m" : "reps");
  const planNums = (txt) => { const m = String(txt || "").match(/(\d+)\s*(?:[-–]\s*(\d+))?/); return m ? { lo: +m[1], hi: +(m[2] || m[1]) } : null; };
  // Display a stored kg load in the gym unit, rounded the way plates and dumbbells go (88.5 kg -> 195 lb, not 195.1).
  const fmtLoad = (kg) => (kg ? String(loadUnit() === "lb" ? round(kg * LB, 0.5) : round(kg, 0.1)) : "");
  const distUnit = () => (S.data?.profile?.units?.distance === "mi" ? "mi" : "km");
  const fmtDist = (m) => (m ? String(round(m / (distUnit() === "mi" ? 1609.344 : 1000), 0.01)) : "");
  const toMeters = (v) => Math.round(+v * (distUnit() === "mi" ? 1609.344 : 1000));
  const fmtSec = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
  const drillPace = (b) => {
    const min = +b.minutes || 0, dist = +b.distance || 0;
    if (!min || !dist) return "–";
    return b.mode === "bike" ? `${round((dist / min) * 60, 0.1)} ${distUnit()}/h` : `${fmtSec((min * 60) / dist)} /${distUnit()}`;
  };

  // Sets prefilled with today's suggested load ("auto" until you confirm or type over it); reps stay empty with the target as placeholder.
  function makeSets(n, name, reps, ref) {
    const sg = suggestFor(name, reps, ref);
    return Array.from({ length: Math.max(1, n) }, () => ({ reps: "", load: sg?.load ?? "", rpe: "", auto: sg?.load != null, done: false }));
  }

  // Conditioning drills from plan blocks that aren't gym exercises ("Intervals", "Sprint accelerations", ...).
  const DRILL_KINDS = { intervals: "Intervals", sprints: "Sprints", agility: "Agility", steady: "Steady run or ride", other: "Other" };
  const DRILL_HINTS = { intervals: "Work and rest rounds: track, bike or rower", sprints: "Short accelerations with full recovery", agility: "Shuttles, cone drills, cuts", steady: "Tempo run, easy run, bike or rower", other: "Anything else: jump rope, swim, stairs" };
  const MODES = [["walk", "Walk"], ["run", "Run"], ["bike", "Bike"], ["row", "Row"], ["other", "Other"]];
  const FORMATS = [["pickup", "Pickup"], ["small_sided", "Small-sided"], ["match", "Match"], ["practice", "Practice"]];
  const drillKind = (name) => { const n = String(name).toLowerCase(); return /interval/.test(n) ? "intervals" : /sprint|acceleration/.test(n) ? "sprints" : /agility|shuttle|cone/.test(n) ? "agility" : /run|tempo|jog|bike|ride|row|swim/.test(n) ? "steady" : "other"; };
  function newDrill(kind, block) {
    const txt = String(block?.reps || ""), plan = block ? { text: `${block.sets} × ${block.reps}`, note: block.note } : {};
    if (kind === "intervals") { const t = [...txt.matchAll(/(\d+(?:\.\d+)?)\s*(min|s)\b/gi)].map((m) => (m[2].toLowerCase() === "min" ? +m[1] * 60 : +m[1])); Object.assign(plan, { rounds: +block?.sets || null, work_s: t[0] ?? null, rest_s: t[1] ?? null }); }
    if (kind === "sprints") { const m = txt.match(/(\d+)\s*m\b/); Object.assign(plan, { reps: +block?.sets || null, distance_m: m ? +m[1] : null }); }
    if (kind === "agility") plan.reps = +block?.sets || null;
    if (kind === "steady") { const m = txt.match(/(\d+)(?:\s*[-–]\s*\d+)?\s*min/); plan.minutes = m ? +m[1] : null; }
    if (kind === "other") plan.rounds = +block?.sets || null;
    const name = !block ? (kind === "steady" ? "Run" : DRILL_KINDS[kind]) : kind === "agility" ? txt.replace(/\s*at\s*~?\d+%.*$/i, "").trim() || block.exercise : block.exercise;
    const how = `${txt} ${block?.note || ""}`, mode = /bike|cycl/i.test(how) ? "bike" : /row/i.test(how) ? "row" : /walk/i.test(how) ? "walk" : "run";
    return { kind, name, planned: !!block, plan, mode: ["intervals", "steady"].includes(kind) ? mode : "", rounds: "", work_s: "", rest_s: "", reps: "", distance: "", minutes: "", done: false };
  }
  const drillTouched = (b) => b.done || ["rounds", "work_s", "rest_s", "reps", "distance", "minutes"].some((k) => b[k] !== "" && b[k] != null);
  // "6 × 1:00/1:00 run", "6 × 20 m", "4 × 5-10-5 shuttle", "25 min · 4.2 km"
  function drillText(b) {
    if (b.kind === "intervals") return `${b.rounds || "?"} × ${b.work_s ? fmtSec(b.work_s) : "?"}${b.rest_s != null ? `/${fmtSec(b.rest_s)}` : ""}${b.mode ? ` ${b.mode}` : ""}`;
    if (b.kind === "sprints") return `${b.reps || "?"} × ${b.distance_m || "?"} m sprints`;
    if (b.kind === "agility") return `${b.reps || "?"} × ${b.name}`;
    if (b.kind === "steady") return [`${b.name}${b.duration_min ? ` ${b.duration_min} min` : ""}`, b.distance_m ? `${fmtDist(b.distance_m)} ${distUnit()}` : ""].filter(Boolean).join(" · ");
    return [b.name, b.rounds ? `${b.rounds} rounds` : "", b.duration_min ? `${b.duration_min} min` : ""].filter(Boolean).join(" · ");
  }
  function lastDrill(kind, name) {
    for (let i = S.data.workouts.length - 1; i >= 0; i--) {
      const hit = (S.data.workouts[i].conditioning || []).find((b) => b.kind === kind && (!["agility", "other"].includes(kind) || b.name === name));
      if (hit) return { date: S.data.workouts[i].date.slice(0, 10), text: drillText(hit) };
    }
    return null;
  }
  // Done as planned: fill whatever is still empty from the plan.
  function fillDrill(b) {
    const p = b.plan || {}, fill = (k, v) => { if ((b[k] === "" || b[k] == null) && v != null) b[k] = String(v); };
    if (b.kind === "intervals") { fill("rounds", p.rounds); fill("work_s", p.work_s); fill("rest_s", p.rest_s); }
    if (b.kind === "sprints") { fill("reps", p.reps); fill("distance", p.distance_m); }
    if (b.kind === "agility") fill("reps", p.reps);
    if (b.kind === "steady") fill("minutes", p.minutes);
    if (b.kind === "other") fill("rounds", p.rounds);
  }
  function estMinutes(dr) {
    let m = 0;
    for (const b of (dr.drills || []).filter(drillTouched)) {
      if (b.kind === "intervals") m += ((+b.rounds || 0) * ((+b.work_s || 0) + (+b.rest_s || 0))) / 60;
      if (b.kind === "sprints") m += (+b.reps || 0) * 1.5; // sprint + walk back
      if (b.kind === "agility") m += (+b.reps || 0) * 1;
      if (["steady", "other"].includes(b.kind)) m += +b.minutes || 0;
    }
    return Math.round(m);
  }

  function newDraft(dow) {
    const tpl = dow ? S.data.program.week_template?.[dow] : null;
    const exNames = new Set(Object.keys(S.data.exercises));
    const blocks = tpl?.blocks || [];
    const exercises = blocks.filter((b) => exNames.has(b.exercise)).map((b) => ({ name: b.exercise, planned: true, planReps: b.reps, planSets: +b.sets || 3, unit: setUnit(b.reps), sets: makeSets(+b.sets || 3, b.exercise, b.reps) }));
    const drills = blocks.filter((b) => !exNames.has(b.exercise)).map((b) => newDrill(drillKind(b.exercise), b));
    return { v: DRAFT_V, date: today(), type: tpl?.type === "conditioning" ? "conditioning" : "lift", session: tpl?.name || "", tplName: tpl?.name || "", duration_min: "", rpe: "", notes: "", exercises, drills, sport: { name: "Soccer", format: "pickup", distance: "" } };
  }
  // A logged workout back into the form (Edit). Loads keep their exact stored kg unless you change them.
  function draftFromLog(w) {
    const unitOf = (ex) => ((ex.sets || []).some((s) => s.duration_s) ? "sec" : (ex.sets || []).some((s) => s.distance_m) ? "m" : "reps");
    const val = (v) => (v == null ? "" : String(v));
    return {
      v: DRAFT_V, date: w.date.slice(0, 10), type: w.type || "lift", session: w.session || "", tplName: "", duration_min: val(w.duration_min), rpe: val(w.rpe), notes: w.notes || "",
      exercises: (w.exercises || []).map((ex) => {
        const unit = unitOf(ex);
        return { name: ex.name, ref: ex.ref, muscles: ex.muscles, swappedFrom: ex.swapped_from, planReps: planReps(ex.name), unit, note: ex.notes || "",
          sets: (ex.sets || []).map((s) => { const shown = fmtLoad(s.load_kg); return { reps: val(unit === "sec" ? s.duration_s : unit === "m" ? s.distance_m : s.reps), load: shown, shown, kg: s.load_kg || 0, rpe: val(s.rpe), auto: false, done: true }; }) };
      }),
      drills: (w.conditioning || []).map((b) => ({ kind: b.kind, name: b.name, planned: false, plan: {}, mode: b.mode || "", rounds: val(b.rounds), work_s: val(b.work_s), rest_s: val(b.rest_s), reps: val(b.reps),
        distance: b.distance_m == null ? "" : b.kind === "sprints" ? String(b.distance_m) : fmtDist(b.distance_m), minutes: val(b.duration_min), done: true })),
      sport: w.sport ? { name: w.sport.name || "", format: w.sport.format || "", distance: w.sport.distance_m ? fmtDist(w.sport.distance_m) : "" } : { name: "Soccer", format: "pickup", distance: "" },
      editing: w,
    };
  }
  // Form -> log line (knowledge/data-schema.md). Untouched suggestions and untouched drills aren't saved.
  function buildWorkout(dr) {
    const num = (v) => (v === "" || v == null ? undefined : +v);
    const exercises = dr.exercises.filter((x) => x.name.trim()).map((x) => {
      const mine = !!S.data.exercises[x.name];
      const sets = x.sets.filter((s) => s.done || s.reps !== "" || (s.load !== "" && !s.auto)).map((s) => {
        const v = s.reps === "" ? 0 : +s.reps;
        const kg = s.load === "" ? 0 : s.shown != null && s.load === s.shown ? s.kg : round(toKg(+s.load), 0.1);
        return { ...(x.unit === "sec" ? { duration_s: v } : x.unit === "m" ? { distance_m: v } : { reps: v }), load_kg: kg, ...(s.rpe !== "" ? { rpe: +s.rpe } : {}) };
      });
      const notes = String(x.note || "").trim();
      return { name: x.name.trim(), ...(!mine && x.ref ? { ref: x.ref } : {}), ...(!mine && x.muscles?.length ? { muscles: x.muscles } : {}), ...(x.swappedFrom ? { swapped_from: x.swappedFrom } : {}), sets, ...(notes ? { notes } : {}) };
    }).filter((x) => x.sets.length || x.notes); // a note alone ("skipped, machine broken") is kept for the coach
    const conditioning = (dr.drills || []).filter(drillTouched).map((b) => {
      const o = { kind: b.kind, name: (b.name || DRILL_KINDS[b.kind]).trim() };
      if (b.mode && ["intervals", "steady"].includes(b.kind)) o.mode = b.mode;
      if (b.kind === "intervals") Object.assign(o, { rounds: num(b.rounds), work_s: num(b.work_s), rest_s: num(b.rest_s) });
      if (b.kind === "sprints") Object.assign(o, { reps: num(b.reps), distance_m: num(b.distance) });
      if (b.kind === "agility") o.reps = num(b.reps);
      if (b.kind === "steady") Object.assign(o, { duration_min: num(b.minutes), distance_m: b.distance === "" ? undefined : toMeters(b.distance) });
      if (b.kind === "other") Object.assign(o, { rounds: num(b.rounds), duration_min: num(b.minutes) });
      return o;
    });
    const sport = dr.type === "sport" ? { name: (dr.sport?.name || "Soccer").trim(), ...(dr.sport?.format ? { format: dr.sport.format } : {}), ...(dr.sport?.distance ? { distance_m: toMeters(dr.sport.distance) } : {}) } : undefined;
    const minutes = dr.duration_min !== "" ? +dr.duration_min : dr.type === "conditioning" && estMinutes(dr) ? estMinutes(dr) : undefined;
    // jumps before a run (Saturday) don't turn it into a gym session: only real lifts do
    const type = dr.type === "sport" ? "sport" : exercises.some((x) => exInfo(x.name, x.ref).pattern !== "plyo") ? "lift" : "conditioning";
    return JSON.parse(JSON.stringify({ date: dr.date, type, session: dr.session || undefined, duration_min: minutes, rpe: num(dr.rpe),
      exercises: exercises.length ? exercises : undefined, conditioning: conditioning.length ? conditioning : undefined, sport, notes: dr.notes || undefined }));
  }
  const sameEntry = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  function workoutSummary(w) {
    const ex = w.exercises || [], sets = ex.reduce((n, x) => n + (x.sets || []).length, 0);
    const fmt = FORMATS.find(([k]) => k === w.sport?.format)?.[1];
    return [ex.length ? `${ex.length} exercise${ex.length > 1 ? "s" : ""}, ${sets} sets` : "", ...(w.conditioning || []).map(drillText),
      w.sport ? [w.sport.name, fmt, w.sport.distance_m ? `${fmtDist(w.sport.distance_m)} ${distUnit()}` : ""].filter(Boolean).join(", ") : "",
      w.duration_min ? `${w.duration_min} min` : "", w.rpe ? `RPE ${w.rpe}` : ""].filter(Boolean).join(" · ");
  }
  function addExercise(name, ref) {
    const mine = !!S.data.exercises[name], lib = mine ? null : libEntry(ref, name);
    const reps = planReps(name) || "8-12";
    S.draft.exercises.push({ name, ref: lib?.id, muscles: lib?.groups, planReps: reps, planSets: 3, unit: setUnit(reps), sets: makeSets(3, name, reps, lib?.id) });
  }
  // Swap keeps the slot (sets × reps) and anything you already typed; only untouched suggested loads are recalculated.
  function swapExercise(i, name, ref) {
    const ex = S.draft.exercises[i];
    if (!ex || ex.name === name) return;
    const mine = !!S.data.exercises[name], lib = mine ? null : libEntry(ref, name);
    if (ex.planned) ex.swappedFrom = ex.swappedFrom === name ? undefined : ex.swappedFrom || ex.name;
    Object.assign(ex, { name, ref: lib?.id, muscles: lib?.groups });
    const sg = suggestFor(name, ex.planReps, lib?.id);
    for (const st of ex.sets) if (!st.done && (st.auto || st.load === "")) Object.assign(st, { load: sg?.load ?? "", auto: sg?.load != null });
  }
  const newMeal = () => ({ date: today(), meal: guessMeal(), kcal: "", protein_g: "", carbs_g: "", fat_g: "" });
  // Meal windows come from profile.json -> food.meal_times ("HH:MM-HH:MM"). Inside a window = that meal;
  // up to an hour after a window ends still counts as that meal (logging after eating); otherwise snack.
  const MEAL_TIMES = { breakfast: "05:00-11:00", lunch: "11:00-16:00", dinner: "17:00-21:00" };
  const guessMeal = (now = new Date()) => {
    const mins = (t) => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
    const windows = Object.entries({ ...MEAL_TIMES, ...(S.data?.profile?.food?.meal_times || {}) })
      .map(([meal, range]) => { const [a, b] = String(range).split("-"); return { meal, start: mins(a), end: mins(b) }; })
      .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end));
    const t = now.getHours() * 60 + now.getMinutes();
    return (windows.find((w) => t >= w.start && t < w.end) || windows.find((w) => t >= w.end && t < w.end + 60) || { meal: "snack" }).meal;
  };

  views.log = () => {
    const tabs = [["workout", "Workout"], ["meal", "Meal"], ["body", "Morning"], ["test", "Tests"]];
    return `<h1>Log</h1>
      <div class="seg" role="group" aria-label="Entry type">${tabs.map(([k, l]) => `<button data-act="log-tab" data-tab="${k}" aria-pressed="${S.logTab === k}">${l}</button>`).join("")}</div>
      <form class="card stack" id="log-form" data-kind="${S.logTab}" novalidate>${({ workout: workoutForm, meal: mealForm, body: bodyForm, test: testForm })[S.logTab]()}</form>`;
  };

  // Session dropdown: the plan's sessions, then common extras. Picking one fills the form (if nothing is logged yet).
  const EXTRAS = [["walk", "Walk"], ["run", "Run"], ["soccer", "Soccer"], ["other", "Other workout"]];
  function sessionChoices() {
    const out = [], seen = new Set();
    for (const dow of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
      const s = S.data.program.week_template?.[dow];
      if (!s || s.type === "rest" || !s.blocks?.length || seen.has(s.name)) continue;
      seen.add(s.name); out.push([`plan:${dow}`, splitName(s.name)[0]]);
    }
    return [...out, ...EXTRAS];
  }
  function draftFor(choice) {
    if (choice.startsWith("plan:")) return newDraft(choice.slice(5));
    const dr = newDraft();
    dr.choice = choice;
    if (choice === "walk" || choice === "run") {
      const label = choice === "walk" ? "Walk" : "Run";
      Object.assign(dr, { type: "conditioning", session: label, drills: [{ ...newDrill("steady"), name: label, mode: choice, fixedMode: true }] });
    }
    if (choice === "soccer") Object.assign(dr, { type: "sport", session: "Soccer" });
    return dr;
  }
  const choiceOf = (dr) => {
    if (dr.choice) return dr.choice;
    const hit = Object.entries(S.data.program.week_template || {}).find(([, s]) => s.name === dr.session);
    return hit ? `plan:${hit[0]}` : ({ walk: "walk", run: "run", soccer: "soccer", "pickup soccer": "soccer" })[String(dr.session).toLowerCase()] || (dr.type === "sport" ? "soccer" : "other");
  };

  function workoutForm() {
    // a leftover draft with nothing done (e.g. opened yesterday) starts fresh
    if (S.draft && (S.draft.v !== DRAFT_V || (!draftProgress(S.draft) && !S.draft.startedAt && S.draft.date !== today()))) S.draft = null;
    S.draft ||= S.data.program.week_template?.[dowOf(today())]?.blocks?.length ? newDraft(dowOf(today())) : draftFor("walk");
    const dr = S.draft, u = loadUnit(), ctx = weekCtx(), du = distUnit();
    dr.choice ||= choiceOf(dr);
    const doneBtn = (act, attrs, on, label) => `<button type="button" class="done-btn" data-act="${act}" ${attrs} aria-pressed="${!!on}" aria-label="${esc(label)}">${icon.check}</button>`;
    const block = (ex, i) => {
      const sg = suggestFor(ex.name, ex.planReps, ex.ref);
      const unit = ex.unit || "reps";
      const nums = unit === "reps" ? window.Progression?.parseReps(ex.planReps) : planNums(ex.planReps);
      const hint = nums ? (nums.lo === nums.hi ? String(nums.hi) : `${nums.lo}-${nums.hi}`) : "";
      const col = { reps: "Reps", sec: "Sec", m: "Meters" }[unit];
      const meta = [ex.planReps ? `${esc(ex.planSets ?? ex.sets.length)} × ${esc(ex.planReps)}` : "", sg?.last ? `last ${esc(sg.last.text.replace(/ @ RPE.*/, ""))}` : ""].filter(Boolean).join(" · ");
      const lr = loadRule(exInfo(ex.name, ex.ref));
      // bodyweight moves: no weight box (unless an old log line had one)
      const noLoad = lr.none && ex.sets.every((st) => st.load === "" || st.load == null);
      // the newest note you wrote on this exercise (setup, how it felt); not while editing that same workout
      const prevNote = dr.editing ? null : exNotes(ex.name, 1)[0];
      const noteOn = ex.noteOpen || String(ex.note || "") !== "";
      return `
        <div class="ex-block">
          <div class="ex-head">
            <button type="button" class="ex-link ex-title" data-act="ex-info" data-name="${esc(ex.name)}" data-ref="${esc(ex.ref || "")}" data-ex="${i}">${esc(ex.name)}</button>
            <button type="button" class="btn small ghost" data-act="swap" data-ex="${i}">${icon.swap}Swap</button>
            <button type="button" class="icon-btn" data-act="rm-ex" data-ex="${i}" aria-label="Remove ${esc(ex.name)}">${icon.x}</button>
          </div>
          ${ex.swappedFrom ? `<div class="small muted ex-meta">${icon.swap} instead of ${esc(ex.swappedFrom)}</div>` : ""}
          ${meta ? `<div class="small muted ex-meta">${meta}</div>` : ""}
          ${lr.hint && !noLoad ? `<div class="small muted ex-meta">${esc(lr.hint)}</div>` : ""}
          ${prevNote ? `<div class="small ex-meta last-note">Your note, ${esc(fmtDay(prevNote.date))}: ${esc(prevNote.text)}</div>` : ""}
          <div class="set-row set-head"><span>#</span><span>${col}</span><span>${noLoad ? "" : esc(lr.head || u)}</span><button type="button" class="head-btn" data-act="effort-info">Effort</button><span></span></div>
          ${ex.sets.map((st, j) => `<div class="set-row${st.done ? " is-done" : ""}">
            <span class="muted small">${j + 1}</span>
            <input type="number" inputmode="numeric" data-ex="${i}" data-set="${j}" data-f="reps" value="${esc(st.reps)}" placeholder="${esc(hint)}" aria-label="${col} set ${j + 1}">
            ${noLoad ? '<span class="no-load" title="Bodyweight: no weight to log">–</span>' : `<input type="number" inputmode="decimal" step="any" data-ex="${i}" data-set="${j}" data-f="load" value="${esc(st.load)}" class="${st.auto ? "is-auto" : ""}" aria-label="${esc(lr.hint ? lr.hint.replace(/^Weight: /, "Weight, ") : "Weight")} Set ${j + 1}${st.auto ? ", suggested" : ""}">`}
            <input type="number" inputmode="decimal" step="0.5" min="1" max="10" data-ex="${i}" data-set="${j}" data-f="rpe" value="${esc(st.rpe)}" placeholder="${esc(ctx.targetRpe)}" aria-label="Effort set ${j + 1}, out of 10">
            ${doneBtn("set-done", `data-ex="${i}" data-set="${j}"`, st.done, `Set ${j + 1} done`)}
          </div>`).join("")}
          <div class="set-actions">
            <button type="button" class="btn small ghost" data-act="add-set" data-ex="${i}">+ Set</button>
            ${ex.sets.length > 1 ? `<button type="button" class="btn small ghost" data-act="rm-set" data-ex="${i}">− Set</button>` : ""}
            ${noteOn ? "" : `<button type="button" class="btn small ghost" data-act="ex-note" data-ex="${i}">+ Note</button>`}
          </div>
          ${noteOn ? `<label class="ex-note"><span class="sr-only">Note for ${esc(ex.name)}</span>
            <input type="text" data-ex="${i}" data-f="note" value="${esc(ex.note || "")}" placeholder="Seat height, how it felt, any pain" maxlength="200" enterkeyhint="done" autocomplete="off"></label>` : ""}
        </div>`;
    };
    const field = (k, key, label, val, ph, attrs = 'type="number" inputmode="numeric"') => `<label class="field"><span>${label}</span><input ${attrs} data-dr="${k}" data-df="${key}" value="${esc(val)}" placeholder="${esc(ph ?? "")}"></label>`;
    const pace = drillPace;
    const drill = (b, k) => {
      const p = b.plan || {}, last = lastDrill(b.kind, b.name);
      const meta = [b.planned && p.text ? esc(p.text) : "", last ? `last ${esc(last.text)}` : ""].filter(Boolean).join(" · ");
      const fields = {
        intervals: `<div class="drill-grid">${field(k, "rounds", "Rounds", b.rounds, p.rounds)}${field(k, "work_s", "Fast sec", b.work_s, p.work_s)}${field(k, "rest_s", "Easy sec", b.rest_s, p.rest_s)}</div>`,
        sprints: `<div class="drill-grid two">${field(k, "reps", "Sprints", b.reps, p.reps)}${field(k, "distance", "Meters", b.distance, p.distance_m)}</div>`,
        agility: `<div class="drill-grid two">${field(k, "name", "Drill", b.name, "5-10-5 shuttle", 'type="text"')}${field(k, "reps", "Reps", b.reps, p.reps)}</div>`,
        steady: `<div class="drill-grid">${field(k, "minutes", "Minutes", b.minutes, p.minutes)}${field(k, "distance", du, b.distance, "", 'type="number" inputmode="decimal" step="0.01"')}<div class="field"><span class="pace-label">${b.mode === "bike" ? "Speed" : "Pace"}</span><output class="pace" id="pace-${k}">${esc(pace(b))}</output></div></div>`,
        other: `<div class="drill-grid">${field(k, "name", "What", b.name, "Jump rope", 'type="text"')}${field(k, "rounds", "Rounds", b.rounds, p.rounds)}${field(k, "minutes", "Minutes", b.minutes, p.minutes)}</div>`,
      }[b.kind];
      const title = ["agility", "other"].includes(b.kind) ? DRILL_KINDS[b.kind] : b.name;
      return `
        <div class="ex-block drill${b.done ? " is-done" : ""}">
          <div class="ex-head">
            <span class="ex-title">${esc(title)}</span>
            ${doneBtn("drill-done", `data-dr="${k}"`, b.done, `${title} done${b.planned ? " as planned" : ""}`)}
            <button type="button" class="icon-btn" data-act="rm-drill" data-dr="${k}" aria-label="Remove ${esc(title)}">${icon.x}</button>
          </div>
          ${meta ? `<div class="small muted ex-meta">${meta}</div>` : ""}
          ${b.kind === "steady" && !b.fixedMode ? `<div class="chip-row" role="group" aria-label="How">${MODES.map(([v, l]) => `<button type="button" class="chip" data-act="drill-mode" data-dr="${k}" data-v="${v}" aria-pressed="${b.mode === v}">${l}</button>`).join("")}</div>` : ""}
          ${fields}
        </div>`;
    };
    const showDrills = (dr.drills || []).map((b, k) => [b, k]).filter(([b]) => dr.type !== "sport" || drillTouched(b) || !b.planned);
    const est = estMinutes(dr), p = draftProgress(dr);
    const doneSets = dr.exercises.reduce((n, x) => n + x.sets.filter((st) => st.done).length, 0) + (dr.drills || []).filter((b) => b.done).length;
    const allSets = dr.exercises.reduce((n, x) => n + x.sets.length, 0) + showDrills.length;
    const timing = !!dr.startedAt && !dr.editing;
    const firstTime = !dr.editing && !doneSets && dr.exercises.length;
    return `
      ${dr.editing ? `<div class="banner">Editing ${esc(fmtDay(dr.editing.date.slice(0, 10)))}</div>` : ""}
      <div class="form-grid">
        <label class="field ${dr.choice === "other" ? "" : "full"}"><span>Session</span><select id="session-pick">${sessionChoices().map(([v, l]) => `<option value="${esc(v)}" ${dr.choice === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        ${dr.choice === "other" ? `<label class="field"><span>Name</span><input data-f="session" value="${esc(dr.session)}" placeholder="e.g. Swim"></label>` : ""}
        <label class="field"><span>Date</span><input type="date" data-f="date" value="${esc(dr.date)}"></label>
        ${timing ? `<div class="field"><span class="pace-label">Time</span><output class="pace" data-timer="${dr.startedAt}">${fmtClock(Date.now() - dr.startedAt)}</output></div>`
          : `<label class="field"><span>Minutes</span><input type="number" inputmode="numeric" data-f="duration_min" value="${esc(dr.duration_min)}" placeholder="${est ? `≈ ${est}` : ""}"></label>`}
      </div>
      ${!timing && !dr.editing ? `<button type="button" class="btn primary wide" data-act="start-workout">Start workout</button>` : ""}
      ${!dr.editing && S.data.program.warmup && (dr.exercises.length || (dr.drills || []).length) ? `<button type="button" class="row-link warmup-link" data-act="warmup-info" data-gym="${dr.exercises.some((x) => exInfo(x.name, x.ref).pattern !== "plyo") ? 1 : 0}"><span class="row-name">Warm-up first</span><span class="dose muted">${routineMin(S.data.program.warmup)} min</span></button>` : ""}
      ${dr.type === "sport" ? `<div class="ex-block sport">
        <div class="form-grid">
          <label class="field"><span>Sport</span><input data-sf="name" value="${esc(dr.sport?.name || "")}" placeholder="Soccer"></label>
          <label class="field"><span>Distance ${du}</span><input type="number" inputmode="decimal" step="0.01" data-sf="distance" value="${esc(dr.sport?.distance || "")}" placeholder="Optional"></label>
        </div>
        <div class="chip-row" role="group" aria-label="Format" style="margin-top:12px">${FORMATS.map(([v, l]) => `<button type="button" class="chip" data-act="sport-format" data-v="${v}" aria-pressed="${dr.sport?.format === v}">${l}</button>`).join("")}</div>
      </div>` : ""}
      ${firstTime ? `<p class="small muted tip">Tap ${icon.check} after each set.</p>` : ""}
      ${showDrills.length ? `<div>${showDrills.map(([b, k]) => drill(b, k)).join("")}</div>` : ""}
      ${dr.exercises.length ? `<div>${dr.exercises.map(block).join("")}</div>` : ""}
      <div class="add-row">
        <button type="button" class="btn" data-act="add-ex">+ Exercise</button>
        <button type="button" class="btn" data-act="add-drill">+ Cardio</button>
      </div>
      ${dr.type !== "lift" || dr.rpe ? `<label class="field"><span>Effort, 1-10</span><input type="number" inputmode="decimal" step="0.5" min="1" max="10" data-f="rpe" value="${esc(dr.rpe)}" placeholder="How hard was it?"></label>` : ""}
      <label class="field"><span>Notes</span><textarea data-f="notes" rows="2" placeholder="Optional">${esc(dr.notes)}</textarea></label>
      ${dr.editing
        ? `<div class="btn-row"><button class="btn primary" type="submit">Save changes</button><button type="button" class="btn ghost" data-act="cancel-workout-edit">Cancel</button></div>
           <button type="button" class="btn ghost wide danger-text" data-act="delete-workout" data-editing="1">Delete this workout</button>`
        // Discard sits on its own line so "Tap again to discard" never moves Finish under your thumb,
        // and only shows when there's something to discard
        : `<button class="btn primary wide" type="submit">Finish and save</button>
           ${p || dr.startedAt ? '<button type="button" class="btn ghost wide danger-text" data-act="reset-draft">Discard workout</button>' : ""}`}
      ${timing ? `<div class="workout-bar" role="status">
        <span class="clock" data-timer="${dr.startedAt}">${fmtClock(Date.now() - dr.startedAt)}</span>
        <span class="bar-info"><span data-rest="${dr.restFrom || ""}">${dr.restFrom ? `Rest ${fmtClock(Date.now() - dr.restFrom)}` : ""}</span><span>${doneSets}/${allSets} done</span></span>
        <button type="button" class="btn primary small" data-act="finish-workout">Finish</button></div>` : ""}`;
  }

  // Dining halls from profile.json (food.dining_halls). The estimator adds that hall's NetNutrition menu to the prompt.
  const halls = () => S.data?.profile?.food?.dining_halls || [];
  const mealLocation = () => { const v = store.get("ritmo.location", halls()[0] || ""); return v === "" || halls().includes(v) ? v : halls()[0] || ""; };

  function photoSection(m) {
    const ph = S.photo;
    m.location ??= mealLocation();
    const where = halls().length ? `<div><div class="eyebrow" style="margin-bottom:6px">Where?</div><div class="seg" role="radiogroup" aria-label="Where are you eating?">${[...halls(), ""].map((h) => `<button type="button" data-act="pick-loc" data-v="${esc(h)}" aria-pressed="${m.location === h}">${esc(h || "Elsewhere")}</button>`).join("")}</div></div>` : "";
    const placeField = halls().length && !m.location ? `<label class="field"><span>Place (optional)</span><input data-m="place" value="${esc(m.place || "")}" placeholder="e.g. All'Antico Vinaio, Boston" autocomplete="off"></label>` : "";
    if (!ph && m.mode === "text") return `
      <div class="photo-box">
        ${where}${placeField}
        <label class="field"><span>What did you eat?</span><textarea data-m="description" rows="3" placeholder="e.g. La Numero 1 sandwich, the whole thing, and a Coke">${esc(m.description || "")}</textarea></label>
        <p class="small muted" style="margin:0">Say how much: whole, half, 2 slices, a large bowl.</p>
        <div class="btn-row"><button type="button" class="btn primary" data-act="send-photo">Estimate with AI</button><button type="button" class="btn ghost" data-act="meal-mode" data-v="photo">Use a photo</button></div>
      </div>`;
    return `
      <div class="photo-box">
        ${where}${placeField}
        ${ph ? `<img class="photo-preview" src="${ph.dataUrl}" alt="Your meal photo">` : ""}
        <div class="photo-actions">
          <label class="btn ${ph ? "" : "primary"} photo-btn">${icon.camera}<span>${ph ? "Retake" : "Take photo"}</span><input type="file" accept="image/*" capture="environment" id="photo-input" class="sr-only photo-input"></label>
          <label class="btn photo-btn">${icon.gallery}<span>${ph ? "Pick another" : "From gallery"}</span><input type="file" accept="image/*" id="gallery-input" class="sr-only photo-input"></label>
        </div>
        ${ph ? `
          <label class="field"><span>Note for the AI (optional)</span><input data-m="note" value="${esc(m.note || "")}" placeholder="e.g. 2 scoops rice, ranch dressing, half eaten"></label>
          <div class="btn-row"><button type="button" class="btn primary" data-act="send-photo">Estimate with AI</button><button type="button" class="btn ghost" data-act="clear-photo">Remove photo</button></div>`
        : `<button type="button" class="btn ghost wide" data-act="meal-mode" data-v="text">No photo? Describe it</button>`}
      </div>`;
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
      ${editing ? `
      <div class="form-grid">
        ${[["kcal", "Calories"], ["protein_g", "Protein g"], ["carbs_g", "Carbs g"], ["fat_g", "Fat g"]].map(([k, l]) => `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" step="any" data-m="${k}" value="${esc(m[k])}"></label>`).join("")}
      </div>
      <div class="btn-row"><button class="btn primary" type="submit">Save changes</button><button type="button" class="btn ghost" data-act="cancel-edit">Cancel</button></div>` : photoSection(m)}`;
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
      <p class="small muted">Weigh yourself after the bathroom, before eating.</p>
      <div class="btn-row"><button class="btn primary" type="submit">Save morning check</button></div>`;
  }

  function testForm() {
    const bms = S.data.program.benchmarks || [];
    return `
      <div class="form-grid">
        <label class="field full"><span>Test</span><select name="test">${bms.map((b) => `<option value="${esc(b.test)}" data-unit="${esc(b.unit)}">${esc(cap(b.test))} (${esc(b.unit)})</option>`).join("")}</select></label>
        <label class="field"><span>Date</span><input type="date" name="date" value="${today()}"></label>
        <label class="field"><span>Result</span><input type="number" inputmode="decimal" step="any" name="value" required></label>
      </div>
      <p class="small muted">Week 1 and week 6. Same place, warm-up and time of day.</p>
      <div class="btn-row"><button class="btn primary" type="submit">Save result</button></div>`;
  }

  // ---- progress ----
  // Sections can be put in any order (Reorder button). The order is kept on this phone (localStorage); new
  // sections that aren't in a saved order go at the end.
  const PROGRESS = {
    sessions: { title: "Recent sessions", html: () => `<section class="card"><div class="card-head"><h2>Recent sessions</h2>${S.data.workouts.length > 3 ? '<button type="button" class="link-btn" data-act="sessions-all">See all</button>' : ""}</div>${sessionsList(3)}</section>` },
    weight: { title: "Bodyweight", html: () => `<section class="card"><div class="card-head"><h2>Bodyweight</h2><span class="small muted">kg</span></div><div id="ch-weight"></div>
      <div class="legend"><span><i style="background:var(--series-1)"></i>7-day average</span><span><i style="background:var(--series-1);opacity:.45;height:8px;width:8px;border-radius:50%"></i>Daily weigh-in</span></div></section>` },
    strength: { title: "Strength", html: () => `<section class="card"><div class="card-head"><h2>Strength</h2><select id="lift-pick" style="width:auto;min-height:36px" aria-label="Lift"></select></div><div id="ch-lift"></div>
      <p class="small muted">Estimated 1-rep max in ${loadUnit()} (Epley formula), from your best set each session.</p></section>` },
    perweek: { title: "Sessions per week", html: () => `<section class="card"><div class="card-head"><h2>Sessions per week</h2></div><div id="ch-sessions"></div></section>` },
    conditioning: { title: "Conditioning minutes", html: () => `<section class="card"><div class="card-head"><h2>Conditioning minutes</h2></div><div id="ch-cond"></div></section>` },
    steps: { title: "Steps", html: () => `<section class="card"><div class="card-head"><h2>Steps</h2><span class="small muted">${stepsHead()}</span></div><div id="ch-steps"></div>
      <p class="small muted">${Object.keys(S.data.steps || {}).length ? "From your iPhone's Health app, synced at night. Casual walking counts." : "Not synced yet. Set up the iPhone Shortcut in your repo's SETUP.md (section 7) to send your daily steps."}</p></section>` },
    sets: { title: "Hard sets this week", html: () => `<section class="card"><div class="card-head"><h2>Hard sets this week</h2><span class="small muted">line = 10-set reference</span></div><div id="muscles"></div></section>` },
    bench: { title: "Benchmarks", html: () => `<section class="card"><div class="card-head"><h2>Benchmarks</h2></div><div id="bench" class="table-wrap"></div></section>` },
  };
  function progressOrder() {
    const saved = (store.get("ritmo.progressOrder", []) || []).filter((k) => PROGRESS[k]);
    return [...new Set([...saved, ...Object.keys(PROGRESS)])];
  }
  views.progress = () => {
    const order = progressOrder();
    const head = `<div class="page-head"><h1>Progress</h1><button type="button" class="btn small${S.reorder ? " primary" : ""}" data-act="progress-reorder">${S.reorder ? "Done" : `${icon.sort}Reorder`}</button></div>`;
    if (!S.reorder) return head + order.map((k) => PROGRESS[k].html()).join("");
    return `${head}
      <p class="small muted">Move the sections you check most to the top. Saved on this phone.</p>
      <ol class="reorder-list">${order.map((k, i) => `<li><span>${esc(PROGRESS[k].title)}</span>
        <button type="button" class="icon-btn" data-act="progress-move" data-k="${k}" data-d="-1" aria-label="Move ${esc(PROGRESS[k].title)} up"${i === 0 ? " disabled" : ""}>${icon.up}</button>
        <button type="button" class="icon-btn" data-act="progress-move" data-k="${k}" data-d="1" aria-label="Move ${esc(PROGRESS[k].title)} down"${i === order.length - 1 ? " disabled" : ""}>${icon.down}</button></li>`).join("")}</ol>
      ${store.get("ritmo.progressOrder", null) ? '<button type="button" class="btn ghost wide" data-act="progress-reset">Back to the default order</button>' : ""}`;
  };

  function stepsHead() {
    const st = S.data.steps || {}, iso = today();
    const vals = Array.from({ length: 7 }, (_, i) => st[addDays(iso, -i)]).filter((v) => v != null);
    return vals.length ? `${Math.round(vals.reduce((a, b) => a + b, 0) / vals.length).toLocaleString()} a day, last 7 days` : "";
  }
  function drawProgress() {
    if (S.reorder) return; // reorder mode shows names only
    const d = S.data;
    const st = d.steps || {};
    if (Object.keys(st).length) {
      const days = Array.from({ length: 14 }, (_, i) => addDays(today(), i - 13));
      Charts.bars($("#ch-steps"), { label: "Steps per day", color: "var(--series-3)", height: 180, bars: days.map((s) => ({ label: new Date(s + "T12:00:00").toLocaleDateString(undefined, { weekday: "narrow" }), title: Charts.fmtDate(s), value: st[s] || 0 })), yFmt: (v) => Math.round(v).toLocaleString() });
    }
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
      const ai = ["photo-ai", "text-ai", "photo-estimate"].includes(r.source);
      // Older estimates packed details into the name: "French toast (pan-fried in butter)".
      const shortName = (s) => String(s || "").replace(/\s*\(.*$/, "") || s;
      const parts = Array.isArray(r.breakdown) && r.breakdown.length
        ? `<ul class="meal-items">${r.breakdown.map((b) => `<li><span class="mi-name"><span>${esc(shortName(b.name))}</span>${b.portion ? `<span class="muted">${esc(b.portion)}</span>` : ""}</span><span class="muted mi-kcal">${Math.round(b.kcal || 0)} kcal</span></li>`).join("")}</ul>`
        : r.items ? `<ul class="meal-items">${String(r.items).split(/,(?![^()]*\))/).map((s) => s.trim()).filter(Boolean).map((s) => `<li><span>${esc(s[0].toUpperCase() + s.slice(1))}</span></li>`).join("")}</ul>` : "";
      return `<li>
        <span><b class="cap">${esc(r.meal)}</b>${r.location || r.place ? ` <span class="muted small">· ${esc(r.location || r.place)}</span>` : ""}${ai ? `<br><span class="pill">AI estimate${r.source === "text-ai" ? " · no photo" : ""}${r.breakdown?.some?.((b) => b.from_menu) ? " · menu" : ""}${r.breakdown?.some?.((b) => b.from_web) || r.sources?.length ? " · web" : ""}${r.confidence ? ` · ${esc(r.confidence)}` : ""}${r.edited ? " · edited" : ""}</span>` : ""}</span>
        <span class="dose"><span class="nowrap">${Math.round(r.kcal || 0).toLocaleString()} kcal</span><br><span class="muted small nowrap">${Math.round(r.protein_g || 0)}P · ${Math.round(r.carbs_g || 0)}C · ${Math.round(r.fat_g || 0)}F</span></span>
        ${parts}
        ${r.ai_comment ? `<span class="note">${esc(r.ai_comment)}</span>` : ""}
        ${Array.isArray(r.sources) && r.sources.length ? `<span class="note sources">Sources: ${r.sources.filter((x) => /^https:\/\//.test(x?.url || "")).slice(0, 3).map((x) => `<a href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title || new URL(x.url).hostname)}${icon.link}</a>`).join(", ")}</span>` : ""}
        <span class="row-actions"><button class="btn small ghost" data-act="edit-meal" data-idx="${idx}">Edit</button><button class="btn small ghost" data-act="delete-meal" data-idx="${idx}">Delete</button></span>
      </li>`;
    };
    return `<h1>Food</h1>
      <section class="card"><div class="card-head"><h2>Today</h2></div>
        <div class="totals">${cell("kcal", "Calories", "kcal")}${cell("protein_g", "Protein", "g")}${cell("carbs_g", "Carbs", "g")}${cell("fat_g", "Fat", "g")}</div>
        ${pend.length ? `<div class="stack pending-list">${pend.map((p) => `<div class="pending ${p.error ? "is-error" : ""}">
            ${p.thumb ? `<img src="${p.thumb}" alt="">` : ""}
            <div><b>${esc(cap(p.meal))}${p.text ? "" : " photo"}</b>${p.text ? `<br><span class="small">${esc(p.text.length > 60 ? p.text.slice(0, 57) + "…" : p.text)}</span>` : ""}<br><span class="small ${p.error ? "" : "muted"}">${p.error ? `${icon.warn} Couldn't estimate: ${esc(p.error)}` : "Estimating…"}</span></div>
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
          <li>Protein first, then carbs, then veg.</li>
          <li>Training day? Add a fist of carbs.</li>
          <li>Thin menu? Greek yogurt, milk or whey.</li>
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
  // Small Markdown: headings, paragraphs, bullet and numbered lists, checkboxes, tables, bold, italics, https links.
  // kv: list items written "**Label:** value" become label/value pairs (coach notes' "How it went" and "Targets").
  function md(text, { kv = false } = {}) {
    const lines = (text || "").split("\n"); let html = "", list = null, table = null;
    const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/(^|[\s(])_(.+?)_(?=$|[\s).,])/g, "$1<i>$2</i>")
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
    const close = () => { if (list) { html += `</${list}>`; list = null; } if (table) { html += "</tbody></table></div>"; table = null; } };
    const item = (raw) => {
      const box = raw.match(/^\[( |x)\]\s+(.*)/i);
      if (box) return `<li class="todo${box[1] !== " " ? " is-done" : ""}">${box[1] !== " " ? icon.check : icon.box}<span>${inline(box[2])}</span></li>`;
      const pair = kv && raw.match(/^\*\*(.+?):?\*\*:?\s*(.*)$/);
      return pair ? `<li class="kv"><span class="k">${inline(pair[1])}</span><span class="v">${inline(pair[2])}</span></li>` : `<li>${inline(raw)}</li>`;
    };
    for (const l of lines) {
      if (/^\s*\|.*\|\s*$/.test(l)) {
        if (/^\s*\|[\s:|-]+\|\s*$/.test(l)) continue; // separator row
        if (!table) { close(); html += `<div class="table-wrap"><table class="md-table"><thead><tr>${cells(l).map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>`; table = true; continue; }
        html += `<tr>${cells(l).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`; continue;
      }
      const ul = l.match(/^\s*[-*] (.*)/), ol = l.match(/^\s*\d+[.)] (.*)/);
      if (ul || ol) {
        const tag = ul ? "ul" : "ol";
        if (list !== tag) { close(); html += `<${tag}>`; list = tag; }
        html += item((ul || ol)[1]); continue;
      }
      close();
      const h = l.match(/^(#{1,3}) (.*)/);
      if (h) html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
      else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    close();
    return html;
  }
  // Coach notes (format: the private repo's knowledge/coach-notes.md): each "### " section gets its own look.
  function coachNotesHtml(text) {
    const parts = ("\n" + text).split(/\n### /);
    const intro = parts.shift().trim();
    return (intro ? `<div class="md">${md(intro)}</div>` : "") + parts.map((sec) => {
      const nl = sec.indexOf("\n"), title = (nl < 0 ? sec : sec.slice(0, nl)).trim(), body = nl < 0 ? "" : sec.slice(nl + 1).trim();
      const slug = title.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
      if (slug === "verdict") return `<div class="cn-verdict">${icon.target}<div class="md">${md(body)}</div></div>`;
      return `<section class="cn cn-${esc(slug)}"><h3>${esc(title)}</h3><div class="md">${md(body, { kv: ["how-it-went", "targets"].includes(slug) })}</div></section>`;
    }).join("");
  }
  // "2026-W44.md" -> "Oct 26" (that ISO week's Monday)
  function weekOf(name) {
    const m = String(name || "").match(/(\d{4})-W(\d{2})/);
    if (!m) return "";
    const jan4 = new Date(Date.UTC(+m[1], 0, 4)), mon = new Date(jan4 - ((jan4.getUTCDay() + 6) % 7) * 864e5 + (+m[2] - 1) * 7 * 864e5);
    return mon.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  // Coach notes from the latest weekly report ("## Coach notes" section), without the placeholder line.
  function coachNotes() {
    const t = S.data.weekly?.text || "";
    const m = t.match(/##\s*Coach notes\s*\n([\s\S]*?)(?=\n##\s|$)/i);
    const body = (m?.[1] || "").trim();
    return body && !/^_?Claude adds the review/i.test(body) ? body : "";
  }
  views.plan = () => {
    const p = S.data.program, wk = phaseWeek();
    const dow = dowOf(today());
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const progs = S.data.programs?.programs || [];
    const activeId = p.id || S.data.programs?.active;
    const notes = coachNotes();
    const [, phaseTitle] = splitName(p.title);
    return `<div><div class="eyebrow">${esc(phaseName(p.phase || ""))}${wk > 0 ? ` · week ${wk} of ${p.weeks}` : wk != null && wk <= 0 ? ` · starts ${esc(fmtDay(S.data.profile.phase.start_date))}` : ""}</div><h1>${esc(phaseTitle || p.title || "Plan")}</h1>
        ${wk > 0 && p.intensity_by_week?.[wk] ? `<p class="subline">This week: <button type="button" class="link-btn" data-act="effort-info">${esc(p.intensity_by_week[wk])}</button></p>` : ""}</div>
      <section class="card"><div class="card-head"><h2>The week</h2></div>
        <ul class="ex-list tap-list week-list">${order.map((k) => {
          const d = p.week_template?.[k] || {}, rest = !d.blocks?.length;
          const [nm, focus] = splitName(d.name);
          const sub = rest ? "" : [focus, d.type === "lift" ? `${d.blocks.length} exercises` : ""].filter(Boolean).join(" · ");
          const inner = `<b class="day">${k}</b><span class="row-name">${esc(rest ? (/busy/i.test(d.name || "") ? "Rest (busy)" : "Rest") : nm)}${k === dow ? ' <span class="pill">today</span>' : ""}${sub ? `<span class="small muted row-sub">${esc(sub)}</span>` : ""}</span>${rest ? "" : icon.chevron}`;
          return `<li>${rest ? `<div class="row-link is-static">${inner}</div>` : `<button type="button" class="row-link" data-act="day-info" data-dow="${k}">${inner}</button>`}</li>`;
        }).join("")}</ul>
        <div class="link-row"><button type="button" class="link-btn" data-act="how-info">How weights go up</button><button type="button" class="link-btn" data-act="tests-info">Tests</button></div>
      </section>
      <section class="card"><div class="card-head"><h2>Coach notes</h2>${S.data.weekly ? `<button type="button" class="link-btn" data-act="report-full">Full report</button>` : ""}</div>
        ${notes && weekOf(S.data.weekly?.name) ? `<p class="small muted cn-week">Week of ${esc(weekOf(S.data.weekly.name))}</p>` : ""}
        ${notes ? `<div class="coach-notes">${coachNotesHtml(notes)}</div>` : `<p class="muted" style="margin:0">Your coach's notes show up here after the Monday check-in.</p>`}</section>
      ${progs.length ? `<section class="card"><div class="card-head"><h2>Programs</h2></div>
        <ul class="prog-list">${progs.map((m) => `<li><button type="button" class="prog-row" data-act="program" data-id="${esc(m.id)}">
          <span><b>${esc(splitName(m.title)[1] || m.title)}</b>${m.id === activeId ? ` <span class="pill">${icon.check} Now</span>` : ""}<br><span class="small muted">${esc(phaseName(m.phase || ""))} · ${esc(m.days || "")}</span></span>${icon.chevron}</button></li>`).join("")}</ul></section>` : ""}`;
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
          <label class="field"><span>Distance unit</span><select name="distance"><option value="km" ${distUnit() === "km" ? "selected" : ""}>km</option><option value="mi" ${distUnit() === "mi" ? "selected" : ""}>mi</option></select></label>
          <div class="field full"><span class="pace-label">Phase</span><p class="small" style="margin:4px 0 0">${esc(phaseName(p.phase?.current || ""))}${phaseWeek() > 0 ? `, week ${phaseWeek()}` : p.phase?.start_date ? `, starts ${esc(fmtDay(p.phase.start_date))}` : ""}. <a href="#plan">Change it in Plan → Programs</a>.</p></div>
        </div>
        <div class="btn-row"><button class="btn primary" type="submit">Save profile</button></div>
      </form>` : ""}`;
  };

  // ---------- sheets (exercise details, picker, program preview) ----------
  const sheets = {};
  let sheetOpener = null;
  const topSheet = () => S.sheet[S.sheet.length - 1];
  function openSheet(s, { push = false, opener } = {}) {
    if (!push) { S.sheet = []; sheetOpener = opener || document.activeElement; }
    S.sheet.push(s); renderSheet();
  }
  function closeSheet(all = true) {
    if (all) S.sheet = []; else S.sheet.pop();
    renderSheet();
    if (!S.sheet.length && sheetOpener?.isConnected) sheetOpener.focus({ preventScroll: true });
  }
  function renderSheet() {
    const root = $("#sheet-root"), s = topSheet();
    document.documentElement.classList.toggle("sheet-open", !!s);
    if (!s || !S.data) { root.innerHTML = ""; return; }
    const v = sheets[s.type](s);
    root.innerHTML = `<div class="sheet-backdrop"><div class="sheet${s.type === "picker" ? " tall" : ""}" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1">
      <div class="sheet-head"><div class="sheet-bar">
        ${S.sheet.length > 1 ? `<button type="button" class="icon-btn" data-act="sheet-back" aria-label="Back">${icon.back}</button>` : ""}
        <h2 id="sheet-title">${esc(v.title)}</h2>
        <button type="button" class="icon-btn" data-act="sheet-close" aria-label="Close">${icon.x}</button></div>
        ${v.controls || ""}</div>
      <div class="sheet-body">${v.body}</div></div></div>`;
    const sheet = root.querySelector(".sheet");
    sheet.scrollTop = s.scroll || 0;
    sheet.addEventListener("scroll", () => { s.scroll = sheet.scrollTop; }, { passive: true });
    if (!root.contains(document.activeElement)) sheet.focus({ preventScroll: true });
  }
  // Library-backed parts render once the library arrives (first open only).
  const whenLibrary = (s) => { if (!S.lib) ensureLibrary().then(() => { if (topSheet() === s) renderSheet(); }).catch(() => { s.libError = true; if (topSheet() === s) renderSheet(); }); };

  // A how-to video: the coach's pick (exercises.json "video", https only) or a YouTube search. The library has
  // no photos for some moves (Pogo Hops, Copenhagen Plank...), so they get the video instead.
  const videoUrl = (name, info, extra = "exercise form") => {
    const own = String(info?.video || "");
    return /^https:\/\//.test(own) ? own : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} ${extra}`)}`;
  };
  const videoCard = (name, url) => `<a class="video-card" href="${esc(url)}" target="_blank" rel="noopener noreferrer"><span class="video-ico">${icon.play}</span><span><b>Watch how it's done</b><span class="small muted">Short videos of ${esc(name)} on YouTube</span></span>${icon.link}</a>`;

  sheets.exercise = (s) => {
    const info = exInfo(s.name, s.ref);
    const ref = info.ref || s.ref;
    if (ref) whenLibrary(s);
    const lib = libEntry(ref, s.name);
    const imgs = (lib?.images || []).slice(0, 2);
    const fromLog = s.ex != null && S.draft?.exercises[s.ex]?.name === s.name;
    const reps = fromLog ? S.draft.exercises[s.ex].planReps : planReps(s.name);
    const sg = suggestFor(s.name, reps, ref);
    const note = planNote(s.name), lr = loadRule(info), myNotes = exNotes(s.name, 5);
    const hist = window.Progression ? Progression.history(S.data.workouts, s.name).slice(-5).reverse() : [];
    // e1RM means nothing when the number is the machine's help
    const best = (sets) => (info.load === "assist" ? 0 : Math.max(0, ...sets.map((st) => epley(+st.load_kg || 0, +st.reps || 0))));
    const alts = (info.alternatives || []).filter((a) => a !== s.name);
    const tags = [...new Set(info.muscles?.length ? info.muscles : lib?.groups || [])];
    const pick = S.sheet.find((x) => x.type === "picker");
    const shortDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const video = videoUrl(s.name, info);
    const body = `
      ${imgs.length ? `<div class="ex-imgs">${imgs.map((p, k) => `<img src="${esc(imgUrl(p))}" alt="${esc(s.name)}, ${k ? "end" : "start"} position" width="850" height="1275" decoding="async">`).join("")}</div>
        <a class="video-link" href="${esc(video)}" target="_blank" rel="noopener noreferrer">${icon.play}Watch a video</a>`
        : ref && !S.lib && !s.libError ? '<div class="ex-imgs" aria-hidden="true"><span></span><span></span></div>' : videoCard(s.name, video)}
      ${tags.length || lib ? `<div class="tag-row">${tags.map((m) => `<span class="pill cap">${esc(m)}</span>`).join("")}${lib?.equipment && lib.equipment !== "other" ? `<span class="pill ghost cap">${esc(lib.equipment)}</span>` : ""}${lib?.level ? `<span class="pill ghost cap">${esc(lib.level)}</span>` : ""}</div>` : ""}
      ${s.pick && pick ? `<button type="button" class="btn primary wide" data-act="pick-ex" data-name="${esc(s.name)}" data-ref="${esc(ref || "")}">${pick.mode === "swap" ? `Swap in for ${esc(pick.from)}` : "Add to workout"}</button>` : ""}
      ${sg && sg.kind !== "none" ? `<section><h3>Today</h3>
        <div class="target-line"><b>${sg.kind === "first" ? (info.step_lb === 0 || info.start === "bodyweight" ? "Learn the move" : "Find your weight") : esc([sg.load != null ? sg.short : "", sg.targetReps ? `${sg.load != null ? "× " : ""}${sg.targetReps}${sg.load != null ? "" : "+"} reps` : ""].filter(Boolean).join(" "))}</b></div>
        ${note ? `<p>${esc(note)}</p>` : ""}
        ${lr.hint ? `<p class="small">${esc(lr.hint)}</p>` : ""}
        <p class="small muted">${esc(sg.text)}</p>
        ${sg.last ? `<p class="small muted">Last time (${esc(fmtDay(sg.last.date))}): ${esc(sg.last.text)}</p>` : ""}</section>` : ""}
      ${myNotes.length ? `<section><h3>Your notes</h3><ul class="cues">${myNotes.map((n) => `<li><span class="muted">${esc(fmtDay(n.date))}:</span> ${esc(n.text)}</li>`).join("")}</ul></section>` : ""}
      ${info.cues?.length ? `<section><h3>Coach cues</h3><ul class="cues">${info.cues.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></section>` : ""}
      ${lib?.steps?.length ? `<details class="how"${info.cues?.length ? "" : " open"}><summary>How to do it</summary><ol>${lib.steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></details>` : ""}
      ${alts.length ? `<section><h3>Swaps</h3>
        <div class="chip-row">${alts.map((a) => `<button type="button" class="chip" data-act="${fromLog ? "do-swap" : "ex-info"}" data-name="${esc(a)}"${fromLog ? ` data-ex="${s.ex}"` : ""}>${fromLog ? `${icon.swap}` : ""}${esc(a)}</button>`).join("")}${fromLog ? `<button type="button" class="chip ghost" data-act="swap" data-ex="${s.ex}">More…</button>` : ""}</div>
        <p class="small muted" style="margin-top:8px">Coach-approved for when the equipment is taken or a movement feels off. Sharp pain means stop, not swap.</p></section>` : ""}
      ${hist.length ? `<section><h3>History</h3><div class="table-wrap"><table><thead><tr><th>Date</th><th>Sets</th><th class="num">e1RM</th></tr></thead><tbody>
        ${hist.map((h) => `<tr><td class="nowrap">${esc(shortDate(h.date))}</td><td>${esc(Progression.describe(h.sets, loadUnit()))}</td><td class="num">${best(h.sets) ? `${Math.round(showLoad(best(h.sets)))} ${loadUnit()}` : "–"}</td></tr>`).join("")}
        </tbody></table></div></section>` : !s.pick ? '<p class="small muted">No sessions logged yet.</p>' : ""}
      ${lib ? `<p class="small muted attrib">Photos and steps: <a href="https://github.com/yuhonas/free-exercise-db" target="_blank" rel="noopener">Free Exercise DB</a>, public domain.</p>` : ""}`;
    return { title: s.name, body };
  };

  sheets.picker = (s) => {
    whenLibrary(s);
    const controls = `<div class="pick-controls">
      <label class="search"><span class="sr-only">Search exercises</span>${icon.search}<input type="search" id="pick-q" value="${esc(s.q)}" placeholder="Search ${S.lib ? `${S.lib.count} ` : ""}exercises" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" enterkeyhint="search"></label>
      <div class="chip-row scroll" role="group" aria-label="Filter by muscle">${["all", ...GROUPS].map((g) => `<button type="button" class="chip" data-act="pick-muscle" data-v="${g}" aria-pressed="${s.muscle === g}">${g === "all" ? "All" : cap(g)}</button>`).join("")}</div></div>`;
    return { title: s.mode === "swap" ? `Swap ${s.from}` : "Add exercise", controls, body: `<div id="pick-results">${pickerResults(s)}</div>` };
  };
  function pickerResults(s) {
    const words = s.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (name, muscles) => words.every((w) => name.toLowerCase().includes(w)) && (s.muscle === "all" || (muscles || []).includes(s.muscle));
    const thumb = (ref, name) => { const e = libEntry(ref, name); return e?.images?.[0] ? `<img src="${esc(imgUrl(e.images[0]))}" alt="" loading="lazy" decoding="async">` : '<span class="thumb-ph" aria-hidden="true"></span>'; };
    const row = (name, ref, sub) => `<li><button type="button" class="pick-row" data-act="pick-ex" data-name="${esc(name)}" data-ref="${esc(ref || "")}">${thumb(ref, name)}<span><b>${esc(name)}</b><span class="small muted">${esc(sub)}</span></span></button>
      <button type="button" class="icon-btn" data-act="pick-info" data-name="${esc(name)}" data-ref="${esc(ref || "")}" aria-label="About ${esc(name)}">${icon.info}</button></li>`;
    const section = (label, rows) => (rows.length ? `<div class="pick-sec"><div class="eyebrow">${label}</div><ul class="pick-list">${rows.join("")}</ul></div>` : "");
    const mineSub = (v) => (v.muscles || []).map(cap).join(", ");
    const current = s.mode === "swap" ? s.from : null;
    // the coach's swaps for this exercise come first and ignore the muscle filter
    const alts = s.mode === "swap" ? (exInfo(s.from).alternatives || []).filter((a) => a !== current && words.every((w) => a.toLowerCase().includes(w))) : [];
    let html = section("Coach-approved swaps", alts.map((a) => row(a, exInfo(a).ref, mineSub(exInfo(a)))));
    const mine = Object.entries(S.data.exercises).filter(([n, v]) => n !== current && !alts.includes(n) && match(n, v.muscles)).sort((a, b) => a[0].localeCompare(b[0]));
    // Swap with no filter: same-muscle exercises first, then everything else (nothing hidden behind a chip)
    if (s.mode === "swap" && s.muscle === "all" && !words.length) {
      const target = new Set(exInfo(s.from).muscles || []);
      const same = mine.filter(([, v]) => (v.muscles || []).some((m) => target.has(m)));
      html += section("Same muscles", same.map(([n, v]) => row(n, v.ref, mineSub(v))));
      html += section("Your other exercises", mine.filter((x) => !same.includes(x)).map(([n, v]) => row(n, v.ref, mineSub(v))));
    } else html += section("Your exercises", mine.map(([n, v]) => row(n, v.ref, mineSub(v))));
    if (!S.lib) html += `<p class="small muted pick-sec">${s.libError ? "Couldn't load the exercise library. Check your connection and reopen." : "Loading the exercise library…"}</p>`;
    else if (!words.length && s.muscle === "all") html += `<p class="small muted pick-sec">Search or pick a muscle to browse ${S.lib.count} more exercises with photos and steps.</p>`;
    else {
      const taken = new Set(Object.values(S.data.exercises).map((v) => v.ref).filter(Boolean));
      const q = words.join(" ");
      const hits = S.lib.exercises.filter((e) => !taken.has(e.id) && !S.data.exercises[e.name] && match(e.name, e.groups))
        .sort((a, b) => (b.name.toLowerCase().startsWith(q) - a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name));
      const shown = hits.slice(0, s.limit);
      html += section(`Exercise library · ${hits.length}`, shown.map((e) => row(e.name, e.id, `${e.groups.map(cap).join(", ")}${e.equipment ? ` · ${e.equipment}` : ""}`)));
      if (hits.length > shown.length) html += `<button type="button" class="btn ghost wide" data-act="pick-more">Show more (${hits.length - shown.length})</button>`;
    }
    const typed = s.q.trim();
    if (typed && !S.data.exercises[typed] && !libEntry(null, typed)) html += `<button type="button" class="btn wide pick-sec" data-act="pick-ex" data-name="${esc(typed)}" data-ref="">Add “${esc(typed)}” as your own exercise</button>`;
    return html || '<div class="empty">No matches</div>';
  }

  sheets.program = (s) => {
    const meta = s.meta, p = s.program;
    if (!p && !s.loading) {
      s.loading = true;
      readJSON(`data/programs/${meta.file}`, null).then((j) => { s.program = j; s.error = !j; }).catch(() => { s.error = true; }).finally(() => { s.loading = false; if (topSheet() === s) renderSheet(); });
    }
    if (!p) return { title: meta.title, body: s.error ? '<div class="empty">Couldn\'t load this program.</div>' : '<div class="empty">Loading…</div>' };
    const activeId = S.data.program.id || S.data.programs?.active;
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const rpes = Object.values(p.rpe_by_week || {}).map(Number);
    const phaseChange = p.phase && p.phase !== S.data.profile?.phase?.current;
    const days = order.map((k) => ({ k, d: p.week_template?.[k] || {} }));
    const train = days.filter(({ d }) => d.blocks?.length), rest = days.filter(({ d }) => !d.blocks?.length);
    const gymDays = train.filter(({ d }) => d.type === "lift").map(({ k }) => k);
    const short = (d) => (d.type === "lift" ? splitName(d.name)[0].replace(/^Gym\s+/i, "").split(/\s+/)[0] : d.blocks?.length ? "Cardio" : "Rest");
    const fact = (label, value) => (value ? `<div><span class="label">${esc(label)}</span><b>${esc(value)}</b></div>` : "");
    const restNote = (d) => (/busy/i.test(d.name || "") ? "busy" : /walk/i.test(d.name || "") ? "easy walk" : "");
    const body = `
      <div><div class="eyebrow">${esc([phaseName(p.phase || ""), meta.days].filter(Boolean).join(" · "))}</div>
        ${meta.summary ? `<p class="lede">${esc(meta.summary)}</p>` : ""}</div>
      <div class="facts">
        ${fact("Length", p.weeks ? `${p.weeks} weeks` : "")}
        ${fact("Gym days", gymDays.join(" · "))}
        ${fact("Effort", rpes.length ? `${Math.min(...rpes)}-${Math.max(...rpes)} out of 10` : "")}
        ${fact("Easy weeks", p.deload_weeks?.length ? `Week ${p.deload_weeks.join(" + ")}` : "")}
      </div>
      <ol class="week-strip" aria-label="The week">${days.map(({ k, d }) => `<li class="ws-${d.type === "lift" ? "gym" : d.blocks?.length ? "cardio" : "rest"}"><span>${k.slice(0, 3)}</span><b>${esc(short(d))}</b></li>`).join("")}</ol>
      ${train.map(({ k, d }) => {
        const [nm, focus] = splitName(d.name), groups = groupBlocks(d.blocks), heads = groups.length > 1;
        return `<section class="day-card"><div class="day-card-head"><span class="day-badge">${k}</span><span class="dc-title"><b>${esc(nm)}</b>${focus ? `<span class="small muted">${esc(focus)}</span>` : ""}</span>${d.type === "lift" ? `<span class="small muted nowrap">${d.blocks.length} exercises</span>` : ""}</div>
          <ul class="ex-list compact">${groups.map((g) => (heads ? `<li class="grp"><span class="eyebrow">${esc(g.label)}</span></li>` : "") + g.items.map(({ b }) => `<li><span>${esc(b.exercise)}</span><span class="dose">${esc(b.sets)} × ${esc(b.reps)}</span></li>`).join("")).join("")}</ul></section>`;
      }).join("")}
      ${rest.length ? `<p class="small muted">Rest: ${rest.map(({ k, d }) => `${k}${restNote(d) ? ` (${restNote(d)})` : ""}`).join(", ")}.</p>` : ""}
      ${meta.id === activeId ? `<div class="banner">${icon.check} This is your current plan.</div>` : `
        <button type="button" class="btn primary wide" data-act="switch-program" data-id="${esc(meta.id)}">Switch to this program</button>
        <p class="small muted">Replaces your current plan${phaseChange ? ` and starts ${esc(phaseName(p.phase))} with week 1 on ${esc(fmtDay(programStart()))}` : ""}. Your logs don't change, and you can switch back any time.</p>`}`;
    return { title: splitName(meta.title)[1] || meta.title, body };
  };
  sheets["drill-picker"] = () => ({ title: "Add cardio", body: `<ul class="pick-list">${Object.entries(DRILL_KINDS).map(([k, l]) => `<li><button type="button" class="pick-row" data-act="pick-drill" data-v="${k}"><span><b>${esc(l)}</b><span class="small muted">${esc(DRILL_HINTS[k])}</span></span></button></li>`).join("")}</ul>` });

  sheets.effort = () => {
    const t = weekCtx().targetRpe;
    const left = (r) => (r >= 10 ? "nothing left" : `${10 - r} more rep${10 - r > 1 ? "s" : ""} left`);
    return { title: "Effort", body: `
      <p>How hard a set felt, out of 10. Think: how many more reps could I have done?</p>
      <ul class="ex-list effort-scale">${[10, 9, 8, 7, 6].map((r) => `<li${Math.round(t) === r ? ' class="is-now"' : ""}><span><b>${r}</b></span><span class="dose">${left(r)}</span></li>`).join("")}</ul>
      ${phaseWeek() > 0 ? `<div class="banner">This week: about <b>${esc(t)}</b>. Stop each set with ${esc(left(Math.round(t)))}.</div>` : ""}
      <p class="small muted">Type it in the Effort column. The app uses it to choose next week's weights.</p>` };
  };

  // Warm-up and cool-down: program.json `warmup` / `cooldown` =
  // {minutes, note?, steps: [{title, how?, items?: [{name, dose}], gym? (only on gym days)}]}; an old plain-text warm-up still works.
  const routineMin = (r) => (r && typeof r === "object" ? r.minutes || 10 : 10);
  function routineBody(r, gym, search) {
    if (!r) return '<div class="empty">Not in the plan.</div>';
    if (typeof r === "string") return `<ol class="cues">${r.replace(/^\d+\s*min:\s*/i, "").split(/,\s*(?:then\s*)?|\.\s*/).filter((x) => x.trim()).map((x) => `<li>${esc(cap(x.trim()))}</li>`).join("")}</ol><p class="small muted">About 10 minutes. Warm muscles move better and get hurt less.</p>`;
    const steps = (r.steps || []).filter((s) => gym || !s.gym);
    return `<ol class="routine">${steps.map((s) => `<li><b>${esc(s.title)}</b>
        ${s.how ? `<p class="small muted">${esc(s.how)}</p>` : ""}
        ${s.items?.length ? `<ul class="ex-list routine-items">${s.items.map((it) => `<li><a href="${esc(videoUrl(it.name, null, search))}" target="_blank" rel="noopener noreferrer">${esc(it.name)}</a><span class="dose muted">${esc(it.dose || "")}</span></li>`).join("")}</ul>` : ""}</li>`).join("")}</ol>
      ${r.note ? `<p class="small muted">${esc(r.note)}</p>` : ""}`;
  }
  sheets.warmup = (s) => ({ title: "Warm-up", body: routineBody(S.data.program.warmup, s.gym !== false, "warm up how to") });
  sheets.cooldown = () => ({ title: "After your workout", body: routineBody(S.data.program.cooldown, true, "stretch how to") });

  const DRILL_HOW = {
    intervals: "Fast = hard but controlled, about 8/10. Easy = walk or slow jog until the next round.",
    sprints: "Build up to about 85-90% speed. Walk back slowly: full rest between sprints.",
    agility: "Sprint, touch the line, turn, sprint back. Stay low when you turn.",
    steady: "An easy pace you could talk at in full sentences.",
    other: "",
  };
  sheets.drill = (s) => {
    const b = S.data.program.week_template?.[s.dow]?.blocks?.[s.k];
    if (!b) return { title: "Cardio", body: '<div class="empty">Not in the plan anymore.</div>' };
    const kind = drillKind(b.exercise), last = lastDrill(kind, b.exercise);
    return { title: b.exercise, body: `
      <div class="target-line"><b>${esc(b.sets)} × ${esc(b.reps)}</b></div>
      ${b.note ? `<p>${esc(b.note)}</p>` : ""}
      ${DRILL_HOW[kind] ? `<p class="small muted">${esc(DRILL_HOW[kind])}</p>` : ""}
      ${["sprints", "agility"].includes(kind) ? videoCard(b.exercise, videoUrl(b.exercise, null, "drill")) : ""}
      ${last ? `<p class="small muted">Last time (${esc(fmtDay(last.date))}): ${esc(last.text)}</p>` : ""}` };
  };

  sheets.day = (s) => {
    const d = S.data.program.week_template?.[s.dow] || {};
    const [title, sub] = splitName(d.name);
    return { title: `${s.dow} · ${title || "Rest"}`, body: `
      ${sub ? `<p class="subline">${esc(sub)}</p>` : ""}
      ${d.blocks?.length ? sessionList(d, s.dow) : `<p class="muted">${/busy/i.test(d.name || "") ? "Busy day: nothing planned." : "Rest. A walk always counts."}</p>`}
      ${d.blocks?.length ? `<button type="button" class="btn primary wide" data-act="start-workout" data-dow="${esc(s.dow)}">Start this workout</button>` : ""}` };
  };

  sheets.how = () => {
    const p = S.data.program, wk = phaseWeek();
    const rpes = Object.entries(p.rpe_by_week || {});
    return { title: "How weights go up", body: `
      <ol class="cues">
        <li>The app suggests a weight for each lift (in green when you log).</li>
        <li>Hit the top of the reps on every set at this week's effort? Next time it adds a little weight.</li>
        <li>Not yet? Same weight, aim for one more rep.</li>
        <li>Missed the reps two times in a row? It drops the weight a bit.</li>
      </ol>
      ${rpes.length ? `<h3>Effort by week</h3><div class="rpe-steps">${rpes.map(([w, v]) => `<span class="${+w === wk ? "is-now" : ""}"><b>${esc(v)}</b>wk ${esc(w)}${(p.deload_weeks || []).includes(+w) ? "<br>easy" : ""}</span>`).join("")}</div>` : ""}
      <p class="small muted">Feeling bad, sleeping little or sore? Go lighter and log what you really did. Sharp pain means stop.</p>` };
  };

  sheets.tests = () => ({ title: "Tests", body: `
    <p>Do these in week 1 and week 6 to see if you're getting fitter. Same place, same warm-up, same time of day.</p>
    <ul class="ex-list">${(S.data.program.benchmarks || []).map((b) => `<li><span>${esc(cap(b.test))}</span><span class="dose muted">${esc(b.unit)}</span>${b.note ? `<span class="note">${esc(b.note)}</span>` : ""}</li>`).join("")}</ul>
    <button type="button" class="btn primary wide" data-act="goto-log" data-tab="test">Log a test</button>` });

  // The report's automatic checks ("## Flags") are for the weekly check-in, not for Damian to read (his choice): hidden here.
  const withoutFlags = (text) => String(text).replace(/\n## Flags\n[\s\S]*?(?=\n## |$)/, "\n");
  sheets.report = () => ({ title: (S.data.weekly?.name || "Report").replace(/\.md$/, ""), body: `<div class="md">${S.data.weekly ? md(withoutFlags(S.data.weekly.text)) : '<div class="empty">No report yet.</div>'}</div>` });

  function sessionsList(n) {
    const rows = S.data.workouts.map((w, i) => [w, i]).slice(-n).reverse();
    if (!rows.length) return '<div class="empty">No sessions yet</div>';
    return `<ul class="ex-list tap-list">${rows.map(([w, i]) => `<li><button type="button" class="row-link" data-act="edit-workout" data-idx="${i}">
      <span class="row-name"><b>${esc(splitName(w.session)[0] || cap(w.type))}</b><span class="small muted row-sub">${esc(fmtDay(w.date.slice(0, 10)))}${workoutSummary(w) ? ` · ${esc(workoutSummary(w))}` : ""}</span></span>
      <span class="dose muted small">Edit</span></button></li>`).join("")}</ul>`;
  }
  sheets.sessions = () => ({ title: "All sessions", body: sessionsList(1e6) });

  // Week 1 is this week when switching Mon-Thu, next week from Friday on.
  const programStart = () => { const iso = today(), wd = (new Date(iso + "T12:00:00").getDay() + 6) % 7; return addDays(mondayOf(iso), wd >= 4 ? 7 : 0); };
  async function switchProgram(s) {
    const p = structuredClone(s.program), meta = s.meta;
    const profile = structuredClone(S.data.profile);
    const index = structuredClone(S.data.programs || { programs: [] });
    index.active = meta.id;
    const phaseChange = p.phase && p.phase !== profile.phase?.current;
    if (phaseChange) profile.phase = { ...(profile.phase || {}), current: p.phase, start_date: programStart() };
    const files = [{ path: "data/program.json", text: JSON.stringify(p, null, 2) + "\n" }, { path: "data/programs/index.json", text: JSON.stringify(index, null, 2) + "\n" }];
    if (phaseChange) files.push({ path: "data/profile.json", text: JSON.stringify(profile, null, 2) + "\n" });
    if (live()) await commitFiles(files, `plan: switch to ${meta.id} (from the app)`);
    Object.assign(S.data, { program: p, programs: index, profile });
    if (!draftProgress(S.draft) && !S.draft?.startedAt) S.draft = null;
    saveDraft();
  }

  // Two taps for anything that loses work: the first tap arms the button for 3 s.
  function arm(t, text) {
    t.dataset.armed = "1"; t.classList.add("is-armed");
    const old = t.innerHTML;
    if (text) t.textContent = text;
    setTimeout(() => { if (t.isConnected && t.dataset.armed) { delete t.dataset.armed; t.classList.remove("is-armed"); t.innerHTML = old; } }, 3000);
  }
  // Go to a Log tab; if Log is already open, close any sheet and re-render instead (the hash doesn't change).
  function toLog(tab = "workout") {
    S.logTab = tab;
    if (S.view === "log") { if (S.sheet.length) closeSheet(); render(); } else go("log");
  }

  // ---------- render + events ----------
  const after = { progress: drawProgress, food: drawFood };
  function render() {
    const v = S.view;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.view === v ? "page" : "false"));
    const r = S.data?.report;
    $("#phase-label").textContent = r ? `${phaseName(r.phase)}${r.phase_week ? ` · wk ${r.phase_week}` : ""}${live() ? "" : " · demo"}` : "";
    $("#view").innerHTML = S.data || v === "settings" ? views[v]() : '<div class="empty">Loading…</div>';
    if (S.slide) {
      // a swipe: slide the new section in from the side it came from (a fade when a workout bar is on screen, since a
      // transformed parent would move that fixed bar for a moment)
      const el = $("#view"), cls = el.querySelector(".workout-bar") ? "fade-in" : S.slide;
      el.classList.remove("slide-l", "slide-r", "fade-in"); void el.offsetWidth; el.classList.add(cls);
      el.addEventListener("animationend", () => el.classList.remove(cls), { once: true });
      S.slide = null;
    }
    if (S.data) after[v]?.(); // charts need data; skip while loading
  }
  function go(view) { location.hash = view; }
  window.addEventListener("hashchange", () => { S.view = (location.hash.slice(1) || "today"); if (!views[S.view]) S.view = "today"; S.reorder = false; if (S.view !== "log" && S.meal?.editing) S.meal = null; if (S.sheet.length) { S.sheet = []; renderSheet(); } render(); window.scrollTo(0, 0); });

  // A meal edit only survives taps on its own fields and Save; any other button, link or tab drops it.
  document.addEventListener("click", (e) => {
    if (!S.meal?.editing) return;
    const t = e.target.closest("button, a, [data-act], [data-view]");
    if (!t || (t.closest("#log-form") && t.matches('[type="submit"]'))) return;
    S.meal = null;
    setTimeout(() => { if (S.view === "log" && document.querySelector('[data-act="cancel-edit"]')) render(); });
  }, true);

  document.addEventListener("click", async (e) => {
    if (e.target.classList?.contains("sheet-backdrop")) return closeSheet();
    const t = e.target.closest("[data-act],[data-view]");
    if (!t) return;
    if (t.dataset.view) return go(t.dataset.view);
    const a = t.dataset.act, i = +t.dataset.ex, j = +t.dataset.set;
    const inSheet = !!t.closest(".sheet");
    if (a === "log-tab") { S.logTab = t.dataset.tab; render(); }
    queueMicrotask(saveDraft); // the workout in progress survives reloads
    if (a === "goto-log") toLog(t.dataset.tab);
    if (a === "start-workout") {
      const busy = !!(S.draft && !S.draft.editing && (draftProgress(S.draft) || S.draft.startedAt));
      if (t.dataset.dow && busy && !t.closest("#log-form")) { toast("You have a workout in progress"); return toLog("workout"); }
      if (t.dataset.dow || !S.draft || S.draft.editing) S.draft = newDraft(t.dataset.dow || dowOf(today()));
      S.draft.startedAt ||= Date.now();
      toLog("workout");
    }
    if (a === "log-choice") { if (!draftProgress(S.draft) && !S.draft?.startedAt) S.draft = draftFor(t.dataset.choice); toLog("workout"); }
    if (a === "edit-workout") {
      const w = S.data.workouts[+t.dataset.idx];
      if (!w) return;
      if (S.draft && !S.draft.editing && (draftProgress(S.draft) || S.draft.startedAt)) { toast("Finish or discard the workout in progress first"); return toLog("workout"); }
      S.draft = { ...draftFromLog(w), from: S.view === "log" ? "today" : S.view };
      toLog("workout");
    }
    if (a === "cancel-workout-edit") { const back = S.draft?.from || "today"; S.draft = null; go(back); }
    if (a === "finish-workout") { if (!t.dataset.armed) return arm(t, "Tap to save"); $("#log-form")?.requestSubmit(); }
    if (a === "delete-workout") {
      if (!t.dataset.armed) return arm(t, "Tap again to delete");
      const orig = S.draft?.editing;
      if (!orig) return;
      t.disabled = true;
      try {
        const queued = S.queue.find((q) => q.kind === "workout" && sameEntry(q.obj, orig));
        if (live() && !queued) await replaceLine(LOGS.workout, orig, null, `log: delete workout ${orig.date}`);
        S.queue = S.queue.filter((q) => q !== queued); store.set("ritmo.queue", S.queue);
        const k = S.data.workouts.findIndex((w) => sameEntry(w, orig));
        if (k >= 0) S.data.workouts.splice(k, 1);
        const back = S.draft.from || "today";
        S.draft = null; saveDraft();
        toast(live() ? "Workout deleted" : "Demo mode: deleted here only");
        go(back);
      } catch (err) { toast(err.message); t.disabled = false; }
    }
    // workout form
    if (a === "set-done") {
      const ex = S.draft?.exercises[i], st = ex?.sets[j];
      if (!st) return;
      if (st.done) st.done = false;
      else {
        if (st.reps === "") {
          const n = (ex.unit || "reps") === "reps" ? suggestFor(ex.name, ex.planReps, ex.ref)?.targetReps ?? window.Progression?.parseReps(ex.planReps)?.lo : planNums(ex.planReps)?.lo;
          if (n) st.reps = String(n);
        }
        if (st.rpe === "") st.rpe = String(weekCtx().targetRpe); // done = as planned; change it if it felt different
        Object.assign(st, { done: true, auto: false });
        S.draft.restFrom = Date.now();
      }
      render();
    }
    if (a === "drill-done") {
      const b = S.draft?.drills?.[+t.dataset.dr];
      if (!b) return;
      if (b.done) b.done = false; else { fillDrill(b); b.done = true; S.draft.restFrom = Date.now(); }
      render();
    }
    if (a === "drill-mode") { const b = S.draft.drills[+t.dataset.dr]; b.mode = t.dataset.v; render(); }
    if (a === "rm-drill") { S.draft.drills.splice(+t.dataset.dr, 1); render(); }
    if (a === "pick-drill") { S.draft.drills ||= []; S.draft.drills.push(newDrill(t.dataset.v)); closeSheet(); render(); }
    if (a === "sport-format") { S.draft.sport.format = t.dataset.v; t.parentElement.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === t)); }
    // detail sheets
    if (a === "add-drill") openSheet({ type: "drill-picker" }, { opener: t });
    if (a === "effort-info") openSheet({ type: "effort" }, { push: inSheet, opener: t });
    if (a === "warmup-info") openSheet({ type: "warmup", gym: t.dataset.gym !== "0" }, { push: inSheet, opener: t });
    if (a === "cooldown-info") openSheet({ type: "cooldown" }, { push: inSheet, opener: t });
    if (a === "drill-info") openSheet({ type: "drill", dow: t.dataset.dow, k: +t.dataset.k }, { push: inSheet, opener: t });
    if (a === "day-info") openSheet({ type: "day", dow: t.dataset.dow }, { opener: t });
    if (a === "how-info") openSheet({ type: "how" }, { opener: t });
    if (a === "tests-info") openSheet({ type: "tests" }, { opener: t });
    if (a === "report-full") openSheet({ type: "report" }, { opener: t });
    if (a === "progress-reorder") { S.reorder = !S.reorder; render(); }
    if (a === "progress-move") {
      const order = progressOrder(), i = order.indexOf(t.dataset.k), j = i + +t.dataset.d;
      if (i >= 0 && j >= 0 && j < order.length) {
        [order[i], order[j]] = [order[j], order[i]];
        store.set("ritmo.progressOrder", order); render();
        document.querySelector(`[data-act="progress-move"][data-k="${t.dataset.k}"][data-d="${t.dataset.d}"]:not(:disabled)`)?.focus({ preventScroll: true });
      }
    }
    if (a === "progress-reset") { store.set("ritmo.progressOrder", null); render(); }
    if (a === "sessions-all") openSheet({ type: "sessions" }, { opener: t });
    // sheets
    if (a === "sheet-close") closeSheet();
    if (a === "sheet-back") closeSheet(false);
    if (a === "ex-info") openSheet({ type: "exercise", name: t.dataset.name, ref: t.dataset.ref || null, ex: t.dataset.ex === undefined || t.dataset.ex === "" ? null : i }, { push: inSheet, opener: t });
    if (a === "add-ex") openSheet({ type: "picker", mode: "add", q: "", muscle: "all", limit: 30 }, { opener: t });
    if (a === "swap") { const ex = S.draft?.exercises[i]; if (ex) openSheet({ type: "picker", mode: "swap", ex: i, from: ex.name, q: "", muscle: "all", limit: 30 }, { push: inSheet, opener: t }); }
    if (a === "pick-info") openSheet({ type: "exercise", name: t.dataset.name, ref: t.dataset.ref || null, pick: true }, { push: true });
    if (a === "pick-muscle") {
      const s = S.sheet.find((x) => x.type === "picker"); s.muscle = t.dataset.v; s.limit = 30;
      t.parentElement.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", c === t));
      $("#pick-results").innerHTML = pickerResults(s);
    }
    if (a === "pick-more") { const s = topSheet(); s.limit += 30; $("#pick-results").innerHTML = pickerResults(s); }
    if (a === "pick-ex") {
      const s = S.sheet.find((x) => x.type === "picker");
      if (!s || !S.draft) return closeSheet();
      if (s.mode === "swap") swapExercise(s.ex, t.dataset.name, t.dataset.ref || null);
      else addExercise(t.dataset.name, t.dataset.ref || null);
      closeSheet(); render();
      toast(s.mode === "swap" ? `Swapped in ${t.dataset.name}` : `Added ${t.dataset.name}`);
    }
    if (a === "do-swap") { swapExercise(i, t.dataset.name, null); closeSheet(); render(); toast(`Swapped in ${t.dataset.name}`); }
    if (a === "program") {
      const meta = S.data.programs?.programs?.find((m) => m.id === t.dataset.id);
      if (meta) openSheet({ type: "program", meta }, { opener: t });
    }
    if (a === "switch-program") {
      const s = topSheet();
      if (!t.dataset.armed) { // two taps, no pop-up
        t.dataset.armed = "1"; t.textContent = "Tap again to switch";
        setTimeout(() => { if (t.isConnected) { delete t.dataset.armed; t.textContent = "Switch to this program"; } }, 3000);
        return;
      }
      t.disabled = true; t.textContent = "Switching…";
      try {
        await switchProgram(s);
        closeSheet(); render();
        toast(live() ? `Switched to ${s.meta.title}` : "Demo mode: switched here only", 3200);
      } catch (err) { toast(`Couldn't switch: ${err.message}`); t.disabled = false; delete t.dataset.armed; t.textContent = "Switch to this program"; }
    }
    if (a === "rm-ex") {
      const ex = S.draft.exercises[i];
      if ((String(ex?.note || "").trim() || ex?.sets.some((x) => x.done || x.reps !== "" || x.rpe !== "")) && !t.dataset.armed) { toast(`Tap × again to remove ${ex.name}`); return arm(t); }
      S.draft.exercises.splice(i, 1); render();
    }
    if (a === "add-set") { const sets = S.draft.exercises[i].sets, last = sets[sets.length - 1] || {}; sets.push({ reps: "", load: last.load ?? "", rpe: "", auto: (last.load ?? "") !== "", done: false }); render(); }
    if (a === "rm-set") { const sets = S.draft.exercises[i].sets; if (Number.isNaN(j)) sets.pop(); else sets.splice(j, 1); render(); }
    if (a === "ex-note") {
      S.draft.exercises[i].noteOpen = true; render();
      $(`.ex-note input[data-ex="${i}"]`)?.focus(); // same tap, so the iPhone keyboard opens
    }
    if (a === "reset-draft") {
      if (!t.dataset.armed) return arm(t, "Tap again to discard");
      S.draft = null; saveDraft(); toast("Workout discarded"); go("today");
    }
    if (a === "pick-loc" && S.meal) {
      S.meal.location = t.dataset.v; store.set("ritmo.location", t.dataset.v);
      t.parentElement.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === t));
      render();
    }
    if (a === "meal-mode" && S.meal) { S.meal.mode = t.dataset.v; render(); }
    if (a === "pick") {
      const grp = t.parentElement; grp.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", b === t));
      t.closest("form").querySelector(`input[name="${t.dataset.name}"]`).value = t.dataset.v;
    }
    if (a === "demo") { S.cfg.demo = !S.cfg.demo; store.set("ritmo.cfg", S.cfg); await boot(); go("today"); }
    if (a === "sync") flushQueue();
    if (a === "clear-photo") { S.photo = null; render(); }
    if (a === "send-photo") {
      t.disabled = true; t.textContent = "Sending…";
      try {
        await sendPhoto();
        toast(live() ? "Sent. The estimate is ready in about a minute" : "Demo: estimating…");
        S.photo = null; S.meal = null; go("food");
      } catch (err) { toast(err.message === "Write what you ate" ? err.message : `Couldn't send it: ${err.message}`); t.disabled = false; t.textContent = "Estimate with AI"; }
    }
    if (a === "dismiss-pending") { S.pending = S.pending.filter((p) => p.id !== t.dataset.id); savePending(); render(); }
    if (a === "edit-meal") {
      const r = S.data.nutrition[+t.dataset.idx];
      if (!r) return;
      S.photo = null;
      S.meal = { date: r.date.slice(0, 10), meal: r.meal, kcal: r.kcal ?? "", protein_g: r.protein_g ?? "", carbs_g: r.carbs_g ?? "", fat_g: r.fat_g ?? "", editing: r };
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
    if (e.target.id === "session-pick" && S.draft) {
      // Load the new session's blocks. Keep only what was actually logged (ticked or typed sets, filled cardio);
      // untouched blocks from the old session go, so "Walk" never still shows Saturday's intervals.
      const dr = S.draft, fresh = { ...draftFor(e.target.value), choice: e.target.value };
      const logged = (x) => String(x.note || "").trim() || x.sets.some((st) => st.done || st.reps !== "" || st.rpe !== "" || (st.load !== "" && !st.auto));
      const keptEx = dr.exercises.filter(logged), keptDr = (dr.drills || []).filter(drillTouched);
      fresh.exercises = [...keptEx, ...fresh.exercises.filter((x) => !keptEx.some((k) => k.name === x.name))];
      fresh.drills = [...keptDr, ...(fresh.drills || []).filter((b) => !keptDr.some((k) => k.kind === b.kind && k.name === b.name))];
      for (const k of ["date", "startedAt", "restFrom", "duration_min", "rpe", "notes", "editing", "from"]) if (dr[k] !== undefined) fresh[k] = dr[k];
      if (dr.type === "sport" && fresh.type === "sport") fresh.sport = dr.sport;
      S.draft = fresh;
      if (keptEx.length || keptDr.length) toast("Kept what you already logged");
      saveDraft(); render();
      return;
    }
    if (!e.target.classList?.contains("photo-input") || !e.target.files?.[0]) return;
    try {
      const dataUrl = await resizeImage(e.target.files[0]);
      S.photo = { dataUrl };
      render();
    } catch (err) { toast(err.message); }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    queueMicrotask(saveDraft);
    if (t.dataset.dr != null && S.draft?.drills) {
      const b = S.draft.drills[+t.dataset.dr];
      b[t.dataset.df] = t.value;
      const pace = document.getElementById(`pace-${t.dataset.dr}`);
      if (pace) pace.textContent = drillPace(b);
      const mins = document.querySelector('#log-form [data-f="duration_min"]');
      if (mins) mins.placeholder = estMinutes(S.draft) ? `≈ ${estMinutes(S.draft)}` : "";
      return;
    }
    if (t.dataset.sf && S.draft) { S.draft.sport ||= {}; S.draft.sport[t.dataset.sf] = t.value; return; }
    if (t.id === "pick-q") { const s = S.sheet.find((x) => x.type === "picker"); if (s) { s.q = t.value; s.limit = 30; $("#pick-results").innerHTML = pickerResults(s); } return; }
    if (t.dataset.m && S.meal) S.meal[t.dataset.m] = t.value;
    if (!t.dataset.f || !S.draft || !t.closest("#log-form")) return;
    if (t.dataset.set != null) {
      const st = S.draft.exercises[+t.dataset.ex].sets[+t.dataset.set];
      st[t.dataset.f] = t.value;
      if (t.dataset.f === "load" && st.auto) { st.auto = false; t.classList.remove("is-auto"); }
    }
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
        const p = structuredClone(S.data.profile);
        p.sex = fd.sex || null; p.birth_year = +fd.birth_year || null; p.height_cm = +fd.height_cm || null; p.start_weight_kg = +fd.start_weight_kg || null;
        p.units = { ...(p.units || {}), load: fd.load, distance: fd.distance };
        S.data.profile = p;
        if (live()) { const cur = await getFile("data/profile.json"); await putFile("data/profile.json", JSON.stringify(p, null, 2) + "\n", cur.sha, "profile: update"); toast("Profile saved. Targets refresh in about a minute"); }
        else toast("Demo mode: not saved");
        return;
      }
      const kind = f.dataset.kind;
      if (kind === "workout") {
        const dr = S.draft;
        if (dr.startedAt && !dr.editing && dr.duration_min === "") dr.duration_min = String(Math.max(1, Math.round((Date.now() - dr.startedAt) / 60000)));
        const obj = buildWorkout(dr);
        if (!obj.exercises && !obj.conditioning && !obj.duration_min) { toast("Tick at least one set, or add the minutes"); return; }
        if (dr.editing) {
          const orig = dr.editing;
          const cleared = Object.fromEntries(["session", "duration_min", "rpe", "exercises", "conditioning", "sport", "notes"].map((k) => [k, undefined]));
          const next = JSON.parse(JSON.stringify({ ...orig, ...cleared, ...obj }));
          const queued = S.queue.find((q) => q.kind === "workout" && sameEntry(q.obj, orig));
          if (live() && !queued) await replaceLine(LOGS.workout, orig, next, `log: edit workout ${next.date}`);
          if (queued) { queued.obj = next; store.set("ritmo.queue", S.queue); }
          const k = S.data.workouts.findIndex((w) => sameEntry(w, orig));
          if (k >= 0) S.data.workouts[k] = next; else S.data.workouts.push(next);
          S.data.workouts.sort((a, b) => (a.date < b.date ? -1 : 1));
          toast(live() ? "Workout updated" : "Demo mode: updated here only");
          const back = dr.from || "today";
          S.draft = null; saveDraft(); go(back);
        } else {
          await saveEntry("workout", obj);
          S.draft = null; saveDraft(); go("today");
        }
      } else if (kind === "meal") {
        const m = S.meal;
        if (!m.editing) { f.querySelector('[data-act="send-photo"]')?.click(); return; }
        if (!m.kcal && !m.protein_g) { toast("Add calories or protein"); return; }
        const fields = { date: m.date, meal: m.meal, kcal: +m.kcal || 0, protein_g: +m.protein_g || 0, carbs_g: +m.carbs_g || 0, fat_g: +m.fat_g || 0 };
        const orig = m.editing;
        const next = JSON.parse(JSON.stringify({ ...orig, ...fields, ...(orig.source ? { edited: true } : {}) }));
        const queued = S.queue.find((q) => q.obj === orig);
        if (live() && !queued) await replaceLine(LOGS.meal, orig, next, `log: edit ${next.meal} ${next.date}`);
        if (queued) { queued.obj = next; store.set("ritmo.queue", S.queue); }
        S.data.nutrition[S.data.nutrition.indexOf(orig)] = next;
        toast(live() ? "Meal updated" : "Demo mode: updated here only");
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

  // Appearance follows the phone's light/dark setting (no in-app toggle).
  try { localStorage.removeItem("ritmo.theme"); } catch { /* storage unavailable */ }
  delete document.documentElement.dataset.theme;
  $("#settings-btn").addEventListener("click", () => go("settings"));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.sheet.length) { e.preventDefault(); closeSheet(false); } });
  // Return/Done on the iPhone keyboard in a workout text box (exercise note, drill name) closes the keyboard; it must never submit = save the workout
  document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.('#log-form[data-kind="workout"] input')) { e.preventDefault(); e.target.blur(); } });
  window.addEventListener("online", flushQueue);
  setInterval(() => {
    document.querySelectorAll("[data-timer]").forEach((el) => { el.textContent = fmtClock(Date.now() - +el.dataset.timer); });
    document.querySelectorAll("[data-rest]").forEach((el) => { const from = +el.dataset.rest; el.textContent = from && Date.now() - from < 15 * 60000 ? `Rest ${fmtClock(Date.now() - from)}` : ""; });
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveDraft(); });
  window.addEventListener("pagehide", saveDraft);
  // iOS keyboard: size sheets to the visible area so a search bar stays on top instead of sliding under the keyboard.
  const vv = window.visualViewport;
  const syncViewport = () => { if (!vv) return; const st = document.documentElement.style; st.setProperty("--vv-h", `${vv.height}px`); st.setProperty("--vv-top", `${vv.offsetTop}px`); };
  vv?.addEventListener("resize", syncViewport); vv?.addEventListener("scroll", syncViewport); syncViewport();

  // Home-screen apps resume without reloading: refresh when the app comes back to the front.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && S.data && Date.now() - S.loadedAt > 30000) refresh();
  });

  // Pull down from the top of the page to refresh.
  (() => {
    const ptr = $("#ptr");
    let startY = null, dist = 0;
    const reset = () => { startY = null; dist = 0; ptr.style.transform = ""; ptr.classList.remove("ready"); };
    window.addEventListener("touchstart", (e) => { if (window.scrollY <= 0 && !refreshing && !S.sheet.length && e.touches.length === 1) startY = e.touches[0].clientY; }, { passive: true });
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
  // Swipe sideways to move between sections, in tab-bar order (swipe left = next tab, swipe right = previous).
  // Only a clear sideways flick counts, so scrolling never changes the tab. Ignored near the screen edges (iPhone's own
  // gestures), with a sheet open or the keyboard up, and when it starts on something that already uses sideways drags:
  // sliders, segmented controls, scrolling rows and tables, and charts (tap/drag tooltips). Starting on an unfocused field is fine:
  // a moved touch doesn't focus it.
  (() => {
    const TABS = [...document.querySelectorAll(".tabs .tab")].map((b) => b.dataset.view);
    const EDGE = 24, MIN_DX = 60, MAX_MS = 800;
    const SKIP = 'input[type="range"], [contenteditable="true"], .seg, .table-wrap, .chip-row, [id^="ch-"], #muscles, #bench';
    let s = null;
    window.addEventListener("touchstart", (e) => {
      s = null;
      if (e.touches.length !== 1 || S.sheet.length || !TABS.includes(S.view)) return;
      if (document.activeElement?.matches?.("input, textarea, select")) return;
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE || e.target.closest?.(SKIP)) return;
      s = { x: t.clientX, y: t.clientY, at: Date.now() };
    }, { passive: true });
    window.addEventListener("touchcancel", () => { s = null; }, { passive: true });
    window.addEventListener("touchend", (e) => {
      if (!s) return;
      const t = e.changedTouches[0], dx = t.clientX - s.x, dy = t.clientY - s.y, quick = Date.now() - s.at < MAX_MS;
      s = null;
      if (!quick || Math.abs(dx) < MIN_DX || Math.abs(dx) < 1.8 * Math.abs(dy) || S.sheet.length) return;
      const next = TABS[TABS.indexOf(S.view) + (dx < 0 ? 1 : -1)];
      if (!next) return;
      S.slide = dx < 0 ? "slide-l" : "slide-r";
      go(next);
    }, { passive: true });
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
