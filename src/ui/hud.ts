const NOTICE_MS = 1500;

const hud = document.querySelector<HTMLElement>("#hud")!;
const counter = document.querySelector<HTMLElement>("#counter")!;
const debug = document.querySelector<HTMLElement>("#debug")!;
const exercise = document.querySelector<HTMLElement>("#exercise")!;

let lastFeedback = "";
let lastCounter = "";
let lastDebug = "";
let noticeUntil = 0;

export function showFeedback(messages: string[]): void {
  const text = messages.join("   |   ");
  if (text === lastFeedback) return;
  lastFeedback = text;

  if (text === "") {
    hud.hidden = true;
  } else {
    hud.textContent = text;
    hud.hidden = false;
  }
}

export function showCounter(
  set: number,
  totalSets: number,
  reps: number,
  label: string,
): void {
  if (performance.now() < noticeUntil) return;
  const text = `Set ${set}/${totalSets}   |   Reps ${reps}   |   ${label}`;
  if (text === lastCounter) return;
  lastCounter = text;
  counter.classList.remove("notice");
  counter.textContent = text;
  counter.hidden = false;
}

export function showNotice(text: string, durationMs = NOTICE_MS): void {
  noticeUntil = performance.now() + durationMs;
  lastCounter = "";
  counter.classList.add("notice");
  counter.textContent = text;
  counter.hidden = false;
}

export function showDebug(text: string): void {
  if (text === lastDebug) return;
  lastDebug = text;
  debug.textContent = text;
}

export function showExercise(name: string): void {
  exercise.textContent = name;
  exercise.hidden = false;
}
