import type { Workout } from "../../src/hevy-client";

// Monday 2026-07-13. Bench: warmup 60x10, work 100x5 @8 (est 116.7), 102.5x3 @9 (est 112.8). Pull Up: 12 reps.
export const WORKOUT_A: Workout = {
  id: "w1",
  title: "Push Day",
  start_time: "2026-07-13T10:00:00Z",
  end_time: "2026-07-13T11:05:00Z",
  exercises: [
    {
      index: 0,
      title: "Bench Press (Barbell)",
      exercise_template_id: "BENCH",
      superset_id: null,
      notes: "",
      sets: [
        { index: 0, type: "warmup", weight_kg: 60, reps: 10, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
        { index: 1, type: "normal", weight_kg: 100, reps: 5, distance_meters: null, duration_seconds: null, rpe: 8, custom_metric: null },
        { index: 2, type: "normal", weight_kg: 102.5, reps: 3, distance_meters: null, duration_seconds: null, rpe: 9, custom_metric: null },
      ],
    },
    {
      index: 1,
      title: "Pull Up",
      exercise_template_id: "PULLUP",
      superset_id: null,
      notes: "",
      sets: [
        { index: 0, type: "normal", weight_kg: null, reps: 12, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
      ],
    },
  ],
};

// Monday 2026-07-06, one week earlier. Bench: 97.5x5 (est 113.8).
export const WORKOUT_B: Workout = {
  id: "w2",
  title: "Push Day",
  start_time: "2026-07-06T10:00:00Z",
  end_time: "2026-07-06T11:00:00Z",
  exercises: [
    {
      index: 0,
      title: "Bench Press (Barbell)",
      exercise_template_id: "BENCH",
      superset_id: null,
      notes: "",
      sets: [
        { index: 0, type: "normal", weight_kg: 97.5, reps: 5, distance_meters: null, duration_seconds: null, rpe: null, custom_metric: null },
      ],
    },
  ],
};
