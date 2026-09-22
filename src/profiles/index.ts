import type { ExerciseProfile } from "../engine/types";
import { deadlift } from "./deadlift";
import { latPulldown } from "./lat-pulldown";
import { benchPress } from "./bench-press";
import { bicepsCurl } from "./biceps-curl";

export const PROFILES: ExerciseProfile[] = [
  deadlift,
  latPulldown,
  benchPress,
  bicepsCurl,
];

export function findProfile(id: string): ExerciseProfile {
  const profile = PROFILES.find((p) => p.id === id);
  if (!profile) {
    throw new Error(`Unknown exercise profile: ${id}`);
  }
  return profile;
}
