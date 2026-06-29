const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 20;

const hits = new Map();

export function rateLimit(ip) {
  const now = Date.now();
  const timestamps = hits.get(ip) ?? [];
  const recent = timestamps.filter((t) => now - t < WINDOW_MS);

  if (recent.length >= MAX_REQUESTS) {
    hits.set(ip, recent);
    return { allowed: false };
  }
  recent.push(now);
  hits.set(ip, recent);
  return { allowed: true };
}