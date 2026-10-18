/**
 * Headless AI tournament: npm run sim -- [--ais a,b,c] [--games N] [--seed S]
 *   [--wind none|low|standard|high|gale|random] [--walls off|on|random] [--mode duel|ffa|both]
 */
import { AI_IDS, AI_NAMES, type ConcreteAi } from '../src/ai/registry';
import { runTournament, type Standing } from '../src/ai/tournament';
import type { GameOptions, WallMode, WindLevel } from '../src/sim/options';

const args = new Map<string, string>();
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]!;
  if (a.startsWith('--'))
    args.set(a.slice(2), argv[i + 1] && !argv[i + 1]!.startsWith('--') ? argv[++i]! : 'true');
}

const all = AI_IDS.filter((a): a is ConcreteAi => a !== 'random');
const ais = (args.get('ais')?.split(',') ?? all).map((a) => {
  if (!all.includes(a as ConcreteAi))
    throw new Error(`Unknown AI "${a}". Known: ${all.join(', ')}`);
  return a as ConcreteAi;
});
const games = Number(args.get('games') ?? 20);
const seed = Number(args.get('seed') ?? 1);
const mode = args.get('mode') ?? 'both';
const options: Partial<GameOptions> = {
  wind: (args.get('wind') ?? 'standard') as WindLevel | 'random',
  walls: (args.get('walls') ?? 'random') as WallMode,
  crumble: Number(args.get('crumble') ?? 50),
};

const started = performance.now();
const report = runTournament(ais, games, seed, options, {
  duel: mode !== 'ffa',
  ffa: mode !== 'duel',
});
const secs = ((performance.now() - started) / 1000).toFixed(1);

const pct = (s: Standing) => (s.games ? `${((100 * s.wins) / s.games).toFixed(0)}%` : '-');
const table = (title: string, rows: Standing[]) => {
  console.log(`\n${title}`);
  for (const r of rows) {
    console.log(`  ${AI_NAMES[r.ai].padEnd(14)} ${pct(r).padStart(4)}  (${r.wins}/${r.games})`);
  }
};

console.log(
  `Tank Wars AI tournament: ${ais.length} AIs, ${games} games per matchup, wind ${options.wind}, walls ${options.walls}, seed ${seed}`,
);
if (mode !== 'ffa') {
  table('Duels (win rate):', report.duel);
  console.log('\n  Head to head (row beat column):');
  console.log('  ' + ''.padEnd(14) + ais.map((a) => AI_NAMES[a].slice(0, 7).padStart(8)).join(''));
  for (const a of ais) {
    const row = ais.map((b) =>
      (a === b ? '-' : String(report.pairWins.get(a)!.get(b))).padStart(8),
    );
    console.log('  ' + AI_NAMES[a].padEnd(14) + row.join(''));
  }
}
if (mode !== 'duel') table('Free-for-all (win rate):', report.ffa);
console.log(`\nDraws/timeouts: ${report.draws}. Took ${secs}s.`);
