/** Generates a unique id for a single AI run (used for logging/tracing). */
export function createRunId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
