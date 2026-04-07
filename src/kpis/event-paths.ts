import type { SkynetEvent } from '../skynet/types.js';

const NOT_FOUND = Symbol('event-path-not-found');

function resolvePath(
  source: Record<string, unknown> | undefined,
  parts: string[],
): unknown | typeof NOT_FOUND {
  let current: unknown = source;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return NOT_FOUND;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current === undefined ? NOT_FOUND : current;
}

/**
 * Resolve a dot-delimited field path against an event payload first, then
 * against top-level event fields for telemetry identifiers like `agent_id`.
 */
export function resolveEventPath(event: SkynetEvent, path: string): unknown {
  const parts = path.split('.');
  const payloadMatch = resolvePath(event.payload, parts);
  if (payloadMatch !== NOT_FOUND) {
    return payloadMatch;
  }
  const eventMatch = resolvePath(event as unknown as Record<string, unknown>, parts);
  return eventMatch === NOT_FOUND ? undefined : eventMatch;
}
