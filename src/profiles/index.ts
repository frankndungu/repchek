import type { ExerciseProfile } from "../engine/types";
import { deadlift } from "./deadlift";
import { latPulldown } from "./lat-pulldown";
import { benchPress } from "./bench-press";
import { inclineBench } from "./incline-bench";
import { chestFly } from "./chest-fly";
import { bicepsCurl } from "./biceps-curl";
import { tricepsExtension } from "./triceps-extension";
import { tricepsPushdown } from "./triceps-pushdown";
import { barbellRow } from "./barbell-row";
import { pushUp } from "./push-up";
import { pushUpFront } from "./push-up-front";
import { mountainClimbers } from "./mountain-climbers";
import { mountainClimbersFront } from "./mountain-climbers-front";

export const PROFILES: ExerciseProfile[] = [
  deadlift,
  barbellRow,
  latPulldown,
  benchPress,
  inclineBench,
  chestFly,
  bicepsCurl,
  tricepsExtension,
  tricepsPushdown,
  pushUp,
  pushUpFront,
  mountainClimbers,
  mountainClimbersFront,
];

export function findProfile(id: string): ExerciseProfile {
  const profile = PROFILES.find((p) => p.id === id);
  if (!profile) {
    throw new Error(`Unknown exercise profile: ${id}`);
  }
  return profile;
}
