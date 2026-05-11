import { useEffect, useMemo, useState } from "react";
import "@/styles/materialSymbols.css";
import {
  createDisbursement,
  type ObligationOption,
} from "@/services/projectActions.service";
import { formatPHPFull } from "@/lib/format";
import {
  ModalShell,
  FieldLabel,
  inputCls,
  ModalButton,
} from "./ModalShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const PAYMENT_METHODS = ["Check", "Cash", "ADA"] as const;

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  year: number;
  obligations: ObligationOption[];
}

export default function DisbursementModal({
  open,
  onClose,
  onSaved,
  year,
  obligations,
}: Props) {
  const payableObligations = useMemo(
    () => obligations.filter((obligation) => obligation.unpaid > 0),
    [obligations],
  );

  const [obligationId, setObligationId] = useState(
    payableObligations[0]?.obligation_id ?? "",
  );
  const [method, setMethod] = useState<string>("Check");
  const [refNumber, setRefNumber] = useState("");
  const [disbursementAmount, setDisbursementAmount] = useState("");
  const [disbursementDate, setDisbursementDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setObligationId(payableObligations[0]?.obligation_id ?? "");
    setMethod("Check");
    setRefNumber("");
    setDisbursementAmount("");
    setDisbursementDate("");
    setRemarks("");
    setError(null);
  }, [open, payableObligations]);

  const selected = useMemo(
    () =>
      payableObligations.find((o) => o.obligation_id === obligationId),
    [obligationId, payableObligations],
  );

  const parsedAmount = Number(disbursementAmount) || 0;
  const exceedsUnpaid =
    selected !== undefined && parsedAmount > selected.unpaid;

  const isValid =
    obligationId &&
    parsedAmount > 0 &&
    disbursementDate &&
    selected !== undefined &&
    !exceedsUnpaid;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await createDisbursement({
        obligation_id: obligationId,
        payment_method: method,
        reference_number: refNumber.trim() || undefined,
        disbursement_amount: parsedAmount,
        disbursement_date: disbursementDate,
        remarks: remarks.trim() || undefined,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to record payment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <ModalShell
        open={open}
        onClose={onClose}
        title="Record Disbursement (Disbursement Voucher)"
        subtitle="Process actual payment and settlement of a legal obligation"
        footer={
          <>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Unliquidated Obligation
              </span>
              <span className="text-lg font-black text-rose-600">
                {formatPHPFull(selected?.unpaid ?? 0)}
              </span>
            </div>
            <div className="flex gap-3">
              <ModalButton variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </ModalButton>
              <ModalButton onClick={handleSave} disabled={busy || !isValid}>
                {busy ? "Processing..." : "Finalize Payment"}
              </ModalButton>
            </div>
          </>
        }
      >
      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-destructive/10 text-destructive text-xs font-medium">
          {error}
        </div>
      )}

      {obligations.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          No obligations are available for FY {year}. Record an ObR first.
        </div>
      )}

      {obligations.length > 0 && payableObligations.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          All obligations for FY {year} have been fully disbursed. Record another ObR before processing a payment.
        </div>
      )}

      <div className="space-y-5">
        {/* Obligation selector */}
        <div>
          <FieldLabel required>Link to Obligation</FieldLabel>
          <select
            className={inputCls}
            value={obligationId}
            onChange={(e) => {
              setObligationId(e.target.value);
              setDisbursementAmount(""); // reset amount when obligation changes
            }}
            disabled={payableObligations.length === 0}
          >
            {payableObligations.map((o) => (
              <option key={o.obligation_id} value={o.obligation_id}>
                {o.label} — Unpaid: {formatPHPFull(o.unpaid)}
              </option>
            ))}
            {payableObligations.length === 0 && (
              <option>No obligations available</option>
            )}
          </select>
        </div>

        {/* Payment method + Reference number */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel required>Payment Method</FieldLabel>
            <select
              className={inputCls}
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Check / Reference Number</FieldLabel>
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                placeholder="e.g. 000045612"
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm hover:bg-gray-100"
                  >
                    i
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  The check number or reference for this disbursement.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Disbursement amount */}
        <div>
          <FieldLabel required>Disbursement Amount</FieldLabel>
          <div className="relative">
            <span className="absolute left-5 top-1/2 -translate-y-1/2 font-bold text-foreground text-lg">
              ₱
            </span>
            <input
              type="number"
              min={0}
              className={`${inputCls} pl-12 py-4 text-2xl font-black`}
              placeholder="0.00"
              value={disbursementAmount}
              onChange={(e) => setDisbursementAmount(e.target.value)}
            />
          </div>
          {exceedsUnpaid && (
            <p className="text-[10px] text-destructive mt-1 font-semibold">
              Exceeds unpaid obligation balance of{" "}
              {formatPHPFull(selected?.unpaid ?? 0)}.
            </p>
          )}
        </div>

        {/* Disbursement date */}
        <div>
          <FieldLabel required>Disbursement Date</FieldLabel>
          <input
            type="date"
            className={inputCls}
            value={disbursementDate}
            onChange={(e) => setDisbursementDate(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter the actual date the payment was made, which may differ from
            today.
          </p>
        </div>

        {/* Remarks */}
        <div>
          <FieldLabel>Remarks (Optional)</FieldLabel>
          <textarea
            className={`${inputCls} h-20 resize-none`}
            placeholder="Payment purpose, special instructions..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        {/* Fund availability confirmation */}
        <div className="bg-primary/5 p-5 rounded-xl flex gap-4 items-center border border-primary/15">
          <div className="bg-primary rounded-full p-1.5 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary-foreground text-lg">
              check
            </span>
          </div>
          <div>
            <p className="text-sm font-extrabold text-foreground">
              Fund Availability Check
            </p>
            <p className="text-xs text-muted-foreground">
              Amount is validated against the obligation's remaining unpaid
              balance before submission.
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
    </TooltipProvider>
  );
}