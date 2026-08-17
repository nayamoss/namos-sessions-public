import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EventId } from "@/data/types";

const transcribeAction = vi.fn();
vi.mock("convex/react", () => ({ useAction: () => transcribeAction }));

const { useDictation } = await import("@/lib/voice/use-dictation");

const eventId = "event_1" as EventId;

class FakeRecorder {
  static instances: FakeRecorder[] = [];
  state: "inactive" | "recording" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  private listeners: Record<string, (() => void)[]> = {};

  constructor(public stream: FakeStream) { FakeRecorder.instances.push(this); }

  addEventListener(type: string, handler: () => void) {
    (this.listeners[type] ??= []).push(handler);
  }

  start() { this.state = "recording"; }

  stop() {
    this.state = "inactive";
    this.listeners.stop?.forEach((handler) => handler());
  }

  /** Feeds a chunk the way a live recorder would. */
  emitAudio(bytes = 8) {
    this.ondataavailable?.({ data: new Blob([new Uint8Array(bytes)], { type: this.mimeType }) });
  }
}

class FakeRecognition {
  static instances: FakeRecognition[] = [];
  continuous = false;
  interimResults = false;
  lang = "";
  stopped = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor() { FakeRecognition.instances.push(this); }
  start() {}
  stop() { this.stopped = true; }

  emit(chunks: { text: string; isFinal: boolean }[]) {
    this.onresult?.({
      resultIndex: 0,
      results: Object.assign(
        chunks.map((chunk) => ({ 0: { transcript: chunk.text }, isFinal: chunk.isFinal })),
        { length: chunks.length },
      ),
    });
  }
}

class FakeTrack { stopped = false; stop() { this.stopped = true; } }
class FakeStream {
  tracks = [new FakeTrack()];
  getTracks() { return this.tracks; }
}

let stream: FakeStream;
let getUserMedia: ReturnType<typeof vi.fn>;

function installBrowser({ mic = true, speech = true }: { mic?: boolean; speech?: boolean } = {}) {
  FakeRecorder.instances = [];
  FakeRecognition.instances = [];
  stream = new FakeStream();
  getUserMedia = vi.fn().mockResolvedValue(stream);

  if (mic) {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  } else {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
  }

  (window as unknown as { MediaRecorder?: unknown }).MediaRecorder = FakeRecorder;
  if (speech) (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = FakeRecognition;
  else delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
}

beforeEach(() => {
  transcribeAction.mockReset();
  transcribeAction.mockResolvedValue({ text: "transcribed from whisper", provider: "openai" });
});

afterEach(() => {
  delete (window as unknown as { MediaRecorder?: unknown }).MediaRecorder;
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
});

describe("useDictation", () => {
  it("reports unsupported when the browser cannot reach a microphone", async () => {
    installBrowser({ mic: false });
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn(), onError }));

    expect(result.current.isSupported).toBe(false);
    await act(async () => { await result.current.start(); });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/cannot access a microphone/i));
    expect(result.current.isRecording).toBe(false);
  });

  it("records once the microphone is granted", async () => {
    installBrowser();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn() }));

    await act(async () => { await result.current.start(); });

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeRecorder.instances[0].state).toBe("recording");
    expect(result.current.isRecording).toBe(true);
  });

  it("explains a denied microphone and does not get stuck recording", async () => {
    installBrowser();
    getUserMedia.mockRejectedValue(Object.assign(new Error("denied"), { name: "NotAllowedError" }));
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn(), onError }));

    await act(async () => { await result.current.start(); });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/Microphone permission denied/i));
    expect(result.current.isRecording).toBe(false);
  });

  it("uses the browser transcript and never calls Whisper when recognition works", async () => {
    installBrowser();
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecognition.instances[0].emit([
      { text: "which speakers still owe me a headshot", isFinal: true },
    ]));
    await act(async () => { await result.current.stop(); });

    expect(onTranscript).toHaveBeenCalledWith("which speakers still owe me a headshot");
    expect(transcribeAction).not.toHaveBeenCalled();
  });

  it("shows interim speech as live feedback without committing it", async () => {
    installBrowser();
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecognition.instances[0].emit([{ text: "which speakers", isFinal: false }]));

    expect(result.current.error).toBe("Listening: which speakers");
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("falls back to Whisper when browser recognition fails mid-session", async () => {
    installBrowser();
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecognition.instances[0].onerror?.());
    act(() => FakeRecorder.instances[0].emitAudio());
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(transcribeAction).toHaveBeenCalledTimes(1));
    expect(transcribeAction.mock.calls[0][0]).toMatchObject({ eventId, mimeType: "audio/webm" });
    expect(onTranscript).toHaveBeenCalledWith("transcribed from whisper");
  });

  it("uses Whisper outright on a browser with no speech recognition", async () => {
    installBrowser({ speech: false });
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecorder.instances[0].emitAudio());
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith("transcribed from whisper"));
    expect(FakeRecognition.instances).toHaveLength(0);
  });

  it("says so when nothing was captured rather than sending empty audio", async () => {
    installBrowser({ speech: false });
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn(), onError }));

    await act(async () => { await result.current.start(); });
    await act(async () => { await result.current.stop(); });

    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/No audio was captured/i));
    expect(transcribeAction).not.toHaveBeenCalled();
  });

  it("says so when Whisper hears nothing", async () => {
    installBrowser({ speech: false });
    transcribeAction.mockResolvedValue({ text: "   ", provider: "openai" });
    const onTranscript = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript, onError }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecorder.instances[0].emitAudio());
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.stringMatching(/No speech was detected/i)));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("surfaces a Whisper failure instead of failing silently", async () => {
    installBrowser({ speech: false });
    transcribeAction.mockRejectedValue(new Error("Transcription service is down"));
    const onError = vi.fn();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn(), onError }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecorder.instances[0].emitAudio());
    await act(async () => { await result.current.stop(); });

    await waitFor(() => expect(onError).toHaveBeenCalledWith("Transcription service is down"));
    expect(result.current.isProcessing).toBe(false);
  });

  it("releases the microphone when the session ends", async () => {
    installBrowser();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn() }));

    await act(async () => { await result.current.start(); });
    act(() => FakeRecognition.instances[0].emit([{ text: "done", isFinal: true }]));
    await act(async () => { await result.current.stop(); });

    expect(stream.tracks[0].stopped).toBe(true);
  });

  it("releases the microphone on unmount", async () => {
    installBrowser();
    const { result, unmount } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn() }));

    await act(async () => { await result.current.start(); });
    unmount();

    expect(stream.tracks[0].stopped).toBe(true);
  });

  it("ignores stop when nothing is recording", async () => {
    installBrowser();
    const { result } = renderHook(() => useDictation({ eventId, onTranscript: vi.fn() }));

    await act(async () => { await result.current.stop(); });

    expect(transcribeAction).not.toHaveBeenCalled();
  });
});
