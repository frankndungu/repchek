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

// A week counts when it has this many sessions.
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

function countedSessions(sessions: SessionSummary[]): SessionSummary[] {
  return sessions.filter((s) => s.totalReps > 0);
}

function weeksMet(sessions: SessionSummary[]): Map<number, number> {
  const perWeek = new Map<number, number>();
  for (const s of countedSessions(sessions)) {
    const week = weekOf(new Date(s.startedAt));
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  return perWeek;
}

export interface StreakInfo {
  // Weeks in a row that reached the goal. This week counts once it has.
  weeks: number;
  // Sessions so far this week, and the goal.
  thisWeek: number;
  goal: number;
  // Best run ever.
  best: number;
}

export function streakFor(
  sessions: SessionSummary[],
  now: Date = new Date(),
): StreakInfo {
  const perWeek = weeksMet(sessions);
  const met = (week: number) => (perWeek.get(week) ?? 0) >= WEEKLY_GOAL;
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
    goal: WEEKLY_GOAL,
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
): Milestone[] {
  const counted = countedSessions(sessions);
  const { cleanReps } = totalsFor(sessions);
  const { best } = streakFor(sessions, now);
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
