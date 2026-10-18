import { describe, expect, it } from 'vitest';
import {
  BASE_INCOME,
  BUYABLE,
  canAddToCart,
  cartCost,
  CHEAPEST_PRICE,
  emptyCart,
  MONEY_PER_POINT,
  purchase,
  roundIncome,
} from '../src/game/economy';
import { GameSet } from '../src/game/set';
import { DEFAULT_SETTINGS, defaultSlots } from '../src/game/settings';
import { itemIndex, ITEMS, LEAD_BALL } from '../src/sim/items';

describe('economy', () => {
  it('pays a base income plus money per point, never less than the base', () => {
    expect(roundIncome(0)).toBe(BASE_INCOME);
    expect(roundIncome(-200)).toBe(BASE_INCOME);
    expect(roundIncome(450)).toBe(BASE_INCOME + 450 * MONEY_PER_POINT);
  });

  it('sells everything except Lead Balls and Hand Grenades', () => {
    expect(BUYABLE).toHaveLength(20);
    expect(BUYABLE).not.toContain(LEAD_BALL);
    expect(BUYABLE).not.toContain(itemIndex('grenade'));
    expect(CHEAPEST_PRICE).toBe(3000);
  });

  it('prices a cart and respects the budget', () => {
    const cart = emptyCart();
    cart[itemIndex('incinerator')] = 2;
    cart[itemIndex('nuke20kt')] = 1;
    expect(cartCost(cart)).toBe(2 * 3000 + 7000);
    expect(canAddToCart(itemIndex('incinerator'), cart, 16000)).toBe(true);
    expect(canAddToCart(itemIndex('nuke5mt'), cart, 16000)).toBe(false);
    expect(canAddToCart(LEAD_BALL, emptyCart(), 1e9)).toBe(false);
  });

  it('purchases add whole bundles and spend the money', () => {
    const inv = new Array(ITEMS.length).fill(0);
    const cart = emptyCart();
    cart[itemIndex('incinerator')] = 1;
    cart[itemIndex('laser')] = 2;
    cart[itemIndex('shieldInertia')] = 1;
    const left = purchase(inv, 50000, cart);
    expect(left).toBe(50000 - 3000 - 20000 - 10000);
    expect(inv[itemIndex('incinerator')]).toBe(100);
    expect(inv[itemIndex('laser')]).toBe(2000);
    expect(inv[itemIndex('shieldInertia')]).toBe(100);
  });

  it('refuses to overspend or to sell unbuyable items', () => {
    const cart = emptyCart();
    cart[itemIndex('guidanceH')] = 1;
    expect(() => purchase([], 1000, cart)).toThrow(RangeError);
    const bad = emptyCart();
    bad[LEAD_BALL] = 1;
    expect(() => purchase([], 1e6, bad)).toThrow(RangeError);
  });

  it('sets pay income after every game', () => {
    const set = new GameSet(
      { ...DEFAULT_SETTINGS, gamesPerSet: 2 },
      defaultSlots(),
      1,
      undefined,
      100,
    );
    const round = set.startRound();
    while (round.phase !== 'aiming') round.tick();
    round.stats[0]!.damageDealt = 50;
    round.phase = 'roundOver';
    round.winnerId = null;
    set.finishRound(round);
    expect(set.players[0]!.money).toBe(100 + roundIncome(50));
    expect(set.players[1]!.money).toBe(100 + BASE_INCOME);
    expect(set.lastRoundIncome).toEqual([roundIncome(50), BASE_INCOME]);
  });
});
