import { inject } from "@vercel/analytics";
import { startCamera, explainCameraError, isUserFacing } from "./camera";
import { PoseEstimator } from "./engine/pose";
import {
  computeFrameMetrics,
  dominantSide,
  frameConfidence,
} from "./engine/angles";
import { Judge } from "./engine/judge";
import { RepCounter } from "./engine/repCounter";
import { SessionTracker } from "./engine/session";
import type { SessionRecord } from "./engine/session";
import type { ExerciseProfile, FrameMetrics, RepPhase } from "./engine/types";
import { PROFILES, findProfile } from "./profiles";
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
import { unlockAudio, beep } from "./ui/audio";
import { computeStats, renderSummary } from "./ui/summary";
import type { SessionStats } from "./ui/summary";
import { shareSession } from "./ui/share";

inject();

const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const LOW_CONFIDENCE_COLOR = "#9ca3af";
const GUIDE_COLOR = "#22d3ee";
const MIN_FRAME_CONFIDENCE = 0.6;

const CHIP_BASE = "min-h-11 rounded-full border-2 px-4 py-2.5 text-[15px]";
const CHIP_ON = "border-lime bg-lime text-ink font-semibold";
const CHIP_OFF = "border-line bg-panel text-paper font-medium";

const IN_APP_BROWSER =
  /FBAN|FBAV|Instagram|Twitter|TwitterAndroid|Snapchat|Line\//i.test(
    navigator.userAgent,
  );

const q = <T extends Element>(selector: string) =>
  document.querySelector<T>(selector)!;

const video = q<HTMLVideoElement>("#camera");
const canvas = q<HTMLCanvasElement>("#overlay");
const startScreen = q<HTMLElement>("#start-screen");
const summaryScreen = q<HTMLElement>("#summary-screen");
const startBtn = q<HTMLButtonElement>("#start-btn");
const endBtn = q<HTMLButtonElement>("#end-btn");
const shareBtn = q<HTMLButtonElement>("#share-btn");
const doneBtn = q<HTMLButtonElement>("#done-btn");
const status = q<HTMLElement>("#status");
const chipsEl = q<HTMLElement>("#exercise-chips");
const exerciseNameEl = q<HTMLElement>("#exercise-name");
const exerciseHintEl = q<HTMLElement>("#exercise-hint");
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

let estimator: PoseEstimator | null = null;
let stream: MediaStream | null = null;
let wakeLock: WakeLockSentinel | null = null;
let judge: Judge | null = null;
let repCounter: RepCounter | null = null;
let session: SessionTracker | null = null;
let activeProfile: ExerciseProfile | null = null;
let selectedProfileId = PROFILES[0].id;
let sessionStartedAt: Date | null = null;
let finishing = false;
let running = false;
let lastVideoTime = -1;
let mirrored = false;
let currentRecord: SessionRecord | null = null;
let currentStats: SessionStats | null = null;
const currentRepFaults = new Set<string>();

browserHint.hidden = !IN_APP_BROWSER;

function renderChips(): void {
  chipsEl.replaceChildren();
  for (const profile of PROFILES) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = profile.name.split(" (")[0];
    chip.className = `${CHIP_BASE} ${profile.id === selectedProfileId ? CHIP_ON : CHIP_OFF}`;
    chip.addEventListener("click", () => {
      selectedProfileId = profile.id;
      renderChips();
    });
    chipsEl.append(chip);
  }
  const selected = findProfile(selectedProfileId);
  exerciseNameEl.textContent = selected.name;
  exerciseHintEl.textContent =
    selected.setupHint ?? `Prop the phone for a ${selected.cameraView} view`;

  if (selected.bodyweight) {
    weightLabel.textContent = "Extra kg";
    weightInput.placeholder = "BW";
  } else {
    weightLabel.textContent = "Kg";
    weightInput.placeholder = "0";
  }
}

renderChips();

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

function formatDebug(
  profile: ExerciseProfile,
  side: string,
  phase: RepPhase,
  metrics: FrameMetrics,
): string {
  const parts = profile.rules.map((rule) => {
    const value = metrics[rule.metric];
    const digits =
      rule.metric === "barOffset" || rule.metric === "wristRise" ? 2 : 0;
    return `${rule.metric} ${value.toFixed(digits)}`;
  });
  const triggerDigits = profile.rep.metric === "wristRise" ? 2 : 0;
  const trigger = `${profile.rep.metric} ${metrics[profile.rep.metric].toFixed(triggerDigits)}`;
  return [side, phase, trigger, ...parts].join(" | ");
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
  const resting = session.isResting && (phase === "idle" || phase === "ready");
  const label = resting ? "REST" : phaseLabel(profile, phase);
  showCounter(session.set, session.totalSets, session.reps, label);
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

async function persistSession(): Promise<SessionRecord | null> {
  if (!session || !activeProfile || !sessionStartedAt) return null;
  const weight = Number(weightInput.value);
  const record = session.toRecord({
    exerciseId: activeProfile.id,
    exerciseName: activeProfile.name,
    startedAt: sessionStartedAt,
    weightKg: weight > 0 ? weight : null,
  });
  try {
    await saveSession(record);
  } catch (err) {
    console.error("Could not save session", err);
  }
  return record;
}

function showSummary(record: SessionRecord): void {
  currentRecord = record;
  currentStats = computeStats(record);
  renderSummary(record, currentStats);
  summaryScreen.hidden = false;
}

async function finishSession(): Promise<void> {
  if (finishing) return;
  finishing = true;
  const record = await persistSession();
  stopCamera();
  if (record) {
    showSummary(record);
  } else {
    startScreen.hidden = false;
  }
  finishing = false;
}

startBtn.addEventListener("click", async () => {
  try {
    unlockAudio();

    activeProfile = findProfile(selectedProfileId);
    judge = new Judge(activeProfile);
    repCounter = new RepCounter(activeProfile.rep);
    session = new SessionTracker({
      sets: Number(setsInput.value) || 4,
      reps: Number(repsInput.value) || 12,
    });
    sessionStartedAt = new Date();
    currentRepFaults.clear();
    showExercise(activeProfile.name.split(" (")[0]);

    status.textContent = "Requesting camera...";
    stream = await startCamera(video);

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
    running = true;
    lastVideoTime = -1;
    requestAnimationFrame(loop);
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
  void finishSession();
});

doneBtn.addEventListener("click", () => {
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

function loop(): void {
  if (
    !running ||
    !estimator ||
    !judge ||
    !repCounter ||
    !session ||
    !activeProfile
  )
    return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    syncCanvasToVideo(canvas, video);

    const now = performance.now();
    const landmarks = estimator.estimate(video, now);

    if (!landmarks) {
      clearCanvas(ctx);
      showFeedback([]);
      showDebug("no person detected");
    } else {
      const aspect = video.videoWidth / video.videoHeight;
      const side = dominantSide(landmarks);
      const confidence = frameConfidence(landmarks, side);

      if (confidence < MIN_FRAME_CONFIDENCE) {
        drawSkeleton(ctx, landmarks, LOW_CONFIDENCE_COLOR);
        showFeedback([]);
        session.tick(now);
        updateCounterDisplay(activeProfile, repCounter.currentPhase);
        showDebug(
          `${side} | low confidence ${confidence.toFixed(2)} | frame skipped`,
        );
      } else {
        const metrics = computeFrameMetrics(landmarks, aspect);
        const repEvent = repCounter.update(metrics, now);
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
        drawSpineGuide(ctx, landmarks, side, GUIDE_COLOR);
        drawAngleLabels(ctx, landmarks, metrics, mirrored);
        showFeedback(verdict.failures.map((rule) => rule.message));

        if (repEvent?.type === "partial") {
          showNotice("Partial rep, use the full range");
        }
        if (sessionEvent?.type === "set-complete") {
          showNotice(`Set ${sessionEvent.record.set} done, rest`, 3000);
        }
        if (sessionEvent?.type === "session-complete") {
          showNotice("Session complete", 1500);
          setTimeout(() => void finishSession(), 1500);
        }

        updateCounterDisplay(activeProfile, phase);
        showDebug(formatDebug(activeProfile, side, phase, metrics));
        if (!verdict.ok) beep();
      }
    }
  }

  requestAnimationFrame(loop);
}
