// Limitador en memoria. Se reinicia al reiniciar el servidor.
// Para producción a gran escala se recomienda Redis.

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 10 * 60 * 1000; // 10 minutos
const BLOCK_MS = 30 * 60 * 1000; // 30 minutos

interface IpRecord {
  attempts: number;
  firstAttemptAt: number;
  blockedUntil: number;
}

const store = new Map<string, IpRecord>();

function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return "127.0.0.1";
}

function cleanup(now: number): void {
  for (const [ip, record] of store.entries()) {
    if (record.blockedUntil < now && now - record.firstAttemptAt > WINDOW_MS) {
      store.delete(ip);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  blockedUntil: number | null;
  attemptsLeft: number;
  ip: string;
}

export function checkRateLimit(request: Request): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const ip = getClientIp(request);
  const record = store.get(ip);

  if (record && record.blockedUntil > now) {
    return {
      allowed: false,
      blockedUntil: record.blockedUntil,
      attemptsLeft: 0,
      ip,
    };
  }

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    store.set(ip, { attempts: 0, firstAttemptAt: now, blockedUntil: 0 });
  }

  const current = store.get(ip)!;
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - current.attempts);

  return {
    allowed: current.attempts < MAX_ATTEMPTS,
    blockedUntil: current.blockedUntil > now ? current.blockedUntil : null,
    attemptsLeft,
    ip,
  };
}

export function recordFailedAttempt(request: Request): RateLimitResult {
  const now = Date.now();
  cleanup(now);

  const ip = getClientIp(request);
  const record = store.get(ip);

  if (!record || now - record.firstAttemptAt > WINDOW_MS) {
    store.set(ip, { attempts: 1, firstAttemptAt: now, blockedUntil: 0 });
  } else {
    record.attempts += 1;
    if (record.attempts >= MAX_ATTEMPTS) {
      record.blockedUntil = now + BLOCK_MS;
    }
    store.set(ip, record);
  }

  return checkRateLimit(request);
}

export function resetAttempts(request: Request): void {
  const ip = getClientIp(request);
  store.delete(ip);
}
