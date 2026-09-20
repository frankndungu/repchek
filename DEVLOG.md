# M.O.R.G.A.N. Development Log

## Day 1 (2026-09-19): Scaffold, camera, and first skeleton

Built the foundation and got live pose tracking working end to end.

### What got built

- Project scaffold: Vite + vanilla TypeScript, folder structure mirroring the
  five-stage architecture (see docs/00-architecture.md)
- Deployment pipeline: GitHub repo wired to Vercel, HTTPS URL live on every push
- Camera acquisition: rear-facing stream via getUserMedia with proper error handling
- Pose estimation: MediaPipe Pose Landmarker running on-device in the browser,
  green skeleton drawn over the live feed at real time speed

### Stack choices

- TypeScript: the engine passes 33-landmark arrays around, and typed indices
  turn silent bugs into compile errors
- Vite: zero-config dev server and bundler, current standard
- No framework: the core of the app is a 30fps render loop, not UI state,
  and React would fight that pattern instead of helping it
- MediaPipe tasks-vision: pre-trained pose model, WASM engine, runs on-device,
  no server and no ML training required
- Vercel: free HTTPS hosting (camera access requires a secure context) and
  automatic deploys on push

### Bug 1: PowerShell is not Bash

`mkdir -p api docs ...` failed with a parameter binding error. PowerShell reads
`-p` as its `-Path` parameter and takes lists comma-separated, and `touch` does
not exist there at all. Lesson: when a command fails with a parameter binding
error, suspect a shell dialect issue before suspecting the command.

### Bug 2: the CSS that ate the afternoon

Symptom: eternal "Loading pose model..." screen, no camera, no skeleton.

Evidence: the console showed "Graph successfully started running" and a stack
trace of the render loop processing frames. So the engine was fine, which meant
the bug had to be visual.

Diagnosis: main.ts hides the start screen by setting the `hidden` attribute.
`hidden` only works because the browser's built-in stylesheet applies
`display: none` to hidden elements. Our own CSS set `display: flex` on
`#start-screen`, and author CSS outranks browser defaults in the cascade, so
the fully working app sat behind an opaque black div the whole time.

Fix: one rule.

    #start-screen[hidden] { display: none; }

Lesson: a computer vision app is still a web app, and debugging it is mostly
web debugging. Evidence first, then diagnosis, then the fix is usually small.

### Milestone

First live skeleton, tracking arms and face in real time. Posted the clip as
Day 1 on Instagram, 300 views.

## Day 2 (2026-09-20): Documentation day

Wrote the documentation before moving forward: architecture overview, camera
concepts, and pose estimation concepts. The rule for this project is that docs
keep pace with code, one concept doc per step. Next up is Step 4, angle math,
where landmarks become joint angles and Morgan starts measuring instead of
just seeing.
