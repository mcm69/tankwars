import { Round, type LoggedCommand, type RoundConfig } from './round';

/** Ticks a round can run without a command before a replay gives up (a stuck round). */
const MAX_IDLE_TICKS = 60 * 60 * 5;

/**
 * Replays a round from its config and command log. The sim is deterministic, so this ends in
 * exactly the state the original round reached; any exception it hit is thrown again here.
 * Stops at `untilTick` if given, otherwise when the round is over.
 */
export function replayRound(
  config: RoundConfig,
  log: readonly LoggedCommand[],
  untilTick = Infinity,
): Round {
  const round = new Round(config);
  for (const { tick, cmd } of log) {
    if (tick > untilTick) break;
    while (round.tickCount < tick) round.tick();
    if (!round.command(cmd)) {
      throw new Error(`Replay diverged: ${cmd.type} rejected at tick ${tick} (${round.phase})`);
    }
  }
  const stop = Math.min(untilTick, round.tickCount + MAX_IDLE_TICKS);
  while (round.phase !== 'roundOver' && round.tickCount < stop) round.tick();
  return round;
}
