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

type StoredTransaction = Transaction & { day: DayOfWeek };

interface ProductSelection {
  checked: boolean;
  quantity: string;
  subtype: string;
}

type AlertType = "success" | "error" | "warning";

export default function CajaSimplificada() {
  const [records, setRecords] = useState<Record<DayOfWeek, DayRecord>>(() =>
    Object.fromEntries(
      DAYS.map((day) => [day, { day, transactions: [], openedAt: "" }])
    ) as unknown as Record<DayOfWeek, DayRecord>
  );

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
  const [alert, setAlert] = useState<{ type: AlertType; message: string } | null>(null);
  const [syncStatus, setSyncStatus] = useState<"syncing" | "synced" | null>(null);
  const isSyncingRef = useRef(false);

  const totalBalance = useMemo(
    () => DAYS.reduce((acc, day) => acc + calculateBalance(records[day].transactions), 0),
    [records]
  );

  const buildRecords = (transactions: StoredTransaction[], closedDays: DayOfWeek[]): Record<DayOfWeek, DayRecord> => {
    const grouped: Record<DayOfWeek, StoredTransaction[]> = {
      Viernes: [],
      Sábado: [],
      Domingo: [],
    };
    transactions.forEach((tx) => {
      grouped[tx.day].push(tx);
    });

    return Object.fromEntries(
      DAYS.map((day) => [
        day,
        {
          day,
          transactions: grouped[day],
          openedAt: grouped[day].length > 0 ? new Date().toISOString() : "",
          closedAt: closedDays.includes(day) ? new Date().toISOString() : undefined,
        },
      ])
    ) as unknown as Record<DayOfWeek, DayRecord>;
  };

  const loadData = async (silent = false) => {
    if (isSyncingRef.current) return;
    isSyncingRef.current = true;
    if (!silent) setSyncStatus("syncing");

    try {
      const res = await fetch("/api/transactions");
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error de servidor" }));
        throw new Error(data.error || "No se pudo cargar los datos");
      }
      const data = (await res.json()) as { transactions: StoredTransaction[]; closedDays: DayOfWeek[] };
      setRecords(buildRecords(data.transactions, data.closedDays));
      setSyncStatus("synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error de red";
      if (!silent) setAlert({ type: "error", message: `No se pudo sincronizar: ${message}` });
      setSyncStatus(null);
    } finally {
      isSyncingRef.current = false;
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 5000);
    return () => clearInterval(interval);
  }, []);

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
    setAlert(null);
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

  const handleAdd = async () => {
    if (!activeDay) {
      setAlert({ type: "error", message: "Primero abra un día antes de agregar movimientos." });
      return;
    }

    if (records[activeDay].closedAt) {
      setAlert({
        type: "warning",
        message: `${activeDay} ya está cerrado. Si necesita agregar más movimientos, use "Nuevo fin de semana" para reiniciar.`,
      });
      return;
    }

    const value = Number(amount);
    if (!amount || Number.isNaN(value) || value <= 0) {
      setAlert({ type: "error", message: "Escriba un monto válido mayor a cero." });
      return;
    }

    const txCurrency: Currency = transactionType === "Entrada" ? currency : "$";
    const txMethod = method;
    let txBankReference: string | undefined;
    let txReason: string | undefined;
    let txProducts: { product: ProductType; quantity: number; subtype?: string }[] | undefined;

    if (transactionType === "Entrada") {
      if (txMethod === "Pago Móvil" && !bankReference.trim()) {
        setAlert({ type: "error", message: "Para Pago Móvil escriba el número de referencia del banco." });
        return;
      }
      if (txMethod === "Pago Móvil") {
        txBankReference = bankReference.trim();
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
        .filter(Boolean) as { product: ProductType; quantity: number; subtype?: string }[];

      if (products.length > 0) {
        txProducts = products;
      }
    } else if (transactionType === "Salida") {
      if (!reason.trim()) {
        setAlert({ type: "error", message: "Para las salidas escriba el motivo del gasto." });
        return;
      }
      txReason = reason.trim();
    }

    setIsSaving(true);
    setAlert(null);

    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          day: activeDay,
          type: transactionType,
          amount: value,
          currency: txCurrency,
          method: txMethod,
          bankReference: txBankReference,
          reason: txReason,
          products: txProducts,
        }),
      });

      const data = (await res.json()) as { transaction?: StoredTransaction; error?: string };
      if (!res.ok || !data.transaction) {
        throw new Error(data.error || "No se pudo guardar el movimiento");
      }
      const stored = data.transaction;

      setRecords((prev) => ({
        ...prev,
        [activeDay]: {
          ...prev[activeDay],
          transactions: [...prev[activeDay].transactions, stored],
          openedAt: prev[activeDay].openedAt || stored.createdAt,
        },
      }));

      resetForm();
      setSyncStatus("synced");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      setAlert({ type: "error", message: `No se pudo agregar el movimiento: ${message}` });
    } finally {
      setIsSaving(false);
    }
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

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const safeFilename = (label: string) =>
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const uploadDayFiles = async (label: string, txs: Transaction[], total: number) => {
    const today = shortDate(new Date());
    const safeLabel = safeFilename(label);
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
      const total = calculateBalance(txs);
      const today = shortDate(new Date());
      const safeLabel = safeFilename(`Cierre ${day}`);

      const pdfBlob = generatePdfBlob(`Cierre ${day}`, txs, total);
      const jsonBlob = new Blob([JSON.stringify(txs, null, 2)], { type: "application/json" });

      downloadBlob(pdfBlob, `${safeLabel}-${today}.pdf`);
      downloadBlob(jsonBlob, `${safeLabel}-${today}.json`);

      let blobWarning = "";
      try {
        await uploadDayFiles(`Cierre ${day}`, txs, total);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        blobWarning = ` Respaldo en la nube no disponible: ${message}`;
      }

      const res = await fetch("/api/close-day", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ day }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error de servidor" }));
        throw new Error(data.error || "No se pudo marcar el cierre");
      }

      setRecords((prev) => ({
        ...prev,
        [day]: { ...prev[day], closedAt: new Date().toISOString() },
      }));

      setAlert({
        type: blobWarning ? "warning" : "success",
        message: `Cierre de ${day} descargado.${blobWarning}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      setAlert({ type: "error", message: `No se pudo cerrar ${day}: ${message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const resetWeekendState = async () => {
    const res = await fetch("/api/reset-weekend", { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Error de servidor" }));
      throw new Error(data.error || "No se pudo reiniciar");
    }
    setRecords(
      Object.fromEntries(
        DAYS.map((day) => [day, { day, transactions: [], openedAt: "" }])
      ) as unknown as Record<DayOfWeek, DayRecord>
    );
  };

  const closeWeekend = async () => {
    const weekendTxs = DAYS.flatMap((day) =>
      records[day].transactions.map((tx) => ({ ...tx, day }))
    ) as (Transaction & { day: DayOfWeek })[];

    if (weekendTxs.length === 0) {
      setAlert({ type: "error", message: "No hay movimientos del fin de semana para cerrar." });
      return;
    }

    setIsSaving(true);
    setAlert(null);

    try {
      const today = shortDate(new Date());
      const safeLabel = safeFilename("Cierre Dominical General");

      const pdfBlob = generatePdfBlob("Cierre Dominical General", weekendTxs as unknown as Transaction[], totalBalance);
      const jsonBlob = new Blob([JSON.stringify(weekendTxs, null, 2)], { type: "application/json" });

      downloadBlob(pdfBlob, `${safeLabel}-${today}.pdf`);
      downloadBlob(jsonBlob, `${safeLabel}-${today}.json`);

      let blobWarning = "";
      try {
        await uploadDayFiles("Cierre Dominical General", weekendTxs as unknown as Transaction[], totalBalance);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Error inesperado";
        blobWarning = ` Respaldo en la nube no disponible: ${message}`;
      }

      await resetWeekendState();
      setActiveDay(null);

      setAlert({
        type: blobWarning ? "warning" : "success",
        message: `Cierre dominical general descargado. Datos borrados para el próximo fin de semana.${blobWarning}`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      setAlert({ type: "error", message: `No se pudo guardar el cierre dominical: ${message}` });
    } finally {
      setIsSaving(false);
    }
  };

  const resetWeekend = async () => {
    const confirmed = window.confirm(
      "¿Borrar todos los movimientos y empezar un nuevo fin de semana? Esta acción no se puede deshacer."
    );
    if (!confirmed) return;

    setIsSaving(true);
    setAlert(null);

    try {
      await resetWeekendState();
      setActiveDay(null);
      setAlert({ type: "success", message: "Datos reiniciados para un nuevo fin de semana." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Error inesperado";
      setAlert({ type: "error", message: `No se pudo reiniciar: ${message}` });
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

  const anyTransactions = DAYS.some((day) => records[day].transactions.length > 0);
  const allDaysClosed = DAYS.every((day) => records[day].closedAt);

  return (
    <main>
      <div className="page-header">
        <h1>Caja Simplificada</h1>
        <div className="header-actions">
          {syncStatus && (
            <span className={`save-indicator ${syncStatus}`}>
              {syncStatus === "syncing" ? "Sincronizando..." : "Sincronizado ✓"}
            </span>
          )}
          <button
            className="big-button blue"
            onClick={handleLogout}
            style={{ flex: "0 0 auto", minHeight: 48, fontSize: "1.1rem" }}
          >
            Cerrar sesión
          </button>
        </div>
      </div>

      {alert && (
        <div className={`alert ${alert.type}`} role="alert" aria-live="polite">
          {alert.message}
        </div>
      )}

      {!activeDay && (
        <section className="ledger-card">
          <h2 className="section-title">Apertura del día</h2>
          <p className="section-help">
            Toque el día que va a trabajar.{" "}
            {allDaysClosed && anyTransactions && "Todos los días están cerrados."}
          </p>
          <div className="button-row day-buttons">
            {DAYS.map((day) => (
              <button
                key={day}
                className="big-button day-button"
                onClick={() => openDay(day)}
                disabled={isSaving}
              >
                {day}
                {records[day].closedAt && <span className="closed-badge">✓ Cerrado</span>}
              </button>
            ))}
          </div>
        </section>
      )}

      {!activeDay && anyTransactions && (
        <section className="ledger-card">
          <h2 className="section-title">Cierres</h2>
          <p className="section-help">Descargue el PDF y JSON de cada día. El cierre queda marcado en la base de datos.</p>
          <div className="button-row day-buttons">
            {DAYS.map((day) => (
              <button
                key={day}
                className="big-button close-button"
                onClick={() => closeDay(day)}
                disabled={isSaving || records[day].transactions.length === 0}
              >
                Generar cierre {day}
              </button>
            ))}
          </div>

          {totalBalance !== 0 && (
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

      {activeDay && (
        <section className={`ledger-card input-card ${records[activeDay].closedAt ? "day-closed" : ""}`}>
          <div className="day-header">
            <div className="day-title">
              <h2 className="section-title">{activeDay}</h2>
              {records[activeDay].closedAt && <span className="closed-badge">✓ Cerrado</span>}
            </div>
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

          {records[activeDay].closedAt && (
            <div className="alert warning" role="alert" aria-live="polite">
              Este día ya está cerrado. Para agregar más movimientos reinicie el fin de semana.
            </div>
          )}

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
              disabled={!formValid || isSaving || records[activeDay].closedAt !== undefined}
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

      {!activeDay && anyTransactions && (
        <section className="ledger-card">
          <button className="big-button red" onClick={resetWeekend} disabled={isSaving}>
            Nuevo fin de semana
          </button>
          <p className="section-help" style={{ marginTop: 10, marginBottom: 0 }}>
            Borra todos los movimientos para empezar el próximo fin de semana. Descargue los cierres antes de hacerlo.
          </p>
        </section>
      )}
    </main>
  );
}
