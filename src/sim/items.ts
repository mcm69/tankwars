/**
 * Everything a tank can own: 18 weapons, 2 guidance systems, 2 shields. Order matches the
 * original's equipment strip (weapons 0–17, then H and V). Prices and bundle sizes come from
 * the tables in BOMB.EXE (see WORKING_NOTES); `null` price = not for sale.
 */

export type ItemKind = 'weapon' | 'guidance' | 'shield';

/** What a weapon does when it lands (or, for the laser, when fired). */
export type Behavior =
  /** Fireball: carves a crater and damages tanks with linear falloff. */
  | { readonly kind: 'blast'; readonly radius: number; readonly damage: number }
  /** Just flies; lands with a puff. */
  | { readonly kind: 'harmless' }
  /** Instant beam that spends laser energy (the power setting) instead of one unit. */
  | { readonly kind: 'laser' }
  /** Chain reaction eating `budget` pixels of ground; fluid ("D") spreads densely. */
  | { readonly kind: 'cri'; readonly budget: number; readonly fluid: boolean }
  /** Collapses all loose ground on the field. */
  | { readonly kind: 'sonic' }
  /** Fills a ball of dirt. */
  | { readonly kind: 'dirt'; readonly radius: number }
  /** Sprays dirt clods into the air, where they freeze into floating dirt. */
  | { readonly kind: 'explosiveDirt'; readonly clods: number };

export interface ItemDef {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly kind: ItemKind;
  readonly price: number | null;
  readonly bundle: number;
  /** Weapons only. */
  readonly behavior?: Behavior;
}

export const ITEMS: readonly ItemDef[] = [
  {
    id: 'leadBall',
    name: 'Lead Ball',
    short: 'Lead Ball',
    kind: 'weapon',
    price: null,
    bundle: 0,
    behavior: { kind: 'harmless' },
  },
  {
    id: 'incinerator',
    name: 'Incinerator',
    short: 'Incinerator',
    kind: 'weapon',
    price: 3000,
    bundle: 100,
    behavior: { kind: 'blast', radius: 20, damage: 150 },
  },
  {
    id: 'incineratorMk2',
    name: 'Mark II Incinerator',
    short: 'Mark II Incin.',
    kind: 'weapon',
    price: 4000,
    bundle: 10,
    behavior: { kind: 'blast', radius: 32, damage: 160 },
  },
  {
    id: 'nuke20kt',
    name: '20 Kiloton Nuke',
    short: '20 Kilo Nuke',
    kind: 'weapon',
    price: 7000,
    bundle: 2,
    behavior: { kind: 'blast', radius: 62, damage: 220 },
  },
  {
    id: 'nuke5mt',
    name: '5 Megaton Nuke',
    short: '5 Meg Nuke',
    kind: 'weapon',
    price: 10000,
    bundle: 1,
    behavior: { kind: 'blast', radius: 115, damage: 260 },
  },
  {
    id: 'laser',
    name: 'Laser Blaster',
    short: 'Laser',
    kind: 'weapon',
    price: 10000,
    bundle: 1000,
    behavior: { kind: 'laser' },
  },
  {
    id: 'cri4d',
    name: 'Chain Reaction Inducer 4/D',
    short: 'CRI 4/D',
    kind: 'weapon',
    price: 5000,
    bundle: 5,
    behavior: { kind: 'cri', budget: 2500, fluid: true },
  },
  {
    id: 'cri8nd',
    name: 'Chain Reaction Inducer 8/ND',
    short: 'CRI 8/ND',
    kind: 'weapon',
    price: 5000,
    bundle: 10,
    behavior: { kind: 'cri', budget: 4000, fluid: false },
  },
  {
    id: 'cri8d',
    name: 'Chain Reaction Inducer 8/D',
    short: 'CRI 8/D',
    kind: 'weapon',
    price: 10000,
    bundle: 3,
    behavior: { kind: 'cri', budget: 7000, fluid: true },
  },
  {
    id: 'cri20nd',
    name: 'Chain Reaction Inducer 20/ND',
    short: 'CRI 20/ND',
    kind: 'weapon',
    price: 10000,
    bundle: 3,
    behavior: { kind: 'cri', budget: 12000, fluid: false },
  },
  {
    id: 'cri20d',
    name: 'Chain Reaction Inducer 20/D',
    short: 'CRI 20/D',
    kind: 'weapon',
    price: 15000,
    bundle: 1,
    behavior: { kind: 'cri', budget: 30000, fluid: true },
  },
  {
    id: 'grenade',
    name: 'Hand Grenade',
    short: 'Hand Grenade',
    kind: 'weapon',
    price: null,
    bundle: 0,
    behavior: { kind: 'blast', radius: 8, damage: 110 },
  },
  {
    id: 'sonic',
    name: 'Sonic Blaster',
    short: 'Sonic Blaster',
    kind: 'weapon',
    price: 4500,
    bundle: 10,
    behavior: { kind: 'sonic' },
  },
  {
    id: 'dirtBall',
    name: 'Ball o Dirt',
    short: "Ball 'O' Dirt",
    kind: 'weapon',
    price: 4000,
    bundle: 10,
    behavior: { kind: 'dirt', radius: 18 },
  },
  {
    id: 'dirtBallMk2',
    name: 'Ball o Dirt Mark II',
    short: 'Mark II Dirt',
    kind: 'weapon',
    price: 6000,
    bundle: 7,
    behavior: { kind: 'dirt', radius: 28 },
  },
  {
    id: 'dirtCompressed',
    name: 'Ball o Compressed Dirt',
    short: 'Pressured Dirt',
    kind: 'weapon',
    price: 8000,
    bundle: 3,
    behavior: { kind: 'dirt', radius: 40 },
  },
  {
    id: 'dirtSuper',
    name: 'Ball o Super-Compressed Dirt',
    short: 'High Pres. Dirt',
    kind: 'weapon',
    price: 10000,
    bundle: 1,
    behavior: { kind: 'dirt', radius: 56 },
  },
  {
    id: 'dirtExplosive',
    name: 'Explosive Dirt',
    short: 'Xplosive Dirt',
    kind: 'weapon',
    price: 4500,
    bundle: 10,
    behavior: { kind: 'explosiveDirt', clods: 48 },
  },
  {
    id: 'guidanceH',
    name: "Herb's Guidance System",
    short: "Herb's Guide",
    kind: 'guidance',
    price: 20000,
    bundle: 5,
  },
  {
    id: 'guidanceV',
    name: "Vick's Guidance System",
    short: "Vick's Guide",
    kind: 'guidance',
    price: 20000,
    bundle: 5,
  },
  {
    id: 'shieldEnergy',
    name: 'Energy Absorbtion Shield',
    short: 'Energy Shield',
    kind: 'shield',
    price: 20000,
    bundle: 1000,
  },
  {
    id: 'shieldInertia',
    name: 'Inertia Dampener',
    short: 'Inertia Damp.',
    kind: 'shield',
    price: 10000,
    bundle: 100,
  },
];

export const WEAPON_COUNT = 18;
/** Items shown on the equipment strip: all weapons plus the two guidance systems. */
export const STRIP_ITEMS = 20;

export function itemIndex(id: string): number {
  const i = ITEMS.findIndex((it) => it.id === id);
  if (i < 0) throw new RangeError(`Unknown item ${id}`);
  return i;
}

export const LEAD_BALL = itemIndex('leadBall');
export const GUIDANCE_H = itemIndex('guidanceH');
export const GUIDANCE_V = itemIndex('guidanceV');

/**
 * Starting inventory from the original 2.5 rules: 100 Lead Balls per set, plus 10 Hand Grenades
 * and 3 Incinerators per game in the set.
 */
export function startingInventory(gamesPerSet = 1): number[] {
  const inv = new Array<number>(ITEMS.length).fill(0);
  inv[LEAD_BALL] = 100;
  inv[itemIndex('grenade')] = 10 * gamesPerSet;
  inv[itemIndex('incinerator')] = 3 * gamesPerSet;
  return inv;
}

/** Dev/test arsenal: plenty of everything. */
export function fullInventory(count = 99): number[] {
  return ITEMS.map((it) => (it.kind === 'weapon' ? count : 0));
}
