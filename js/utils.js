// ── Utility Functions ──────────────────────────────────────────

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const hsl = (h, s, l, a) => `hsla(${h},${s}%,${l}%,${a ?? 1})`;

export function hexAlpha(hex, alpha) {
  return hex + Math.floor(alpha * 255).toString(16).padStart(2, '0');
}

// Seeded PRNG (mulberry32)
export function createRNG(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string to a number (for seeded RNG)
export function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Easing functions
export const easeOutQuad = t => t * (2 - t);
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
export const easeInQuad = t => t * t;
export const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
