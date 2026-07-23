import { describe, it, expect } from "vitest";
import { searchExercises } from "../src/exercises";
import type { ExerciseTemplate } from "../src/hevy-client";

const t = (id: string, title: string, type = "weight_reps"): ExerciseTemplate =>
  ({ id, title, type, primary_muscle_group: "", equipment: "" });

const LIBRARY = [
  t("A", "Bench Press (Barbell)"),
  t("B", "Bench Press (Dumbbell)"),
  t("C", "Incline Bench Press (Barbell)"),
  t("D", "Squat (Barbell)"),
  t("E", "Pull Up", "reps_only"),
];

describe("searchExercises", () => {
  it("puts an exact title match first", () => {
    const r = searchExercises("bench press (barbell)", LIBRARY);
    expect(r[0].id).toBe("A");
  });

  it("finds substring matches", () => {
    const ids = searchExercises("bench press", LIBRARY).map((x) => x.id);
    expect(ids).toContain("A");
    expect(ids).toContain("B");
    expect(ids).toContain("C");
    expect(ids).not.toContain("D");
  });

  it("tolerates fuzzy input", () => {
    const r = searchExercises("barbel bench pres", LIBRARY);
    expect(r.map((x) => x.id)).toContain("A");
  });

  it("returns empty for garbage", () => {
    expect(searchExercises("zzzzqqqq", LIBRARY)).toEqual([]);
  });

  it("respects the limit", () => {
    expect(searchExercises("bench", LIBRARY, 2)).toHaveLength(2);
  });
});
