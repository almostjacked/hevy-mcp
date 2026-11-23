const BASE = "https://api.hevyapp.com";

export interface ExerciseTemplate {
  id: string;
  title: string;
  type: string; // "weight_reps" | "reps_only" | "duration" | ...
  primary_muscle_group: string;
  equipment: string;
}

export interface RoutineFolder { id: number; title: string }

export interface RoutineSummary { id: number; title: string; folder_id: number | null; exercise_count: number }

export interface RoutineSet {
  type: string; // "warmup" | "normal" | "failure" | "dropset"
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  custom_metric: number | null;
}

export interface RoutineExercise {
  exercise_template_id: string;
  superset_id: number | null;
  rest_seconds: number | null;
  notes: string;
  sets: RoutineSet[];
}

export interface RoutinePayload {
  routine: { title: string; folder_id: number | null; notes: string; exercises: RoutineExercise[] };
}

export interface WorkoutSet {
  index: number;
  type: string; // "warmup" | "normal" | "failure" | "dropset"
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
}

export interface WorkoutExercise {
  index: number;
  title: string;
  exercise_template_id: string;
  superset_id: number | null;
  notes: string;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  title: string;
  start_time: string; // ISO 8601
  end_time: string; // ISO 8601
  exercises: WorkoutExercise[];
}

export interface WorkoutsPage {
  page: number;
  page_count: number;
  workouts: Workout[];
}

// One row per SET from GET /v1/exercise_history/{id} (flat; group by workout_id client-side).
export interface ExerciseHistoryRow {
  workout_id: string;
  workout_title: string;
  workout_start_time: string; // ISO 8601
  workout_end_time: string; // ISO 8601
  exercise_template_id: string;
  weight_kg: number | null;
  reps: number | null;
  distance_meters: number | null;
  duration_seconds: number | null;
  rpe: number | null;
  custom_metric: number | null;
  set_type: string; // "warmup" | "normal" | "failure" | "dropset"
}

// PUT /v1/routines/{id} rejects folder_id — folder assignment is not updatable.
export type RoutineUpdatePayload = { routine: Omit<RoutinePayload["routine"], "folder_id"> };

export class HevyApiError extends Error {
  constructor(public status: number, public body: string, public path: string) {
    super(`Hevy API ${status} on ${path}: ${body}`);
    this.name = "HevyApiError";
  }
}

/**
 * How the client authenticates to api.hevyapp.com.
 * - a bare string or `{ apiKey }`: the Hevy PRO personal key, sent as the `api-key` header.
 * - `{ accessToken }`: a Hevy OAuth access token (developers.hevy.com), sent as
 *   `Authorization: Bearer`. `accessToken` is called per request so the caller
 *   can hand out a refreshed token; `onUnauthorized` (optional) is called once on
 *   a 401 to force a refresh before a single retry.
 */
export type HevyAuth =
  | string
  | { apiKey: string }
  | { accessToken: () => Promise<string>; onUnauthorized?: () => Promise<void> };

export type HevyAuthKind = "api-key" | "oauth";

export class HevyClient {
  private timestamps: number[] = [];
  private auth: Exclude<HevyAuth, string>;

  constructor(
    auth: HevyAuth,
    private fetchFn: typeof fetch = (input, init) => globalThis.fetch(input, init),
    private maxRequestsPerMinute = 30,
  ) {
    this.auth = typeof auth === "string" ? { apiKey: auth } : auth;
  }

  get authKind(): HevyAuthKind {
    return "apiKey" in this.auth ? "api-key" : "oauth";
  }

  private async authHeaders(): Promise<Record<string, string>> {
    if ("apiKey" in this.auth) return { "api-key": this.auth.apiKey };
    return { Authorization: `Bearer ${await this.auth.accessToken()}` };
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < 60_000);
    if (this.timestamps.length >= this.maxRequestsPerMinute) {
      throw new HevyApiError(429, "Client-side rate limit reached; wait a minute before more Hevy calls.", path);
    }
    this.timestamps.push(now);

    const send = async () =>
      this.fetchFn(BASE + path, {
        method,
        headers: { ...(await this.authHeaders()), "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    let res = await send();
    // OAuth access tokens expire hourly; on a 401 force one refresh and retry once.
    if (res.status === 401 && "accessToken" in this.auth && this.auth.onUnauthorized) {
      await res.body?.cancel();
      await this.auth.onUnauthorized();
      res = await send();
    }
    const text = await res.text();
    if (!res.ok) throw new HevyApiError(res.status, text.slice(0, 500), path);
    return text ? JSON.parse(text) : null;
  }

  private async paged<T>(path: string, pageSize: number, itemsKey: string): Promise<T[]> {
    const all: T[] = [];
    let page = 1;
    for (;;) {
      const data = await this.request("GET", `${path}?page=${page}&pageSize=${pageSize}`);
      all.push(...(data[itemsKey] ?? []));
      if (page >= (data.page_count ?? 1)) break;
      page++;
    }
    return all;
  }

  async validateKey(): Promise<boolean> {
    try {
      await this.request("GET", "/v1/workouts/count");
      return true;
    } catch (e) {
      if (e instanceof HevyApiError && (e.status === 401 || e.status === 403)) return false;
      throw e;
    }
  }

  fetchAllExerciseTemplates(): Promise<ExerciseTemplate[]> {
    return this.paged<ExerciseTemplate>("/v1/exercise_templates", 100, "exercise_templates");
  }

  listRoutineFolders(): Promise<RoutineFolder[]> {
    return this.paged<RoutineFolder>("/v1/routine_folders", 10, "routine_folders");
  }

  async createRoutineFolder(title: string): Promise<RoutineFolder> {
    const existing = (await this.listRoutineFolders()).find((f) => f.title === title);
    if (existing) return existing;
    const res = await this.request("POST", "/v1/routine_folders", { routine_folder: { title } });
    return res.routine_folder ?? res;
  }

  async listRoutines(query?: string): Promise<RoutineSummary[]> {
    const raw = await this.paged<any>("/v1/routines", 10, "routines");
    const q = query?.trim().toLowerCase();
    return raw
      .filter((r) => !q || String(r.title ?? "").toLowerCase().includes(q))
      .map((r) => ({
        id: r.id,
        title: r.title,
        folder_id: r.folder_id ?? null,
        exercise_count: (r.exercises ?? []).length,
      }));
  }

  createRoutine(payload: RoutinePayload): Promise<unknown> {
    return this.request("POST", "/v1/routines", payload);
  }

  async getWorkoutsPage(page = 1, pageSize = 10): Promise<WorkoutsPage> {
    const data = await this.request("GET", `/v1/workouts?page=${page}&pageSize=${pageSize}`);
    return { page: data.page ?? page, page_count: data.page_count ?? 1, workouts: data.workouts ?? [] };
  }

  async getWorkoutCount(): Promise<number> {
    const data = await this.request("GET", "/v1/workouts/count");
    return data.workout_count ?? 0;
  }

  async getWorkout(workoutId: string): Promise<Workout> {
    const data = await this.request("GET", `/v1/workouts/${encodeURIComponent(workoutId)}`);
    return data.workout ?? data;
  }

  async getRoutine(routineId: string | number): Promise<unknown> {
    const data = await this.request("GET", `/v1/routines/${encodeURIComponent(String(routineId))}`);
    return data.routine ?? data;
  }

  updateRoutine(routineId: string | number, payload: RoutineUpdatePayload): Promise<unknown> {
    return this.request("PUT", `/v1/routines/${encodeURIComponent(String(routineId))}`, payload);
  }

  async getExerciseHistory(
    templateId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<{ rows: ExerciseHistoryRow[]; truncated: boolean }> {
    const qs = new URLSearchParams();
    if (startDate) qs.set("start_date", startDate);
    if (endDate) qs.set("end_date", endDate);
    const q = qs.toString();
    const data = await this.request("GET", `/v1/exercise_history/${encodeURIComponent(templateId)}${q ? `?${q}` : ""}`);
    return {
      rows: data.exercise_history ?? [],
      truncated: data.page_count != null && data.page_count > 1,
    };
  }
}
