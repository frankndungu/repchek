// The Streak screen: how the streak works, this week, the weekly goal, the
// totals and a GitHub style heatmap of every workout.

import { loadHistory, updateWeeklyGoal } from "../account";
import type { HistoryItem } from "../history";
import {
  daysTrained,
  heatmap,
  heatmapMonths,
  streakCopy,
  streakFor,
  totalsFor,
  WEEKLY_GOAL,
} from "../progress";
import type { HeatCell } from "../progress";
import { currentProfile, refreshAccount, setWeeklyGoalLocal } from "./profile";
import { drawWeek, refreshTrain } from "./train";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const screen = q<HTMLElement>("#streak-screen");
const grid = q<HTMLElement>("#heat-grid");
const note = q<HTMLElement>("#heat-note");

const WEEKS = 26;
const MIN_GOAL = 1;
const MAX_GOAL = 7;

// Light to dark, none to four or more workouts in a day.
const LEVEL_CLASS = [
  "bg-sand",
  "bg-[#c5d3cc]",
  "bg-[#7fa392]",
  "bg-[#3f6b58]",
  "bg-forest",
];

let items: HistoryItem[] = [];
let heat: HeatCell[][] = [];

function goal(): number {
  return currentProfile()?.weeklyGoal ?? WEEKLY_GOAL;
}

function describe(cell: HeatCell): string {
  if (cell.future) return `${cell.label}: not yet.`;
  if (cell.sessions === 0) return `${cell.label}: rest day.`;
  const workouts = `${cell.sessions} workout${cell.sessions === 1 ? "" : "s"}`;
  return `${cell.label}: ${workouts}, ${cell.cleanReps} clean rep${cell.cleanReps === 1 ? "" : "s"}.`;
}

function drawHeat(): void {
  heat = heatmap(items, WEEKS);
  q<HTMLElement>("#heat-months").replaceChildren(
    ...heatmapMonths(heat).map((label) => {
      const cell = document.createElement("span");
      cell.className = "overflow-visible whitespace-nowrap";
      cell.textContent = label;
      return cell;
    }),
  );
  grid.replaceChildren(
    ...heat.flatMap((week) =>
      week.map((day) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.setAttribute("aria-label", describe(day));
        cell.className = `aspect-square w-full rounded-[3px] ${LEVEL_CLASS[day.level]}${day.future ? " opacity-30" : ""}${day.today ? " outline-2 -outline-offset-1 outline-forest" : ""}`;
        cell.addEventListener("click", () => {
          note.textContent = describe(day);
        });
        return cell;
      }),
    ),
  );
  // Keep the weekday names lined up with the rows.
  q<HTMLElement>("#heat-labels").style.height = `${Math.max(0, grid.offsetHeight + 14)}px`;
}

function render(): void {
  const g = goal();
  const info = streakFor(items, new Date(), g);
  const copy = streakCopy(info);
  q<HTMLElement>("#streak-hero").textContent = copy.title;
  q<HTMLElement>("#streak-hero-sub").textContent = copy.sub;
  q<HTMLElement>("#streak-week").textContent = `${Math.min(info.thisWeek, g)} of ${g} days`;
  drawWeek(q<HTMLElement>("#streak-days"), items);

  q<HTMLElement>("#goal-value").textContent = String(g);
  q<HTMLButtonElement>("#goal-minus").disabled = g <= MIN_GOAL;
  q<HTMLButtonElement>("#goal-plus").disabled = g >= MAX_GOAL;

  q<HTMLElement>("#streak-total").textContent = String(totalsFor(items).sessions);
  q<HTMLElement>("#streak-days-trained").textContent = String(daysTrained(items));
  q<HTMLElement>("#streak-best").textContent = String(info.best);
  drawHeat();
}

async function setGoal(next: number): Promise<void> {
  const profile = currentProfile();
  if (!profile || next < MIN_GOAL || next > MAX_GOAL) return;
  const previous = profile.weeklyGoal;
  setWeeklyGoalLocal(next);
  q<HTMLElement>("#goal-error").textContent = "";
  render();
  const saved = await updateWeeklyGoal(profile.id, next);
  if (!saved) {
    setWeeklyGoalLocal(previous);
    q<HTMLElement>("#goal-error").textContent = "Could not save your goal. Try again.";
    render();
    return;
  }
  // Train and Profile read the goal too.
  void refreshTrain();
}

export async function openStreak(): Promise<void> {
  screen.hidden = false;
  screen.scrollTop = 0;
  note.textContent = "Tap a day for details.";
  render();
  await refreshAccount();
  const loaded = await loadHistory();
  if (loaded) items = loaded;
  render();
}

export function hideStreak(): void {
  screen.hidden = true;
}

// On sign out: nothing of this person stays behind for the next.
export function resetStreak(): void {
  items = [];
  heat = [];
  hideStreak();
}

export function initStreak(): void {
  document.addEventListener("click", (event) => {
    if ((event.target as Element).closest("[data-open='streak']")) void openStreak();
  });
  q<HTMLButtonElement>("#streak-back").addEventListener("click", hideStreak);
  q<HTMLButtonElement>("#goal-minus").addEventListener("click", () => void setGoal(goal() - 1));
  q<HTMLButtonElement>("#goal-plus").addEventListener("click", () => void setGoal(goal() + 1));
}
