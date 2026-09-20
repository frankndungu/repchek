import { startCamera, explainCameraError } from "./camera";
import { PoseEstimator } from "./engine/pose";
import { syncCanvasToVideo, drawSkeleton, clearCanvas } from "./ui/overlay";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const canvas = document.querySelector<HTMLCanvasElement>("#overlay")!;
const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const status = document.querySelector<HTMLElement>("#status")!;

const ctx = canvas.getContext("2d")!;

let estimator: PoseEstimator | null = null;
let lastVideoTime = -1;

startBtn.addEventListener("click", async () => {
  try {
    status.textContent = "Requesting camera...";
    await startCamera(video);

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
      drawSkeleton(ctx, landmarks, "#22c55e");
    } else {
      clearCanvas(ctx);
    }
  }

  requestAnimationFrame(loop);
}
