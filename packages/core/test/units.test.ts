import { describe, it, expect } from "vitest";
import { KG_PER_LB, LB_PER_KG, kgToLb, roundToIncrement, displayLb, estLb } from "../src/units";

describe("units", () => {
  it("uses the exact international pound", () => {
    expect(KG_PER_LB).toBe(0.45359237);
    expect(LB_PER_KG).toBeCloseTo(2.20462262, 6);
  });

  it("kgToLb converts exactly (no rounding)", () => {
    expect(kgToLb(100)).toBeCloseTo(220.4622622, 5);
  });

  it("roundToIncrement rounds to the nearest 2.5 by default", () => {
    expect(roundToIncrement(183.7)).toBe(182.5);
    expect(roundToIncrement(184)).toBe(185);
    expect(roundToIncrement(225)).toBe(225);
    expect(roundToIncrement(41, 5)).toBe(40);
  });

  it("displayLb recovers plate-increment lb loads from stored kg", () => {
    // 225 lb was stored by Hevy as 102.06 kg; exact reconversion is 225.0038 lb.
    expect(displayLb(102.06)).toBe(225);
    expect(displayLb(100)).toBe(220);
    expect(displayLb(null)).toBeNull();
  });

  it("estLb converts estimates at 0.1 precision without increment rounding", () => {
    expect(estLb(116.7)).toBe(257.3);
    expect(estLb(113.8)).toBe(250.9);
    expect(estLb(null)).toBeNull();
  });
});
