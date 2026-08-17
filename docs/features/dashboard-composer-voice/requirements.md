# Dashboard Composer — Real Voice + Rail Fixes — Requirements

**Type:** Improvement / Feature (mixed — see scope split below)
**Status:** In Review
**Priority:** Medium
**Last Updated:** 2026-08-15

## Problem Statement

The chat-first Dashboard redesign (`src/pages/dashboard/DashboardHome.tsx`, shipped to `main` across
commits `4d70dd3`, `28d7384`, `47518c8`) ported Imori's `AgentChat.tsx` composer layout visually but
left three things unfinished:

1. **Dictation and voice chat are fake.** The mic ("Dictation") and waveform ("Voice chat") buttons in
   the composer are permanently-disabled stubs (`ComposerStub`, `EventDetails.tsx` lines ~106-127) with
   a tooltip reading "not available yet." Imori (`imori-webapp`) has both of these fully wired and
   working: dictation via `lib/transcription/` (browser Web Speech API + OpenAI Whisper fallback) and
   full voice conversation via ElevenLabs Conversational AI (`lib/hooks/use-voice-conversation.ts`,
   `components/voice/VoiceCompanionPanel.tsx`, `app/api/voice/*`). This work should reuse that existing,
   working implementation rather than build a new voice pipeline from scratch.
2. **Right rail collapse state is inconsistent with the left nav.** The rail's open/closed state
   persists independently in `localStorage` (`namos-dashboard-right-collapsed`), separate from
   whatever governs the left nav's default. A browser that had the rail toggled closed once (e.g.
   during testing) keeps it closed on every future load, while the left nav stays open — reads as
   broken/inconsistent chrome, not a deliberate per-user preference.
3. **"Action items" rail section disappears with no empty state.** It only renders when
   `actionItems.length > 0` (`DashboardHome.tsx` line 354). On an event with zero pending abstracts,
   zero unscheduled accepted talks, and zero speakers needing onboarding, the whole section vanishes —
   no "nothing needs attention right now" message. Reads as missing/broken, not intentionally quiet.

## Scope Split

This is one issue, two kinds of work:
- **Feature** — port real dictation + voice chat from Imori (items 1)
- **Improvement** — fix rail-state consistency and add the Action items empty state (items 2, 3)

Grouped together because all three live in the same composer/rail region of `DashboardHome.tsx` and
came out of the same redesign pass — not because they're technically related.

## User Stories

**As an** organizer using the dashboard chat **I want to** dictate my question instead of typing
**so that** I can work hands-free while reviewing physical event materials or multitasking.

**Acceptance Criteria:**
- GIVEN the dashboard composer WHEN I click the Dictation (mic) button THEN the browser requests mic
  permission (first time) and my speech is transcribed into the composer text field in real time
- GIVEN dictation is unsupported in the current browser WHEN I look at the mic button THEN it is
  disabled with a tooltip explaining why (not silently broken)

**As an** organizer **I want to** talk to the Operations Agent in a full voice conversation
**so that** I can get quick answers without typing at all.

**Acceptance Criteria:**
- GIVEN the dashboard composer WHEN I click the Voice chat button THEN a voice session starts, I can
  speak, and the agent responds with synthesized speech, with a live transcript shown
- GIVEN the voice session is active WHEN I click stop/close THEN the session ends cleanly and the
  transcript (if any) is available in chat history

**As an** organizer **I want to** see the right rail (Quick access / Action items) open by default
**so that** I don't think a redesign broke navigation on first load.

**Acceptance Criteria:**
- GIVEN a browser with no prior rail preference stored WHEN the dashboard loads THEN the rail is open,
  matching the left nav's default-open behavior
- GIVEN an event with zero action items WHEN I view the rail THEN the "Action items" section still
  shows, with a quiet empty state instead of disappearing

## Functional Requirements
- FR-001: Port Imori's `lib/transcription/` dictation system (Web Speech API primary, OpenAI Whisper
  fallback) into the composer, replacing the disabled `ComposerStub` for Dictation
- FR-002: Port Imori's ElevenLabs Conversational AI voice chat (`use-voice-conversation.ts` +
  `VoiceCompanionPanel.tsx` pattern) into the composer, replacing the disabled `ComposerStub` for Voice
  chat, adapted to this app's Convex backend instead of Imori's Next.js API routes
- FR-003: Fix the right rail's default-open state to match the left nav when no prior preference is
  stored, and re-audit whether per-section collapse memory (`RailSection`'s own `storageKey`) should
  also be reset/reconsidered
- FR-004: Add a quiet empty state to the "Action items" `RailSection` when `actionItems.length === 0`
  ("Nothing needs your attention right now" or similar), instead of unmounting the section

## Non-Functional Requirements
- NFR-001: Dictation must not require any new paid API dependency beyond what's already configured
  (OpenAI is already wired for the Operations Agent in `convex/agentRuntime.ts` — reuse rather than
  duplicate credentials)
- NFR-002: Voice chat requires a genuinely new external dependency (ElevenLabs) — must fail gracefully
  (button disabled, clear tooltip) if `ELEVENLABS_API_KEY`/`ELEVENLABS_AGENT_ID` aren't configured for
  this deployment, rather than crashing the dashboard
- NFR-003: Both features must work within the existing Clerk auth boundary — no anonymous voice/dictation access

## Out of Scope
- Imori's voice-*profile* system (writing-style voice matching, `VoiceGuideSelect`, ElevenLabs voice
  cloning) — that's a writing-tool concept specific to Imori's drafts editor, not applicable here
- Any redesign of the Operations Agent's own reasoning/tool-calling — voice chat is a new *input/output
  channel* to the existing agent, not a new agent
- Persisting/replaying voice session audio recordings (Imori's `voiceRecordings.ts` / retention system)
  — out of scope unless requested later
- Building a new dashboard tab/stat-grid layout — that's the older `docs/features/dashboard/plan.md`
  spec, already superseded by the shipped chat-first redesign; not being revisited here

## Success Metrics
- Dictation and voice chat both work end-to-end, verified live in browser, in the primary supported
  browser (Chrome)
- Zero silent failures — every disabled/unavailable state has a visible reason
- Rail defaults open for a fresh browser; empty Action items state never disappears the section
