export const M_PER_NM = 1852;
export const MS_TO_KN = 3600 / M_PER_NM;

const BEAUFORT_UPPER_KN = [1, 4, 7, 11, 17, 22, 28, 34, 41, 48, 56, 64];
const BEAUFORT_NAMES = [
  "Calm",
  "Light air",
  "Light breeze",
  "Gentle breeze",
  "Moderate breeze",
  "Fresh breeze",
  "Strong breeze",
  "Near gale",
  "Gale",
  "Strong gale",
  "Storm",
  "Violent storm",
  "Hurricane force",
];

export function beaufort(kn: number) {
  const force = BEAUFORT_UPPER_KN.findIndex((upper) => kn < upper);
  const value = force === -1 ? 12 : force;
  return { force: value, name: BEAUFORT_NAMES[value]! };
}

const COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export function compass(deg: number) {
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]!;
}

export function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function formatNm(nm: number) {
  return `${nm.toFixed(nm >= 100 ? 0 : 1)} nm`;
}

export function formatKn(kn: number) {
  return `${kn.toFixed(1)} kn`;
}

/** Vector-average of directions (degrees), so 350° and 10° average to 0°, not 180°. */
export function meanDirection(degrees: number[]) {
  if (!degrees.length) return 0;
  let x = 0;
  let y = 0;
  for (const deg of degrees) {
    x += Math.cos((deg * Math.PI) / 180);
    y += Math.sin((deg * Math.PI) / 180);
  }
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Colour ramp for speed in knots, used on the track map and legend. */
export function speedColor(kn: number, max = 7) {
  const t = Math.max(0, Math.min(1, kn / max));
  const hue = 230 - t * 230; // blue → green → yellow → red
  return `hsl(${hue.toFixed(0)} 85% 48%)`;
}
