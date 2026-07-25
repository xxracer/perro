"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import { upload } from "@vercel/blob/client";
import {
  DAYS,
  PRODUCTS,
  calculateBalance,
  formatCurrency,
  shortDate,
  type Currency,
  type DayOfWeek,
  type DayRecord,
  type PaymentMethod,
  type ProductType,
  type Transaction,
  type TransactionType,
} from "@/lib/days";
import DaySection from "./day-section";

export interface CajaSimplificadaProps {
  initialValues?: Record<DayOfWeek, Transaction[]>;
}

interface ProductSelection {
  checked: boolean;
  quantity: string;
  subtype: string;
}

export default function CajaSimplificada({ initialValues }: CajaSimplificadaProps) {
  const [records, setRecords] = useState<Record<DayOfWeek, DayRecord>>(() => {
    const seed: Record<DayOfWeek, Transaction[]> = {
      Viernes: initialValues?.Viernes ?? [],
      Sábado: initialValues?.Sábado ?? [],
      Domingo: initialValues?.Domingo ?? [],
    };

    return Object.fromEntries(
      DAYS.map((day) => [
        day,
        {
          day,
          transactions: seed[day],
          openedAt: seed[day].length > 0 ? new Date().toISOString() : "",
        },
      ])
    ) as Record<DayOfWeek, DayRecord>;
  });

  const [activeDay, setActiveDay] = useState<DayOfWeek | null>(null);
  const [transactionType, setTransactionType] = useState<TransactionType>("Entrada");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("Efectivo");
  const [currency, setCurrency] = useState<Currency>("$");
  const [bankReference, setBankReference] = useState("");
  const [reason, setReason] = useState("");
  const [selections, setSelections] = useState<Record<ProductType, ProductSelection>>(() => {
    const init = {} as Record<ProductType, ProductSelection>;
    PRODUCTS.forEach((product) => {
      init[product] = { checked: false, quantity: "", subtype: "" };
    });
    return init;
  });
  const [isSaving, setIsSaving] = useState(false);
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const nextId = useRef(1);

  const totalBalance = useMemo(
    () => DAYS.reduce((acc, day) => acc + calculateBalance(records[day].transactions), 0),
    [records]
  );

  useEffect(() => {
    if (method === "Pago Móvil") {
      setCurrency("Bs");
    }
  }, [method]);

  const openDay = (day: DayOfWeek) => {
    setRecords((prev) => ({
      ...prev,
      [day]: { ...prev[day], openedAt: prev[day].openedAt || new Date().toISOString() },
    }));
    setActiveDay(day);
    setAlert({ type: "success", message: `${day} abierto.` });
  };

  const resetForm = () => {
    setAmount("");
    setBankReference("");
    setReason("");
    setMethod("Efectivo");
    setCurrency("$");
    setSelections((prev) => {
      const next = { ...prev };
      PRODUCTS.forEach((product) => {
        next[product] = { checked: false, quantity: "", subtype: "" };
      });
      return next;
    });
  };

  const setProductChecked = (product: ProductType, checked: boolean) => {
    setSelections((prev) => ({
      ...prev,
      [product]: { ...prev[product], checked },
    }));
  };

  const setProductQuantity = (product: ProductType, quantity: string) => {
    setSelections((prev) => ({
      ...prev,
      [product]: { ...prev[product], quantity },
    }));
  };

  const setProductSubtype = (product: ProductType, subtype: string) => {
    setSelections((prev) => ({
      ...prev,
      [product]: { ...prev[product], subtype },
    }));
  };

  const handleAdd = () => {
    if (!activeDay) {
      setAlert({ type: "error", message: "Primero abra un día antes de agregar movimientos." });
      return;
    }

    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setAlert({ type: "error", message: "Escriba un monto válido mayor a cero." });
      return;
    }

    const newTxBase: Omit<Transaction, "id" | "createdAt" | "type" | "amount"> = {
      currency: transactionType === "Entrada" ? currency : "$",
      method,
    };

    if (transactionType === "Entrada") {
      if (method === "Pago Móvil" && !bankReference.trim()) {
        setAlert({ type: "error", message: "Para Pago Móvil escriba el número de referencia del banco." });
        return;
      }
      if (method === "Pago Móvil") {
        newTxBase.bankReference = bankReference.trim();
      }

      const products = PRODUCTS.filter((product) => selections[product].checked)
        .map((product) => {
          const qty = Number(selections[product].quantity);
          if (!selections[product].quantity || Number.isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
            setAlert({ type: "error", message: `Cantidad inválida para ${product}.` });
            return null;
          }
          return {
            product,
            quantity: qty,
            subtype: selections[product].subtype.trim() || undefined,
          };
        })
        .filter(Boolean) as Transaction["products"];

      if (products && products.length > 0) {
        newTxBase.products = products;
      }
    } else if (transactionType === "Salida") {
      if (!reason.trim()) {
        setAlert({ type: "error", message: "Para las salidas escriba el motivo del gasto." });
        return;
      }
      newTxBase.reason = reason.trim();
    }

    const id = String(nextId.current).padStart(3, "0");
    nextId.current += 1;

    const newTx: Transaction = {
      id,
      type: transactionType,
      amount: value,
      createdAt: new Date().toISOString(),
      ...newTxBase,
    };

    setRecords((prev) => ({
      ...prev,
      [activeDay]: {
        ...prev[activeDay],
        transactions: [...prev[activeDay].transactions, newTx],
      },
    }));

    resetForm();
    setAlert(null);
  };

  const generatePdfBlob = (title: string, txs: Transaction[], total: number): Blob => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const dateLabel = shortDate(new Date());

    doc.setFontSize(18);
    doc.text(`${title} - ${dateLabel}`, 20, 20);

    doc.setFontSize(9);
    doc.text("Nº", 20, 35);
    doc.text("Tipo", 34, 35);
    doc.text("Detalle", 58, 35);
    doc.text("Monto", 130, 35);

    let y = 42;
    txs.forEach((tx) => {
      let detail = "";
      if (tx.type === "Entrada") {
        const methodText = tx.method ?? "";
        const refText = tx.bankReference ? ` · Ref: ${tx.bankReference}` : "";
        const productsText = tx.products
          ?.map((p) => {
            const subtype = p.subtype ? ` (${p.subtype})` : "";
            return `${p.quantity} ${p.product}${subtype}`;
          })
          .join(", ");
        detail = `${methodText} · ${tx.currency}${refText}`;
        if (productsText) detail += ` · ${productsText}`;
      } else if (tx.type === "Salida") {
        detail = tx.reason ?? "";
      }

      doc.text(tx.id, 20, y);
      doc.text(tx.type, 34, y);
      doc.text(detail, 58, y);
      doc.text(formatCurrency(tx.amount, tx.currency), 130, y);
      y += 7;
      if (y > 270) {
        doc.addPage();
        y = 20;
      }
    });

    doc.setFontSize(14);
    doc.setTextColor(21, 101, 192);
    doc.text(`Balance Total: ${formatCurrency(total, "$")}`, 20, y + 8);

    return doc.output("blob");
  };

  const uploadDayFiles = async (label: string, txs: Transaction[], total: number) => {
    const today = shortDate(new Date());
    const safeLabel = label.toLowerCase().replace(/\s+/g, "-");
    const pdfBlob = generatePdfBlob(label, txs, total);
    const jsonBlob = new Blob([JSON.stringify(txs, null, 2)], { type: "application/json" });

    const pdfFile = new File([pdfBlob], `${safeLabel}-${today}.pdf`, { type: "application/pdf" });
    const jsonFile = new File([jsonBlob], `${safeLabel}-${today}.json`, { type: "application/json" });

    return Promise.all([
      upload(`${safeLabel}-${today}.pdf`, pdfFile, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        contentType: "application/pdf",
      }),
      upload(`${safeLabel}-${today}.json`, jsonFile, {
        access: "public",
        handleUploadUrl: "/api/blob-upload",
        contentType: "application/json",
      }),
    ]);
  };

  const closeDay = async (day: DayOfWeek) => {
    const txs = records[day].transactions;
    if (txs.length === 0) {
      setAlert({ type: "error", message: `No hay movimientos en ${day} para cerrar.` });
      return;
    }

    setIsSaving(true);
    setAlert(null);

    try {
      await uploadDayFiles(`Cierre ${day}`, txs, calculateBalance(txs));
      setRecords((prev) => ({
        ...prev,
        [day]: { ...prev[day], closedAt: new Date().toISOString() },
      }));
      setAlert({ type: "success", message: `Cierre de ${day} guardado en Vercel Blob.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      setAlert({ type: "error", message: `No se pudo cerrar ${day}: ${message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const closeWeekend = async () => {
    const weekendTxs = DAYS.flatMap((day) => records[day].transactions.map((tx) => ({ ...tx, day })));

    if (weekendTxs.length === 0) {
      setAlert({ type: "error", message: "No hay movimientos del fin de semana para cerrar." });
      return;
    }

    setIsSaving(true);
    setAlert(null);

    try {
      await uploadDayFiles("Cierre Dominical", weekendTxs, totalBalance);
      setAlert({ type: "success", message: "Cierre dominical guardado exitosamente en Vercel Blob." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      setAlert({ type: "error", message: `No se pudo guardar el cierre dominical: ${message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const amountValid = Boolean(amount) && !Number.isNaN(Number(amount)) && Number(amount) > 0;
  const productsValid = PRODUCTS.every(
    (product) =>
      !selections[product].checked ||
      (Boolean(selections[product].quantity) &&
        !Number.isNaN(Number(selections[product].quantity)) &&
        Number(selections[product].quantity) > 0 &&
        Number.isInteger(Number(selections[product].quantity)))
  );

  let formValid = false;
  if (transactionType === "Entrada") {
    formValid =
      amountValid &&
      productsValid &&
      (method === "Efectivo" || (method === "Pago Móvil" && !!bankReference.trim()));
  } else if (transactionType === "Salida") {
    formValid = amountValid && !!reason.trim();
  }

  return (
    <main>
      <div className="page-header">
        <h1>Caja Simplificada</h1>
        <button
          className="big-button blue"
          onClick={handleLogout}
          style={{ flex: "0 0 auto", minHeight: 48, fontSize: "1.1rem" }}
        >
          Cerrar sesión
        </button>
      </div>

      {alert && (
        <div className={`alert ${alert.type}`} role="alert" aria-live="polite">
          {alert.message}
        </div>
      )}

      {!activeDay && (
        <section className="ledger-card">
          <h2 className="section-title">Apertura del día</h2>
          <p className="section-help">Toque el día que va a trabajar.</p>
          <div className="button-row day-buttons">
            {DAYS.map((day) => (
              <button
                key={day}
                className="big-button day-button"
                onClick={() => openDay(day)}
                disabled={isSaving}
              >
                {day}
              </button>
            ))}
          </div>
        </section>
      )}

      {activeDay && (
        <section className="ledger-card input-card">
          <div className="day-header">
            <h2 className="section-title">{activeDay}</h2>
            <button
              className="text-button"
              onClick={() => {
                setActiveDay(null);
                setAlert(null);
              }}
              disabled={isSaving}
            >
              Cambiar día
            </button>
          </div>

          <fieldset className="radio-group type-selector">
            <legend>Tipo de movimiento</legend>
            {(["Entrada", "Salida"] as TransactionType[]).map((t) => (
              <label key={t} className={`radio-label ${transactionType === t ? "active" : ""}`}>
                <input
                  type="radio"
                  name="transactionType"
                  value={t}
                  checked={transactionType === t}
                  onChange={() => {
                    setTransactionType(t);
                    setAlert(null);
                  }}
                />
                <span>{t}</span>
              </label>
            ))}
          </fieldset>

          {transactionType === "Entrada" && (
            <fieldset className="radio-group">
              <legend>Método de pago</legend>
              <label className={`radio-label ${method === "Efectivo" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="method"
                  value="Efectivo"
                  checked={method === "Efectivo"}
                  onChange={() => setMethod("Efectivo")}
                />
                <span>Efectivo</span>
              </label>
              <label className={`radio-label ${method === "Pago Móvil" ? "active" : ""}`}>
                <input
                  type="radio"
                  name="method"
                  value="Pago Móvil"
                  checked={method === "Pago Móvil"}
                  onChange={() => setMethod("Pago Móvil")}
                />
                <span>Pago Móvil</span>
              </label>
            </fieldset>
          )}

          {transactionType === "Entrada" && method === "Efectivo" && (
            <fieldset className="radio-group currency-selector">
              <legend>Moneda</legend>
              {(["Bs", "$"] as Currency[]).map((c) => (
                <label key={c} className={`radio-label ${currency === c ? "active" : ""}`}>
                  <input
                    type="radio"
                    name="currency"
                    value={c}
                    checked={currency === c}
                    onChange={() => setCurrency(c)}
                  />
                  <span>{c}</span>
                </label>
              ))}
            </fieldset>
          )}

          {transactionType === "Entrada" && method === "Pago Móvil" && (
            <div className="input-group">
              <label htmlFor="referencia">Nº de referencia del banco</label>
              <input
                id="referencia"
                type="text"
                inputMode="numeric"
                value={bankReference}
                onChange={(e) => setBankReference(e.target.value)}
              />
              <small className="field-hint">Pago Móvil usa automáticamente Bs</small>
            </div>
          )}

          {transactionType === "Salida" && (
            <div className="input-group">
              <label htmlFor="motivo">Motivo del gasto</label>
              <input
                id="motivo"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          {transactionType === "Entrada" && (
            <fieldset className="product-boxes">
              <legend>Productos vendidos</legend>
              <div className="product-boxes-grid">
                {PRODUCTS.map((product) => (
                  <div key={product} className={`product-box ${selections[product].checked ? "active" : ""}`}>
                    <label className="product-box-header">
                      <input
                        type="checkbox"
                        checked={selections[product].checked}
                        onChange={(e) => setProductChecked(product, e.target.checked)}
                      />
                      <span>{product}</span>
                    </label>
                    {selections[product].checked && (
                      <div className="product-box-fields">
                        {(product === "Hamburguesa" || product === "Pepito") && (
                          <input
                            type="text"
                            placeholder={`Tipo de ${product.toLowerCase()}`}
                            value={selections[product].subtype}
                            onChange={(e) => setProductSubtype(product, e.target.value)}
                          />
                        )}
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          step="1"
                          placeholder="Cantidad"
                          value={selections[product].quantity}
                          onChange={(e) => setProductQuantity(product, e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className="input-group">
            <label htmlFor="monto">Monto total</label>
            <input
              id="monto"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          <div className="button-row action-buttons">
            <button
              className="big-button green"
              onClick={handleAdd}
              disabled={!formValid || isSaving}
            >
              Agregar {transactionType}
            </button>
          </div>

          <DaySection record={records[activeDay]} />

          <button
            className="big-button close-button"
            onClick={() => closeDay(activeDay)}
            disabled={isSaving || records[activeDay].transactions.length === 0}
          >
            Cerrar {activeDay}
          </button>

          {activeDay === "Domingo" && totalBalance !== 0 && (
            <button
              className="big-button blue weekend-close"
              onClick={closeWeekend}
              disabled={isSaving}
              aria-busy={isSaving}
            >
              {isSaving ? (
                <>
                  <span className="spinner" aria-hidden="true" />
                  Guardando...
                </>
              ) : (
                "Generar Cierre Dominical General"
              )}
            </button>
          )}
        </section>
      )}

      {!activeDay && totalBalance !== 0 && (
        <section className="ledger-card balance-general">
          <div className="balance-row" aria-live="polite">
            <span>Balance General Fin de Semana</span>
            <span>{formatCurrency(totalBalance, "$")}</span>
          </div>
        </section>
      )}
    </main>
  );
}
