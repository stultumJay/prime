import { useEffect, useMemo, useState } from "react";
import { FieldLabel, ModalButton, ModalShell } from "./ModalShell";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface DocumentTrackingModalProps {
  open: boolean;
  initialDtn?: string | null;
  submitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (dtnNo: string) => Promise<void> | void;
}

const DTN_PREFIX = "DTN-";

function suffixFromDtn(value?: string | null) {
  const trimmed = (value ?? "").trim();
  return trimmed.toUpperCase().startsWith(DTN_PREFIX)
    ? trimmed.slice(DTN_PREFIX.length)
    : trimmed;
}

export default function DocumentTrackingModal({
  open,
  initialDtn,
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: DocumentTrackingModalProps) {
  const [suffix, setSuffix] = useState("");

  useEffect(() => {
    if (!open) return;
    setSuffix(suffixFromDtn(initialDtn));
  }, [initialDtn, open]);

  const normalizedSuffix = useMemo(
    () => suffix.replace(/^DTN-/i, "").trim().toUpperCase(),
    [suffix],
  );
  const canSubmit = normalizedSuffix.length > 0 && !submitting;

  return (
    <TooltipProvider delayDuration={100}>
      <ModalShell
        open={open}
        onClose={() => onOpenChange(false)}
        title="Document Tracking"
        subtitle="Link this project to the Google Drive folder uploaded by DTS."
        size="max-w-xl"
        footer={
        <>
          <span className="text-xs text-muted-foreground">
            Document files are read by PME through the backend.
          </span>
          <div className="flex items-center gap-2">
            <ModalButton
              type="button"
              variant="secondary"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancel
            </ModalButton>
            <ModalButton type="submit" form="document-tracking-form" disabled={!canSubmit}>
              {submitting ? "Saving..." : "Save DTN"}
            </ModalButton>
          </div>
        </>
      }
    >
      <form
        id="document-tracking-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          void onSubmit(`${DTN_PREFIX}${normalizedSuffix}`);
        }}
      >
        {error ? (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
            {error}
          </div>
        ) : null}

        <FieldLabel required>DTN Number</FieldLabel>
        <div className="relative flex overflow-hidden rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
          <span className="flex items-center border-r border-border bg-muted px-4 text-sm font-black text-muted-foreground">
            {DTN_PREFIX}
          </span>
          <input
            value={suffix}
            onChange={(event) => setSuffix(event.target.value.replace(/^DTN-/i, ""))}
            placeholder="2025-001"
            autoFocus
            className="min-w-0 flex-1 bg-transparent px-4 py-3 pr-10 text-sm font-semibold text-foreground outline-none placeholder:text-muted-foreground/60"
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
              The document tracking number assigned by DTS for this project folder.
            </TooltipContent>
          </Tooltip>
        </div>
      </form>
    </ModalShell>
    </TooltipProvider>
  );
}
