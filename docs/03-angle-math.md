# Angle math

How Morgan turns landmark coordinates into joint angles. This is stage 2 of
the pipeline (`src/engine/angles.ts`) and the foundation every form rule
stands on.

## Three points make an angle

Every joint angle is defined by three landmarks: the joint itself (the
vertex) and its two neighbors. Knee angle is hip, knee, ankle. Elbow angle is
shoulder, elbow, wrist. The angle always lives at the vertex.

## atan2

`Math.atan2(y, x)` returns the direction of a vector from the origin, as an
angle from -180 to 180 degrees (in radians, converted with 180 / PI). Unlike
plain `atan`, it takes y and x separately, so it knows the full direction of
a line rather than just its slope.

The recipe for the angle at vertex B between points A and C:

1. Direction from B to A: `atan2(A.y - B.y, A.x - B.x)`
2. Direction from B to C: `atan2(C.y - B.y, C.x - B.x)`
3. The joint angle is the difference between the two directions

The difference can be negative or above 180 (there are two ways around a
circle), so we take the absolute value and fold anything above 180 back down.
A knee bent at 90 degrees is 90 degrees whichever side you measure from.

## Why normalized coordinates are fine

Landmarks are fractions of the frame (0 to 1), not pixels. Angles do not care
about scale, only about direction, so the math works directly on normalized
values. No conversion needed.

## The six angles

`computeJointAngles` produces left and right knee, hip and elbow angles per
frame, using the named `LANDMARK` indices. Straight joint reads near 180,
right angle reads 90, fully folded reads near 0.

## Verifying the math

`angleAt` is a pure function (same input, same output, no side effects), which
makes it trivial to test on cases with known answers. Three vertical points
should give 180, a right angle should give 90, and two neighbors in the same
direction should give 0. Run before trusting the function inside the app.

## Labels on a mirrored canvas

The overlay canvas is flipped with CSS when the camera is user-facing (see
docs/01-camera.md). Lines and dots do not care, but text drawn on a flipped
canvas renders backwards. `drawLabel` cancels this by applying
`ctx.scale(-1, 1)` while drawing each label, bracketed with `save` and
`restore` so the flip never leaks into other drawing calls.
