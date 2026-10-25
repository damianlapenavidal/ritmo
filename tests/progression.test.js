// Run: node tests/progression.test.js   (no dependencies)
const assert = require("assert");
const P = require("../progression.js");

const LB = 2.20462;
const kg = (lb) => Math.round((lb / LB) * 10) / 10; // logs store kg rounded to 0.1, like the app
const session = (date, name, sets) => ({ date, type: "lift", exercises: [{ name, sets }] });
const sets = (lb, reps, rpe) => reps.map((r) => ({ reps: r, load_kg: kg(lb), ...(rpe != null ? { rpe } : {}) }));
const tbd = { step_lb: 10 };
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok", name); };

t("parseReps", () => {
  assert.deepStrictEqual(P.parseReps("8-10"), { lo: 8, hi: 10 });
  assert.deepStrictEqual(P.parseReps("5"), { lo: 5, hi: 5 });
  assert.deepStrictEqual(P.parseReps("8/side"), { lo: 8, hi: 8 });
  assert.deepStrictEqual(P.parseReps("10 – 12"), { lo: 10, hi: 12 });
  for (const s of ["30s/side", "15-20s/side", "20 m at ~85%", "1 min hard / 1 min easy", "30 m", "", null]) assert.strictEqual(P.parseReps(s), null, s);
});

t("first time", () => {
  const r = P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: [], targetRpe: 6, unit: "lb" });
  assert.strictEqual(r.kind, "first");
  assert.strictEqual(r.load, null);
  assert.match(r.text, /3-4 more reps/);
});

t("all sets at top of range, RPE ok -> add step, rounded to plates", () => {
  const w = [session("2026-10-26", "Trap Bar Deadlift", sets(185, [5, 5, 5], 6))];
  const r = P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: w, targetRpe: 6, unit: "lb" });
  assert.strictEqual(r.kind, "up");
  assert.strictEqual(r.load, 195);
  assert.strictEqual(r.last.text, "185 lb × 5, 5, 5 @ RPE 6");
  assert.strictEqual(r.short, "195 lb");
  assert.match(r.text, /\+10 lb, so 195 lb today/);
});

t("top of range but RPE too high -> hold", () => {
  const w = [session("2026-10-26", "Trap Bar Deadlift", sets(185, [5, 5, 5], 8))];
  const r = P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: w, targetRpe: 6.5, unit: "lb" });
  assert.strictEqual(r.kind, "hold");
  assert.strictEqual(r.load, 185);
  assert.match(r.text, /felt hard/);
});

t("inside the range -> same load, more reps", () => {
  const w = [session("2026-10-26", "Dumbbell Bench Press", sets(40, [9, 8, 8], 7))];
  const r = P.suggest({ name: "Dumbbell Bench Press", reps: "8-10", info: { step_lb: 5, per_hand: true }, workouts: w, targetRpe: 7, unit: "lb" });
  assert.strictEqual(r.kind, "hold");
  assert.strictEqual(r.load, 40);
  assert.match(r.text, /aim for 10\+/);
  assert.strictEqual(r.short, "40 lb each");
  assert.match(r.text, /per dumbbell|aim/);
});

t("missed bottom twice in a row -> drop ~10%", () => {
  const w = [session("2026-10-26", "Back Squat", sets(200, [6, 5, 4], 9)), session("2026-10-29", "Back Squat", sets(200, [6, 5, 5], 9))];
  const r = P.suggest({ name: "Back Squat", reps: "6-8", info: tbd, workouts: w, targetRpe: 7, unit: "lb" });
  assert.strictEqual(r.kind, "down");
  assert.strictEqual(r.load, 180);
});

t("deload week -> 80%", () => {
  const w = [session("2026-11-26", "Back Squat", sets(225, [5, 5, 5], 7))];
  const r = P.suggest({ name: "Back Squat", reps: "5", info: tbd, workouts: w, targetRpe: 6, deload: true, unit: "lb" });
  assert.strictEqual(r.kind, "deload");
  assert.strictEqual(r.load, 180);
});

t("bodyweight -> reps-based", () => {
  const w = [session("2026-10-26", "Assisted Pull-up", [{ reps: 6, load_kg: 0 }, { reps: 5, load_kg: 0 }])];
  const r = P.suggest({ name: "Assisted Pull-up", reps: "6-8", info: { step_lb: 0 }, workouts: w, targetRpe: 6, unit: "lb" });
  assert.strictEqual(r.kind, "reps");
  assert.strictEqual(r.load, null);
  assert.strictEqual(r.last.text, "6, 5 reps");
  assert.strictEqual(r.short, "7+ reps");
});

t("no RPE logged still progresses, with a nudge", () => {
  const w = [session("2026-10-26", "Trap Bar Deadlift", sets(135, [5, 5, 5]))];
  const r = P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: w, targetRpe: 6, unit: "lb" });
  assert.strictEqual(r.kind, "up");
  assert.match(r.text, /Log RPE/);
});

t("uses the most recent session and ignores other exercises", () => {
  const w = [
    session("2026-10-29", "Trap Bar Deadlift", sets(195, [5, 5, 4], 7)),
    session("2026-10-26", "Trap Bar Deadlift", sets(185, [5, 5, 5], 6)),
    session("2026-10-30", "Back Squat", sets(300, [5, 5, 5], 6)),
  ];
  const r = P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: w, targetRpe: 6.5, unit: "lb" });
  assert.strictEqual(r.last.date, "2026-10-29");
  assert.strictEqual(r.load, 195);
});

t("kg users get kg steps", () => {
  const w = [session("2026-10-26", "Trap Bar Deadlift", [{ reps: 5, load_kg: 80, rpe: 6 }])];
  const r = P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: w, targetRpe: 6, unit: "kg" });
  assert.strictEqual(r.load, 85);
});

t("first time on a bodyweight move talks about form, not load", () => {
  const r = P.suggest({ name: "Box Jump", reps: "4", info: { step_lb: 0 }, workouts: [], targetRpe: 6, unit: "lb" });
  assert.strictEqual(r.kind, "first");
  assert.match(r.text, /clean form/);
});

t("target reps for the done tap", () => {
  const up = [session("2026-10-26", "Trap Bar Deadlift", sets(185, [5, 5, 5], 6))];
  assert.strictEqual(P.suggest({ name: "Trap Bar Deadlift", reps: "5", info: tbd, workouts: up, targetRpe: 6, unit: "lb" }).targetReps, 5);
  const hold = [session("2026-10-26", "Dumbbell Bench Press", sets(40, [9, 8, 8], 7))];
  assert.strictEqual(P.suggest({ name: "Dumbbell Bench Press", reps: "8-10", info: { step_lb: 5 }, workouts: hold, targetRpe: 7, unit: "lb" }).targetReps, 10);
  const up2 = [session("2026-10-26", "Dumbbell Bench Press", sets(40, [10, 10, 10], 7))];
  assert.strictEqual(P.suggest({ name: "Dumbbell Bench Press", reps: "8-10", info: { step_lb: 5 }, workouts: up2, targetRpe: 7, unit: "lb" }).targetReps, 8);
  assert.strictEqual(P.suggest({ name: "New", reps: "8-12", info: { step_lb: 5 }, workouts: [], unit: "lb" }).targetReps, 8);
});

t("holds and carries show up as last time", () => {
  const w = [session("2026-10-26", "Side Plank", [{ reps: 0, duration_s: 30, load_kg: 0 }, { reps: 0, duration_s: 25, load_kg: 0 }]),
    session("2026-10-26", "Farmer Carry", [{ reps: 0, distance_m: 30, load_kg: kg(70) }, { reps: 0, distance_m: 30, load_kg: kg(70) }])];
  const plank = P.suggest({ name: "Side Plank", reps: "30s/side", info: {}, workouts: w, unit: "lb" });
  assert.strictEqual(plank.kind, "none");
  assert.strictEqual(plank.last.text, "30s, 25s");
  assert.strictEqual(P.suggest({ name: "Farmer Carry", reps: "30 m", info: { step_lb: 5 }, workouts: w, unit: "lb" }).last.text, "70 lb × 30 m, 30 m");
});

t("timed holds: no suggestion", () => {
  const r = P.suggest({ name: "Side Plank", reps: "30s/side", info: {}, workouts: [], unit: "lb" });
  assert.strictEqual(r.kind, "none");
});

console.log(`\n${n} tests passed`);
