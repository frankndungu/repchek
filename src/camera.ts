export interface CameraOptions {
  facingMode: "environment" | "user";
  width: number;
  height: number;
}

const DEFAULTS: CameraOptions = {
  facingMode: "environment",
  width: 1280,
  height: 720,
};

export async function startCamera(
  video: HTMLVideoElement,
  options: Partial<CameraOptions> = {},
): Promise<MediaStream> {
  const { facingMode, width, height } = { ...DEFAULTS, ...options };

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Camera API unavailable. Check that you are on HTTPS or localhost.",
    );
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: width },
      height: { ideal: height },
    },
    audio: false,
  });

  video.srcObject = stream;
  await video.play();
  return stream;
}

export function explainCameraError(err: unknown): string {
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
        return "Camera permission was denied. Enable it in your browser settings and reload.";
      case "NotFoundError":
        return "No camera was found on this device.";
      case "NotReadableError":
        return "The camera is already in use by another app.";
      default:
        return `Camera error: ${err.name}`;
    }
  }
  return "Could not start the camera.";
}
