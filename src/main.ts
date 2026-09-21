import { startCamera, explainCameraError, isUserFacing } from "./camera";
import { PoseEstimator } from "./engine/pose";
import { computeJointAngles } from "./engine/angles";
import {
  syncCanvasToVideo,
  drawSkeleton,
  drawAngleLabels,
  clearCanvas,
} from "./ui/overlay";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const status = document.querySelector<HTMLElement>("#status")!;

const ctx = canvas.getContext("2d")!;

let estimator: PoseEstimator | null = null;
let lastVideoTime = -1;
let mirrored = false;

startBtn.addEventListener("click", async () => {
  try {
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
      const angles = computeJointAngles(landmarks);
      drawSkeleton(ctx, landmarks, "#22c55e");
      drawAngleLabels(ctx, landmarks, angles, mirrored);
    } else {
      clearCanvas(ctx);
    }
  }

  requestAnimationFrame(loop);
}
