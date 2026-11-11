import { describe, expect, it } from "vitest";
import { formatClock, paceText } from "../src/stats";
import { RepCounter } from "../src/engine/repCounter";
import { SessionTracker } from "../src/engine/session";
import type { FrameMetrics } from "../src/engine/types";

describe("the stats panel numbers", () => {
  it("formats the time as minutes and seconds", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(42_000)).toBe("0:42");
    expect(formatClock(125_900)).toBe("2:05");
    expect(formatClock(-5)).toBe("0:00");
  });

  it("works out reps a minute, as in the mockup: 7 reps in 0:42 is 10 a minute", () => {
    expect(paceText(7, 42_000)).toBe("10/m");
    expect(paceText(12, 30_000)).toBe("24/m");
  });

  it("shows a dash until there is enough to say", () => {
    expect(paceText(1, 30_000)).toBe("-");
    expect(paceText(5, 4_000)).toBe("-");
    expect(paceText(0, 0)).toBe("-");
  });
});

describe("the rest to peak gauge", () => {
  const trigger = { metric: "elbowAngle", start: 160, turn: 80 } as const;
  const at = (counter: RepCounter, angle: number, t: number) =>
    counter.update({ elbowAngle: angle } as FrameMetrics, t);

  it("is 0 at the start position and 1 at the turn, and in between on the way", () => {
    const counter = new RepCounter(trigger);
    at(counter, 160, 100);
    expect(counter.progress).toBe(0);
    at(counter, 120, 200);
    expect(counter.progress).toBeCloseTo(0.5);
    at(counter, 80, 300);
    expect(counter.progress).toBe(1);
    at(counter, 20, 400);
    expect(counter.progress).toBe(1);
  });

  it("goes back to 0 on a reset", () => {
    const counter = new RepCounter(trigger);
    at(counter, 100, 100);
    counter.reset();
    expect(counter.progress).toBe(0);
  });
});

describe("the set timer", () => {
  it("counts from the moment the set starts", () => {
    const session = new SessionTracker({ sets: 3, reps: 12 });
    expect(session.setElapsedMs(5000)).toBe(0);
    session.startSet(10_000);
    expect(session.setElapsedMs(52_000)).toBe(42_000);
    // Starting again mid set does not move the start.
    session.startSet(30_000);
    expect(session.setElapsedMs(52_000)).toBe(42_000);
  });
});

describe("pace for a hold", () => {
  it("is never shown for a plank, however long it runs", () => {
    expect(paceText(59, 59_000, true)).toBe("-");
  });

  it("still shows for reps", () => {
    expect(paceText(10, 30_000)).toBe("20/m");
  });
});
