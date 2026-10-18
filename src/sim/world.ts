import type { Rng } from '../core/rng';
import type { GameOptions } from './options';
import type { Tank } from './tank';
import type { Terrain } from './terrain';

export type DeathStyle = 'standard' | 'dirt' | 'fade' | 'meltdown';

/** Falls are soaked by the Inertia Dampener; everything else by the Energy Shield. */
export type DamageKind = 'blast' | 'fall';

export type RoundEvent =
  | { type: 'turn'; tankId: number }
  | { type: 'fire'; tankId: number; weapon: number }
  | { type: 'fireRejected'; tankId: number; reason: 'laserEnergy' }
  | { type: 'explode'; x: number; y: number; radius: number; harmless: boolean }
  | { type: 'laser'; tankId: number }
  | { type: 'reaction'; x: number; y: number }
  | { type: 'sonic'; x: number; y: number }
  | { type: 'dirt'; x: number; y: number; radius: number }
  /** Loose ground starts collapsing. */
  | { type: 'crumble' }
  | { type: 'dud'; tankId: number }
  | { type: 'tankHit'; tankId: number; damage: number }
  | { type: 'shieldHit'; tankId: number; absorbed: number; kind: DamageKind }
  | { type: 'tankDied'; tankId: number; style: DeathStyle }
  | { type: 'roundOver'; winnerId: number | null };

/** What weapons and effects may touch: the round's mutable state, behind a narrow interface. */
export interface World {
  readonly terrain: Terrain;
  readonly tanks: readonly Tank[];
  readonly rng: Rng;
  readonly options: Readonly<GameOptions>;
  readonly walls: boolean;
  /** Applies damage to a living tank (after its shields) and reports it. */
  damage(tankId: number, amount: number, kind?: DamageKind): void;
  emit(e: RoundEvent): void;
  /** Set by the Sonic Blaster: loose ground collapses after this shot regardless of crumble %. */
  forceCrumble: boolean;
}
