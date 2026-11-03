import { describe, expect, it } from "vitest";
import { dayLabel, rowText, viewFor } from "../src/history";
import type { HistoryItem } from "../src/history";

// Wednesday 11 Nov 2026, midday, local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);

function at(daysAgo: number, hour = 9): string {
  return new Date(2026, 10, 11 - daysAgo, hour, 0, 0).toISOString();
}

function item(daysAgo: number, total = 34, clean = 29): HistoryItem {
  return {
    id: String(daysAgo),
    exerciseName: "Push-up (side)",
    startedAt: at(daysAgo),
    totalReps: total,
    cleanReps: clean,
  };
}

describe("viewFor", () => {
  const items = [item(0), item(2), item(6), item(8), item(30)];

  it("gives premium everything", () => {
    expect(viewFor("premium", items, NOW)).toEqual({
      visible: items,
      locked: 0,
    });
  });

  it("gives free the last 7 days and counts the rest", () => {
    const view = viewFor("free", items, NOW);
    expect(view.visible.map((i) => i.id)).toEqual(["0", "2", "6"]);
    expect(view.locked).toBe(2);
  });

  it("locks nothing when everything is recent", () => {
    expect(viewFor("free", [item(1)], NOW).locked).toBe(0);
  });
});

describe("dayLabel", () => {
  it("says Today for today", () => {
    expect(dayLabel(at(0, 1), NOW)).toBe("Today");
  });

  it("uses the weekday for the days before", () => {
    expect(dayLabel(at(1), NOW)).toBe("Tue");
    expect(dayLabel(at(2), NOW)).toBe("Mon");
    expect(dayLabel(at(6), NOW)).toBe("Thu");
  });

  it("uses the date from a week back", () => {
    expect(dayLabel(at(7), NOW)).toBe("4 Nov");
    expect(dayLabel(at(30), NOW)).toBe("12 Oct");
  });

  it("adds the year for another year", () => {
    expect(dayLabel(new Date(2025, 11, 30, 9).toISOString(), NOW)).toBe(
      "30 Dec 2025",
    );
  });
});

describe("rowText", () => {
  it("reads like the mockup", () => {
    expect(rowText(item(0))).toBe("Push-up, 34 reps, 85% clean");
  });

  it("handles one rep and no clean reps", () => {
    expect(rowText(item(0, 1, 0))).toBe("Push-up, 1 rep, 0% clean");
  });
});
