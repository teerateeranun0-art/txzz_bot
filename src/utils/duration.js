import ms from 'ms';

export function parseDuration(input, { min = 1000, max = 28 * 24 * 60 * 60 * 1000 } = {}) {
  if (typeof input !== 'string' || input.length > 32) return null;
  const value = ms(input.trim());
  if (!Number.isFinite(value) || value < min || value > max) return null;
  return value;
}
