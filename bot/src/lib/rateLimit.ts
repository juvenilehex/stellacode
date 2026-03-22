const store = new Map<string, number[]>();

export function checkRateLimit(
  userId: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const timestamps = store.get(userId) ?? [];

  // Remove expired entries
  const valid = timestamps.filter((t) => now - t < windowMs);

  if (valid.length >= limit) {
    store.set(userId, valid);
    return false; // rate limited
  }

  valid.push(now);
  store.set(userId, valid);
  return true; // allowed
}
