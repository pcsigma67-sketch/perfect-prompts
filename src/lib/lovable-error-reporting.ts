/**
 * Reports an unexpected UI error. Kept dependency-free and fail-safe: it must
 * never throw, since it runs inside the root error boundary.
 */
export function reportLovableError(
  error: unknown,
  context?: Record<string, string>,
): void {
  try {
    console.error("[error-boundary]", context ?? {}, error);
  } catch {
    // never break the error boundary itself
  }
}
