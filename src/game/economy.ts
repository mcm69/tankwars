import { ITEMS } from '../sim/items';

/** Dollars earned per point of round score (the original tied money directly to score). */
export const MONEY_PER_POINT = 10;
/** Paid to everyone each game, so even the losers can buy something eventually. */
export const BASE_INCOME = 500;

/** Money earned for a finished game. Negative scores earn only the base income. */
export function roundIncome(roundScore: number): number {
  return BASE_INCOME + Math.max(0, roundScore) * MONEY_PER_POINT;
}

/** Items that can be bought (Lead Balls and Hand Grenades can't). */
export const BUYABLE: readonly number[] = ITEMS.map((_, i) => i).filter(
  (i) => ITEMS[i]!.price !== null,
);

export const CHEAPEST_PRICE = Math.min(...BUYABLE.map((i) => ITEMS[i]!.price!));

/** Bundles of each item selected for purchase, indexed like ITEMS. */
export type Cart = number[];

export function emptyCart(): Cart {
  return new Array<number>(ITEMS.length).fill(0);
}

export function cartCost(cart: readonly number[]): number {
  return cart.reduce((sum, qty, i) => sum + qty * (ITEMS[i]?.price ?? 0), 0);
}

/** Whether one more bundle of `item` fits in the budget on top of the cart. */
export function canAddToCart(item: number, cart: readonly number[], money: number): boolean {
  const price = ITEMS[item]?.price;
  return price !== null && price !== undefined && cartCost(cart) + price <= money;
}

/**
 * Buys the cart: adds `bundle × qty` of each item to the inventory and returns the money left.
 * Throws if the cart contains unbuyable items or costs more than `money`.
 */
export function purchase(inventory: number[], money: number, cart: readonly number[]): number {
  const cost = cartCost(cart);
  if (cost > money) throw new RangeError(`Cart costs ${cost}, only ${money} available`);
  cart.forEach((qty, i) => {
    if (qty <= 0) return;
    const item = ITEMS[i];
    if (!item || item.price === null) throw new RangeError(`${item?.id ?? i} is not for sale`);
    inventory[i] = (inventory[i] ?? 0) + qty * item.bundle;
  });
  return money - cost;
}
