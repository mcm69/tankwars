import { describe, expect, it } from 'vitest';
import { optionsFromParams } from '../src/ui/options-params';

describe('optionsFromParams', () => {
  it('parses valid values', () => {
    const p = new URLSearchParams('wind=gale&walls=on&crumble=75&fall=0&visible=false&trail=1');
    expect(optionsFromParams(p)).toEqual({
      wind: 'gale',
      walls: 'on',
      crumble: 75,
      tanksFall: false,
      visibleShot: false,
      shotTrail: true,
    });
  });

  it('ignores missing and invalid values', () => {
    expect(optionsFromParams(new URLSearchParams('wind=tornado&walls=up&crumble=150'))).toEqual({});
  });
});
