import { describe, expect, it } from "vitest";
import {
  daysTrained,
  heatmap,
  heatmapMonths,
  streakCopy,
  streakFor,
} from "../src/progress";
import type { SessionSummary } from "../src/progress";

// Wednesday 11 Nov 2026, midday, local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 11 - daysAgo, hour).toISOString();
const session = (daysAgo: number, clean = 18, hour = 9): SessionSummary => ({
  exerciseId: "push-up",
  exerciseName: "Push-up",
  startedAt: at(daysAgo, hour),
  totalReps: 20,
  cleanReps: clean,
});

describe("the weekly goal is the person's own", () => {
  const twoDays = [session(0), session(1)];

  it("does not start a streak at 2 days with a goal of 3, but does with a goal of 2", () => {
    expect(streakFor(twoDays, NOW, 3).weeks).toBe(0);
    expect(streakFor(twoDays, NOW, 2).weeks).toBe(1);
  });

  it("reports the goal it used", () => {
    expect(streakFor([], NOW, 5).goal).toBe(5);
    expect(streakFor([], NOW).goal).toBe(3);
  });
});

describe("streakCopy says how to start and how to keep it", () => {
  it("explains the start, and how far along you are", () => {
    const info = streakFor([session(0), session(1)], NOW, 3);
    expect(streakCopy(info)).toEqual({
      title: "Start your streak",
      sub: "Train 3 days in one week to start it. You are on 2 of 3.",
    });
  });

  it("says what to do with no sessions yet", () => {
    expect(streakCopy(streakFor([], NOW, 3)).sub).toBe("Train 3 days in one week to start it.");
  });

  it("says how many days keep a running streak going", () => {
    // Last week had 3 days. This week 1 so far.
    const sessions = [session(7), session(8), session(9), session(0)];
    expect(streakCopy(streakFor(sessions, NOW, 3))).toEqual({
      title: "1 week streak",
      sub: "2 days more this week keeps it going.",
    });
    expect(streakCopy(streakFor([...sessions, session(1), session(2)], NOW, 3)).sub).toContain("Goal hit");
  });

  it("uses the singular for one day, and says the goal is hit once it is", () => {
    // Last week had 3 days. This week has 2 so far, and the goal is 3.
    const sessions = [session(7), session(8), session(9), session(0), session(1)];
    expect(streakCopy(streakFor(sessions, NOW, 3)).sub).toBe("1 day more this week keeps it going.");
    expect(streakCopy(streakFor([...sessions, session(2)], NOW, 3)).sub).toBe(
      "Goal hit this week. Extra days still count.",
    );
  });
});

describe("daysTrained", () => {
  it("counts different days, not sessions", () => {
    expect(daysTrained([session(0, 18, 8), session(0, 18, 18), session(3)])).toBe(2);
  });
});

describe("heatmap", () => {
  const grid = heatmap([session(0), session(0, 10, 18), session(2), session(40)], 12, NOW);

  it("is weeks of seven days, oldest week first, Monday to Sunday", () => {
    expect(grid).toHaveLength(12);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    // This week: Monday 9 Nov first.
    expect(grid[11][0].label).toBe("Mon 9 Nov");
    expect(grid[11][2].label).toBe("Wed 11 Nov");
    expect(grid[0][0].label).toBe("Mon 24 Aug");
  });

  it("marks today and the days still to come", () => {
    expect(grid[11][2]).toMatchObject({ today: true, future: false });
    expect(grid[11][3]).toMatchObject({ today: false, future: true });
    expect(grid[11][6].future).toBe(true);
    expect(grid[10].some((c) => c.future)).toBe(false);
  });

  it("shades by sessions in the day and adds up the clean reps", () => {
    expect(grid[11][2]).toMatchObject({ sessions: 2, level: 2, cleanReps: 28 });
    expect(grid[11][0]).toMatchObject({ sessions: 1, level: 1 });
    expect(grid[11][1]).toMatchObject({ sessions: 0, level: 0 });
  });

  it("tops out at level 4", () => {
    const many = heatmap([0, 0, 0, 0, 0].map((_, i) => session(0, 18, 6 + i)), 2, NOW);
    expect(many[1][2].level).toBe(4);
  });

  it("finds sessions from weeks back", () => {
    // 40 days ago is Friday 2 October.
    const cell = grid.flat().find((c) => c.label === "Fri 2 Oct");
    expect(cell?.sessions).toBe(1);
  });

  it("names the month above the first week of each month", () => {
    const months = heatmapMonths(grid);
    expect(months).toHaveLength(12);
    expect(months.filter((m) => m).slice(-2)).toEqual(["Oct", "Nov"]);
    expect(months[0]).toBe("Aug");
  });
});
