import { describe, it, expect } from "vitest";
import { buildRoutinePayload } from "../src/routine-builder";

const IDS = new Set(["SQ1", "BP1"]);

describe("buildRoutinePayload", () => {
  it("rejects unknown template ids with a helpful message", () => {
    expect(() =>
      buildRoutinePayload(
        { title: "Day 1", exercises: [{ exercise_template_id: "NOPE", sets: [{ reps: 5 }] }] },
        IDS,
      ),
    ).toThrowError(/NOPE.*search_exercises/s);
  });

  it("never emits rpe and folds it into notes", () => {
    const p = buildRoutinePayload(
      {
        title: "Day 1",
        exercises: [{
          exercise_template_id: "SQ1",
          notes: "Comp stance.",
          sets: [
            { type: "warmup", weight_kg: 60, reps: 5 },
            { type: "normal", weight_kg: 140, reps: 5, rpe: 7.5 },
          ],
        }],
      },
      IDS,
    );
    const ex = p.routine.exercises[0];
    for (const s of ex.sets) expect(s).not.toHaveProperty("rpe");
    expect(ex.notes).toBe("Comp stance. Top set @ RPE 7.5");
  });

  it("converts weight_lb to kg at full precision so the Hevy app displays the exact lb value", () => {
    const p = buildRoutinePayload(
      { title: "D", exercises: [{ exercise_template_id: "BP1", sets: [{ weight_lb: 225, reps: 5 }] }] },
      IDS,
    );
    // 225 × 0.45359237 = 102.05828325 → 6dp. (2dp storage made the app show .99 artifacts.)
    expect(p.routine.exercises[0].sets[0].weight_kg).toBe(102.058283);
  });

  it("135 lb round-trips to a kg value the app displays as exactly 135.00", () => {
    const p = buildRoutinePayload(
      { title: "D", exercises: [{ exercise_template_id: "BP1", sets: [{ weight_lb: 135, reps: 5 }] }] },
      IDS,
    );
    const kg = p.routine.exercises[0].sets[0].weight_kg!;
    expect(kg).toBe(61.23497);
    // Hevy displays lb rounded to 0.01 — must be 135.00, not 134.99 (the reported bug).
    expect(Math.round((kg / 0.45359237) * 100) / 100).toBe(135);
  });

  it("prefers weight_kg when both are given", () => {
    const p = buildRoutinePayload(
      { title: "D", exercises: [{ exercise_template_id: "BP1", sets: [{ weight_kg: 100, weight_lb: 999, reps: 5 }] }] },
      IDS,
    );
    expect(p.routine.exercises[0].sets[0].weight_kg).toBe(100);
  });

  it("fills defaults: normal set type, null weight/reps, null folder", () => {
    const p = buildRoutinePayload(
      { title: "D", exercises: [{ exercise_template_id: "SQ1", sets: [{}] }] },
      IDS,
    );
    expect(p.routine.folder_id).toBeNull();
    const s = p.routine.exercises[0].sets[0];
    expect(s.type).toBe("normal");
    expect(s.weight_kg).toBeNull();
    expect(s.reps).toBeNull();
    expect(s.distance_meters).toBeNull();
    expect(s.duration_seconds).toBeNull();
    expect(s.custom_metric).toBeNull();
  });

  it("snaps weight_lb to the nearest 2.5 lb before converting to kg", () => {
    const p = buildRoutinePayload(
      { title: "T", exercises: [{ exercise_template_id: "SQ1", sets: [{ weight_lb: 183.7, reps: 5 }] }] },
      IDS,
    );
    // 183.7 -> 182.5 lb -> 82.780608 kg (6dp)
    expect(p.routine.exercises[0].sets[0].weight_kg).toBe(82.780608);
  });

  it("converts an already-on-increment weight_lb exactly (225 lb -> 102.058283 kg)", () => {
    const p = buildRoutinePayload(
      { title: "T", exercises: [{ exercise_template_id: "SQ1", sets: [{ weight_lb: 225, reps: 3 }] }] },
      IDS,
    );
    expect(p.routine.exercises[0].sets[0].weight_kg).toBe(102.058283);
  });

  it("never snaps weight_kg inputs (round-trip safety)", () => {
    const p = buildRoutinePayload(
      { title: "T", exercises: [{ exercise_template_id: "SQ1", sets: [{ weight_kg: 102.06, reps: 3 }] }] },
      IDS,
    );
    expect(p.routine.exercises[0].sets[0].weight_kg).toBe(102.06);
  });

  it("passes duration/distance/custom_metric set targets through", () => {
    const p = buildRoutinePayload(
      {
        title: "T",
        exercises: [{ exercise_template_id: "SQ1", sets: [{ duration_seconds: 60, distance_meters: 1000, custom_metric: 12 }] }],
      },
      IDS,
    );
    expect(p.routine.exercises[0].sets[0]).toEqual({
      type: "normal",
      weight_kg: null,
      reps: null,
      distance_meters: 1000,
      duration_seconds: 60,
      custom_metric: 12,
    });
  });

  it("replaces an existing RPE fold instead of appending a duplicate", () => {
    const p = buildRoutinePayload(
      {
        title: "T",
        exercises: [{
          exercise_template_id: "SQ1",
          notes: "Pause each rep Top set @ RPE 8",
          sets: [{ weight_lb: 225, reps: 3, rpe: 9 }],
        }],
      },
      IDS,
    );
    expect(p.routine.exercises[0].notes).toBe("Pause each rep Top set @ RPE 9");
  });

  it("leaves an identical RPE fold single on a no-change round-trip", () => {
    const p = buildRoutinePayload(
      {
        title: "T",
        exercises: [{
          exercise_template_id: "SQ1",
          notes: "Top set @ RPE 8.5/9",
          sets: [{ weight_lb: 225, reps: 3, rpe: 8.5 }, { weight_lb: 230, reps: 2, rpe: 9 }],
        }],
      },
      IDS,
    );
    expect(p.routine.exercises[0].notes).toBe("Top set @ RPE 8.5/9");
  });

  it("preserves an existing RPE fold when echoed sets carry no rpe", () => {
    const p = buildRoutinePayload(
      {
        title: "T",
        exercises: [{
          exercise_template_id: "SQ1",
          notes: "Pause each rep Top set @ RPE 8",
          sets: [{ weight_kg: 102.06, reps: 3 }],
        }],
      },
      IDS,
    );
    expect(p.routine.exercises[0].notes).toBe("Pause each rep Top set @ RPE 8");
  });

  it("no-change echo round-trip is byte-identical for a get_routine-shaped exercise", () => {
    const p = buildRoutinePayload(
      {
        title: "T",
        exercises: [{
          exercise_template_id: "SQ1",
          superset_id: null,
          rest_seconds: 180,
          notes: "Belt up Top set @ RPE 9",
          sets: [
            { type: "normal", weight_kg: 102.06, reps: 3 },
            { type: "normal", duration_seconds: 60 },
          ],
        }],
      },
      IDS,
    );
    expect(p.routine.exercises[0]).toEqual({
      exercise_template_id: "SQ1",
      superset_id: null,
      rest_seconds: 180,
      notes: "Belt up Top set @ RPE 9",
      sets: [
        { type: "normal", weight_kg: 102.06, reps: 3, distance_meters: null, duration_seconds: null, custom_metric: null },
        { type: "normal", weight_kg: null, reps: null, distance_meters: null, duration_seconds: 60, custom_metric: null },
      ],
    });
  });
});
