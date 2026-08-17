# CFP form builder review

## Executive finding

The complaint is best explained by a category error in the current product: **the organizer is using a multi-step settings wizard, but is not building the steps of the form.**

The seven items in the organizer's left rail are fixed configuration categories (`Submission setup`, `Welcome screen`, `Abstract information`, and so on), not organizer-created public pages ([`SubmissionFormBuilder.tsx:104`](../../../src/pages/program/SubmissionFormBuilder.tsx#L104)). The public form separately has five fixed application stages declared in code (`Welcome`, `Account`, `Submission`, `Participant`, `Review`) ([`SubmissionPage.tsx:18`](../../../src/pages/public/SubmissionPage.tsx#L18)). An organizer cannot add, rename, remove, or reorder those public stages, split proposal questions across multiple pages, or see the unsaved public result while editing.

That is why saying "it already uses `WizardShell`" does not answer the owner's complaint. The shell makes the **configuration process** multi-step. It does not make this a **multi-step form builder** in the usual product sense.

Confidence: **high that this is the primary mismatch; medium on the exact desired replacement UI.** The necessary fix crosses the form schema, builder, public renderer, validation, and migration behavior, so this review intentionally does not implement it without owner confirmation.

## What exists today

### Organizer-facing builder

The organizer gets a fixed seven-screen wizard:

1. Submission setup: choose abstract/session and whether participants are collected.
2. Welcome screen: internal name, public title, short page heading, and welcome copy.
3. Abstract information: edit one hard-coded proposal section and all of its questions.
4. Participant information: edit one hard-coded participant section, roles, and all participant questions.
5. Routing: route submissions based on dropdown/multiselect answers.
6. Form settings: close date, limits, post-submit behavior, and cross-field validation.
7. Notifications.

The screens are selected from a constant array, and `activeStep` is only local navigation state ([`SubmissionFormBuilder.tsx:104`](../../../src/pages/program/SubmissionFormBuilder.tsx#L104), [`SubmissionFormBuilder.tsx:559`](../../../src/pages/program/SubmissionFormBuilder.tsx#L559)). `WizardShell` renders a clickable left rail and Back/Next buttons, but its checkmarks mean only "this item is before the currently selected index"—not validated, saved, or complete. Any step is directly clickable and there is no per-step validation gate ([`WizardShell.tsx:7`](../../../src/components/shared/WizardShell.tsx#L7)). This falls short of the original plan's explicit "validation gating, save-per-step" requirement ([`docs/features/submission-form-builder/plan.md:120`](../submission-form-builder/plan.md#L120)).

The question editing experience is a long, fully expanded list. Each row contains label, type, required state, maximum length, options when relevant, and conditional visibility controls ([`SubmissionFormBuilder.tsx:265`](../../../src/pages/program/SubmissionFormBuilder.tsx#L265), [`SubmissionFormBuilder.tsx:374`](../../../src/pages/program/SubmissionFormBuilder.tsx#L374), [`SubmissionFormBuilder.tsx:421`](../../../src/pages/program/SubmissionFormBuilder.tsx#L421)). With the defaults, the abstract screen starts with six expanded fields and the participant screen with five.

Conditional visibility exists, but only against an already-persisted dropdown sibling with options. The UI explicitly tells the organizer to save first before a new dropdown can become a condition source ([`SubmissionFormBuilder.tsx:267`](../../../src/pages/program/SubmissionFormBuilder.tsx#L267), [`SubmissionFormBuilder.tsx:423`](../../../src/pages/program/SubmissionFormBuilder.tsx#L423)). This makes configuration depend on remembering a save/revisit sequence.

The visible grip icon is not functional. It is rendered as a decorative `GripVertical` with no drag attributes, keyboard reorder controls, or reorder handler ([`SubmissionFormBuilder.tsx:281`](../../../src/pages/program/SubmissionFormBuilder.tsx#L281)). The saved section order is taken directly from the field arrays, so the data flow could preserve reordering if the UI supplied it ([`SubmissionFormBuilder.tsx:857`](../../../src/pages/program/SubmissionFormBuilder.tsx#L857)). The original verification checklist says locked fields must be reorderable ([`docs/features/submission-form-builder/plan.md:129`](../submission-form-builder/plan.md#L129)).

There is no live preview. `View form` is a normal route link and both it and `Copy link` are disabled until the form has an ID, so a new form must be saved before the organizer can leave the builder to inspect the public page ([`SubmissionFormBuilder.tsx:611`](../../../src/pages/program/SubmissionFormBuilder.tsx#L611), [`SubmissionFormBuilder.tsx:932`](../../../src/pages/program/SubmissionFormBuilder.tsx#L932)). Unsaved edits cannot be previewed in context.

### Public-facing result

The public form is genuinely paginated, but its pagination is application-owned rather than builder-owned:

- The five stage names are a hard-coded constant ([`SubmissionPage.tsx:18`](../../../src/pages/public/SubmissionPage.tsx#L18)).
- Proposal fields are read from the first section whose key is `abstract`; participant fields are read from the first section whose key is `participant` ([`SubmissionPage.tsx:28`](../../../src/pages/public/SubmissionPage.tsx#L28)).
- The public render branches explicitly on numeric steps 0–4 rather than iterating organizer-defined pages ([`SubmissionPage.tsx:159`](../../../src/pages/public/SubmissionPage.tsx#L159)).
- Progress, validation, Back/Continue, and Review are real and work at those fixed boundaries ([`SubmissionPage.tsx:104`](../../../src/pages/public/SubmissionPage.tsx#L104), [`SubmissionPage.tsx:173`](../../../src/pages/public/SubmissionPage.tsx#L173)).

The storage contract confirms the limitation. Section keys are restricted to `abstract`, `participant`, or `portal` ([`src/data/types.ts:33`](../../../src/data/types.ts#L33), [`convex/schema.ts:80`](../../../convex/schema.ts#L80)). The submission builder always saves exactly two sections ([`SubmissionFormBuilder.tsx:857`](../../../src/pages/program/SubmissionFormBuilder.tsx#L857)). This is not a missing button on top of an already-flexible model; arbitrary public pages require a deliberate model change.

### Other form-builder surfaces in this repo

There are two organizer form builders, not one:

- `SubmissionForms.tsx` is the CFP form list/template entry point and routes into the reviewed builder; it is not a second CFP editor ([`SubmissionForms.tsx:95`](../../../src/pages/program/SubmissionForms.tsx#L95)).
- `PortalForms.tsx` is a separate post-acceptance form builder. It also uses `WizardShell`, but its three screens configure one hard-coded `portal` section ([`PortalForms.tsx:237`](../../../src/pages/portal/PortalForms.tsx#L237), [`PortalForms.tsx:492`](../../../src/pages/portal/PortalForms.tsx#L492)). It therefore has the same conceptual issue: a multi-screen editor that produces a single-section form.

This means the owner could be referring to either builder in conversation, but the complaint applies materially to both. Fixing only the CFP builder's visual stepper would leave the product-wide model inconsistent.

## Sibling-project comparison

### Clockwork

The currently mounted Clockwork project does not contain the older `src/pages/FormBuilder.tsx` named in this repo's reuse audit. Its current `Forms.tsx` is a basic, single-dialog field list with no public-page model, preview, or reordering ([`clockwork/src/pages/Forms.tsx:29`](/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/Forms.tsx#L29), [`clockwork/src/pages/Forms.tsx:67`](/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/Forms.tsx#L67)). It is not a model to copy.

Clockwork does, however, show the semantic difference between "a wizard" and "a builder of steps." Its onboarding workflow builder stores `steps` as user-created domain data, exposes `Add step`, edits each step's title/type/reference, and later renders progress from that saved array ([`OnboardingWorkflows.tsx:13`](/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/OnboardingWorkflows.tsx#L13), [`OnboardingWorkflows.tsx:28`](/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/OnboardingWorkflows.tsx#L28), [`OnboardingWorkflows.tsx:58`](/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/OnboardingWorkflows.tsx#L58), [`OnboardingWorkflows.tsx:78`](/Users/nieoln/GitHub/sites/01-active-projects/clockwork-main/clockwork/src/pages/OnboardingWorkflows.tsx#L78)). Namos currently has navigation steps but no equivalent user-owned step data.

The historical reuse audit is still useful as evidence of intended field-editor behavior, but not as a currently verifiable donor. It records a production Clockwork builder with sortable field cards, a field palette, a focused properties panel, debounced autosave, and preview ([`docs/research/code-reuse.md:52`](../../research/code-reuse.md#L52)). Those capabilities were named before the current Namos implementation, yet the shipped CFP field rows have only the visual grip.

### ServiceHQ

ServiceHQ's intake-form builder is single-page, so it does not answer the multi-step question. It does provide one strong comparison: the editor and a live client-facing preview share the same dialog. The left column edits fields while the right column immediately renders title, description, required markers, and control types from the same draft state ([`IntakeFormsManager.tsx:181`](/Users/nieoln/GitHub/sites/01-active-projects/servicehq-main/servicehq/src/components/settings/IntakeFormsManager.tsx#L181), [`IntakeFormsManager.tsx:225`](/Users/nieoln/GitHub/sites/01-active-projects/servicehq-main/servicehq/src/components/settings/IntakeFormsManager.tsx#L225), [`IntakeFormsManager.tsx:302`](/Users/nieoln/GitHub/sites/01-active-projects/servicehq-main/servicehq/src/components/settings/IntakeFormsManager.tsx#L302)). Namos requires save-then-navigate instead.

### Takumi

Takumi contains the clearest form-model comparison. Its form types explicitly define `steps → groups → fields`, with each step owning a title, description, optional state, and groups ([`enhanced-form-types.ts:143`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/enhanced-form-types.ts#L143), [`enhanced-form-types.ts:156`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/enhanced-form-types.ts#L156), [`enhanced-form-types.ts:168`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/enhanced-form-types.ts#L168)). Its renderer derives visible steps and progress from that configuration, validates before forward navigation, and renders the current step's groups ([`multi-step-form.tsx:83`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/multi-step-form.tsx#L83), [`multi-step-form.tsx:228`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/multi-step-form.tsx#L228), [`multi-step-form.tsx:324`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/multi-step-form.tsx#L324), [`multi-step-form.tsx:402`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/multi-step-form.tsx#L402)). Its builder also keeps a rendered form preview beside the controls ([`enhanced-form-builder.tsx:668`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/ui/enhanced-form-builder.tsx#L668)).

This is architectural evidence, not a copy recommendation. This repo's own audit correctly warns that Takumi's enhanced form kit is unexercised demo-ware and even contains a duplicate export ([`docs/research/code-reuse.md:16`](../../research/code-reuse.md#L16)). The builder also declares drag state without implementing a real reorder interaction. We should borrow the separation between form structure and renderer, not the component wholesale.

Takumi also has an onboarding step-list pattern with real drag-and-drop, add/remove, selected-step focus, and a separate detail editor ([`StepList.tsx:22`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/onboarding/StepList.tsx#L22), [`StepList.tsx:48`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/onboarding/StepList.tsx#L48), [`StepDetailsEditor.tsx:68`](/Users/nieoln/GitHub/sites/01-active-projects/takumi-main/takumi-webapp/components/onboarding/StepDetailsEditor.tsx#L68)). Searches found no production page importing those components, so they are interaction references only.

## Candidate hypotheses, weighed

| Candidate | Finding | Weight |
|---|---|---|
| The organizer sees long scrolling field configuration | True. Every field's secondary settings are expanded, so the two question screens become dense. A selected-field inspector would be more focused than one new wizard screen per field. | Supporting problem, not the meaning of the complaint. |
| There is no field reordering | True. The grip is decorative and the original acceptance checklist requires reorder. | Clear defect and likely frustration amplifier. |
| The stepper feels flat or unpolished | True. Completion is inferred from index, all steps are freely clickable, and there is no validation/save state or transition feedback. | Secondary. Polish cannot turn fixed settings categories into form pages. |
| The owner means a different builder | Plausible. Portal Forms is another `WizardShell`-based builder and produces only one fixed section. | Needs owner confirmation, but does not invalidate the main diagnosis. |
| There is no live preview | True. ServiceHQ demonstrates the expected in-context feedback; Namos requires saving and leaving. | Major supporting problem. |
| The organizer cannot build the public form's steps | True at UI, type, schema, persistence, and renderer layers. | **Primary hypothesis.** It directly reconciles the owner's words with the apparent presence of two steppers. |

## Proposed before/after

### Before

- A seven-item rail navigates categories of organizer settings.
- "Abstract information" and "Participant information" are the only question containers.
- All questions and their secondary configuration are expanded in those containers.
- The public form always uses five code-defined stages.
- A grip suggests reorder but does nothing.
- Preview means save, leave the editor, inspect another route, return, and repeat.

### After to validate with the owner

Treat **Build** and **Settings** as different jobs.

The primary Build workspace should represent the public form's actual structure:

1. A **Pages** rail lists the resulting public flow in order. System-owned pages such as Account and Review can be visibly locked; organizer-owned proposal pages can be added, named, duplicated, removed, and reordered. Participant collection should remain a special repeatable page/scope unless product requirements say otherwise.
2. Selecting a page shows only that page's ordered questions in the center. Adding a field opens a searchable palette; selecting a field opens a focused properties inspector for label, type, required state, options, length, and conditional visibility.
3. A **live public preview** renders the selected page from unsaved draft state and can switch to a full-flow preview. The preview must use the same renderer/visibility rules as the real public form.
4. Drag-and-drop should have accessible Move up/Move down alternatives for both pages and fields. Do not ship another decorative grip.
5. Welcome copy, close date, routing, limits, notifications, and post-submit behavior move to dedicated Settings sections beneath the page identity—not into the page header and not masquerading as pages in the public form.

The public flow would then be derived rather than hard-coded, for example:

`Welcome (optional system page) → Account (system) → [organizer proposal pages] → Participant (optional system/repeatable scope) → Review (system)`

This keeps required conference semantics while making "multi-step" genuinely organizer-configurable.

## Expected implementation scope after confirmation

This is not a safe one-file polish fix. A complete change needs:

- a versioned page/section model that allows multiple ordered submission pages while preserving participant scope;
- migration/default behavior for existing `abstract` and `participant` forms;
- updated Convex validators, public config mapping, submit/edit validation, templates, duplication, and tests;
- a builder workspace with page and field ordering plus accessible alternatives;
- a draft-state preview using the production renderer;
- public progress/review derived from configured pages;
- a decision about whether Portal Forms adopts the same page model now or later.

Field reordering alone is small and clearly missing, but implementing it now would risk producing another "look, it is more builder-like" patch without resolving the repeated complaint. It should be part of the confirmed interaction model.

## One-round confirmation prompt for the owner

> When you say this is not a multi-step form builder, do you mean that organizers must be able to create and reorder the **pages speakers will actually move through**, place fields on each page, and preview that exact flow while editing? Today the seven organizer steps are only settings categories, while the speaker's five pages are hard-coded. If yes, the proposed Build workspace above is the right change. If not, which is the blocker: field reordering, live preview, or the density of each question-editing screen?

