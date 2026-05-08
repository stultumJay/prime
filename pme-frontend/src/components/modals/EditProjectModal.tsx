import { useEffect, useState } from "react";
import "@/styles/materialSymbols.css";
import type { ProjectDetailPayload, ProjectStatus } from "@/services/project.service";

type Project = ProjectDetailPayload["project"];

export interface EditProjectPayload {
  project_title: string;
  project_description?: string | null;
  barangay?: string | null;
  street?: string | null;
  location_lat?: number | null;
  location_lng?: number | null;
  expected_start_date?: string | null;
  expected_end_date?: string | null;
}

interface EditProjectModalProps {
  open: boolean;
  project: Project;
  phases?: ProjectDetailPayload["phases"];
  submitting?: boolean;
  error?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: EditProjectPayload) => void;
}

const statuses: { value: ProjectStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "delayed", label: "Delayed" },
];

function dateValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function EditProjectModal({
  open,
  project,
  phases = [],
  submitting = false,
  error,
  onOpenChange,
  onSubmit,
}: EditProjectModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [barangay, setBarangay] = useState("");
  const [street, setStreet] = useState("");
  const [expectedStart, setExpectedStart] = useState("");
  const [expectedEnd, setExpectedEnd] = useState("");
  const [actualStart, setActualStart] = useState("");
  const [actualEnd, setActualEnd] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(project.project_title ?? "");
    setDescription(project.project_description ?? "");
    setBarangay(project.barangay ?? "");
    setStreet(project.street ?? "");
    setExpectedStart(dateValue(project.expected_start_date));
    setExpectedEnd(dateValue(project.expected_end_date));
    setActualStart(dateValue(project.actual_start_date));
    setActualEnd(dateValue(project.actual_end_date));
    setLatitude(project.location_lat == null ? "" : String(project.location_lat));
    setLongitude(project.location_lng == null ? "" : String(project.location_lng));
  }, [open, project]);

  if (!open) return null;

  const computedStatus = deriveProjectStatus(phases, project.status ?? "planned");
  const computedActualStart = computedStatus === "planned" ? "" : actualStart;
  const computedActualEnd = computedStatus === "completed" ? actualEnd : "";
  const canSubmit = title.trim().length > 0 && !submitting;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      project_title: title.trim(),
      project_description: nullableText(description),
      barangay: nullableText(barangay),
      street: nullableText(street),
      location_lat: nullableNumber(latitude),
      location_lng: nullableNumber(longitude),
      expected_start_date: expectedStart || null,
      expected_end_date: expectedEnd || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onClick={(event) => event.target === event.currentTarget && onOpenChange(false)}
    >
      <form
        className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-600">
              Project Profile
            </p>
            <h2 className="mt-1 text-xl font-black tracking-tight text-slate-950">
              Edit Project
            </h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {project.project_code}
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

        <div className="max-h-[62vh] space-y-4 overflow-y-auto px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          <TextField label="Project Title" value={title} onChange={setTitle} />

          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
              Project Description
            </span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Barangay" value={barangay} onChange={setBarangay} required={false} />
            <TextField label="Street" value={street} onChange={setStreet} required={false} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="block space-y-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                Status
              </span>
              <div className="flex h-11 items-center rounded-lg border border-slate-200 bg-slate-50 px-3">
                <p className="text-sm font-black text-slate-900">
                  {statuses.find((item) => item.value === computedStatus)?.label ?? "Planned"}
                </p>
              </div>
            </div>
            <TextField label="Latitude" type="number" value={latitude} onChange={setLatitude} required={false} step="0.000001" />
            <TextField label="Longitude" type="number" value={longitude} onChange={setLongitude} required={false} step="0.000001" />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField 
              label="Expected Start" 
              type="date" 
              value={expectedStart} 
              onChange={setExpectedStart} 
              required={false} 
              min="2000-01-01" 
              max="2100-12-31" 
            />
            <TextField 
              label="Expected End" 
              type="date" 
              value={expectedEnd} 
              onChange={setExpectedEnd} 
              required={false} 
              min="2000-01-01" 
              max="2100-12-31" 
            />
            <TextField label="Actual Start" type="date" value={computedActualStart} onChange={setActualStart} required={false} disabled />
            <TextField label="Actual End" type="date" value={computedActualEnd} onChange={setActualEnd} required={false} disabled />
          </div>
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
            {submitting ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function deriveProjectStatus(
  phases: ProjectDetailPayload["phases"],
  fallback: ProjectStatus,
): ProjectStatus {
  if (fallback === "delayed") return "delayed";
  if (!phases.length) return "planned";

  const percentages = phases.map((phase) => Number(phase.progress_percent) || 0);
  if (percentages.every((percent) => percent >= 100)) return "completed";
  if (percentages.some((percent) => percent > 0)) return "in_progress";
  return "planned";
}

function TextField({
  label,
  value,
  type = "text",
  required = true,
  step,
  disabled = false,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  required?: boolean;
  step?: string;
  disabled?: boolean;
  min?: string;
  max?: string;
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
        step={step}
        disabled={disabled}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 disabled:bg-slate-50 disabled:text-slate-500"
      />
    </label>
  );
}
