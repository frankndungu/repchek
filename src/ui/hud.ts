// The live screen: the rep count, the Stats panel, the status pill and the
// red banner for form faults. See the workout mockups.

import { formatClock, paceText } from "../stats";

const NOTICE_MS = 1500;

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const hud = q<HTMLElement>("#hud");
const hudText = q<HTMLElement>("#hud-text");
const counter = q<HTMLElement>("#counter");
const debug = q<HTMLElement>("#debug");
const statsBtn = q<HTMLButtonElement>("#stats-btn");
const bigCount = q<HTMLElement>("#big-count");
const bigCountN = q<HTMLElement>("#big-count-n");
const panel = q<HTMLElement>("#stats-panel");
const gaugeDot = q<HTMLElement>("#gauge-dot");

let lastFeedback = "";
let lastStatus = "";
let lastDebug = "";
let noticeUntil = 0;
let live = false;
let statsOpen = false;

function drawPanelState(): void {
  const showing = live;
  bigCount.hidden = !showing || statsOpen;
  panel.hidden = !showing || !statsOpen;
  statsBtn.hidden = !showing;
  statsBtn.setAttribute("aria-pressed", String(statsOpen));
}

statsBtn.addEventListener("click", () => {
  statsOpen = !statsOpen;
  drawPanelState();
});

// On the live screen: Stats on top, the rep count underneath.
export function showLive(): void {
  live = true;
  drawPanelState();
}

export function hideLive(): void {
  live = false;
  lastFeedback = "";
  lastStatus = "";
  hud.hidden = true;
  counter.hidden = true;
  drawPanelState();
}

export function showFeedback(messages: string[]): void {
  const text = messages.join("   |   ");
  if (text === lastFeedback) return;
  lastFeedback = text;

  if (text === "") {
    hud.hidden = true;
  } else {
    hudText.textContent = text;
    hud.hidden = false;
  }
}

// Called every frame. label is a status such as HOLD STILL or REST: it shows
// in the pill, and an empty label hides the pill. The numbers go to the rep
// count and the Stats panel.
export function showCounter(
  set: number,
  totalSets: number,
  reps: number,
  label: string,
  elapsedMs = 0,
): void {
  bigCountN.textContent = String(reps);
  q<HTMLElement>("#stat-set").textContent = `${set}/${totalSets}`;
  q<HTMLElement>("#stat-reps").textContent = String(reps);
  q<HTMLElement>("#stat-time").textContent = formatClock(elapsedMs);
  q<HTMLElement>("#stat-pace").textContent = paceText(reps, elapsedMs);

  if (performance.now() < noticeUntil) return;
  if (label === lastStatus && !counter.classList.contains("notice")) return;
  lastStatus = label;
  counter.classList.remove("notice");
  counter.textContent = label;
  counter.hidden = label === "";
}

// Where the rep is, from 0 (rest) to 1 (peak).
export function showProgress(progress: number): void {
  const p = Math.min(1, Math.max(0, progress));
  gaugeDot.style.left = `${(p * 100).toFixed(0)}%`;
}

export function showNotice(text: string, durationMs = NOTICE_MS): void {
  noticeUntil = performance.now() + durationMs;
  lastStatus = "";
  counter.classList.add("notice");
  counter.textContent = text;
  counter.hidden = false;
}

export function showDebug(text: string): void {
  if (text === lastDebug) return;
  lastDebug = text;
  debug.textContent = text;
}
