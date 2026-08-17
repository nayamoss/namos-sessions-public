export function isBrowserSpeechSupported() {
  if (typeof window === "undefined") return false;
  const browser = window as typeof window & { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(browser.SpeechRecognition || browser.webkitSpeechRecognition);
}

export function isMicrophoneSupported() {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);
}

export function microphoneErrorMessage(cause: unknown) {
  const error = cause as { name?: string; message?: string };
  if (error?.name === "NotAllowedError" || error?.name === "PermissionDeniedError") {
    return "Microphone permission denied. Allow microphone access in your browser’s address bar, then try again.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") return "No microphone was found. Connect a microphone and try again.";
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") return "Your microphone is being used by another application. Close that app and try again.";
  if (error?.name === "SecurityError") return "Microphone access is blocked by browser security. Use HTTPS or localhost.";
  return error?.message || "Could not access your microphone.";
}
