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
  isCurrent: () => boolean = () => true,
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

  try {
    if (!isCurrent()) {
      throw new DOMException("Camera startup was cancelled.", "AbortError");
    }
    video.srcObject = stream;
    await video.play();
    if (!isCurrent()) {
      throw new DOMException("Camera startup was cancelled.", "AbortError");
    }
    return stream;
  } catch (err) {
    stopCameraStream(video, stream);
    throw err;
  }
}

export function stopCameraStream(
  video: HTMLVideoElement,
  stream: MediaStream,
): void {
  try {
    if (video.srcObject === stream) video.srcObject = null;
  } catch (err) {
    console.warn("Could not clear the camera video source", err);
  }

  try {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch (err) {
        console.warn("Could not stop a camera track", err);
      }
    });
  } catch (err) {
    console.warn("Could not read camera tracks", err);
  }
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

export function isUserFacing(stream: MediaStream): boolean {
  const track = stream.getVideoTracks()[0];
  const facing = track?.getSettings().facingMode;
  return facing !== "environment";
}
