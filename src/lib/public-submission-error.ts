export function publicSubmissionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("submission limit")) return "You have reached this form's submission limit.";
  if (message.includes("not accepting responses") || message.includes("form is closed")) return "This submission form is closed.";
  return "Your submission could not be saved. Please try again.";
}
