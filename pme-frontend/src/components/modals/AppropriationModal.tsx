import { useEffect, useMemo, useState } from "react";
import "@/styles/materialSymbols.css";
import {
  createAppropriation,
  createAppropriationFundSource,
  updateAppropriation,
  updateAppropriationFundSource,
  type AppropriationFundSourceOption,
  type CurrentAppropriationInfo,
  type FundSourceOption,
} from "@/services/projectActions.service";
import { formatPHPFull } from "@/lib/format";
import {
  ModalShell,
  FieldLabel,
  inputCls,
  readonlyInputCls,
  ModalButton,
} from "./ModalShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const EXPENSE_CLASS_LABELS: Record<string, string> = {
  PS: "Personal Services",
  MOOE: "Maintenance and Other Operating Expenses",
  FE: "Financial Expenses",
  CO: "Capital Outlay",
};

interface Row {
  row_id: string;
  appr_fund_source_id?: string;
  fund_source_id: string;
  fund_name: string;
  expense_class: string;
  current_amount: number;
  amount: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  projectAipId?: string;
  projectCode: string;
  projectTitle: string;
  aipReference?: string;
  year: number;
  fundSources: FundSourceOption[];
  existingLines?: AppropriationFundSourceOption[];
  appropriation?: CurrentAppropriationInfo;
}

function toAmount(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function AppropriationModal({
  open,
  onClose,
  onSaved,
  projectAipId,
  projectCode,
  projectTitle,
  aipReference,
  year,
  fundSources,
  existingLines = [],
  appropriation,
}: Props) {
  const [aoNumber, setAoNumber] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isUpdate = Boolean(appropriation?.appropriation_id);

  const fundSourceMap = useMemo(
    () => new Map(fundSources.map((source) => [source.fund_source_id, source.fund_name])),
    [fundSources],
  );

  useEffect(() => {
    if (!open) return;

    setAoNumber(appropriation?.ao_number ?? "");
    const nextRows: Row[] = existingLines.map((line) => {
      const currentAmount = Number(line.appropriated_amount ?? 0);
      return {
        row_id: line.appr_fund_source_id,
        appr_fund_source_id: line.appr_fund_source_id,
        fund_source_id: line.fund_source_id,
        fund_name: line.fund_name ?? fundSourceMap.get(line.fund_source_id) ?? "Fund Source",
        expense_class: line.expense_class,
        current_amount: currentAmount,
        amount: String(currentAmount),
      };
    });
    if (!appropriation?.appropriation_id && nextRows.length === 0) {
      const firstFundSource = fundSources[0];
      nextRows.push({
        row_id: `new-${Date.now()}-0`,
        fund_source_id: firstFundSource?.fund_source_id ?? "",
        fund_name: firstFundSource?.fund_name ?? "Fund Source",
        expense_class: "MOOE",
        current_amount: 0,
        amount: "",
      });
    }
    setRows(nextRows);
    setError(null);
  }, [appropriation, existingLines, fundSourceMap, fundSources, open]);

  const validationError = useMemo(() => {
    if (!projectAipId) return "This project is not linked to an AIP record yet.";
    if (!aoNumber.trim()) return "AO number is required.";
    if (rows.length === 0) return "Add at least one fund source line.";

    const incomplete = rows.find(
      (row) => !row.fund_source_id || !row.expense_class || toAmount(row.amount) <= 0,
    );
    if (incomplete) return "Each fund source line needs a fund source, expense class, and amount greater than zero.";

    const lowered = rows.find((row) => row.appr_fund_source_id && toAmount(row.amount) < row.current_amount);
    if (lowered) {
      return `${lowered.fund_name} / ${lowered.expense_class} cannot be lower than its stored amount of ${formatPHPFull(lowered.current_amount)}.`;
    }

    return null;
  }, [aoNumber, projectAipId, rows]);

  const total = useMemo(
    () => rows.reduce((sum, row) => sum + toAmount(row.amount), 0),
    [rows],
  );
  const currentTotal = useMemo(
    () => rows.reduce((sum, row) => sum + row.current_amount, 0),
    [rows],
  );

  const addRow = () => {
    const firstFundSource = fundSources[0];
    setRows((current) => [
      ...current,
      {
        row_id: `new-${Date.now()}-${current.length}`,
        fund_source_id: firstFundSource?.fund_source_id ?? "",
        fund_name: firstFundSource?.fund_name ?? "Fund Source",
        expense_class: "MOOE",
        current_amount: 0,
        amount: "",
      },
    ]);
  };

  const removeRow = (rowId: string) => {
    setRows((current) => current.filter((row) => row.row_id !== rowId));
  };

  const updateRow = (rowId: string, changes: Partial<Pick<Row, "fund_source_id" | "expense_class" | "amount">>) => {
    setRows((current) =>
      current.map((row) => {
        if (row.row_id !== rowId) return row;
        const nextFundSourceId = changes.fund_source_id ?? row.fund_source_id;
        return {
          ...row,
          ...changes,
          fund_name: fundSourceMap.get(nextFundSourceId) ?? row.fund_name,
        };
      }),
    );
  };

  const handleSave = async () => {
    const message = validationError;
    if (message) {
      setError(message);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const savedAppropriation = appropriation?.appropriation_id
        ? await updateAppropriation(appropriation.appropriation_id, {
            ao_number: aoNumber.trim(),
          })
        : await createAppropriation({
            project_aip_id: projectAipId!,
            ao_number: aoNumber.trim(),
            fiscal_year: String(year),
          });
      const appropriationId = savedAppropriation.appropriation_id;

      const changedRows = rows.filter(
        (row) => row.appr_fund_source_id && toAmount(row.amount) !== row.current_amount,
      );
      const newRows = rows.filter((row) => !row.appr_fund_source_id);

      await Promise.all(
        [
          ...changedRows.map((row) =>
            updateAppropriationFundSource(row.appr_fund_source_id!, {
              appropriated_amount: toAmount(row.amount),
            }),
          ),
          ...newRows.map((row) =>
            createAppropriationFundSource({
              appropriation_id: appropriationId,
              fund_source_id: row.fund_source_id,
              expense_class: row.expense_class,
              appropriated_amount: toAmount(row.amount),
            }),
          ),
        ],
      );

      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update appropriation.");
    } finally {
      setBusy(false);
    }
  };

  const canSave = !busy && !validationError;

  return (
    <TooltipProvider delayDuration={100}>
      <ModalShell
        open={open}
        onClose={onClose}
        title={isUpdate ? "Update Project Appropriation" : "Add Project Appropriation"}
        subtitle={isUpdate ? "Adjust existing appropriation records without reducing stored amounts." : "Create the appropriation and assign budget lines by fund source and expense class."}
        size="max-w-4xl"
        footer={
        <>
          <div className="flex flex-col">
            <span className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Updated Authorized Ceiling
            </span>
            <span className="text-2xl font-bold text-primary">
              {formatPHPFull(total)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              Current stored total: {formatPHPFull(currentTotal)}
            </span>
          </div>
          <div className="flex gap-3">
            <ModalButton variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </ModalButton>
            <ModalButton onClick={handleSave} disabled={!canSave}>
              {busy ? "Saving..." : isUpdate ? "Update Appropriation" : "Add Appropriation"}
            </ModalButton>
          </div>
        </>
      }
    >
      {(error ?? validationError) ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-800">
          {error ?? validationError}
        </div>
      ) : null}

      <div className="mb-7 grid grid-cols-2 gap-x-6 gap-y-5">
        <div>
          <FieldLabel>Project ID</FieldLabel>
          <input className={readonlyInputCls} readOnly value={projectCode} />
        </div>
        <div>
          <FieldLabel required>AO Number</FieldLabel>
          <div className="relative">
            <input
              className={`${inputCls} pr-10`}
              placeholder="e.g., AO-2025-01"
              value={aoNumber}
              onChange={(event) => setAoNumber(event.target.value)}
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
                The local law directing government fund payments.
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div>
          <FieldLabel>Project Title</FieldLabel>
          <input className={readonlyInputCls} readOnly value={projectTitle} />
        </div>
        <div>
          <FieldLabel>AIP Reference Code</FieldLabel>
          <input
            className={`${readonlyInputCls} font-mono text-xs`}
            readOnly
            value={aipReference ?? "-"}
          />
        </div>
        <div>
          <FieldLabel>Fiscal Year</FieldLabel>
          <input className={readonlyInputCls} readOnly value={year} />
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Budget Appropriated
        </h3>
        <ModalButton className="px-4 py-2 text-xs" variant="secondary" type="button" onClick={addRow}>
          Add Fund Source
        </ModalButton>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-muted/20">
        <table className="w-full text-left">
          <thead className="border-b border-border bg-card">
            <tr>
              <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Fund Source
              </th>
              <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Expense Class
              </th>
              <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Current Amount
              </th>
              <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                New Amount
              </th>
              <th className="w-12 px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-card">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Add a fund source line to define this project appropriation.
                </td>
              </tr>
            ) : null}
            {rows.map((row) => {
              const newAmount = toAmount(row.amount);
              const invalid = newAmount < row.current_amount;
              return (
                <tr key={row.row_id}>
                  <td className="px-5 py-3">
                    {row.appr_fund_source_id ? (
                      <p className="text-sm font-bold text-foreground">{row.fund_name}</p>
                    ) : (
                      <select
                        className={inputCls}
                        value={row.fund_source_id}
                        onChange={(event) => updateRow(row.row_id, { fund_source_id: event.target.value })}
                      >
                        {fundSources.map((source) => (
                          <option key={source.fund_source_id} value={source.fund_source_id}>
                            {source.fund_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {row.appr_fund_source_id ? (
                      <>
                        <p className="text-xs font-bold text-foreground">
                          {EXPENSE_CLASS_LABELS[row.expense_class] ?? row.expense_class}
                        </p>
                        <p className="text-[10px] font-black uppercase text-muted-foreground">
                          {row.expense_class}
                        </p>
                      </>
                    ) : (
                      <select
                        className={inputCls}
                        value={row.expense_class}
                        onChange={(event) => updateRow(row.row_id, { expense_class: event.target.value })}
                      >
                        {Object.entries(EXPENSE_CLASS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-sm text-muted-foreground">
                    {formatPHPFull(row.current_amount)}
                  </td>
                  <td className="px-5 py-3">
                    <input
                      className={`${inputCls} text-right font-mono ${invalid ? "border-destructive text-destructive" : ""}`}
                      type="number"
                      min={row.current_amount}
                      step="0.01"
                      value={row.amount}
                      onChange={(event) => updateRow(row.row_id, { amount: event.target.value })}
                    />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {!row.appr_fund_source_id ? (
                      <button
                        className="rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-destructive"
                        type="button"
                        onClick={() => removeRow(row.row_id)}
                        aria-label="Remove fund source"
                      >
                        <span className="material-symbols-outlined text-lg">close</span>
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ModalShell>
    </TooltipProvider>
  );
}