import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import type { Landmark } from "./types";

const WASM_PATH = "/wasm";
const MODEL_PATH = "/models/pose_landmarker_lite.task";

export class PoseEstimator {
  private landmarker: PoseLandmarker;

  private constructor(landmarker: PoseLandmarker) {
    this.landmarker = landmarker;
  }

  static async create(): Promise<PoseEstimator> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_PATH);
    let estimator: PoseEstimator;
    try {
      estimator = new PoseEstimator(await PoseEstimator.build(fileset, "GPU"));
    } catch {
      console.warn("GPU delegate unavailable, falling back to CPU.");
      estimator = new PoseEstimator(await PoseEstimator.build(fileset, "CPU"));
    }
    estimator.warmUp();
    return estimator;
  }

  // The first call sets the model up on the GPU, which can take seconds.
  // Doing it here, on a blank picture, while the loading message is on
  // screen means the first frame of the workout is not the slow one.
  private warmUp(): void {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, 256, 256);
      }
      // Timestamp 0: real frames use performance.now(), which is later.
      this.landmarker.detectForVideo(canvas, 0);
    } catch (err) {
      console.warn("Pose model warm-up failed", err);
    }
  }

  private static build(
    fileset: unknown,
    delegate: "GPU" | "CPU",
  ): Promise<PoseLandmarker> {
    return PoseLandmarker.createFromOptions(fileset as never, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate },
      runningMode: "VIDEO",
      // More than one, so in a busy gym LifterLock can pick the lifter
      // instead of the model picking whoever it likes.
      numPoses: 3,
    });
  }

  // Every pose found in this frame, possibly none.
  estimate(video: HTMLVideoElement, timestampMs: number): Landmark[][] {
    const result = this.landmarker.detectForVideo(video, timestampMs);
    return result.landmarks.map((pose) =>
      pose.map((p) => ({
        x: p.x,
        y: p.y,
        z: p.z,
        visibility: p.visibility ?? 1,
      })),
    );
  }
}
