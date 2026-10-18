import { Rng } from '../core/rng';
import {
  CRUMBLE_MAX_PASSES,
  EXPLOSION_TICKS,
  FALL_DAMAGE_PER_PIXEL,
  FALL_DAMAGE_THRESHOLD,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  TANK_FALL_SPEED,
} from './constants';
import { Crumbler, hasLooseDirt } from './crumble';
import { blastDamage, type Blast } from './damage';
import {
  DEFAULT_OPTIONS,
  resolveWalls,
  resolveWindLevel,
  rollWind,
  type GameOptions,
  type WindLevel,
} from './options';
import { launch, stepProjectile, type Projectile } from './physics';
import { ITEMS, LEAD_BALL, WEAPON_COUNT } from './items';
import { createTank, isSupported, maxPower, nextOwnedWeapon, tankCenter, type Tank } from './tank';
import { Material, type Terrain } from './terrain';
import { generateTerrain, type TerrainStyle } from './terrain-gen';

export interface PlayerSetup {
  name: string;
  color: number;
  /** Items owned at the start of the round; defaults to the starting inventory. */
  inventory?: readonly number[];
}

export interface RoundConfig {
  seed: number;
  players: readonly PlayerSetup[];
  terrainStyle?: TerrainStyle;
  options?: Partial<GameOptions>;
  /** Fixed wind, overriding the wind level (tests). */
  wind?: number;
  /** Fixed wall behavior, overriding the wall mode (tests). */
  walls?: boolean;
}

/** A dying tank's final explosion, which can catch neighbors. */
export const DEATH_BLAST = { radius: 22, damage: 80 } as const;

export type Phase =
  'dropping' | 'aiming' | 'flying' | 'exploding' | 'crumbling' | 'settling' | 'roundOver';

export type Command =
  | { type: 'aim'; delta: number }
  | { type: 'power'; delta: number }
  | { type: 'setAim'; angle: number }
  | { type: 'setPower'; power: number }
  | { type: 'flip' }
  | { type: 'fire' }
  | { type: 'selectWeapon'; index: number }
  | { type: 'cycleWeapon'; dir: 1 | -1 }
  /** Everyone dies once the current turn is over (the original's Ctrl-M). */
  | { type: 'massKill' };

export type RoundEvent =
  | { type: 'turn'; tankId: number }
  | { type: 'fire'; tankId: number }
  | { type: 'explode'; x: number; y: number; radius: number; harmless: boolean }
  | { type: 'tankHit'; tankId: number; damage: number }
  | { type: 'tankDied'; tankId: number }
  | { type: 'roundOver'; winnerId: number | null };

export interface Explosion {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** A harmless puff (e.g. a Lead Ball landing): no crater, no damage. */
  readonly harmless: boolean;
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
  readonly options: Readonly<GameOptions>;
  readonly windLevel: WindLevel;
  readonly wind: number;
  /** Whether shots bounce off the sides and ceiling this round. */
  readonly walls: boolean;
  /** Tank ids sorted left to right at the start of the round; turns follow this order. */
  readonly order: readonly number[];
  phase: Phase = 'dropping';
  currentId = -1;
  winnerId: number | null = null;
  projectile: Projectile | null = null;
  /** Set by the massKill command; everyone dies when the current turn resolves. */
  massKillPending = false;
  readonly explosions: Explosion[] = [];
  tickCount = 0;
  private events: RoundEvent[] = [];
  private readonly fallSpeed = new Map<number, number>();
  /** y where each currently falling tank started falling. */
  private readonly fallStart = new Map<number, number>();
  private crumbler: Crumbler | null = null;
  private crumbleTicks = 0;

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
    this.options = { ...DEFAULT_OPTIONS, ...config.options };
    this.windLevel = resolveWindLevel(this.rng, this.options.wind);
    const wind = rollWind(this.rng, this.windLevel);
    this.wind = config.wind ?? wind;
    const walls = resolveWalls(this.rng, this.options.walls);
    this.walls = config.walls ?? walls;

    const xs = this.placeTanks(config.players.length);
    this.tanks = config.players.map((p, i) => {
      // Start above the field at staggered heights; they drop in during the 'dropping' phase.
      return createTank(i, p.name, p.color, xs[i]!, -this.rng.int(8, 80), p.inventory);
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
    if (cmd.type === 'massKill') {
      if (this.phase === 'roundOver' || this.massKillPending) return false;
      this.massKillPending = true;
      return true;
    }
    const t = this.current;
    if (this.phase !== 'aiming' || !t) return false;
    switch (cmd.type) {
      case 'aim':
        t.angle = clamp(t.angle + cmd.delta, 0, 180);
        break;
      case 'power':
        t.power = clamp(t.power + cmd.delta, 0, maxPower(t));
        break;
      case 'setAim':
        t.angle = clamp(Math.round(cmd.angle), 0, 180);
        break;
      case 'setPower':
        t.power = clamp(Math.round(cmd.power), 0, maxPower(t));
        break;
      case 'flip':
        t.angle = 180 - t.angle;
        break;
      case 'selectWeapon':
        if (cmd.index < 0 || cmd.index >= WEAPON_COUNT || !(t.inventory[cmd.index]! > 0)) {
          return false;
        }
        t.selected = cmd.index;
        break;
      case 'cycleWeapon':
        t.selected = nextOwnedWeapon(t, t.selected, cmd.dir);
        break;
      case 'fire':
        this.fire(t);
        break;
    }
    return true;
  }

  private fire(t: Tank): void {
    // An empty selection falls back to a Lead Ball; with nothing at all, it still fires one.
    let weapon = t.selected;
    if (!(t.inventory[weapon]! > 0)) weapon = LEAD_BALL;
    t.inventory[weapon] = Math.max(0, t.inventory[weapon]! - 1);
    if (t.inventory[t.selected]! <= 0) t.selected = nextOwnedWeapon(t, t.selected, 1);
    this.projectile = launch(t, weapon);
    this.phase = 'flying';
    this.events.push({ type: 'fire', tankId: t.id });
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
        if (this.explosions.length === 0) this.afterExplosions();
        break;
      case 'crumbling':
        this.stepCrumble();
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
    if (r.kind === 'lost') {
      this.phase = 'settling';
      return;
    }
    // Temporary until Stage 5's weapon behaviors: every weapon is a plain blast.
    const blast = ITEMS[p.weapon]!.blast ?? { radius: 0, damage: 0 };
    this.detonate({ x: r.x, y: r.y, ...blast });
  }

  private detonate(blast: Blast): void {
    if (blast.radius <= 0) {
      this.explosions.push({ x: blast.x, y: blast.y, radius: 4, harmless: true, age: 0 });
      this.events.push({ type: 'explode', x: blast.x, y: blast.y, radius: 4, harmless: true });
      this.phase = 'exploding';
      return;
    }
    this.terrain.carveCircle(blast.x, blast.y, blast.radius);
    for (const [id, dmg] of blastDamage(blast, this.tanks)) {
      const t = this.tanks[id]!;
      t.health = Math.max(0, t.health - dmg);
      this.events.push({ type: 'tankHit', tankId: id, damage: dmg });
    }
    this.explosions.push({
      x: blast.x,
      y: blast.y,
      radius: blast.radius,
      harmless: false,
      age: 0,
    });
    this.events.push({
      type: 'explode',
      x: blast.x,
      y: blast.y,
      radius: blast.radius,
      harmless: false,
    });
    this.phase = 'exploding';
  }

  /** Rolls the crumble chance: loose ground either collapses now or stays put this time. */
  private afterExplosions(): void {
    if (this.rng.chance(this.options.crumble / 100) && hasLooseDirt(this.terrain)) {
      this.crumbler = new Crumbler(this.terrain);
      this.crumbleTicks = 0;
      this.phase = 'crumbling';
    } else {
      this.phase = 'settling';
    }
  }

  private stepCrumble(): void {
    const crumbler = this.crumbler;
    let moved = false;
    if (crumbler) {
      // Accelerates like falling debris, up to CRUMBLE_MAX_PASSES px per tick.
      const passes = Math.min(CRUMBLE_MAX_PASSES, 1 + Math.floor(this.crumbleTicks / 3));
      for (let i = 0; i < passes; i++) moved = crumbler.pass() || moved;
    }
    this.crumbleTicks++;
    // Tanks ride the collapsing ground down.
    const tanksMoving = this.settleTanks();
    if (!moved && !tanksMoving) {
      this.crumbler = null;
      this.phase = 'settling';
    }
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
    if (this.massKillPending) {
      this.massKillPending = false;
      for (const t of this.tanks) if (t.alive) t.health = 0;
      return; // the next settling tick resolves the deaths one by one
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

  /**
   * Moves unsupported tanks down (accelerating) and applies fall damage on landing.
   * Returns true while anything is still falling. With "tanks fall" off, tanks only fall
   * during the initial drop and otherwise hover.
   */
  private settleTanks(): boolean {
    const initialDrop = this.phase === 'dropping';
    if (!initialDrop && !this.options.tanksFall) return false;
    let moving = false;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (isSupported(t, this.terrain)) {
        this.land(t, initialDrop);
        continue;
      }
      moving = true;
      if (!this.fallStart.has(t.id)) this.fallStart.set(t.id, t.y);
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

  private land(t: Tank, initialDrop: boolean): void {
    const start = this.fallStart.get(t.id);
    this.fallSpeed.delete(t.id);
    this.fallStart.delete(t.id);
    if (start === undefined || initialDrop) return;
    const dmg = fallDamage(t.y - start);
    if (dmg <= 0) return;
    t.health = Math.max(0, t.health - dmg);
    this.events.push({ type: 'tankHit', tankId: t.id, damage: dmg });
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

export function fallDamage(distance: number): number {
  return Math.round(Math.max(0, distance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_PIXEL);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function removeWhere<T>(arr: T[], pred: (v: T) => boolean): void {
  let w = 0;
  for (const v of arr) if (!pred(v)) arr[w++] = v;
  arr.length = w;
}
