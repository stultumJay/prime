import { useEffect, useMemo, useState } from "react";
import "@/styles/materialSymbols.css";
import type { ProjectDetailPayload } from "@/services/project.service";
import { hasMaxTwoDecimalPlaces, normalizeMoneyInput } from "@/lib/format";

export type FinanceActionKind = "allotment" | "obligation" | "disbursement";

type FinanceLedger = ProjectDetailPayload["finance_ledger"];

export type FinanceActionPayload =
  | {
      kind: "allotment";
      data: {
        appr_fund_source_id: string;
        aro_number: string;
        amount_released: number;
        release_date: string;
        remarks?: string;
      };
    }
  | {
      kind: "obligation";
      data: {
        allotment_id: string;
        payee: string;
        reference_document: string;
        obligation_amount: number;
        obligation_date: string;
        remarks?: string;
      };
    }
  | {
      kind: "disbursement";
      data: {
        obligation_id: string;
        payment_method: string;
        reference_number?: string;
        disbursement_amount: number;
        disbursement_date: string;
        remarks?: string;
      };
    };

interface FinanceActionModalProps {
  open: boolean;
  kind: FinanceActionKind;
  ledger: FinanceLedger;
  submitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: FinanceActionPayload) => void;
}

const actionMeta: Record<FinanceActionKind, { title: string; eyebrow: string; amountLabel: string }> = {
  allotment: {
    title: "Issue Allotment",
    eyebrow: "Allotment Release Order",
    amountLabel: "Amount Released",
  },
  obligation: {
    title: "Record Obligation",
    eyebrow: "Obligation Request",
    amountLabel: "Obligation Amount",
  },
  disbursement: {
    title: "Record Disbursement",
    eyebrow: "Actual Payment",
    amountLabel: "Disbursement Amount",
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function FinanceActionModal({
  open,
  kind,
  ledger,
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: FinanceActionModalProps) {
  const meta = actionMeta[kind];
  const allotmentOptions = useMemo(
    () => ledger.fund_sources.filter((row) => row.available_for_allotment > 0),
    [ledger.fund_sources],
  );
  const obligationOptions = useMemo(
    () => ledger.allotments.filter((row) => row.free_balance > 0),
    [ledger.allotments],
  );
  const disbursementOptions = useMemo(
    () => ledger.obligations.filter((row) => row.unpaid_balance > 0),
    [ledger.obligations],
  );

  const [targetId, setTargetId] = useState("");
  const [reference, setReference] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [remarks, setRemarks] = useState("");

  const currentLimit =
    kind === "allotment"
      ? allotmentOptions.find((row) => row.appr_fund_source_id === targetId)?.available_for_allotment ?? 0
      : kind === "obligation"
        ? obligationOptions.find((row) => row.allotment_id === targetId)?.free_balance ?? 0
        : disbursementOptions.find((row) => row.obligation_id === targetId)?.unpaid_balance ?? 0;
  const numericAmount = Number(amount);
  const hasOptions =
    kind === "allotment"
      ? allotmentOptions.length > 0
      : kind === "obligation"
        ? obligationOptions.length > 0
        : disbursementOptions.length > 0;
  const canSubmit =
    hasOptions &&
    Boolean(targetId) &&
    Boolean(date) &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= currentLimit &&
    hasMaxTwoDecimalPlaces(amount) &&
    (kind !== "allotment" || reference.trim()) &&
    (kind !== "obligation" || (reference.trim() && payee.trim())) &&
    !submitting;

  useEffect(() => {
    if (!open) return;
    const firstId =
      kind === "allotment"
        ? allotmentOptions[0]?.appr_fund_source_id
        : kind === "obligation"
          ? obligationOptions[0]?.allotment_id
          : disbursementOptions[0]?.obligation_id;
    setTargetId(firstId ?? "");
    setReference("");
    setPayee("");
    setAmount("");
    setDate(today());
    setPaymentMethod("cash");
    setRemarks("");
  }, [open, kind, allotmentOptions, obligationOptions, disbursementOptions]);

  if (!open) return null;

  const submit = () => {
    if (!canSubmit) return;

    if (kind === "allotment") {
      onSubmit({
        kind,
        data: {
          appr_fund_source_id: targetId,
          aro_number: reference.trim(),
          amount_released: numericAmount,
          release_date: date,
          remarks: remarks.trim() || undefined,
        },
      });
      return;
    }

    if (kind === "obligation") {
      onSubmit({
        kind,
        data: {
          allotment_id: targetId,
          payee: payee.trim(),
          reference_document: reference.trim(),
          obligation_amount: numericAmount,
          obligation_date: date,
          remarks: remarks.trim() || undefined,
        },
      });
      return;
    }

    onSubmit({
      kind,
      data: {
        obligation_id: targetId,
        payment_method: paymentMethod,
        reference_number: reference.trim() || undefined,
        disbursement_amount: numericAmount,
        disbursement_date: date,
        remarks: remarks.trim() || undefined,
      },
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onOpenChange(false)}
    >
      <form
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-600">
                {meta.eyebrow}
              </p>
              <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                {meta.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Available balance: {money(currentLimit)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {!hasOptions ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              No eligible source record is available for this action yet.
            </div>
          ) : null}

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Source Record
            </span>
            <select
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            >
              {kind === "allotment" &&
                allotmentOptions.map((row) => (
                  <option key={row.appr_fund_source_id} value={row.appr_fund_source_id}>
                    {row.expense_class} - {row.fund_name} - {money(row.available_for_allotment)}
                  </option>
                ))}
              {kind === "obligation" &&
                obligationOptions.map((row) => (
                  <option key={row.allotment_id} value={row.allotment_id}>
                    {row.aro_number} - {money(row.free_balance)}
                  </option>
                ))}
              {kind === "disbursement" &&
                disbursementOptions.map((row) => (
                  <option key={row.obligation_id} value={row.obligation_id}>
                    {row.reference_document} - {row.payee} - {money(row.unpaid_balance)}
                  </option>
                ))}
            </select>
          </label>

          {kind === "obligation" ? (
            <TextField label="Payee / Contractor" value={payee} onChange={setPayee} />
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={
                kind === "allotment"
                  ? "ARO Number"
                  : kind === "obligation"
                    ? "Reference Document"
                    : "Reference Number"
              }
              value={reference}
              onChange={setReference}
              required={kind !== "disbursement"}
            />
            <TextField
              label={meta.amountLabel}
              type="number"
              value={amount}
              onChange={(value) => setAmount(normalizeMoneyInput(value))}
              min="0.01"
              max={String(currentLimit)}
              step="0.01"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Date" type="date" value={date} onChange={setDate} />
            {kind === "disbursement" ? (
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Payment Method
                </span>
                <select
                  value={paymentMethod}
                  onChange={(event) => setPaymentMethod(event.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="cash">Cash</option>
                  <option value="check">Check</option>
                  <option value="ADA">ADA</option>
                </select>
              </label>
            ) : null}
          </div>

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Remarks
            </span>
            <textarea
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-teal-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TextField({
  label,
  value,
  type = "text",
  required = true,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  min?: string;
  max?: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
        {label}
      </span>
      <input
        value={value}
        type={type}
        required={required}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
      />
    </label>
  );
}
