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
import type { ExerciseProfile, FrameMetrics, RepPhase } from "./engine/types";
import { PROFILES, findProfile } from "./profiles";
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

const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const LOW_CONFIDENCE_COLOR = "#9ca3af";
const GUIDE_COLOR = "#22d3ee";
const MIN_FRAME_CONFIDENCE = 0.6;

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const status = document.querySelector<HTMLElement>("#status")!;
const exerciseSelect =
  document.querySelector<HTMLSelectElement>("#exercise-select")!;
const cameraHint = document.querySelector<HTMLElement>("#camera-hint")!;
const setsInput = document.querySelector<HTMLInputElement>("#sets-input")!;
const repsInput = document.querySelector<HTMLInputElement>("#reps-input")!;

const ctx = canvas.getContext("2d")!;

let estimator: PoseEstimator | null = null;
let judge: Judge | null = null;
let repCounter: RepCounter | null = null;
let session: SessionTracker | null = null;
let activeProfile: ExerciseProfile | null = null;
let lastVideoTime = -1;
let mirrored = false;

for (const profile of PROFILES) {
  const option = document.createElement("option");
  option.value = profile.id;
  option.textContent = profile.name;
  exerciseSelect.append(option);
}

function updateCameraHint(): void {
  const profile = findProfile(exerciseSelect.value);
  cameraHint.textContent =
    profile.setupHint ?? `Prop the phone for a ${profile.cameraView} view`;
}

exerciseSelect.addEventListener("change", updateCameraHint);
updateCameraHint();

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
    const digits = rule.metric === "barOffset" ? 2 : 0;
    return `${rule.metric} ${value.toFixed(digits)}`;
  });
  const trigger = `${profile.rep.metric} ${metrics[profile.rep.metric].toFixed(0)}`;
  return [side, phase, trigger, ...parts].join(" | ");
}

function updateCounterDisplay(profile: ExerciseProfile, phase: RepPhase): void {
  if (!session) return;
  if (session.isFinished) {
    const last = session.records[session.records.length - 1];
    showCounter(session.totalSets, session.totalSets, last?.reps ?? 0, "DONE");
    return;
  }
  const resting = session.isResting && (phase === "idle" || phase === "ready");
  const label = resting ? "REST" : phaseLabel(profile, phase);
  showCounter(session.set, session.totalSets, session.reps, label);
}

startBtn.addEventListener("click", async () => {
  try {
    unlockAudio();

    activeProfile = findProfile(exerciseSelect.value);
    judge = new Judge(activeProfile);
    repCounter = new RepCounter(activeProfile.rep);
    session = new SessionTracker({
      sets: Number(setsInput.value) || 4,
      reps: Number(repsInput.value) || 12,
    });
    showExercise(activeProfile.name);

    status.textContent = "Requesting camera...";
    const stream = await startCamera(video);

    mirrored = isUserFacing(stream);
    video.classList.toggle("mirrored", mirrored);
    canvas.classList.toggle("mirrored", mirrored);

    status.textContent = "Loading pose model...";
    estimator = await PoseEstimator.create();

    startScreen.hidden = true;
    requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    status.textContent =
      err instanceof DOMException
        ? explainCameraError(err)
        : "Failed to load the pose model. Check the console.";
  }
});

function loop(): void {
  if (!estimator || !judge || !repCounter || !session || !activeProfile) return;

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
        const sessionEvent = repEvent
          ? session.onRepEvent(repEvent, now)
          : session.tick(now);

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
          showNotice("Session complete", 4000);
        }

        updateCounterDisplay(activeProfile, phase);
        showDebug(formatDebug(activeProfile, side, phase, metrics));
        if (!verdict.ok) beep();
      }
    }
  }

  requestAnimationFrame(loop);
}
