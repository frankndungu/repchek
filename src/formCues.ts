// The one sentence of good form and the line about the phone, for each
// exercise on Workout setup. The first three come from the demo mockup. The
// deadlift and the curl are written in the same voice. Keyed by exercise id,
// or "exercise:position" when the phone position changes the advice.

export interface FormCue {
  form: string;
  phone: string;
}

export const FORM_CUES: Record<string, FormCue> = {
  "push-up": {
    form: "Keep your body in one straight line.",
    phone: "Phone on the floor, side on.",
  },
  "push-up:front": {
    form: "Keep your elbows tucked. Body in one straight line.",
    phone: "Phone on the floor, facing your head.",
  },
  "mountain-climbers": {
    form: "Hands under shoulders. Drive one knee at a time.",
    phone: "Phone on the floor, side on.",
  },
  "barbell-row": {
    form: "Back flat, eyes forward. Pull the bar to your belly.",
    phone: "Stand sideways to the phone, whole body in frame.",
  },
  squat: {
    form: "Chest up, knees over your toes. Sit down until your thighs are level.",
    phone: "Stand sideways to the phone, whole body in frame.",
  },
  "glute-bridge": {
    form: "Feet flat, push through your heels. Lift until your body is in one line.",
    phone: "Phone on the floor, side on. Knees bent.",
  },
  "wall-sit": {
    form: "Back flat on the wall, thighs level with the floor. Breathe.",
    phone: "Phone on the floor, side on to you and the wall.",
  },
  crunch: {
    form: "Lift your shoulder blades. Chin off your chest, no pulling on your neck.",
    phone: "Phone on the floor, side on. Knees bent.",
  },
  plank: {
    form: "Body in one straight line. Hips level, no sagging.",
    phone: "Phone on the floor, side on.",
  },
  "pull-up": {
    form: "Hang with straight arms. Pull until your chin is over the bar.",
    phone: "Phone on the floor, side on, you and the bar in frame.",
  },
  "dumbbell-row": {
    form: "Back flat, eyes forward. Pull the dumbbell to your hip.",
    phone: "Stand sideways, working arm nearest the phone, whole body in frame.",
  },
  deadlift: {
    form: "Back flat, bar close to your legs. Stand tall at the top.",
    phone: "Stand sideways to the phone, whole body in frame.",
  },
  "biceps-curl": {
    form: "Elbows tucked at your sides. Curl up, lower slowly.",
    phone: "Stand sideways to the phone, whole body in frame.",
  },
};
