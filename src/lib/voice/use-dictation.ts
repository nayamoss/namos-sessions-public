import { useCallback, useEffect, useRef, useState } from "react";
import { makeFunctionReference } from "convex/server";
import { useAction } from "convex/react";
import type { EventId } from "@/data/types";
import { isBrowserSpeechSupported, isMicrophoneSupported, microphoneErrorMessage } from "./transcription";

const transcribe = makeFunctionReference<"action", { eventId: string; audioBase64: string; mimeType: string }, { text: string; provider: "openai" }>("voice:transcribe");

type RecognitionEvent = { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> };
type BrowserRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let output = "";
  for (const byte of bytes) output += String.fromCharCode(byte);
  return btoa(output);
}

export function useDictation({ eventId, onTranscript, onError }: { eventId: EventId; onTranscript: (text: string) => void; onError?: (message: string) => void }) {
  const transcribeAudio = useAction(transcribe);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveTextRef = useRef("");
  const browserFailedRef = useRef(false);

  useEffect(() => setIsSupported(isMicrophoneSupported()), []);

  const report = useCallback((message: string) => {
    setError(message);
    onError?.(message);
  }, [onError]);

  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    recognitionRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!isMicrophoneSupported()) {
      report("Dictation is unavailable because this browser cannot access a microphone.");
      return;
    }
    setError(null);
    browserFailedRef.current = false;
    liveTextRef.current = "";
    chunksRef.current = [];
    try {
      // This must remain the first awaited browser API: it preserves the click’s user gesture.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.start();

      if (isBrowserSpeechSupported()) {
        const browser = window as typeof window & { SpeechRecognition?: new () => BrowserRecognition; webkitSpeechRecognition?: new () => BrowserRecognition };
        const Recognition = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
        const recognition = new Recognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";
        recognition.onresult = (event) => {
          let finalText = "";
          let interimText = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const text = event.results[index][0].transcript;
            if (event.results[index].isFinal) finalText += `${text} `;
            else interimText += text;
          }
          liveTextRef.current += finalText;
          // Give real-time feedback without committing partial recognition into the composer.
          setError(interimText ? `Listening: ${interimText}` : null);
        };
        recognition.onerror = () => {
          // Keep recording and use the complete recording with Whisper on stop.
          browserFailedRef.current = true;
          setError("Browser speech recognition was unavailable. We’ll use Whisper when you stop dictation.");
        };
        recognitionRef.current = recognition;
        recognition.start();
      }
      setIsRecording(true);
    } catch (cause) {
      cleanup();
      report(microphoneErrorMessage(cause));
    }
  }, [cleanup, report]);

  const stop = useCallback(async () => {
    if (!isRecording) return;
    setIsRecording(false);
    const recognition = recognitionRef.current;
    const recorder = recorderRef.current;
    try { recognition?.stop(); } catch { /* already stopped */ }
    const useWhisper = !isBrowserSpeechSupported() || browserFailedRef.current;
    if (recorder?.state === "recording") {
      await new Promise<void>((resolve) => {
        recorder.addEventListener("stop", () => resolve(), { once: true });
        recorder.stop();
      });
    }
    cleanup();
    const browserText = liveTextRef.current.trim();
    if (!useWhisper && browserText) {
      onTranscript(browserText);
      setError(null);
      return;
    }
    setIsProcessing(true);
    try {
      const blob = new Blob(chunksRef.current, { type: recorder?.mimeType || "audio/webm" });
      if (!blob.size) throw new Error("No audio was captured. Please try again.");
      const result = await transcribeAudio({ eventId, audioBase64: base64(await blob.arrayBuffer()), mimeType: blob.type });
      if (!result.text.trim()) {
        report("No speech was detected. Please try again.");
      } else {
        onTranscript(result.text.trim());
        setError(null);
      }
    } catch (cause) {
      report(cause instanceof Error ? cause.message : "Transcription failed. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [cleanup, eventId, isRecording, onTranscript, report, transcribeAudio]);

  useEffect(() => () => cleanup(), [cleanup]);
  return { isRecording, isProcessing, isSupported, error, start, stop };
}
