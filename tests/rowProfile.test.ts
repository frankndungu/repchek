import { describe, expect, it } from "vitest";
import { RepCounter } from "../src/engine/repCounter";
import type { RepTrigger, FrameMetrics } from "../src/engine/types";
import { barbellRow } from "../src/profiles/barbell-row";
import { deadlift } from "../src/profiles/deadlift";

function events(trigger: RepTrigger, elbowAngles: number[]): string[] {
  const counter = new RepCounter(trigger);
  const out: string[] = [];
  let t = 0;
  for (const a of elbowAngles) {
    t += 100;
    const e = counter.update({ elbowAngle: a } as FrameMetrics, t);
    if (e) out.push(e.type);
  }
  return out;
}

describe("barbell row", () => {
  it("counts a pull that bottoms out at 98 degrees and ends at 145", () => {
    expect(events(barbellRow.rep, [170, 160, 130, 98, 120, 145])).toEqual(["rep"]);
  });

  it("is why the old trigger counted nothing: no rep and no partial notice", () => {
    // The old trigger (start 160, turn 80) needed 148 or more to finish a rep
    // and 92 or less at the top. An arm that ends at 145 never gets back to
    // the start zone, so the counter stays stuck mid rep and says nothing.
    // That is what the back camera clip showed: arms moving, armed, 0 reps,
    // no partial rep notice.
    expect(events({ metric: "elbowAngle", start: 160, turn: 80 }, [170, 160, 130, 98, 120, 145])).toEqual([]);
  });

  it("calls a pull that stops well short a partial rep", () => {
    expect(events(barbellRow.rep, [170, 150, 125, 112, 140, 150])).toEqual(["partial"]);
  });

  it("counts reps in a row", () => {
    const rep = [150, 130, 95, 120, 150];
    expect(events(barbellRow.rep, [170, ...rep, ...rep, ...rep])).toEqual(["rep", "rep", "rep"]);
  });

  it("arms on the first rep and only needs the joints it uses", () => {
    expect(barbellRow.rollingStart).toBe(true);
    expect(barbellRow.requiredJoints).toEqual(["head", "shoulder", "elbow", "wrist", "hip"]);
  });
});

describe("deadlift", () => {
  it("no longer flags a flat back at the bottom of the hinge", () => {
    expect(deadlift.rules.some((r) => r.id === "torso-angle")).toBe(false);
  });

  it("keeps a looser neck and bar check", () => {
    const neck = deadlift.rules.find((r) => r.id === "neck-angle");
    const bar = deadlift.rules.find((r) => r.id === "bar-path");
    expect(neck?.min).toBe(130);
    expect(bar?.max).toBe(0.7);
  });
});
