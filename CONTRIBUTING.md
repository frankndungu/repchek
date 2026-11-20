# Contributing to repchek

Thanks for helping. The most useful contributions are:

- **A recorded set that miscounts.** This is how thresholds get better.
- **A new exercise profile**, or better numbers for an existing one.
- **Bug fixes** and clearer docs.

## Before you start

1. Read the [README](README.md), especially "How the computer vision works"
   and "Add an exercise".
2. For anything bigger than a small fix, open an issue first and say what you
   plan to change, so we agree on the approach before you write it.

## Reporting a miscount

Open the app with `?debug=1`, do the set, then use the Debug data row in More
options on Workout setup to save the numbers file and the video. In the issue,
say:

- the exercise and where the phone was (beside you or in front)
- what happened (counted 7 of 10, flagged good reps, never started)
- the numbers file, and the video if you are happy to share it

Only share a video of yourself, or of someone who agreed to it.

## Making a change

```bash
npm install
```

```bash
npm run dev
```

Before you open a pull request:

```bash
npm test
```

```bash
npm run build
```

Both must pass. `npm run build` also runs the TypeScript checks.

## How the code is written

- **Exercises are data.** A new exercise is a profile file plus registry
  entries, never a change to the engine.
- **Logic stays testable.** Put rules and maths in files with no DOM and no
  network (like `src/progress.ts` or `src/engine/`), and test them in `tests/`.
- **Every threshold has a reason.** Say in a comment where a number came from:
  a recorded set, or "provisional" if it is reasoned and not yet tested on
  real sets.
- **No secrets in the app.** Only the Supabase anon key belongs in `VITE_`
  variables. Server keys go in Supabase function secrets.

## Writing for the app

The app's words follow a few rules:

- The name is always lowercase: repchek.
- Short, plain sentences. Say what to do ("Keep your chest up").
- No emojis and no long dashes.
- Be exact about privacy: the video is analysed on the device and is not
  uploaded. Workout records are saved to the account.

## License

By contributing, you agree that your contributions are licensed under the
[MIT license](LICENSE).
