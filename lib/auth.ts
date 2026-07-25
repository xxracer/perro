// Usa la Web Crypto API para ser compatible con Node.js y Edge Runtime.

const SESSION_SECRET = process.env.SESSION_SECRET;
const COOKIE_NAME = "caja-session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 horas

function ensureSecret(): string {
  if (!SESSION_SECRET) {
    throw new Error("SESSION_SECRET no está definido en las variables de entorno.");
  }
  return SESSION_SECRET;
}

function base64urlEncode(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(input: string): Buffer {
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + padding;
  return Buffer.from(base64, "base64");
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return Buffer.from(new Uint8Array(signature)).toString("hex");
}

async function verify(payload: string, signature: string, secret: string): Promise<boolean> {
  const key = await importKey(secret);
  const sigBytes = Buffer.from(signature, "hex");
  return crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(sigBytes),
    new TextEncoder().encode(payload)
  );
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("hex");
}

export interface SessionPayload {
  username: string;
  exp: number;
  nonce: string;
}

export async function createSessionCookie(username: string): Promise<string> {
  const secret = ensureSecret();
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  const nonce = randomHex(8);
  const payload: SessionPayload = { username, exp, nonce };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = await sign(payloadB64, secret);
  const value = `${payloadB64}.${signature}`;

  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SECONDS}`;
}

export function deleteSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export async function parseSessionCookie(cookieHeader: string | null): Promise<SessionPayload | null> {
  if (!cookieHeader) return null;

  const secret = ensureSecret();
  const match = cookieHeader.match(new RegExp(`(?:^|;)\\s*${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;

  const value = decodeURIComponent(match[1]);
  const [payloadB64, signature] = value.split(".");
  if (!payloadB64 || !signature) return null;

  const valid = await verify(payloadB64, signature, secret);
  if (!valid) return null;

  try {
    const payload = JSON.parse(base64urlDecode(payloadB64).toString("utf-8")) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function requireAuth(request: Request): Promise<SessionPayload> {
  const session = await parseSessionCookie(request.headers.get("cookie"));
  if (!session) {
    throw new AuthError("Sesión no válida");
  }
  return session;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
