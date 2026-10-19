import { describe, expect, it } from 'vitest';
import { MenuList, type MenuItem } from '../src/ui/widgets';

const key = (code: string) =>
  ({ type: 'key', code, key: '', shift: false, repeat: false }) as const;

describe('MenuList', () => {
  const items: MenuItem[] = [
    { id: 'h1', label: 'Rules', header: true },
    { id: 'a', label: 'A', value: () => '' },
    { id: 'h2', label: 'Sound', header: true },
    { id: 'b', label: 'B', value: () => '' },
  ];

  it('starts on the first selectable row and skips headings both ways', () => {
    const list = new MenuList(items, 0, 0, 100, 10);
    expect(items[list.selected]!.id).toBe('a');
    list.handle(key('ArrowDown'));
    expect(items[list.selected]!.id).toBe('b');
    list.handle(key('ArrowDown'));
    expect(items[list.selected]!.id).toBe('a');
    list.handle(key('ArrowUp'));
    expect(items[list.selected]!.id).toBe('b');
  });

  it('ignores clicks on headings and can focus a row by id', () => {
    const list = new MenuList(items, 0, 0, 100, 10);
    list.select('b');
    expect(list.handle({ type: 'click', x: 50, y: 5, button: 0 } as never)).toBe(false);
    expect(items[list.selected]!.id).toBe('b');
    list.select('h1');
    expect(items[list.selected]!.id).toBe('b');
  });
});
