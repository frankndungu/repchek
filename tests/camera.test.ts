import { afterEach, describe, expect, it, vi } from "vitest";
import { startCamera } from "../src/camera";

function fakeStream(stopTrack = vi.fn()): MediaStream {
  return {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("startCamera", () => {
  it("stops its acquired stream on playback rejection without clearing another owner's source", async () => {
    const stopTrack = vi.fn();
    const stream = fakeStream(stopTrack);
    const otherStream = fakeStream();
    const error = new Error("playback rejected");
    let rejectPlay!: (reason: Error) => void;
    const video = {
      srcObject: null as MediaProvider | null,
      play: vi.fn(
        () =>
          new Promise<void>((_resolve, reject) => {
            rejectPlay = reject;
          }),
      ),
    } as unknown as HTMLVideoElement;
    vi.stubGlobal("navigator", {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });

    const starting = startCamera(video);
    await vi.waitFor(() => expect(video.srcObject).toBe(stream));
    video.srcObject = otherStream;
    rejectPlay(error);

    await expect(starting).rejects.toBe(error);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(video.srcObject).toBe(otherStream);
  });
});
