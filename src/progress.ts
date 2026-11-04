// Level, streak, totals and milestones. Pure functions over the saved
// sessions, so they are easy to test and need no network.

// One saved session, as much as the maths needs.
export interface SessionSummary {
  exerciseId: string;
  exerciseName: string;
  startedAt: string;
  totalReps: number;
  cleanReps: number;
}

// XP is clean reps, nothing else. Speed never earns anything.
export function xpFor(sessions: SessionSummary[]): number {
  return sessions.reduce((sum, s) => sum + s.cleanReps, 0);
}

// Finishing level n takes 100 * (n + 1) XP: 200 for level 1, 300 for
// level 2, 500 for level 4.
export function xpToFinishLevel(level: number): number {
  return 100 * (level + 1);
}

export interface LevelInfo {
  level: number;
  // XP earned inside this level, and what the level needs in all.
  into: number;
  needed: number;
}

export function levelFor(xp: number): LevelInfo {
  let level = 1;
  let left = Math.max(0, Math.floor(xp));
  while (left >= xpToFinishLevel(level)) {
    left -= xpToFinishLevel(level);
    level += 1;
  }
  return { level, into: left, needed: xpToFinishLevel(level) };
}

// A week counts when you trained on this many different days.
// The goal until someone sets their own.
export const WEEKLY_GOAL = 3;

// Monday of the week the date is in, in the lifter's own time zone, as a
// day count. Two dates are in the same week when this matches.
function weekOf(date: Date): number {
  const day = (date.getDay() + 6) % 7;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - day);
  return Math.round(
    Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) /
      86_400_000,
  );
}

const DAYS_IN_WEEK = 7;

// The calendar day a date is on, in the lifter's own time zone, as a count.
function dayOf(date: Date): number {
  return Math.round(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000,
  );
}

function countedSessions(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.filter((s) => s.totalReps > 0);
}

// The days of each week that had a session. Two sessions on one day are one
// day, because the goal is days trained, not sessions.
function daysByWeek(sessions: SessionSummary[]): Map<number, Set<number>> {
  const perWeek = new Map<number, Set<number>>();
  for (const s of countedSessions(sessions)) {
    const date = new Date(s.startedAt);
    const week = weekOf(date);
    const days = perWeek.get(week) ?? new Set<number>();
    days.add(dayOf(date));
    perWeek.set(week, days);
  }
  return perWeek;
}

function weeksMet(sessions: SessionSummary[]): Map<number, number> {
  const perWeek = new Map<number, number>();
  for (const [week, days] of daysByWeek(sessions)) perWeek.set(week, days.size);
  return perWeek;
}

export interface WeekDay {
  // "M", "T" and so on, or "Today" for today.
  label: string;
  trained: boolean;
  today: boolean;
}

const WEEK_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];

// Monday to Sunday of this week: which days had a session.
export function weekDays(
  sessions: SessionSummary[],
  now: Date = new Date(),
): WeekDay[] {
  const monday = weekOf(now);
  const today = dayOf(now);
  const trained = daysByWeek(sessions).get(monday) ?? new Set<number>();
  return WEEK_LETTERS.map((letter, i) => {
    const day = monday + i;
    return {
      label: day === today ? "Today" : letter,
      trained: trained.has(day),
      today: day === today,
    };
  });
}

export interface StreakInfo {
  // Weeks in a row that reached the goal. This week counts once it has.
  weeks: number;
  // Days trained so far this week, and the goal.
  thisWeek: number;
  goal: number;
  // Best run ever.
  best: number;
}

export function streakFor(
  sessions: SessionSummary[],
  now: Date = new Date(),
  goal: number = WEEKLY_GOAL,
): StreakInfo {
  const perWeek = weeksMet(sessions);
  const met = (week: number) => (perWeek.get(week) ?? 0) >= goal;
  const thisWeekKey = weekOf(now);

  // This week is still in progress, so it only adds to the run when it is
  // done. It never breaks one.
  let week = met(thisWeekKey) ? thisWeekKey : thisWeekKey - DAYS_IN_WEEK;
  let weeks = 0;
  while (met(week)) {
    weeks += 1;
    week -= DAYS_IN_WEEK;
  }

  const metWeeks = [...perWeek.keys()].filter(met).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous: number | null = null;
  for (const w of metWeeks) {
    run = previous !== null && w - previous === DAYS_IN_WEEK ? run + 1 : 1;
    best = Math.max(best, run);
    previous = w;
  }

  return {
    weeks,
    thisWeek: perWeek.get(thisWeekKey) ?? 0,
    goal,
    best,
  };
}

export interface Totals {
  sessions: number;
  cleanReps: number;
}

export function totalsFor(sessions: SessionSummary[]): Totals {
  const counted = countedSessions(sessions);
  return {
    sessions: counted.length,
    cleanReps: counted.reduce((sum, s) => sum + s.cleanReps, 0),
  };
}

export interface Milestone {
  id: string;
  name: string;
  earned: boolean;
  // What is left to do, shown on a locked milestone.
  todo: string;
}

const CLEAN_SESSION_MIN_REPS = 5;
const FORM_PCT = 0.9;
const FORM_FOCUS_MIN_REPS = 10;
const FORM_STREAK_SESSIONS = 5;

function cleanPct(s: SessionSummary): number {
  return s.totalReps ? s.cleanReps / s.totalReps : 0;
}

// Longest run of sessions in time order that were each above 90% clean.
function longestFormRun(sessions: SessionSummary[]): number {
  const ordered = [...countedSessions(sessions)].sort(
    (a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt),
  );
  let best = 0;
  let run = 0;
  for (const s of ordered) {
    run = cleanPct(s) > FORM_PCT ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function toGo(target: number, have: number, unit: string): string {
  const left = Math.max(0, target - have);
  return `${left.toLocaleString("en-US")} ${unit} to go`;
}

export function milestonesFor(
  sessions: SessionSummary[],
  now: Date = new Date(),
  goal: number = WEEKLY_GOAL,
): Milestone[] {
  const counted = countedSessions(sessions);
  const { cleanReps } = totalsFor(sessions);
  const { best } = streakFor(sessions, now, goal);
  const formRun = longestFormRun(sessions);

  const firstClean = counted.some(
    (s) => s.totalReps >= CLEAN_SESSION_MIN_REPS && s.cleanReps === s.totalReps,
  );
  const formFocus = counted.some(
    (s) => s.totalReps >= FORM_FOCUS_MIN_REPS && cleanPct(s) > FORM_PCT,
  );

  return [
    {
      id: "first-clean-session",
      name: "First clean session",
      earned: firstClean,
      todo: `Every rep clean, ${CLEAN_SESSION_MIN_REPS} or more`,
    },
    {
      id: "clean-100",
      name: "100 clean reps",
      earned: cleanReps >= 100,
      todo: toGo(100, cleanReps, "reps"),
    },
    {
      id: "streak-3",
      name: "3 week streak",
      earned: best >= 3,
      todo: toGo(3, best, "weeks"),
    },
    {
      id: "form-focus",
      name: "Form focus",
      earned: formFocus,
      todo: `${FORM_FOCUS_MIN_REPS} reps, above 90% clean`,
    },
    {
      id: "form-streak",
      name: "Form streak",
      earned: formRun >= FORM_STREAK_SESSIONS,
      todo: `${FORM_STREAK_SESSIONS} sessions above 90% clean`,
    },
    {
      id: "clean-1000",
      name: "1,000 clean reps",
      earned: cleanReps >= 1000,
      todo: toGo(1000, cleanReps, "reps"),
    },
    {
      id: "streak-8",
      name: "8 week streak",
      earned: best >= 8,
      todo: toGo(8, best, "weeks"),
    },
  ];
}

export interface PersonalBest {
  exerciseId: string;
  exerciseName: string;
  sessions: number;
  // Most clean reps in one session.
  mostCleanReps: number;
  // Best clean rate in a session of at least BEST_RATE_MIN_REPS reps, so one
  // clean rep cannot count as 100%. Null until there is such a session.
  bestCleanPct: number | null;
}

const BEST_RATE_MIN_REPS = 10;

// One row per exercise, most trained first.
export function personalBests(sessions: SessionSummary[]): PersonalBest[] {
  const byExercise = new Map<string, SessionSummary[]>();
  for (const s of countedSessions(sessions)) {
    byExercise.set(s.exerciseId, [...(byExercise.get(s.exerciseId) ?? []), s]);
  }
  return [...byExercise.entries()]
    .map(([exerciseId, list]) => {
      const rated = list.filter((s) => s.totalReps >= BEST_RATE_MIN_REPS);
      return {
        exerciseId,
        exerciseName: list[0].exerciseName.split(" (")[0],
        sessions: list.length,
        mostCleanReps: Math.max(...list.map((s) => s.cleanReps)),
        bestCleanPct: rated.length
          ? Math.max(...rated.map((s) => Math.round((s.cleanReps / s.totalReps) * 100)))
          : null,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

// --- Words for the streak ----------------------------------------------------

// What the streak is and how to keep or start it, in plain words. The streak
// is weeks in a row that reached the goal, so while a week is still short of
// it the screen says how far off it is.
export function streakCopy(info: StreakInfo): { title: string; sub: string } {
  const left = Math.max(0, info.goal - info.thisWeek);
  const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (info.weeks > 0) {
    return {
      title: `${info.weeks} week streak`,
      sub:
        left === 0
          ? "Goal hit this week. Extra days still count."
          : `${days(left)} more this week keeps it going.`,
    };
  }
  return {
    title: "Start your streak",
    sub:
      info.thisWeek === 0
        ? `Train ${days(info.goal)} in one week to start it.`
        : `Train ${days(info.goal)} in one week to start it. You are on ${info.thisWeek} of ${info.goal}.`,
  };
}

// Days with at least one session, all time.
export function daysTrained(sessions: SessionSummary[]): number {
  const days = new Set<number>();
  for (const s of countedSessions(sessions)) days.add(dayOf(new Date(s.startedAt)));
  return days.size;
}

// --- The activity heatmap ------------------------------------------------------

export interface HeatCell {
  // "Tue 3 Nov".
  label: string;
  sessions: number;
  cleanReps: number;
  // 0 for no session, 1, 2, 3, and 4 for four or more.
  level: 0 | 1 | 2 | 3 | 4;
  today: boolean;
  // After today, in the current week.
  future: boolean;
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(day: number): string {
  const d = new Date(day * 86_400_000);
  return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
}

// The last `weeks` weeks, oldest first, each one Monday to Sunday: the grid
// GitHub draws for contributions, here for workouts.
export function heatmap(
  sessions: SessionSummary[],
  weeks = 26,
  now: Date = new Date(),
): HeatCell[][] {
  const perDay = new Map<number, { sessions: number; cleanReps: number }>();
  for (const s of countedSessions(sessions)) {
    const day = dayOf(new Date(s.startedAt));
    const entry = perDay.get(day) ?? { sessions: 0, cleanReps: 0 };
    entry.sessions += 1;
    entry.cleanReps += s.cleanReps;
    perDay.set(day, entry);
  }
  const today = dayOf(now);
  const firstMonday = weekOf(now) - (weeks - 1) * DAYS_IN_WEEK;
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: DAYS_IN_WEEK }, (_, d) => {
      const day = firstMonday + w * DAYS_IN_WEEK + d;
      const entry = perDay.get(day);
      const count = entry?.sessions ?? 0;
      return {
        label: dayLabel(day),
        sessions: count,
        cleanReps: entry?.cleanReps ?? 0,
        level: Math.min(4, count) as HeatCell["level"],
        today: day === today,
        future: day > today,
      };
    }),
  );
}

// The month name above the first week of each month, and "" above the rest.
export function heatmapMonths(grid: HeatCell[][]): string[] {
  let previous = -1;
  return grid.map((week) => {
    const month = MONTH_NAMES.indexOf(week[0].label.split(" ")[2]);
    const label = month !== previous ? MONTH_NAMES[month] : "";
    previous = month;
    return label;
  });
}
