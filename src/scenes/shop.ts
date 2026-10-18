import type { App } from '../app';
import type { Rect } from '../config';
import { LOGICAL_WIDTH } from '../config';
import { BUYABLE, canAddToCart, cartCost, emptyCart, purchase, type Cart } from '../game/economy';
import type { SetPlayer } from '../game/set';
import { UiInput } from '../input/ui-input';
import { drawText, drawTextShadow } from '../render/font';
import { itemIcon } from '../render/icons';
import { PLAYER_COLORS } from '../render/tank-sprite';
import { ITEMS } from '../sim/items';
import { backdrop, button, inside, panel, UI } from '../ui/widgets';
import type { Scene } from './scene';

const ROWS = 10;
const COL_W = 304;
const ROW_H = 28;
const GRID_X = 12;
const GRID_Y = 82;
const PURCHASE_RECT: Rect = { x: 22, y: 46, w: 110, h: 22 };
const DONE_RECT: Rect = { x: 508, y: 46, w: 110, h: 22 };

const rowRect = (k: number): Rect => ({
  x: GRID_X + Math.floor(k / ROWS) * (COL_W + 8),
  y: GRID_Y + (k % ROWS) * ROW_H,
  w: COL_W,
  h: ROW_H - 2,
});
const minusRect = (k: number): Rect => {
  const r = rowRect(k);
  return { x: r.x + 210, y: r.y + 5, w: 16, h: 16 };
};
const plusRect = (k: number): Rect => {
  const r = rowRect(k);
  return { x: r.x + 262, y: r.y + 5, w: 16, h: 16 };
};
/** Generous tap targets around the small −/+ buttons (full row height). */
const minusHit = (k: number): Rect => {
  const r = rowRect(k);
  return { x: r.x + 196, y: r.y, w: 42, h: r.h };
};
const plusHit = (k: number): Rect => {
  const r = rowRect(k);
  return { x: r.x + 250, y: r.y, w: 42, h: r.h };
};

const INPUT_GRACE_TICKS = 15;
const money = (n: number) => `$${n.toLocaleString('en-US')}`;

/**
 * Between-games equipment shop for one human player, in the spirit of the original: pick
 * bundles with + and −, then Purchase (stay) or Done (buy and leave).
 * Keys: arrows select · + / Enter add · − / Backspace remove · P purchase · D done ·
 * Esc leave without buying the selection.
 */
export class ShopScene implements Scene {
  readonly name = 'shop';
  private readonly input: UiInput;
  private cart: Cart = emptyCart();
  private selected = 0;
  private flash: { text: string; ticks: number } | null = null;
  private ticks = 0;

  constructor(
    private readonly app: App,
    private readonly player: SetPlayer,
    private readonly onDone: () => void,
  ) {
    this.input = new UiInput(app.screen);
  }

  private get unallocated(): number {
    return this.player.money - cartCost(this.cart);
  }

  private add(k: number, dir: 1 | -1): void {
    const item = BUYABLE[k]!;
    this.selected = k;
    if (dir > 0) {
      if (canAddToCart(item, this.cart, this.player.money)) {
        this.cart[item]! += 1;
        this.app.audio.ui('change');
      } else {
        this.say('Not enough money');
        this.app.audio.ui('error');
      }
    } else if (this.cart[item]! > 0) {
      this.cart[item]! -= 1;
      this.app.audio.ui('back');
    }
  }

  private buy(): void {
    if (cartCost(this.cart) === 0) return;
    this.player.money = purchase(this.player.inventory, this.player.money, this.cart);
    this.cart = emptyCart();
    this.app.audio.ui('purchase');
    this.say('Purchased!');
  }

  private say(text: string): void {
    this.flash = { text, ticks: 90 };
  }

  update(): void {
    if (this.flash && --this.flash.ticks <= 0) this.flash = null;
    const n = BUYABLE.length;
    const events = this.input.poll();
    // Ignore input briefly so a key that closed the previous screen doesn't buy something.
    if (++this.ticks < INPUT_GRACE_TICKS) return;
    for (const e of events) {
      if (e.type === 'key') {
        switch (e.code) {
          case 'ArrowUp':
            this.selected = (this.selected + n - 1) % n;
            break;
          case 'ArrowDown':
            this.selected = (this.selected + 1) % n;
            break;
          case 'ArrowLeft':
          case 'ArrowRight':
            this.selected = (this.selected + ROWS) % (ROWS * 2);
            if (this.selected >= n) this.selected = n - 1;
            break;
          case 'Equal':
          case 'NumpadAdd':
          case 'Enter':
          case 'Space':
            this.add(this.selected, 1);
            break;
          case 'Minus':
          case 'NumpadSubtract':
          case 'Backspace':
            this.add(this.selected, -1);
            break;
          case 'KeyP':
            if (!e.repeat) this.buy();
            break;
          case 'KeyD':
            if (!e.repeat) return this.done(true);
            break;
          case 'Escape':
            return this.done(false);
        }
      } else if (e.type === 'click') {
        if (inside(PURCHASE_RECT, e.x, e.y)) this.buy();
        else if (inside(DONE_RECT, e.x, e.y)) return this.done(true);
        for (let k = 0; k < n; k++) {
          if (inside(minusHit(k), e.x, e.y)) this.add(k, -1);
          else if (inside(plusHit(k), e.x, e.y)) this.add(k, 1);
          // Clicking the row itself: left adds, right removes.
          else if (inside(rowRect(k), e.x, e.y)) this.add(k, e.button === 2 ? -1 : 1);
        }
      } else if (e.type === 'wheel') {
        for (let k = 0; k < n; k++) if (inside(rowRect(k), e.x, e.y)) this.add(k, e.dir);
      }
    }
  }

  private done(buySelection: boolean): void {
    if (buySelection) this.buy();
    this.onDone();
  }

  render(): void {
    const { ctx } = this.app.screen;
    backdrop(ctx);
    const p = this.player;
    const color = PLAYER_COLORS[p.color]!;
    const hover = this.input.pointer;

    panel(ctx, { x: 8, y: 6, w: 624, h: 70 });
    drawText(ctx, 'UNALLOCATED', 22, 16, UI.label);
    drawText(ctx, money(this.unallocated), 22, 28, UI.value, 2);
    drawTextShadow(ctx, p.name, LOGICAL_WIDTH / 2, 16, color, 3, 'center');
    drawText(ctx, 'YOU HAVE', 618, 16, UI.label, 1, 'right');
    drawText(ctx, money(p.money), 618, 28, UI.value, 2, 'right');
    const cost = cartCost(this.cart);
    button(ctx, PURCHASE_RECT, 'Purchase', {
      disabled: cost === 0,
      hover: !!hover && inside(PURCHASE_RECT, hover.x, hover.y),
    });
    button(ctx, DONE_RECT, 'Done', {
      primary: true,
      hover: !!hover && inside(DONE_RECT, hover.x, hover.y),
    });
    drawText(
      ctx,
      cost > 0 ? `Selected: ${money(cost)}` : 'Pick what to buy',
      LOGICAL_WIDTH / 2,
      56,
      cost > 0 ? '#ff9a6a' : UI.dim,
      1,
      'center',
    );

    BUYABLE.forEach((item, k) => {
      const def = ITEMS[item]!;
      const r = rowRect(k);
      const sel = k === this.selected;
      const affordable = canAddToCart(item, this.cart, p.money);
      ctx.fillStyle = sel ? '#2a1840' : '#160f24';
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = sel ? UI.border : '#2a2238';
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      ctx.drawImage(itemIcon(item, !affordable && this.cart[item] === 0), r.x + 6, r.y + 8);
      drawText(ctx, def.short, r.x + 22, r.y + 4, affordable ? '#ff6a6a' : '#8a5060');
      drawText(ctx, `${def.bundle} for ${def.price}`, r.x + 22, r.y + 15, UI.dim);
      const owned = p.inventory[item] ?? 0;
      drawText(ctx, owned > 0 ? `have ${owned}` : '', r.x + 202, r.y + 9, UI.text, 1, 'right');
      button(ctx, minusRect(k), '-', { scale: 1, disabled: this.cart[item] === 0 });
      drawText(
        ctx,
        String(this.cart[item]),
        r.x + 244,
        r.y + 9,
        this.cart[item] ? UI.value : UI.dim,
        1,
        'center',
      );
      button(ctx, plusRect(k), '+', { scale: 1, disabled: !affordable });
      // The original's affordability light: red you can buy, dark you can't.
      ctx.fillStyle = affordable ? '#ff3a3a' : '#2a1820';
      ctx.fillRect(r.x + r.w - 16, r.y + 10, 6, 6);
    });

    if (this.flash)
      drawTextShadow(ctx, this.flash.text, LOGICAL_WIDTH / 2, 366, '#ffffff', 1, 'center');
    drawText(
      ctx,
      this.app.screen.touch
        ? 'Tap a row or + to add, - to remove, then Done'
        : 'arrows select  + add  - remove  P purchase  D done  Esc leave',
      LOGICAL_WIDTH / 2,
      386,
      UI.dim,
      1,
      'center',
    );
  }

  dispose(): void {
    this.input.dispose();
  }
}
