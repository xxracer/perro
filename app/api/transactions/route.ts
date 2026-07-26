import { NextResponse } from "next/server";
import { getSql } from "@/lib/neon";
import { requireAuth } from "@/lib/auth";
import { DAYS, type Currency, type DayOfWeek, type ProductType, type TransactionType } from "@/lib/days";

interface SoldProductJson {
  product: ProductType;
  quantity: number;
  subtype?: string;
}

interface TransactionRow {
  id: number;
  day: DayOfWeek;
  type: TransactionType;
  amount: string;
  currency: Currency;
  method: string | null;
  bank_reference: string | null;
  reason: string | null;
  products: SoldProductJson[] | null;
  created_at: string;
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const sql = getSql();

    const transactions = (await sql`
      SELECT id, day, type, amount, currency, method, bank_reference, reason, products, created_at
      FROM transactions
      ORDER BY created_at ASC
    `) as TransactionRow[];

    const closures = (await sql`
      SELECT day, closed_at FROM day_closures
    `) as { day: string }[];

    const closedDays = new Set(closures.map((c) => c.day as DayOfWeek));

    const formatted = transactions.map((row) => ({
      id: String(row.id).padStart(3, "0"),
      day: row.day,
      type: row.type,
      amount: Number(row.amount),
      currency: row.currency,
      method: row.method as "Efectivo" | "Pago Móvil" | undefined,
      bankReference: row.bank_reference ?? undefined,
      reason: row.reason ?? undefined,
      products: Array.isArray(row.products) ? row.products : undefined,
      createdAt: row.created_at,
    }));

    return NextResponse.json({ transactions: formatted, closedDays: Array.from(closedDays) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

interface CreateBody {
  day: DayOfWeek;
  type: TransactionType;
  amount: number;
  currency: Currency;
  method?: "Efectivo" | "Pago Móvil";
  bankReference?: string;
  reason?: string;
  products?: SoldProductJson[];
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    await requireAuth(request);
  } catch {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let body: CreateBody;
  try {
    body = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  if (!DAYS.includes(body.day)) {
    return NextResponse.json({ error: "Día inválido" }, { status: 400 });
  }

  try {
    const insertSql = getSql();

    const rows = (await insertSql`
      INSERT INTO transactions (day, type, amount, currency, method, bank_reference, reason, products)
      VALUES (
        ${body.day},
        ${body.type},
        ${body.amount},
        ${body.currency},
        ${body.method ?? null},
        ${body.bankReference ?? null},
        ${body.reason ?? null},
        ${JSON.stringify(body.products ?? [])}::jsonb
      )
      RETURNING id, day, type, amount, currency, method, bank_reference, reason, products, created_at
    `) as TransactionRow[];

    const row = rows[0];

    return NextResponse.json({
      transaction: {
        id: String(row.id).padStart(3, "0"),
        day: row.day,
        type: row.type,
        amount: Number(row.amount),
        currency: row.currency,
        method: row.method as "Efectivo" | "Pago Móvil" | undefined,
        bankReference: row.bank_reference ?? undefined,
        reason: row.reason ?? undefined,
        products: Array.isArray(row.products) ? row.products : undefined,
        createdAt: row.created_at,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
