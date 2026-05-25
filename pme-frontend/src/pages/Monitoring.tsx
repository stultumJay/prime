import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import "@/styles/materialSymbols.css";
import { AppShell } from "../components/layout/AppShell";
import {
  formatPHP,
  getMonitoringData,
  type MonitoringPayload,
  type MonitoringProjectSummary,
} from "@/services/monitoring.service";

type KpiTone = "teal" | "blue" | "green" | "red" | "orange" | "violet";

interface KpiCard {
  label: string;
  value: ReactNode;
  icon: string;
  tone: KpiTone;
}

const PAGE_SIZE = 5;
const currentMonth = () => new Date().toISOString().slice(0, 7);

const kpiToneClasses: Record<KpiTone, { box: string; text: string }> = {
  teal: { box: "bg-teal-50", text: "text-teal-600" },
  blue: { box: "bg-blue-50", text: "text-blue-600" },
  green: { box: "bg-emerald-50", text: "text-emerald-600" },
  red: { box: "bg-red-50", text: "text-red-600" },
  orange: { box: "bg-orange-50", text: "text-orange-600" },
  violet: { box: "bg-violet-50", text: "text-violet-600" },
};

function getProgressTone(value: number) {
  if (value === 0) return "bg-slate-200 text-slate-400";
  if (value < 25) return "bg-destructive text-destructive";
  return "bg-primary text-slate-900";
}

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useRevealOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (revealed) return;
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed]);

  return [ref, revealed] as const;
}

function useCountUp(value: number, enabled: boolean, duration = 700) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    let frame = 0;
    let startTime: number | null = null;

    const animate = (time: number) => {
      if (startTime === null) startTime = time;
      const progress = Math.min((time - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(value * eased);

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [duration, enabled, value]);

  return enabled ? displayValue : 0;
}

export default function Monitoring() {
  const [searchTerm, setSearchTerm] = useState("");
  const [payload, setPayload] = useState<MonitoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(
    currentMonth(),
  );
  const [page, setPage] = useState(1);
  const [financialKpisRef, financialKpisRevealed] = useRevealOnce<HTMLDivElement>();
  const [budgetTrendRef, budgetTrendRevealed] = useRevealOnce<HTMLElement>();
  const animatedAppropriated = useCountUp(
    payload?.kpis.appropriated ?? 0,
    financialKpisRevealed && Boolean(payload),
  );
  const animatedUtilizedPercent = useCountUp(
    payload?.kpis.utilizedPercent ?? 0,
    financialKpisRevealed && Boolean(payload),
  );

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const data = await getMonitoringData({
          month: selectedMonth,
        });

        if (!mounted) return;
        setPayload(data);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Failed to load monitoring data.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [selectedMonth]);

  const filteredProjects = useMemo(() => {
    const projectSummaries = payload?.projectSummaries ?? [];
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) return projectSummaries;

    return projectSummaries.filter((project) =>
      [project.name, project.code, project.sector].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [payload?.projectSummaries, searchTerm]);

  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleProjects = filteredProjects.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const exportMonitoringCsv = () => {
    const rows: (string | number)[][] = [
      [
        "Project Name",
        "Project Code",
        "Sector",
        "Approved Budget",
        "Financial Util. %",
        "Physical Completion %",
      ],
      ...filteredProjects.map((project) => [
        project.name,
        project.code,
        project.sector,
        project.budget,
        project.financial.toFixed(1),
        project.physical.toFixed(1),
      ]),
    ];

    downloadCsv(
      `monthly_monitoring_${selectedMonth}.csv`,
      rows,
    );
  };

  const kpis: KpiCard[] = payload
    ? [
        {
          label: "Total Projects",
          value: String(payload.kpis.totalProjects),
          icon: "folder",
          tone: "teal",
        },
        {
          label: "Active Projects",
          value: String(payload.kpis.activeProjects),
          icon: "pending_actions",
          tone: "blue",
        },
        {
          label: "Completed",
          value: String(payload.kpis.completed),
          icon: "check_circle",
          tone: "green",
        },
        {
          label: "Delayed",
          value: String(payload.kpis.delayed),
          icon: "warning",
          tone: "red",
        },
        {
          label: "Appropriated",
          value: (
            <span className={`transition-all duration-500 ${financialKpisRevealed ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
              {formatPHP(animatedAppropriated)}
            </span>
          ),
          icon: "account_balance_wallet",
          tone: "orange",
        },
        {
          label: "Utilized (%)",
          value: (
            <span className={`transition-all duration-500 ${financialKpisRevealed ? "opacity-100 blur-0" : "opacity-0 blur-sm"}`}>
              {animatedUtilizedPercent.toFixed(1)}%
            </span>
          ),
          icon: "query_stats",
          tone: "violet",
        },
      ]
    : [];

  return (
    <AppShell
      topbar={{
        title: "Monthly Monitoring",
        showSearch: true,
        searchValue: searchTerm,
        onSearchChange: handleSearchChange,
        searchPlaceholder: "Search monitoring analytics...",
      }}
    >
      <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        <main className="min-h-0 flex-1 overflow-auto px-5 py-6 lg:px-8">
          <div className="mx-auto flex max-w-[1220px] flex-col gap-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-primary">
                  Analytics & Reporting
                </p>
                <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                  Monthly Reporting Analytics
                </h1>
                <p className="mt-1 max-w-2xl text-sm font-medium text-muted-foreground">
                  Institutional performance tracking for the Municipal Planning and Development Office.
                </p>
              </div>

              <div className="flex w-full justify-start lg:w-auto lg:justify-end">
                <div className="w-full overflow-hidden rounded-lg bg-slate-100/90 sm:w-[220px]">
                  <label className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <div>
                      <p className="text-[10px] font-black uppercase leading-none tracking-tight text-slate-500">
                        Month
                      </p>
                      <input
                        type="month"
                        className="mt-1 w-full border-none bg-transparent p-0 text-sm font-black tracking-tight text-slate-950 outline-none focus:ring-0"
                        value={selectedMonth}
                        onChange={(event) => {
                          setSelectedMonth(event.target.value || currentMonth());
                          setPage(1);
                        }}
                      />
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {error ? (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-muted-foreground">
                Loading monitoring data...
              </div>
            ) : null}

            <div ref={financialKpisRef} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
              {kpis.map((kpi) => {
                const tone = kpiToneClasses[kpi.tone];
                return (
                  <article
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm"
                    key={kpi.label}
                  >
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${tone.box} ${tone.text}`}
                    >
                      <span className="material-symbols-outlined text-2xl">
                        {kpi.icon}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                        {kpi.label}
                      </p>
                      <p className="mt-1 truncate text-xl font-black leading-none text-slate-950">
                        {kpi.value}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="grid gap-5 xl:grid-cols-12">
              <article className="rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-4">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-tight text-slate-950">
                    Status Distribution
                  </h2>
                  <span className="material-symbols-outlined text-slate-400">
                    pie_chart
                  </span>
                </div>
                <div className="space-y-4">
                  {(payload?.statusDistribution ?? []).map((item) => (
                    <div className="space-y-1.5" key={item.label}>
                      <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-wide text-muted-foreground">
                        <span>
                          {item.label} ({item.count})
                        </span>
                        <span
                          className={
                            item.tone === "bg-destructive"
                              ? "text-destructive"
                              : "text-primary"
                          }
                        >
                          {item.percent.toFixed(1)}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${item.tone}`}
                          style={{ width: `${item.percent}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article ref={budgetTrendRef} className="flex min-h-[250px] flex-col rounded-2xl border border-border bg-card p-5 shadow-sm xl:col-span-8">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-black uppercase tracking-tight text-slate-950">
                      Monthly Budget Trend
                    </h2>
                    <p className="mt-0.5 text-[10px] font-semibold text-muted-foreground">
                      Allocation vs. Disbursement (financial)
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-primary" />
                      <span className="text-[10px] font-black uppercase text-muted-foreground">
                        Disbursed
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-slate-200" />
                      <span className="text-[10px] font-black uppercase text-muted-foreground">
                        Allocated
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex min-h-[175px] flex-1 items-end justify-between gap-4 px-1 pt-4">
                  {(payload?.budgetTrends ?? []).map((trend) => {
                    const allocatedHeight =
                      trend.allocatedAmount > 0 ? Math.max(trend.allocated, 8) : 0;
                    const disbursedHeight =
                      trend.disbursedAmount > 0 ? Math.max(trend.utilized, 8) : 0;

                    return (
                      <div
                        className={`group flex flex-1 flex-col items-center ${trend.future ? "opacity-40" : ""}`}
                        key={trend.month}
                        tabIndex={0}
                      >
                        <div className="relative flex h-36 w-full items-end justify-center">
                          <div className="pointer-events-none absolute bottom-[calc(100%+0.75rem)] left-1/2 z-30 min-w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[10px] font-bold text-slate-700 opacity-0 shadow-lg transition group-hover:opacity-100 group-focus:opacity-100">
                            <p className="mb-1 text-xs font-black text-slate-950">
                              {trend.month}
                            </p>
                            <p>Allocated: {formatPHP(trend.allocatedAmount)}</p>
                            <p>Disbursed: {formatPHP(trend.disbursedAmount)}</p>
                          </div>
                          <div
                            className="absolute bottom-0 w-full max-w-[76px] rounded-t-lg bg-slate-100 transition-all duration-700 ease-out"
                            style={{ height: `${budgetTrendRevealed ? allocatedHeight : 0}%` }}
                          />
                          {!trend.future && (
                            <div
                              className="relative z-10 flex w-full max-w-[76px] items-end justify-center rounded-t-lg bg-primary/35 transition-all duration-700 ease-out"
                              style={{
                                height: `${budgetTrendRevealed ? disbursedHeight : 0}%`,
                              }}
                            >
                              <div
                                className="w-full rounded-t-lg bg-primary transition-all duration-700 ease-out"
                                style={{
                                  height: `${budgetTrendRevealed ? disbursedHeight : 0}%`,
                                }}
                              />
                            </div>
                          )}
                      </div>
                      <span
                        className={`mt-2 text-[10px] font-black ${trend.highlight ? "text-slate-950" : "text-slate-400"}`}
                      >
                        {trend.month}
                      </span>
                    </div>
                    );
                  })}
                </div>
              </article>
            </div>

            <article className="min-h-[330px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-black uppercase tracking-tight text-slate-950">
                  Project Monitoring Summary
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-primary"
                    type="button"
                    title="Clear search filters"
                    aria-label="Clear search filters"
                    onClick={() => setSearchTerm("")}
                  >
                    <span className="material-symbols-outlined text-lg">
                      filter_list
                    </span>
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                    type="button"
                    title="Download monitoring summary"
                    aria-label="Download monitoring summary"
                    disabled={!filteredProjects.length}
                    onClick={exportMonitoringCsv}
                  >
                    <span className="material-symbols-outlined text-lg">
                      download
                    </span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <th className="px-5 py-3">Project Name</th>
                      <th className="px-5 py-3">Sector</th>
                      <th className="px-5 py-3">Approved Budget</th>
                      <th className="px-5 py-3">Financial Util. (%)</th>
                      <th className="px-5 py-3">Physical Comp. (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!loading && filteredProjects.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="px-5 py-8 text-center text-sm text-muted-foreground"
                        >
                          No projects found for the selected period.
                        </td>
                      </tr>
                    ) : null}

                    {visibleProjects.map((project: MonitoringProjectSummary) => {
                      const progressTone = getProgressTone(project.physical);
                      const progressClasses = progressTone.split(" ");

                      return (
                        <tr
                          className="transition hover:bg-slate-50/80"
                          key={project.code}
                        >
                          <td className="px-5 py-4">
                            <p className="text-xs font-black text-slate-950">
                              {project.name}
                            </p>
                            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">
                              {project.code}
                            </p>
                          </td>
                          <td className="px-5 py-4 text-xs font-semibold text-slate-600">
                            {project.sector}
                          </td>
                          <td className="px-5 py-4 text-xs font-black text-slate-950">
                            {project.budget}
                          </td>
                          <td className="px-5 py-4 text-xs font-black text-teal-600">
                            {project.financial.toFixed(1)}%
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-3">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full ${progressClasses[0]}`}
                                  style={{ width: `${project.physical}%` }}
                                />
                              </div>
                              <span
                                className={`text-[10px] font-black ${progressClasses[1]}`}
                              >
                                {project.physical.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 bg-slate-50 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing{" "}
                  {filteredProjects.length === 0
                    ? 0
                    : (currentPage - 1) * PAGE_SIZE + 1}{" "}
                  to {Math.min(currentPage * PAGE_SIZE, filteredProjects.length)}{" "}
                  of {filteredProjects.length} projects
                </span>
                <div className="flex gap-4">
                  <button
                    className="transition hover:text-primary disabled:opacity-30"
                    disabled={currentPage === 1}
                    onClick={() => setPage((v) => Math.max(1, v - 1))}
                    type="button"
                  >
                    Previous
                  </button>
                  <button
                    className="transition hover:text-primary disabled:opacity-30"
                    disabled={currentPage >= pageCount}
                    onClick={() => setPage((v) => Math.min(pageCount, v + 1))}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              </div>
            </article>
          </div>
        </main>
      </section>
    </AppShell>
  );
}
