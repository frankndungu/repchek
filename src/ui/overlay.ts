import { PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "../engine/types";
import { LANDMARK } from "../engine/types";
import type { JointAngles } from "../engine/angles";

const MIN_VISIBILITY = 0.5;

const ANGLE_LABELS: Array<{ key: keyof JointAngles; landmark: number }> = [
  { key: "leftKnee", landmark: LANDMARK.LEFT_KNEE },
  { key: "rightKnee", landmark: LANDMARK.RIGHT_KNEE },
  { key: "leftHip", landmark: LANDMARK.LEFT_HIP },
  { key: "rightHip", landmark: LANDMARK.RIGHT_HIP },
  { key: "leftElbow", landmark: LANDMARK.LEFT_ELBOW },
  { key: "rightElbow", landmark: LANDMARK.RIGHT_ELBOW },
];

export function syncCanvasToVideo(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
): void {
  if (
    canvas.width !== video.videoWidth ||
    canvas.height !== video.videoHeight
  ) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  color: string,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 4;

  for (const { start, end } of PoseLandmarker.POSE_CONNECTIONS) {
    const a = landmarks[start];
    const b = landmarks[end];
    if (a.visibility < MIN_VISIBILITY || b.visibility < MIN_VISIBILITY)
      continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }

  for (const lm of landmarks) {
    if (lm.visibility < MIN_VISIBILITY) continue;
    ctx.beginPath();
    ctx.arc(lm.x * width, lm.y * height, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawAngleLabels(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  angles: JointAngles,
  mirrored: boolean,
): void {
  const { width, height } = ctx.canvas;
  const fontSize = Math.max(14, Math.round(width * 0.018));
  ctx.font = `bold ${fontSize}px system-ui, sans-serif`;
  ctx.textBaseline = "middle";

  for (const { key, landmark } of ANGLE_LABELS) {
    const lm = landmarks[landmark];
    if (lm.visibility < MIN_VISIBILITY) continue;
    const text = `${Math.round(angles[key])}°`;
    drawLabel(ctx, text, lm.x * width, lm.y * height, fontSize, mirrored);
  }
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number,
  mirrored: boolean,
): void {
  const padding = fontSize * 0.4;
  const offset = fontSize * 0.8;

  ctx.save();
  if (mirrored) {
    ctx.scale(-1, 1);
    x = -x;
  }

  const textWidth = ctx.measureText(text).width;
  const boxX = x + offset;
  const boxY = y - fontSize / 2 - padding / 2;

  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(boxX, boxY, textWidth + padding * 2, fontSize + padding);
  ctx.fillStyle = "#fff";
  ctx.fillText(text, boxX + padding, y);

  ctx.restore();
}
