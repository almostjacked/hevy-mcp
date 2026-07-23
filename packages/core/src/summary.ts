import type { Workout } from "./hevy-client";
import { estimate1RM } from "./workouts";
import { kgToLb, estLb } from "./units";

export interface WeeklyStats {
  week_start: string;
  sessions: number;
  volume_lb: number;
}

export interface LiftTrend {
  exercise: string;
  weekly_best_est_1rm_lb: { week_start: string; est_1rm_lb: number }[];
}

export interface TrainingSummary {
  weeks: number;
  workouts_analyzed: number;
  weekly: WeeklyStats[];
  sets_per_muscle_group: Record<string, number>;
  top_lift_trends: LiftTrend[];
}

/** YYYY-MM-DD of the Monday of d's UTC calendar week. */
function mondayUtc(d: Date): string {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday))
    .toISOString()
    .slice(0, 10);
}

export function computeTrainingSummary(
  workouts: Workout[],
  muscleGroupByTemplateId: Map<string, string>,
  weeks: number,
  now: Date,
): TrainingSummary {
  const cutoff = now.getTime() - weeks * 7 * 86_400_000;
  const inWindow = workouts.filter((w) => Date.parse(w.start_time) >= cutoff);

  const weekly = new Map<string, { week_start: string; sessions: number; volumeKg: number }>();
  const setsPerMuscle: Record<string, number> = {};
  const perExercise = new Map<string, { title: string; volume: number; weeklyBest: Map<string, number> }>();

  for (const w of inWindow) {
    const wk = mondayUtc(new Date(w.start_time));
    const stats = weekly.get(wk) ?? { week_start: wk, sessions: 0, volumeKg: 0 };
    weekly.set(wk, stats);
    stats.sessions++;
    for (const e of w.exercises ?? []) {
      const muscle = muscleGroupByTemplateId.get(e.exercise_template_id) ?? "other";
      for (const s of e.sets ?? []) {
        if (s.type === "warmup") continue;
        setsPerMuscle[muscle] = (setsPerMuscle[muscle] ?? 0) + 1;
        if (s.weight_kg != null && s.reps != null) {
          const vol = s.weight_kg * s.reps;
          stats.volumeKg += vol;
          const rec = perExercise.get(e.exercise_template_id) ?? { title: e.title, volume: 0, weeklyBest: new Map() };
          perExercise.set(e.exercise_template_id, rec);
          rec.volume += vol;
          const est = estimate1RM(s.weight_kg, s.reps);
          if (est != null && est > (rec.weeklyBest.get(wk) ?? 0)) rec.weeklyBest.set(wk, est);
        }
      }
    }
  }

  const topLifts = [...perExercise.values()].sort((a, b) => b.volume - a.volume).slice(0, 3);

  return {
    weeks,
    workouts_analyzed: inWindow.length,
    weekly: [...weekly.values()]
      .sort((a, b) => a.week_start.localeCompare(b.week_start))
      .map((s) => ({ week_start: s.week_start, sessions: s.sessions, volume_lb: Math.round(kgToLb(s.volumeKg)) })),
    sets_per_muscle_group: setsPerMuscle,
    top_lift_trends: topLifts.map((t) => ({
      exercise: t.title,
      weekly_best_est_1rm_lb: [...t.weeklyBest.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([week_start, estKg]) => ({ week_start, est_1rm_lb: estLb(estKg)! })),
    })),
  };
}
