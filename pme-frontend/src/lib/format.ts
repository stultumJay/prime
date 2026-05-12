import type { ProjectStatus } from "./schema";

const PHP_SYMBOL = "\u20b1";
const DASH = "\u2014";

export function formatPHP(amount: number): string {
  if (amount >= 1_000_000) return `${PHP_SYMBOL}${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `${PHP_SYMBOL}${(amount / 1_000).toFixed(1)}K`;
  return `${PHP_SYMBOL}${amount.toFixed(2)}`;
}

export function formatPHPFull(amount?: number | null): string {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return DASH;
  return `${PHP_SYMBOL}${amount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function hasMaxTwoDecimalPlaces(value: string): boolean {
  return /^(\d+)?(\.\d{0,2})?$/.test(value);
}

export function normalizeMoneyInput(value: string): string {
  const normalized = value.replace(/,/g, "").trim();
  return hasMaxTwoDecimalPlaces(normalized)
    ? normalized
    : normalized.replace(/^(\d*\.?\d{0,2}).*$/, "$1");
}

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  planned: "Planned",
  in_progress: "In Progress",
  on_hold: "On Hold",
  completed: "Completed",
  delayed: "Delayed",
};

export function statusToneClass(status: ProjectStatus): string {
  switch (status) {
    case "completed":
      return "bg-status-completed/15 text-status-completed";
    case "delayed":
      return "bg-status-delayed/15 text-status-delayed";
    case "in_progress":
      return "bg-status-ongoing/15 text-status-ongoing";
    case "on_hold":
      return "bg-status-utilization/15 text-status-utilization";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;

  return d.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelativeTime(iso: string): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return DASH;

  const diffMs = Date.now() - time;
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
