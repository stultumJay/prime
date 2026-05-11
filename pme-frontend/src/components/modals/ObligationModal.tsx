import { useEffect, useMemo, useState } from "react";
import "@/styles/materialSymbols.css";
import {
  createObligation,
  type AllotmentOption,
} from "@/services/projectActions.service";
import { formatPHPFull } from "@/lib/format";
import {
  ModalShell,
  FieldLabel,
  inputCls,
  ModalButton,
} from "./ModalShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  year: number;
  allotments: AllotmentOption[];
}

export default function ObligationModal({ open, onClose, onSaved, year, allotments }: Props) {
  const availableAllotments = useMemo(
    () => allotments.filter((allotment) => allotment.free_balance > 0),
    [allotments],
  );

  const [allotmentId, setAllotmentId] = useState(
    availableAllotments[0]?.allotment_id ?? "",
  );
  const [payee, setPayee] = useState("");
  const [obligationAmount, setObligationAmount] = useState("");
  const [refDoc, setRefDoc] = useState("");
  const [oblDate, setOblDate] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAllotmentId(availableAllotments[0]?.allotment_id ?? "");
    setPayee("");
    setObligationAmount("");
    setRefDoc("");
    setOblDate("");
    setRemarks("");
    setError(null);
  }, [open, availableAllotments]);

  const selected = useMemo(
    () => availableAllotments.find((a) => a.allotment_id === allotmentId),
    [allotmentId, availableAllotments],
  );

  const parsedAmount = Number(obligationAmount) || 0;

  const exceedsBalance =
    selected !== undefined && parsedAmount > selected.free_balance;

  const isValid =
    allotmentId &&
    payee.trim().length > 0 &&
    refDoc.trim().length > 0 &&
    parsedAmount > 0 &&
    oblDate &&
    selected !== undefined &&
    !exceedsBalance;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await createObligation({
        allotment_id: allotmentId,
        payee: payee.trim(),
        reference_document: refDoc.trim(),
        obligation_amount: parsedAmount,
        obligation_date: oblDate,
        remarks: remarks.trim() || undefined,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to record obligation",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <ModalShell
        open={open}
        onClose={onClose}
        title="Record Obligation Request (ObR)"
        subtitle="Commit funds for signed contracts or purchase orders"
        footer={
          <>
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                Unobligated Balance
              </span>
              <span className="text-xl font-black text-foreground">
                {formatPHPFull(selected?.free_balance ?? 0)}
              </span>
            </div>
            <div className="flex gap-3">
              <ModalButton variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </ModalButton>
              <ModalButton onClick={handleSave} disabled={busy || !isValid}>
                {busy ? "Recording..." : "Record Obligation"}
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

      {allotments.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          No allotments are available for FY {year}. Issue an ARO first.
        </div>
      )}

      {allotments.length > 0 && availableAllotments.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          All allotments for FY {year} are fully obligated. Issue another ARO before recording a new obligation.
        </div>
      )}

      <div className="space-y-5">
        {/* Allotment selector */}
        <div>
          <FieldLabel required>Link to Allotment (ARO)</FieldLabel>
          <div className="relative">
            <select
              className={`${inputCls} border-primary/60 pr-10`}
              value={allotmentId}
              onChange={(e) => {
                setAllotmentId(e.target.value);
                setObligationAmount(""); // reset amount when allotment changes
              }}
              disabled={availableAllotments.length === 0}
            >
              {availableAllotments.map((a) => (
                <option key={a.allotment_id} value={a.allotment_id}>
                  {a.label} — Free: {formatPHPFull(a.free_balance)}
                </option>
              ))}
              {availableAllotments.length === 0 && (
                <option>No allotments available</option>
              )}
            </select>
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
                The allotment release order that authorizes this obligation.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Payee */}
        <div>
          <FieldLabel required>Payee / Contractor</FieldLabel>
          <input
            className={inputCls}
            placeholder="Name of registered contractor or supplier..."
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
          />
        </div>

        {/* Amount + Reference */}
        <div className="grid grid-cols-2 gap-5">
          <div>
            <FieldLabel required>Obligation Amount</FieldLabel>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                ₱
              </span>
              <input
                type="number"
                min={0}
                className={`${inputCls} pl-8`}
                placeholder="0.00"
                value={obligationAmount}
                onChange={(e) => setObligationAmount(e.target.value)}
              />
            </div>
            {exceedsBalance && (
              <p className="text-[10px] text-destructive mt-1 font-semibold">
                Exceeds free balance of {formatPHPFull(selected?.free_balance ?? 0)}.
              </p>
            )}
          </div>
          <div>
            <FieldLabel required>Reference Document</FieldLabel>
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                placeholder="PO No. or Contract No."
                value={refDoc}
                onChange={(e) => setRefDoc(e.target.value)}
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
                  The document reference for this obligation, such as a purchase order or contract number.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        {/* Obligation date */}
        <div>
          <FieldLabel required>Obligation Date</FieldLabel>
          <input
            type="date"
            className={inputCls}
            value={oblDate}
            onChange={(e) => setOblDate(e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Enter the actual date the obligation was incurred, which may differ
            from today.
          </p>
        </div>

        {/* Remarks */}
        <div>
          <FieldLabel>Remarks (Optional)</FieldLabel>
          <textarea
            className={`${inputCls} h-20 resize-none`}
            placeholder="Nature of obligation, scope of work..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>

        {/* Info callout */}
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-start gap-3">
          <span className="material-symbols-outlined text-blue-500">info</span>
          <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
            Ensure all supporting documents (Contract, BAC Resolution, NTP) are
            attached to the physical ObR form before submission to the Budget
            Office.
          </p>
        </div>
      </div>
    </ModalShell>
    </TooltipProvider>
  );
}