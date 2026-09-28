# Recording sets

With "Record sets" on, every set becomes its own short video: the camera,
the skeleton and the key HUD numbers, burned into one picture. Clips show
up on the summary screen with a Share button. The code is in
`src/ui/recorder.ts` (making the clips) and `src/ui/clips.ts` (listing and
sharing them).

## Composing the frame

The browser cannot record "the screen" of a web page, but it can record a
canvas. So `SetRecorder` owns a second, invisible canvas and paints every
processed camera frame onto it, in this order:

1. the camera frame
2. the overlay canvas with the skeleton, spine guide and angle labels
3. a dark strip across the top with the exercise, "Set X/Y", "Reps N" and
   the current feedback message
4. "repchek.vercel.app" small in the bottom right corner

With the front camera the screen is mirrored with CSS, so steps 1 and 2 are
flipped the same way on the recording canvas. Otherwise the clip would be a
mirror image of what you saw. Steps 3 and 4 are drawn after the flip is
undone, so the text always reads normally.

The canvas matches the camera's shape, capped at 1280 px on the long side,
with even width and height because H.264 encoders reject odd sizes.

`canvas.captureStream(30)` turns that canvas into a live video track, and a
`MediaRecorder` turns the track into a file, handing over a chunk every
second.

## One clip per set

A whole workout is mostly walking around, resting and setting up. A clip
per set holds only the part worth watching, and a 30 second clip is small
enough to share straight into a chat.

The clip starts when the readiness gate arms for a set and stops when the
set ends, when the workout is finished, or when Finish is pressed. If you
step out of frame mid-set the gate disarms, but the clip keeps running;
when the gate arms again it simply carries on.

Two details at the edges of a clip:

- When the last rep closes a set, the session has already moved on to the
  next set by the time the frame is drawn. That frame uses the closed set's
  numbers, so the clip ends on the final rep count and not one short.
- The final frame only makes it into the file if more frames follow it, so
  stopping repeats it for half a second first.

A clip that reaches 3 minutes stops by itself and is kept, as a safety cap
for a phone left running.

A set that ends by the 20 second rest timeout, rather than by hitting the
target reps, includes that rest at the end of its clip, because only then
do we know the set is over.

## Format fallback

MP4 is the format that plays and shares everywhere, including on iPhone,
so it is tried first. Not every browser can make MP4, so the recorder asks
`MediaRecorder.isTypeSupported` about each of these in turn and uses the
first yes:

- `video/mp4;codecs=avc1`
- `video/mp4`
- `video/webm;codecs=vp9`
- `video/webm;codecs=vp8`
- `video/webm`

The shared file ends in `.mp4` or `.webm` to match. Browsers with no
`MediaRecorder` or no `captureStream` never see the Record sets option,
and the app works exactly as before.

## Nothing leaves the phone

The clips are held in memory as blobs, never uploaded and never saved to
storage. Share hands the file to the phone's own share sheet, or downloads
it where sharing files is not available. Tapping Done drops the clips so
the memory is freed, so share what you want to keep before that.
