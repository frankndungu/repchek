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
      numPoses: 1,
    });
  }

  estimate(video: HTMLVideoElement, timestampMs: number): Landmark[] | null {
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const pose = result.landmarks[0];
    if (!pose) return null;
    return pose.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
      visibility: p.visibility ?? 1,
    }));
  }
}
