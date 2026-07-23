import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { HevyClient, HevyApiError, type ExerciseTemplate } from "./hevy-client.js";
import { searchExercises } from "./exercises.js";
import { buildRoutinePayload } from "./routine-builder.js";
import { summarizeWorkout, groupExerciseHistory, scanWorkouts } from "./workouts.js";
import { computeTrainingSummary } from "./summary.js";

const HISTORY_MAX_PAGES = 15; // × pageSize 10 = 150 most recent workouts

const SetSchema = z.object({
	type: z.enum(["warmup", "normal", "failure", "dropset"]).optional()
		.describe("Set type; defaults to 'normal'."),
	weight_kg: z.number().nullable().optional()
		.describe("Weight in KILOGRAMS. Omit (or null) for bodyweight/reps_only exercises."),
	weight_lb: z.number().nullable().optional()
		.describe("Weight in pounds — snapped to the nearest 2.5 lb, then converted to kg server-side. Provide weight_kg OR weight_lb, not both."),
	reps: z.number().int().nullable().optional(),
	rpe: z.number().min(6).max(10).nullable().optional()
		.describe("Target RPE. Hevy routines cannot store RPE on sets, so this is folded into the exercise notes automatically."),
	duration_seconds: z.number().int().nullable().optional()
		.describe("Target duration for duration-type exercises (planks, carries). Passed through as-is."),
	distance_meters: z.number().nullable().optional()
		.describe("Target distance for distance-type exercises. Passed through as-is."),
	custom_metric: z.number().nullable().optional(),
});

const ExerciseSchema = z.object({
	exercise_template_id: z.string()
		.describe("Template id from search_exercises. NEVER invent ids."),
	superset_id: z.number().int().nullable().optional()
		.describe("Exercises sharing the same integer are supersetted together."),
	rest_seconds: z.number().int().nullable().optional(),
	notes: z.string().optional(),
	sets: z.array(SetSchema).min(1),
});

const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

export function createHevyClient(apiKey: string): HevyClient {
  return new HevyClient(apiKey);
}

export function keyInvalidMessage(status: number, hint: string): string {
  return `Your Hevy API key is no longer valid (Hevy returned HTTP ${status}). ${hint} ` +
    "The user can check their key at hevy.com/settings?developer.";
}

export interface RegisterOptions {
  /** Client-specific guidance appended to the key-invalid error, e.g.
   *  "Ask the user to disconnect and reconnect the connector in claude.ai settings."
   *  or "Check the HEVY_API_KEY environment variable." */
  keyInvalidHint?: string;
}

export function registerTools(
  server: McpServer,
  client: HevyClient,
  opts: RegisterOptions = {},
): void {
  const hint = opts.keyInvalidHint ?? "Update your Hevy API key where you configured this server.";

  let templates: ExerciseTemplate[] | null = null;
  const library = async (): Promise<ExerciseTemplate[]> => {
    if (!templates) templates = await client.fetchAllExerciseTemplates();
    return templates;
  };

  const ok = (data: unknown) =>
    ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });
  const err = (message: string) =>
    ({ content: [{ type: "text" as const, text: message }], isError: true });
  const run = async (fn: () => Promise<unknown>) => {
    try {
      return ok(await fn());
    } catch (e) {
      if (e instanceof HevyApiError && (e.status === 401 || e.status === 403)) {
        return err(keyInvalidMessage(e.status, hint));
      }
      if (e instanceof Error) return err(e.message);
      return err(String(e));
    }
  };

  server.registerTool(
    "search_exercises",
    {
      title: "Search exercises",
      description: "Search the user's Hevy exercise library by name (fuzzy). Returns template id, exact title, " +
        "type, muscle group and equipment. type 'weight_reps' takes weight+reps; 'reps_only' takes reps " +
        "and NO weight; type 'duration' takes duration_seconds; distance types take distance_meters. " +
        "Always use this to get exercise_template_id values before create_routine.",
      inputSchema: { query: z.string().describe("Exercise name, e.g. 'bench press' or 'romanian deadlift'") },
      annotations: { title: "Search exercises", ...READ },
    },
    async ({ query }) =>
      run(async () =>
        searchExercises(query, await library()).map(({ id, title, type, primary_muscle_group, equipment }) =>
          ({ id, title, type, primary_muscle_group, equipment }))),
  );

  server.registerTool(
    "list_routine_folders",
    {
      title: "List routine folders",
      description: "List the user's routine folders (id + title). Check this before creating a folder — reuse an existing one when the name matches.",
      inputSchema: {},
      annotations: { title: "List routine folders", ...READ },
    },
    async () => run(() => client.listRoutineFolders()),
  );

  server.registerTool(
    "list_routines",
    {
      title: "List routines",
      description: "List the user's existing routines (id, title, folder_id, exercise_count). Use to avoid creating duplicates. " +
        "Pass query to filter by title.",
      inputSchema: { query: z.string().optional().describe("Optional case-insensitive title substring filter.") },
      annotations: { title: "List routines", ...READ },
    },
    async ({ query }) => run(() => client.listRoutines(query)),
  );

  server.registerTool(
    "get_workouts",
    {
      title: "Get workouts",
      description: "Get the user's most recent logged workouts, newest first, as COMPACT summaries: title, date, " +
        "duration, and per-exercise set count + top set. Use get_workout for full set-by-set detail of one workout.",
      inputSchema: { limit: z.number().int().min(1).max(30).optional().describe("How many workouts to return (default 10, max 30).") },
      annotations: { title: "Get workouts", ...READ },
    },
    async ({ limit }) =>
      run(async () => {
        const n = limit ?? 10;
        const { workouts } = await scanWorkouts((p) => client.getWorkoutsPage(p, 10), Math.ceil(n / 10));
        return workouts.slice(0, n).map(summarizeWorkout);
      }),
  );

  server.registerTool(
    "get_workout",
    {
      title: "Get workout",
      description: "Get one logged workout with every set (weights in kg). Use the id from get_workouts.",
      inputSchema: { workout_id: z.string().describe("Workout id from get_workouts.") },
      annotations: { title: "Get workout", ...READ },
    },
    async ({ workout_id }) => run(() => client.getWorkout(workout_id)),
  );

  server.registerTool(
    "get_workout_count",
    {
      title: "Get workout count",
      description: "Total number of workouts the user has ever logged in Hevy.",
      inputSchema: {},
      annotations: { title: "Get workout count", ...READ },
    },
    async () => run(async () => ({ workout_count: await client.getWorkoutCount() })),
  );

  server.registerTool(
    "get_exercise_history",
    {
      title: "Get exercise history",
      description: "Past performances of ONE exercise across the user's workouts (newest first): per-date sets " +
        "(lb-first, kg preserved) and best estimated 1RM in lb (Epley). Covers the full available history by " +
        "default (a note is added if Hevy truncates the response); pass start_date/end_date (ISO 8601) to narrow the window. Get the " +
        "exercise_template_id from search_exercises or get_workouts.",
      inputSchema: {
        exercise_template_id: z.string().describe("Template id from search_exercises / get_workouts."),
        start_date: z.string().optional().describe("Optional ISO 8601 lower bound, e.g. 2026-06-01T00:00:00Z."),
        end_date: z.string().optional().describe("Optional ISO 8601 upper bound."),
      },
      annotations: { title: "Get exercise history", ...READ },
    },
    async ({ exercise_template_id, start_date, end_date }) =>
      run(async () => {
        try {
          const { rows, truncated } = await client.getExerciseHistory(exercise_template_id, start_date, end_date);
          return {
            exercise_template_id,
            entries: groupExerciseHistory(rows),
            ...(truncated
              ? { note: "Hevy paginated this response; only the first page of history is included — narrow the window with start_date/end_date." }
              : {}),
          };
        } catch (e) {
          if (e instanceof HevyApiError && e.status === 404) {
            return {
              exercise_template_id,
              entries: [],
              note: "No history found — the user may never have performed this exercise, or the id may be wrong (verify via search_exercises).",
            };
          }
          throw e;
        }
      }),
  );

  server.registerTool(
    "get_routine",
    {
      title: "Get routine",
      description: "Get one routine in full (all exercises and sets). ALWAYS call this before update_routine so you can " +
        "send back the complete routine.",
      inputSchema: { routine_id: z.union([z.string(), z.number()]).describe("Routine id from list_routines.") },
      annotations: { title: "Get routine", ...READ },
    },
    async ({ routine_id }) => run(() => client.getRoutine(routine_id)),
  );

  server.registerTool(
    "get_training_summary",
    {
      title: "Get training summary",
      description: "Server-computed training overview for the last N weeks: sessions and volume (lb) per week, working " +
        "sets per muscle group, and best-estimated-1RM trend for the top lifts. Much cheaper than fetching " +
        "raw workouts — prefer this for questions like 'how has my training been going?'.",
      inputSchema: { weeks: z.number().int().min(1).max(12).optional().describe("Window in weeks, 1–12 (default 4).") },
      annotations: { title: "Get training summary", ...READ },
    },
    async ({ weeks }) =>
      run(async () => {
        const n = weeks ?? 4;
        const cutoff = Date.now() - n * 7 * 86_400_000;
        const { workouts, capped, rateLimited } = await scanWorkouts(
          (p) => client.getWorkoutsPage(p, 10),
          HISTORY_MAX_PAGES,
          (w) => Date.parse(w.start_time) < cutoff,
        );
        const byId = new Map((await library()).map((t) => [t.id, t.primary_muscle_group]));
        const summary = computeTrainingSummary(workouts, byId, n, new Date());
        const note = capped
          ? "Scan capped at the 150 most recent workouts; earlier weeks in the window may be undercounted."
          : rateLimited
            ? `Hevy rate limit hit mid-scan — summary covers only the ${workouts.length} most recent workouts; retry in a minute for full coverage.`
            : undefined;
        return note ? { ...summary, note } : summary;
      }),
  );

  server.registerTool(
    "create_routine_folder",
    {
      title: "Create routine folder",
      description: "Create a routine folder, or return the existing folder if one with this exact title already exists (never duplicates).",
      inputSchema: { title: z.string() },
      annotations: { title: "Create routine folder", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ title }) => run(() => client.createRoutineFolder(title)),
  );

  server.registerTool(
    "create_routine",
    {
      title: "Create routine",
      description: "Create a workout routine in the user's Hevy account. Prescribe weights via weight_lb in 2.5 or " +
        "5 lb increments — the server snaps weight_lb to the nearest 2.5 lb and converts to kg for storage " +
        "(weight_kg is also accepted and stored as-is). RPE targets are folded into exercise notes because " +
        "Hevy routines cannot store per-set RPE. Leave weights null for accessories the user will fill in " +
        "at the gym. Exercises sharing a superset_id integer are supersetted. Ask the user to confirm the " +
        "plan before calling this.",
      inputSchema: {
        title: z.string(),
        folder_id: z.number().int().nullable().optional()
          .describe("Folder id from list_routine_folders / create_routine_folder; null for no folder."),
        notes: z.string().optional(),
        exercises: z.array(ExerciseSchema).min(1),
      },
      annotations: { title: "Create routine", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (input) =>
      run(async () => {
        const ids = new Set((await library()).map((t) => t.id));
        const payload = buildRoutinePayload(input, ids);
        return client.createRoutine(payload);
      }),
  );

  server.registerTool(
    "update_routine",
    {
      title: "Update routine (overwrites)",
      description: "Replace an existing routine. WARNING: this OVERWRITES the routine — Hevy replaces its exercises with " +
        "exactly what you send, so first call get_routine and include every exercise you want to keep. " +
        "Folder cannot be changed here. Same input rules as create_routine: prescribe via weight_lb (snapped to 2.5 lb increments; weight_kg passes through as-is), RPE folded into notes, duration/distance/custom-metric targets pass through. " +
        "Ask the user to confirm before calling this.",
      inputSchema: {
        routine_id: z.union([z.string(), z.number()]).describe("Routine id from list_routines / get_routine."),
        title: z.string(),
        notes: z.string().optional(),
        exercises: z.array(ExerciseSchema).min(1),
      },
      annotations: { title: "Update routine (overwrites)", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    async ({ routine_id, ...input }) =>
      run(async () => {
        const ids = new Set((await library()).map((t) => t.id));
        const { routine } = buildRoutinePayload({ ...input, folder_id: null }, ids);
        const { folder_id: _dropped, ...update } = routine;
        return client.updateRoutine(routine_id, { routine: update });
      }),
  );
}
