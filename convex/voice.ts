"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { assertEventOrganizerAction } from "./emailDelivery";

function requireOpenAIKey() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Transcription is temporarily unavailable because the managed OpenAI key is not configured.");
  return key;
}

export const transcribe = action({
  args: { eventId: v.id("events"), audioBase64: v.string(), mimeType: v.string() },
  handler: async (ctx, args) => {
    await assertEventOrganizerAction(ctx, args.eventId);
    const bytes = Buffer.from(args.audioBase64, "base64");
    if (!bytes.length) throw new Error("No audio was supplied for transcription.");
    if (bytes.length > 25 * 1024 * 1024) throw new Error("Dictation recordings must be smaller than 25 MB.");
    const form = new FormData();
    form.append("model", "whisper-1");
    form.append("file", new Blob([bytes], { type: args.mimeType || "audio/webm" }), "dictation.webm");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireOpenAIKey()}` },
      body: form,
    });
    const payload = await response.json().catch(() => ({})) as { text?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message || "Whisper could not transcribe this recording.");
    return { text: payload.text ?? "", provider: "openai" as const };
  },
});

export const createSession = action({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    await assertEventOrganizerAction(ctx, args.eventId);
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    if (!apiKey || !agentId) {
      return { unavailable: true as const, reason: "Voice chat is not configured for this deployment. An administrator must add ELEVENLABS_API_KEY and ELEVENLABS_AGENT_ID to the Convex environment." };
    }
    // ElevenLabs' get_signed_url endpoint is GET-only — confirmed directly
    // against the live API while wiring real credentials for the first time
    // (POST returns 405 "Method Not Allowed"). This code path was never
    // exercised before now: ELEVENLABS_API_KEY/ELEVENLABS_AGENT_ID were
    // unset on every deployment, so createSession always short-circuited to
    // the "not configured" branch above and never reached this fetch.
    const response = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
    const payload = await response.json().catch(() => ({})) as { signed_url?: string; detail?: { message?: string }; message?: string };
    if (!response.ok || !payload.signed_url) throw new Error(payload.detail?.message || payload.message || "Could not start a voice chat session.");

    // The signed URL above is enough for the web client, but not for the iOS app.
    // The ElevenLabs Swift SDK routes voice conversations over LiveKit WebRTC, and its
    // TokenService rejects signed WebSocket URLs outright — "Signed WebSocket URLs are
    // only supported for text-only conversations." Hands-free voice on iOS therefore
    // needs a conversation token from a different endpoint, which is what the SDK
    // would otherwise fetch itself using a raw API key it must never be shipped.
    //
    // Minting it here keeps ELEVENLABS_API_KEY server-side. Returned alongside
    // signedUrl rather than replacing it so the existing web client keeps working.
    const tokenResponse = await fetch(`https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`, {
      method: "GET",
      headers: { "xi-api-key": apiKey },
    });
    const tokenPayload = await tokenResponse.json().catch(() => ({})) as { token?: string; detail?: { message?: string }; message?: string };
    if (!tokenResponse.ok || !tokenPayload.token) {
      throw new Error(tokenPayload.detail?.message || tokenPayload.message || "Could not mint a voice conversation token.");
    }

    return { signedUrl: payload.signed_url, conversationToken: tokenPayload.token, agentId };
  },
});
