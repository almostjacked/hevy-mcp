import { describe, it, expect } from "vitest";
import { HevyClient, HevyApiError } from "../src/hevy-client";

function fakeFetch(routes: Record<string, (init?: RequestInit) => { status?: number; body: unknown }>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) return new Response("not found", { status: 404 });
    const { status = 200, body } = routes[key](init);
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("HevyClient", () => {
  it("sends the api-key header", async () => {
    let seenKey = "";
    const f = (async (_url: any, init?: RequestInit) => {
      seenKey = (init!.headers as Record<string, string>)["api-key"];
      return new Response(JSON.stringify({ workout_count: 1 }));
    }) as typeof fetch;
    await new HevyClient("secret-key", f).validateKey();
    expect(seenKey).toBe("secret-key");
  });

  it("validateKey returns false on 401 and true on 200", async () => {
    expect(await new HevyClient("bad", fakeFetch({ "/v1/workouts/count": () => ({ status: 401, body: "unauthorized" }) })).validateKey()).toBe(false);
    expect(await new HevyClient("good", fakeFetch({ "/v1/workouts/count": () => ({ body: { workout_count: 5 } }) })).validateKey()).toBe(true);
  });

  it("fetchAllExerciseTemplates walks all pages", async () => {
    const f = fakeFetch({
      "page=1": () => ({ body: { page_count: 2, exercise_templates: [{ id: "A", title: "Squat (Barbell)", type: "weight_reps", primary_muscle_group: "quadriceps", equipment: "barbell" }] } }),
      "page=2": () => ({ body: { page_count: 2, exercise_templates: [{ id: "B", title: "Pull Up", type: "reps_only", primary_muscle_group: "lats", equipment: "none" }] } }),
    });
    const templates = await new HevyClient("k", f).fetchAllExerciseTemplates();
    expect(templates.map((t) => t.id)).toEqual(["A", "B"]);
  });

  it("createRoutineFolder reuses an existing folder with the same title", async () => {
    let posted = false;
    const f = fakeFetch({
      "GET /": () => ({ body: {} }), // unused
      "/v1/routine_folders": (init) => {
        if (init?.method === "POST") { posted = true; return { body: { routine_folder: { id: 99, title: "Block A" } } }; }
        return { body: { page_count: 1, routine_folders: [{ id: 7, title: "Block A" }] } };
      },
    });
    const folder = await new HevyClient("k", f).createRoutineFolder("Block A");
    expect(folder.id).toBe(7);
    expect(posted).toBe(false);
  });

  it("throws HevyApiError with the response body on 400", async () => {
    const c = new HevyClient("k", fakeFetch({ "/v1/routines": () => ({ status: 400, body: { error: '"routine.exercises[0].sets[0].rpe" is not allowed' } }) }));
    await expect(c.createRoutine({ routine: { title: "x", folder_id: null, notes: "", exercises: [] } })).rejects.toThrowError(/rpe.*is not allowed/);
  });

  it("enforces the client-side rate limit", async () => {
    const c = new HevyClient("k", fakeFetch({ "/v1/workouts/count": () => ({ body: {} }) }), 2);
    await c.validateKey();
    await c.validateKey();
    await expect(c.validateKey()).rejects.toThrowError(/rate limit/i);
  });

  it("getWorkoutsPage requests one page and returns workouts + page_count", async () => {
    let seenUrl = "";
    const f = (async (url: any) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ page: 2, page_count: 5, workouts: [{ id: "w1", title: "Push", start_time: "2026-07-13T10:00:00Z", end_time: "2026-07-13T11:00:00Z", exercises: [] }] }));
    }) as typeof fetch;
    const page = await new HevyClient("k", f).getWorkoutsPage(2, 10);
    expect(seenUrl).toContain("/v1/workouts?page=2&pageSize=10");
    expect(page.page_count).toBe(5);
    expect(page.workouts.map((w) => w.id)).toEqual(["w1"]);
  });

  it("getWorkoutCount unwraps workout_count", async () => {
    const c = new HevyClient("k", fakeFetch({ "/v1/workouts/count": () => ({ body: { workout_count: 42 } }) }));
    expect(await c.getWorkoutCount()).toBe(42);
  });

  it("getWorkout fetches one workout by id (url-encoded)", async () => {
    let seenUrl = "";
    const f = (async (url: any) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ id: "abc/1", title: "Legs", start_time: "", end_time: "", exercises: [] }));
    }) as typeof fetch;
    const w = await new HevyClient("k", f).getWorkout("abc/1");
    expect(seenUrl).toContain("/v1/workouts/abc%2F1");
    expect(w.title).toBe("Legs");
  });

  it("getRoutine unwraps a nested routine key when present", async () => {
    const c = new HevyClient("k", fakeFetch({ "/v1/routines/7": () => ({ body: { routine: { id: 7, title: "Block A" } } }) }));
    expect(await c.getRoutine(7)).toEqual({ id: 7, title: "Block A" });
  });

  it("updateRoutine PUTs the payload to /v1/routines/{id}", async () => {
    let seenMethod = "", seenUrl = "", seenBody = "";
    const f = (async (url: any, init?: RequestInit) => {
      seenMethod = init?.method ?? ""; seenUrl = String(url); seenBody = String(init?.body);
      return new Response(JSON.stringify({ ok: true }));
    }) as typeof fetch;
    await new HevyClient("k", f).updateRoutine(7, { routine: { title: "Block A", notes: "", exercises: [] } });
    expect(seenMethod).toBe("PUT");
    expect(seenUrl).toContain("/v1/routines/7");
    expect(seenBody).not.toContain("folder_id");
  });

  it("listRoutines filters by case-insensitive title query", async () => {
    const routines = [
      { id: 1, title: "Push Day", folder_id: null, exercises: [] },
      { id: 2, title: "Pull Day", folder_id: null, exercises: [] },
    ];
    const c = () => new HevyClient("k", fakeFetch({ "/v1/routines": () => ({ body: { page_count: 1, routines } }) }));
    expect((await c().listRoutines("push")).map((r) => r.id)).toEqual([1]);
    expect((await c().listRoutines()).map((r) => r.id)).toEqual([1, 2]);
    expect((await c().listRoutines("  ")).map((r) => r.id)).toEqual([1, 2]);
  });

  it("getExerciseHistory hits the native endpoint and unwraps rows", async () => {
    let seenUrl = "";
    const row = {
      workout_id: "w1", workout_title: "Push", workout_start_time: "2026-07-13T10:00:00Z",
      workout_end_time: "2026-07-13T11:00:00Z", exercise_template_id: "BENCH",
      weight_kg: 100, reps: 5, distance_meters: null, duration_seconds: null,
      rpe: 8, custom_metric: null, set_type: "normal",
    };
    const f = (async (url: any) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ exercise_history: [row] }));
    }) as typeof fetch;
    const res = await new HevyClient("k", f).getExerciseHistory("BENCH");
    expect(seenUrl).toContain("/v1/exercise_history/BENCH");
    expect(seenUrl).not.toContain("?");
    expect(res.rows).toEqual([row]);
    expect(res.truncated).toBe(false);
  });

  it("getExerciseHistory url-encodes the id and passes date filters", async () => {
    let seenUrl = "";
    const f = (async (url: any) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ exercise_history: [] }));
    }) as typeof fetch;
    const res = await new HevyClient("k", f).getExerciseHistory("A/B", "2026-06-01T00:00:00Z", "2026-07-01T00:00:00Z");
    expect(seenUrl).toContain("/v1/exercise_history/A%2FB?");
    expect(seenUrl).toContain("start_date=2026-06-01T00%3A00%3A00Z");
    expect(seenUrl).toContain("end_date=2026-07-01T00%3A00%3A00Z");
    expect(res.rows).toEqual([]);
  });

  it("getExerciseHistory flags truncation when the response paginates", async () => {
    const c = new HevyClient("k", fakeFetch({ "/v1/exercise_history/BENCH": () => ({ body: { page_count: 3, exercise_history: [] } }) }));
    expect((await c.getExerciseHistory("BENCH")).truncated).toBe(true);
  });

  it("getExerciseHistory passes a single-sided date filter", async () => {
    let seenUrl = "";
    const f = (async (url: any) => {
      seenUrl = String(url);
      return new Response(JSON.stringify({ exercise_history: [] }));
    }) as typeof fetch;
    await new HevyClient("k", f).getExerciseHistory("BENCH", "2026-06-01T00:00:00Z");
    expect(seenUrl).toContain("/v1/exercise_history/BENCH?start_date=2026-06-01T00%3A00%3A00Z");
    expect(seenUrl).not.toContain("end_date");
  });
});
