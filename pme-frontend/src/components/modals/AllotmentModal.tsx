import { useEffect, useMemo, useState } from "react";
import {
  createAllotment,
  type AppropriationFundSourceOption,
  type CurrentAppropriationInfo,
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
  appropriation?: CurrentAppropriationInfo;
  appropriationFundSources: AppropriationFundSourceOption[];
  unreleasedTotal: number;
}

export default function AllotmentModal({
  open,
  onClose,
  onSaved,
  year,
  appropriation,
  appropriationFundSources,
  unreleasedTotal,
}: Props) {
  const availableSources = useMemo(
    () => appropriationFundSources.filter((source) => source.unreleased > 0),
    [appropriationFundSources],
  );
  const firstSource = availableSources[0];

  const [apprFundSourceId, setApprFundSourceId] = useState(
    firstSource?.appr_fund_source_id ?? "",
  );
  const [aroNumber, setAroNumber] = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [thisRelease, setThisRelease] = useState("");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setApprFundSourceId(availableSources[0]?.appr_fund_source_id ?? "");
    setAroNumber("");
    setReleaseDate("");
    setThisRelease("");
    setRemarks("");
    setError(null);
  }, [open, availableSources]);

  const selectedSource = useMemo(
    () =>
      appropriationFundSources.find(
        (s) => s.appr_fund_source_id === apprFundSourceId,
      ),
    [apprFundSourceId, appropriationFundSources],
  );

  const amountReleased = Number(thisRelease) || 0;
  const forLater = Math.max(0, (selectedSource?.unreleased ?? 0) - amountReleased);

  const isValid =
    apprFundSourceId &&
    aroNumber.trim().length > 0 &&
    releaseDate &&
    amountReleased > 0 &&
    selectedSource !== undefined &&
    amountReleased <= selectedSource.unreleased;

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    try {
      await createAllotment({
        appr_fund_source_id: apprFundSourceId,
        aro_number: aroNumber,
        amount_released: amountReleased,
        release_date: releaseDate,
        remarks: remarks.trim() || undefined,
      });
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue ARO");
    } finally {
      setBusy(false);
    }
  };

  return (
    <TooltipProvider delayDuration={100}>
      <ModalShell
        open={open}
        onClose={onClose}
        title="Issue Allotment Release Order (ARO)"
        subtitle="Authorize the release of funds for obligation based on the approved appropriation"
        footer={
          <>
            <div />
            <div className="flex gap-3">
              <ModalButton variant="secondary" onClick={onClose} disabled={busy}>
                Cancel
              </ModalButton>
            <ModalButton onClick={handleSave} disabled={busy || !isValid}>
              {busy ? "Submitting..." : "Submit Allotment"}
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

      {!appropriation && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          You must define an appropriation for FY {year} before issuing an ARO.
        </div>
      )}

      {appropriation && appropriationFundSources.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          No appropriation fund source lines are available for FY {year}.
        </div>
      )}

      {appropriation && appropriationFundSources.length > 0 && availableSources.length === 0 && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
          All appropriation fund source lines have been fully released. No unreleased balance remaining.
        </div>
      )}

      <div className="space-y-5">
        {/* ARO number + Release date */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5">
          <div>
            <FieldLabel required>ARO Number</FieldLabel>
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                placeholder="e.g., 2025-01-001"
                value={aroNumber}
                onChange={(e) => setAroNumber(e.target.value)}
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
                  An official authorization document for departments to spend their released budget allotments.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div>
            <FieldLabel required>Release Date</FieldLabel>
            <input
              type="date"
              className={inputCls}
              value={releaseDate}
              onChange={(e) => setReleaseDate(e.target.value)}
            />
          </div>
        </div>

        {/* Appropriation fund source selector */}
        <div>
          <FieldLabel required>Appropriation Fund Source Line</FieldLabel>
          <select
            className={`${inputCls} border-primary/60`}
            value={apprFundSourceId}
            onChange={(e) => {
              setApprFundSourceId(e.target.value);
              setThisRelease(""); // reset amount when source changes
            }}
            disabled={
              !appropriation ||
              availableSources.length === 0
            }
          >
            {availableSources.map((s) => (
              <option
                key={s.appr_fund_source_id}
                value={s.appr_fund_source_id}
              >
                {s.label} — Unreleased: {formatPHPFull(s.unreleased)}
              </option>
            ))}
            {availableSources.length === 0 && (
              <option>No fund source lines available</option>
            )}
          </select>
          {selectedSource && (
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Unreleased ceiling for this line:{" "}
              <span className="font-bold text-foreground">
                {formatPHPFull(selectedSource.unreleased)}
              </span>
            </p>
          )}
        </div>

        {/* Amount fields */}
        <div className="grid grid-cols-2 gap-6">
          <div>
            <FieldLabel>For Later Release</FieldLabel>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-medium">
                ₱
              </span>
              <input
                className={`${inputCls} pl-8 cursor-not-allowed bg-muted/60`}
                readOnly
                value={forLater.toLocaleString("en-PH", {
                  maximumFractionDigits: 2,
                })}
              />
            </div>
          </div>
          <div>
            <FieldLabel required>This Release</FieldLabel>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-primary font-medium">
                ₱
              </span>
              <input
                type="number"
                min={0}
                max={selectedSource?.unreleased ?? 0}
                className={`${inputCls} pl-8 border-primary/60`}
                placeholder="0.00"
                value={thisRelease}
                disabled={!selectedSource}
                onChange={(e) => setThisRelease(e.target.value)}
              />
            </div>
            {amountReleased > 0 &&
              selectedSource &&
              amountReleased > selectedSource.unreleased && (
                <p className="text-[10px] text-destructive mt-1 font-semibold">
                  Exceeds unreleased balance of{" "}
                  {formatPHPFull(selectedSource.unreleased)}.
                </p>
              )}
          </div>
        </div>

        {/* Unreleased appropriation summary */}
        <div className="flex justify-between items-center py-4 px-1 border-t border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
              Total Unreleased Appropriation
            </span>
          </div>
          <span className="text-base font-bold text-foreground font-mono">
            {formatPHPFull(unreleasedTotal)}
          </span>
        </div>

        {/* Optional remarks */}
        <div>
          <FieldLabel>Remarks (Optional)</FieldLabel>
          <textarea
            className={`${inputCls} h-20 resize-none`}
            placeholder="Purpose of this allotment release, special conditions..."
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>
    </ModalShell>
    </TooltipProvider>
  );
}