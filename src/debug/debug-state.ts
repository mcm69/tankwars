import type { App } from '../app';
import { TICK_RATE } from '../config';

/** Bumped when the debug-state shape changes, so old reports can still be read. */
export const DEBUG_STATE_FORMAT = 1;

/**
 * Everything needed to understand (and replay) what went wrong: version, settings, the set,
 * and the current round's config and command log. See `npm run replay`.
 */
export function buildDebugState(app: App | undefined, error?: unknown) {
  const set = app?.set ?? null;
  const round = set?.round ?? null;
  return {
    format: DEBUG_STATE_FORMAT,
    version: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev',
    time: new Date().toISOString(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    tickRate: TICK_RATE,
    scene: app?.sceneName ?? null,
    error: error === undefined ? null : describeError(error),
    settings: app?.settings ?? null,
    set: set ? set.snapshot('round') : null,
    round: round
      ? {
          config: round.config,
          commandLog: round.commandLog,
          tickCount: round.tickCount,
          phase: round.phase,
        }
      : null,
  };
}

export type DebugState = ReturnType<typeof buildDebugState>;

function describeError(e: unknown): { message: string; stack: string | null } {
  if (e instanceof Error) return { message: e.message, stack: e.stack ?? null };
  return { message: String(e), stack: null };
}

/** Copies the debug state to the clipboard. Resolves false if the clipboard refused. */
export async function copyDebugState(app: App | undefined, error?: unknown): Promise<boolean> {
  const text = JSON.stringify(buildDebugState(app, error));
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
