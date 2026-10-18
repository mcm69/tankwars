import { WIND_LEVELS, type GameOptions, type WallMode, type WindLevel } from '../sim/options';

/** Reads game options from URL parameters (dev and test convenience); ignores bad values. */
export function optionsFromParams(params: URLSearchParams): Partial<GameOptions> {
  const out: Partial<GameOptions> = {};
  const wind = params.get('wind');
  if (wind && (wind === 'random' || (WIND_LEVELS as readonly string[]).includes(wind))) {
    out.wind = wind as WindLevel | 'random';
  }
  const walls = params.get('walls');
  if (walls === 'on' || walls === 'off' || walls === 'random') out.walls = walls as WallMode;
  const crumble = Number(params.get('crumble'));
  if (params.has('crumble') && crumble >= 0 && crumble <= 100) out.crumble = crumble;
  const flag = (name: string) => {
    const v = params.get(name);
    return v === null ? undefined : v !== '0' && v !== 'false';
  };
  const fall = flag('fall');
  if (fall !== undefined) out.tanksFall = fall;
  const visible = flag('visible');
  if (visible !== undefined) out.visibleShot = visible;
  const trail = flag('trail');
  if (trail !== undefined) out.shotTrail = trail;
  return out;
}
