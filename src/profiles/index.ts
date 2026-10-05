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

// Sections are where you train. Home and free weights come first: the
// camera sees a whole body on the floor or standing, and loses part of it
// behind benches and machines.
export type Section = "At home" | "Free weights" | "At the gym";
export type PhonePosition = "beside" | "front";

export interface ExerciseChoice {
  id: string;
  name: string;
  section: Section;
  // Equipment, shown under the name on the start screen.
  detail?: string;
  // The profile id for each phone position this exercise supports.
  positions: Partial<Record<PhonePosition, string>>;
  // What each position checks, shown on the position cards. Only needed
  // when an exercise has both positions.
  checks?: Record<PhonePosition, string>;
}

export const SECTIONS: Section[] = ["At home", "Free weights", "At the gym"];

export const EXERCISES: ExerciseChoice[] = [
  {
    id: "push-up",
    name: "Push-up",
    section: "At home",
    positions: { beside: "push-up", front: "push-up-front" },
    checks: {
      beside: "Checks your body stays straight",
      front: "Checks your elbows stay tucked",
    },
  },
  {
    id: "mountain-climbers",
    name: "Mountain climbers",
    section: "At home",
    positions: {
      beside: "mountain-climbers",
      front: "mountain-climbers-front",
    },
    checks: {
      beside: "Checks your body stays straight",
      front: "Checks your shoulders stay level",
    },
  },
  {
    id: "deadlift",
    name: "Deadlift",
    section: "Free weights",
    positions: { beside: "deadlift" },
  },
  {
    id: "barbell-row",
    name: "Bent-over barbell row",
    section: "Free weights",
    positions: { beside: "barbell-row" },
  },
  {
    id: "biceps-curl",
    name: "Biceps curl",
    section: "Free weights",
    detail: "Dumbbell, EZ bar or cable",
    positions: { beside: "biceps-curl" },
  },
  {
    id: "triceps-extension",
    name: "Overhead triceps extension",
    section: "Free weights",
    positions: { beside: "triceps-extension" },
  },
  {
    id: "bench-press",
    name: "Bench press",
    section: "At the gym",
    detail: "Dumbbell or barbell",
    positions: { beside: "bench-press" },
  },
  {
    id: "incline-bench",
    name: "Incline bench press",
    section: "At the gym",
    positions: { beside: "incline-bench" },
  },
  {
    id: "chest-fly",
    name: "Chest fly",
    section: "At the gym",
    detail: "Dumbbell",
    positions: { beside: "chest-fly" },
  },
  {
    id: "lat-pulldown",
    name: "Lat pulldown",
    section: "At the gym",
    positions: { beside: "lat-pulldown" },
  },
  {
    id: "triceps-pushdown",
    name: "Triceps pushdown",
    section: "At the gym",
    detail: "Cable",
    positions: { beside: "triceps-pushdown" },
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
