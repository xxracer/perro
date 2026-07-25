import { NextResponse } from "next/server";
import { createSessionCookie } from "@/lib/auth";
import { checkRateLimit, recordFailedAttempt, resetAttempts } from "@/lib/rate-limit";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

export async function POST(request: Request): Promise<NextResponse> {
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    return NextResponse.json(
      { error: "Credenciales no configuradas en el servidor." },
      { status: 500 }
    );
  }

  const rate = checkRateLimit(request);
  if (!rate.allowed) {
    const minutes = Math.ceil(((rate.blockedUntil ?? Date.now()) - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Demasiados intentos. Intente de nuevo en ${minutes} minutos.` },
      { status: 429 }
    );
  }

  let body: { username?: string; password?: string } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido." }, { status: 400 });
  }

  const { username, password } = body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    resetAttempts(request);
    const setCookie = await createSessionCookie(username);
    const response = NextResponse.json({ ok: true });
    response.headers.set("Set-Cookie", setCookie);
    return response;
  }

  const newRate = recordFailedAttempt(request);
  if (!newRate.allowed) {
    const minutes = Math.ceil(((newRate.blockedUntil ?? Date.now()) - Date.now()) / 60000);
    return NextResponse.json(
      { error: `Demasiados intentos. Intente de nuevo en ${minutes} minutos.` },
      { status: 429 }
    );
  }

  return NextResponse.json(
    { error: `Usuario o contraseña incorrectos. Intentos restantes: ${newRate.attemptsLeft}.` },
    { status: 401 }
  );
}
