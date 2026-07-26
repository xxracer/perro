import { neon } from "@neondatabase/serverless";

let cachedSql: ReturnType<typeof neon> | null = null;

function getClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL no está definido en las variables de entorno.");
  }
  if (!cachedSql) {
    cachedSql = neon(process.env.DATABASE_URL);
  }
  return cachedSql;
}

export function getSql() {
  return getClient();
}

// Función con soporte para tagged template literals, compatible con el uso `sql\`...\``.
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  return getClient()(strings, ...values);
}
