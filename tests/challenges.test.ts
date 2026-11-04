import { describe, expect, it } from "vitest";
import {
  codeFromPath,
  datesText,
  exerciseLabel,
  failureFrom,
  profileIdsFor,
  progressFor,
  rangeFor,
  shareText,
  standingLine,
  statusFor,
  toChallenge,
  toStanding,
} from "../src/challenges";

// Wednesday 11 Nov 2026, midday, local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);

describe("challenge links", () => {
  it("reads the code from /c/<code>", () => {
    expect(codeFromPath("/c/ab12cd34")).toBe("ab12cd34");
    expect(codeFromPath("/c/AB12CD34/")).toBe("ab12cd34");
  });

  it("ignores every other address", () => {
    expect(codeFromPath("/")).toBeNull();
    expect(codeFromPath("/c/")).toBeNull();
    expect(codeFromPath("/c/ab/cd")).toBeNull();
    expect(codeFromPath("/c/../etc")).toBeNull();
    expect(codeFromPath("/x/ab12cd34")).toBeNull();
  });

  it("puts the link in the share text", () => {
    expect(shareText("100 clean push-ups", "https://app.repchek.fit/c/ab12cd34")).toBe(
      "Join my challenge on repchek: 100 clean push-ups. https://app.repchek.fit/c/ab12cd34",
    );
  });
});

describe("what counts", () => {
  it("stores push-up from the side and the front", () => {
    expect(profileIdsFor(["push-up"]).sort()).toEqual(["push-up", "push-up-front"]);
  });

  it("stores one id for a one-view exercise, and none for nothing", () => {
    expect(profileIdsFor(["deadlift"])).toEqual(["deadlift"]);
    expect(profileIdsFor([])).toEqual([]);
    expect(profileIdsFor(["squat"])).toEqual([]);
  });

  it("names the exercises", () => {
    expect(exerciseLabel([])).toBe("Any exercise");
    expect(exerciseLabel(["push-up", "push-up-front"])).toBe("Push-up");
    expect(exerciseLabel(["push-up", "deadlift"])).toBe("Push-up and Deadlift");
  });
});

describe("dates", () => {
  it("runs 'This week' from today to the end of Sunday", () => {
    const { startsAt, endsAt } = rangeFor("week", NOW);
    expect(new Date(startsAt)).toEqual(new Date(2026, 10, 11));
    expect(new Date(endsAt)).toEqual(new Date(2026, 10, 16));
  });

  it("gives a whole week when started on a Monday", () => {
    const monday = new Date(2026, 10, 9, 8, 0, 0);
    expect(new Date(rangeFor("week", monday).endsAt)).toEqual(new Date(2026, 10, 16));
  });

  it("runs 7 and 30 days from midnight today", () => {
    expect(new Date(rangeFor("7", NOW).endsAt)).toEqual(new Date(2026, 10, 18));
    expect(new Date(rangeFor("30", NOW).endsAt)).toEqual(new Date(2026, 11, 11));
  });

  it("starts early enough for the database and stays under its 92 day limit", () => {
    const { startsAt, endsAt } = rangeFor("30", NOW);
    expect(NOW.getTime() - Date.parse(startsAt)).toBeLessThan(86_400_000);
    expect(Date.parse(endsAt) - Date.parse(startsAt)).toBeLessThanOrEqual(92 * 86_400_000);
  });

  it("writes the last day, not the midnight after", () => {
    const { startsAt, endsAt } = rangeFor("week", NOW);
    expect(datesText(startsAt, endsAt)).toBe("11 Nov to 15 Nov");
  });
});

describe("status", () => {
  const { startsAt, endsAt } = rangeFor("week", NOW);

  it("counts the days left", () => {
    expect(statusFor(startsAt, endsAt, NOW)).toEqual({ state: "running", text: "5 days left" });
  });

  it("says last day on the final day", () => {
    const sunday = new Date(2026, 10, 15, 10, 0, 0);
    expect(statusFor(startsAt, endsAt, sunday)).toEqual({ state: "running", text: "Last day" });
  });

  it("says when it has ended", () => {
    expect(statusFor(startsAt, endsAt, new Date(2026, 10, 16, 9, 0, 0))).toEqual({
      state: "ended",
      text: "Ended today",
    });
    expect(statusFor(startsAt, endsAt, new Date(2026, 10, 19, 12, 0, 0)).text).toBe("Ended 3 days ago");
  });

  it("says when it has not started", () => {
    const later = rangeFor("7", new Date(2026, 10, 20));
    expect(statusFor(later.startsAt, later.endsAt, NOW)).toEqual({
      state: "upcoming",
      text: "Starts in 9 days",
    });
  });
});

describe("progress toward the goal", () => {
  it("has no bar without a goal", () => {
    expect(progressFor(40, null)).toBeNull();
  });

  it("shows how far along", () => {
    expect(progressFor(40, 100)).toEqual({ pct: 40, text: "40 of 100 clean reps" });
  });

  it("caps at 100 and says the goal is reached", () => {
    expect(progressFor(130, 100)).toEqual({
      pct: 100,
      text: "Goal reached. 130 of 100 clean reps.",
    });
  });
});

describe("rows from the database", () => {
  it("turns a standing into numbers, even when they arrive as strings", () => {
    const standing = toStanding({
      rank: "2",
      user_id: "u1",
      name: "Ben",
      workouts: "1",
      clean_reps: "38",
      total_reps: "40",
      is_me: true,
    });
    expect(standing).toEqual({
      rank: 2,
      userId: "u1",
      name: "Ben",
      workouts: 1,
      cleanReps: 38,
      totalReps: 40,
      isMe: true,
    });
    expect(standingLine(standing)).toBe("1 workout, 38 clean reps");
  });

  it("keeps a missing goal as null and survives missing fields", () => {
    const c = toChallenge({ id: "i", code: "c", title: "T", goal_clean_reps: null });
    expect(c.goalCleanReps).toBeNull();
    expect(c.exerciseIds).toEqual([]);
    expect(c.creatorName).toBe("Someone");
    expect(c.joined).toBe(false);
  });
});

describe("failures", () => {
  it("recognises the database's words", () => {
    expect(failureFrom({ message: "not_a_member" })).toBe("not_a_member");
    expect(failureFrom({ message: "too_many_today" })).toBe("too_many_today");
    expect(failureFrom({ message: "ended" })).toBe("ended");
    expect(failureFrom({ message: "bad_dates" })).toBe("bad_input");
    expect(failureFrom({ message: 'violates check constraint "challenges_title_check"' })).toBe("bad_input");
  });

  it("calls a dropped connection a network problem and the rest unknown", () => {
    expect(failureFrom(new TypeError("Failed to fetch"))).toBe("network");
    expect(failureFrom({ message: "boom" })).toBe("unknown");
  });
});
