import { TANK_HALF_WIDTH, tankCenter, type Tank } from './tank';

export interface Blast {
  x: number;
  y: number;
  radius: number;
  /** Damage at the exact center; falls off linearly to 0 at radius + tank half-width. */
  damage: number;
}

export function blastDamageAt(blast: Blast, distance: number): number {
  const reach = blast.radius + TANK_HALF_WIDTH;
  if (distance >= reach) return 0;
  return Math.round(blast.damage * (1 - distance / reach));
}

/** Damage each living tank takes from a blast, keyed by tank id (only non-zero entries). */
export function blastDamage(blast: Blast, tanks: readonly Tank[]): Map<number, number> {
  const out = new Map<number, number>();
  for (const t of tanks) {
    if (!t.alive) continue;
    const c = tankCenter(t);
    const dmg = blastDamageAt(blast, Math.hypot(c.x - blast.x, c.y - blast.y));
    if (dmg > 0) out.set(t.id, dmg);
  }
  return out;
}
