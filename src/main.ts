import { startCamera, explainCameraError } from "./camera";

const video = document.querySelector<HTMLVideoElement>("#camera")!;
const startScreen = document.querySelector<HTMLElement>("#start-screen")!;
const startBtn = document.querySelector<HTMLButtonElement>("#start-btn")!;
const status = document.querySelector<HTMLElement>("#status")!;

startBtn.addEventListener("click", async () => {
  status.textContent = "Requesting camera...";
  try {
    await startCamera(video);
    startScreen.hidden = true;
  } catch (err) {
    status.textContent = explainCameraError(err);
  }
});
