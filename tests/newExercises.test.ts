import { describe, expect, it } from "vitest";
import { Judge } from "../src/engine/judge";
import { ReadinessGate } from "../src/engine/readiness";
import { counterFor } from "../src/engine/repCounter";
import type { ExerciseProfile, FrameMetrics } from "../src/engine/types";
import { crunch } from "../src/profiles/crunch";
import { dumbbellRow } from "../src/profiles/dumbbell-row";
import { EXERCISES, findProfile, profileFor } from "../src/profiles";
import { plank } from "../src/profiles/plank";
import { pullUp } from "../src/profiles/pull-up";

const frame = (m: Partial<FrameMetrics>) => m as FrameMetrics;

// Feeds one value of one metric per 100 ms and returns the events.
function run(profile: ExerciseProfile, metric: keyof FrameMetrics, values: number[], extra: Partial<FrameMetrics> = {}) {
  const counter = counterFor(profile);
  const out: string[] = [];
  let t = 0;
  for (const v of values) {
    t += 100;
    const e = counter.update(frame({ ...extra, [metric]: v }), t);
    if (e) out.push(e.type);
  }
  return out;
}

describe("the three new exercises are in the app", () => {
  it("can be picked and have a profile", () => {
    for (const id of ["crunch", "plank", "pull-up", "dumbbell-row"]) {
      const exercise = EXERCISES.find((e) => e.id === id)!;
      expect(exercise).toBeDefined();
      expect(profileFor(exercise, "beside").id).toBe(id);
      expect(findProfile(id).cameraView).toBe("side");
    }
  });

  it("only the plank counts seconds", () => {
    expect(EXERCISES.filter((e) => e.unit === "seconds").map((e) => e.id)).toEqual(["plank"]);
  });
});

describe("plank counts seconds in position", () => {
  const inPlank = { torsoAngle: 8, hipAngle: 172 };

  it("gives one for each full second held", () => {
    const frames = Array(35).fill(8); // 3.5 s at 100 ms
    expect(run(plank, "torsoAngle", frames, { hipAngle: 172 })).toEqual(["rep", "rep", "rep"]);
  });

  it("starts the second again after dropping out of position", () => {
    const frames = [...Array(8).fill(8), ...Array(5).fill(50), ...Array(8).fill(8)];
    expect(run(plank, "torsoAngle", frames, { hipAngle: 172 })).toEqual([]);
  });

  it("is armed by holding the position still, like any other exercise", () => {
    const gate = new ReadinessGate(plank);
    let armed = false;
    for (let t = 0; t <= 1200 && !armed; t += 100) armed = gate.update(frame(inPlank), t);
    expect(armed).toBe(true);
  });

  it("does not arm standing up", () => {
    const gate = new ReadinessGate(plank);
    let armed = false;
    for (let t = 0; t <= 2000; t += 100) armed = gate.update(frame({ torsoAngle: 88, hipAngle: 175 }), t) || armed;
    expect(armed).toBe(false);
  });

  it("marks a sagging body as a fault", () => {
    const judge = new Judge(plank);
    let verdict = judge.evaluate(frame({ hipAngle: 130, torsoAngle: 8 }), "turn");
    for (let i = 0; i < 6; i++) verdict = judge.evaluate(frame({ hipAngle: 130, torsoAngle: 8 }), "turn");
    expect(verdict.failures.map((r) => r.id)).toEqual(["body-line"]);
  });

  it("is not a hold for the other exercises", () => {
    expect(crunch.hold).toBeUndefined();
    expect(pullUp.hold).toBeUndefined();
  });
});

describe("crunches count lifts of the shoulders off the floor", () => {
  const knees = { kneeAngle: 80 };

  it("counts a crunch that lifts to 28 degrees and comes back down", () => {
    expect(run(crunch, "torsoAngle", [3, 10, 18, 28, 20, 10, 3], knees)).toEqual(["rep"]);
  });

  it("counts reps in a row", () => {
    const rep = [10, 18, 28, 18, 5];
    expect(run(crunch, "torsoAngle", [3, ...rep, ...rep, ...rep], knees)).toEqual(["rep", "rep", "rep"]);
  });

  it("calls a small lift a partial rep", () => {
    expect(run(crunch, "torsoAngle", [3, 10, 15, 11, 3], knees)).toEqual(["partial"]);
  });

  it("does not arm with straight legs", () => {
    const gate = new ReadinessGate(crunch);
    let armed = false;
    for (let t = 0; t <= 2000; t += 100) armed = gate.update(frame({ torsoAngle: 3, kneeAngle: 175 }), t) || armed;
    expect(armed).toBe(false);
  });
});

describe("pull-ups count a full hang and a pull to the top", () => {
  const hanging = { torsoAngle: 85 };

  it("counts a pull from straight arms to 55 degrees", () => {
    expect(run(pullUp, "elbowAngle", [172, 150, 110, 70, 55, 90, 130, 165, 172], hanging)).toEqual(["rep"]);
  });

  it("calls a half pull a partial rep", () => {
    expect(run(pullUp, "elbowAngle", [172, 140, 110, 100, 130, 170], hanging)).toEqual(["partial"]);
  });

  it("flags a swinging body", () => {
    const judge = new Judge(pullUp);
    let verdict = judge.evaluate(frame({ torsoAngle: 50 }), "moving-out");
    for (let i = 0; i < 6; i++) verdict = judge.evaluate(frame({ torsoAngle: 50 }), "moving-out");
    expect(verdict.failures.map((r) => r.id)).toEqual(["swing"]);
  });
});

describe("dumbbell row counts the working arm like the barbell row", () => {
  const bent = { torsoAngle: 35 };

  it("counts a pull from a hanging arm to 85 degrees", () => {
    expect(run(dumbbellRow, "elbowAngle", [168, 150, 120, 85, 110, 140, 160], bent)).toEqual(["rep"]);
  });

  it("calls a short pull a partial rep", () => {
    expect(run(dumbbellRow, "elbowAngle", [168, 150, 125, 118, 140, 160], bent)).toEqual(["partial"]);
  });

  it("flags standing up with the dumbbell", () => {
    const judge = new Judge(dumbbellRow);
    let verdict = judge.evaluate(frame({ torsoAngle: 80, neckAngle: 170 }), "moving-out");
    for (let i = 0; i < 6; i++) verdict = judge.evaluate(frame({ torsoAngle: 80, neckAngle: 170 }), "moving-out");
    expect(verdict.failures.map((r) => r.id)).toEqual(["torso-too-upright"]);
  });
});
