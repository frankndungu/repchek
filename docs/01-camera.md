# Camera and getUserMedia

How Morgan gets video from the phone, and the rules browsers enforce around
camera access.

## getUserMedia

`navigator.mediaDevices.getUserMedia()` is the browser API for camera and
microphone access. Calling it triggers a permission prompt; if the user
accepts, it resolves with a `MediaStream`, a live handle to the camera feed.
Assigning that stream to a `<video>` element's `srcObject` renders the feed.
No plugins, no native code.

It is Promise-based and it can fail: permission denied, no camera present, or
the camera held by another app. Each failure is a `DOMException` with a
specific `name`, and `explainCameraError` in `src/camera.ts` maps the three
common ones to human messages:

- `NotAllowedError`: permission denied, re-enable in browser settings
- `NotFoundError`: no camera on this device
- `NotReadableError`: another app is using the camera

## Secure contexts

Browsers only expose the camera in a secure context: HTTPS or localhost. The
reason is that on plain HTTP a network attacker can inject scripts into the
page, and an injected script with camera access could silently record you.

Practical consequences for Morgan:

- `npm run dev` on the laptop works, because localhost counts as secure
- The Vercel URL works on the phone, because Vercel serves HTTPS
- Opening the laptop's LAN IP (`http://192.168.x.x`) from the phone does NOT
  work: it is neither localhost nor HTTPS, so the camera call is refused

## Constraints

getUserMedia takes constraints, which are preferences rather than commands.
`{ ideal: value }` means "give me the closest thing the hardware supports".

- `facingMode: "environment"` requests the rear camera ("user" is the selfie
  camera). Morgan wants rear, since the phone is propped up facing the lifter.
- `width` / `height` ideals request a resolution; the browser picks the
  nearest supported mode.

## iOS: playsinline

On iOS a playing `<video>` goes fullscreen by default, which would cover the
overlay. The `playsinline` attribute keeps it embedded in the page. Forgetting
it is the classic "camera app broken on iPhone" bug.

## Why a start button

Morgan starts the camera from a tap rather than on page load. Mobile browsers
are more permissive about camera and audio when triggered by a user gesture,
the permission prompt has an obvious cause the user just tapped, and the
form-break beep we add later requires a gesture to unlock audio anyway. One
tap unlocks everything.
