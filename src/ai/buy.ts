import type { Rng } from '../core/rng';
import { BUYABLE, canAddToCart, emptyCart, type Cart } from '../game/economy';
import { itemIndex } from '../sim/items';
import type { ConcreteAi } from './registry';

const id = itemIndex;

/** Shopping priorities per personality, most wanted first. */
const PRIORITIES: Record<Exclude<ConcreteAi, 'stupid'>, readonly string[]> = {
  lobber: ['incineratorMk2', 'nuke20kt', 'incinerator'],
  windlessWit: ['incineratorMk2', 'nuke20kt', 'incinerator', 'nuke5mt'],
  rifleman: ['laser', 'incineratorMk2', 'incinerator', 'shieldEnergy'],
  lobAndShoot: ['laser', 'shieldEnergy', 'incineratorMk2', 'nuke20kt', 'incinerator'],
  twanger: ['shieldEnergy', 'laser', 'nuke20kt', 'incineratorMk2', 'incinerator'],
  birdyBonker: ['shieldEnergy', 'nuke20kt', 'incineratorMk2', 'nuke5mt', 'shieldInertia'],
};

/** Don't buy more of something while holding at least this much. */
const ENOUGH: Partial<Record<string, number>> = {
  incinerator: 20,
  laser: 1500,
  shieldEnergy: 600,
  shieldInertia: 100,
};

/**
 * What a computer buys between games. Simple, like the original's: work down a priority list,
 * at most two bundles of each, keeping a bit of money back. Mr. Stupid buys at random.
 */
export function aiShoppingList(
  ai: ConcreteAi,
  money: number,
  inventory: readonly number[],
  rng: Rng,
): Cart {
  const cart = emptyCart();
  const budget = Math.floor(money * (ai === 'stupid' ? rng.range(0.3, 1) : 0.85));
  if (ai === 'stupid') {
    for (let tries = 0; tries < 6; tries++) {
      const item = rng.pick(BUYABLE);
      if (canAddToCart(item, cart, budget)) cart[item]! += 1;
    }
    return cart;
  }
  for (const name of PRIORITIES[ai]) {
    const item = id(name);
    const enough = ENOUGH[name];
    if (enough !== undefined && (inventory[item] ?? 0) >= enough) continue;
    for (let n = 0; n < 2 && canAddToCart(item, cart, budget); n++) cart[item]! += 1;
  }
  return cart;
}
