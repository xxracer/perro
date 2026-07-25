export type DayOfWeek = "Viernes" | "Sábado" | "Domingo";
export const DAYS: DayOfWeek[] = ["Viernes", "Sábado", "Domingo"];

export type TransactionType = "Entrada" | "Salida";
export type PaymentMethod = "Efectivo" | "Pago Móvil";
export type Currency = "Bs" | "$";
export type ProductType = "Perro" | "Hamburguesa" | "Pepito" | "Malta" | "Refresco" | "Cerveza";

export const PRODUCTS: ProductType[] = [
  "Perro",
  "Hamburguesa",
  "Pepito",
  "Malta",
  "Refresco",
  "Cerveza",
];

export interface SoldProduct {
  product: ProductType;
  quantity: number;
  subtype?: string;
}

export interface DayRecord {
  day: DayOfWeek;
  transactions: Transaction[];
  openedAt: string;
  closedAt?: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
  bankReference?: string;
  reason?: string;
  products?: SoldProduct[];
  createdAt: string;
}

export function formatCurrency(amount: number, currency: Currency = "$"): string {
  return `${new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} ${currency}`;
}

export function shortDate(date: Date): string {
  return date
    .toLocaleDateString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
}

export function calculateBalance(transactions: Transaction[]): number {
  return transactions.reduce((acc, tx) => {
    return tx.type === "Salida" ? acc - tx.amount : acc + tx.amount;
  }, 0);
}

export function calculateProductSummary(transactions: Transaction[]): Record<ProductType, number> {
  const summary: Record<ProductType, number> = {
    Perro: 0,
    Hamburguesa: 0,
    Pepito: 0,
    Malta: 0,
    Refresco: 0,
    Cerveza: 0,
  };

  transactions.forEach((tx) => {
    tx.products?.forEach((p) => {
      summary[p.product] += p.quantity;
    });
  });

  return summary;
}
