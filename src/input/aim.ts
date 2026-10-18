/** Logical pixels of drag distance per unit of power when aiming with the pointer. */
export const AIM_POWER_PER_PX = 5;

/**
 * Converts a pointer position relative to the turret pivot into an aim. Pointing below the
 * pivot clamps to horizontal on that side; power grows with distance.
 */
export function aimFromPointer(
  pivotX: number,
  pivotY: number,
  px: number,
  py: number,
  maxPower: number,
): { angle: number; power: number } {
  const dx = px - pivotX;
  const dy = pivotY - py; // up is positive
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (dy < 0) angle = dx >= 0 ? 0 : 180;
  const power = Math.min(maxPower, Math.round(Math.hypot(dx, dy) * AIM_POWER_PER_PX));
  return { angle: Math.round(angle), power };
}
