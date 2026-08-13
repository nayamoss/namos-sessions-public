export function backendUnavailable(error: unknown) {
  return error instanceof Error && /does not yet provide|unsupported/i.test(error.message);
}
