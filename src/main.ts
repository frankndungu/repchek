import { inject, track } from "@vercel/analytics";
import { cleanAddressBar, stripSensitiveParams } from "./privacy";
import {
  applyDebugParam,
  DiagnosticLog,
  debugModeOn,
  deliverFile,
  packLandmarks,
  packMetrics,
  RawClip,
  round,
} from "./diagnostics";
import type { FrameRow } from "./diagnostics";
import {
  startCamera,
  explainCameraError,
  isUserFacing,
  stopCameraStream,
} from "./camera";
import type { CameraOptions } from "./camera";
import {
  acquireStartupResources,
  AnimationLoop,
  CompletionTimer,
  ActiveCheckpointWriter,
  canStartNewWorkout,
  restoreActiveWorkout,
  releaseWakeLock,
  releaseStartupResources,
  StartupGuard,
} from "./sessionLifecycle";
import type { StartupResources } from "./sessionLifecycle";
import { PoseEstimator } from "./engine/pose";
import { LifterLock } from "./engine/lifter";
import { FrontReferenceTracker } from "./engine/reference";
import {
  computeFrameMetrics,
  dominantSide,
  FACING_CAMERA_RATIO,
  facingRatio,
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
  SetTarget,
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
import type { ExerciseChoice, PhonePosition } from "./profiles";
import {
  deleteActiveWorkoutCheckpoint,
  getActiveWorkoutCheckpoint,
  listActiveWorkoutCheckpointIds,
  listSessions,
  saveActiveWorkoutCheckpoint,
  saveSession,
} from "./storage/db";
import type {
  ActiveWorkoutCheckpoint,
  ActiveWorkoutCheckpointInput,
} from "./storage/db";
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
import { initAuth } from "./ui/auth";
import {
  clearSummarySave,
  initProfile,
  onSessionFinished,
} from "./ui/profile";
import { showComparison } from "./ui/history";
import {
  handleCheckoutReturn,
  initTabs,
  resetTabs,
  showTab,
} from "./ui/tabs";
import { initTrain, refreshTrain } from "./ui/train";
import { loadSessionRecord } from "./account";
import { SetRecorder } from "./ui/recorder";
import type { SetClip } from "./ui/recorder";
import { renderClips, releaseClips } from "./ui/clips";

// Take credentials out of the address before anything can record it.
applyDebugParam();
cleanAddressBar();
inject({
  beforeSend: (event) => ({ ...event, url: stripSensitiveParams(event.url) }),
});

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

const CHIP_BASE =
  "min-h-11 rounded-full border-[1.5px] px-4 py-2.5 text-[15px]";
// The coach voice chips sit inside More options, so they are a size down.
const SMALL_CHIP_BASE =
  "min-h-11 min-w-11 rounded-full border-[1.5px] px-3.5 py-2 text-[14px]";
const CHIP_ON = "border-ink bg-ink text-white font-semibold";
const CHIP_OFF = "border-[#c9c4b9] bg-white text-ink font-medium";

// Selected on the start screen until someone picks another. No equipment,
// and the camera sees the whole body on the floor.
const DEFAULT_EXERCISE_ID = "push-up";

type FacingMode = CameraOptions["facingMode"];

const CAMERA_STORAGE_KEY = "repchek.camera";

const RECORD_STORAGE_KEY = "repchek.record";
const ANGLES_STORAGE_KEY = "repchek.angles";
// Followed by the exercise id: where the phone was last time for it.
const POSITION_STORAGE_KEY = "repchek.position.";
const COACH_STORAGE_KEY = "repchek.coach";
// Set once the How it works page has opened by itself on a first visit.
const SEEN_HOW_STORAGE_KEY = "repchek.seenHow";
const SEEN_CAMERA_STORAGE_KEY = "repchek.seenCameraPrimer";
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
  /FBAN|FBAV|Instagram|Twitter|TwitterAndroid|Snapchat|TikTok|musical_ly|Line\//i.test(
    navigator.userAgent,
  );

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const video = q<HTMLVideoElement>("#camera");
const canvas = q<HTMLCanvasElement>("#overlay");
const startScreen = q<HTMLElement>("#start-screen");
const trainScreen = q<HTMLElement>("#train-screen");
const recoveryPrompt = document.createElement("section");
recoveryPrompt.className =
  "flex flex-col gap-3 rounded-3xl border border-line bg-sand p-4";
recoveryPrompt.hidden = true;
recoveryPrompt.setAttribute("aria-live", "polite");
trainScreen.insertBefore(recoveryPrompt, trainScreen.children[1] ?? null);
const summaryScreen = q<HTMLElement>("#summary-screen");
const howScreen = q<HTMLElement>("#how-screen");
const howBtn = q<HTMLButtonElement>("#how-btn");
const howBackBtn = q<HTMLButtonElement>("#how-back");
const howDoneBtn = q<HTMLButtonElement>("#how-done");
const startBtn = q<HTMLButtonElement>("#start-btn");
startBtn.disabled = true;
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
let estimatorPromise: Promise<PoseEstimator> | null = null;
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
let sessionTarget: SetTarget | null = null;
let sessionWeightKg: number | null = null;
let checkpointWrites: ActiveCheckpointWriter | null = null;
let completionRecord: SessionRecord | null = null;
let completionPersistence: Promise<void> | null = null;
interface RecoveryEntry {
  id: string;
  checkpoint: ActiveWorkoutCheckpoint | null;
  alreadyCompleted?: boolean;
  actionError?: string;
}
let recoveryEntries: RecoveryEntry[] = [];
let recoveryReady = false;
let recoveryLoadError: unknown = null;
let recoveryLoadGeneration = 0;
let recoveryActionBusy = false;
let finishing = false;
let running = false;
const startupGuard = new StartupGuard();
const animationLoop = new AnimationLoop(
  (callback) => window.requestAnimationFrame(callback),
  (id) => window.cancelAnimationFrame(id),
);
const completionTimer = new CompletionTimer();
let lastVideoTime = -1;
let lowConfidenceSince: number | null = null;
// A side-on exercise, but the person is facing the phone: the pill says
// TURN SIDEWAYS instead of leaving them to guess from STEP INTO VIEW.
const FACING_HINT_AFTER_MS = 700;
const FACING_FORGET_AFTER_MS = 1500;
let facingSince: number | null = null;
let lastPoseAt = 0;
let turnSideways = false;

// Debug capture, only when the app was opened once with ?debug=1. See
// diagnostics.ts.
const debugMode = debugModeOn();
const diag = new DiagnosticLog();
let rawClip: RawClip | null = null;
let rawClipResult: Promise<Blob | null> | null = null;
let trackingHint = "";
let mirrored = false;
let currentRecord: SessionRecord | null = null;
let currentStats: SessionStats | null = null;
const currentRepFaults = new Set<string>();

browserHint.hidden = !IN_APP_BROWSER;

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

const debugExportEl = q<HTMLElement>("#debug-export");
const debugNumbersBtn = q<HTMLButtonElement>("#debug-numbers");
const debugVideoBtn = q<HTMLButtonElement>("#debug-video");

// The Debug data row in More options. Only there in debug mode.
function renderDebugExport(): void {
  debugExportEl.hidden = !debugMode;
  if (!debugMode) return;
  const note = q<HTMLElement>("#debug-export-note");
  if (diag.hasData) {
    note.textContent = `Last set: ${diag.meta.profile as string}, ${diag.rows.length} frames. Send both to Claude.`;
  } else {
    note.textContent = "Debug mode is on. Do a set, then send the numbers and the video.";
  }
  debugNumbersBtn.disabled = !diag.hasData;
  debugVideoBtn.disabled = rawClipResult === null;
}

function debugFileName(kind: string, ext: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `repchek-${kind}-${String(diag.meta.profile ?? "set")}-${stamp}.${ext}`;
}

debugNumbersBtn.addEventListener("click", () => {
  void deliverFile(
    new Blob([diag.json()], { type: "application/json" }),
    debugFileName("numbers", "json"),
  );
});

debugVideoBtn.addEventListener("click", async () => {
  const blob = rawClipResult ? await rawClipResult : null;
  const note = q<HTMLElement>("#debug-export-note");
  if (!blob) {
    note.textContent = "No video was recorded for that set.";
    return;
  }
  const ext = blob.type.includes("mp4") ? "mp4" : "webm";
  await deliverFile(blob, debugFileName("video", ext));
});

renderDebugExport();

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

const RECOVERY_NOTICE =
  "You have an unfinished workout. Resume or discard it on Train first.";

function recoveryNotice(): string {
  return recoveryEntries.length > 0 ? RECOVERY_NOTICE : "";
}

// Start camera is off while a saved workout waits, and the prompt is on
// Train, so Workout setup says why.
function syncRecoveryNotice(): void {
  if (running) return;
  if (status.textContent === "" || status.textContent === RECOVERY_NOTICE) {
    status.textContent = recoveryNotice();
  }
}

function renderRecoveryPrompt(): void {
  queueMicrotask(syncRecoveryNotice);
  recoveryPrompt.replaceChildren();
  if (recoveryLoadError) {
    const title = document.createElement("h2");
    title.className = "text-xl font-bold tracking-tight text-forest";
    title.textContent = "Saved workout check unavailable";
    const message = document.createElement("p");
    message.className = "text-sm text-muted";
    message.textContent =
      "RepChek couldn't check for an unfinished workout. Retry before starting a new one.";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className =
      "min-h-11 rounded-full border-[1.5px] border-[#c9c4b9] bg-white px-5 font-semibold";
    retry.textContent = "Retry";
    retry.addEventListener("click", () => void refreshRecoveryPrompt());
    recoveryPrompt.append(title, message, retry);
    recoveryPrompt.hidden = false;
    return;
  }

  for (const entry of recoveryEntries) {
    const card = document.createElement("div");
    card.className = "flex flex-col gap-2 border-b border-line pb-3 last:border-0";
    const title = document.createElement("h2");
    title.className = "text-xl font-bold tracking-tight text-forest";
    title.textContent =
      entry.checkpoint?.exerciseName ?? "Saved workout needs attention";

    const details = document.createElement("p");
    details.className = "text-sm text-muted";
    if (entry.checkpoint) {
      const checkpoint = entry.checkpoint.checkpoint;
      const completedSets = checkpoint.completed.length;
      const reps =
        checkpoint.completed.reduce(
          (total, set) => total + set.reps.length,
          0,
        ) + checkpoint.currentReps.length;
      const partials =
        checkpoint.completed.reduce(
          (total, set) => total + set.partials,
          0,
        ) + checkpoint.currentPartials;
      details.textContent =
        `${completedSets} completed ${completedSets === 1 ? "set" : "sets"} · ` +
        `${reps} committed ${reps === 1 ? "rep" : "reps"} · ` +
        `${partials} partial ${partials === 1 ? "rep" : "reps"}`;
    } else {
      details.textContent =
        entry.actionError ??
        (entry.alreadyCompleted
          ? "This workout is already in your history. Discard the stale checkpoint."
          : "This saved workout is invalid or from an unsupported version. Discard it to continue.");
    }

    const actions = document.createElement("div");
    actions.className = "flex flex-wrap gap-2";
    if (entry.checkpoint) {
      const resume = document.createElement("button");
      resume.type = "button";
      resume.className =
        "min-h-11 rounded-full bg-ink px-5 font-semibold text-white";
      resume.textContent = "Resume workout";
      resume.disabled = !recoveryReady || recoveryActionBusy;
      resume.addEventListener("click", () => {
        const saved = entry.checkpoint;
        if (!saved) return;
        void startWorkout(saved);
      });
      actions.append(resume);
    }

    const discard = document.createElement("button");
    discard.type = "button";
    discard.className =
      "min-h-11 rounded-full border-[1.5px] border-[#c9c4b9] bg-white px-5 font-semibold";
    discard.textContent = "Discard workout";
    discard.disabled = recoveryActionBusy;
    discard.addEventListener("click", () => void discardRecovery(entry));
    actions.append(discard);
    card.append(title, details);
    if (entry.actionError) {
      const error = document.createElement("p");
      error.className = "text-sm text-bad";
      error.textContent = entry.actionError;
      card.append(error);
    }
    card.append(actions);
    recoveryPrompt.append(card);
  }
  recoveryPrompt.hidden = recoveryEntries.length === 0;
}

async function refreshRecoveryPrompt(): Promise<void> {
  const generation = ++recoveryLoadGeneration;
  recoveryReady = false;
  recoveryLoadError = null;
  startBtn.disabled = true;
  renderRecoveryPrompt();
  try {
    const ids = await listActiveWorkoutCheckpointIds();
    const completedIds = new Set(
      ids.length ? (await listSessions()).map((record) => record.id) : [],
    );
    const entries = await Promise.all(
      ids.map(async (id): Promise<RecoveryEntry | null> => {
        try {
          const checkpoint = await getActiveWorkoutCheckpoint(id);
          if (!checkpoint) return null;
          if (completedIds.has(id)) {
            return {
              id,
              checkpoint: null,
              alreadyCompleted: true,
            };
          }
          const exercise = findExercise(checkpoint.exerciseId);
          profileFor(exercise, phonePosition(exercise));
          return { id, checkpoint };
        } catch (err) {
          console.warn("Could not restore saved workout checkpoint", err);
          return {
            id,
            checkpoint: null,
            actionError: "This saved workout could not be validated.",
          };
        }
      }),
    );
    if (generation !== recoveryLoadGeneration) return;
    recoveryEntries = entries.filter(
      (entry): entry is RecoveryEntry => entry !== null,
    );
    recoveryReady = true;
  } catch (err) {
    if (generation !== recoveryLoadGeneration) return;
    recoveryLoadError = err;
    console.error("Could not check saved workout checkpoints", err);
  }
  startBtn.disabled = !recoveryReady || recoveryEntries.length > 0;
  renderRecoveryPrompt();
}

async function discardRecovery(entry: RecoveryEntry): Promise<void> {
  if (recoveryActionBusy) return;
  recoveryActionBusy = true;
  renderRecoveryPrompt();
  try {
    await deleteActiveWorkoutCheckpoint(entry.id);
    recoveryEntries = recoveryEntries.filter(
      (candidate) => candidate.id !== entry.id,
    );
    recoveryLoadError = null;
  } catch (err) {
    console.error("Could not discard saved workout", err);
    entry.actionError = "Could not discard this workout. Please try again.";
  } finally {
    recoveryActionBusy = false;
    startBtn.disabled = !recoveryReady || recoveryEntries.length > 0;
    renderRecoveryPrompt();
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

// Choice cards (phone position, camera): the chosen one has a forest border.
function markCard(card: HTMLElement, on: boolean): void {
  card.classList.toggle("border-forest", on);
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
// fits between the buttons. Inter digits are about 0.65 em wide, the point 0.3.
function fitNumber(input: HTMLInputElement): void {
  if (!input.clientWidth) return;
  const em = [...input.value].reduce(
    (sum, char) => sum + (char === "." ? 0.3 : 0.65),
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

// The route guard. Until there is a session, nothing below can start the
// camera, the pose model or a workout.
let signedIn = false;
const cameraScreen = q<HTMLElement>("#camera-screen");

// Right after sign in: the "Allow your camera" screen, once, then How it
// works, once. Each is skipped if it was seen before.
async function cameraPermission(): Promise<PermissionState> {
  try {
    const status = await navigator.permissions.query({
      name: "camera" as PermissionName,
    });
    return status.state;
  } catch {
    // Some browsers cannot say. Show the screen once.
    return "prompt";
  }
}

function showHowOnce(): void {
  if (readSetting(SEEN_HOW_STORAGE_KEY) === null) {
    writeSetting(SEEN_HOW_STORAGE_KEY, "yes");
    openHow();
  }
}

async function afterSignIn(): Promise<void> {
  if (readSetting(SEEN_CAMERA_STORAGE_KEY) === null) {
    const state = await cameraPermission();
    if (!signedIn) return;
    if (state === "prompt") {
      cameraScreen.hidden = false;
      return;
    }
    writeSetting(SEEN_CAMERA_STORAGE_KEY, "yes");
  }
  showHowOnce();
}

function endCameraStep(): void {
  writeSetting(SEEN_CAMERA_STORAGE_KEY, "yes");
  cameraScreen.hidden = true;
  if (signedIn) showHowOnce();
}

// Asks the browser for the camera now, then lets go of it. Starting a
// workout asks again and gets the answer without a prompt.
q<HTMLButtonElement>("#camera-allow").addEventListener("click", () => {
  const stream = navigator.mediaDevices?.getUserMedia({ video: true });
  void (stream ?? Promise.reject(new Error("no camera")))
    .then((s) => s.getTracks().forEach((track) => track.stop()))
    .catch(() => undefined)
    .finally(endCameraStep);
});

q<HTMLButtonElement>("#camera-later").addEventListener("click", endCameraStep);

initProfile();
initTabs(openSavedReport);
initTrain({
  openExercise: openSetup,
  openProfile: () => showTab("profile"),
});

initAuth((value) => {
  signedIn = value;
  if (!value) {
    howScreen.hidden = true;
    cameraScreen.hidden = true;
    showBase("train");
    resetTabs();
    return;
  }
  void refreshTrain();
  void afterSignIn();
  handleCheckoutReturn();
});

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
  if (turnSideways && !gate.isArmed) return "TURN SIDEWAYS";
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

async function keepScreenAwake(): Promise<WakeLockSentinel | null> {
  try {
    if ("wakeLock" in navigator) {
      return await navigator.wakeLock.request("screen");
    }
  } catch (err) {
    console.warn("Wake lock unavailable", err);
  }
  return null;
}

function releaseScreen(): void {
  releaseWakeLock(wakeLock);
  wakeLock = null;
}

function stopCamera(): void {
  startupGuard.invalidate();
  startBtn.disabled = false;
  completionTimer.clear();
  running = false;
  animationLoop.stop();
  if (rawClip) {
    rawClipResult = rawClip.stop();
    rawClip = null;
  }
  queueMicrotask(renderDebugExport);
  if (stream) {
    stopCameraStream(video, stream);
  }
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
  session = null;
  sessionStartedAt = null;
  sessionTarget = null;
  sessionWeightKg = null;
}

function activeCheckpointInput(): ActiveWorkoutCheckpointInput | null {
  if (
    !session ||
    session.isFinished ||
    !activeExercise ||
    !sessionTarget ||
    !sessionStartedAt
  ) {
    return null;
  }
  const id = sessionStartedAt.toISOString();
  return {
    version: 1,
    id,
    checkpoint: session.exportCheckpoint({ id, startedAt: sessionStartedAt }),
    exerciseId: activeExercise.id,
    exerciseName: activeExercise.name,
    target: { ...sessionTarget },
    weightKg: sessionWeightKg,
    startedAt: id,
  };
}

function checkpointCommitted(): Promise<void> | null {
  const input = activeCheckpointInput();
  if (!input || !checkpointWrites) return null;
  return checkpointWrites.save(input);
}

function reportCheckpointFailure(err: unknown): void {
  console.error("Could not save active workout checkpoint", err);
}

function persistCompletedSession(record: SessionRecord): void {
  if (completionPersistence) return;
  const writes = checkpointWrites;
  checkpointWrites = null;
  completionPersistence = (
    writes
      ? writes.complete(record.id, () => saveSession(record))
      : saveSession(record)
  ).catch((err) => {
    console.error("Could not save completed session or clear its checkpoint", err);
  });
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

// Only one of these is on screen under everything else: Train, which is
// home, or Workout setup for the exercise that was picked on Train.
function showBase(which: "train" | "setup" | "none"): void {
  trainScreen.hidden = which !== "train";
  startScreen.hidden = which !== "setup";
}

// Train, All exercises and the tabs all end up here: set up this exercise.
function openSetup(exerciseId: string): void {
  selectedExerciseId = exerciseId;
  renderChips();
  status.textContent = recoveryNotice();
  showBase("setup");
  startScreen.scrollTop = 0;
}

q<HTMLButtonElement>("#setup-back").addEventListener("click", () => {
  showBase("train");
  void refreshTrain();
});

// True while a report opened from History is on screen.
let reportFromHistory = false;

// Reopens a saved session's report. Clips are not kept, so it has none.
async function openSavedReport(id: string): Promise<boolean> {
  const record = await loadSessionRecord(id);
  if (!record) return false;
  reportFromHistory = true;
  currentRecord = record;
  currentStats = computeStats(record);
  renderSummary(record, currentStats);
  renderClips([], record.exerciseId);
  clearSummarySave();
  void showComparison({
    exerciseId: record.exerciseId,
    exerciseName: record.exerciseName,
    startedAt: record.startedAt,
    totalReps: currentStats.totalReps,
    cleanReps: currentStats.cleanReps,
  });
  showTab("train");
  showBase("none");
  summaryScreen.hidden = false;
  summaryScreen.scrollTop = 0;
  return true;
}

function showSummary(record: SessionRecord): void {
  reportFromHistory = false;
  currentRecord = record;
  currentStats = computeStats(record);
  renderSummary(record, currentStats);
  renderClips(clips, record.exerciseId);
  summaryScreen.hidden = false;
  void onSessionFinished(record, currentStats);
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
  if (finishing || !running) return;
  finishing = true;
  const record = completionRecord ?? buildRecord();
  // Keeps a running set clip, or the standby recording as an attempt when
  // nothing was ever counted.
  if (recorder) collectClip(recorder.finish());
  lifter?.reset();
  stopCamera();
  if (record) {
    showSummary(record);
    persistCompletedSession(record);
  } else {
    showBase("train");
    void refreshTrain();
    checkpointWrites = null;
  }
  finishing = false;
}

function loadPoseEstimator(): Promise<PoseEstimator> {
  if (estimator) return Promise.resolve(estimator);
  if (!estimatorPromise) {
    estimatorPromise = PoseEstimator.create().then(
      (loaded) => {
        estimator = loaded;
        return loaded;
      },
      (err: unknown) => {
        estimatorPromise = null;
        throw err;
      },
    );
  }
  return estimatorPromise;
}

function clearFailedStartup(): void {
  lifter = null;
  judge = null;
  repCounter = null;
  gate = null;
  frontReference = null;
  learnedTrigger = null;
  probe = null;
  probeJudge = null;
  currentRepFaults.clear();
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
  if (debugMode) diag.mark("armed");
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

async function startWorkout(
  recovery?: ActiveWorkoutCheckpoint,
): Promise<void> {
  if (
    !signedIn ||
    running ||
    (!recovery && !canStartNewWorkout(recoveryReady, recoveryEntries.length)) ||
    (recovery && !recoveryReady) ||
    (recovery && !recoveryEntries.some((entry) => entry.id === recovery.id))
  ) {
    return;
  }
  const attempt = startupGuard.begin();
  if (attempt === null) return;
  if (recovery) {
    recoveryActionBusy = true;
    renderRecoveryPrompt();
  }
  startBtn.disabled = true;

  let resources: StartupResources<PoseEstimator> | null = null;
  let startupRecorder: SetRecorder | null = null;
  try {
    unlockAudio();
    // Must happen inside this tap, or iPhones never speak the cues.
    voice.warmUp();

    // The profile is the chosen exercise with the phone where it is.
    const exercise = findExercise(recovery?.exerciseId ?? selectedExerciseId);
    selectedExerciseId = exercise.id;
    activeExercise = recovery
      ? { ...exercise, name: recovery.exerciseName }
      : exercise;
    activeProfile = profileFor(exercise, phonePosition(exercise));
    if (debugMode) {
      diag.begin({
        app: "repchek",
        profile: activeProfile.id,
        exercise: exercise.id,
        requestedCamera: facingMode,
        userAgent: navigator.userAgent,
        screen: `${screen.width}x${screen.height}`,
        pixelRatio: window.devicePixelRatio,
        startedAt: new Date().toISOString(),
      });
      rawClipResult = null;
    }
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
    const restored = recovery ? restoreActiveWorkout(recovery) : null;
    sessionTarget = restored
      ? restored.target
      : {
          sets: Number(setsInput.value) || 4,
          reps: Number(repsInput.value) || 12,
        };
    session = restored?.session ?? new SessionTracker(sessionTarget);
    sessionStartedAt = restored?.startedAt ?? new Date();
    sessionWeightKg = restored
      ? restored.weightKg
      : Number(weightInput.value) > 0
        ? Number(weightInput.value)
        : null;
    if (recovery) {
      setsInput.value = String(recovery.target.sets);
      repsInput.value = String(recovery.target.reps);
      weightInput.value =
        recovery.weightKg === null ? "" : String(recovery.weightKg);
      renderChips();
    }
    completionRecord = null;
    completionPersistence = null;
    currentRepFaults.clear();
    showExercise(activeExercise.name);
    lowConfidenceSince = null;
    trackingHint = "";
    facingSince = null;
    turnSideways = false;

    status.textContent = "Requesting camera...";
    // facingMode is only "ideal" inside startCamera, so if the chosen camera
    // is missing (some laptops only have a front one) the browser falls back
    // to whichever camera exists instead of failing.
    resources = await acquireStartupResources(
      video,
      () => startupGuard.isCurrent(attempt),
      () =>
        startCamera(
          video,
          { facingMode },
          () => startupGuard.isCurrent(attempt),
        ).then((cameraStream) => {
          if (debugMode) diag.mark("cameraReady");
          return cameraStream;
        }),
      () =>
        loadPoseEstimator().then((model) => {
          if (debugMode) diag.mark("modelReady");
          return model;
        }),
      keepScreenAwake,
        () => {
          status.textContent = "Loading pose model, first time takes a moment...";
        },
    );
    if (!resources || !startupGuard.isCurrent(attempt)) return;

    mirrored = isUserFacing(resources.stream);
    if (debugMode) {
      diag.mark("startupDone");
      diag.meta.cameraUsed = mirrored ? "front" : "back";
      diag.meta.video = `${video.videoWidth}x${video.videoHeight}`;
    }
    video.classList.toggle("mirrored", mirrored);
    canvas.classList.toggle("mirrored", mirrored);

    startupRecorder =
      recordSets && SetRecorder.isSupported() ? new SetRecorder() : null;
    // Record from the first frame, in case the gate never arms.
    startupRecorder?.startStandby();

    showBase("none");
    summaryScreen.hidden = true;
    endBtn.hidden = false;
    debugEl.hidden = false;
    stream = resources.stream;
    rawClip = debugMode ? RawClip.start(stream) : null;
    wakeLock = resources.wakeLock;
    resources = null;
    recorder = startupRecorder;
    startupRecorder = null;
    checkpointWrites = new ActiveCheckpointWriter(
      saveActiveWorkoutCheckpoint,
      deleteActiveWorkoutCheckpoint,
    );
    running = true;
    lastVideoTime = -1;
    animationLoop.start(loop);
    // The camera is on screen with the model loaded, so a failed camera
    // request or model download is not counted as a session.
    track("session_start", { exercise: exercise.id });
    if (recovery) {
      recoveryEntries = recoveryEntries.filter(
        (entry) => entry.id !== recovery.id,
      );
      renderRecoveryPrompt();
    }
    const initialCheckpoint = checkpointCommitted();
    void initialCheckpoint?.catch(reportCheckpointFailure);
  } catch (err) {
    if (!startupGuard.isCurrent(attempt)) {
      if (resources) releaseStartupResources(video, resources);
      startupRecorder?.dispose();
      return;
    }
    console.error(err);
    if (resources) releaseStartupResources(video, resources);
    startupRecorder?.dispose();
    stopCamera();
    recorder?.dispose();
    recorder = null;
    checkpointWrites = null;
    clearFailedStartup();
    // The error is written under Start camera, so go back to setup.
    showBase("setup");
    summaryScreen.hidden = true;
    status.textContent =
      err instanceof DOMException
        ? explainCameraError(err)
        : recovery
          ? "Could not resume the saved workout. Your checkpoint is still available."
          : "Failed to load the pose model. Check the console.";
    startBtn.disabled = !canStartNewWorkout(
      recoveryReady,
      recoveryEntries.length,
    );
  } finally {
    if (recovery) {
      recoveryActionBusy = false;
      renderRecoveryPrompt();
    }
    if (startupGuard.finish(attempt)) {
      startBtn.disabled = !recoveryReady || recoveryEntries.length > 0;
      renderRecoveryPrompt();
    }
  }
}

startBtn.addEventListener("click", () => {
  if (!signedIn) return;
  void startWorkout();
});

endBtn.addEventListener("click", () => {
  finishSession();
});

doneBtn.addEventListener("click", () => {
  if (reportFromHistory) {
    reportFromHistory = false;
    summaryScreen.hidden = true;
    showBase("train");
    showTab("history");
    return;
  }
  freeClips();
  summaryScreen.hidden = true;
  showBase("train");
  void refreshTrain();
  void (async () => {
    await completionPersistence;
    await refreshRecoveryPrompt();
  })();
});

void refreshRecoveryPrompt();

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

// Tracks whether the person has been facing the phone for a side-on exercise.
// It keeps its answer through frames where nobody is found, which is what
// happens when bending over facing the phone, and forgets it once nobody has
// been seen for a while or they are seen side-on.
function updateFacing(
  landmarks: Landmark[] | null,
  aspect: number,
  now: number,
): void {
  if (!activeProfile || activeProfile.cameraView !== "side") return;
  if (!landmarks) {
    if (now - lastPoseAt > FACING_FORGET_AFTER_MS) {
      facingSince = null;
      turnSideways = false;
    }
    return;
  }
  lastPoseAt = now;
  const ratio = facingRatio(landmarks, aspect);
  if (ratio === null) return;
  if (ratio >= FACING_CAMERA_RATIO) {
    facingSince ??= now;
    turnSideways = now - facingSince >= FACING_HINT_AFTER_MS;
  } else {
    facingSince = null;
    turnSideways = false;
  }
}

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
    const pendingCheckpoint = checkpointCommitted();
    void pendingCheckpoint?.catch(reportCheckpointFailure);
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
    completionRecord = buildRecord();
    if (completionRecord) persistCompletedSession(completionRecord);
    showNotice("Session complete", 1500);
    bellFinish();
    if (recorder) collectClip(recorder.stop());
    completionTimer.scheduleOnce(() => finishSession(), 1500);
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
    const row: FrameRow | null = debugMode
      ? {
          t: Math.round(now - diag.startedAt),
          n: poses.length,
          // How long the pose model took on this frame.
          ms: round(performance.now() - now, 1),
        }
      : null;
    if (row) diag.mark("firstFrame");
    // Only the lifter's pose goes any further, skeleton included. Anyone
    // else in view is ignored.
    const landmarks = lifter.pick(poses, gate.isArmed, aspect, now);
    updateFacing(landmarks, aspect, now);
    if (row && landmarks) {
      diag.mark("firstPose");
      row.lm = packLandmarks(landmarks);
      const facing = facingRatio(landmarks, aspect);
      row.fr = facing === null ? null : round(facing, 2);
    }
    if (lifter.hasCompany && !lifter.isTapLocked && !crowdTipShown) {
      crowdTipShown = true;
      showNotice("More than one person seen. Tap yourself to lock on.", 3000);
    }

    if (!landmarks) {
      if (row) row.s = "nopose";
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

      if (row) {
        row.c = round(confidence, 2);
        row.sd = side;
      }

      if (confidence < MIN_FRAME_CONFIDENCE) {
        if (row) row.s = "lowconf";
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
        if (row) {
          diag.mark("firstConfident");
          row.m = packMetrics(metrics);
        }

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
          if (row) row.s = "wait";
          uncountedFrame(landmarks, side, metrics, now);
        } else if (outOfPosition) {
          if (row) row.s = "out";
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
          if (row) {
            row.s = "armed";
            row.p = phase;
            row.r = repCounter.reps;
            if (repEvent) row.e = repEvent.type;
            if (verdict.failures.length > 0) {
              row.f = verdict.failures.map((rule) => rule.id);
            }
          }

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
            const pendingCheckpoint = checkpointCommitted();
            void pendingCheckpoint?.catch(reportCheckpointFailure);
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
    if (row) {
      row.g = [gate.status, Math.round(gate.holdProgress * 100), gate.reason];
      if (turnSideways) row.ts = 1;
      diag.frame(row);
    }
  }

}
