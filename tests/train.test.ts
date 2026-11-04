import { describe, expect, it } from "vitest";
import { greetingLine, lastLine, streakTitle, TRAIN_ORDER, workoutsFor } from "../src/train";
import { weekDays, streakFor } from "../src/progress";
import type { SessionSummary } from "../src/progress";
import { initialsOf } from "../src/account";
import { exerciseIdForProfile } from "../src/profiles";
import type { HistoryItem } from "../src/history";

// Wednesday 11 Nov 2026, midday, local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 11 - daysAgo, hour).toISOString();

function summary(daysAgo: number, hour = 9): SessionSummary {
  return { exerciseId: "push-up", exerciseName: "Push-up", startedAt: at(daysAgo, hour), totalReps: 20, cleanReps: 18 };
}

function item(exerciseId: string, daysAgo: number, over: Partial<HistoryItem> = {}): HistoryItem & { exerciseKey?: string } {
  return { id: `${exerciseId}-${daysAgo}`, exerciseId, exerciseName: exerciseId, startedAt: at(daysAgo), totalReps: 36, cleanReps: 31, ...over };
}

describe("weekDays", () => {
  it("marks the days trained this week and today", () => {
    // Monday (2 days ago) trained. Today is Wednesday and not trained yet.
    const days = weekDays([summary(2)], NOW);
    expect(days.map((d) => d.label)).toEqual(["M", "T", "Today", "T", "F", "S", "S"]);
    expect(days.map((d) => d.trained)).toEqual([true, false, false, false, false, false, false]);
    expect(days.map((d) => d.today)).toEqual([false, false, true, false, false, false, false]);
  });

  it("marks today once trained, and ignores last week", () => {
    const days = weekDays([summary(0), summary(8)], NOW);
    expect(days[2]).toMatchObject({ label: "Today", trained: true, today: true });
    expect(days.filter((d) => d.trained)).toHaveLength(1);
  });
});

describe("days, not sessions, count towards the week", () => {
  it("counts two sessions on one day as one day", () => {
    expect(streakFor([summary(0, 8), summary(0, 18), summary(1)], NOW).thisWeek).toBe(2);
  });

  it("needs three different days for the week to count", () => {
    expect(streakFor([summary(0, 8), summary(0, 12), summary(0, 18)], NOW).weeks).toBe(0);
    expect(streakFor([summary(0), summary(1), summary(2)], NOW).weeks).toBe(1);
  });
});

describe("workoutsFor", () => {
  it("shows the default home exercises for someone new", () => {
    expect(workoutsFor(TRAIN_ORDER, []).map((w) => `${w.exerciseId}:${w.last === null}`)).toEqual([
      "push-up:true",
      "mountain-climbers:true",
      "biceps-curl:true",
    ]);
  });

  it("puts the most recently trained first, then the rest in order", () => {
    const cards = workoutsFor(TRAIN_ORDER, [item("deadlift", 1), item("push-up", 5), item("deadlift", 9)]);
    expect(cards.map((c) => c.exerciseId)).toEqual(["deadlift", "push-up", "mountain-climbers"]);
    // The latest deadlift is the one from yesterday.
    expect(cards[0].last?.id).toBe("deadlift-1");
  });

  it("treats the front push-up as the push-up", () => {
    const front = { ...item("push-up-front", 0), exerciseKey: "push-up" };
    expect(workoutsFor(TRAIN_ORDER, [front])[0]).toMatchObject({ exerciseId: "push-up" });
  });
});

describe("the lines", () => {
  it("reads the last set, with weight when there is one", () => {
    expect(lastLine(item("push-up", 1, { targetSets: 3, targetReps: 12 }))).toBe("Last: 3 x 12, 86% clean");
    expect(lastLine(item("deadlift", 1, { targetSets: 4, targetReps: 8, weightKg: 60 }))).toBe("Last: 4 x 8, 86% clean, 60 kg");
    expect(lastLine(item("push-up", 1))).toBe("Last: 36 reps, 86% clean");
    expect(lastLine(null)).toBe("New. Try it today");
  });

  it("says what day is next, or that the goal is hit", () => {
    expect(greetingLine(0, 3)).toBe("Ready for day 1 of 3 this week?");
    expect(greetingLine(2, 3)).toBe("Ready for day 3 of 3 this week?");
    expect(greetingLine(3, 3)).toBe("Goal hit this week. Extra days still count.");
    expect(greetingLine(5, 3)).toBe("Goal hit this week. Extra days still count.");
  });

  it("names the streak", () => {
    expect(streakTitle(4)).toBe("4 week streak");
    expect(streakTitle(0)).toBe("Start your streak");
  });
});

describe("initialsOf and exerciseIdForProfile", () => {
  it("takes two letters from a name or an email", () => {
    expect(initialsOf("Frank Ndung'u")).toBe("FN");
    expect(initialsOf("Frank")).toBe("FR");
    expect(initialsOf("frank@email.com")).toBe("FR");
    expect(initialsOf("")).toBe("R");
  });

  it("maps a session's profile to its exercise", () => {
    expect(exerciseIdForProfile("push-up-front")).toBe("push-up");
    expect(exerciseIdForProfile("mountain-climbers")).toBe("mountain-climbers");
    expect(exerciseIdForProfile("bench-press")).toBeNull();
  });
});
