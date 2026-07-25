import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionCookie } from "./lib/auth";

const PUBLIC_PATHS = ["/login", "/api/login"];

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Permite el acceso a la página de login y su API.
  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // Protege la API de subida a Vercel Blob con sesión.
  if (pathname === "/api/blob-upload") {
    const session = await parseSessionCookie(request.headers.get("cookie"));
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Para el resto de rutas se requiere sesión.
  const session = await parseSessionCookie(request.headers.get("cookie"));
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/login).*)"],
};
