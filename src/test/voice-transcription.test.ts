import { afterEach, describe, expect, it } from "vitest";
import { isBrowserSpeechSupported, isMicrophoneSupported, microphoneErrorMessage } from "@/lib/voice/transcription";

afterEach(() => {
  delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
});

describe("isBrowserSpeechSupported", () => {
  it("is false when neither vendor exposes the API", () => {
    expect(isBrowserSpeechSupported()).toBe(false);
  });

  it("accepts the webkit-prefixed constructor Chrome and Safari ship", () => {
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = class {};
    expect(isBrowserSpeechSupported()).toBe(true);
  });

  it("accepts the unprefixed constructor", () => {
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition = class {};
    expect(isBrowserSpeechSupported()).toBe(true);
  });
});

describe("isMicrophoneSupported", () => {
  it("is false without getUserMedia", () => {
    expect(isMicrophoneSupported()).toBe(false);
  });

  it("is true once getUserMedia exists", () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: () => {} } });
    expect(isMicrophoneSupported()).toBe(true);
  });
});

describe("microphoneErrorMessage", () => {
  // Each branch has to name the fix, because "microphone error" tells an
  // organizer nothing about what to do next.
  it.each([
    ["NotAllowedError", /Allow microphone access/i],
    ["PermissionDeniedError", /Allow microphone access/i],
    ["NotFoundError", /No microphone was found/i],
    ["DevicesNotFoundError", /No microphone was found/i],
    ["NotReadableError", /used by another application/i],
    ["TrackStartError", /used by another application/i],
    ["SecurityError", /HTTPS or localhost/i],
  ])("explains %s in terms of the fix", (name, expected) => {
    expect(microphoneErrorMessage({ name })).toMatch(expected);
  });

  it("passes through an unrecognised message rather than swallowing it", () => {
    expect(microphoneErrorMessage({ message: "Something specific went wrong" }))
      .toBe("Something specific went wrong");
  });

  it("still says something for a completely unknown failure", () => {
    expect(microphoneErrorMessage(undefined)).toBe("Could not access your microphone.");
  });
});
