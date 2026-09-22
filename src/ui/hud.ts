const hud = document.querySelector<HTMLElement>("#hud")!;
const debug = document.querySelector<HTMLElement>("#debug")!;
const exercise = document.querySelector<HTMLElement>("#exercise")!;

let lastFeedback = "";
let lastDebug = "";

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

export function showDebug(text: string): void {
  if (text === lastDebug) return;
  lastDebug = text;
  debug.textContent = text;
}

export function showExercise(name: string): void {
  exercise.textContent = name;
  exercise.hidden = false;
}
