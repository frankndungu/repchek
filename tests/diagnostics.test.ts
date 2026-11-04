import { describe, expect, it } from "vitest";
import { DiagnosticLog, packLandmarks, parseDebugParam } from "../src/diagnostics";
import type { Landmark } from "../src/engine/types";

describe("parseDebugParam", () => {
  it("reads on, off and nothing", () => {
    expect(parseDebugParam("?debug=1")).toBe("on");
    expect(parseDebugParam("?a=1&debug=0")).toBe("off");
    expect(parseDebugParam("?debug=yes")).toBeNull();
    expect(parseDebugParam("")).toBeNull();
  });
});

describe("packLandmarks", () => {
  it("keeps 19 joints as x, y and visibility, rounded", () => {
    const lm: Landmark[] = Array.from({ length: 33 }, (_, i) => ({
      x: i + 0.123456,
      y: 0.5,
      z: 0,
      visibility: 0.98765,
    }));
    const packed = packLandmarks(lm);
    expect(packed).toHaveLength(19 * 3);
    // The first kept joint is the nose, landmark 0.
    expect(packed.slice(0, 3)).toEqual([0.123, 0.5, 0.99]);
  });
});

describe("DiagnosticLog", () => {
  it("records the first time of each mark and the rows it is given", () => {
    const log = new DiagnosticLog();
    log.begin({ profile: "deadlift" });
    log.mark("camera");
    const first = log.marks.camera;
    log.mark("camera");
    expect(log.marks.camera).toBe(first);
    log.frame({ t: 1 });
    expect(log.hasData).toBe(true);
    const parsed = JSON.parse(log.json());
    expect(parsed.meta.profile).toBe("deadlift");
    expect(parsed.rows).toEqual([{ t: 1 }]);
    expect(parsed.landmarkOrder).toHaveLength(19);
  });

  it("starts empty again on a new set", () => {
    const log = new DiagnosticLog();
    log.begin({});
    log.frame({ t: 1 });
    log.begin({});
    expect(log.hasData).toBe(false);
  });
});
