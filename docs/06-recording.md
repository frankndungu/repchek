# Recording sets

With "Record sets" on, every set becomes its own short video: the camera,
the skeleton and the key HUD numbers, burned into one picture. If nothing
is ever counted, the session keeps an "Attempt" clip instead. Clips show
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
   a second line: the current feedback message once counting, or until the
   gate arms, the same text as the pill ("HOLD STILL", "MOVE BACK, I CAN'T
   SEE YOUR HANDS" and so on), so a clip shows why counting has not started
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

Clips have no sound: the spoken coach cues come from the phone's speech
engine, not the canvas, so they are not in the recording.

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
- The canvas capture takes at most 30 frames a second, and only when the
  canvas changes. A final frame drawn too soon after the previous one was
  often dropped, so stopping redraws it for half a second first.

A clip that reaches 3 minutes stops by itself and is kept, as a safety cap
for a phone left running.

A set that ends by the 20 second rest timeout, rather than by hitting the
target reps, includes that rest at the end of its clip, because only then
do we know the set is over.

## Standby, and the attempt clip

If counting never starts (the phone is in the wrong place, or the
readiness check does not recognise your start position), there would be no
set clips at all. That is exactly when a video is most useful, to see what
went wrong.

So recording starts as soon as the camera does, in standby. A standby
recording is not a clip yet, it is kept in case it is needed:

- Every 60 seconds the standby recording is stopped and kept as the
  "previous" one, and a fresh one starts. The one before that is thrown
  away, so there are never more than two, about two minutes of video.
- When the gate arms, both are thrown away and the set clip starts.
- When a set ends, recording goes back to standby until the gate arms for
  the next set. Standby waits for the finished clip's half second tail
  first, because recording the canvas twice at once cost that clip its
  final frame in testing.

When the session ends, by Finish or by completing the last set:

- If at least one set was recorded, the standby recordings are thrown
  away. The set clips already show what happened.
- If no set was recorded, one standby recording is kept as an "Attempt"
  clip, saved as `repchek-<exercise>-attempt.mp4` (or `.webm`). The summary
  lists it with a note asking you to share it, so we can see why nothing
  was counted.

Which one: the current standby if it has run for at least 20 seconds,
otherwise the previous one. A restart just before Finish would leave the
current one only a few seconds long, too short to show anything, so the
full minute before it is used instead. The only way to get an attempt clip
under 20 seconds is a session shorter than that.

A side benefit: the first recording after the camera starts can lose its
opening seconds while the video encoder warms up. Standby takes that hit
instead of the first set.

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
