import {
  BarChart3,
  BadgeDollarSign,
  Boxes,
  Calculator,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Database,
  FileDown,
  Gauge,
  GitBranch,
  History,
  LineChart,
  Menu,
  Package,
  PieChart,
  Settings,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X
} from "lucide-react";
import { useState } from "react";
import { login } from "../lib/api";
import { getObjectiveLabel, objectiveOptions, sidebarItems } from "../config/navigation";
import {
  formatCurrency,
  formatNumber,
  formatPercent,
  formatSegmentName,
  getConfidenceLabel,
  getPriceSensitivityLabel
} from "../utils/formatters";
import {
  getReadinessStyles,
  getReliabilityStyles,
  getResultModeStyles
} from "../utils/statusStyles";
import {
  HorizontalBars,
  CalculationWorkingPanel,
  ExplainableNumber,
  MiniRevenueTrend,
  SummaryCard,
  WarningPanel
} from "./common";
import { useViewMode } from "../lib/view-mode";
import { RevenueTrendChart } from "./charts";

export function HomeOverview({
  dashboardData,
  dashboardState,
  dashboardMessage,
  resetState,
  resetMessage,
  currency,
  status,
  error,
  handleResetData,
  setActivePanel,
  refreshDashboard,
  totalSalesRecords,
  totalFittedModels,
  uploadSummary,
  importReview,
  canCommitImport,
  handleCommitImport,
  importReviewState,
  importReviewMessage
}) {
  const isQualityReview = uploadSummary?.status === "quality_review" || (uploadSummary?.importBatchId && importReview);

  const metrics = dashboardData?.metrics || {};
  const trend = dashboardData?.trend || [];
  const segments = (dashboardData?.segments || []).map((item) => ({ ...item, label: item.label || formatSegmentName(item.segment) }));
  const categories = dashboardData?.categories || [];
  const recentRecommendations = dashboardData?.recentRecommendations || [];
  const sources = dashboardData?.sources || [];
  const activeSource = sources[0];
  const salesRecords = metrics.salesRecords ?? totalSalesRecords;
  const modelCount = metrics.modelCount ?? totalFittedModels;
  const isEmpty = !salesRecords;
  const { detailed } = useViewMode();
  const [activeHomeTab, setActiveHomeTab] = useState("overview");
  const actionItems = [
    {
      label: "Upload sales data",
      note: salesRecords ? `${formatNumber(salesRecords)} sales rows available` : "Start by importing a CSV",
      done: salesRecords > 0,
      target: "dataWorkspace"
    },
    {
      label: "Check data quality",
      note: "Confirm model-ready and summary-only products",
      done: salesRecords > 0,
      target: "dataWorkspace"
    },
    {
      label: "Create pricing insight",
      note: modelCount ? `${formatNumber(modelCount)} insights ready` : "Measure price response",
      done: modelCount > 0,
      target: "modelsWorkspace"
    },
    {
      label: "Run scenario planner",
      note: "Compare multiple prices side by side",
      done: false,
      target: "decisionsWorkspace"
    },
    {
      label: "Generate recommendation",
      note: metrics.recommendationCount ? `${formatNumber(metrics.recommendationCount)} recommendations saved` : "Find best profit or revenue price",
      done: Number(metrics.recommendationCount || 0) > 0,
      target: "decisionsWorkspace"
    },
    {
      label: "Export examiner report",
      note: "Download a workbook with assumptions and outputs",
      done: Number(metrics.recommendationCount || 0) > 0,
      target: "exports"
    }
  ];
  const homeTabs = [
    { id: "overview", label: "Overview" },
    { id: "breakdown", label: "Breakdown" },
    { id: "recent", label: "Recent" }
  ];
  const businessFlow = [
    "Upload sales history",
    "Check data quality",
    "Measure customer price response",
    "Run scenario planner",
    "Generate recommendation",
    "Export recommendation with assumptions"
  ];
  const flowSteps = businessFlow.map((label, index) => ({
    label,
    done:
      (index <= 1 && salesRecords > 0) ||
      (index === 2 && modelCount > 0) ||
      (index >= 4 && Number(metrics.recommendationCount || 0) > 0),
    current:
      (index === 0 && !salesRecords) ||
      (index === 2 && salesRecords > 0 && !modelCount) ||
      (index === 3 && modelCount > 0 && !Number(metrics.recommendationCount || 0)) ||
      (index === 5 && Number(metrics.recommendationCount || 0) > 0)
  }));

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="grid gap-4">
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-slate-500">Revenue Snapshot</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-950">Pricing workspace overview</h2>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 sm:w-auto"
              onClick={refreshDashboard}
              type="button"
            >
              Refresh snapshot
            </button>
            <button
              className="inline-flex h-9 w-full items-center justify-center rounded-md border border-rose-200 bg-rose-50 px-3 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              disabled={resetState === "running"}
              onClick={handleResetData}
              type="button"
            >
              {resetState === "running" ? "Resetting" : "Reset data"}
            </button>
          </div>
        </div>
        {dashboardMessage && dashboardState === "error" && <p className="mt-3 text-sm text-rose-700">{dashboardMessage}</p>}
        {resetMessage && <p className={`mt-3 text-sm ${resetState === "error" ? "text-rose-700" : "text-emerald-700"}`}>{resetMessage}</p>}
      </section>
      
      {isQualityReview && (
        <section className="rounded-lg border-2 border-amber-200 bg-amber-50 p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4 text-amber-950">
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700">
                <Upload size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold">Action Needed: New Data Staged</h3>
                <p className="mt-1 text-sm text-amber-800 leading-relaxed">
                  You've uploaded <strong>{uploadSummary.processedRows || uploadSummary.importedRows || "a new"} sales records</strong>, but they are not active yet. 
                  You must commit this dataset before the model can use it for insights and recommendations.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                className="inline-flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm"
                onClick={() => setActivePanel("dataWorkspace")}
                type="button"
              >
                Review Quality
              </button>
              <button 
                className="inline-flex h-11 items-center justify-center rounded-md bg-slate-950 px-6 text-sm font-bold text-white shadow-sm disabled:bg-slate-400"
                disabled={importReviewState === "running" || !canCommitImport}
                onClick={handleCommitImport}
                type="button"
              >
                {importReviewState === "running" ? "Committing..." : canCommitImport ? "Commit Verified Data" : "Admin Approval Required"}
              </button>
            </div>
          </div>
          {importReviewMessage && (
            <p className={`mt-3 text-sm font-medium ${importReviewState === "error" ? "text-rose-700" : "text-emerald-700"}`}>
              {importReviewMessage}
            </p>
          )}
        </section>
      )}

      {detailed && (
      <section className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">Pricing workflow</h3>
            <p className="mt-1 text-xs text-slate-500">Use this path while presenting the project: data, quality, insight, decision, export.</p>
          </div>
          <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
            {flowSteps.filter((step) => step.done).length}/{flowSteps.length} complete
          </span>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {flowSteps.map((step, index) => (
            <div
              className={`rounded-md border p-3 ${
                step.done
                  ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                  : step.current
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-slate-200 bg-slate-50 text-slate-600"
              }`}
              key={step.label}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">Step {index + 1}</span>
                {step.done ? <CheckCircle2 size={14} /> : <span className="text-xs">{step.current ? "Next" : "Later"}</span>}
              </div>
              <p className="mt-2 text-sm font-medium">{step.label}</p>
            </div>
          ))}
        </div>
      </section>
      )}

      {isEmpty && (
        <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <section className="rounded-lg border border-dashed border-slate-300 bg-white p-4">
            <h3 className="text-lg font-semibold text-slate-950">Upload sales data to unlock revenue insights.</h3>
            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Import one clean CSV to populate revenue trends, customer groups, categories, and recommendations for your demo.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white" onClick={() => setActivePanel("dataWorkspace")} type="button">
                Go to Sales Data
              </button>
              <button className="inline-flex h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700" onClick={() => setActivePanel("modelsWorkspace")} type="button">
                Create Pricing Insight
              </button>
            </div>
          </section>

          <section className="overflow-auto rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-base font-semibold">What Needs Attention</h3>
            <div className="mt-3 grid gap-2">
              {actionItems.map((item) => (
                <button
                  key={item.label}
                  className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-slate-300 hover:bg-white"
                  onClick={() => setActivePanel(item.target)}
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{item.note}</span>
                  </span>
                  <span className={`mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs font-medium ${item.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                    {item.done ? "Ready" : "Next"}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {!isEmpty && <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-1">
        <div className="grid grid-cols-3 gap-1">
          {homeTabs.map((tab) => (
            <button
              key={tab.id}
              className={`h-9 rounded-md text-sm font-medium ${activeHomeTab === tab.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100"}`}
              onClick={() => setActiveHomeTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>}

      {!isEmpty && <div className="min-h-0">
        {activeHomeTab === "overview" && (
          <div className="grid min-h-0 gap-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard icon={TrendingUp} label="Total Revenue" value={<ExplainableNumber lines={["Total revenue = sum of imported sales revenue.", "Used for dashboard and top-product ranking."]}>{formatCurrency(metrics.totalRevenue, currency)}</ExplainableNumber>} note="From imported sales" />
              <SummaryCard icon={Target} label="Total Profit" value={<ExplainableNumber lines={["Total profit = sum of (price - cost) x quantity.", "If cost is estimated, profit is less reliable."]}>{formatCurrency(metrics.totalProfit, currency)}</ExplainableNumber>} note="After product costs" />
              <SummaryCard icon={Database} label="Sales Rows" value={<ExplainableNumber lines={["Sales rows = count of imported sales records.", `${formatNumber(metrics.totalUnits)} total units sold.`]}>{formatNumber(salesRecords)}</ExplainableNumber>} note={`${formatNumber(metrics.totalUnits)} units sold`} />
              <SummaryCard icon={CheckCircle2} label="Pricing Insights Ready" value={<ExplainableNumber lines={["Count of fitted pricing insight records.", `${formatNumber(metrics.recommendationCount)} saved recommendations.`]}>{formatNumber(modelCount)}</ExplainableNumber>} note={`${formatNumber(metrics.recommendationCount)} recommendations saved`} />
              <SummaryCard icon={Gauge} label="Model-Ready Products" value={<ExplainableNumber lines={["Products with enough history and price variation for insight creation.", "This does not guarantee a final recommendation."]}>{formatNumber(metrics.modelReadyProducts || 0)}</ExplainableNumber>} note="Ready or limited for insight" />
              <SummaryCard icon={X} label="Summary-Only Products" value={<ExplainableNumber lines={["Products with sales summary but not enough price variation for a demand model.", "They can show business summary only."]}>{formatNumber(metrics.summaryOnlyProducts || 0)}</ExplainableNumber>} note="Need more price variation" />
              <SummaryCard icon={Package} label="Top Revenue Product" value={dashboardData?.businessHighlights?.topRevenueProduct?.name || "Not available"} note={dashboardData?.businessHighlights?.topRevenueProduct ? formatCurrency(dashboardData.businessHighlights.topRevenueProduct.revenue, currency) : "Upload data first"} />
              <SummaryCard icon={BadgeDollarSign} label="Highest Profit Product" value={dashboardData?.businessHighlights?.topProfitProduct?.name || "Not available"} note={dashboardData?.businessHighlights?.topProfitProduct ? formatCurrency(dashboardData.businessHighlights.topProfitProduct.profit, currency) : "Upload data first"} />
            </div>

            <CalculationWorkingPanel
              title="Show home snapshot working"
              summary="The home snapshot is not a separate model. It summarizes imported sales, fitted pricing insights, and saved recommendations."
              formulas={[
                "Revenue = sum of imported row revenue.",
                "Profit = sum of (price - cost) x quantity.",
                "Model-ready products = products passing readiness checks for pricing insight creation.",
                "Summary-only products = products with sales data but insufficient price variation."
              ]}
              evidence={[
                `${formatNumber(salesRecords)} sales rows.`,
                `${formatNumber(metrics.totalUnits)} units sold.`,
                `${formatNumber(modelCount)} pricing insights ready.`
              ]}
            />

            <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.9fr)]">
              <section className="min-h-0 rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold">Revenue by Month</h3>
                    <p className="mt-1 text-xs text-slate-500">Monthly sales movement from imported history.</p>
                  </div>
                  <LineChart className="text-slate-500" size={18} />
                </div>
                <div className="mt-4">
                  <RevenueTrendChart data={trend} dataKey="revenue" currency={currency} />
                </div>
              </section>

              <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
                {activeSource && (
                  <div className={`mb-3 rounded-md border p-3 ${sources.length > 1 ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-slate-50"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-medium uppercase text-slate-500">Active dataset</p>
                        <p className="mt-1 truncate text-sm font-semibold text-slate-900">{activeSource.source}</p>
                      </div>
                      <div className="shrink-0 text-right text-xs text-slate-600">
                        <p>{formatNumber(activeSource.rows)} rows</p>
                        <p>{formatCurrency(activeSource.revenue, currency)}</p>
                      </div>
                    </div>
                    {sources.length > 1 && <p className="mt-2 text-xs text-amber-800">Multiple import sources are present. Reset and reload one CSV for a clean demo.</p>}
                  </div>
                )}

                <h3 className="text-base font-semibold">What Needs Attention</h3>
                <div className="mt-3 grid gap-2">
                  {actionItems.map((item) => (
                    <button
                      key={item.label}
                      className="flex items-start justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-slate-300 hover:bg-white"
                      onClick={() => setActivePanel(item.target)}
                      type="button"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                        <span className="mt-1 block truncate text-xs text-slate-500">{item.note}</span>
                      </span>
                      <span className={`mt-0.5 shrink-0 rounded-md px-2 py-1 text-xs font-medium ${item.done ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {item.done ? "Ready" : "Next"}
                      </span>
                    </button>
                  ))}
                  <div className={`rounded-md border p-3 text-sm ${status === "online" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
                    {status === "online" ? "System online and ready for pricing work." : error || "System needs attention."}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {activeHomeTab === "breakdown" && (
          <div className="grid min-h-0 gap-4 xl:grid-cols-2">
            <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Customer Groups</h3>
              <p className="mt-1 text-sm text-slate-500">Revenue contribution by customer type.</p>
              <div className="mt-4">
                <HorizontalBars items={segments} labelKey="label" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No customer group data available yet." />
              </div>
            </section>

            <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Category Performance</h3>
              <p className="mt-1 text-sm text-slate-500">Highest revenue categories in the workspace.</p>
              <div className="mt-4">
                <HorizontalBars items={categories.slice(0, 8)} labelKey="category" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No category data available yet." />
              </div>
            </section>
          </div>
        )}

        {activeHomeTab === "recent" && (
          <section className="min-h-0 rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold">Recent Recommendations</h3>
                <p className="mt-1 text-sm text-slate-500">Latest pricing decisions saved by the workspace.</p>
              </div>
              <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={() => setActivePanel("performanceWorkspace")} type="button">
                View History
              </button>
            </div>

            {recentRecommendations.length ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {recentRecommendations.slice(0, 6).map((item) => (
                  <article key={item._id} className="rounded-md border border-slate-200 bg-slate-50 p-4">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.product?.name || "Unknown product"}</p>
                    <p className="mt-1 text-xs text-slate-500">{getObjectiveLabel(item.objective)} - {item.segmentLabel || formatSegmentName(item.segment)}</p>
                    <div className="mt-4 grid gap-2 text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Recommended price</span>
                        <span className="font-medium text-slate-900">{formatCurrency(item.recommendedPrice, currency)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-500">Estimated profit</span>
                        <span className="font-medium text-slate-900">{formatCurrency(item.expectedProfit, currency)}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No recommendations yet. Generate one from Best Price Recommendation.</p>
            )}
          </section>
        )}
      </div>}
    </div>
    </section>
  );
}
