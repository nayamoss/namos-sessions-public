# Speaker task form

**Route:** `/portal/forms/:formId`  
**User:** Authenticated speaker assigned the linked portal form/task.

## Journey

1. The speaker enters from a task link and sees the authorized form, context, and any saved answers.
2. They enter invalid and valid required/dynamic values, save a draft if offered, reload, and confirm retained progress.
3. They submit once, see completion confirmation, and return to Tasks where the linked task is completed.
4. They open an expired/unauthorized form URL and see a safe denied/unavailable state.

## Success and recovery

Failed save/submit retains safe answers and does not complete the task falsely. The form cannot read or write another speaker's response.
