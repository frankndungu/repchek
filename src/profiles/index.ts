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

// Exercises are what the user picks; profiles are what the app measures.
// One exercise can have two profiles, one for each place the phone can be:
// beside you (side view) or in front of you (front view). They stay
// separate profiles because the two views see, and so check, different
// things. See docs/04-judge-and-profiles.md.

export type MuscleGroup = "Chest" | "Back" | "Arms" | "Core";
export type PhonePosition = "beside" | "front";

export interface ExerciseChoice {
  id: string;
  name: string;
  group: MuscleGroup;
  // Equipment, shown under the name on the start screen.
  detail?: string;
  // The profile id for each phone position this exercise supports.
  positions: Partial<Record<PhonePosition, string>>;
  // What each position checks, shown on the position cards. Only needed
  // when an exercise has both positions.
  checks?: Record<PhonePosition, string>;
}

export const MUSCLE_GROUPS: MuscleGroup[] = ["Chest", "Back", "Arms", "Core"];

export const EXERCISES: ExerciseChoice[] = [
  {
    id: "push-up",
    name: "Push-up",
    group: "Chest",
    positions: { beside: "push-up", front: "push-up-front" },
    checks: {
      beside: "Checks your body stays straight",
      front: "Checks your elbows stay tucked",
    },
  },
  {
    id: "bench-press",
    name: "Bench press",
    group: "Chest",
    detail: "Dumbbell or barbell",
    positions: { beside: "bench-press" },
  },
  {
    id: "incline-bench",
    name: "Incline bench press",
    group: "Chest",
    positions: { beside: "incline-bench" },
  },
  {
    id: "chest-fly",
    name: "Chest fly",
    group: "Chest",
    detail: "Dumbbell",
    positions: { beside: "chest-fly" },
  },
  {
    id: "deadlift",
    name: "Deadlift",
    group: "Back",
    positions: { beside: "deadlift" },
  },
  {
    id: "barbell-row",
    name: "Bent-over barbell row",
    group: "Back",
    positions: { beside: "barbell-row" },
  },
  {
    id: "lat-pulldown",
    name: "Lat pulldown",
    group: "Back",
    positions: { beside: "lat-pulldown" },
  },
  {
    id: "biceps-curl",
    name: "Biceps curl",
    group: "Arms",
    detail: "Dumbbell, EZ bar or cable",
    positions: { beside: "biceps-curl" },
  },
  {
    id: "triceps-extension",
    name: "Overhead triceps extension",
    group: "Arms",
    positions: { beside: "triceps-extension" },
  },
  {
    id: "triceps-pushdown",
    name: "Triceps pushdown",
    group: "Arms",
    detail: "Cable",
    positions: { beside: "triceps-pushdown" },
  },
  {
    id: "mountain-climbers",
    name: "Mountain climbers",
    group: "Core",
    positions: {
      beside: "mountain-climbers",
      front: "mountain-climbers-front",
    },
    checks: {
      beside: "Checks your body stays straight",
      front: "Checks your shoulders stay level",
    },
  },
];

export function findExercise(id: string): ExerciseChoice {
  const exercise = EXERCISES.find((e) => e.id === id);
  if (!exercise) {
    throw new Error(`Unknown exercise: ${id}`);
  }
  return exercise;
}

// The profile for this exercise with the phone in this position, or in the
// other one if the exercise does not support it.
export function profileFor(
  exercise: ExerciseChoice,
  position: PhonePosition,
): ExerciseProfile {
  const id =
    exercise.positions[position] ??
    exercise.positions.beside ??
    exercise.positions.front!;
  return findProfile(id);
}
