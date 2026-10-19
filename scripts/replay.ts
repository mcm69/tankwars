/**
 * Replays a round from a debug-info report (F9 in battle, or "Copy debug info" on the crash
 * panel): npm run replay -- report.json [--until TICK]
 *
 * Re-runs the round headlessly to the tick the report was taken at (or --until), rethrowing
 * any crash, and prints where everything ended up.
 */
import { readFileSync } from 'node:fs';
import type { DebugState } from '../src/debug/debug-state';
import { replayRound } from '../src/sim/replay';

const [file, flag, value] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run replay -- report.json [--until TICK]');
  process.exit(2);
}
const state = JSON.parse(readFileSync(file, 'utf8')) as DebugState;
if (!state.round) {
  console.error('This report has no round in progress (taken outside a battle).');
  process.exit(1);
}
const until = flag === '--until' ? Number(value) : state.round.tickCount;
console.log(`Tank Wars ${state.version}, scene ${state.scene}, phase ${state.round.phase}`);
if (state.error) console.log(`Reported error: ${state.error.message}`);
console.log(`Replaying ${state.round.commandLog.length} commands to tick ${until}...`);
const round = replayRound(state.round.config, state.round.commandLog, until);
console.log(`Reached tick ${round.tickCount}, phase ${round.phase}, wind ${round.wind}`);
for (const t of round.tanks) {
  console.log(
    `  ${t.name.padEnd(12)} ${t.alive ? 'alive' : 'dead '} health ${String(t.health).padStart(3)}` +
      `  at (${Math.round(t.x)}, ${Math.round(t.y)})  angle ${t.angle} power ${t.power}`,
  );
}
