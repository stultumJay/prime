import { useEffect, useMemo, useState } from "react";
import type { AddToAipPayload } from "@/services/projectActions.service";
import type { ProjectDetailPayload } from "@/services/project.service";
import { formatPHPFull } from "@/lib/format";
import { FieldLabel, ModalButton, ModalShell, inputCls, readonlyInputCls } from "./ModalShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, } from "@/components/ui/tooltip";

interface AddToAipModalProps {
  open: boolean;
  project: ProjectDetailPayload;
  existingYears: number[];
  submitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: AddToAipPayload) => Promise<void>;
}

export default function AddToAipModal({
  open,
  project,
  existingYears,
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: AddToAipModalProps) {
  const nextYear = Math.max(new Date().getFullYear(), ...(existingYears.length ? existingYears : [0])) + 1;
  const [fiscalYear, setFiscalYear] = useState(String(nextYear));
  const [majorFinalOutput, setMajorFinalOutput] = useState("");
  const [indicator, setIndicator] = useState("");
  const [targetTotal, setTargetTotal] = useState("");
  const [ps, setPs] = useState("");
  const [mooe, setMooe] = useState("");
  const [fe, setFe] = useState("");
  const [co, setCo] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) return;
    setFiscalYear(String(nextYear));
    setMajorFinalOutput("");
    setIndicator("");
    setTargetTotal("");
    setPs("");
    setMooe("");
    setFe("");
    setCo("");
    setRemarks("");
  }, [open, nextYear]);

  const totalBudget = useMemo(
    () => (Number(ps) || 0) + (Number(mooe) || 0) + (Number(fe) || 0) + (Number(co) || 0),
    [ps, mooe, fe, co],
  );
  const yearNumber = Number(fiscalYear);
  const duplicateYear = existingYears.includes(yearNumber);
  const toInteger = (value: string) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : NaN;
  };
  const targetNumber = toInteger(targetTotal);
  const targetIsValid = Number.isInteger(targetNumber) && targetNumber > 0;
  const canSubmit =
    !submitting &&
    yearNumber >= 2000 &&
    !duplicateYear &&
    majorFinalOutput.trim() &&
    indicator.trim() &&
    targetIsValid &&
    totalBudget > 0;

  return (
    <ModalShell
      open={open}
      onClose={() => onOpenChange(false)}
      size="max-w-4xl"
      bodyClassName="overflow-y-visible"
      title="Add to AIP"
      subtitle="Move this planned project into the Annual Investment Program"
      footer={
        <>
          <div className="text-[11px] text-muted-foreground">
            <span className="font-bold uppercase tracking-wider">Total Proposed:</span>{" "}
            <span className="text-sm font-black text-foreground">{formatPHPFull(totalBudget)}</span>
          </div>
          <div className="flex gap-3">
            <ModalButton variant="secondary" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </ModalButton>
            <ModalButton
              disabled={!canSubmit}
              onClick={() =>
                onSubmit({
                  project_id: project.project.project_id,
                  fiscal_year: yearNumber,
                  major_final_output: majorFinalOutput.trim(),
                  performance_indicator: indicator.trim(),
                  target_total: targetNumber,
                  proposed_budget_ps: Number(ps) || 0,
                  proposed_budget_mooe: Number(mooe) || 0,
                  proposed_budget_fe: Number(fe) || 0,
                  proposed_budget_co: Number(co) || 0,
                  performance_remarks: remarks.trim() || undefined,
                })
              }
            >
              {submitting ? "Saving..." : "Add to AIP"}
            </ModalButton>
          </div>
        </>
      }
    >
      <TooltipProvider delayDuration={100}>
        <div className="space-y-4">
        {error ? (
          <div className="rounded-lg bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 md:grid-cols-3">
          <div>
            <FieldLabel>Project Code</FieldLabel>
            <input className={readonlyInputCls} value={project.project.project_code} readOnly />
          </div>
          <div>
            <FieldLabel>Project Title</FieldLabel>
            <input className={readonlyInputCls} value={project.project.project_title} readOnly />
          </div>
          <div>
            <FieldLabel required>Fiscal Year</FieldLabel>
            <input
              className={inputCls}
              type="number"
              min={2000}
              value={fiscalYear}
              onChange={(event) => setFiscalYear(event.target.value)}
            />
            {duplicateYear ? (
              <p className="mt-1 text-[10px] font-bold text-destructive">
                This project already has an active AIP entry for FY {yearNumber}.
              </p>
            ) : null}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div>
            <FieldLabel required>Major Final Output</FieldLabel>
            <div className="relative w-full">
              <textarea
                className={`${inputCls} h-20 w-full resize-none pr-10`}
                value={majorFinalOutput}
                onChange={(event) => setMajorFinalOutput(event.target.value)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm hover:bg-gray-100"
                  >
                    i
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  Indicate the good or service that a department/agency is mandated to deliver.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div>
            <FieldLabel required>Performance Indicator</FieldLabel>
            <div className="relative w-full">
              <textarea
                className={`${inputCls} h-20 w-full resize-none pr-10`}
                value={indicator}
                onChange={(event) => setIndicator(event.target.value)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="absolute right-2 top-2 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm hover:bg-gray-100"
                  >
                    i
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px]">
                  Indicate the means for measuring the quantity, quality and timeliness of service delivery to the clients.
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
          <div>
            <FieldLabel required>Target Total</FieldLabel>
            <div className="relative">
              <input
                className={`${inputCls} pr-10`}
                type="number"
                min={1}
                step={1}
                value={targetTotal}
                onChange={(event) => setTargetTotal(event.target.value)}
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
                  Indicate the target for the budget year in terms of the performance indicator expressed in quantity, quality, and timeliness.

                </TooltipContent>
              </Tooltip>
            </div>
            <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
              Integer output target, not a percentage.
            </p>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-[11px] font-black uppercase tracking-widest text-foreground">
                Proposed Budget Categories
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the standard AIP budget classifications.
              </p>
            </div>
            <span className="rounded bg-foreground px-3 py-1 text-[10px] font-black uppercase text-background">
              {formatPHPFull(totalBudget)}
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-4 items-stretch">
            <BudgetInput label="Personal Services" value={ps} onChange={setPs} tooltip="Includes payment of salaries, wages, and other compensation of permanent, temporary, contractual, and casual employees of the LGU." />
            <BudgetInput label="Maintenance and Other Operating Expenses (MOOE)" value={mooe} onChange={setMooe} tooltip="Include maintenance requirements of existing as well as newly-completed facilities and newly-acquired assets e.g., vehicles." />
            <BudgetInput label="Financial Expenses" value={fe} onChange={setFe} tooltip="Include Management Supervisions/Trusteeship Fees, Interest Expenses, Interest Paid to Residents other than General Government, Interest Paid to other General Government Units, Guarantee Fees, Bank Charges, Commitment Fees and Other Financial Charges, all other fees and charges related to loans payable, and losses incurred relative to foreign exchange transactions." />
            <BudgetInput label="Capital Outlay" value={co} onChange={setCo} tooltip="Include office equipment and furniture and fixtures that have to be procured over the medium-term." />
          </div>
        </section>

        <div>
          <FieldLabel>Remarks</FieldLabel>
          <div className="relative">
            <textarea className={`${inputCls} h-16 resize-none pr-10`} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="absolute right-2 top-2 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-bold text-gray-500 shadow-sm hover:bg-gray-100"
                >
                  i
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px]">
                Optional remarks or additional information.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      </TooltipProvider>
    </ModalShell>
  );
}

function BudgetInput({
  label,
  value,
  onChange,
  tooltip,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  tooltip: string;
}) {
  return (
    <div className="flex h-full flex-col justify-between gap-2">
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          className={`${inputCls} text-right font-mono pr-10`}
          type="number"
          min={0}
          step="0.01"
          value={value}
          onChange={(event) => onChange(event.target.value)}
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
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}