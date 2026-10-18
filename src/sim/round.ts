import { Rng } from '../core/rng';
import { EXPLOSION_TICKS, FIELD_HEIGHT, FIELD_WIDTH, TANK_FALL_SPEED } from './constants';
import { blastDamage, type Blast } from './damage';
import { launch, stepProjectile, type Projectile } from './physics';
import { createTank, isSupported, maxPower, tankCenter, type Tank } from './tank';
import { Material, type Terrain } from './terrain';
import { generateTerrain, type TerrainStyle } from './terrain-gen';

export interface PlayerSetup {
  name: string;
  color: number;
}

export interface RoundConfig {
  seed: number;
  players: readonly PlayerSetup[];
  terrainStyle?: TerrainStyle;
  /** Fixed wind; random when omitted. */
  wind?: number;
}

/** The only weapon until Stage 5: roughly an Incinerator. */
export const SHELL = { radius: 20, damage: 150 } as const;
/** A dying tank's final explosion, which can catch neighbors. */
export const DEATH_BLAST = { radius: 22, damage: 80 } as const;

export type Phase = 'dropping' | 'aiming' | 'flying' | 'exploding' | 'settling' | 'roundOver';

export type Command =
  | { type: 'aim'; delta: number }
  | { type: 'power'; delta: number }
  | { type: 'flip' }
  | { type: 'fire' };

export type RoundEvent =
  | { type: 'turn'; tankId: number }
  | { type: 'fire'; tankId: number }
  | { type: 'explode'; x: number; y: number; radius: number }
  | { type: 'tankHit'; tankId: number; damage: number }
  | { type: 'tankDied'; tankId: number }
  | { type: 'roundOver'; winnerId: number | null };

export interface Explosion {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  age: number;
}

/** Margin kept free at each side when placing tanks. */
const PLACEMENT_MARGIN = 24;
/** Half-width of the flat pad flattened under each tank. */
const PAD_HALF_WIDTH = 9;

/**
 * One round of play: terrain, tanks, turns, shots, until one tank (or none) is left.
 * Deterministic: the same config and command sequence always produce the same result.
 */
export class Round {
  readonly rng: Rng;
  readonly terrain: Terrain;
  readonly terrainStyle: TerrainStyle;
  readonly tanks: Tank[];
  readonly wind: number;
  /** Tank ids sorted left to right at the start of the round; turns follow this order. */
  readonly order: readonly number[];
  phase: Phase = 'dropping';
  currentId = -1;
  winnerId: number | null = null;
  projectile: Projectile | null = null;
  readonly explosions: Explosion[] = [];
  tickCount = 0;
  private events: RoundEvent[] = [];
  private readonly fallSpeed = new Map<number, number>();

  constructor(config: RoundConfig) {
    if (config.players.length < 2) throw new RangeError('A round needs at least 2 players');
    this.rng = new Rng(config.seed);
    const gen = generateTerrain(
      this.rng,
      FIELD_WIDTH,
      FIELD_HEIGHT,
      config.terrainStyle ? { style: config.terrainStyle } : {},
    );
    this.terrain = gen.terrain;
    this.terrainStyle = gen.style;
    this.wind = config.wind ?? this.rng.int(-60, 60);

    const xs = this.placeTanks(config.players.length);
    this.tanks = config.players.map((p, i) => {
      // Start above the field at staggered heights; they drop in during the 'dropping' phase.
      return createTank(i, p.name, p.color, xs[i]!, -this.rng.int(8, 80));
    });
    this.order = [...this.tanks].sort((a, b) => a.x - b.x).map((t) => t.id);
  }

  get current(): Tank | undefined {
    return this.tanks[this.currentId];
  }

  drainEvents(): RoundEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  /** Applies a player command for the current tank. Returns false if it isn't allowed now. */
  command(cmd: Command): boolean {
    const t = this.current;
    if (this.phase !== 'aiming' || !t) return false;
    switch (cmd.type) {
      case 'aim':
        t.angle = clamp(t.angle + cmd.delta, 0, 180);
        break;
      case 'power':
        t.power = clamp(t.power + cmd.delta, 0, maxPower(t));
        break;
      case 'flip':
        t.angle = 180 - t.angle;
        break;
      case 'fire':
        this.projectile = launch(t);
        this.phase = 'flying';
        this.events.push({ type: 'fire', tankId: t.id });
        break;
    }
    return true;
  }

  tick(): void {
    this.tickCount++;
    switch (this.phase) {
      case 'dropping':
        if (!this.settleTanks()) this.startTurn(this.rng.pick(this.order));
        break;
      case 'aiming':
      case 'roundOver':
        break;
      case 'flying':
        this.stepFlight();
        break;
      case 'exploding':
        for (const e of this.explosions) e.age++;
        removeWhere(this.explosions, (e) => e.age >= EXPLOSION_TICKS);
        if (this.explosions.length === 0) this.phase = 'settling';
        break;
      case 'settling':
        if (!this.settleTanks()) this.resolveDeathsOrEndTurn();
        break;
    }
  }

  private stepFlight(): void {
    const p = this.projectile;
    if (!p) return;
    const r = stepProjectile(p, this);
    if (r.kind === 'flying') return;
    this.projectile = null;
    if (r.kind === 'lost') this.phase = 'settling';
    else this.detonate({ x: r.x, y: r.y, ...SHELL });
  }

  private detonate(blast: Blast): void {
    this.terrain.carveCircle(blast.x, blast.y, blast.radius);
    for (const [id, dmg] of blastDamage(blast, this.tanks)) {
      const t = this.tanks[id]!;
      t.health = Math.max(0, t.health - dmg);
      this.events.push({ type: 'tankHit', tankId: id, damage: dmg });
    }
    this.explosions.push({ x: blast.x, y: blast.y, radius: blast.radius, age: 0 });
    this.events.push({ type: 'explode', x: blast.x, y: blast.y, radius: blast.radius });
    this.phase = 'exploding';
  }

  /** Kills one doomed tank at a time (its blast may doom others), then ends the turn. */
  private resolveDeathsOrEndTurn(): void {
    const doomed = this.order.map((id) => this.tanks[id]!).find((t) => t.alive && t.health <= 0);
    if (doomed) {
      doomed.alive = false;
      this.events.push({ type: 'tankDied', tankId: doomed.id });
      this.detonate({ ...tankCenter(doomed), ...DEATH_BLAST });
      return;
    }
    const alive = this.tanks.filter((t) => t.alive);
    if (alive.length <= 1) {
      this.phase = 'roundOver';
      this.winnerId = alive[0]?.id ?? null;
      this.events.push({ type: 'roundOver', winnerId: this.winnerId });
      return;
    }
    this.startTurn(this.nextAliveAfter(this.currentId));
  }

  private startTurn(id: number): void {
    const t = this.tanks[id]!;
    t.power = Math.min(t.power, maxPower(t));
    this.currentId = id;
    this.phase = 'aiming';
    this.events.push({ type: 'turn', tankId: id });
  }

  private nextAliveAfter(id: number): number {
    const start = this.order.indexOf(id);
    for (let i = 1; i <= this.order.length; i++) {
      const candidate = this.order[(start + i) % this.order.length]!;
      if (this.tanks[candidate]!.alive) return candidate;
    }
    return id;
  }

  /** Moves unsupported tanks down (accelerating). Returns true while anything is still falling. */
  private settleTanks(): boolean {
    let moving = false;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (isSupported(t, this.terrain)) {
        this.fallSpeed.delete(t.id);
        continue;
      }
      moving = true;
      const speed = Math.min(TANK_FALL_SPEED, (this.fallSpeed.get(t.id) ?? 0) + 0.25);
      this.fallSpeed.set(t.id, speed);
      // Move a pixel at a time so the tank lands exactly on the surface.
      let remaining = speed;
      while (remaining > 0 && !isSupported(t, this.terrain)) {
        const step = Math.min(1, remaining);
        t.y = Math.min(this.terrain.height, t.y + step);
        remaining -= step;
      }
    }
    return moving;
  }

  /** Picks spread-out x positions in random player order and flattens a pad under each. */
  private placeTanks(n: number): number[] {
    const usable = FIELD_WIDTH - 2 * PLACEMENT_MARGIN;
    const spacing = usable / n;
    const slots = Array.from({ length: n }, (_, i) =>
      Math.round(
        PLACEMENT_MARGIN + spacing * (i + 0.5) + this.rng.range(-spacing * 0.2, spacing * 0.2),
      ),
    );
    this.rng.shuffle(slots);
    for (const x of slots) this.flattenPad(x);
    return slots;
  }

  private flattenPad(cx: number): void {
    const { terrain } = this;
    let sum = 0;
    let count = 0;
    for (let x = cx - PAD_HALF_WIDTH; x <= cx + PAD_HALF_WIDTH; x++) {
      if (x < 0 || x >= terrain.width) continue;
      sum += terrain.surfaceY(x);
      count++;
    }
    const groundY = Math.round(sum / count);
    for (let x = cx - PAD_HALF_WIDTH; x <= cx + PAD_HALF_WIDTH; x++) {
      for (let y = 0; y < terrain.height; y++) {
        terrain.set(x, y, y >= groundY ? Material.Dirt : Material.Air);
      }
    }
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function removeWhere<T>(arr: T[], pred: (v: T) => boolean): void {
  let w = 0;
  for (const v of arr) if (!pred(v)) arr[w++] = v;
  arr.length = w;
}
