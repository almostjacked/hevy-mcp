import { describe, it, expect } from "vitest";
import { HevyApiError, type WorkoutsPage } from "../src/hevy-client";
import { estimate1RM, formatSet, topSet, summarizeWorkout, groupExerciseHistory, scanWorkouts } from "../src/workouts";
import { WORKOUT_A, WORKOUT_B } from "./fixtures/workouts";

describe("estimate1RM", () => {
  it("uses Epley rounded to 1 decimal", () => {
    expect(estimate1RM(100, 5)).toBe(116.7);
    expect(estimate1RM(97.5, 5)).toBe(113.8);
  });
  it("returns the weight itself for a single", () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });
  it("returns null without both weight and positive reps", () => {
    expect(estimate1RM(null, 5)).toBeNull();
    expect(estimate1RM(100, null)).toBeNull();
    expect(estimate1RM(100, 0)).toBeNull();
  });
});

describe("formatSet / topSet", () => {
  it("formats weight+reps in lb, reps-only, duration", () => {
    expect(formatSet(WORKOUT_A.exercises[0].sets[1])).toBe("220 lb × 5");
    expect(formatSet(WORKOUT_A.exercises[1].sets[0])).toBe("12 reps");
    expect(formatSet({ index: 0, type: "normal", weight_kg: null, reps: null, distance_meters: null, duration_seconds: 60, rpe: null, custom_metric: null })).toBe("60 s");
  });
  it("topSet ignores warmups and ranks by estimated 1RM", () => {
    // 100x5 (est 116.7) beats 102.5x3 (est 112.8); warmup 60x10 (est 80) is excluded anyway.
    expect(topSet(WORKOUT_A.exercises[0].sets)?.weight_kg).toBe(100);
  });
  it("topSet falls back to warmup sets when there are no working sets, and null when empty", () => {
    const warmupOnly = [WORKOUT_A.exercises[0].sets[0]];
    expect(topSet(warmupOnly)?.weight_kg).toBe(60);
    expect(topSet([])).toBeNull();
  });
});

describe("summarizeWorkout", () => {
  it("produces a compact summary with duration and per-exercise top set", () => {
    const s = summarizeWorkout(WORKOUT_A);
    expect(s).toEqual({
      id: "w1",
      title: "Push Day",
      date: "2026-07-13T10:00:00Z",
      duration_minutes: 65,
      exercises: [
        { title: "Bench Press (Barbell)", exercise_template_id: "BENCH", set_count: 3, top_set: "220 lb × 5" },
        { title: "Pull Up", exercise_template_id: "PULLUP", set_count: 1, top_set: "12 reps" },
      ],
    });
  });
});

describe("groupExerciseHistory", () => {
  const row = (over: Partial<import("../src/hevy-client").ExerciseHistoryRow>) => ({
    workout_id: "w1", workout_title: "Push Day", workout_start_time: "2026-07-13T10:00:00Z",
    workout_end_time: "2026-07-13T11:00:00Z", exercise_template_id: "BENCH",
    weight_kg: null, reps: null, distance_meters: null, duration_seconds: null,
    rpe: null, custom_metric: null, set_type: "normal", ...over,
  });

  it("groups flat rows into per-workout entries, newest first, with best est 1RM in lb", () => {
    const rows = [
      // w2 interleaved between w1's rows to prove grouping merges non-contiguous rows by workout_id
      // (not just contiguous runs), while w1's own sets stay in row order: warmup, 100, 102.5.
      row({ set_type: "warmup", weight_kg: 60, reps: 10 }),
      row({ workout_id: "w2", workout_start_time: "2026-07-06T10:00:00Z", workout_title: "Push Day", weight_kg: 97.5, reps: 5 }),
      row({ weight_kg: 100, reps: 5, rpe: 8 }),
      row({ weight_kg: 102.5, reps: 3, rpe: 9 }),
    ];
    const h = groupExerciseHistory(rows);
    expect(h).toHaveLength(2);
    expect(h[0].date).toBe("2026-07-13T10:00:00Z");
    expect(h[0].workout_title).toBe("Push Day");
    expect(h[0].sets).toEqual([
      { type: "warmup", weight_kg: 60, weight_lb: 132.5, reps: 10, duration_seconds: null, distance_meters: null, rpe: null },
      { type: "normal", weight_kg: 100, weight_lb: 220, reps: 5, duration_seconds: null, distance_meters: null, rpe: 8 },
      { type: "normal", weight_kg: 102.5, weight_lb: 225, reps: 3, duration_seconds: null, distance_meters: null, rpe: 9 },
    ]);
    expect(h[0].best_est_1rm_lb).toBe(257.3); // 116.7 kg
    expect(h[1].date).toBe("2026-07-06T10:00:00Z");
    expect(h[1].best_est_1rm_lb).toBe(250.9); // 113.8 kg
  });

  it("returns [] for no rows and null best for reps-only work", () => {
    expect(groupExerciseHistory([])).toEqual([]);
    const h = groupExerciseHistory([row({ weight_kg: null, reps: 12 })]);
    expect(h[0].best_est_1rm_lb).toBeNull();
    expect(h[0].sets[0].weight_lb).toBeNull();
  });
});

describe("scanWorkouts", () => {
  const pageOf = (page: number, page_count: number, ids: string[]): WorkoutsPage => ({
    page,
    page_count,
    workouts: ids.map((id) => ({ ...WORKOUT_A, id })),
  });

  it("walks pages until page_count and reports capped=false", async () => {
    const fetchPage = async (p: number) => pageOf(p, 2, [`p${p}a`, `p${p}b`]);
    const r = await scanWorkouts(fetchPage, 15);
    expect(r.workouts.map((w) => w.id)).toEqual(["p1a", "p1b", "p2a", "p2b"]);
    expect(r.capped).toBe(false);
    expect(r.rateLimited).toBe(false);
  });

  it("stops at maxPages and reports capped=true when more pages remain", async () => {
    const fetchPage = async (p: number) => pageOf(p, 99, [`p${p}`]);
    const r = await scanWorkouts(fetchPage, 3);
    expect(r.workouts).toHaveLength(3);
    expect(r.capped).toBe(true);
    expect(r.rateLimited).toBe(false);
  });

  it("stops early at the cutoff predicate without marking capped", async () => {
    const fetchPage = async (p: number) => pageOf(p, 99, [`p${p}`]);
    const r = await scanWorkouts(fetchPage, 10, (w) => w.id === "p3");
    expect(r.workouts.map((w) => w.id)).toEqual(["p1", "p2"]);
    expect(r.capped).toBe(false);
    expect(r.rateLimited).toBe(false);
  });

  it("returns partial results with rateLimited=true on a mid-scan 429", async () => {
    const fetchPage = async (p: number) => {
      if (p === 3) throw new HevyApiError(429, "rate limit", "/v1/workouts");
      return pageOf(p, 99, [`p${p}`]);
    };
    const r = await scanWorkouts(fetchPage, 10);
    expect(r.workouts.map((w) => w.id)).toEqual(["p1", "p2"]);
    expect(r.rateLimited).toBe(true);
    expect(r.capped).toBe(false);
  });

  it("still throws on a first-page 429 and on non-429 errors", async () => {
    const first429 = async () => { throw new HevyApiError(429, "rate limit", "/v1/workouts"); };
    await expect(scanWorkouts(first429, 10)).rejects.toThrowError(/429/);
    const boom = async (p: number) => {
      if (p === 2) throw new HevyApiError(500, "server error", "/v1/workouts");
      return pageOf(p, 99, [`p${p}`]);
    };
    await expect(scanWorkouts(boom, 10)).rejects.toThrowError(/500/);
  });
});
