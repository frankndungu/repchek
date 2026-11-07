// The Train screen and the All exercises list. From docs/design/screens/
// 05-train.html and 06-exercises.html. Picking an exercise opens Workout
// setup, which main.ts owns.

import { loadHistory } from "../account";
import { EXERCISES, SECTIONS, exerciseIdForProfile } from "../profiles";
import { streakFor, weekDays, WEEKLY_GOAL } from "../progress";
import type { SessionSummary } from "../progress";
import {
  greetingLine,
  lastLine,
  streakTitle,
  TRAIN_ORDER,
  workoutsFor,
} from "../train";
import { currentProfile, refreshAccount } from "./profile";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const exercisesScreen = q<HTMLElement>("#exercises-screen");

const STROKE =
  'width="34" height="22" viewBox="0 0 34 22" fill="none" stroke="#17352B" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

// The pictures from the mockup, by exercise.
const ICONS: Record<string, string> = {
  "push-up": `<svg ${STROKE}><path d="M3 19h28"/><path d="M6 17l2-8 20 7"/><circle cx="5" cy="7" r="2.6"/></svg>`,
  "mountain-climbers": `<svg ${STROKE}><path d="M3 19h28"/><path d="M7 17l2-7 9 1 4 5"/><path d="M18 11l8-2 3 8"/><circle cx="6" cy="8" r="2.6"/></svg>`,
  "biceps-curl": `<svg ${STROKE}><path d="M8 11v0M5 7v8M9 5v12M25 5v12M29 7v8M9 11h16"/></svg>`,
  deadlift: `<svg ${STROKE}><path d="M3 19h28"/><path d="M10 19l4-9 12-1"/><path d="M21 9v8"/><path d="M17 17h8"/><circle cx="8" cy="7" r="2.6"/></svg>`,
  "barbell-row": `<svg ${STROKE}><path d="M3 19h28"/><path d="M10 19l4-9 12-1"/><path d="M21 9v8"/><path d="M17 17h8"/><circle cx="8" cy="7" r="2.6"/></svg>`,
  "dumbbell-row": `<svg ${STROKE}><path d="M3 19h28"/><path d="M10 19l4-9 12-1"/><path d="M21 9v8"/><path d="M18 17h6M18 15v4M24 15v4"/><circle cx="8" cy="7" r="2.6"/></svg>`,
  crunch: `<svg ${STROKE}><path d="M3 19h28"/><path d="M8 12l6 7 8-9 5 9"/><circle cx="5" cy="10" r="2.4"/></svg>`,
  plank: `<svg ${STROKE}><path d="M3 19h28"/><path d="M5 17l21-6"/><path d="M26 11v8h5"/><circle cx="29" cy="7" r="2.4"/></svg>`,
  "pull-up": `<svg ${STROKE}><path d="M5 3h24"/><path d="M12 3l5 6 5-6"/><path d="M17 9v7"/><path d="M17 16l-3 5M17 16l3 5"/></svg>`,
};

const CHEVRON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5F5F5A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="shrink-0"><path d="M9 6l6 6-6 6"/></svg>';

let openExercise: (id: string) => void = () => undefined;

function nameOf(id: string): string {
  return EXERCISES.find((e) => e.id === id)?.name ?? id;
}

function icon(id: string): HTMLElement {
  const box = document.createElement("span");
  box.className =
    "flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-sand";
  box.innerHTML = ICONS[id] ?? "";
  return box;
}

function chevron(): HTMLElement {
  const box = document.createElement("span");
  box.className = "shrink-0";
  box.innerHTML = CHEVRON;
  return box;
}

// --- Drawing ---------------------------------------------------------------

// Monday to Sunday of this week as circles: filled for a day trained, dashed
// for today if not trained yet. Used on Train and on the Streak screen.
export function drawWeek(container: HTMLElement, sessions: SessionSummary[]): void {
  container.replaceChildren(
    ...weekDays(sessions).map((day) => {
      const cell = document.createElement("div");
      cell.className = `flex flex-col items-center gap-1.5${day.today ? " text-ink" : ""}`;
      const circle = document.createElement("span");
      circle.className = day.trained
        ? "h-8 w-8 rounded-full bg-forest"
        : day.today
          ? "h-8 w-8 rounded-full border-2 border-dashed border-forest bg-white"
          : "h-8 w-8 rounded-full border-[1.5px] border-line bg-white";
      const label = document.createElement("span");
      label.textContent = day.label;
      cell.append(circle, label);
      return cell;
    }),
  );
}

function drawCards(items: Awaited<ReturnType<typeof loadHistory>>): void {
  const keyed = (items ?? []).map((i) => ({
    ...i,
    exerciseKey: exerciseIdForProfile(i.exerciseId) ?? i.exerciseId,
  }));
  q<HTMLElement>("#train-cards").replaceChildren(
    ...workoutsFor(TRAIN_ORDER, keyed).map((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className =
        "flex w-full items-center gap-3.5 rounded-[22px] border border-line bg-white p-3.5 text-left";
      const text = document.createElement("span");
      text.className = "flex min-w-0 flex-1 flex-col gap-0.5";
      const name = document.createElement("b");
      name.className = "text-[16px]";
      name.textContent = nameOf(card.exerciseId);
      const line = document.createElement("span");
      line.className = "text-[13px] text-muted";
      line.textContent = lastLine(card.last);
      text.append(name, line);
      button.append(icon(card.exerciseId), text, chevron());
      button.addEventListener("click", () => openExercise(card.exerciseId));
      return button;
    }),
  );
}

function draw(items: Awaited<ReturnType<typeof loadHistory>>): void {
  const profile = currentProfile();
  const sessions: SessionSummary[] = items ?? [];
  const goal = profile?.weeklyGoal ?? WEEKLY_GOAL;
  const streak = streakFor(sessions, new Date(), goal);

  q<HTMLElement>("#train-hi").textContent = profile?.name
    ? `Hi ${profile.name}`
    : "Hi";
  q<HTMLElement>("#train-avatar").textContent = profile?.initials ?? "R";
  q<HTMLElement>("#train-sub").textContent = greetingLine(
    streak.thisWeek,
    goal,
  );
  q<HTMLElement>("#train-streak").textContent = streakTitle(streak.weeks);
  q<HTMLElement>("#train-goal").textContent = `Goal ${goal} days`;
  drawWeek(q<HTMLElement>("#train-days"), sessions);
  drawCards(items);
  q<HTMLElement>("#train-all").textContent = `All ${EXERCISES.length} exercises`;
}

// The first draw has no saved sessions yet, so it shows the same screen a
// new person would see. refreshTrain fills in the real data.
export function drawTrainEmpty(): void {
  draw(null);
}

export async function refreshTrain(): Promise<void> {
  await refreshAccount();
  draw(await loadHistory());
}

export function resetTrain(): void {
  hideExercises();
  draw(null);
}

// --- All exercises ---------------------------------------------------------

function buildExercises(): void {
  const list = q<HTMLElement>("#exercises-list");
  list.replaceChildren();
  for (const section of SECTIONS) {
    const label = document.createElement("span");
    label.className =
      "mt-1.5 text-[11px] font-semibold tracking-[0.12em] text-muted uppercase";
    label.textContent = section;
    const rows = document.createElement("div");
    rows.className = "flex flex-col";
    EXERCISES.filter((e) => e.section === section).forEach((exercise, i, all) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = `flex w-full items-center gap-3 border-t border-line py-[13px] text-left${i === all.length - 1 ? " border-b" : ""}`;
      const name = document.createElement("span");
      name.className = "flex-1 text-[16px] font-semibold";
      name.textContent = exercise.name;
      row.append(icon(exercise.id), name, chevron());
      row.addEventListener("click", () => openExercise(exercise.id));
      rows.append(row);
    });
    list.append(label, rows);
  }
}

export function hideExercises(): void {
  exercisesScreen.hidden = true;
}

export function initTrain(options: {
  openExercise: (id: string) => void;
  openProfile: () => void;
}): void {
  openExercise = (id) => {
    hideExercises();
    options.openExercise(id);
  };
  buildExercises();
  drawTrainEmpty();
  q<HTMLButtonElement>("#train-avatar").addEventListener(
    "click",
    options.openProfile,
  );
  q<HTMLButtonElement>("#train-all").addEventListener("click", () => {
    exercisesScreen.hidden = false;
    exercisesScreen.scrollTop = 0;
  });
  q<HTMLButtonElement>("#exercises-back").addEventListener("click", hideExercises);
}
