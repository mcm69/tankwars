import { describe, expect, it } from 'vitest';
import { aimFromPointer } from '../src/input/aim';
import type { InputEvent } from '../src/input/events';
import { KeyboardController } from '../src/input/keyboard';
import { FONT_CHARS, glyphRows, textWidth } from '../src/render/font';
import { HUD_RECTS, hudHitTest, slotRect } from '../src/render/hud-layout';

describe('HUD layout', () => {
  it('hit-tests buttons and slots', () => {
    const fire = HUD_RECTS.fire;
    expect(hudHitTest(fire.x + 1, fire.y + 1)).toBe('fire');
    const s = slotRect(11);
    expect(hudHitTest(s.x + 5, s.y + 5)).toBe('slot:11');
    expect(hudHitTest(320, 300)).toBeNull();
  });

  it('has no overlapping interactive regions', () => {
    const rects = [
      ...Object.values(HUD_RECTS),
      ...Array.from({ length: 20 }, (_, i) => slotRect(i)),
    ];
    for (let a = 0; a < rects.length; a++) {
      for (let b = a + 1; b < rects.length; b++) {
        const r1 = rects[a]!;
        const r2 = rects[b]!;
        const overlap =
          r1.x < r2.x + r2.w && r2.x < r1.x + r1.w && r1.y < r2.y + r2.h && r2.y < r1.y + r1.h;
        expect(overlap, `${a} vs ${b}`).toBe(false);
      }
    }
    for (const r of rects) expect(r.x + r.w).toBeLessThanOrEqual(640);
  });
});

describe('aimFromPointer', () => {
  it('maps direction to angle and distance to power', () => {
    expect(aimFromPointer(0, 0, 100, 0, 1000)).toEqual({ angle: 0, power: 500 });
    expect(aimFromPointer(0, 0, 0, -100, 1000)).toEqual({ angle: 90, power: 500 });
    expect(aimFromPointer(0, 0, -50, -50, 1000).angle).toBe(135);
  });

  it('clamps below-horizontal aims and power', () => {
    expect(aimFromPointer(0, 0, 50, 20, 1000).angle).toBe(0);
    expect(aimFromPointer(0, 0, -50, 20, 1000).angle).toBe(180);
    expect(aimFromPointer(0, 0, 0, -1000, 300).power).toBe(300);
  });
});

describe('bitmap font', () => {
  it('has well-formed 5×7 glyphs for printable ASCII and HUD symbols', () => {
    for (let c = 32; c < 127; c++) expect(FONT_CHARS).toContain(String.fromCharCode(c));
    for (const ch of ['←', '→', '↑', '↓', '◀', '▶', '…', '×', '±'])
      expect(FONT_CHARS).toContain(ch);
    for (const ch of FONT_CHARS) {
      const rows = glyphRows(ch);
      expect(rows).toHaveLength(7);
      for (const r of rows) expect(r).toBeLessThan(32);
    }
  });

  it('measures text at any scale', () => {
    expect(textWidth('')).toBe(0);
    expect(textWidth('A')).toBe(5);
    expect(textWidth('AB', 2)).toBe(22);
  });
});

describe('KeyboardController', () => {
  const press = (target: EventTarget, code: string, key = '', shiftKey = false) =>
    target.dispatchEvent(
      Object.assign(new Event('keydown', { cancelable: true }), {
        code,
        key,
        shiftKey,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        repeat: false,
      }),
    );

  const setup = () => {
    const target = new EventTarget();
    const kb = new KeyboardController(target as unknown as Window);
    return { target, kb };
  };
  const meaningful = (events: InputEvent[]) => events.filter((e) => e.kind !== 'key');

  it('maps aiming, weapon and game keys', () => {
    const { target, kb } = setup();
    press(target, 'PageUp');
    press(target, 'Tab', '', true);
    press(target, 'Digit0');
    press(target, 'KeyK');
    press(target, 'Slash', '?');
    expect(meaningful(kb.poll())).toEqual([
      { kind: 'command', cmd: { type: 'power', delta: 100 } },
      { kind: 'command', cmd: { type: 'cycleWeapon', dir: -1 } },
      { kind: 'ui', action: { type: 'status', tankId: 9 } },
      { kind: 'ui', action: { type: 'massKill' } },
      { kind: 'ui', action: { type: 'help' } },
    ]);
  });

  it('reports raw key presses for answering overlays, but not modifiers', () => {
    const { target, kb } = setup();
    press(target, 'KeyY');
    press(target, 'ShiftLeft');
    expect(kb.poll()).toEqual([{ kind: 'key', code: 'KeyY' }]);
  });

  it('auto-repeats held arrows after a delay, accelerating', () => {
    const { target, kb } = setup();
    press(target, 'ArrowUp');
    const steps: number[] = [];
    for (let i = 0; i < 100; i++) {
      for (const e of kb.poll())
        if (e.kind === 'command' && e.cmd.type === 'power') steps.push(e.cmd.delta);
    }
    expect(steps[0]).toBe(1); // the tap
    expect(steps.length).toBeGreaterThan(80);
    expect(steps.at(-1)).toBe(10);
  });
});
