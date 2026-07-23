import { describe, it, expect } from "vitest";
import { computeTrainingSummary } from "../src/summary";
import { WORKOUT_A, WORKOUT_B } from "./fixtures/workouts";

const NOW = new Date("2026-07-17T12:00:00Z"); // Friday
const MUSCLES = new Map([
  ["BENCH", "chest"],
  ["PULLUP", "lats"],
]);

describe("computeTrainingSummary", () => {
  it("buckets sessions and volume by UTC Monday week", () => {
    const s = computeTrainingSummary([WORKOUT_A, WORKOUT_B], MUSCLES, 4, NOW);
    expect(s.weeks).toBe(4);
    expect(s.workouts_analyzed).toBe(2);
    expect(s.weekly).toEqual([
      { week_start: "2026-07-06", sessions: 1, volume_lb: 1075 }, // 487.5 kg
      { week_start: "2026-07-13", sessions: 1, volume_lb: 1780 }, // 807.5 kg (warmup excluded)
    ]);
  });

  it("counts non-warmup sets per muscle group, bucketing unknown ids under other", () => {
    const s = computeTrainingSummary([WORKOUT_A, WORKOUT_B], MUSCLES, 4, NOW);
    expect(s.sets_per_muscle_group).toEqual({ chest: 3, lats: 1 });
    const s2 = computeTrainingSummary([WORKOUT_A], new Map(), 4, NOW);
    expect(s2.sets_per_muscle_group).toEqual({ other: 3 });
  });

  it("tracks weekly best est 1RM for the top lifts by volume", () => {
    const s = computeTrainingSummary([WORKOUT_A, WORKOUT_B], MUSCLES, 4, NOW);
    expect(s.top_lift_trends).toEqual([
      {
        exercise: "Bench Press (Barbell)",
        weekly_best_est_1rm_lb: [
          { week_start: "2026-07-06", est_1rm_lb: 250.9 },
          { week_start: "2026-07-13", est_1rm_lb: 257.3 },
        ],
      },
    ]);
  });

  it("excludes workouts older than the window", () => {
    const s = computeTrainingSummary([WORKOUT_A, WORKOUT_B], MUSCLES, 1, NOW);
    expect(s.workouts_analyzed).toBe(1);
    expect(s.weekly.map((w) => w.week_start)).toEqual(["2026-07-13"]);
  });
});
