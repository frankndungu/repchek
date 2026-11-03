import { describe, expect, it } from "vitest";
import {
  compareToPrevious,
  comparisonText,
  dayLabel,
  exerciseChips,
  groupByWeek,
  sparkline,
  weekTrend,
} from "../src/history";
import type { HistoryItem } from "../src/history";

// Wednesday 11 Nov 2026, midday, local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);

function at(daysAgo: number, hour = 9): string {
  return new Date(2026, 10, 11 - daysAgo, hour, 0, 0).toISOString();
}

function item(
  daysAgo: number,
  total = 20,
  clean = 15,
  exerciseId = "pushup",
): HistoryItem {
  return {
    id: `${exerciseId}-${daysAgo}`,
    exerciseId,
    exerciseName: exerciseId === "pushup" ? "Push-up (side)" : "Deadlift",
    startedAt: at(daysAgo),
    totalReps: total,
    cleanReps: clean,
  };
}

describe("dayLabel", () => {
  it("says Today, then the weekday, then the date", () => {
    expect(dayLabel(at(0, 1), NOW)).toBe("Today");
    expect(dayLabel(at(1), NOW)).toBe("Tue");
    expect(dayLabel(at(6), NOW)).toBe("Thu");
    expect(dayLabel(at(7), NOW)).toBe("4 Nov");
    expect(dayLabel(new Date(2025, 11, 30, 9).toISOString(), NOW)).toBe(
      "30 Dec 2025",
    );
  });
});

describe("groupByWeek", () => {
  it("groups by week, newest first, with totals and titles", () => {
    // Wed 11 Nov: this week starts Mon 9 Nov.
    const groups = groupByWeek(
      [item(0, 20, 18), item(1, 10, 5), item(3), item(10)],
      NOW,
    );
    expect(groups.map((g) => g.title)).toEqual([
      "This week",
      "Last week",
      "26 Oct to 1 Nov",
    ]);
    expect(groups[0]).toMatchObject({ sessions: 2, cleanReps: 23 });
    expect(groups[1].sessions).toBe(1);
  });
});

describe("exerciseChips", () => {
  it("lists exercises most trained first, with short names", () => {
    const chips = exerciseChips([
      item(1, 10, 5, "deadlift"),
      item(2),
      item(3),
    ]);
    expect(chips).toEqual([
      { id: "pushup", name: "Push-up" },
      { id: "deadlift", name: "Deadlift" },
    ]);
  });
});

describe("weekTrend", () => {
  it("is none until both weeks have a session", () => {
    expect(weekTrend([item(0)], NOW).direction).toBe("none");
    expect(weekTrend([], NOW).direction).toBe("none");
  });

  it("says up, steady or down by clean rate in points", () => {
    // Last week: 50%. This week: 80%.
    expect(weekTrend([item(0, 20, 16), item(9, 20, 10)], NOW)).toMatchObject({
      direction: "up",
      points: 30,
      thisWeek: 80,
      lastWeek: 50,
    });
    expect(weekTrend([item(0, 20, 15), item(9, 20, 15)], NOW).direction).toBe(
      "steady",
    );
    expect(weekTrend([item(0, 20, 8), item(9, 20, 16)], NOW).direction).toBe(
      "down",
    );
  });
});

describe("sparkline", () => {
  it("gives the last five clean rates, oldest first", () => {
    const items = [0, 1, 2, 3, 4, 5].map((d) => item(d, 20, 20 - d * 2));
    expect(sparkline(items)).toHaveLength(5);
    // Oldest of the five (4 days ago) first: 12 of 20 = 60%.
    expect(sparkline(items)[0]).toBe(60);
    expect(sparkline(items)[4]).toBe(100);
  });
});

describe("compareToPrevious", () => {
  const history = [item(8, 20, 10), item(3, 20, 14, "deadlift"), item(5, 20, 12)];

  it("compares with the latest earlier session of the same exercise", () => {
    const result = compareToPrevious(history, {
      exerciseId: "pushup",
      startedAt: at(0),
      totalReps: 20,
      cleanReps: 17,
    });
    // Previous push-up was 5 days ago: 12 of 20 = 60%. Now 85%.
    expect(result).toEqual({ now: 85, before: 60, points: 25 });
  });

  it("is null for a first session of an exercise", () => {
    expect(
      compareToPrevious(history, {
        exerciseId: "row",
        startedAt: at(0),
        totalReps: 10,
        cleanReps: 9,
      }),
    ).toBeNull();
  });

  it("ignores later sessions", () => {
    expect(
      compareToPrevious(history, {
        exerciseId: "pushup",
        startedAt: at(20),
        totalReps: 10,
        cleanReps: 9,
      }),
    ).toBeNull();
  });
});

describe("comparisonText", () => {
  it("reads plainly in each case", () => {
    expect(comparisonText({ now: 85, before: 78, points: 7 }, "Push-up")).toBe(
      "Clean rate up 7 points from last time, 78% to 85%.",
    );
    expect(comparisonText({ now: 70, before: 71, points: -1 }, "Push-up")).toBe(
      "Clean rate steady at 70%, same as last time.",
    );
    expect(comparisonText({ now: 60, before: 61 + 1, points: -2 }, "Push-up")).toBe(
      "Clean rate down 2 points from last time, 62% to 60%.",
    );
    expect(comparisonText(null, "Push-up (side)")).toBe(
      "First push-up session saved. Do it again to see how you are improving.",
    );
  });
});
