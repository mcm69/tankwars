import { Rng } from '../core/rng';
import {
  CRUMBLE_MAX_PASSES,
  FALL_DAMAGE_PER_PIXEL,
  FALL_DAMAGE_THRESHOLD,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  TANK_FALL_SPEED,
} from './constants';
import { Crumbler, hasLooseDirt } from './crumble';
import { Effects } from './effects';
import {
  DEFAULT_OPTIONS,
  resolveWalls,
  resolveWindLevel,
  rollWind,
  type GameOptions,
  type WindLevel,
} from './options';
import { launch, stepProjectile, type Projectile } from './physics';
import { GUIDANCE_H, GUIDANCE_V, itemIndex, LEAD_BALL, WEAPON_COUNT } from './items';
import { createTank, isSupported, maxPower, nextOwnedWeapon, tankCenter, type Tank } from './tank';
import { Material, type Terrain } from './terrain';
import { generateTerrain, type TerrainStyle } from './terrain-gen';
import {
  behaviorOf,
  canDud,
  detonate,
  DUD_DAMAGE,
  dudChance,
  fireLaser,
  LASER_MIN_ENERGY,
} from './weapons';
import type { DamageKind, DeathStyle, RoundEvent, World } from './world';

export type { DeathStyle, RoundEvent } from './world';

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
  /** Fixed dud chance on tank hits (tests). */
  dudChance?: number;
  /** Fixed death style (tests). */
  deathStyle?: DeathStyle;
}

export type Phase =
  'dropping' | 'aiming' | 'flying' | 'effects' | 'crumbling' | 'settling' | 'roundOver';

export type Command =
  | { type: 'aim'; delta: number }
  | { type: 'power'; delta: number }
  | { type: 'setAim'; angle: number }
  | { type: 'setPower'; power: number }
  | { type: 'flip' }
  | { type: 'fire' }
  | { type: 'selectWeapon'; index: number }
  | { type: 'cycleWeapon'; dir: 1 | -1 }
  /** Arms a guidance system the tank owns at a target, for the next shot. */
  | { type: 'setGuidance'; axis: 'H' | 'V'; targetId: number }
  | { type: 'clearGuidance' }
  /** Everyone dies once the current turn is over (the original's Ctrl-M). */
  | { type: 'massKill' };

/** Per-tank tallies for one round, for scoring. */
export interface RoundStats {
  /** Damage dealt to other tanks during this tank's turns. */
  damageDealt: number;
  /** Damage this tank did to itself. */
  selfDamage: number;
  kills: number;
  /** Id of the tank whose turn it was when this one died (-1 = mass kill, null = survived). */
  killedBy: number | null;
}

/** One shot and where it ended up: public information that computer players learn from. */
export interface ShotRecord {
  readonly tankId: number;
  readonly angle: number;
  readonly power: number;
  readonly weapon: number;
  /** Where it landed, or null if it left the field (or hasn't landed yet). */
  impact: { x: number; y: number } | null;
}

/** Margin kept free at each side when placing tanks. */
const PLACEMENT_MARGIN = 24;
/** Half-width of the flat pad flattened under each tank. */
const PAD_HALF_WIDTH = 9;

/**
 * One round of play: terrain, tanks, turns, shots, until one tank (or none) is left.
 * Deterministic: the same config and command sequence always produce the same result.
 */
export class Round implements World {
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
  /** Explosions, reactions, particles, beams… everything still playing out after a shot. */
  readonly effects = new Effects();
  forceCrumble = false;
  tickCount = 0;
  /**
   * Scoring tallies. Everything that happens during a turn (blasts, debris, falls, chain
   * deaths) is credited to the tank whose turn it is.
   */
  readonly stats: RoundStats[];
  /** Every shot fired this round, oldest first. */
  readonly shotLog: ShotRecord[] = [];
  private massKilling = false;
  private events: RoundEvent[] = [];
  private readonly fallSpeed = new Map<number, number>();
  /** y where each currently falling tank started falling. */
  private readonly fallStart = new Map<number, number>();
  private crumbler: Crumbler | null = null;
  private crumbleTicks = 0;
  private readonly dudOverride: number | undefined;
  private readonly deathStyleOverride: DeathStyle | undefined;

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
    this.dudOverride = config.dudChance;
    this.deathStyleOverride = config.deathStyle;

    const xs = this.placeTanks(config.players.length);
    this.tanks = config.players.map((p, i) => {
      // Start above the field at staggered heights; they drop in during the 'dropping' phase.
      return createTank(i, p.name, p.color, xs[i]!, -this.rng.int(8, 80), p.inventory);
    });
    this.order = [...this.tanks].sort((a, b) => a.x - b.x).map((t) => t.id);
    this.stats = this.tanks.map(() => ({
      damageDealt: 0,
      selfDamage: 0,
      kills: 0,
      killedBy: null,
    }));
  }

  get current(): Tank | undefined {
    return this.tanks[this.currentId];
  }

  emit(e: RoundEvent): void {
    this.events.push(e);
  }

  damage(tankId: number, amount: number, kind: DamageKind = 'blast'): void {
    const t = this.tanks[tankId];
    if (!t?.alive || amount <= 0) return;
    amount = absorbWithShields(t, amount, kind, (absorbed) =>
      this.events.push({ type: 'shieldHit', tankId, absorbed, kind }),
    );
    if (amount <= 0) return;
    const dealt = Math.min(t.health, amount);
    t.health -= dealt;
    const src = this.currentId;
    if (src === tankId) this.stats[tankId]!.selfDamage += dealt;
    else if (src >= 0) this.stats[src]!.damageDealt += dealt;
    this.events.push({ type: 'tankHit', tankId, damage: amount });
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
      case 'setGuidance': {
        const item = cmd.axis === 'H' ? GUIDANCE_H : GUIDANCE_V;
        const target = this.tanks[cmd.targetId];
        if (!(t.inventory[item]! > 0) || !target?.alive || target.id === t.id) return false;
        t.guidance = { axis: cmd.axis, targetId: cmd.targetId };
        break;
      }
      case 'clearGuidance':
        t.guidance = null;
        break;
      case 'fire':
        return this.fire(t);
    }
    return true;
  }

  private fire(t: Tank): boolean {
    // An empty selection falls back to a Lead Ball; with nothing at all, it still fires one.
    let weapon = t.selected;
    if (!(t.inventory[weapon]! > 0)) weapon = LEAD_BALL;

    if (behaviorOf(weapon).kind === 'laser') {
      // The laser spends energy equal to the power setting, and needs a minimum to fire.
      const energy = Math.min(t.power, t.inventory[weapon]!);
      if (energy < LASER_MIN_ENERGY) {
        this.events.push({ type: 'fireRejected', tankId: t.id, reason: 'laserEnergy' });
        return false;
      }
      t.inventory[weapon] = t.inventory[weapon]! - energy;
      this.reselectIfEmpty(t);
      this.events.push({ type: 'fire', tankId: t.id, weapon });
      const { points } = fireLaser(this, t, energy);
      this.shotLog.push({
        tankId: t.id,
        angle: t.angle,
        power: energy,
        weapon,
        impact: points[points.length - 1] ?? null,
      });
      this.effects.beam(points, t.color);
      this.events.push({ type: 'laser', tankId: t.id });
      this.phase = 'effects';
      return true;
    }

    t.inventory[weapon] = Math.max(0, t.inventory[weapon]! - 1);
    this.reselectIfEmpty(t);
    this.projectile = launch(t, weapon);
    this.shotLog.push({ tankId: t.id, angle: t.angle, power: t.power, weapon, impact: null });
    const g = t.guidance;
    const target = g ? this.tanks[g.targetId] : undefined;
    if (g && target?.alive) {
      // One guidance unit per guided shot, aimed at where the target is now.
      const item = g.axis === 'H' ? GUIDANCE_H : GUIDANCE_V;
      t.inventory[item] = t.inventory[item]! - 1;
      const c = tankCenter(target);
      this.projectile.guidance = { axis: g.axis, tx: c.x, ty: c.y, locked: false };
    }
    t.guidance = null;
    this.phase = 'flying';
    this.events.push({ type: 'fire', tankId: t.id, weapon });
    return true;
  }

  private reselectIfEmpty(t: Tank): void {
    const left = t.inventory[t.selected]!;
    const isLaser = behaviorOf(t.selected).kind === 'laser';
    if (left <= 0 || (isLaser && left < LASER_MIN_ENERGY)) {
      t.selected = nextOwnedWeapon(t, t.selected, 1);
    }
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
      case 'effects':
        this.effects.tick(this);
        if (!this.effects.busy) this.afterEffects();
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
    if (r.kind === 'hitTank' && canDud(behaviorOf(p.weapon))) {
      const chance = this.dudOverride ?? dudChance(Math.hypot(p.vx, p.vy));
      if (this.rng.chance(chance)) {
        // Fails to detonate: bores through the tank and keeps flying.
        p.passed.push(r.tankId);
        this.damage(r.tankId, DUD_DAMAGE);
        this.events.push({ type: 'dud', tankId: r.tankId });
        return;
      }
    }
    this.projectile = null;
    const record = this.shotLog[this.shotLog.length - 1];
    if (record && r.kind !== 'lost') record.impact = { x: r.x, y: r.y };
    if (r.kind === 'lost') {
      this.phase = 'settling';
      return;
    }
    detonate(this, this.effects, p.weapon, r.x, r.y);
    this.phase = 'effects';
  }

  /**
   * Rolls the crumble chance: loose ground either collapses now or stays put this time.
   * A Sonic Blaster forces the collapse (the roll still happens, keeping RNG use stable).
   */
  private afterEffects(): void {
    const roll = this.rng.chance(this.options.crumble / 100);
    const force = this.forceCrumble;
    this.forceCrumble = false;
    if ((roll || force) && hasLooseDirt(this.terrain)) {
      this.crumbler = new Crumbler(this.terrain);
      this.crumbleTicks = 0;
      this.phase = 'crumbling';
      this.events.push({ type: 'crumble' });
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
      const killer = this.massKilling ? -1 : this.currentId;
      this.stats[doomed.id]!.killedBy = killer;
      if (killer >= 0 && killer !== doomed.id) this.stats[killer]!.kills++;
      this.effects.startDeath(this, doomed, this.deathStyleOverride ?? pickDeathStyle(this.rng));
      this.phase = 'effects';
      return;
    }
    if (this.massKillPending) {
      this.massKillPending = false;
      this.massKilling = true;
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
    this.damage(t.id, fallDamage(t.y - start), 'fall');
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

const SHIELD_ENERGY = itemIndex('shieldEnergy');
const SHIELD_INERTIA = itemIndex('shieldInertia');
/** Energy Shield units spent per point of damage absorbed (1000 units soak 200 damage). */
export const SHIELD_COST_PER_DAMAGE = 5;

/**
 * Lets a tank's shields soak damage, spending their units. The Energy Shield takes blasts,
 * debris, lasers and reactions; the Inertia Dampener takes falls (one unit per point).
 * Returns the damage that gets through.
 */
export function absorbWithShields(
  t: Tank,
  amount: number,
  kind: DamageKind,
  onAbsorb: (absorbed: number) => void = () => {},
): number {
  const item = kind === 'fall' ? SHIELD_INERTIA : SHIELD_ENERGY;
  const cost = kind === 'fall' ? 1 : SHIELD_COST_PER_DAMAGE;
  const units = t.inventory[item] ?? 0;
  const absorbed = Math.min(amount, Math.floor(units / cost));
  if (absorbed <= 0) return amount;
  t.inventory[item] = units - absorbed * cost;
  onAbsorb(absorbed);
  return amount - absorbed;
}

export function fallDamage(distance: number): number {
  return Math.round(Math.max(0, distance - FALL_DAMAGE_THRESHOLD) * FALL_DAMAGE_PER_PIXEL);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Death styles from the original: mostly standard explosions, sometimes something odd. */
export function pickDeathStyle(rng: Rng): DeathStyle {
  const r = rng.float();
  return r < 0.55 ? 'standard' : r < 0.7 ? 'dirt' : r < 0.85 ? 'fade' : 'meltdown';
}
