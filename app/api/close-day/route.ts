import { NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { requireAuth } from "@/lib/auth";
import { DAYS, type DayOfWeek } from "@/lib/days";

interface CloseBody {
  day: DayOfWeek;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: CloseBody;
  try {
    body = (await request.json()) as CloseBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!DAYS.includes(body.day)) {
    return NextResponse.json({ error: "Día inválido" }, { status: 400 });
  }

  try {
    const sql = getSql();
    await sql`
      INSERT INTO day_closures (day, closed_at)
      VALUES (${body.day}, NOW())
      ON CONFLICT (day) DO UPDATE SET closed_at = NOW()
    `;

    return NextResponse.json({ success: true, day: body.day });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
