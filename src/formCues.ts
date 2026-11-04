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
  deadlift: {
    form: "Back flat, bar close to your legs. Stand tall at the top.",
    phone: "Stand sideways to the phone, whole body in frame.",
  },
  "biceps-curl": {
    form: "Elbows tucked at your sides. Curl up, lower slowly.",
    phone: "Stand sideways to the phone, whole body in frame.",
  },
};
