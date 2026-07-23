import { KG_PER_LB, roundToIncrement } from "./units";
import type { RoutinePayload } from "./hevy-client";

export interface SetInput {
  type?: "warmup" | "normal" | "failure" | "dropset";
  weight_kg?: number | null;
  weight_lb?: number | null;
  reps?: number | null;
  rpe?: number | null;
  duration_seconds?: number | null;
  distance_meters?: number | null;
  custom_metric?: number | null;
}

export interface ExerciseInput {
  exercise_template_id: string;
  superset_id?: number | null;
  rest_seconds?: number | null;
  notes?: string;
  sets: SetInput[];
}

export interface RoutineInput {
  title: string;
  folder_id?: number | null;
  notes?: string;
  exercises: ExerciseInput[];
}

export function buildRoutinePayload(input: RoutineInput, validTemplateIds: Set<string>): RoutinePayload {
  const unknown = [...new Set(
    input.exercises.map((e) => e.exercise_template_id).filter((id) => !validTemplateIds.has(id)),
  )];
  if (unknown.length) {
    throw new Error(
      `Unknown exercise_template_id(s): ${unknown.join(", ")}. ` +
      `Use the search_exercises tool to find valid template ids before creating the routine.`,
    );
  }

  return {
    routine: {
      title: input.title,
      folder_id: input.folder_id ?? null,
      notes: input.notes ?? "",
      exercises: input.exercises.map((e) => {
        // Hevy's routines API rejects "rpe" on sets, so targets go into notes.
        // Strip a prior fold only when re-folding, so echoed updates (no rpe on
        // sets) preserve existing notes instead of wiping the fold.
        let notes = e.notes ?? "";
        const rpes = e.sets.map((s) => s.rpe).filter((r): r is number => r != null);
        if (rpes.length) {
          notes = notes.replace(/\s*Top set @ RPE [0-9/.]+\s*$/, "").trim();
          notes = `${notes} Top set @ RPE ${rpes.join("/")}`.trim();
        }

        return {
          exercise_template_id: e.exercise_template_id,
          superset_id: e.superset_id ?? null,
          rest_seconds: e.rest_seconds ?? null,
          notes,
          sets: e.sets.map((s) => ({
            type: s.type ?? "normal",
            weight_kg:
              s.weight_kg ??
              // 6dp, not 2: 0.01 kg quantization skews the app's lb display (135 → "134.99").
              (s.weight_lb != null ? Math.round(roundToIncrement(s.weight_lb) * KG_PER_LB * 1e6) / 1e6 : null),
            reps: s.reps ?? null,
            distance_meters: s.distance_meters ?? null,
            duration_seconds: s.duration_seconds ?? null,
            custom_metric: s.custom_metric ?? null,
          })),
        };
      }),
    },
  };
}
