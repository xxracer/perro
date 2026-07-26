-- Schema para Caja Simplificada en Neon Postgres
-- Ejecutar esto en el SQL Editor del proyecto Neon.

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  day TEXT NOT NULL CHECK (day IN ('Viernes', 'Sábado', 'Domingo')),
  type TEXT NOT NULL CHECK (type IN ('Entrada', 'Salida')),
  amount NUMERIC(12,2) NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('Bs', '$')),
  method TEXT,
  bank_reference TEXT,
  reason TEXT,
  products JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS day_closures (
  day TEXT PRIMARY KEY CHECK (day IN ('Viernes', 'Sábado', 'Domingo')),
  closed_at TIMESTAMPTZ DEFAULT NOW()
);
