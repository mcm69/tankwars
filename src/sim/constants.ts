/**
 * Battlefield size in logical pixels. The original's playfield was roughly 300x146 inside a
 * 320x200 screen; this is about 2x that, a little taller to suit 16:9 phones.
 */
export const FIELD_WIDTH = 624;
export const FIELD_HEIGHT = 320;

// Physics, in logical pixels and sim ticks (60/s). Tuned so a 45° shot at ~700 power crosses
// the field in about 2.5 s, and full power reaches roughly twice the field width.
export const GRAVITY = 0.05;
export const POWER_TO_SPEED = 0.008;
/** Horizontal acceleration per unit of wind. Wind 100 shifts a cross-field shot by ~1/4 field. */
export const WIND_ACCEL = 0.00012;
/** Terminal speed per axis, px/tick: keeps gale-force shots from needing absurd sub-steps. */
export const MAX_SPEED = 40;
/** Safety cap on flight time; a shot in the air longer than this is discarded. */
export const MAX_FLIGHT_TICKS = 60 * 30;

export const MAX_HEALTH = 100;
/** Power is capped at health × this (full health = 1000). */
export const POWER_PER_HEALTH = 10;

/** Fall speed cap for unsupported tanks, pixels per tick. */
export const TANK_FALL_SPEED = 4;

/** Falls shorter than this many pixels don't hurt. */
export const FALL_DAMAGE_THRESHOLD = 4;
/** Damage per pixel fallen beyond the threshold. */
export const FALL_DAMAGE_PER_PIXEL = 0.5;
/** Loose-ground collapse speed: max 1-px passes per tick, reached after accelerating. */
export const CRUMBLE_MAX_PASSES = 6;
