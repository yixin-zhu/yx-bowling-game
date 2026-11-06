import { describe, expect, it } from "vitest";
import { ALL_PINS } from "./lane";
import { Sim2D } from "./sim2d";

function roll(sim: Sim2D, angle: number, power: number): void {
  sim.reset([...ALL_PINS]);
  sim.throw({ angle, power });
  for (let i = 0; i < 800 && !sim.settled(); i++) sim.step(16);
}

describe("二维球道", () => {
  const quiet = { variance: false } as const;

  it("甜区力度打进袋口是全中", () => {
    const sim = new Sim2D(quiet);
    roll(sim, 0, 0.5);
    expect(sim.settled()).toBe(true);
    expect(sim.guttered()).toBe(false);
    expect(sim.standingPinIds()).toEqual([]);
  });

  it("力度太小到不了瓶堆", () => {
    const sim = new Sim2D(quiet);
    roll(sim, 0, 0.12);
    expect(sim.guttered()).toBe(false);
    expect(sim.standingPinIds().length).toBeGreaterThanOrEqual(8);
  });

  it("力度太大直穿瓶堆，留下瓶子", () => {
    const sim = new Sim2D(quiet);
    roll(sim, 0.02, 1);
    expect(sim.settled()).toBe(true);
    expect(sim.guttered()).toBe(false);
    expect(sim.standingPinIds().length).toBeGreaterThan(0);
  });

  it("方向偏出球道算洗沟，瓶子保持不动", () => {
    const sim = new Sim2D(quiet);
    roll(sim, 0.22, 0.5);
    expect(sim.settled()).toBe(true);
    expect(sim.guttered()).toBe(true);
    expect(sim.standingPinIds()).toEqual([...ALL_PINS]);
  });

  it("同样的出手参数，晃动后结果不一样", () => {
    const leaves = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const sim = new Sim2D({ random: mulberry32(seed) });
      roll(sim, 0.032, 0.5);
      leaves.add(sim.standingPinIds().join(","));
    }
    expect(leaves.size).toBeGreaterThan(1);
  }, 20000);
});

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
