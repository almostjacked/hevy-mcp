import { HevyApiError, type Workout, type WorkoutSet, type WorkoutsPage, type ExerciseHistoryRow } from "./hevy-client.js";
import { displayLb, estLb } from "./units.js";

export interface ExerciseSummary {
  title: string;
  exercise_template_id: string;
  set_count: number;
  top_set: string | null;
}

export interface WorkoutSummary {
  id: string;
  title: string;
  date: string;
  duration_minutes: number | null;
  exercises: ExerciseSummary[];
}

export interface HistoryEntry {
  date: string;
  workout_title: string;
  sets: {
    type: string;
    weight_kg: number | null;
    weight_lb: number | null;
    reps: number | null;
    duration_seconds: number | null;
    distance_meters: number | null;
    rpe: number | null;
  }[];
  best_est_1rm_lb: number | null;
}

/** Epley estimated 1RM, rounded to 1 decimal. Null unless weight and positive reps are present. */
export function estimate1RM(weightKg: number | null, reps: number | null): number | null {
  if (weightKg == null || reps == null || reps <= 0) return null;
  if (reps === 1) return weightKg;
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export function formatSet(s: WorkoutSet): string | null {
  const parts: string[] = [];
  if (s.weight_kg != null) parts.push(`${displayLb(s.weight_kg)} lb`);
  if (s.reps != null) parts.push(s.weight_kg != null ? `× ${s.reps}` : `${s.reps} reps`);
  if (s.distance_meters != null) parts.push(`${s.distance_meters} m`);
  if (s.duration_seconds != null) parts.push(`${s.duration_seconds} s`);
  return parts.length ? parts.join(" ") : null;
}

function setScore(s: WorkoutSet): number {
  const est = estimate1RM(s.weight_kg, s.reps);
  if (est != null) return est;
  if (s.weight_kg != null) return s.weight_kg;
  if (s.reps != null) return s.reps;
  if (s.duration_seconds != null) return s.duration_seconds;
  if (s.distance_meters != null) return s.distance_meters;
  return -1;
}

export function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  const working = sets.filter((s) => s.type !== "warmup");
  const pool = working.length ? working : sets;
  if (!pool.length) return null;
  return pool.reduce((best, s) => (setScore(s) > setScore(best) ? s : best));
}

function durationMinutes(start: string, end: string): number | null {
  const ms = Date.parse(end) - Date.parse(start);
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 60_000) : null;
}

export function summarizeWorkout(w: Workout): WorkoutSummary {
  return {
    id: w.id,
    title: w.title,
    date: w.start_time,
    duration_minutes: durationMinutes(w.start_time, w.end_time),
    exercises: (w.exercises ?? []).map((e) => {
      const top = topSet(e.sets ?? []);
      return {
        title: e.title,
        exercise_template_id: e.exercise_template_id,
        set_count: (e.sets ?? []).length,
        top_set: top ? formatSet(top) : null,
      };
    }),
  };
}

/** Group the native endpoint's flat set rows into per-workout entries, newest
 * first. Row order within a workout is preserved (API order = set order). */
export function groupExerciseHistory(rows: ExerciseHistoryRow[]): HistoryEntry[] {
  const byWorkout = new Map<string, { entry: HistoryEntry; bestKg: number | null }>();
  for (const r of rows) {
    let g = byWorkout.get(r.workout_id);
    if (!g) {
      g = {
        entry: { date: r.workout_start_time, workout_title: r.workout_title, sets: [], best_est_1rm_lb: null },
        bestKg: null,
      };
      byWorkout.set(r.workout_id, g);
    }
    g.entry.sets.push({
      type: r.set_type,
      weight_kg: r.weight_kg,
      weight_lb: displayLb(r.weight_kg),
      reps: r.reps,
      duration_seconds: r.duration_seconds,
      distance_meters: r.distance_meters,
      rpe: r.rpe,
    });
    const est = estimate1RM(r.weight_kg, r.reps);
    if (est != null && (g.bestKg == null || est > g.bestKg)) g.bestKg = est;
  }
  return [...byWorkout.values()]
    .map((g) => ({ ...g.entry, best_est_1rm_lb: estLb(g.bestKg) }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Walk /v1/workouts pages (newest first) via fetchPage until the last page,
 * maxPages, or the first workout matching isPastCutoff. capped=true only when
 * maxPages truncated a longer history. A mid-scan 429 returns what was already
 * fetched with rateLimited=true; a first-page 429 (nothing useful yet) and all
 * other errors still throw.
 */
export async function scanWorkouts(
  fetchPage: (page: number) => Promise<WorkoutsPage>,
  maxPages: number,
  isPastCutoff?: (w: Workout) => boolean,
): Promise<{ workouts: Workout[]; capped: boolean; rateLimited: boolean }> {
  const collected: Workout[] = [];
  for (let page = 1; page <= maxPages; page++) {
    let data: WorkoutsPage;
    try {
      data = await fetchPage(page);
    } catch (e) {
      if (e instanceof HevyApiError && e.status === 429 && collected.length) {
        return { workouts: collected, capped: false, rateLimited: true };
      }
      throw e;
    }
    for (const w of data.workouts) {
      if (isPastCutoff?.(w)) return { workouts: collected, capped: false, rateLimited: false };
      collected.push(w);
    }
    if (page >= data.page_count) return { workouts: collected, capped: false, rateLimited: false };
  }
  return { workouts: collected, capped: true, rateLimited: false };
}
