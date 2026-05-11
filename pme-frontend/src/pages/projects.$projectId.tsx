import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { Topbar } from "@/components/layout/Topbar";
import { AppIcon } from "@/components/ui/AppIcon";
import {
  useCurrentUserName,
  useProjectDetail,
  useProjectFinanceModalData,
  useProjectMutations,
} from "@/hooks/useProjectDetail";
import type { AddToAipPayload } from "@/services/projectActions.service";
import type { IssueItem } from "@/services/issues.service";
import type { ProjectDetailPayload } from "@/services/project.service";
import type { EditProjectPayload } from "@/components/modals/EditProjectModal";
import {
  STATUS_LABEL,
  formatDate,
  formatDateTime,
  formatPHPFull,
  formatRelativeTime,
  statusToneClass,
} from "@/lib/format";

type ProjectModal =
  | "add-aip"
  | "appropriation"
  | "allotment"
  | "obligation"
  | "disbursement"
  | "progress"
  | "issue"
  | "resolve"
  | "physical-progress"
  | "documents";

type TimelineModalState = {
  phase_name: string;
  start_date: string;
  end_date: string;
} | null;

type PhaseDraft = {
  key: string;
  phase_name: string;
  status: string;
  start_date: string;
  end_date: string;
  progress_percent: number;
};

const FIXED_PHASES = ["Preliminary", "Procurement", "Construction", "Testing"] as const;
const AddToAipModal = lazy(() => import("@/components/modals/AddToAipModal"));
const AllotmentModal = lazy(() => import("@/components/modals/AllotmentModal"));
const AppropriationModal = lazy(() => import("@/components/modals/AppropriationModal"));
const DisbursementModal = lazy(() => import("@/components/modals/DisbursementModal"));
const DocumentTrackingModal = lazy(() => import("@/components/modals/DocumentTrackingModal"));
const EditProjectModal = lazy(() => import("@/components/modals/EditProjectModal"));
const IssueLogModal = lazy(() => import("@/components/modals/IssueLogModal"));
const ObligationModal = lazy(() => import("@/components/modals/ObligationModal"));
const PhysicalProgressModal = lazy(() => import("@/components/modals/PhysicalProgressLogModal"));
const ProgressLogModal = lazy(() => import("@/components/modals/ProgressLogModal"));
const ResolveIssueModal = lazy(() => import("@/components/modals/ResolveIssueModal"));

function pesoShort(amount: number) {
  if (amount >= 1_000_000) return `PHP ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `PHP ${(amount / 1_000).toFixed(0)}K`;
  return formatPHPFull(amount);
}

function formatPHP(amount: number) {
  return formatPHPFull(amount);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildPhaseDrafts(project: ProjectDetailPayload): PhaseDraft[] {
  const phaseMap = new Map(project.phases.map((phase) => [phase.phase_name.toLowerCase(), phase]));
  return FIXED_PHASES.map((phaseName, index) => {
    const phase = phaseMap.get(phaseName.toLowerCase());
    const progress = phase?.progress_percent ?? 0;
    return {
      key: phase?.phase_id ?? `${phaseName}-${index}`,
      phase_name: phaseName,
      status: progress >= 100 ? "completed" : progress > 0 ? "in_progress" : "planned",
      start_date: phase?.start_date ?? "",
      end_date: phase?.end_date ?? "",
      progress_percent: progress,
    };
  });
}

export default function ProjectDetailPage() {
  const navigate = useNavigate();
  const { projectId: rawProjectId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { year?: unknown };
  const projectId = decodeURIComponent(rawProjectId ?? "").trim();
  const [year, setYear] = useState<number | undefined>(() => {
    const parsed = Number(search.year);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  });
  const [modal, setModal] = useState<ProjectModal | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [issueError, setIssueError] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineModal, setTimelineModal] = useState<TimelineModalState>(null);
  const currentUserName = useCurrentUserName();

  const detailQuery = useProjectDetail(projectId, year);
  const project = detailQuery.data;
  const selectedYear = project?.selected_year ?? year ?? undefined;
  const activeAipContext = useMemo(
    () => project?.aip_contexts.find((context) => context.fiscal_year === selectedYear) ?? null,
    [project?.aip_contexts, selectedYear],
  );

  const financeModalQuery = useProjectFinanceModalData(
    projectId,
    activeAipContext?.project_aip_id,
    false,
    project,
  );
  const mutations = useProjectMutations(projectId, selectedYear);

  const [phaseDrafts, setPhaseDrafts] = useState<PhaseDraft[]>([]);

  useEffect(() => {
    if (project?.selected_year && year === undefined) setYear(project.selected_year);
  }, [project?.selected_year, year]);

  useEffect(() => {
    if (project) setPhaseDrafts(buildPhaseDrafts(project));
  }, [project]);

  const issues = useMemo<IssueItem[]>(
    () =>
      (project?.issues ?? []).map((issue) => ({
        issue_id: issue.issue_id,
        project_id: project?.project.project_id ?? projectId,
        issue_name: issue.issue_title,
        issue_category: issue.severity,
        issue_description: issue.issue_title,
        status: issue.resolved ? "Resolved" : "Open",
        date_reported: issue.reported_at,
        corrective_action: null,
        resolved_date: null,
        resolved_by: null,
      })),
    [project, projectId],
  );
  const openIssues = useMemo(() => issues.filter((issue) => issue.status === "Open"), [issues]);
  const financeModalData = financeModalQuery.data;
  const budgetTotals = {
    appropriated: project?.budget.appropriation_total ?? 0,
    allotted: project?.budget.allotment_total ?? 0,
    obligated: project?.budget.obligation_total ?? 0,
    disbursed: project?.budget.disbursement_total ?? 0,
  };
  const isIntegrated = Boolean(project?.aip_contexts.length);
  const isLocationalCleared = Boolean(project?.project.locational_clearance_status);
  const financialActionsDisabled = !activeAipContext;

  async function openFinanceModal(nextModal: Extract<ProjectModal, "appropriation" | "allotment" | "obligation" | "disbursement">) {
    if (!activeAipContext) return;
    const result = await financeModalQuery.refetch();
    if (result.error) {
      setNotice(result.error instanceof Error ? result.error.message : "Financial records could not be loaded.");
      return;
    }
    setModal(nextModal);
  }

  function handleOpenDocument(document: ProjectDetailPayload["documents"][number], action: "view" | "download" = "view") {
    const url = document.document_url;
    if (!url) return;

    if (action === "view") {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    const match = url.match(/\/d\/([^/]+)/);

    if (match?.[1]) {
      const fileId = match[1];
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      return;
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function closeFinanceModal() {
    setModal(null);
  }

  async function afterFinanceSave(message: string) {
    setModal(null);
    setNotice(message);
    await Promise.all([detailQuery.refetch(), financeModalQuery.refetch()]);
  }

  if (detailQuery.isLoading && !project) {
    return <CenteredState message="Loading project..." />;
  }

  if (detailQuery.error && !project) {
    return (
      <CenteredState
        title="Project failed to load"
        message={detailQuery.error instanceof Error ? detailQuery.error.message : "Project could not be loaded."}
        actionLabel="Back to projects"
        onAction={() => void navigate({ to: "/projects" })}
      />
    );
  }

  if (!project) return null;

  const physicalPerformanceId = activeAipContext?.performance_id ?? "";
  const physicalProgressSeed = {
    performance_indicator:
      activeAipContext?.performance?.performance_indicator ??
      "Physical progress data is available after this project is integrated into an AIP performance record.",
    target_total: activeAipContext?.performance?.target_total ?? 0,
    target_q1: activeAipContext?.performance?.target_q1 ?? 0,
    target_q2: activeAipContext?.performance?.target_q2 ?? 0,
    target_q3: activeAipContext?.performance?.target_q3 ?? 0,
    target_q4: activeAipContext?.performance?.target_q4 ?? 0,
    actual_q1: activeAipContext?.performance?.actual_q1 ?? 0,
    actual_q2: activeAipContext?.performance?.actual_q2 ?? 0,
    actual_q3: activeAipContext?.performance?.actual_q3 ?? 0,
    actual_q4: activeAipContext?.performance?.actual_q4 ?? 0,
  };

  return (
    <AppShell>
      <Topbar title="Project Details" />
      <div className="flex flex-1 flex-col gap-6 overflow-auto bg-[#f6f8fb] p-6 lg:p-8">
        <Header
          data={project}
          locationalCleared={isLocationalCleared}
          onBack={() => window.history.back()}
          onAddToAip={() => setModal("add-aip")}
          onEdit={() => setEditOpen(true)}
        />

        {notice ? <NoticeBanner message={notice} onDismiss={() => setNotice(null)} /> : null}
        <div className="grid grid-cols-12 gap-6">
          <main className="col-span-12 space-y-6 xl:col-span-8">
            <AipContextCard
              years={project.aip_years}
              currentYear={project.selected_year}
              integrated={isIntegrated}
              aipReference={activeAipContext?.aip_reference_code}
              onSelect={(nextYear) => setYear(nextYear)}
            />
            <OverviewCard
              data={project}
              locationalCleared={isLocationalCleared}
            />
            <LifecycleCard
              rows={phaseDrafts}
              onSetDates={(row) => {
                setTimelineError(null);
                setTimelineModal({
                  phase_name: row.phase_name,
                  start_date: row.start_date,
                  end_date: row.end_date,
                });
              }}
            />
            <BudgetTrackingCard
              budget={project.budget}
              loading={detailQuery.isFetching && !detailQuery.data}
              disabled={financialActionsDisabled}
              onOpenAppropriation={() => void openFinanceModal("appropriation")}
            />
            <ActivityFeedCard activity={project.activity} />
          </main>

          <aside className="col-span-12 space-y-6 xl:col-span-4">
            <DocumentsCard
              tracking={project.document_tracking}
              documents={project.documents}
              onOpenDocument={handleOpenDocument}
              onConfigure={() => {
                setDocumentError(null);
                setModal("documents");
              }}
            />
            <PhaseProgressCard
              phases={project.phases}
              overall={project.overall_progress_percent}
              onLogProgress={() => setModal("progress")}
            />
            <RiskIssueCard
              issues={issues}
              totalIssues={issues.length}
              openIssues={openIssues.length}
              code={project.project.project_code}
              onOpenIssueModal={() => setModal("issue")}
              onOpenResolveModal={() => setModal("resolve")}
            />
            <PhysicalProgressCard
              year={project.selected_year ?? new Date().getFullYear()}
              progress={project.physical_progress}
              loading={detailQuery.isFetching && !detailQuery.data}
              canOpen={Boolean(physicalPerformanceId)}
              onLogProgress={() => setModal("physical-progress")}
            />
            <FinancialExecutionPanel
              budget={project.budget}
              totals={budgetTotals}
              disabled={financialActionsDisabled}
              onOpenAllotment={() => void openFinanceModal("allotment")}
              onOpenObligation={() => void openFinanceModal("obligation")}
              onOpenDisbursement={() => void openFinanceModal("disbursement")}
            />
          </aside>
        </div>
      </div>

      {modal === "add-aip" ? (
        <Suspense fallback={null}>
          <AddToAipModal
            open
            project={project}
            existingYears={project.aip_years}
            submitting={mutations.addToAip.isPending}
            error={mutations.addToAip.error instanceof Error ? mutations.addToAip.error.message : null}
            onOpenChange={(open) => setModal(open ? "add-aip" : null)}
            onSubmit={async (payload: AddToAipPayload) => {
              await mutations.addToAip.mutateAsync(payload);
              setYear(payload.fiscal_year);
              setModal(null);
            }}
          />
        </Suspense>
      ) : null}
      {modal === "appropriation" ? (
        <Suspense fallback={null}>
          <AppropriationModal
            open
            onClose={closeFinanceModal}
            onSaved={() => void afterFinanceSave("Appropriation saved. Financial totals were refreshed.")}
            projectAipId={activeAipContext?.project_aip_id}
            projectCode={project.project.project_code}
            projectTitle={project.project.project_title}
            aipReference={activeAipContext?.aip_reference_code}
            year={project.selected_year ?? new Date().getFullYear()}
            fundSources={financeModalData.fundSources}
            existingLines={financeModalData.appropriationFundSources}
            appropriation={financeModalData.appropriation}
          />
        </Suspense>
      ) : null}
      {modal === "allotment" ? (
        <Suspense fallback={null}>
          <AllotmentModal
            open
            onClose={closeFinanceModal}
            onSaved={() => void afterFinanceSave("Allotment saved. Financial totals were refreshed.")}
            year={project.selected_year ?? new Date().getFullYear()}
            appropriation={financeModalData.appropriation}
            appropriationFundSources={financeModalData.appropriationFundSources}
            unreleasedTotal={financeModalData.unreleasedTotal}
          />
        </Suspense>
      ) : null}
      {modal === "obligation" ? (
        <Suspense fallback={null}>
          <ObligationModal
            open
            onClose={closeFinanceModal}
            onSaved={() => void afterFinanceSave("Obligation saved. Financial totals were refreshed.")}
            year={project.selected_year ?? new Date().getFullYear()}
            allotments={financeModalData.allotments}
          />
        </Suspense>
      ) : null}
      {modal === "disbursement" ? (
        <Suspense fallback={null}>
          <DisbursementModal
            open
            onClose={closeFinanceModal}
            onSaved={() => void afterFinanceSave("Disbursement saved. Financial totals were refreshed.")}
            year={project.selected_year ?? new Date().getFullYear()}
            obligations={financeModalData.obligations}
          />
        </Suspense>
      ) : null}
      {modal === "progress" ? (
        <Suspense fallback={null}>
          <ProgressLogModal
            open
            phases={project.phases}
            submitting={mutations.createProgress.isPending}
            error={progressError}
            onOpenChange={(open) => {
              setModal(open ? "progress" : null);
              if (!open) setProgressError(null);
            }}
            onSubmit={async (payload) => {
              try {
                await mutations.createProgress.mutateAsync(payload);
                setModal(null);
              } catch (error) {
                setProgressError(error instanceof Error ? error.message : "Failed to save progress.");
              }
            }}
          />
        </Suspense>
      ) : null}
      {modal === "issue" ? (
        <Suspense fallback={null}>
          <IssueLogModal
            open
            projectId={project.project.project_id}
            projectLabel={project.project.project_title}
            submitting={mutations.createIssue.isPending}
            error={issueError}
            onOpenChange={(open) => {
              setModal(open ? "issue" : null);
              if (!open) setIssueError(null);
            }}
            onSubmit={async (payload) => {
              try {
                await mutations.createIssue.mutateAsync(payload);
                await detailQuery.refetch();
                setModal(null);
              } catch (error) {
                setIssueError(error instanceof Error ? error.message : "Failed to log issue.");
              }
            }}
          />
        </Suspense>
      ) : null}
      {modal === "resolve" ? (
        <Suspense fallback={null}>
          <ResolveIssueModal
            open
            issues={issues}
            resolvedBy={currentUserName}
            submitting={mutations.resolveIssue.isPending}
            error={resolveError}
            onOpenChange={(open) => {
              setModal(open ? "resolve" : null);
              if (!open) setResolveError(null);
            }}
            onSubmit={async (payload) => {
              try {
                await mutations.resolveIssue.mutateAsync({
                  issueId: payload.issue_id,
                  payload: {
                    corrective_action: payload.corrective_action,
                    resolved_date: payload.resolved_date,
                    resolved_by: payload.resolved_by,
                  },
                });
                await detailQuery.refetch();
                setModal(null);
              } catch (error) {
                setResolveError(error instanceof Error ? error.message : "Failed to resolve issue.");
              }
            }}
          />
        </Suspense>
      ) : null}
      {modal === "physical-progress" ? (
        <Suspense fallback={null}>
          <PhysicalProgressModal
            open
            onClose={() => setModal(null)}
            onSuccess={() => void detailQuery.refetch()}
            performanceId={physicalPerformanceId}
            projectTitle={project.project.project_title}
            data={physicalProgressSeed}
          />
        </Suspense>
      ) : null}
      {modal === "documents" ? (
        <Suspense fallback={null}>
          <DocumentTrackingModal
            open
            initialDtn={project.document_tracking.dtn_no ?? project.project.dtn_no}
            submitting={mutations.updateDtn.isPending}
            error={documentError}
            onOpenChange={(open) => {
              setModal(open ? "documents" : null);
              if (!open) setDocumentError(null);
            }}
            onSubmit={async (dtnNo) => {
              try {
                await mutations.updateDtn.mutateAsync(dtnNo);
                await detailQuery.refetch();
                setModal(null);
                setNotice("DTN saved. Project documents were refreshed.");
              } catch (error) {
                setDocumentError(error instanceof Error ? error.message : "Failed to save DTN.");
              }
            }}
          />
        </Suspense>
      ) : null}
      <TimelineDateModal
        open={Boolean(timelineModal)}
        phase={timelineModal}
        submitting={mutations.updateTimeline.isPending}
        error={timelineError}
        onOpenChange={(open) => {
          if (!open) {
            setTimelineModal(null);
            setTimelineError(null);
          }
        }}
        onSubmit={async (payload) => {
          try {
            await mutations.updateTimeline.mutateAsync(payload);
            setTimelineModal(null);
          } catch (error) {
            setTimelineError(error instanceof Error ? error.message : "Failed to update timeline.");
          }
        }}
      />
      {editOpen ? (
        <Suspense fallback={null}>
          <EditProjectModal
            open
            project={project.project}
            phases={project.phases}
            submitting={mutations.updateProject.isPending}
            error={
              editError ??
              (mutations.updateProject.error instanceof Error
                ? mutations.updateProject.error.message
                : null)
            }
            onOpenChange={(open) => {
              setEditOpen(open);
              if (!open) setEditError(null);
            }}
            onSubmit={async (payload: EditProjectPayload) => {
              try {
                await mutations.updateProject.mutateAsync(payload);
                setEditOpen(false);
              } catch (error) {
                setEditError(error instanceof Error ? error.message : "Failed to update project.");
              }
            }}
          />
        </Suspense>
      ) : null}
    </AppShell>
  );
}

function CenteredState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title?: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        {title ? <h1 className="text-xl font-bold">{title}</h1> : null}
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="mt-4 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function NoticeBanner({
  message,
  tone = "info",
  onDismiss,
}: {
  message: string;
  tone?: "info" | "warning";
  onDismiss: () => void;
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : "border-primary/30 bg-primary/5 text-primary";

  return (
    <div className={`flex items-center justify-between rounded border p-4 text-sm font-semibold ${toneClass}`}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="text-[10px] font-black uppercase hover:underline">
        Dismiss
      </button>
    </div>
  );
}

function Header({
  data,
  locationalCleared,
  onBack,
  onAddToAip,
  onEdit,
}: {
  data: ProjectDetailPayload;
  locationalCleared: boolean;
  onBack: () => void;
  onAddToAip: () => void;
  onEdit: () => void;
}) {
  return (
    <header className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div>
        <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
          <AppIcon name="arrow_back" className="h-[18px] w-[18px]" />
          Back to Projects
        </button>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {data.project.project_code}
        </p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground md:text-3xl">
          {data.project.project_title}
        </h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusPill className={statusToneClass(data.project.status)}>
            {STATUS_LABEL[data.project.status] ?? data.project.status}
          </StatusPill>
          <StatusPill className={locationalCleared ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
            {locationalCleared ? "Locational cleared" : "Locational pending"}
          </StatusPill>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAddToAip}
          className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition hover:bg-primary/90"
        >
          <AppIcon name="playlist_add" className="h-4 w-4" />
          Add to Annual Investment Program
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-2 rounded bg-[#1fb8a6] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#159d8d]"
        >
          <AppIcon name="edit" className="h-4 w-4" />
          Edit Project
        </button>
      </div>
    </header>
  );
}

function StatusPill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${className}`}>
      {children}
    </span>
  );
}

function AipContextCard({
  years,
  currentYear,
  integrated,
  aipReference,
  onSelect,
}: {
  years: number[];
  currentYear: number | null;
  integrated: boolean;
  aipReference?: string;
  onSelect: (year: number) => void;
}) {
  if (!years.length) {
    return (
      <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <AppIcon name="calendar_today" className="h-5 w-5 text-primary" />
          <h2 className="text-xs font-black uppercase tracking-[0.22em]">
            Annual Investment Program (AIP) Context
          </h2>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          No AIP context exists for this project yet. Add an AIP record to activate fiscal-year budget and performance tracking.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <AppIcon name="calendar_today" className="h-5 w-5 text-primary" />
          <h2 className="text-xs font-black uppercase tracking-[0.22em]">
            Annual Investment Program (AIP) Context
          </h2>
        </div>
        <span className="rounded border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-black text-primary">
          {integrated && aipReference ? `AIP Ref: ${aipReference}` : currentYear ? `FY ${currentYear}` : "Select an AIP year"}
        </span>
      </div>
      <p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Historical fiscal year data
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {years.map((year) => (
          <button
            type="button"
            key={year}
            onClick={() => onSelect(year)}
            className={`inline-flex items-center gap-2 rounded border px-4 py-2 text-xs font-bold ${
              year === currentYear
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground"
            }`}
          >
            <AppIcon
              name={year === currentYear ? "radio_button_checked" : "history"}
              className="h-4 w-4"
            />
            {year}
          </button>
        ))}
      </div>
    </section>
  );
}

function OverviewCard({
  data,
  locationalCleared,
}: {
  data: ProjectDetailPayload;
  locationalCleared: boolean;
}) {
  return (
    <section className="rounded-2xl border border-border/70 bg-card p-8 shadow-sm">
      <h2 className="text-xs font-black uppercase tracking-[0.28em] text-muted-foreground">
        Project Overview
      </h2>
      <div className="mt-8 grid gap-x-10 gap-y-12 md:grid-cols-4">
        <Field label="Location">{data.location}</Field>
        <Field label="Locational Clearance">
          <StatusPill className={locationalCleared ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
            {locationalCleared ? "Cleared" : "Pending"}
          </StatusPill>
        </Field>
        <Field label="Sector">{data.sector_name}</Field>
        <Field label="Project Status">
          <span className="inline-flex rounded bg-primary px-3 py-1 text-xs font-bold uppercase text-primary-foreground">
            {STATUS_LABEL[data.project.status]}
          </span>
        </Field>
        <div className="md:col-span-2">
          <Field label="Implementing Office">{data.office_name}</Field>
        </div>
        <div className="md:col-span-2 md:row-span-2 md:border-l md:border-border md:pl-10">
          <Field label="Project Description">
            <span className="leading-relaxed text-muted-foreground">{data.project.project_description}</span>
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Program Name">{data.program_name}</Field>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
      <div className="text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

function LifecycleCard({
  rows,
  onSetDates,
}: {
  rows: PhaseDraft[];
  onSetDates: (row: PhaseDraft) => void;
}) {
  const [draftRows, setDraftRows] = useState<PhaseDraft[]>(rows);

  useEffect(() => {
    setDraftRows(rows);
  }, [rows]);

  const statusLabel = (row: PhaseDraft) => {
    if (row.progress_percent >= 100) return "Complete";
    if (row.progress_percent > 0) return "In Progress";
    return "Planned";
  };

  const updateDate = (key: string, field: "start_date" | "end_date", value: string) => {
    setDraftRows((current) =>
      current.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
          Lifecycle &amp; Phase Timeline
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-muted/60">
            <tr>
              {["Phase", "Status", "Start Date", "End Date", "Action"].map((header) => (
                <th key={header} className="px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {draftRows.map((row) => (
              <tr key={row.key} className={row.progress_percent > 0 ? "bg-primary/5" : undefined}>
                <td className="px-4 py-3 text-sm font-semibold">{row.phase_name}</td>
                <td className="px-4 py-3 text-xs font-bold uppercase text-primary">{statusLabel(row)}</td>
                <td className="px-4 py-3 text-xs">
                  <input
                    type="date"
                    value={row.start_date}
                    onChange={(event) => updateDate(row.key, "start_date", event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/40"
                    aria-label={`${row.phase_name} start date`}
                  />
                </td>
                <td className="px-4 py-3 text-xs">
                  <input
                    type="date"
                    value={row.end_date}
                    onChange={(event) => updateDate(row.key, "end_date", event.target.value)}
                    className="w-full rounded border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary/40"
                    aria-label={`${row.phase_name} end date`}
                  />
                </td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => onSetDates(row)} className="text-xs font-bold text-primary hover:underline">
                    Save
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BudgetTrackingCard({
  budget,
  loading,
  disabled,
  onOpenAppropriation,
}: {
  budget: ProjectDetailPayload["budget"];
  loading: boolean;
  disabled: boolean;
  onOpenAppropriation: () => void;
}) {
  const utilization = budget.utilization_percent;
  const ceiling = budget.appropriation_total;
  const spent = budget.disbursement_total;

  const mergedFundSources = useMemo(() => {
    const grouped = new Map<
      string,
      { name: string; amount: number; allotted: number; disbursed: number }
    >();

    for (const source of budget.fund_sources) {
      const key = source.name.trim().toLowerCase();
      const existing = grouped.get(key);
      if (existing) {
        existing.amount += source.amount;
        existing.allotted += source.allotted ?? 0;
        existing.disbursed += source.disbursed ?? 0;
      } else {
        grouped.set(key, {
          name: source.name,
          amount: source.amount,
          allotted: source.allotted ?? 0,
          disbursed: source.disbursed ?? 0,
        });
      }
    }

    return [...grouped.values()].map((source) => ({
      name: source.name,
      amount: source.amount,
      allotted: source.allotted,
      disbursed: source.disbursed,
    }));
  }, [budget.fund_sources]);

  const totalFundSources = mergedFundSources.reduce(
    (total, source) => total + source.amount,
    0,
  );
  const totalSourceDisbursed = mergedFundSources.reduce(
    (total, source) => total + source.disbursed,
    0,
  );

  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-black uppercase tracking-[0.22em] text-muted-foreground">
          Budget &amp; Financial Tracking
        </h2>
        <button
          type="button"
          onClick={onOpenAppropriation}
          disabled={disabled}
          className="inline-flex items-center gap-2 rounded border border-primary/20 bg-primary/10 px-4 py-2 text-[10px] font-bold uppercase text-primary disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
        >
          <AppIcon name="add" className="h-4 w-4" />
          {ceiling > 0 ? "Update Appropriation" : "Add Appropriation"}
        </button>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/40 p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground">Utilization Rate</p>
            <p className="text-3xl font-black">{loading ? "..." : `${utilization}%`}</p>
          </div>
          <div className="text-right text-[10px] font-bold uppercase text-muted-foreground">
            <p>Authorized Ceiling: <span className="text-foreground">{formatPHPFull(ceiling)}</span></p>
            <p>Total Spent: <span className="text-primary">{formatPHPFull(spent)}</span></p>
          </div>
        </div>
        <div className="mt-3 h-3 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary" style={{ width: `${Math.min(100, utilization)}%` }} />
        </div>
      </div>

        <div className="mt-6">
        {mergedFundSources.length === 0 ? (
          <p className="rounded border border-border bg-muted/40 px-4 py-4 text-center text-xs text-muted-foreground">
            No fund sources recorded for this project.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-border">
                <tr>
                  <th className="py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Fund Source
                  </th>
                  <th className="py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Appropriated
                  </th>
                  <th className="py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Disbursed
                  </th>
                  <th className="py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Balance
                  </th>
                  <th className="py-3 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Util %
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mergedFundSources.map((source) => {
                  const disbursed = source.disbursed;
                  const remaining = Math.max(0, source.amount - disbursed);
                  const utilPct =
                    source.amount > 0
                      ? Math.min(100, (disbursed / source.amount) * 100)
                      : 0;

                  return (
                    <tr
                      key={source.name}
                      className="transition-colors hover:bg-muted/30"
                    >
                      <td className="py-3 text-sm font-semibold text-foreground">
                        {source.name}
                      </td>
                      <td className="py-3 text-right font-mono text-sm text-muted-foreground">
                        {formatPHP(source.amount)}
                      </td>
                      <td className="py-3 text-right font-mono text-sm text-primary">
                        {formatPHP(disbursed)}
                      </td>
                      <td className="py-3 text-right font-mono text-sm font-bold text-foreground">
                        {formatPHP(remaining)}
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full bg-primary"
                              style={{ width: `${clamp(utilPct, 0, 100)}%` }}
                            />
                          </div>
                          <span className="w-9 text-right text-[10px] font-bold text-foreground">
                            {utilPct.toFixed(0)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-border">
                <tr className="bg-muted/30">
                  <td
                    className="py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
                  >
                    Total
                  </td>
                  <td className="py-3 text-right font-mono text-sm font-bold text-foreground">
                    {formatPHP(totalFundSources)}
                  </td>
                  <td className="py-3 text-right font-mono text-sm font-bold text-primary">
                    {formatPHP(totalSourceDisbursed || budget.disbursement_total)}
                  </td>
                  <td className="py-3 text-right font-mono text-sm font-bold text-foreground">
                    {formatPHP(Math.max(0, totalFundSources - (totalSourceDisbursed || budget.disbursement_total)))}
                  </td>
                  <td className="py-3 text-right text-[10px] font-black text-foreground">
                    {budget.utilization_percent}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        </div>
    </section>
  );
}

const ACTIVITY_KIND_META: Record<
  ProjectDetailPayload["activity"][number]["kind"],
  { icon: string; label: string; tone: string; bg: string }
> = {
  appropriation: { icon: "account_balance", label: "Appropriation", tone: "text-purple-700", bg: "bg-purple-100" },
  allotment: { icon: "account_balance_wallet", label: "Allotment", tone: "text-primary", bg: "bg-primary/10" },
  obligation: { icon: "description", label: "Obligation", tone: "text-red-700", bg: "bg-red-100" },
  disbursement: { icon: "payments", label: "Disbursement", tone: "text-emerald-700", bg: "bg-emerald-100" },
  issue: { icon: "report", label: "Issue / Risk", tone: "text-red-600", bg: "bg-red-50" },
  progress: { icon: "trending_up", label: "Progress", tone: "text-blue-700", bg: "bg-blue-50" },
  document: { icon: "folder", label: "Document", tone: "text-slate-700", bg: "bg-slate-100" },
};

function ActivityFeedCard({ activity }: { activity: ProjectDetailPayload["activity"] }) {
  const [filter, setFilter] = useState<"all" | ProjectDetailPayload["activity"][number]["kind"]>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const base = filter === "all" ? activity : activity.filter((row) => row.kind === filter);
    const needle = search.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((row) => [row.title, row.detail, row.actor, row.kind].join(" ").toLowerCase().includes(needle));
  }, [activity, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 5));
  const currentPage = Math.min(page, totalPages);
  const visibleItems = filtered.slice((currentPage - 1) * 5, currentPage * 5);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const activityTimestamp = (value: string) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value);
    return formatRelativeTime(value);
  };

  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.22em]">Project Activity Feed</h2>
          <p className="mt-1 text-[11px] text-muted-foreground">Complete audit trail for budget, progress, issue, and document updates</p>
        </div>
        <span className="text-[10px] font-bold text-muted-foreground">{filtered.length} entries</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {(["all", "appropriation", "allotment", "obligation", "disbursement", "progress", "issue", "document"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${filter === key ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}
          >
            {key === "all" ? "All" : ACTIVITY_KIND_META[key].label}
          </button>
        ))}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search activity..."
          aria-label="Search project activity"
          className="ml-auto rounded border border-border bg-background px-3 py-1.5 text-xs outline-none"
        />
      </div>
      <div className="mt-5 space-y-5">
        {filtered.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">No activity recorded.</p> : null}
        {visibleItems.map((item) => {
          const meta = ACTIVITY_KIND_META[item.kind];
          return (
            <div key={item.id} className="flex gap-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded ${meta.bg}`}>
                <AppIcon name={meta.icon} className={`h-5 w-5 ${meta.tone}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[8px] font-bold uppercase text-primary">
                      {meta.label}
                    </span>
                    <h3 className="text-xs font-bold">{item.title}</h3>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-muted-foreground">{formatDateTime(item.occurred_at)}</p>
                    {item.amount !== undefined ? <p className="font-mono text-sm font-black">{formatPHPFull(item.amount)}</p> : null}
                  </div>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
                <p className="mt-1 text-[9px] text-muted-foreground">{item.actor} - {activityTimestamp(item.occurred_at)}</p>
              </div>
            </div>
          );
        })}
      </div>
      {filtered.length > 0 ? (
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
            className="rounded border border-border px-3 py-1 text-[10px] font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
          >
            Prev
          </button>
          <span className="rounded bg-primary px-3 py-1 text-[10px] font-black text-primary-foreground">
            {currentPage}
          </span>
          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            className="rounded border border-border px-3 py-1 text-[10px] font-bold uppercase disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DocumentsCard({
  tracking,
  documents,
  onOpenDocument,
  onConfigure,
}: {
  tracking: ProjectDetailPayload["document_tracking"];
  documents: ProjectDetailPayload["documents"];
  onOpenDocument: (document: ProjectDetailPayload["documents"][number], action?: "view" | "download") => void;
  onConfigure: () => void;
}) {
  const hasDtn = Boolean(tracking.dtn_no);
  const needsScroll = documents.length > 5;
  const emptyMessage = !hasDtn
    ? "No DTN is linked yet. Add a DTN to load uploaded files."
    : tracking.valid
      ? "No files were found for this document."
      : "The linked DTN is invalid or no files exist.";

  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xs font-black uppercase tracking-[0.22em]">Documents</h2>
          {hasDtn ? (
            <p className="mt-1 truncate text-[10px] font-bold uppercase text-muted-foreground">
              {tracking.dtn_no}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onConfigure}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-primary/10 text-primary transition hover:bg-primary hover:text-primary-foreground"
          aria-label="Set document tracking number"
          title="Set document tracking number"
        >
          <AppIcon name="edit" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className={needsScroll ? "max-h-[320px] space-y-1 overflow-y-auto pr-1" : "space-y-1"}>
        {documents.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : null}
        {documents.map((doc) => (
          <div key={doc.document_id ?? doc.name} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold">{doc.name}</p>
              <p className="text-[9px] uppercase text-muted-foreground">{formatDate(doc.uploaded_at)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenDocument(doc, "view")}
                className="text-[10px] font-black uppercase text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
                disabled={!doc.document_url}
              >
                View
              </button>
              {doc.document_url ? (
                <button
                  type="button"
                  onClick={() => onOpenDocument(doc, "download")}
                  className="text-muted-foreground hover:text-primary"
                  aria-label={`Download ${doc.name}`}
                  title={`Download ${doc.name}`}
                >
                  <AppIcon name="download" className="h-[18px] w-[18px]" />
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function PhaseProgressCard({
  phases,
  overall,
  onLogProgress,
}: {
  phases: ProjectDetailPayload["phases"];
  overall: number;
  onLogProgress: () => void;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-[0.22em]">Phase Progress</h2>
        <span className="text-sm font-black text-primary">{overall.toFixed(1)}%</span>
      </div>
      <ProgressBar value={overall} />
      <div className="mt-4 space-y-3">
        {phases.map((phase) => (
          <div key={phase.phase_id ?? phase.phase_name}>
            <div className="mb-1 flex justify-between text-[10px] font-bold uppercase">
              <span className="text-muted-foreground">{phase.phase_name}</span>
              <span className="text-primary">{phase.progress_percent}%</span>
            </div>
            <ProgressBar value={phase.progress_percent} />
          </div>
        ))}
      </div>
      <button type="button" onClick={onLogProgress} className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-primary py-2.5 text-[10px] font-bold uppercase text-primary-foreground">
        <AppIcon name="add" className="h-4 w-4" />
        Log Progress Update
      </button>
    </section>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
      <div className="h-full bg-primary" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

function RiskIssueCard({
  issues,
  totalIssues,
  openIssues,
  code,
  onOpenIssueModal,
  onOpenResolveModal,
}: {
  issues: IssueItem[];
  totalIssues: number;
  openIssues: number;
  code: string;
  onOpenIssueModal: () => void;
  onOpenResolveModal: () => void;
}) {
  const visibleIssues = issues.slice(0, 3);

  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-black uppercase tracking-[0.22em]">Risk &amp; Issue Log</h2>
          <p className="mt-2 text-[11px] italic text-muted-foreground">Log delays, shortages, or risks that may affect {code}.</p>
        </div>
        <button
          type="button"
          onClick={onOpenIssueModal}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-label="Log issue"
          title="Log issue"
        >
          <AppIcon name="add" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="mb-4 flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
        <span>{totalIssues} issues logged</span>
        <span>{openIssues} open</span>
      </div>
      {visibleIssues.length ? (
        <div className="mb-4 space-y-2">
          {visibleIssues.map((issue) => (
            <div key={issue.issue_id} className="rounded border border-border bg-muted/30 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-bold text-foreground">{issue.issue_name}</p>
                <span className={`shrink-0 rounded px-2 py-0.5 text-[9px] font-black uppercase ${
                  issue.status === "Open" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                }`}>
                  {issue.status}
                </span>
              </div>
              <p className="mt-1 text-[10px] font-bold uppercase text-muted-foreground">
                {issue.issue_category} • {formatDate(issue.date_reported ?? "")}
              </p>
            </div>
          ))}
        </div>
      ) : null}
      <button type="button" onClick={onOpenResolveModal} disabled={openIssues === 0} className="w-full rounded border border-border py-2 text-[10px] font-bold uppercase text-primary disabled:cursor-not-allowed disabled:text-muted-foreground">
        Resolve an Issue
      </button>
    </section>
  );
}

function PhysicalProgressCard({
  year,
  progress,
  onLogProgress,
  canOpen,
  loading,
}: {
  year: number;
  progress: ProjectDetailPayload["physical_progress"];
  onLogProgress: () => void;
  canOpen: boolean;
  loading: boolean;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xs font-black uppercase tracking-[0.22em]">Physical Progress - FY {year}</h2>
        <AppIcon name="image_search" className="h-5 w-5 text-primary" />
      </div>
      <ProgressBar value={progress.overall_percent} />
      <div className="mt-4 grid grid-cols-4 gap-2">
        {progress.quarters.map((quarter) => (
          <div key={quarter.quarter} className="rounded border border-border/60 p-2 text-center">
            <p className="text-[9px] font-bold uppercase text-muted-foreground">{quarter.quarter}</p>
            <p className="mt-1 text-sm font-black">{quarter.percent}%</p>
          </div>
        ))}
      </div>
      <button type="button" onClick={onLogProgress} disabled={!canOpen || loading} className="mt-4 w-full rounded border border-border py-2.5 text-[10px] font-bold uppercase text-primary disabled:cursor-not-allowed disabled:text-muted-foreground">
        Log Progress Update
      </button>
    </section>
  );
}

function FinancialExecutionPanel({
  budget,
  totals,
  disabled,
  onOpenAllotment,
  onOpenObligation,
  onOpenDisbursement,
}: {
  budget: ProjectDetailPayload["budget"];
  totals: { appropriated: number; allotted: number; obligated: number; disbursed: number };
  disabled: boolean;
  onOpenAllotment: () => void;
  onOpenObligation: () => void;
  onOpenDisbursement: () => void;
}) {
  return (
    <div className="space-y-4">
      <h2 className="px-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Financial Execution</h2>
      <FinancialMicroCard
        title="Allocation"
        icon="account_balance_wallet"
        primaryLabel="Allocated"
        primaryValue={totals.allotted || budget.allotment_total}
        secondaryLabel="Unallocated"
        secondaryValue={Math.max(0, (totals.appropriated || budget.appropriation_total) - (totals.allotted || budget.allotment_total))}
        actionLabel="Add Allotment"
        disabled={disabled}
        onAction={onOpenAllotment}
      />
      <FinancialMicroCard
        title="Obligation"
        icon="description"
        primaryLabel="Obligated"
        primaryValue={totals.obligated || budget.obligation_total}
        secondaryLabel="Free Balance"
        secondaryValue={Math.max(0, (totals.allotted || budget.allotment_total) - (totals.obligated || budget.obligation_total))}
        actionLabel="Record Obligation"
        disabled={disabled}
        onAction={onOpenObligation}
      />
      <FinancialMicroCard
        title="Disbursement"
        icon="payments"
        primaryLabel="Disbursed"
        primaryValue={totals.disbursed || budget.disbursement_total}
        secondaryLabel="Unpaid"
        secondaryValue={Math.max(0, (totals.obligated || budget.obligation_total) - (totals.disbursed || budget.disbursement_total))}
        actionLabel="Record Disbursement"
        disabled={disabled}
        onAction={onOpenDisbursement}
      />
    </div>
  );
}

function FinancialMicroCard({
  title,
  icon,
  primaryLabel,
  primaryValue,
  secondaryLabel,
  secondaryValue,
  actionLabel,
  disabled,
  onAction,
}: {
  title: string;
  icon: string;
  primaryLabel: string;
  primaryValue: number;
  secondaryLabel: string;
  secondaryValue: number;
  actionLabel: string;
  disabled: boolean;
  onAction: () => void;
}) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-[0.22em]">{title}</h3>
        <AppIcon name={icon} className="h-5 w-5 text-primary" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={primaryLabel}>{pesoShort(primaryValue)}</Field>
        <Field label={secondaryLabel}>{pesoShort(secondaryValue)}</Field>
      </div>
      <button type="button" disabled={disabled} onClick={onAction} className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-primary py-2.5 text-[10px] font-bold uppercase text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground">
        <AppIcon name="add" className="h-4 w-4" />
        {actionLabel}
      </button>
    </section>
  );
}

function TimelineDateModal({
  open,
  phase,
  submitting,
  error,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  phase: TimelineModalState;
  submitting: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { phaseName: string; planned_start?: string | null; planned_end?: string | null }) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  useEffect(() => {
    setStartDate(phase?.start_date ?? "");
    setEndDate(phase?.end_date ?? "");
  }, [phase]);

  if (!phase || !open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl">
        <h3 className="text-lg font-black">{phase.phase_name}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Set the planned start and end dates for this phase.</p>
        {error ? <div className="mt-4 rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div> : null}
        <div className="mt-5 grid gap-4">
          <label className="text-sm font-semibold">
            Start Date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
          <label className="text-sm font-semibold">
            End Date
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="mt-2 w-full rounded border border-border bg-background px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => onOpenChange(false)} className="rounded border border-border px-4 py-2 text-sm font-bold" disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void onSubmit({ phaseName: phase.phase_name, planned_start: startDate || null, planned_end: endDate || null })}
            className="rounded bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
