import { apiRequest, withQuery } from "./api";

function buildUrl(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
) {
  const endpoint = path.startsWith("/") ? path : `/${path}`;
  return withQuery(endpoint, query);
}

async function requestJson<T>(
  path: string,
  query?: Record<string, string | number | boolean | null | undefined>,
): Promise<T> {
  return apiRequest<T>(buildUrl(path, query));
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "_")
    .toLowerCase();
}

function getMonthEnd(value: string): string {
  const [yearText, monthText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = new Date(year, month, 0).getDate();
  return `${yearText}-${monthText}-${String(day).padStart(2, "0")}`;
}

function getQuarterForMonth(value: string): number {
  const month = toNumber(value.split("-")[1], 1);
  return clamp(Math.ceil(month / 3), 1, 4);
}

function formatPHP(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `P ${new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(safeAmount)}`;
}

type ProjectSummaryItem = {
  project_code: string;
  project_title: string;
  sector: string;
  status: string;
  approved_appropriation?: number | string | null;
  allotted: number | string | null;
  disbursed: number | string | null;
  target_total?: number | string | null;
  actual_q1?: number | string | null;
  actual_q2?: number | string | null;
  actual_q3?: number | string | null;
  actual_q4?: number | string | null;
};

type ProjectSummaryResponse = ProjectSummaryItem[];

type TrendResponse = {
  month: string;
  year?: number;
  allocated: number | string;
  utilized: number | string;
}[];

export interface MonitoringStatusItem {
  label: string;
  count: string;
  percent: number;
  tone: string;
}

export interface MonitoringTrendItem {
  month: string;
  allocated: number;
  utilized: number;
  allocatedAmount: number;
  disbursedAmount: number;
  highlight?: boolean;
  future?: boolean;
}

export interface MonitoringProjectSummary {
  name: string;
  code: string;
  sector: string;
  budget: string;
  financial: number;
  physical: number;
}

export interface MonitoringPayload {
  month: string;
  kpis: {
    totalProjects: number;
    activeProjects: number;
    completed: number;
    delayed: number;
    appropriated: number;
    utilizedPercent: number;
  };
  statusDistribution: MonitoringStatusItem[];
  budgetTrends: MonitoringTrendItem[];
  projectSummaries: MonitoringProjectSummary[];
}

export interface MonitoringQuery {
  month?: string;
}

function computePhysical(item: ProjectSummaryItem, quarter: number): number {
  const target = toNumber(item.target_total, 0);
  const quarterlyActuals = [
    toNumber(item.actual_q1),
    toNumber(item.actual_q2),
    toNumber(item.actual_q3),
    toNumber(item.actual_q4),
  ];
  const actuals = quarterlyActuals
    .slice(0, quarter)
    .reduce((sum, value) => sum + value, 0);

  if (target > 0) {
    return clamp((actuals / target) * 100, 0, 100);
  }

  const status = normalizeStatus(item.status);
  if (status === "completed") return 100;
  if (status === "planned") return 0;
  return 0;
}

export async function getMonitoringData(
  options: MonitoringQuery = {},
): Promise<MonitoringPayload> {
  const fallbackMonth = new Date().toISOString().slice(0, 7);
  const selectedMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(options.month ?? "")
    ? options.month!
    : fallbackMonth;
  const [yearStr, monthStr] = selectedMonth.split("-");
  const fiscalYear = Number(yearStr);
  const upToDate = getMonthEnd(selectedMonth);
  const selectedQuarter = getQuarterForMonth(selectedMonth);

  const [trends, projects] = await Promise.all([
    requestJson<TrendResponse>("/dashboard/allocation-vs-disbursement", {
      months: 6,
      fiscal_year: fiscalYear,
      anchor_year: Number(yearStr),
      anchor_month: Number(monthStr),
    }),
    requestJson<ProjectSummaryResponse>("/reports/projects-summary", {
      fiscal_year: fiscalYear,
      up_to_date: upToDate,
    }),
  ]);

  const totalProjects = projects.length;
  const normalizedProjects = projects.map((project) => ({
    ...project,
    status: normalizeStatus(project.status),
  }));

  const activeProjects = normalizedProjects.filter((p) =>
    p.status === "in_progress",
  ).length;

  const completed = normalizedProjects.filter(
    (p) => p.status === "completed",
  ).length;

  const delayed = normalizedProjects.filter(
    (p) => p.status === "delayed",
  ).length;

  const appropriated = projects.reduce(
    (sum, p) => sum + toNumber(p.approved_appropriation),
    0,
  );

  const totalAllotted = projects.reduce(
    (sum, p) => sum + toNumber(p.allotted),
    0,
  );

  const totalDisbursed = projects.reduce(
    (sum, p) => sum + toNumber(p.disbursed),
    0,
  );

  const utilizedPercent =
    totalAllotted > 0 ? (totalDisbursed / totalAllotted) * 100 : 0;

  const statusBuckets = [
    { key: "in_progress", label: "In Progress" },
    { key: "planned", label: "Planned" },
    { key: "completed", label: "Completed" },
    { key: "delayed", label: "Delayed" },
  ] as const;

  const statusDistribution: MonitoringStatusItem[] = statusBuckets.map(
    ({ key, label }) => {
      const count = normalizedProjects.filter(
        (p) => p.status === key,
      ).length;
      const percent = totalProjects > 0 ? (count / totalProjects) * 100 : 0;

      return {
        label,
        count: String(count).padStart(2, "0"),
        percent,
        tone: key === "delayed" ? "bg-destructive" : "bg-primary",
      };
    },
  );

  const maxTrendValue = Math.max(
    ...trends.flatMap((t) => [toNumber(t.allocated), toNumber(t.utilized)]),
    1,
  );

  const budgetTrends: MonitoringTrendItem[] = trends.map((trend, index) => {
    const allocatedAmount = toNumber(trend.allocated);
    const disbursedAmount = toNumber(trend.utilized);

    return {
      month: trend.month.toUpperCase(),
      allocated: Math.max(0, (allocatedAmount / maxTrendValue) * 100),
      utilized: Math.max(0, (disbursedAmount / maxTrendValue) * 100),
      allocatedAmount,
      disbursedAmount,
      highlight: index === trends.length - 1,
      future: false,
    };
  });

  const projectSummaries: MonitoringProjectSummary[] = projects.map((p) => {
    const allottedAmt = toNumber(p.allotted);
    const disbursedAmt = toNumber(p.disbursed);

    return {
      name: p.project_title,
      code: p.project_code,
      sector: p.sector || "Unassigned",
      budget: formatPHP(toNumber(p.approved_appropriation)),
      financial: allottedAmt > 0 ? (disbursedAmt / allottedAmt) * 100 : 0,
      physical: computePhysical(p, selectedQuarter),
    };
  });

  return {
    month: selectedMonth,
    kpis: {
      totalProjects,
      activeProjects,
      completed,
      delayed,
      appropriated,
      utilizedPercent,
    },
    statusDistribution,
    budgetTrends,
    projectSummaries,
  };
}

export { formatPHP };
