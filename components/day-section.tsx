"use client";

import {
  calculateBalance,
  calculateProductSummary,
  formatCurrency,
  PRODUCTS,
  type DayRecord,
} from "@/lib/days";

interface DaySectionProps {
  record: DayRecord;
}

export default function DaySection({ record }: DaySectionProps) {
  const balance = calculateBalance(record.transactions);
  const summary = calculateProductSummary(record.transactions);
  const hasSales = record.transactions.some((tx) => tx.products && tx.products.length > 0);

  return (
    <div className="day-section">
      {hasSales && (
        <div className="sales-summary">
          <h3 className="summary-title">Resumen de ventas</h3>
          <div className="summary-grid">
            {PRODUCTS.map((product) => (
              <div key={product} className="summary-cell">
                <span className="summary-number">{summary[product]}</span>
                <span className="summary-label">{product}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {record.transactions.length > 0 ? (
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th scope="col">Nº</th>
                <th scope="col">Tipo</th>
                <th scope="col">Detalle</th>
                <th scope="col">Monto</th>
              </tr>
            </thead>
            <tbody>
              {record.transactions.map((tx) => {
                let detail = "";
                if (tx.type === "Entrada") {
                  const productsText = tx.products
                    ?.map((p) => {
                      const subtype = p.subtype ? ` (${p.subtype})` : "";
                      return `${p.quantity} ${p.product}${subtype}`;
                    })
                    .join(", ");
                  const refText = tx.bankReference ? ` · Ref: ${tx.bankReference}` : "";
                  detail = `${tx.method} · ${tx.currency}${refText}${productsText ? ` · ${productsText}` : ""}`;
                } else if (tx.type === "Salida") {
                  detail = tx.reason ?? "";
                }

                return (
                  <tr key={tx.id}>
                    <td>{tx.id}</td>
                    <td>{tx.type}</td>
                    <td>{detail}</td>
                    <td>{formatCurrency(tx.amount, tx.currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">No hay movimientos aún.</p>
      )}

      <div className="balance-row" aria-live="polite">
        <span>Balance {record.day}</span>
        <span>{formatCurrency(balance, "$")}</span>
      </div>
    </div>
  );
}
