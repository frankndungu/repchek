import { startCamera, explainCameraError, isUserFacing } from "./camera";
import { PoseEstimator } from "./engine/pose";
import { computeFrameMetrics, dominantSide } from "./engine/angles";
import { Judge } from "./engine/judge";
import { deadlift } from "./profiles/deadlift";
import {
  syncCanvasToVideo,
  drawSkeleton,
  drawAngleLabels,
  clearCanvas,
} from "./ui/overlay";
import { showFeedback, showDebug } from "./ui/hud";
import { unlockAudio, beep } from "./ui/audio";

const GOOD_COLOR = "#22c55e";
const BAD_COLOR = "#ef4444";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const status = document.querySelector<HTMLElement>("#status")!;

const ctx = canvas.getContext("2d")!;
const judge = new Judge(deadlift);

let estimator: PoseEstimator | null = null;
let lastVideoTime = -1;
let mirrored = false;

startBtn.addEventListener("click", async () => {
  try {
    unlockAudio();

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
  if (!estimator) return;

  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    syncCanvasToVideo(canvas, video);

    const landmarks = estimator.estimate(video, performance.now());
    if (landmarks) {
      const aspect = video.videoWidth / video.videoHeight;
      const metrics = computeFrameMetrics(landmarks, aspect);
      const verdict = judge.evaluate(metrics);

      drawSkeleton(ctx, landmarks, verdict.ok ? GOOD_COLOR : BAD_COLOR);
      drawAngleLabels(ctx, landmarks, metrics, mirrored);
      showFeedback(verdict.failures.map((rule) => rule.message));
      showDebug(
        `${dominantSide(landmarks)} | torso ${metrics.torsoAngle.toFixed(0)} | bar ${metrics.barOffset.toFixed(2)}`,
      );
      if (!verdict.ok) beep();
    } else {
      clearCanvas(ctx);
      showFeedback([]);
      showDebug("no person detected");
    }
  }

  requestAnimationFrame(loop);
}
