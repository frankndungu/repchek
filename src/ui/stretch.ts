// The guided stretch screen: the routine's list, then a picture, a line on
// how to do it and a timer for each stretch. No camera.

import {
  GET_READY_SECONDS,
  findRoutine,
  holdText,
  lengthText,
  stepTitle,
  stepsFor,
  totalSeconds,
} from "../stretches";
import type { Routine, Step } from "../stretches";
import { beep, bellFinish, unlockAudio } from "./audio";
import * as voice from "./voice";
import { STRETCH_PICTURES } from "./stretchPictures";

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const screen = q<HTMLElement>("#stretch-screen");
const intro = q<HTMLElement>("#stretch-intro");
const player = q<HTMLElement>("#stretch-player");
const done = q<HTMLElement>("#stretch-done");
const picture = q<SVGSVGElement>("#stretch-picture");
const clock = q<HTMLElement>("#stretch-clock");
const bar = q<HTMLElement>("#stretch-bar");
const pauseBtn = q<HTMLButtonElement>("#stretch-pause");

const TICK_MS = 200;

let routine: Routine | null = null;
let steps: Step[] = [];
let index = 0;
// "ready" is the few seconds to get into the stretch, "hold" is the stretch.
let phase: "ready" | "hold" = "ready";
let endsAt = 0;
let pausedLeftMs: number | null = null;
let timer: number | undefined;
let lastWhole = -1;
let wakeLock: WakeLockSentinel | null = null;

function show(which: "intro" | "player" | "done"): void {
  intro.hidden = which !== "intro";
  player.hidden = which !== "player";
  done.hidden = which !== "done";
}

function phaseSeconds(): number {
  return phase === "ready" ? GET_READY_SECONDS : steps[index].seconds;
}

async function keepAwake(): Promise<void> {
  try {
    if ("wakeLock" in navigator) wakeLock = await navigator.wakeLock.request("screen");
  } catch {
    // Not allowed here: the screen may dim, the timer still runs.
  }
}

function letSleep(): void {
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
}

function drawStep(): void {
  const step = steps[index];
  const art = STRETCH_PICTURES[step.stretch.id];
  if (art) {
    picture.setAttribute("viewBox", art.viewBox);
    picture.innerHTML = art.svg;
  }
  q<HTMLElement>("#stretch-name").textContent = stepTitle(step);
  q<HTMLElement>("#stretch-how").textContent = step.stretch.how;
  q<HTMLElement>("#stretch-progress").textContent = `Stretch ${index + 1} of ${steps.length}`;
  q<HTMLElement>("#stretch-phase").textContent = phase === "ready" ? "Get ready" : "Hold";
  const next = steps[index + 1];
  q<HTMLElement>("#stretch-next").textContent = next ? `Next: ${stepTitle(next)}` : "Last one";
}

function startPhase(which: "ready" | "hold"): void {
  phase = which;
  endsAt = performance.now() + phaseSeconds() * 1000;
  lastWhole = -1;
  drawStep();
  const step = steps[index];
  if (which === "ready") {
    voice.say(step.side ? `${step.stretch.name}. ${step.side} side` : step.stretch.name);
  } else {
    beep();
  }
}

function tick(): void {
  if (pausedLeftMs !== null) return;
  const leftMs = Math.max(0, endsAt - performance.now());
  const whole = Math.ceil(leftMs / 1000);
  if (whole !== lastWhole) {
    lastWhole = whole;
    clock.textContent = String(whole);
    if (phase === "hold" && whole > 0 && whole <= 3) beep();
  }
  const total = phaseSeconds() * 1000;
  bar.style.width = phase === "hold" ? `${(100 * (1 - leftMs / total)).toFixed(1)}%` : "0%";
  if (leftMs > 0) return;
  if (phase === "ready") {
    startPhase("hold");
  } else {
    nextStep();
  }
}

function nextStep(): void {
  if (index + 1 >= steps.length) {
    finish();
    return;
  }
  index += 1;
  startPhase("ready");
}

function finish(): void {
  stopTimer();
  letSleep();
  bellFinish();
  voice.say("Done. Nice work");
  const length = lengthText(totalSeconds(routine!)).toLowerCase();
  q<HTMLElement>("#stretch-done-text").textContent =
    `${routine!.stretches.length} stretches, ${length}. Come back any time.`;
  show("done");
}

function stopTimer(): void {
  window.clearInterval(timer);
  timer = undefined;
  pausedLeftMs = null;
  pauseBtn.textContent = "Pause";
}

function start(): void {
  if (!routine) return;
  // Inside the tap, so phones allow sound and speech.
  unlockAudio();
  voice.warmUp();
  void keepAwake();
  steps = stepsFor(routine);
  index = 0;
  show("player");
  screen.scrollTop = 0;
  startPhase("ready");
  stopTimer();
  timer = window.setInterval(tick, TICK_MS);
  tick();
}

function togglePause(): void {
  if (timer === undefined) return;
  if (pausedLeftMs === null) {
    pausedLeftMs = Math.max(0, endsAt - performance.now());
    pauseBtn.textContent = "Resume";
    q<HTMLElement>("#stretch-phase").textContent = "Paused";
  } else {
    endsAt = performance.now() + pausedLeftMs;
    pausedLeftMs = null;
    pauseBtn.textContent = "Pause";
    q<HTMLElement>("#stretch-phase").textContent = phase === "ready" ? "Get ready" : "Hold";
  }
}

function drawIntro(r: Routine): void {
  q<HTMLElement>("#stretch-title").textContent = r.name;
  q<HTMLElement>("#stretch-summary").textContent =
    `${lengthText(totalSeconds(r))}, ${r.stretches.length} stretches. ${r.detail}.`;
  q<HTMLElement>("#stretch-list").replaceChildren(
    ...r.stretches.map((stretch, i) => {
      const li = document.createElement("li");
      li.className = `flex items-center justify-between gap-3 border-t border-line py-3${i === r.stretches.length - 1 ? " border-b" : ""}`;
      const name = document.createElement("span");
      name.className = "text-[15px] font-semibold";
      name.textContent = stretch.name;
      const time = document.createElement("span");
      time.className = "shrink-0 text-[13px] text-muted";
      time.textContent = holdText(stretch);
      li.append(name, time);
      return li;
    }),
  );
}

export function openRoutine(id: string): void {
  const found = findRoutine(id);
  if (!found) return;
  routine = found;
  stopTimer();
  drawIntro(found);
  show("intro");
  screen.hidden = false;
  screen.scrollTop = 0;
}

export function hideStretch(): void {
  stopTimer();
  letSleep();
  window.speechSynthesis?.cancel();
  screen.hidden = true;
}

q<HTMLButtonElement>("#stretch-start").addEventListener("click", start);
q<HTMLButtonElement>("#stretch-skip").addEventListener("click", () => {
  if (timer === undefined) return;
  pausedLeftMs = null;
  pauseBtn.textContent = "Pause";
  if (phase === "ready") startPhase("hold");
  else nextStep();
});
pauseBtn.addEventListener("click", togglePause);
q<HTMLButtonElement>("#stretch-back").addEventListener("click", () => {
  if (timer !== undefined && !window.confirm("Stop stretching?")) return;
  hideStretch();
});
q<HTMLButtonElement>("#stretch-finish").addEventListener("click", hideStretch);
