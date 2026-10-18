import { describe, expect, it } from 'vitest';
import { itemIndex, ITEMS, LEAD_BALL } from '../src/sim/items';
import { launch, stepProjectile, type PhysicsWorld } from '../src/sim/physics';
import { absorbWithShields, Round, SHIELD_COST_PER_DAMAGE } from '../src/sim/round';
import { createTank } from '../src/sim/tank';
import { Material, Terrain } from '../src/sim/terrain';

const inv = (items: Record<string, number>) => {
  const a = new Array(ITEMS.length).fill(0);
  for (const [k, v] of Object.entries(items)) a[itemIndex(k)] = v;
  return a;
};

describe('shields', () => {
  it('the Energy Shield soaks blast damage until its energy runs out', () => {
    const t = createTank(0, 'a', 0, 0, 0, inv({ shieldEnergy: 1000 }));
    expect(absorbWithShields(t, 150, 'blast')).toBe(0);
    expect(t.inventory[itemIndex('shieldEnergy')]).toBe(1000 - 150 * SHIELD_COST_PER_DAMAGE);
    expect(absorbWithShields(t, 100, 'blast')).toBe(50); // 250 left = 50 damage soaked
    expect(t.inventory[itemIndex('shieldEnergy')]).toBe(0);
    expect(absorbWithShields(t, 40, 'blast')).toBe(40);
  });

  it('the Energy Shield ignores falls; the Inertia Dampener only soaks falls', () => {
    const t = createTank(0, 'a', 0, 0, 0, inv({ shieldEnergy: 1000, shieldInertia: 30 }));
    expect(absorbWithShields(t, 50, 'fall')).toBe(20);
    expect(t.inventory[itemIndex('shieldInertia')]).toBe(0);
    expect(t.inventory[itemIndex('shieldEnergy')]).toBe(1000);
  });

  it('protects tanks in a real round, and reports the absorption', () => {
    const round = new Round({
      seed: 3,
      players: [
        { name: 'a', color: 0 },
        { name: 'b', color: 1, inventory: inv({ shieldEnergy: 1000, leadBall: 5 }) },
      ],
      wind: 0,
    });
    while (round.phase !== 'aiming') round.tick();
    round.damage(1, 80);
    expect(round.tanks[1]!.health).toBe(100);
    expect(round.drainEvents()).toContainEqual({
      type: 'shieldHit',
      tankId: 1,
      absorbed: 80,
      kind: 'blast',
    });
  });
});

describe('guidance', () => {
  const world = (terrain: Terrain): PhysicsWorld => ({ terrain, tanks: [], wind: 0, walls: false });
  const flyToEnd = (w: PhysicsWorld, p: ReturnType<typeof launch>) => {
    let r = stepProjectile(p, w);
    while (r.kind === 'flying') r = stepProjectile(p, w);
    return r;
  };

  it("Herb's (H) drops the shell straight onto the target's column", () => {
    const terrain = new Terrain(624, 320);
    terrain.fillFromSurface(new Array(624).fill(300));
    const shooter = createTank(0, 'a', 0, 100, 300);
    shooter.angle = 45;
    shooter.power = 900; // would sail far past x = 300
    const unguided = flyToEnd(world(terrain), launch(shooter));
    expect(unguided.kind === 'lost' || (unguided.kind === 'hitTerrain' && unguided.x > 400)).toBe(
      true,
    );
    const p = launch(shooter);
    p.guidance = { axis: 'H', tx: 300, ty: 296, locked: false };
    const r = flyToEnd(world(terrain), p);
    expect(r.kind).toBe('hitTerrain');
    if (r.kind === 'hitTerrain') expect(Math.abs(r.x - 300)).toBeLessThan(1);
  });

  it("Vick's (V) levels off at the target's height and flies into it", () => {
    const terrain = new Terrain(624, 320);
    terrain.fillFromSurface(new Array(624).fill(310));
    // A tall pillar for the target to sit on, far below the shell's apex.
    for (let x = 440; x < 470; x++)
      for (let y = 200; y < 310; y++) terrain.set(x, y, Material.Dirt);
    const target = createTank(1, 'b', 1, 455, 200);
    const shooter = createTank(0, 'a', 0, 100, 310);
    shooter.angle = 60;
    shooter.power = 500; // lands short of the pillar unguided
    const w = { ...world(terrain), tanks: [shooter, target] };
    const p = launch(shooter);
    p.guidance = { axis: 'V', tx: 455, ty: 196.5, locked: false };
    const r = flyToEnd(w, p);
    expect(r).toMatchObject({ kind: 'hitTank', tankId: 1 });
  });

  it('setGuidance needs the item and a living enemy target; firing spends one and disarms', () => {
    const round = new Round({
      seed: 6,
      players: [
        { name: 'a', color: 0, inventory: inv({ guidanceH: 2, leadBall: 5 }) },
        { name: 'b', color: 1, inventory: inv({ guidanceH: 2, leadBall: 5 }) },
      ],
      wind: 0,
    });
    while (round.phase !== 'aiming') round.tick();
    const me = round.current!;
    const other = round.tanks.find((t) => t.id !== me.id)!;
    expect(round.command({ type: 'setGuidance', axis: 'V', targetId: other.id })).toBe(false);
    expect(round.command({ type: 'setGuidance', axis: 'H', targetId: me.id })).toBe(false);
    expect(round.command({ type: 'setGuidance', axis: 'H', targetId: other.id })).toBe(true);
    expect(me.guidance).toEqual({ axis: 'H', targetId: other.id });
    round.command({ type: 'selectWeapon', index: LEAD_BALL });
    round.command({ type: 'fire' });
    expect(round.projectile?.guidance).toMatchObject({ axis: 'H', tx: other.x });
    expect(me.inventory[itemIndex('guidanceH')]).toBe(1);
    expect(me.guidance).toBeNull();
  });
});
