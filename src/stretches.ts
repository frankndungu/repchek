// Guided stretch routines: a picture, one line on how to do it and a timer for
// each stretch. No camera. Plain data and logic, so it is easy to test.

export interface Stretch {
  id: string;
  name: string;
  // One short line, said and shown while you hold it.
  how: string;
  seconds: number;
  // Done on the left and then the right, each for `seconds`.
  sides?: boolean;
}

export interface Routine {
  id: string;
  name: string;
  detail: string;
  stretches: Stretch[];
}

// Seconds to get into the next stretch before its timer starts.
export const GET_READY_SECONDS = 5;

export const FULL_BODY: Routine = {
  id: "full-body-stretch",
  name: "Full body stretch",
  detail: "No equipment. Any time, or on a rest day",
  stretches: [
    {
      id: "overhead-reach",
      name: "Overhead reach",
      how: "Stand tall and reach both arms up. Breathe slowly.",
      seconds: 30,
    },
    {
      id: "chest-opener",
      name: "Chest opener",
      how: "Hold your hands behind your back. Lift your chest and squeeze your shoulders back.",
      seconds: 30,
    },
    {
      id: "quad-stretch",
      name: "Standing quad stretch",
      how: "Hold your ankle behind you and pull your heel towards your glute. Knees together.",
      seconds: 30,
      sides: true,
    },
    {
      id: "forward-fold",
      name: "Forward fold",
      how: "Fold from your hips and let your arms hang. Soft knees are fine.",
      seconds: 30,
    },
    {
      id: "low-lunge",
      name: "Low lunge",
      how: "Back knee on the floor, front knee over your ankle. Push your hips forward.",
      seconds: 30,
      sides: true,
    },
    {
      id: "downward-dog",
      name: "Downward dog",
      how: "Hands and feet on the floor, hips high. Press your heels down.",
      seconds: 30,
    },
    {
      id: "cobra",
      name: "Cobra",
      how: "Lie face down. Hips stay on the floor while you push your chest up.",
      seconds: 30,
    },
    {
      id: "childs-pose",
      name: "Child's pose",
      how: "Sit back on your heels, chest down, arms long in front of you.",
      seconds: 45,
    },
    {
      id: "seated-hamstring",
      name: "Seated hamstring stretch",
      how: "Sit with your legs straight. Reach for your toes and keep your back long.",
      seconds: 30,
    },
    {
      id: "knee-hug",
      name: "Knee hug",
      how: "Lie on your back and pull one knee to your chest. The other leg stays long.",
      seconds: 30,
      sides: true,
    },
  ],
};

export const ROUTINES: Routine[] = [FULL_BODY];

export function findRoutine(id: string): Routine | null {
  return ROUTINES.find((r) => r.id === id) ?? null;
}

// One timer: a stretch, on one side or both.
export interface Step {
  stretch: Stretch;
  side: "left" | "right" | null;
  seconds: number;
}

export function stepsFor(routine: Routine): Step[] {
  return routine.stretches.flatMap((stretch): Step[] =>
    stretch.sides
      ? [
          { stretch, side: "left", seconds: stretch.seconds },
          { stretch, side: "right", seconds: stretch.seconds },
        ]
      : [{ stretch, side: null, seconds: stretch.seconds }],
  );
}

// The whole routine, holds and the get-ready time before each one.
export function totalSeconds(routine: Routine): number {
  return stepsFor(routine).reduce((sum, step) => sum + step.seconds + GET_READY_SECONDS, 0);
}

// "About 8 minutes".
export function lengthText(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `About ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

// "Standing quad stretch, left side".
export function stepTitle(step: Step): string {
  return step.side ? `${step.stretch.name}, ${step.side} side` : step.stretch.name;
}

// "30 s" or "30 s each side", for the list before you start.
export function holdText(stretch: Stretch): string {
  return stretch.sides ? `${stretch.seconds} s each side` : `${stretch.seconds} s`;
}
