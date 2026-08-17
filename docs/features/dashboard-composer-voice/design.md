# Dashboard Composer — Real Voice + Rail Fixes — Technical Design

## Database / Schema Changes

### Current Schema (affected tables)
No new tables strictly required. Existing `agent_runs` (Convex table backing
`convex/agentRuns.ts`/`agentRuntime.ts`) already stores the Operations Agent's turns and is reused as
the "brain" for both dictated text and voice-chat turns (see Technical Decisions).

### Required Changes
| Table | Action | Column/Index | Type | Notes |
|-------|--------|--------------|------|-------|
| (none required for MVP) | — | — | — | Voice session metadata can live in Convex/React state only for v1; persistence is out of scope per requirements.md |

### Migration
N/A — no schema migration needed for the MVP scope defined here.

---

## Backend / API

### Affected Existing Endpoints
| Method | Path | Change |
|--------|------|--------|
| (Convex mutation) | `agentRuns.create` / `agentRuns.respond` | Reused as-is — both dictated and voice-transcribed text submit through the existing flow, unchanged |

### New Endpoints (Convex actions, not REST — this app is Convex-backed, not Next.js API routes like Imori)
| Type | Name | Request | Response |
|------|------|---------|----------|
| `action` | `voice.transcribe` | `{ audio: Blob/ArrayBuffer, mimeType: string }` | `{ text: string, provider: "openai" }` |
| `action` | `voice.createSession` | `{ eventId: EventId }` | `{ signedUrl: string, agentId: string } \| { unavailable: true, reason: string }` |
| `httpAction` | `voice/tool-call` (optional, Phase 2) | ElevenLabs webhook payload | Routes a mid-call tool request to the existing guarded Operations Agent tools |

### Validation & Business Logic
- `voice.transcribe`: server-side fallback only (mirrors Imori's `lib/transcription/` — browser
  `SpeechRecognition` is tried client-side first, free; this action is the Whisper fallback). Reuses
  the OpenAI key already configured for `convex/agentRuntime.ts` — **do not** introduce a second
  OpenAI credential path.
- `voice.createSession`: requires `ELEVENLABS_API_KEY` + `ELEVENLABS_AGENT_ID` env vars (new to this
  app, do not exist yet — Naya must provision an ElevenLabs Conversational AI agent and add these to
  the Convex deployment env, same as any other secret). If unset, returns `{ unavailable: true }` — the
  client renders a disabled button with a clear tooltip, never a crash.
- Both actions run behind the same Clerk-authenticated boundary as every other Convex action in this
  app — no anonymous access (`requireIdentity`-equivalent guard).

---

## Frontend Components

### Modified Components
| File Path | Change |
|-----------|--------|
| `src/pages/dashboard/DashboardHome.tsx` | Replace the two `ComposerStub` calls (Dictation, Voice chat) with real wired buttons; fix `railCollapsed` default-state logic; add empty state to the "Action items" `RailSection` |

### New Components
**`useDictation`** (hook)
- File: `src/lib/voice/use-dictation.ts`
- Ported from Imori's `lib/transcription/react-hooks.ts` (`useTranscription`) — adapt provider calls
  from Next.js `fetch('/api/ai/process')` to Convex's `voice.transcribe` action
- Returns: `{ isRecording: boolean, isSupported: boolean, start: () => void, stop: () => void, error: string | null }`
- Behavior: `start()` requests mic permission, prefers browser `SpeechRecognition` if
  `isBrowserSpeechSupported()`, else records via `MediaRecorder` and calls `voice.transcribe` on stop;
  transcript text is appended into the composer's existing `value` state via a callback, not a new
  input

**`VoiceChatButton` + `VoiceSessionPanel`**
- Files: `src/components/voice/VoiceChatButton.tsx`, `src/components/voice/VoiceSessionPanel.tsx`
- Ported from Imori's `components/voice/VoiceCompanionButton`-equivalent +
  `components/voice/VoiceCompanionPanel.tsx`, trimmed to the "voice conversation with the Operations
  Agent" use case only — no writing-voice-profile UI, no draft-creation flow
- Props (`VoiceSessionPanel`): `{ eventId: EventId, onClose: () => void }`
- Location: Dashboard composer row, replaces the `AudioLines` `ComposerStub`; opens as an overlay panel
  (not a `position: fixed` modal over content — same flex-sibling pattern as this app's existing detail
  panels) when the button is clicked
- Elements:
  - Voice orb / status indicator (idle / connecting / listening / speaking) — can reuse Imori's simpler
    orb visual, not the full `voice-orb-variations` mockup set
  - Live transcript list (same turn shape as `AgentTimeline`, reuse that component for rendering)
  - Mute toggle button
  - Stop/close button
  - Error state: inline text if `ELEVENLABS_API_KEY` missing or connection fails — "Voice chat isn't
    configured for this event yet" vs "Connection lost — try again"
- Behavior: clicking the composer's Voice chat button calls `voice.createSession`; on success, opens
  `useConversation` (from `@elevenlabs/react`, new dependency) with the signed URL; user speech is
  transcribed by ElevenLabs and forwarded turn-by-turn into `agentRuns.respond`/`agentRuns.create`
  (see Technical Decisions) rather than a separate LLM; agent's text reply is sent back through
  ElevenLabs TTS for playback
- Third-party: `@elevenlabs/react` (new dependency, same package Imori uses) — mount point is the
  `VoiceSessionPanel` component only

**Composer button wiring**
- `DashboardHome.tsx`'s `<ComposerStub icon={Mic} label="Dictation" />` → real button bound to
  `useDictation`, spinner/pulsing icon while recording, disabled with tooltip only if
  `!isSupported`
- `<ComposerStub icon={AudioLines} label="Voice chat" />` → real button bound to `VoiceChatButton`,
  disabled with tooltip only if `voice.createSession` reports `unavailable`

---

## State / Data Flow
- **Dictation:** mic audio → browser `SpeechRecognition` (preferred, client-only) OR `MediaRecorder` →
  `voice.transcribe` Convex action → OpenAI Whisper → text → appended into the existing composer
  `value` state (`DashboardHome.tsx`'s `useState("")` for the textarea) → submitted through the
  existing `submit()` flow, completely unchanged
- **Voice chat:** mic audio → ElevenLabs Conversational AI (STT + turn detection, client-side via
  `@elevenlabs/react`) → transcribed user turn → this app's `agentRuns.create`/`agentRuns.respond`
  (the SAME guarded Operations Agent used by typed chat) → agent's text reply → sent back to
  ElevenLabs for TTS playback. ElevenLabs never talks to a second, separate LLM — it's audio I/O only
  around the existing agent
- Rail state: `railCollapsed` read from `localStorage` on mount; **default becomes `open` when the key
  has never been set**, only respecting a stored `"true"` if the user actually toggled it before

## Auth / Permissions
- Who can access: same as the rest of the Operations Agent — gated by `agentRuns.canUse` (existing
  Clerk-authenticated organizer/reviewer check), no new permission tier
- Backend: `voice.transcribe` and `voice.createSession` both require an authenticated Convex identity,
  same pattern as every other action in `convex/agentRuns.ts`
- Frontend: buttons simply don't render as usable (disabled) if `access.data` is false, matching how
  the rest of the composer already gates on `access.data`

## Edge Cases & Error States
- Browser doesn't support `SpeechRecognition` (e.g. Firefox) → dictation falls back to
  `MediaRecorder` + Whisper automatically; only disable the button if `getUserMedia` itself is
  unavailable (insecure context / no mic hardware)
- Mic permission denied → inline error text near the composer, not just a browser-native permission
  toast that can be missed (this was the actual root cause in Imori's own
  `docs/features/dictation-not-working/` bug — the fix here should not repeat that mistake: verify the
  denied-permission error path actually surfaces to the user before calling this done)
- `ELEVENLABS_API_KEY`/`ELEVENLABS_AGENT_ID` not configured → Voice chat button disabled, tooltip
  explains it's not set up for this event/deployment yet — never a runtime crash
- ElevenLabs session drops mid-conversation → `VoiceSessionPanel` shows a reconnect/error state, does
  not silently hang
- Rail: a browser with `namos-dashboard-right-collapsed` unset (new user) → rail open. A browser that
  explicitly closed it before → stays closed (respecting real intent, not resetting everyone)
- Action items empty state: render inside the existing `RailSection` container, same visual treatment
  as other empty states in this app (icon + short text, no CTA needed here since "nothing to do" has
  no action)

## Technical Decisions
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Voice chat "brain" | Route every voice turn through the existing `agent_runs` Operations Agent, not a second LLM inside ElevenLabs | The existing agent has carefully scoped tool access and a guardrailed system prompt (`agentRuntime.ts`). Letting ElevenLabs' own LLM (via `ELEVENLABS_CUSTOM_LLM_SECRET`) call tools directly would either duplicate that guardrail work or bypass it. Reusing the existing agent keeps one source of truth for what the agent is allowed to do, in voice or text. |
| Dictation transcription | Port Imori's `lib/transcription/` provider abstraction (browser-first, Whisper fallback) rather than always calling Whisper | Matches NFR-001 (no new required paid dependency) and is proven working code, not a new build |
| Voice chat dependency | New `@elevenlabs/react` package + new `ELEVENLABS_*` env vars, scoped to this app's own ElevenLabs agent (not Imori's) | Imori's ElevenLabs agent is configured for Imori's writing-assistant persona; this app needs its own agent configured for the Operations Agent's actual scope and tone |

## Dependencies
- **Requires:** Naya provisions a new ElevenLabs Conversational AI agent + API key for
  `namos-sessions-webapp` specifically, and adds `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID` to the
  Convex deployment env (dev first, then prod) — this cannot be done by an agent, it needs her
  ElevenLabs account
- **Enables:** closes out the chat-first dashboard redesign's last known gaps

## Risks & Mitigations
- **Risk:** Porting Imori's dictation hook verbatim carries over the same class of bug that produced
  `docs/features/dictation-not-working/` there. **Mitigation:** Phase 1 of plan.md requires live
  browser reproduction of the ported dictation flow before calling it done — not just "it compiled."
- **Risk:** ElevenLabs voice sessions cost money per minute. **Mitigation:** gate the button behind
  `access.data` (existing agent-access check) so it's not exposed to every signed-in user by default;
  document the cost consideration for Naya when she sets up the ElevenLabs agent.
