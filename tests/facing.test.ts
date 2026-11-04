import { describe, expect, it } from "vitest";
import { FACING_CAMERA_RATIO, facingRatio } from "../src/engine/angles";
import type { Landmark } from "../src/engine/types";
import { LANDMARK } from "../src/engine/types";

function pose(points: Partial<Record<keyof typeof LANDMARK, [number, number, number?]>>): Landmark[] {
  const all: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 0 }));
  for (const [name, [x, y, v = 1]] of Object.entries(points) as [keyof typeof LANDMARK, [number, number, number?]][]) {
    all[LANDMARK[name]] = { x, y, z: 0, visibility: v };
  }
  return all;
}

describe("facingRatio", () => {
  it("is near zero side-on, with the shoulders on top of each other", () => {
    const side = pose({ NOSE: [0.55, 0.2], LEFT_SHOULDER: [0.5, 0.3], RIGHT_SHOULDER: [0.51, 0.3] });
    expect(facingRatio(side, 1)!).toBeLessThan(0.2);
  });

  it("is large facing the camera, with the shoulders wide apart", () => {
    const front = pose({ NOSE: [0.5, 0.2], LEFT_SHOULDER: [0.4, 0.3], RIGHT_SHOULDER: [0.6, 0.3] });
    expect(facingRatio(front, 1)!).toBeGreaterThan(FACING_CAMERA_RATIO * 2);
  });

  it("stays large when bent over facing the camera and the hips are hidden", () => {
    // Head close to the shoulders, shoulders wide, hips not seen at all.
    const hinged = pose({ NOSE: [0.5, 0.33], LEFT_SHOULDER: [0.38, 0.36], RIGHT_SHOULDER: [0.62, 0.36] });
    expect(facingRatio(hinged, 1)!).toBeGreaterThan(FACING_CAMERA_RATIO);
  });

  it("stays small side-on and hinged with the head forward", () => {
    const hinged = pose({ NOSE: [0.7, 0.4], LEFT_SHOULDER: [0.5, 0.35], RIGHT_SHOULDER: [0.52, 0.36] });
    expect(facingRatio(hinged, 0.5625)!).toBeLessThan(FACING_CAMERA_RATIO);
  });

  it("is null when the nose or a shoulder is not seen", () => {
    const hidden = pose({ NOSE: [0.5, 0.2, 0.2], LEFT_SHOULDER: [0.4, 0.3], RIGHT_SHOULDER: [0.6, 0.3] });
    expect(facingRatio(hidden, 1)).toBeNull();
  });
});
