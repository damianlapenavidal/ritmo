/* Forma - personal training + nutrition app.
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
  };

  function toast(msg, ms = 2600) {
    const t = document.createElement("div");
    t.className = "toast"; t.role = "status"; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), ms);
  }

  // ---------- state ----------
  const S = {
    cfg: Object.assign({ owner: "", repo: "fitness-coach", branch: "main", token: "", demo: true }, store.get("forma.cfg", {})),
    data: null,
    view: "today",
    logTab: "workout",
    draft: null,
    meal: null,
    queue: store.get("forma.queue", []),
  };
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
      store.set("forma.queue", S.queue);
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
        store.set("forma.queue", S.queue);
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
        ${statTile("Sessions this week", doneWeek.length, `/ ${planned}`, `${sum(doneWeek.filter((w) => w.type !== "lift"), "duration_min")} min conditioning`, (100 * doneWeek.length) / Math.max(planned, 1))}
      </div>
      <section class="card">
        <div class="card-head"><div class="session-title"><h2>Today's session</h2><span class="pill">${esc(sess.type)}</span>${doneToday ? `<span class="pill">${icon.check} Logged</span>` : ""}</div></div>
        ${sess.blocks?.length ? `<ul class="ex-list">${sess.blocks.map((b) => `<li><span>${esc(b.exercise)}</span><span class="dose">${esc(b.sets)} × ${esc(b.reps)}</span>${b.note ? `<span class="note">${esc(b.note)}</span>` : ""}</li>`).join("")}</ul>` : `<p class="muted">Recovery day. A 20-30 min walk and some mobility work count.</p>`}
        ${d.program.warmup && sess.blocks?.length ? `<p class="small muted" style="margin-top:10px">Warm-up: ${esc(d.program.warmup)}</p>` : ""}
        <div class="btn-row" style="margin-top:12px">
          ${sess.blocks?.length ? `<button class="btn primary" data-act="log-session" data-dow="${dow}">Log this session</button>` : ""}
          <button class="btn" data-act="goto-log" data-tab="meal">+ Meal</button>
          <button class="btn" data-act="goto-log" data-tab="body">+ Check-in</button>
        </div>
      </section>
      ${r.flags?.length ? `<section class="card"><div class="card-head"><h2>Coach flags</h2><span class="small muted">updated ${esc(r.as_of || "")}</span></div>${r.flags.map((f) => `<div class="flag ${f.level === "warn" ? "warn" : "info"}">${f.level === "warn" ? icon.warn : icon.info}<span><span class="sr-only">${f.level}: </span>${esc(f.msg)}</span></div>`).join("")}</section>` : ""}
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
        <label class="field"><span>Type</span><select data-f="type">${["lift", "conditioning", "sport"].map((t) => `<option ${dr.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="field"><span>Session</span><input data-f="session" value="${esc(dr.session)}" placeholder="Gym A"></label>
        <label class="field"><span>Minutes</span><input type="number" inputmode="numeric" data-f="duration_min" value="${esc(dr.duration_min)}"></label>
      </div>
      <datalist id="ex-names">${names.map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
      <div>${dr.exercises.map((ex, i) => `
        <div class="ex-block">
          <div style="display:flex;gap:8px;align-items:center">
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

  function mealForm() {
    S.meal ||= newMeal();
    const m = S.meal;
    return `
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" data-m="date" value="${esc(m.date)}"></label>
        <label class="field"><span>Meal</span><select data-m="meal">${["breakfast", "lunch", "dinner", "snack"].map((t) => `<option ${m.meal === t ? "selected" : ""}>${t}</option>`).join("")}</select></label>
      </div>
      <div><div class="eyebrow" style="margin-bottom:6px">Quick add (estimates)</div>
        <div class="chips">${S.data.foods.map((f, i) => `<button type="button" class="chip" data-act="add-food" data-i="${i}">${esc(f.name)}</button>`).join("")}</div>
      </div>
      ${m.items.length ? `<p class="small"><b>Items:</b> ${esc(m.items.join(", "))} <button type="button" class="btn small ghost" data-act="clear-food">Clear</button></p>` : ""}
      <div class="form-grid">
        ${[["kcal", "Calories"], ["protein_g", "Protein g"], ["carbs_g", "Carbs g"], ["fat_g", "Fat g"]].map(([k, l]) => `<label class="field"><span>${l}</span><input type="number" inputmode="decimal" step="any" data-m="${k}" value="${esc(m[k])}"></label>`).join("")}
        <label class="field full"><span>What else</span><input data-m="extra" value="${esc(m.extra || "")}" placeholder="e.g. stir-fry station, extra chicken"></label>
      </div>
      <p class="small muted">For exact numbers, look the item up in <a href="https://web.uri.edu/dining/whatisnetnutrition" target="_blank" rel="noopener">URI NetNutrition</a> and type them in. Quick-add values are rough averages.</p>
      <div class="btn-row"><button class="btn primary" type="submit">Save meal</button></div>`;
  }

  function bodyForm() {
    const last = S.data.body.filter((b) => b.weight_kg).slice(-1)[0];
    const scale = (name, label) => `<div><div class="eyebrow" style="margin-bottom:6px">${label}</div><div class="seg" role="radiogroup" aria-label="${label}">${[1, 2, 3, 4, 5].map((v) => `<button type="button" data-act="pick" data-name="${name}" data-v="${v}" aria-pressed="false">${v}</button>`).join("")}</div><input type="hidden" name="${name}"></div>`;
    return `
      <div class="form-grid">
        <label class="field"><span>Date</span><input type="date" name="date" value="${today()}"></label>
        <label class="field"><span>Weight kg</span><input type="number" inputmode="decimal" step="0.1" name="weight_kg" placeholder="${last ? last.weight_kg : ""}"></label>
        <label class="field"><span>Sleep hours</span><input type="number" inputmode="decimal" step="0.25" name="sleep_h"></label>
        <label class="field"><span>Waist cm (optional)</span><input type="number" inputmode="decimal" step="0.5" name="waist_cm"></label>
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
        <label class="field"><span>Date</span><input type="date" name="date" value="${today()}"></label>
        <label class="field"><span>Test</span><select name="test">${bms.map((b) => `<option value="${esc(b.test)}" data-unit="${esc(b.unit)}">${esc(b.test)} (${esc(b.unit)})</option>`).join("")}</select></label>
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
      <p class="small muted">Estimated 1-rep max (Epley) from your best set each session, in ${loadUnit()}.</p></section>
    <div class="grid-2">
      <section class="card"><div class="card-head"><h3>Sessions per week</h3></div><div id="ch-sessions"></div></section>
      <section class="card"><div class="card-head"><h3>Conditioning minutes</h3></div><div id="ch-cond"></div></section>
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
    const sel = store.get("forma.lift", names[0]);
    if (names.includes(sel)) pick.value = sel;
    const drawLift = () => { store.set("forma.lift", pick.value); Charts.line($("#ch-lift"), { label: `${pick.value} estimated 1RM`, series: [{ name: "e1RM", color: "var(--series-2)", points: lifts[pick.value] || [], dots: true, dotOpacity: 1 }], yFmt: (v) => `${Math.round(v)} ${loadUnit()}` }); };
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
    $("#bench").innerHTML = rows.length ? `<table><thead><tr><th>Test</th><th class="num">First</th><th class="num">Latest</th><th></th></tr></thead><tbody>${rows.map(([n, b]) => `<tr><td>${esc(n)}</td><td class="num">${esc(b.first)} ${esc(b.unit || "")}</td><td class="num">${esc(b.latest)} ${esc(b.unit || "")}</td><td>${b.improved === true ? `<span class="pill">${icon.check} better</span>` : b.improved === false ? '<span class="pill">not yet</span>' : ""}</td></tr>`).join("")}</tbody></table>` : '<div class="empty">Log your first benchmarks in Log → Benchmark</div>';
  }

  // ---- food ----
  views.food = () => {
    const iso = today(), n = dayNutrition(iso), tg = targets();
    const cell = (k, label, unit) => `<div>${label}<b>${Math.round(n[k])}</b><span class="small muted">${tg[k] ? `/ ${tg[k]} ${unit}` : unit}</span></div>`;
    return `<h1>Food</h1>
      <section class="card"><div class="card-head"><h2>Today</h2><button class="btn small" data-act="goto-log" data-tab="meal">+ Meal</button></div>
        <div class="totals">${cell("kcal", "Calories", "kcal")}${cell("protein_g", "Protein", "g")}${cell("carbs_g", "Carbs", "g")}${cell("fat_g", "Fat", "g")}</div>
        ${n.rows.length ? `<ul class="ex-list" style="margin-top:12px">${n.rows.map((r) => `<li><span><b>${esc(r.meal)}</b> <span class="muted">${esc(r.items || "")}</span></span><span class="dose">${Math.round(r.kcal || 0)} kcal · ${Math.round(r.protein_g || 0)} g P</span></li>`).join("")}</ul>` : '<div class="empty">Nothing logged today</div>'}
      </section>
      <div class="grid-2">
        <section class="card"><div class="card-head"><h3>Calories, last 14 days</h3></div><div id="ch-kcal"></div><div class="legend"><span><i class="dash"></i>Target</span></div></section>
        <section class="card"><div class="card-head"><h3>Protein, last 14 days</h3></div><div id="ch-protein"></div><div class="legend"><span><i class="dash"></i>Target</span></div></section>
      </div>
      <section class="card"><h2>Dining hall playbook</h2>
        <ul class="small" style="padding-left:18px;margin:8px 0 0">
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
    Charts.bars($("#ch-kcal"), { label: "Calories per day", color: "var(--series-2)", target: tg.kcal, height: 180, bars: days.map((s) => ({ label: lab(s), title: Charts.fmtDate(s), value: Math.round(dayNutrition(s).kcal) })), yFmt: (v) => `${Math.round(v)} kcal` });
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
    return `<div><div class="eyebrow">${esc(p.phase || "")}${r.phase_week ? ` · week ${r.phase_week} of ${p.weeks}` : ""}</div><h1>${esc(p.title || "Plan")}</h1></div>
      ${r.phase_week && p.intensity_by_week?.[r.phase_week] ? `<div class="banner">This week: ${esc(p.intensity_by_week[r.phase_week])}</div>` : ""}
      <section class="card"><h2>The week</h2>
        <ul class="ex-list" style="margin-top:8px">${order.map((k) => { const s = p.week_template?.[k] || {}; return `<li><span><b>${k}</b>${k === dow ? ' <span class="pill">today</span>' : ""}<br>${esc(s.name || "Rest")}</span><span class="dose">${esc(s.type || "")}</span>${s.blocks?.length ? `<span class="note">${s.blocks.map((b) => esc(b.exercise)).join(" · ")}</span>` : ""}</li>`; }).join("")}</ul>
      </section>
      <section class="card"><div class="card-head"><h2>Weekly report</h2><span class="small muted">${esc(S.data.weekly?.name || "")}</span></div>
        <div class="md">${S.data.weekly ? md(S.data.weekly.text) : '<div class="empty">The first report appears the Monday after you start logging.</div>'}</div></section>
      <section class="card"><h2>Benchmarks</h2><ul class="ex-list" style="margin-top:8px">${(p.benchmarks || []).map((b) => `<li><span>${esc(b.test)}</span><span class="dose">${esc(b.unit)} · ${b.better} is better</span>${b.note ? `<span class="note">${esc(b.note)}</span>` : ""}</li>`).join("")}</ul></section>`;
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
          <label class="field"><span>Sex</span><select name="sex"><option value="">–</option>${["male", "female"].map((s) => `<option ${p.sex === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label class="field"><span>Birth year</span><input type="number" name="birth_year" value="${esc(p.birth_year || "")}"></label>
          <label class="field"><span>Height cm</span><input type="number" step="0.5" name="height_cm" value="${esc(p.height_cm || "")}"></label>
          <label class="field"><span>Start weight kg</span><input type="number" step="0.1" name="start_weight_kg" value="${esc(p.start_weight_kg || "")}"></label>
          <label class="field"><span>Gym load unit</span><select name="load">${["lb", "kg"].map((s) => `<option ${loadUnit() === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label class="field"><span>Phase</span><select name="phase">${["phase-1", "phase-2"].map((s) => `<option ${p.phase?.current === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
          <label class="field full"><span>Phase start date</span><input type="date" name="start_date" value="${esc(p.phase?.start_date || "")}"></label>
        </div>
        <div class="btn-row"><button class="btn primary" type="submit">Save profile</button></div>
      </form>` : ""}`;
  };

  // ---------- render + events ----------
  const after = { progress: drawProgress, food: drawFood };
  function render() {
    const v = S.view;
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-current", t.dataset.view === v ? "page" : "false"));
    const r = S.data?.report;
    $("#phase-label").textContent = r ? `${r.phase}${r.phase_week ? ` · wk ${r.phase_week}` : ""}${live() ? "" : " · demo"}` : "";
    $("#view").innerHTML = S.data || v === "settings" ? views[v]() : '<div class="empty">Loading…</div>';
    after[v]?.();
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
    if (a === "demo") { S.cfg.demo = !S.cfg.demo; store.set("forma.cfg", S.cfg); await boot(); go("today"); }
    if (a === "sync") flushQueue();
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
        store.set("forma.cfg", S.cfg);
        await boot();
        if (S.data) { toast("Connected"); flushQueue(); go("today"); }
        return;
      }
      if (f.id === "profile-form") {
        const fd = Object.fromEntries(new FormData(f));
        const p = structuredClone(S.data.profile);
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
        await saveEntry("meal", { date: m.date, meal: m.meal, items: items || undefined, kcal: +m.kcal || 0, protein_g: +m.protein_g || 0, carbs_g: +m.carbs_g || 0, fat_g: +m.fat_g || 0 });
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
  applyTheme(store.get("forma.theme", null));
  $("#theme-btn").addEventListener("click", () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark"; applyTheme(next); store.set("forma.theme", next); render();
  });
  $("#settings-btn").addEventListener("click", () => go("settings"));
  window.addEventListener("online", flushQueue);
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => S.data && after[S.view]?.(), 200); });

  async function boot() {
    S.data = null; render();
    try { await loadAll(); }
    catch (err) { S.data = null; toast(`Couldn't load data: ${err.message}. Check owner, repo and token.`, 5000); S.view = "settings"; }
    render();
  }

  S.view = (location.hash.slice(1) || "today"); if (!views[S.view]) S.view = "today";
  boot();
})();
