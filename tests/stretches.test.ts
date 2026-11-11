import { describe, expect, it } from "vitest";
import {
  FULL_BODY,
  GET_READY_SECONDS,
  ROUTINES,
  holdText,
  lengthText,
  stepTitle,
  stepsFor,
  totalSeconds,
} from "../src/stretches";
import { STRETCH_PICTURES } from "../src/ui/stretchPictures";

describe("the full body stretch", () => {
  it("does each side of a two-sided stretch, left then right", () => {
    const quad = stepsFor(FULL_BODY).filter((s) => s.stretch.id === "quad-stretch");
    expect(quad.map((s) => s.side)).toEqual(["left", "right"]);
    expect(stepTitle(quad[0])).toBe("Standing quad stretch, left side");
  });

  it("has one step for a stretch done once", () => {
    const cobra = stepsFor(FULL_BODY).filter((s) => s.stretch.id === "cobra");
    expect(cobra).toHaveLength(1);
    expect(stepTitle(cobra[0])).toBe("Cobra");
  });

  it("runs about 8 minutes, get ready time included", () => {
    const steps = stepsFor(FULL_BODY);
    const holds = steps.reduce((sum, s) => sum + s.seconds, 0);
    expect(totalSeconds(FULL_BODY)).toBe(holds + steps.length * GET_READY_SECONDS);
    expect(lengthText(totalSeconds(FULL_BODY))).toBe("About 8 minutes");
  });

  it("has a picture for every stretch", () => {
    for (const routine of ROUTINES) {
      for (const stretch of routine.stretches) {
        expect(STRETCH_PICTURES[stretch.id], stretch.id).toBeDefined();
      }
    }
  });

  it("writes the hold time for the list", () => {
    expect(holdText({ id: "a", name: "A", how: "", seconds: 30 })).toBe("30 s");
    expect(holdText({ id: "a", name: "A", how: "", seconds: 30, sides: true })).toBe("30 s each side");
  });

  it("says one minute, not one minutes", () => {
    expect(lengthText(50)).toBe("About 1 minute");
  });
});
