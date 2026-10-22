import { describe, expect, it } from "vitest";
import { SessionTracker } from "../src/engine/session";

const startedAt = new Date("2026-10-22T09:00:00.000Z");
const identity = { id: startedAt.toISOString(), startedAt };

function rep(durationMs = 1000): {
  type: "rep";
  count: number;
  durationMs: number;
} {
  return { type: "rep", count: 1, durationMs };
}

describe("SessionTracker checkpoints", () => {
  it("exports and restores mid-set committed reps and partial counts", () => {
    const tracker = new SessionTracker({ sets: 3, reps: 4 });
    tracker.startSet(100);
    tracker.onRepEvent(rep(), ["hips-sag"], 1100);
    tracker.onRepEvent({ type: "partial", count: 1, durationMs: 500 }, [], 1600);

    const checkpoint = tracker.exportCheckpoint(identity);
    const restored = SessionTracker.restoreCheckpoint(checkpoint);

    expect(restored.isFinished).toBe(false);
    expect(restored.set).toBe(1);
    expect(restored.reps).toBe(1);
    expect(restored.isResting).toBe(false);
    expect(restored.tick(Number.MAX_SAFE_INTEGER)).toBeNull();
    expect(restored.exportCheckpoint(identity)).toEqual(checkpoint);
  });

  it("exports and restores after a completed set without losing rest progress", () => {
    const tracker = new SessionTracker({ sets: 3, reps: 2 });
    tracker.startSet(100);
    tracker.onRepEvent(rep(), [], 1100);
    const event = tracker.onRepEvent(rep(), [], 2200);

    expect(event?.type).toBe("set-complete");
    const checkpoint = tracker.exportCheckpoint(identity);
    const restored = SessionTracker.restoreCheckpoint(checkpoint);

    expect(restored.set).toBe(2);
    expect(restored.reps).toBe(0);
    expect(restored.isResting).toBe(true);
    expect(restored.records).toEqual(checkpoint.completed);
    expect(restored.isFinished).toBe(false);
  });

  it("continues counting restored progress without duplicating committed reps", () => {
    const tracker = new SessionTracker({ sets: 2, reps: 3 });
    tracker.startSet(100);
    tracker.onRepEvent(rep(), [], 1100);
    tracker.onRepEvent({ type: "partial", count: 1, durationMs: 500 }, [], 1600);

    const restored = SessionTracker.restoreCheckpoint(
      tracker.exportCheckpoint(identity),
    );
    restored.startSet(5000);
    restored.onRepEvent(rep(), [], 6000);
    expect(restored.reps).toBe(2);
    expect(restored.records).toHaveLength(0);

    const completion = restored.onRepEvent(rep(), [], 7000);
    expect(completion?.type).toBe("set-complete");
    expect(restored.records).toHaveLength(1);
    expect(restored.records[0].reps).toHaveLength(3);
    expect(restored.records[0].partials).toBe(1);
  });

  it("can finish normally after restoring and produce a completed record", () => {
    const tracker = new SessionTracker({ sets: 2, reps: 2 });
    tracker.startSet(100);
    tracker.onRepEvent(rep(), ["knee-drive"], 1100);
    const restored = SessionTracker.restoreCheckpoint(
      tracker.exportCheckpoint(identity),
    );
    restored.startSet(3000);
    restored.onRepEvent(rep(), [], 4000);

    const record = restored.toRecord({
      exerciseId: "push-up",
      exerciseName: "Push-up",
      startedAt,
      weightKg: null,
    });

    expect(restored.isFinished).toBe(true);
    expect(record.id).toBe(identity.id);
    expect(record.sets[0].reps).toHaveLength(2);
    expect(record.sets[0].reps[0].faults).toEqual(["knee-drive"]);
  });

  it("rejects unsupported versions and inconsistent checkpoint data", () => {
    const tracker = new SessionTracker({ sets: 2, reps: 3 });
    const checkpoint = tracker.exportCheckpoint(identity);

    expect(() =>
      SessionTracker.restoreCheckpoint({ ...checkpoint, version: 2 }),
    ).toThrow(/version/i);
    expect(() =>
      SessionTracker.restoreCheckpoint({
        ...checkpoint,
        currentSet: 2,
      }),
    ).toThrow(/progress/i);
    expect(() =>
      SessionTracker.restoreCheckpoint({
        ...checkpoint,
        currentReps: [rep(), rep(), rep()],
      }),
    ).toThrow(/progress/i);
    expect(() =>
      SessionTracker.restoreCheckpoint({
        ...checkpoint,
        completed: [
          { set: 2, reps: [rep()], partials: 0 },
        ],
        currentSet: 2,
      }),
    ).toThrow(/progress/i);
  });

  it("does not mutate or finish the tracker when exporting", () => {
    const tracker = new SessionTracker({ sets: 2, reps: 3 });
    tracker.startSet(100);
    tracker.onRepEvent(rep(), ["back-rounding"], 1100);
    tracker.onRepEvent({ type: "partial", count: 1, durationMs: 500 }, [], 1600);
    const recordsBefore = structuredClone(tracker.records);

    const checkpoint = tracker.exportCheckpoint(identity);
    checkpoint.currentReps[0].faults.push("changed-copy");
    checkpoint.completed.push({ set: 1, reps: [], partials: 0 });

    expect(tracker.isFinished).toBe(false);
    expect(tracker.reps).toBe(1);
    expect(tracker.records).toEqual(recordsBefore);
    expect(tracker.exportCheckpoint(identity).currentReps[0].faults).toEqual([
      "back-rounding",
    ]);
  });

  it("preserves normal constructor and automatic session-completion behavior", () => {
    const tracker = new SessionTracker({ sets: 1, reps: 1 });
    tracker.startSet(100);
    const event = tracker.onRepEvent(rep(), [], 1100);

    expect(event?.type).toBe("session-complete");
    expect(tracker.isFinished).toBe(true);
    expect(tracker.finish()).toHaveLength(1);
    expect(() => tracker.exportCheckpoint(identity)).toThrow(/finished/);
  });
});
