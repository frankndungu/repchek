import { inject, track } from "@vercel/analytics";
import { startCamera, explainCameraError, isUserFacing } from "./camera";
import type { CameraOptions } from "./camera";
import { PoseEstimator } from "./engine/pose";
import { LifterLock } from "./engine/lifter";
import { FrontReferenceTracker } from "./engine/reference";
import {
  computeFrameMetrics,
  dominantSide,
  frameConfidence,
  missingParts,
} from "./engine/angles";
import type { BodyPart, Side } from "./engine/angles";
import { Judge } from "./engine/judge";
import { RepCounter } from "./engine/repCounter";
import type { RepEvent } from "./engine/repCounter";
import {
  ReadinessGate,
  inStartZone,
  passesCheck,
} from "./engine/readiness";
import { SessionTracker } from "./engine/session";
import type {
  SessionEvent,
  SessionRecord,
  SetRecord,
} from "./engine/session";
import type {
  ExerciseProfile,
  FormRule,
  FrameMetrics,
  Landmark,
  ReadyCheck,
  RepPhase,
  RepTrigger,
} from "./engine/types";
import {
  EXERCISES,
  SECTIONS,
  findExercise,
  profileFor,
} from "./profiles";
import type { ExerciseChoice, PhonePosition, Section } from "./profiles";
import { saveSession } from "./storage/db";
import {
  syncCanvasToVideo,
  drawSkeleton,
  drawSpineGuide,
  drawAngleLabels,
  clearCanvas,
} from "./ui/overlay";
import {
  showFeedback,
  showCounter,
  showNotice,
  showDebug,
  showExercise,
} from "./ui/hud";
import {
  unlockAudio,
  beep,
  whistleGo,
  chimeSetDone,
  bellFinish,
} from "./ui/audio";
import { computeStats, renderSummary, shortName } from "./ui/summary";
import type { SessionStats } from "./ui/summary";
import { shareSession } from "./ui/share";
import * as voice from "./ui/voice";
import { SetRecorder } from "./ui/recorder";
import type { SetClip } from "./ui/recorder";
import { renderClips, releaseClips } from "./ui/clips";
import {
  openFoundingFromHash,
  showSummaryOffer,
  showWelcomeIfPaid,
} from "./ui/founding";

inject();

const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const LOW_CONFIDENCE_COLOR = "#9ca3af";
// White skeleton = "I can see you, but I am not counting yet".
const WAITING_COLOR = "#f5f5f2";
const GUIDE_COLOR = "#22d3ee";
const MIN_FRAME_CONFIDENCE = 0.6;
// Tracking has to stay poor this long before the pill says what is
// missing, so short blips do not flash messages.
const MISSING_HINT_DELAY_MS = 1000;

const MISSING_HINTS: Record<BodyPart, string> = {
  hands: "MOVE BACK, I CAN'T SEE YOUR HANDS",
  arms: "MOVE BACK, I CAN'T SEE YOUR HANDS",
  legs: "MOVE BACK, I CAN'T SEE YOUR LEGS",
  hips: "I CAN'T SEE YOUR BODY, CHECK THE ANGLE",
  shoulders: "I CAN'T SEE YOUR BODY, CHECK THE ANGLE",
  head: "I CAN'T SEE YOUR HEAD",
};

// Metrics that are ratios, not angles, so the debug line needs decimals.
const FRACTIONAL_METRICS = new Set<keyof FrameMetrics>([
  "barOffset",
  "wristRise",
  "shoulderOverWrist",
  "elbowFlare",
  "kneeDrive",
  "shoulderTilt",
  "hipDrop",
]);

const CHIP_BASE = "min-h-11 rounded-full border-2 px-4 py-2.5 text-[15px]";
// The coach voice chips sit inside More options, so they are a size down.
const SMALL_CHIP_BASE =
  "min-h-11 min-w-11 rounded-full border-2 px-3.5 py-2 text-[14px]";
const CHIP_ON = "border-lime bg-lime text-ink font-semibold";
const CHIP_OFF = "border-line bg-panel text-paper font-medium";

// Selected on the start screen until someone picks another. No equipment,
// and the camera sees the whole body on the floor.
const DEFAULT_EXERCISE_ID = "push-up";
// Folded away on the start screen, see gymSection().
const GYM_SECTION: Section = "At the gym";
// The same chevron as More options in index.html.
const CHEVRON_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true"><path d="M6 9l6 6 6-6"></path></svg>`;

type FacingMode = CameraOptions["facingMode"];

const CAMERA_STORAGE_KEY = "repchek.camera";

const RECORD_STORAGE_KEY = "repchek.record";
const ANGLES_STORAGE_KEY = "repchek.angles";
// Followed by the exercise id: where the phone was last time for it.
const POSITION_STORAGE_KEY = "repchek.position.";
const COACH_STORAGE_KEY = "repchek.coach";
// Set once the How it works page has opened by itself on a first visit.
const SEEN_HOW_STORAGE_KEY = "repchek.seenHow";
// How many sessions this phone has finished, for analytics.
const SESSIONS_STORAGE_KEY = "repchek.sessions";

// The figures on the How it works page, keyed by their data-color, drawn in
// the colours the skeleton uses on the camera.
const FIGURE_COLORS: Record<string, string> = {
  waiting: WAITING_COLOR,
  good: GOOD_COLOR,
  bad: BAD_COLOR,
  lost: LOW_CONFIDENCE_COLOR,
  guide: GUIDE_COLOR,
};

// How a form fault is announced: a spoken cue, the old beep, or nothing.
type CoachMode = "voice" | "beep" | "off";

const IN_APP_BROWSER =
  /FBAN|FBAV|Instagram|Twitter|TwitterAndroid|Snapchat|Line\//i.test(
    navigator.userAgent,
  );

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const video = q<HTMLVideoElement>("#camera");
const canvas = q<HTMLCanvasElement>("#overlay");
const startScreen = q<HTMLElement>("#start-screen");
const demoVideo = q<HTMLVideoElement>("#demo-video");
const demoFallback = q<HTMLElement>("#demo-fallback");
const summaryScreen = q<HTMLElement>("#summary-screen");
const howScreen = q<HTMLElement>("#how-screen");
const howBtn = q<HTMLButtonElement>("#how-btn");
const howBackBtn = q<HTMLButtonElement>("#how-back");
const howDoneBtn = q<HTMLButtonElement>("#how-done");
const startBtn = q<HTMLButtonElement>("#start-btn");
const endBtn = q<HTMLButtonElement>("#end-btn");
const shareBtn = q<HTMLButtonElement>("#share-btn");
const doneBtn = q<HTMLButtonElement>("#done-btn");
const status = q<HTMLElement>("#status");
const chipsEl = q<HTMLElement>("#exercise-chips");
const cameraToggle = q<HTMLElement>("#camera-toggle");
const recordSetting = q<HTMLElement>("#record-setting");
const recordToggle = q<HTMLElement>("#record-toggle");
const anglesToggle = q<HTMLElement>("#angles-toggle");
const coachToggle = q<HTMLElement>("#coach-toggle");
const exerciseNameEl = q<HTMLElement>("#exercise-name");
const exerciseDetailEl = q<HTMLElement>("#exercise-detail");
const positionPicker = q<HTMLElement>("#position-picker");
const exerciseHintEl = q<HTMLElement>("#exercise-hint");
const sideViewHintEl = q<HTMLElement>("#side-view-hint");
const browserHint = q<HTMLElement>("#browser-hint");
const setsInput = q<HTMLInputElement>("#sets-input");
const repsInput = q<HTMLInputElement>("#reps-input");
const weightInput = q<HTMLInputElement>("#weight-input");
const weightLabel = q<HTMLElement>("#weight-label");
const hudEl = q<HTMLElement>("#hud");
const counterEl = q<HTMLElement>("#counter");
const exerciseEl = q<HTMLElement>("#exercise");
const debugEl = q<HTMLElement>("#debug");

const ctx = canvas.getContext("2d")!;
// Which of the people in view is the lifter. Made per session, because it
// uses the exercise's posture checks.
let lifter: LifterLock | null = null;
// The "more than one person" tip is shown once per session.
let crowdTipShown = false;

let estimator: PoseEstimator | null = null;
let stream: MediaStream | null = null;
let wakeLock: WakeLockSentinel | null = null;
let judge: Judge | null = null;
let repCounter: RepCounter | null = null;
let gate: ReadinessGate | null = null;
// Front view profiles only: remembers where the hands are and how wide the
// shoulders look, for the frames where the model loses them.
let frontReference: FrontReferenceTracker | null = null;
// The rep range learned when the gate last armed, for auto-calibrated
// profiles only.
let learnedTrigger: RepTrigger | null = null;
// Rolling start (profile.rollingStart): while the gate is off, the probe
// counter watches for a first full rep and the probe judge notes the faults
// in it. Null for profiles that wait for the hold.
let probe: RepCounter | null = null;
let probeJudge: Judge | null = null;
const probeFaults = new Set<string>();
let session: SessionTracker | null = null;
// The exercise chosen on the start screen, and during a session the
// exercise and profile in use. The profile depends on where the phone is.
let selectedExerciseId = DEFAULT_EXERCISE_ID;
let activeExercise: ExerciseChoice | null = null;
let activeProfile: ExerciseProfile | null = null;
let facingMode: FacingMode = loadFacingMode();
let recordSets = readSetting(RECORD_STORAGE_KEY) === "on";
// Angle numbers at the joints, on screen and in clips. Off by default:
// they help when tuning a profile but clutter the view for everyone else.
let showAngles = readSetting(ANGLES_STORAGE_KEY) === "on";
let coachMode: CoachMode = loadCoachMode();
let recorder: SetRecorder | null = null;
let clips: SetClip[] = [];
let sessionStartedAt: Date | null = null;
let finishing = false;
let running = false;
let lastVideoTime = -1;
let lowConfidenceSince: number | null = null;
let trackingHint = "";
let mirrored = false;
let currentRecord: SessionRecord | null = null;
let currentStats: SessionStats | null = null;
const currentRepFaults = new Set<string>();

browserHint.hidden = !IN_APP_BROWSER;

// The demo panel shows a drawing of a red rep until the clip has a frame
// to show, and keeps it if the clip cannot load (not uploaded yet, or the
// network failed). The clip can load before this script runs, so check
// for that too.
function showDemoClip(loaded: boolean): void {
  demoFallback.hidden = loaded;
}
demoVideo.addEventListener("loadeddata", () => showDemoClip(true));
demoVideo.addEventListener("error", () => showDemoClip(false));
if (demoVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
  showDemoClip(true);
}

// Short name, plus "(front)" for front view profiles. Only used in the
// debug line: everywhere else shows the exercise name.
function displayName(profile: ExerciseProfile): string {
  const front = profile.cameraView === "front" ? " (front)" : "";
  return profile.name.split(" (")[0] + front;
}

// Where the phone is for this exercise: the saved choice if the exercise
// has it, otherwise beside you.
function phonePosition(exercise: ExerciseChoice): PhonePosition {
  const saved = readSetting(`${POSITION_STORAGE_KEY}${exercise.id}`);
  if (saved === "front" && exercise.positions.front) return "front";
  return exercise.positions.beside ? "beside" : "front";
}

// One chip per exercise, grouped by where you train.
function renderChips(): void {
  // Every tap renders the chips again, which must not fold up the gym
  // section someone just opened.
  const gymWasOpen = chipsEl.querySelector("details")?.open ?? false;
  const selected = findExercise(selectedExerciseId);
  chipsEl.replaceChildren();
  for (const section of SECTIONS) {
    const row = document.createElement("div");
    row.className = "flex flex-wrap gap-2";
    for (const exercise of EXERCISES.filter((e) => e.section === section)) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = exercise.name;
      chip.className = `${CHIP_BASE} ${exercise.id === selectedExerciseId ? CHIP_ON : CHIP_OFF}`;
      chip.addEventListener("click", () => {
        selectedExerciseId = exercise.id;
        renderChips();
      });
      row.append(chip);
    }

    if (section === GYM_SECTION) {
      const open = gymWasOpen || selected.section === section;
      chipsEl.append(gymSection(row, open));
      continue;
    }

    const heading = document.createElement("h3");
    heading.className =
      "text-[11px] font-semibold tracking-[0.12em] text-muted uppercase";
    heading.textContent = section;

    const block = document.createElement("div");
    block.className = "flex flex-col gap-2";
    block.append(heading, row);
    chipsEl.append(block);
  }
  renderExerciseCard();
}

// The gym lifts start folded away, with a warning: a bench or a machine
// hides part of the body, so tracking there is the least reliable. Styled
// like More options.
function gymSection(row: HTMLElement, open: boolean): HTMLDetailsElement {
  const details = document.createElement("details");
  details.className = "group rounded-2xl border border-line bg-panel";
  details.open = open;
  details.innerHTML = `
    <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[15px] font-semibold">At the gym: benches and machines</span>
        <span class="text-[12px] leading-snug text-muted">Equipment hides your body. Expect false alarms.</span>
      </span>
      ${CHEVRON_ICON}
    </summary>`;
  const body = document.createElement("div");
  body.className = "border-t border-line px-4 py-3";
  body.append(row);
  details.append(body);
  return details;
}

// The card under the chips: the exercise, where the phone goes if there is
// a choice, and the setup text for that position.
function renderExerciseCard(): void {
  const exercise = findExercise(selectedExerciseId);
  const position = phonePosition(exercise);
  const profile = profileFor(exercise, position);

  exerciseNameEl.textContent = exercise.name;
  exerciseDetailEl.textContent = exercise.detail ?? "";
  exerciseDetailEl.hidden = !exercise.detail;

  // Only exercises with both positions ask where the phone is.
  const { beside, front } = exercise.positions;
  positionPicker.hidden = !(beside && front);
  const cards = positionPicker.querySelectorAll<HTMLElement>("[data-position]");
  for (const card of cards) {
    const cardPosition = card.dataset.position as PhonePosition;
    markCard(card, cardPosition === position);
    const check = card.querySelector("[data-check]");
    if (check) check.textContent = exercise.checks?.[cardPosition] ?? "";
  }

  exerciseHintEl.textContent =
    profile.setupHint ?? `Prop the phone for a ${profile.cameraView} view`;
  sideViewHintEl.hidden = profile.cameraView !== "side";

  if (profile.bodyweight) {
    weightLabel.textContent = "Extra kg";
    weightInput.placeholder = "BW";
  } else {
    weightLabel.textContent = "Kg";
    weightInput.placeholder = "0";
  }
}

positionPicker.addEventListener("click", (event) => {
  const card = (event.target as Element).closest<HTMLElement>(
    "[data-position]",
  );
  if (!card?.dataset.position) return;
  writeSetting(
    `${POSITION_STORAGE_KEY}${selectedExerciseId}`,
    card.dataset.position,
  );
  renderExerciseCard();
});

renderChips();

// Storage can throw (private mode, blocked site data), so saved choices are
// a convenience and every setting has a default to fall back on.
function readSetting(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    console.warn(`Could not read ${key}`, err);
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn(`Could not save ${key}`, err);
  }
}

// This session's number on this phone, 1 for the first. Without storage,
// every session is the first.
function countSession(): number {
  const nth = (Number(readSetting(SESSIONS_STORAGE_KEY)) || 0) + 1;
  writeSetting(SESSIONS_STORAGE_KEY, String(nth));
  return nth;
}

function loadFacingMode(): FacingMode {
  return readSetting(CAMERA_STORAGE_KEY) === "user" ? "user" : "environment";
}

// Chip groups with one choice, styled like the lift chips.
function renderToggle(
  group: HTMLElement,
  selected: string,
  base = CHIP_BASE,
): void {
  for (const option of group.querySelectorAll<HTMLElement>("[data-value]")) {
    const on = option.dataset.value === selected;
    option.className = `${base} ${on ? CHIP_ON : CHIP_OFF}`;
    option.setAttribute("aria-pressed", String(on));
  }
}

// Choice cards (phone position, camera): the chosen one has a lime border.
function markCard(card: HTMLElement, on: boolean): void {
  card.classList.toggle("border-lime", on);
  card.classList.toggle("border-line", !on);
  card.setAttribute("aria-pressed", String(on));
}

// The on/off settings under More options.
function renderSwitch(toggle: HTMLElement, on: boolean): void {
  toggle.setAttribute("aria-checked", String(on));
}

function tappedValue(event: Event): string | undefined {
  return (event.target as Element).closest<HTMLElement>("[data-value]")
    ?.dataset.value;
}

function renderCameraToggle(): void {
  for (const card of cameraToggle.querySelectorAll<HTMLElement>(
    "[data-value]",
  )) {
    markCard(card, card.dataset.value === facingMode);
  }
}

cameraToggle.addEventListener("click", (event) => {
  const value = tappedValue(event);
  if (!value) return;
  facingMode = value === "user" ? "user" : "environment";
  writeSetting(CAMERA_STORAGE_KEY, facingMode);
  renderCameraToggle();
});

renderCameraToggle();

// Browsers that cannot record a canvas never see the option.
recordSetting.hidden = !SetRecorder.isSupported();

recordToggle.addEventListener("click", () => {
  recordSets = !recordSets;
  writeSetting(RECORD_STORAGE_KEY, recordSets ? "on" : "off");
  renderSwitch(recordToggle, recordSets);
});

renderSwitch(recordToggle, recordSets);

anglesToggle.addEventListener("click", () => {
  showAngles = !showAngles;
  writeSetting(ANGLES_STORAGE_KEY, showAngles ? "on" : "off");
  renderSwitch(anglesToggle, showAngles);
});

renderSwitch(anglesToggle, showAngles);

// The minus and plus buttons on the sets, reps and weight cards. They step
// the input by data-delta, stay inside its min and max, and grey out at
// either end.
const steppers =
  startScreen.querySelectorAll<HTMLButtonElement>("[data-stepper]");

function stepperInput(button: HTMLButtonElement): HTMLInputElement {
  return q<HTMLInputElement>(`#${button.dataset.stepper}`);
}

function inputLimits(input: HTMLInputElement): { min: number; max: number } {
  return {
    min: input.min === "" ? -Infinity : Number(input.min),
    max: input.max === "" ? Infinity : Number(input.max),
  };
}

const targetInputs = [setsInput, repsInput, weightInput];
// The size of the numbers, text-[36px] in index.html.
const TARGET_FONT_PX = 36;

// A long number ("100" on a narrow phone, "102.5") gets a smaller font so it
// fits between the buttons. Bebas Neue digits are 0.4 em wide, the point 0.2.
function fitNumber(input: HTMLInputElement): void {
  if (!input.clientWidth) return;
  const em = [...input.value].reduce(
    (sum, char) => sum + (char === "." ? 0.2 : 0.4),
    0,
  );
  const fit = em > 0 ? Math.floor(input.clientWidth / em) : TARGET_FONT_PX;
  input.style.fontSize = fit < TARGET_FONT_PX ? `${fit}px` : "";
}

function renderTargetCards(): void {
  for (const button of steppers) {
    const input = stepperInput(button);
    const { min, max } = inputLimits(input);
    const value = Number(input.value) || 0;
    button.disabled =
      Number(button.dataset.delta) < 0 ? value <= min : value >= max;
  }
  targetInputs.forEach(fitNumber);
}

for (const button of steppers) {
  button.addEventListener("click", () => {
    const input = stepperInput(button);
    const { min, max } = inputLimits(input);
    const value = Number(input.value) || 0;
    const stepped = value + Number(button.dataset.delta);
    // Rounded so repeated 2.5 kg steps never show 62.49999.
    const next = Math.round(Math.min(max, Math.max(min, stepped)) * 100) / 100;
    // An empty weight stays empty (bodyweight) when minus has nowhere to go.
    if (next === value) return;
    input.value = String(next);
    renderTargetCards();
  });
}

for (const input of targetInputs) {
  input.addEventListener("input", renderTargetCards);
}
window.addEventListener("resize", () => targetInputs.forEach(fitNumber));

renderTargetCards();

// Voice by default. Where the browser cannot speak, the Voice option is
// hidden and Beep is the default.
function loadCoachMode(): CoachMode {
  const saved = readSetting(COACH_STORAGE_KEY);
  if (saved === "beep" || saved === "off") return saved;
  return voice.isSupported() ? "voice" : "beep";
}

coachToggle.querySelector<HTMLElement>('[data-value="voice"]')!.hidden =
  !voice.isSupported();

coachToggle.addEventListener("click", (event) => {
  const value = tappedValue(event);
  if (value !== "voice" && value !== "beep" && value !== "off") return;
  coachMode = value;
  writeSetting(COACH_STORAGE_KEY, coachMode);
  renderToggle(coachToggle, coachMode, SMALL_CHIP_BASE);
});

renderToggle(coachToggle, coachMode, SMALL_CHIP_BASE);

// How it works: opens from the header button, and once by itself on a
// first visit.
for (const figure of howScreen.querySelectorAll<SVGElement>("[data-color]")) {
  figure.style.color = FIGURE_COLORS[figure.dataset.color ?? ""] ?? "";
}

function openHow(): void {
  howScreen.hidden = false;
  howScreen.scrollTop = 0;
}

function closeHow(): void {
  howScreen.hidden = true;
}

howBtn.addEventListener("click", openHow);
howBackBtn.addEventListener("click", closeHow);
howDoneBtn.addEventListener("click", closeHow);

// Back from Polar after paying, or a link to the founding offer: that
// screen opens instead, and How it works waits for the next visit.
const openedOnLoad = showWelcomeIfPaid() || openFoundingFromHash();

if (!openedOnLoad && readSetting(SEEN_HOW_STORAGE_KEY) === null) {
  writeSetting(SEEN_HOW_STORAGE_KEY, "yes");
  openHow();
}

// A form fault this frame: tell the lifter, the way they chose. With
// several faults at once, only the first is spoken; say() itself stops
// the same cue repeating every frame.
function coachFault(rule: FormRule): void {
  if (coachMode === "voice") {
    voice.say(rule.cue ?? firstWords(rule.message));
  } else if (coachMode === "beep") {
    beep();
  }
}

// "Chest up, hips too high" -> "Chest up", for a rule without a cue.
function firstWords(message: string): string {
  return message.split(" ").slice(0, 2).join(" ").replace(/[,.]$/, "");
}

let counterTaps: number[] = [];
counterEl.addEventListener("click", () => {
  const now = Date.now();
  counterTaps = counterTaps.filter((t) => now - t < 800);
  counterTaps.push(now);
  if (counterTaps.length >= 3) {
    debugEl.hidden = !debugEl.hidden;
    counterTaps = [];
  }
});

function phaseLabel(profile: ExerciseProfile, phase: RepPhase): string {
  return profile.phaseLabels?.[phase] ?? phase.toUpperCase();
}

function formatValue(metric: keyof FrameMetrics, value: number): string {
  return value.toFixed(FRACTIONAL_METRICS.has(metric) ? 2 : 0);
}

function formatDebug(
  profile: ExerciseProfile,
  side: string,
  phase: RepPhase,
  metrics: FrameMetrics,
): string {
  const parts = profile.rules.map(
    (rule) => `${rule.metric} ${formatValue(rule.metric, metrics[rule.metric])}`,
  );
  const trigger = `${profile.rep.metric} ${formatValue(profile.rep.metric, metrics[profile.rep.metric])}`;
  const gateInfo = gateDebug(metrics);
  return [side, phase, trigger, ...parts, gateInfo].join(" | ");
}

// Extra debug text about the readiness gate, so we can see from a
// screen recording why it is or is not counting yet.
function gateDebug(metrics: FrameMetrics): string {
  if (!gate) return "";
  if (gate.isArmed) {
    if (!learnedTrigger) return "armed";
    const { metric, start, turn } = learnedTrigger;
    const from = formatValue(metric, start);
    const to = formatValue(metric, turn);
    return `armed | learned ${from} to ${to}`;
  }
  const checks = gate.readyChecks.map(
    (check) => `${check.metric} ${formatValue(check.metric, metrics[check.metric])}`,
  );
  const posture = checks.length > 0 ? checks.join(" ") : "posture: none";
  const rolling = probe ? ` | probe ${probe.currentPhase}` : "";
  return `${gate.status} ${Math.round(gate.holdProgress * 100)}% | ${posture}${rolling}`;
}

// The label in the counter pill ("Set 1/4 | Reps 0 | ...").
function counterLabel(profile: ExerciseProfile, phase: RepPhase): string {
  if (!session || !gate) return "";
  if (trackingHint) return trackingHint;
  if (!gate.isArmed) {
    if (gate.status === "holding") return "HOLD STILL";
    if (session.isResting) return "REST";
    return gate.reason.toUpperCase() || "GET IN POSITION";
  }
  const resting = session.isResting && (phase === "idle" || phase === "ready");
  return resting ? "REST" : phaseLabel(profile, phase);
}

function updateCounterDisplay(profile: ExerciseProfile, phase: RepPhase): void {
  if (!session) return;
  if (session.isFinished) {
    const last = session.records[session.records.length - 1];
    showCounter(
      session.totalSets,
      session.totalSets,
      last?.reps.length ?? 0,
      "DONE",
    );
    return;
  }
  showCounter(
    session.set,
    session.totalSets,
    session.reps,
    counterLabel(profile, phase),
  );
}

async function keepScreenAwake(): Promise<void> {
  try {
    if ("wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("Wake lock unavailable", err);
  }
}

function releaseScreen(): void {
  void wakeLock?.release();
  wakeLock = null;
}

function stopCamera(): void {
  running = false;
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  releaseScreen();
  clearCanvas(ctx);
  showFeedback([]);
  hudEl.hidden = true;
  counterEl.hidden = true;
  exerciseEl.hidden = true;
  endBtn.hidden = true;
  debugEl.hidden = true;
  status.textContent = "";
}

function buildRecord(): SessionRecord | null {
  if (!session || !activeProfile || !sessionStartedAt) return null;
  const weight = Number(weightInput.value);
  return session.toRecord({
    exerciseId: activeProfile.id,
    // What the summary and share card show. exerciseId (the profile id)
    // still says which version was used.
    exerciseName: activeExercise?.name ?? activeProfile.name,
    startedAt: sessionStartedAt,
    weightKg: weight > 0 ? weight : null,
  });
}

function showSummary(record: SessionRecord): void {
  currentRecord = record;
  currentStats = computeStats(record);
  renderSummary(record, currentStats);
  renderClips(clips, record.exerciseId);
  showSummaryOffer(currentStats.totalReps);
  summaryScreen.hidden = false;
  // With session_start, shows who finishes a session and who comes back
  // for another.
  track("session_complete", {
    exercise: activeExercise?.id ?? record.exerciseId,
    reps: currentStats.totalReps,
    nth: countSession(),
  });
}

// Add a stopped clip to the list. The video file is ready a moment later,
// and only joins the list if this session's clips have not been freed by
// then.
function collectClip(pending: Promise<SetClip | null>): void {
  if (!activeProfile) return;
  const sessionClips = clips;
  const exerciseId = activeProfile.id;
  void pending.then((clip) => {
    if (!clip || sessionClips !== clips) return;
    clips.push(clip);
    renderClips(clips, exerciseId);
  });
}

// Let go of this session's videos so the memory is freed.
function freeClips(): void {
  releaseClips();
  clips = [];
  recorder?.dispose();
  recorder = null;
}

// Paint this frame into the recording, standby or set, if one is running.
// Call it before handleSessionEvent, which stops the clip when a set closes.
function recordFrame(
  feedback: string,
  sessionEvent: SessionEvent | null = null,
): void {
  if (!recorder?.isRecording || !session || !activeProfile) return;
  const closed = closedSet(sessionEvent);
  // Until the gate arms, show what the pill says (HOLD STILL, MOVE BACK,
  // ...) instead, so a clip shows why counting has not started.
  const message = gate?.isArmed
    ? feedback
    : counterLabel(activeProfile, repCounter?.currentPhase ?? "idle");
  recorder.drawFrame(
    video,
    canvas,
    {
      exercise: activeExercise?.name ?? shortName(activeProfile.name),
      set: closed?.set ?? session.set,
      totalSets: session.totalSets,
      reps: closed?.reps.length ?? session.reps,
      feedback: message,
    },
    mirrored,
  );
}

// When the last rep closes a set, the session has already reset its
// counters for the next set by the time we draw. Use the closed set's
// numbers instead, or every clip would end one rep short.
function closedSet(sessionEvent: SessionEvent | null): SetRecord | undefined {
  if (sessionEvent?.type === "set-complete") return sessionEvent.record;
  if (sessionEvent?.type === "session-complete") {
    return sessionEvent.sets.at(-1);
  }
  return undefined;
}

// Show the summary straight away, save to the phone in the background.
function finishSession(): void {
  if (finishing) return;
  finishing = true;
  const record = buildRecord();
  // Keeps a running set clip, or the standby recording as an attempt when
  // nothing was ever counted.
  if (recorder) collectClip(recorder.finish());
  lifter?.reset();
  stopCamera();
  if (record) {
    showSummary(record);
    saveSession(record).catch((err) =>
      console.error("Could not save session", err),
    );
  } else {
    startScreen.hidden = false;
  }
  finishing = false;
}

// Auto-calibration: with turnRatio set, the rep range comes from the
// person. start is the value they held while the gate armed, and turn is a
// fraction of it. Null for profiles with a fixed range.
function learnTrigger(rep: RepTrigger): RepTrigger | null {
  const held = gate?.heldValue;
  if (rep.turnRatio === undefined || held == null) return null;
  return { metric: rep.metric, start: held, turn: held * rep.turnRatio };
}

// The first of the profile's posture checks this frame fails, if any.
function failedReadyCheck(
  profile: ExerciseProfile,
  metrics: FrameMetrics,
): ReadyCheck | undefined {
  return profile.ready?.find((check) => !passesCheck(check, metrics));
}

function resetProbe(): void {
  probeFaults.clear();
  if (!probe || !activeProfile) return;
  probe.reset();
  probeJudge = new Judge(activeProfile);
}

// Rolling start: feed the probe a clear frame while the gate is off.
// Returns the first full rep, or null. Frames that fail a posture check
// start it over, so sitting on the bench with the weight never counts.
function probeFrame(metrics: FrameMetrics, now: number): RepEvent | null {
  if (!probe || !probeJudge || !activeProfile) return null;
  if (failedReadyCheck(activeProfile, metrics)) {
    resetProbe();
    return null;
  }
  // The rep has to start at lockout, so pressing the weight up out of the
  // rack or off the chest is not taken for a rep.
  const { rep } = activeProfile;
  const atLockout = inStartZone(rep, metrics[rep.metric]);
  if (probe.currentPhase === "idle" && !atLockout) return null;
  const event = probe.update(metrics, now);
  const { failures } = probeJudge.evaluate(metrics, probe.currentPhase);
  for (const rule of failures) probeFaults.add(rule.id);
  // As in a set, faults before a partial do not carry into the next rep.
  if (event?.type === "partial") probeFaults.clear();
  return event?.type === "rep" ? event : null;
}

// Fresh counter and judge, so nothing from the setup leaks into rep 1.
function armCounting(now: number): void {
  if (!activeProfile) return;
  // Rep times on the summary count from here, the same moment the set
  // clip starts below.
  session?.startSet(now);
  learnedTrigger = learnTrigger(activeProfile.rep);
  repCounter = new RepCounter(learnedTrigger ?? activeProfile.rep);
  judge = new Judge(activeProfile);
  currentRepFaults.clear();
  resetProbe();
  showNotice("Ready, go", 1200);
  whistleGo();
  // Swaps the standby recording for this set's clip. A no-op if the clip
  // is already running, which is what happens when the gate re-arms after
  // losing the person mid-set.
  if (session) recorder?.start(session.set);
}

startBtn.addEventListener("click", async () => {
  try {
    unlockAudio();
    // Must happen inside this tap, or iPhones never speak the cues.
    voice.warmUp();

    // The profile is the chosen exercise with the phone where it is.
    activeExercise = findExercise(selectedExerciseId);
    activeProfile = profileFor(activeExercise, phonePosition(activeExercise));
    judge = new Judge(activeProfile);
    repCounter = new RepCounter(activeProfile.rep);
    gate = new ReadinessGate(activeProfile);
    learnedTrigger = null;
    probe = activeProfile.rollingStart
      ? new RepCounter(activeProfile.rep)
      : null;
    resetProbe();
    lifter = new LifterLock(activeProfile);
    frontReference =
      activeProfile.cameraView === "front"
        ? new FrontReferenceTracker()
        : null;
    crowdTipShown = false;
    session = new SessionTracker({
      sets: Number(setsInput.value) || 4,
      reps: Number(repsInput.value) || 12,
    });
    sessionStartedAt = new Date();
    currentRepFaults.clear();
    showExercise(activeExercise.name);
    lowConfidenceSince = null;
    trackingHint = "";

    status.textContent = "Requesting camera...";
    // facingMode is only "ideal" inside startCamera, so if the chosen camera
    // is missing (some laptops only have a front one) the browser falls back
    // to whichever camera exists instead of failing.
    stream = await startCamera(video, { facingMode });

    mirrored = isUserFacing(stream);
    video.classList.toggle("mirrored", mirrored);
    canvas.classList.toggle("mirrored", mirrored);

    status.textContent = "Loading pose model, first time takes a moment...";
    estimator = estimator ?? (await PoseEstimator.create());

    await keepScreenAwake();
    startScreen.hidden = true;
    summaryScreen.hidden = true;
    endBtn.hidden = false;
    debugEl.hidden = false;
    recorder =
      recordSets && SetRecorder.isSupported() ? new SetRecorder() : null;
    // Record from the first frame, in case the gate never arms.
    recorder?.startStandby();
    running = true;
    lastVideoTime = -1;
    requestAnimationFrame(loop);
    // The camera is on screen with the model loaded, so a failed camera
    // request or model download is not counted as a session.
    track("session_start", { exercise: activeExercise.id });
  } catch (err) {
    console.error(err);
    stopCamera();
    status.textContent =
      err instanceof DOMException
        ? explainCameraError(err)
        : "Failed to load the pose model. Check the console.";
  }
});

endBtn.addEventListener("click", () => {
  finishSession();
});

doneBtn.addEventListener("click", () => {
  freeClips();
  summaryScreen.hidden = true;
  startScreen.hidden = false;
});

shareBtn.addEventListener("click", async () => {
  if (!currentRecord || !currentStats) return;
  shareBtn.disabled = true;
  try {
    await shareSession(currentRecord, currentStats);
  } catch (err) {
    if (!(err instanceof DOMException && err.name === "AbortError")) {
      console.error("Share failed", err);
    }
  } finally {
    shareBtn.disabled = false;
  }
});

// Pass the missing parts on a low confidence frame, or null on any other
// frame. The hint only appears once tracking has been poor for
// MISSING_HINT_DELAY_MS in a row, and clears on the first frame that is not.
function updateTrackingHint(missing: BodyPart[] | null, now: number): void {
  if (!missing) {
    lowConfidenceSince = null;
    trackingHint = "";
    return;
  }
  lowConfidenceSince ??= now;
  const waited = now - lowConfidenceSince >= MISSING_HINT_DELAY_MS;
  trackingHint = waited && missing.length > 0 ? MISSING_HINTS[missing[0]] : "";
}

// Every debug line starts with the camera actually in use and its real
// resolution, so front and back camera tracking can be compared. The
// camera comes from the stream, not the toggle, because the browser can
// fall back to a different one. mirrored is set from isUserFacing().
function showFrameDebug(text: string): void {
  const camera = mirrored ? "front cam" : "back cam";
  const resolution = `${video.videoWidth}x${video.videoHeight}`;
  // With more than one person in view, everyone's lifter score, the lifter
  // marked with *, so the weights in lifter.ts can be tuned.
  const crowd =
    lifter && lifter.peopleSeen > 1 ? ` | people ${lifter.scoreSummary}` : "";
  // Which version is running, "Push-up (front)", shown only here.
  const version = activeProfile ? ` | ${displayName(activeProfile)}` : "";
  showDebug(`${camera} ${resolution}${version}${crowd} | ${text}`);
}

// Debug line for a skipped frame: the view (and side for side views),
// the confidence and what could not be seen.
function lowConfidenceDebug(
  profile: ExerciseProfile,
  side: string,
  confidence: number,
  missing: BodyPart[],
): string {
  const view = profile.cameraView === "front" ? ["front"] : ["side", side];
  return [
    ...view,
    `low confidence ${confidence.toFixed(2)}`,
    `missing: ${missing.join(", ") || "none"}`,
    "frame skipped",
  ].join(" | ");
}

// Where a tap on the video lands on the camera image, in the same 0 to 1
// coordinates as the landmarks. Null before the video has a size.
function tapToImage(event: MouseEvent): { x: number; y: number } | null {
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight) return null;
  const rect = video.getBoundingClientRect();
  // The video is object-cover: scaled up to fill the screen and centred,
  // so some of the image can be cut off at the edges.
  const scale = Math.max(rect.width / videoWidth, rect.height / videoHeight);
  const offsetX = (rect.width - videoWidth * scale) / 2;
  const offsetY = (rect.height - videoHeight * scale) / 2;
  let x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  // The front camera is flipped with CSS, so a tap on the left of the
  // screen is on the right of the camera image.
  if (mirrored) x = rect.width - x;
  return {
    x: (x - offsetX) / (videoWidth * scale),
    y: (y - offsetY) / (videoHeight * scale),
  };
}

// Tap yourself to lock on, when there is more than one person in view.
video.addEventListener("click", (event) => {
  if (!running || !lifter || lifter.peopleSeen < 2) return;
  const point = tapToImage(event);
  if (point && lifter.chooseAt(point, performance.now())) {
    showNotice("Locked onto you", 1500);
  }
});

// The person cannot be seen properly this frame.
function handleLostFrame(now: number): void {
  if (!gate || !session || !activeProfile || !repCounter) return;
  resetProbe();
  if (gate.lost(now)) {
    // They were gone long enough, so any half-done rep is thrown away.
    currentRepFaults.clear();
    showNotice("Lost you, get back in position", 2000);
  }
  handleSessionEvent(session.tick(now));
  updateCounterDisplay(activeProfile, repCounter.currentPhase);
}

type SessionEventLike =
  | { type: string; record?: { set: number } }
  | null
  | undefined;

function handleSessionEvent(sessionEvent: SessionEventLike): void {
  if (sessionEvent?.type === "set-complete") {
    showNotice(`Set ${sessionEvent.record?.set ?? ""} done, rest`, 3000);
    chimeSetDone();
    lifter?.newSet();
    if (recorder) {
      collectClip(recorder.stop());
      // Back to standby until the gate arms for the next set.
      recorder.startStandby();
    }
    // Walking away, resting and setting up again must not count.
    gate?.reset();
    resetProbe();
    currentRepFaults.clear();
  }
  if (sessionEvent?.type === "session-complete") {
    showNotice("Session complete", 1500);
    bellFinish();
    if (recorder) collectClip(recorder.stop());
    setTimeout(() => finishSession(), 1500);
  }
}

// A frame where the person is seen clearly but nothing is counted or
// judged: before the gate arms, or out of position while it is armed. White
// skeleton, no feedback. `note` is added to the debug line.
function uncountedFrame(
  landmarks: Landmark[],
  side: Side,
  metrics: FrameMetrics,
  now: number,
  note = "",
): void {
  if (!session || !activeProfile || !repCounter) return;
  handleSessionEvent(session.tick(now));
  drawSkeleton(ctx, landmarks, WAITING_COLOR);
  if (activeProfile.cameraView === "side") {
    drawSpineGuide(ctx, landmarks, side, GUIDE_COLOR);
  }
  if (showAngles) drawAngleLabels(ctx, landmarks, metrics, mirrored);
  showFeedback([]);
  recordFrame("");
  updateCounterDisplay(activeProfile, repCounter.currentPhase);
  const debug = formatDebug(
    activeProfile,
    side,
    repCounter.currentPhase,
    metrics,
  );
  showFrameDebug(note ? `${debug} | ${note}` : debug);
}

function loop(): void {
  if (
    !running ||
    !estimator ||
    !judge ||
    !repCounter ||
    !gate ||
    !session ||
    !activeProfile ||
    !lifter
  )
    return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    syncCanvasToVideo(canvas, video);

    const now = performance.now();
    const aspect = video.videoWidth / video.videoHeight;
    const poses = estimator.estimate(video, now);
    // Only the lifter's pose goes any further, skeleton included. Anyone
    // else in view is ignored.
    const landmarks = lifter.pick(poses, gate.isArmed, aspect, now);
    if (lifter.hasCompany && !lifter.isTapLocked && !crowdTipShown) {
      crowdTipShown = true;
      showNotice("More than one person seen. Tap yourself to lock on.", 3000);
    }

    if (!landmarks) {
      updateTrackingHint(null, now);
      clearCanvas(ctx);
      showFeedback([]);
      recordFrame("");
      handleLostFrame(now);
      showFrameDebug(
        poses.length > 0
          ? `${poses.length} seen, lifter not found`
          : "no person detected",
      );
    } else {
      const side = dominantSide(landmarks);
      // Learned on every frame the lifter is found, clear or not: the
      // tracker has its own check for what it can learn from.
      const reference = frontReference?.update(landmarks, aspect, now);
      // Once counting has started, a profile can get by on fewer joints.
      const required =
        (gate.isArmed ? activeProfile.requiredWhileCounting : undefined) ??
        activeProfile.requiredJoints;
      const confidence = frameConfidence(
        landmarks,
        side,
        activeProfile.cameraView,
        required,
      );

      if (confidence < MIN_FRAME_CONFIDENCE) {
        const missing = missingParts(
          landmarks,
          side,
          activeProfile.cameraView,
          required,
        );
        updateTrackingHint(missing, now);
        drawSkeleton(ctx, landmarks, LOW_CONFIDENCE_COLOR);
        showFeedback([]);
        recordFrame("");
        handleLostFrame(now);
        showFrameDebug(
          lowConfidenceDebug(activeProfile, side, confidence, missing),
        );
      } else {
        updateTrackingHint(null, now);
        const metrics = computeFrameMetrics(landmarks, aspect, reference);

        // Step 1: are they in position yet? With a rolling start, a first
        // full rep arms the gate too, and becomes rep 1 of the set.
        let firstRep: RepEvent | null = null;
        if (!gate.isArmed) {
          if (gate.update(metrics, now)) {
            armCounting(now);
          } else {
            firstRep = probeFrame(metrics, now);
            if (firstRep) {
              gate.arm(metrics[activeProfile.rep.metric], now);
              // armCounting starts the probe over, so keep rep 1's faults.
              const firstRepFaults = [...probeFaults];
              armCounting(now);
              for (const id of firstRepFaults) currentRepFaults.add(id);
            }
          }
        }

        // Out of position while armed (rolling start only), like racking
        // the bar and sitting up: not counted or judged, but the gate
        // stays on.
        const outOfPosition = activeProfile.rollingStart
          ? failedReadyCheck(activeProfile, metrics)
          : undefined;

        if (!gate.isArmed) {
          // Not ready yet: no counting, no judging, no beeps.
          uncountedFrame(landmarks, side, metrics, now);
        } else if (outOfPosition) {
          gate.update(metrics, now);
          uncountedFrame(
            landmarks,
            side,
            metrics,
            now,
            `skipped: ${outOfPosition.hint}`,
          );
        } else {
          // Step 2: ready, so count and judge as normal.
          gate.update(metrics, now);
          const counted = repCounter.update(metrics, now);
          // The counter was made fresh this frame when firstRep is set, so
          // it has counted nothing and rep 1 is not counted twice.
          const repEvent = firstRep ?? counted;
          const phase = repCounter.currentPhase;
          const verdict = judge.evaluate(metrics, phase);

          for (const rule of verdict.failures) {
            currentRepFaults.add(rule.id);
          }

          let sessionEvent = null;
          if (repEvent) {
            sessionEvent = session.onRepEvent(
              repEvent,
              Array.from(currentRepFaults),
              now,
            );
            currentRepFaults.clear();
          } else {
            sessionEvent = session.tick(now);
          }

          drawSkeleton(ctx, landmarks, verdict.ok ? GOOD_COLOR : BAD_COLOR);
          if (activeProfile.cameraView === "side") {
            drawSpineGuide(ctx, landmarks, side, GUIDE_COLOR);
          }
          if (showAngles) drawAngleLabels(ctx, landmarks, metrics, mirrored);
          const feedback = verdict.failures.map((rule) => rule.message);
          showFeedback(feedback);
          recordFrame(feedback.join("  |  "), sessionEvent);

          if (repEvent?.type === "partial") {
            showNotice("Partial rep, use the full range");
          }
          handleSessionEvent(sessionEvent);

          updateCounterDisplay(activeProfile, phase);
          showFrameDebug(formatDebug(activeProfile, side, phase, metrics));
          if (!verdict.ok) coachFault(verdict.failures[0]);
        }
      }
    }
  }

  requestAnimationFrame(loop);
}
