import type { ExerciseTemplate } from "./hevy-client";

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const clean = s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
  for (let i = 0; i < clean.length - 1; i++) {
    const g = clean.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Sørensen–Dice similarity over character bigrams, 0..1 */
function similarity(a: string, b: string): number {
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  const total = [...ga.values()].reduce((s, n) => s + n, 0) + [...gb.values()].reduce((s, n) => s + n, 0);
  return total === 0 ? 0 : (2 * overlap) / total;
}

export function searchExercises(
  query: string,
  templates: ExerciseTemplate[],
  limit = 10,
): ExerciseTemplate[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return templates
    .map((t) => {
      const title = t.title.toLowerCase();
      let score: number;
      if (title === q) score = 3;
      else if (title.includes(q) || q.includes(title)) score = 2 + similarity(q, title);
      else score = similarity(q, title);
      return { t, score };
    })
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}
