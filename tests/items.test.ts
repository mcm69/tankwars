import { describe, expect, it } from 'vitest';
import { iconArt } from '../src/render/icons';
import {
  GUIDANCE_H,
  GUIDANCE_V,
  itemIndex,
  ITEMS,
  LEAD_BALL,
  startingInventory,
  STRIP_ITEMS,
  WEAPON_COUNT,
} from '../src/sim/items';
import { createTank, nextOwnedWeapon } from '../src/sim/tank';

describe('item catalog', () => {
  it('has 18 weapons, then H and V guidance, then 2 shields', () => {
    expect(ITEMS).toHaveLength(22);
    expect(ITEMS.slice(0, WEAPON_COUNT).every((i) => i.kind === 'weapon')).toBe(true);
    expect([GUIDANCE_H, GUIDANCE_V]).toEqual([18, 19]);
    expect(STRIP_ITEMS).toBe(20);
    expect(ITEMS.slice(20).every((i) => i.kind === 'shield')).toBe(true);
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(22);
  });

  it('matches the prices and bundles read from the original', () => {
    const pb = (id: string) => [ITEMS[itemIndex(id)]!.price, ITEMS[itemIndex(id)]!.bundle];
    expect(pb('incinerator')).toEqual([3000, 100]);
    expect(pb('nuke20kt')).toEqual([7000, 2]);
    expect(pb('laser')).toEqual([10000, 1000]);
    expect(pb('cri20d')).toEqual([15000, 1]);
    expect(pb('dirtExplosive')).toEqual([4500, 10]);
    expect(pb('guidanceH')).toEqual([20000, 5]);
    expect(ITEMS[LEAD_BALL]!.price).toBeNull();
    expect(ITEMS[itemIndex('grenade')]!.price).toBeNull();
  });

  it('gives every item a well-formed 10×10 icon', () => {
    for (const item of ITEMS) {
      const art = iconArt(item.id);
      expect(art, item.id).toBeDefined();
      expect(art!).toHaveLength(10);
      for (const row of art!) expect(row, item.id).toHaveLength(10);
    }
  });

  it('starts with the 2.5 inventory, scaled by games per set', () => {
    const inv = startingInventory(4);
    expect(inv[LEAD_BALL]).toBe(100);
    expect(inv[itemIndex('grenade')]).toBe(40);
    expect(inv[itemIndex('incinerator')]).toBe(12);
    expect(inv.reduce((a, b) => a + b, 0)).toBe(152);
  });
});

describe('weapon selection', () => {
  it('arms the Incinerator by default, or the first owned weapon', () => {
    expect(createTank(0, 'a', 0, 0, 0).selected).toBe(itemIndex('incinerator'));
    const inv = new Array(ITEMS.length).fill(0);
    inv[itemIndex('sonic')] = 2;
    expect(createTank(0, 'a', 0, 0, 0, inv).selected).toBe(itemIndex('sonic'));
  });

  it('cycles through owned weapons only, wrapping both ways', () => {
    const t = createTank(0, 'a', 0, 0, 0); // lead ball, incinerator, grenade
    const ib = itemIndex('incinerator');
    const gr = itemIndex('grenade');
    expect(nextOwnedWeapon(t, ib, 1)).toBe(gr);
    expect(nextOwnedWeapon(t, gr, 1)).toBe(LEAD_BALL);
    expect(nextOwnedWeapon(t, LEAD_BALL, -1)).toBe(gr);
  });
});
