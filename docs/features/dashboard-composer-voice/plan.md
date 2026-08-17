# Dashboard Composer — Real Voice + Rail Fixes — Implementation Plan

## Phase 1: Rail Fixes (small, do first — no new dependencies)
- [x] T001: Fix `railCollapsed` default logic in `DashboardHome.tsx` — only respect a stored
  `"true"`/`"false"`; when `localStorage.getItem(RAIL_STORAGE_KEY)` is `null` (never set), default to
  open, matching the left nav
- [x] T002: Add an empty state to the "Action items" `RailSection` — when `actionItems.length === 0`,
  render the section (don't unmount it) with a quiet "Nothing needs your attention right now" message
- [x] T003: Browser-verify both fixes: a browser with no prior rail preference shows the rail open by
  default; an event with zero action items shows the empty state, not a missing section

## Phase 2: Dictation Port
- [x] T004: Read Imori's `lib/transcription/index.ts`, `lib/transcription/react-hooks.ts` in full —
  confirm the current (post-#612) working version, not the version that had the bug tracked in
  `docs/features/dictation-not-working/`
- [x] T005: Port the transcription provider abstraction into `src/lib/voice/transcription.ts` (browser
  `SpeechRecognition` + Whisper fallback logic), adapted to remove Imori-specific imports
- [x] T006: Add Convex action `voice.transcribe` (new file `convex/voice.ts`) wrapping OpenAI Whisper,
  reusing the OpenAI credential already configured in `convex/agentRuntime.ts` — do not add a second key
- [x] T007: Build `useDictation` hook (`src/lib/voice/use-dictation.ts`) per design.md
- [x] T008: Wire `DashboardHome.tsx`'s Dictation `ComposerStub` to the real hook — transcribed text
  appends into the existing composer `value` state
- [ ] T009: Browser-verify: click mic, speak, confirm transcribed text lands in the composer, in the
  primary supported browser (Chrome). Explicitly test the mic-permission-denied path and confirm the
  error is visibly surfaced (this was the actual root cause of Imori's own dictation bug — don't skip)

## Phase 3: Voice Chat Port
- [x] T010: Read Imori's `lib/hooks/use-voice-conversation.ts`, `components/voice/VoiceCompanionPanel.tsx`,
  `app/api/voice/session/route.ts` in full
- [x] T011: Add Convex action `voice.createSession` (in `convex/voice.ts`) that returns an ElevenLabs
  signed URL/session using `ELEVENLABS_API_KEY`/`ELEVENLABS_AGENT_ID`, or `{ unavailable: true, reason }`
  if unset
- [ ] T012: Build `VoiceChatButton` + `VoiceSessionPanel` components per design.md, using
  `@elevenlabs/react`'s `useConversation` — route every turn through `agentRuns.create`/`respond`
  rather than a second LLM (see design.md Technical Decisions)
- [x] T013: Wire `DashboardHome.tsx`'s Voice chat `ComposerStub` to the real button
- [ ] T014: **Blocked on Naya:** she provisions an ElevenLabs Conversational AI agent + API key for this
  app and adds `ELEVENLABS_API_KEY`/`ELEVENLABS_AGENT_ID` to the dev Convex deployment env — cannot
  proceed to live verification without this
- [ ] T015: Browser-verify: click Voice chat, speak a question, confirm the Operations Agent responds
  with synthesized speech and a live transcript; verify mute, stop/close, and the reconnect/error state
  when the connection drops

## Phase 4: Frontend UI Verification Pass (required — never skip)

### UI Spec
- **Location:** Dashboard composer row (`DashboardHome.tsx`), bottom-right icon group, replacing the
  two existing `ComposerStub` placeholders
- **Elements:**
  - Dictation button: mic icon, pulses/animates while recording, disabled + tooltip only if
    `getUserMedia` truly unavailable
  - Voice chat button: waveform icon, opens `VoiceSessionPanel` on click, disabled + tooltip if
    ElevenLabs isn't configured
  - `VoiceSessionPanel`: status indicator, live transcript (reusing `AgentTimeline`), mute toggle,
    stop/close button, inline error state
  - Right rail: opens by default for new browsers; "Action items" section always visible, with empty
    state text when there's nothing to show
- **Behavior:** see Phase 2/3 tasks above
- **Data:** dictation → composer text state → existing `submit()`. Voice chat → `agentRuns`
  create/respond, same as typed chat

### Tasks
- [ ] T016: Full click-through of all four changes (rail default, action-items empty state, dictation,
  voice chat) in a real browser, on an event with zero action items AND an event with some, to see
  both rail states
- [ ] T017: Confirm no regressions to the existing typed-chat flow (Operations Agent still works exactly
  as before for users who never touch voice/dictation)

## Task Dependencies
- Phase 1 has no dependencies, can ship independently and immediately
- Phase 2 depends on nothing external — can ship as soon as built and verified
- Phase 3 (T014 onward) is blocked on Naya provisioning ElevenLabs credentials — Phases 1 and 2 should
  not wait on this

## Verification Checklist
- [ ] All acceptance criteria in requirements.md met
- [ ] Rail and dictation fixes are live-browser-verified independently of voice chat (don't block on
  ElevenLabs setup)
- [ ] Voice chat live-browser-verified once ElevenLabs credentials exist
- [ ] No regressions to the existing typed Operations Agent chat
- [ ] Docs updated: mark this plan's checkboxes as work lands
