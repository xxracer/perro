import { NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { requireAuth } from "@/lib/auth";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const sql = getSql();
    await sql`TRUNCATE transactions, day_closures`;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
