/** All unit handling for lb-standard output. Internal math stays in exact kg;
 * rounding happens only at output boundaries, and only in lb space. */

export const KG_PER_LB = 0.45359237;
export const LB_PER_KG = 1 / KG_PER_LB;

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

/** Nearest plate increment (default 2.5 lb; multiples of 5 are covered). */
export function roundToIncrement(lb: number, inc = 2.5): number {
  return Math.round(lb / inc) * inc;
}

/** Loadable-weight display: stored kg -> lb on a 2.5 lb increment. */
export function displayLb(kg: number | null): number | null {
  return kg == null ? null : roundToIncrement(kgToLb(kg));
}

/** Estimate display (1RMs): stored kg -> lb at 0.1 precision, no increments. */
export function estLb(kg: number | null): number | null {
  return kg == null ? null : Math.round(kgToLb(kg) * 10) / 10;
}
