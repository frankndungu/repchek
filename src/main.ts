import { startCamera, explainCameraError, isUserFacing } from "./camera";
import { PoseEstimator } from "./engine/pose";
import { computeFrameMetrics, dominantSide } from "./engine/angles";
import { Judge } from "./engine/judge";
import type { ExerciseProfile, FrameMetrics } from "./engine/types";
import { PROFILES, findProfile } from "./profiles";
import {
  syncCanvasToVideo,
  drawSkeleton,
  drawSpineGuide,
  drawAngleLabels,
  clearCanvas,
} from "./ui/overlay";
import { showFeedback, showDebug, showExercise } from "./ui/hud";
import { unlockAudio, beep } from "./ui/audio";

const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";
const GUIDE_COLOR = "#22d3ee";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const status = document.querySelector<HTMLElement>("#status")!;
const exerciseSelect =
  document.querySelector<HTMLSelectElement>("#exercise-select")!;
const cameraHint = document.querySelector<HTMLElement>("#camera-hint")!;

const ctx = canvas.getContext("2d")!;

let estimator: PoseEstimator | null = null;
let judge: Judge | null = null;
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

function formatDebug(
  profile: ExerciseProfile,
  side: string,
  metrics: FrameMetrics,
): string {
  const parts = profile.rules.map((rule) => {
    const value = metrics[rule.metric];
    const digits = rule.metric === "barOffset" ? 2 : 0;
    return `${rule.metric} ${value.toFixed(digits)}`;
  });
  return [side, ...parts].join(" | ");
}

startBtn.addEventListener("click", async () => {
  try {
    unlockAudio();

    activeProfile = findProfile(exerciseSelect.value);
    judge = new Judge(activeProfile);
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
  if (!estimator || !judge || !activeProfile) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    syncCanvasToVideo(canvas, video);

    const landmarks = estimator.estimate(video, performance.now());
    if (landmarks) {
      const aspect = video.videoWidth / video.videoHeight;
      const side = dominantSide(landmarks);
      const metrics = computeFrameMetrics(landmarks, aspect);
      const verdict = judge.evaluate(metrics);

      drawSkeleton(ctx, landmarks, verdict.ok ? GOOD_COLOR : BAD_COLOR);
      drawSpineGuide(ctx, landmarks, side, GUIDE_COLOR);
      drawAngleLabels(ctx, landmarks, metrics, mirrored);
      showFeedback(verdict.failures.map((rule) => rule.message));
      showDebug(formatDebug(activeProfile, side, metrics));
      if (!verdict.ok) beep();
    } else {
      clearCanvas(ctx);
      showFeedback([]);
      showDebug("no person detected");
    }
  }

  requestAnimationFrame(loop);
}
