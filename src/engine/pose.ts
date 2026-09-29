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
    try {
      return new PoseEstimator(await PoseEstimator.build(fileset, "GPU"));
    } catch {
      console.warn("GPU delegate unavailable, falling back to CPU.");
      return new PoseEstimator(await PoseEstimator.build(fileset, "CPU"));
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
