/* Progression: last time + today's suggested load for one exercise.
   Double progression with an RPE limit (the coaching rules in the private repo's project/INSTRUCTIONS.md):
   - hit the top of the rep range on every set at or below the week's RPE -> add the exercise's step
   - reps there but RPE too high -> repeat the load
   - otherwise -> same load, add reps
   - missed the bottom of the range two sessions in a row -> drop about 10%
   - deload week -> about 80% of last load
   Loads are stored in kg in the logs; suggestions are in the user's unit, rounded to what a gym can load.
   Pure functions, no DOM: works in the browser (window.Progression) and in Node (module.exports). */
(function (root) {
  "use strict";
  const LB = 2.20462;

  // "8-10" -> {lo: 8, hi: 10}; "5" or "8/side" -> {lo, hi} equal; timed or distance work -> null
  function parseReps(reps) {
    const s = String(reps ?? "").trim().toLowerCase();
    if (!s || /\d\s*(s|sec|min|m\b|km|yd)|\bmin\b|seconds|hard|easy/.test(s)) return null;
    const m = s.match(/^(\d+)\s*(?:[-–]\s*(\d+))?(?:\s*\/\s*side|\s*each)?$/);
    if (!m) return null;
    const lo = +m[1], hi = m[2] ? +m[2] : lo;
    return lo > 0 && hi >= lo ? { lo, hi } : null;
  }

  // Sessions with real sets for this exercise, oldest first: [{date, sets}]
  function history(workouts, name) {
    const out = [];
    for (const w of workouts || []) {
      for (const ex of w.exercises || []) {
        if (ex.name !== name) continue;
        const sets = (ex.sets || []).filter((s) => (+s.reps || 0) > 0 || (+s.duration_s || 0) > 0 || (+s.distance_m || 0) > 0);
        if (sets.length) out.push({ date: String(w.date || "").slice(0, 10), sets });
      }
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  const toUnit = (kg, unit) => (unit === "lb" ? kg * LB : kg);
  const roundTo = (v, step) => Math.round(v / step) * step;
  const plate = (unit) => (unit === "lb" ? 5 : 2.5);
  const fmtNum = (v) => (Math.round(v * 10) / 10).toLocaleString(undefined, { maximumFractionDigits: 1 });

  // "185 lb × 5, 5, 5 @ RPE 7"; "5, 5, 5 reps" for bodyweight; "30s, 30s" for holds; "70 lb × 30 m, 30 m" for carries
  function describe(sets, unit) {
    const loads = sets.map((s) => +s.load_kg || 0);
    const top = Math.max(...loads);
    const timed = sets.some((s) => +s.duration_s > 0), dist = !timed && sets.some((s) => +s.distance_m > 0);
    const reps = sets.map((s) => (timed ? `${+s.duration_s || 0}s` : dist ? `${+s.distance_m || 0} m` : s.reps)).join(", ");
    const rpes = sets.map((s) => s.rpe).filter((r) => r != null && r !== "");
    const rpe = rpes.length ? ` @ RPE ${fmtNum(Math.max(...rpes.map(Number)))}` : "";
    if (top <= 0) return `${reps}${timed || dist ? "" : " reps"}${rpe}`;
    const same = loads.every((l) => Math.abs(l - top) < 0.05);
    return `${fmtNum(Math.round(toUnit(top, unit)))} ${unit}${same ? "" : " (top)"} × ${reps}${rpe}`;
  }

  /* opts: {name, reps (plan string), info (exercises.json entry), workouts, targetRpe, deload, unit}
     returns {last, range, kind, load, targetReps, short, text}: load is in `unit` (null when there's nothing to load);
     targetReps is what to aim for today (the log's done tap fills it in);
     short is a compact label for lists ("195 lb", "7+ reps"); text is the full coaching line */
  function suggest(opts) {
    const unit = opts.unit === "kg" ? "kg" : "lb";
    const info = opts.info || {};
    const range = parseReps(opts.reps);
    const hist = history(opts.workouts, opts.name);
    const last = hist[hist.length - 1] || null;
    const lastInfo = last ? { date: last.date, text: describe(last.sets, unit) } : null;
    const target = Number(opts.targetRpe) || 7;
    const base = { last: lastInfo, range, load: null, targetReps: range ? range.lo : null };
    if (!range) return { ...base, kind: "none", short: "", text: "" };
    if (!last) {
      // start: "bodyweight" = moves like back extensions: no weight until the reps are easy
      const text = (Number(info.step_lb) || 0) > 0 && info.start !== "bodyweight"
        ? `First time: pick a load you could lift for ${target <= 6 ? "3-4" : "2-3"} more reps (about RPE ${fmtNum(target)}).`
        : `First time: ${info.start === "bodyweight" ? "no weight. Do" : "do"} the planned reps with clean form, about RPE ${fmtNum(target)}. Quality over speed.`;
      return { ...base, kind: "first", short: "first time", text };
    }

    const topKg = Math.max(...last.sets.map((s) => +s.load_kg || 0));
    const work = last.sets.filter((s) => (+s.load_kg || 0) >= topKg - 0.05);
    const rpes = work.map((s) => s.rpe).filter((r) => r != null && r !== "").map(Number);
    const maxRpe = rpes.length ? Math.max(...rpes) : null;
    const allTop = work.every((s) => +s.reps >= range.hi);
    const missLow = work.some((s) => +s.reps < range.lo);
    const rpeOk = maxRpe == null || maxRpe <= target + 0.5;
    const stepLb = Number(info.step_lb) || 0;
    const bodyweight = topKg <= 0 || stepLb <= 0;
    const best = Math.max(...work.map((s) => +s.reps));

    if (bodyweight) {
      // done with no weight but the move can take some (a plate or dumbbell): the first step up is step_lb
      if (allTop && rpeOk && stepLb > 0) {
        const load = unit === "lb" ? stepLb : Math.max(1.25, roundTo(stepLb / LB, 1.25));
        const s = `${fmtNum(load)} ${unit}${info.per_hand ? " each" : ""}`;
        return { ...base, kind: "up", load, targetReps: range.lo, short: s, text: `You hit ${range.hi} on every set with no weight: hold ${s} today (a plate or dumbbell).` };
      }
      if (allTop && rpeOk) return { ...base, kind: "reps-up", targetReps: range.hi, short: "go harder", text: `You hit ${range.hi} on every set: add a little load or a harder version.` };
      const aim = Math.min(best + 1, range.hi);
      return { ...base, kind: "reps", targetReps: aim, short: `${aim}+ reps`, text: `Beat last time: aim for ${aim}+ reps per set.` };
    }

    const lastLoad = toUnit(topKg, unit);
    const step = unit === "lb" ? stepLb : Math.max(1.25, roundTo(stepLb / LB, 1.25));
    const per = info.per_hand ? " per dumbbell" : "";
    const short = (load) => `${fmtNum(load)} ${unit}${info.per_hand ? " each" : ""}`;
    if (opts.deload) {
      const load = Math.max(plate(unit), roundTo(lastLoad * 0.8, plate(unit)));
      return { ...base, kind: "deload", load, short: short(load), text: `Deload week: about 80% of last time, ${fmtNum(load)} ${unit}${per}.` };
    }
    const prev = hist[hist.length - 2];
    const prevMiss = prev && prev.sets.some((s) => (+s.load_kg || 0) >= topKg - 0.05 && +s.reps < range.lo);
    if (missLow && prevMiss) {
      const load = Math.max(plate(unit), roundTo(lastLoad * 0.9, plate(unit)));
      return { ...base, kind: "down", load, short: short(load), text: `Missed ${range.lo} reps two sessions in a row: drop to ${fmtNum(load)} ${unit}${per} and build back up.` };
    }
    if (allTop && rpeOk) {
      const load = roundTo(lastLoad + step, unit === "lb" ? 2.5 : 1.25);
      return { ...base, kind: "up", load, short: short(load), text: `You hit ${range.hi} on every set${maxRpe != null ? ` at RPE ${fmtNum(maxRpe)}` : ""}: +${fmtNum(step)} ${unit}, so ${fmtNum(load)} ${unit}${per} today.${maxRpe == null ? " Log RPE for sharper suggestions." : ""}` };
    }
    const load = roundTo(lastLoad, unit === "lb" ? 2.5 : 1.25);
    if (allTop) return { ...base, kind: "hold", load, targetReps: range.hi, short: short(load), text: `Reps were there but it felt hard (RPE ${fmtNum(maxRpe)}): repeat ${fmtNum(load)} ${unit}${per} and own it.` };
    return { ...base, kind: "hold", load, targetReps: Math.min(best + 1, range.hi), short: short(load), text: `Same load, more reps: aim for ${Math.min(best + 1, range.hi)}+ until every set hits ${range.hi}.` };
  }

  const api = { parseReps, history, describe, suggest };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Progression = api;
})(typeof window !== "undefined" ? window : globalThis);
