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
import { objectiveOptions, sidebarItems } from "../config/navigation";
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
  TrustBadge,
  WarningPanel
} from "./common";
import { RevenueTrendChart } from "./charts";

export function DashboardPanel({ dashboardData, dashboardState, dashboardMessage, currency, refreshDashboard }) {
  const metrics = dashboardData?.metrics || {};
  const topProducts = dashboardData?.topProducts || [];
  const segments = (dashboardData?.segments || []).map((item) => ({
    ...item,
    label: item.label || formatSegmentName(item.segment)
  }));
  const categories = dashboardData?.categories || [];
  const trend = dashboardData?.trend || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <section className="shrink-0 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-slate-700">
            <LineChart size={20} />
            <div>
              <h2 className="text-base font-semibold">Business Performance</h2>
              <p className="mt-1 text-sm text-slate-500">A deeper visual read of revenue movement, top products, customer groups, and category contribution.</p>
            </div>
          </div>
          <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshDashboard} type="button">
            Refresh
          </button>
        </div>
        {dashboardMessage && <p className={`mt-3 text-sm ${dashboardState === "error" ? "text-rose-700" : "text-slate-500"}`}>{dashboardMessage}</p>}
      </section>

      <div className="shrink-0 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Database} label="Sales Rows" value={<ExplainableNumber lines={["Count of imported sales transaction rows currently stored in the workspace.", `${formatNumber(metrics.totalUnits)} total units sold.`]}>{formatNumber(metrics.salesRecords)}</ExplainableNumber>} note={`${formatNumber(metrics.totalUnits)} units sold`} />
        <SummaryCard icon={TrendingUp} label="Total Revenue" value={<ExplainableNumber lines={["Total revenue = sum of imported sales revenue.", "If revenue was missing in CSV, importer may calculate price x quantity."]}>{formatCurrency(metrics.totalRevenue, currency)}</ExplainableNumber>} note="From imported sales" />
        <SummaryCard icon={Target} label="Total Profit" value={<ExplainableNumber lines={["Total profit = sum of (unit price - product cost) x quantity.", "Profit depends on cost quality in the uploaded data."]}>{formatCurrency(metrics.totalProfit, currency)}</ExplainableNumber>} note="Based on product costs" />
        <SummaryCard icon={CheckCircle2} label="Recommendations" value={<ExplainableNumber lines={["Count of saved recommendation records.", `${formatNumber(metrics.modelCount)} pricing insights are available.`]}>{formatNumber(metrics.recommendationCount)}</ExplainableNumber>} note={`${formatNumber(metrics.modelCount)} pricing insights ready`} />
      </div>

      <CalculationWorkingPanel
        title="Show dashboard working"
        summary="Dashboard numbers are direct aggregates from the active imported sales workspace."
        formulas={[
          "Sales rows = count of stored sales records.",
          "Total revenue = sum of sales revenue across imported rows.",
          "Total profit = sum of (price - cost) x quantity.",
          "Top products, customer groups, categories, and months are ranked by summed revenue."
        ]}
        evidence={[
          `${formatNumber(metrics.salesRecords)} sales rows.`,
          `${formatNumber(metrics.totalUnits)} units sold.`,
          `${formatNumber(metrics.modelCount)} pricing insights ready.`
        ]}
      />

      <div className="grid min-h-0 gap-4 xl:grid-cols-2">
        <section className="max-h-[360px] min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">Top Products by Revenue</h3>
          <div className="mt-4">
            <HorizontalBars items={topProducts} labelKey="name" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No sales data available yet." />
          </div>
        </section>

        <section className="max-h-[360px] min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">Customer Groups</h3>
          <div className="mt-4">
            <HorizontalBars items={segments} labelKey="label" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No customer group data available yet." />
          </div>
        </section>

        <section className="max-h-[460px] min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">Category Performance</h3>
          <div className="mt-4">
            <HorizontalBars items={categories} labelKey="category" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No category data available yet." />
          </div>
        </section>

        <section className="max-h-[460px] min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-base font-semibold">Revenue Movement</h3>
          <div className="mt-4">
            <RevenueTrendChart data={trend} dataKey="revenue" currency={currency} />
          </div>
        </section>
      </div>
    </section>
  );
}

export function HistoryPanel({ recommendations, historyState, historyMessage, currency, refreshHistory, handleApplyRecommendation }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <History size={20} />
          <h2 className="text-base font-semibold">Past Recommendations</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshHistory} type="button">
          Refresh
        </button>
      </div>

      {historyMessage && <p className={`mt-3 text-sm ${historyState === "error" ? "text-rose-700" : "text-slate-500"}`}>{historyMessage}</p>}

      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="py-3 pr-4 font-medium">Product</th>
              <th className="py-3 pr-4 font-medium">Status</th>
              <th className="py-3 pr-4 font-medium">Goal</th>
              <th className="py-3 pr-4 font-medium">Customer Group</th>
              <th className="py-3 pr-4 font-medium">Recommended Price</th>
              <th className="py-3 pr-4 font-medium">Estimated Revenue</th>
              <th className="py-3 pr-4 font-medium">Estimated Profit</th>
              <th className="py-3 pr-4 font-medium">Outcome</th>
              <th className="py-3 pr-4 font-medium">Created</th>
              <th className="py-3 pr-4 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {recommendations.map((item) => (
              <tr key={item._id} className="border-b border-slate-100 last:border-0">
                <td className="py-3 pr-4">
                  <p className="font-medium text-slate-900">{item.product?.name || "Unknown product"}</p>
                  <p className="text-xs text-slate-500">{item.product?.sku || "No SKU"}</p>
                </td>
                <td className="py-3 pr-4">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${
                    item.status === "Measured" ? "bg-emerald-50 text-emerald-700" : item.status === "Missed" ? "bg-rose-50 text-rose-700" : item.status === "Applied" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-700"
                  }`}>
                    {item.status || "Draft"}
                  </span>
                </td>
                <td className="py-3 pr-4 capitalize text-slate-600">{item.objective}</td>
                <td className="py-3 pr-4 text-slate-600">{item.segmentLabel || formatSegmentName(item.segment)}</td>
                <td className="py-3 pr-4 font-medium text-slate-900">{formatCurrency(item.recommendedPrice, currency)}</td>
                <td className="py-3 pr-4 text-slate-600">{formatCurrency(item.expectedRevenue, currency)}</td>
                <td className="py-3 pr-4 text-slate-600">
                  {formatCurrency(item.expectedProfit, currency)}
                  {item.profitUsesEstimatedCost && <div className="mt-1"><TrustBadge label="Profit uses estimated cost" /></div>}
                </td>
                <td className="py-3 pr-4 text-slate-600">
                  {item.outcomeSummary?.measuredAt ? (
                    <div>
                      <p>{formatCurrency(item.outcomeSummary.actualProfit, currency)} actual profit</p>
                      <p className="text-xs text-slate-500">{formatPercent(item.outcomeSummary.predictionError)} units error</p>
                    </div>
                  ) : (
                    <span className="text-slate-400">Not measured</span>
                  )}
                </td>
                <td className="py-3 pr-4 text-slate-600">{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Unknown"}</td>
                <td className="py-3 pr-4">
                  <button
                    className="inline-flex h-8 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    onClick={() => handleApplyRecommendation(item)}
                    type="button"
                  >
                    Measure
                  </button>
                </td>
              </tr>
            ))}
            {!recommendations.length && (
              <tr>
                <td className="py-6 text-sm text-slate-500" colSpan="10">
                  No recommendations have been created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function RecommendationPerformancePanel({ performance, state, message, currency, refreshRecommendationPerformance }) {
  const summary = performance?.summary || {};
  const outcomes = performance?.outcomes || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <Gauge size={20} />
          <div>
            <h2 className="text-base font-semibold">Recommendation Performance</h2>
            <p className="mt-1 text-sm text-slate-500">Compare predicted recommendation results with actual sales after a price was applied.</p>
          </div>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshRecommendationPerformance} type="button">
          Refresh
        </button>
      </div>

      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SummaryCard icon={Target} label="Applied" value={formatNumber(summary.appliedRecommendations || 0)} note="Recommendations tracked" />
        <SummaryCard icon={CheckCircle2} label="Measured" value={formatNumber(summary.measuredRecommendations || 0)} note="Actual sales found" />
        <SummaryCard icon={Gauge} label="Hit Rate" value={formatPercent(summary.hitRate || 0)} note="Measured targets hit" />
        <SummaryCard icon={TrendingUp} label="Profit Lift" value={formatCurrency(summary.totalProfitLift || 0, currency)} note="Actual vs baseline profit" />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="p-3 font-medium">Product</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Applied Price</th>
              <th className="p-3 font-medium">Window</th>
              <th className="p-3 font-medium">Estimated Profit</th>
              <th className="p-3 font-medium">Actual Profit</th>
              <th className="p-3 font-medium">Units Error</th>
              <th className="p-3 font-medium">Rows</th>
            </tr>
          </thead>
          <tbody>
            {outcomes.map((item) => (
              <tr key={item._id} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <p className="font-medium text-slate-900">{item.productId?.name || "Unknown product"}</p>
                  <p className="text-xs text-slate-500">{item.productId?.sku || formatSegmentName(item.segment)}</p>
                </td>
                <td className="p-3">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${
                    item.status === "Measured" ? "bg-emerald-50 text-emerald-700" : item.status === "Missed" ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"
                  }`}>
                    {item.status}
                  </span>
                </td>
                <td className="p-3 text-slate-600">{formatCurrency(item.appliedPrice, currency)}</td>
                <td className="p-3 text-slate-600">
                  {item.startDate ? new Date(item.startDate).toLocaleDateString() : "N/A"} - {item.endDate ? new Date(item.endDate).toLocaleDateString() : "N/A"}
                </td>
                <td className="p-3 text-slate-600">
                  {formatCurrency(item.expectedProfit, currency)}
                  {item.profitUsesEstimatedCost && <div className="mt-1"><TrustBadge label="Profit uses estimated cost" /></div>}
                </td>
                <td className="p-3 text-slate-600">{formatCurrency(item.actualProfit, currency)}</td>
                <td className="p-3 text-slate-600">{formatPercent(item.predictionError || 0)}</td>
                <td className="p-3 text-slate-600">{formatNumber(item.rowsMeasured || 0)}</td>
              </tr>
            ))}
            {!outcomes.length && (
              <tr>
                <td className="p-6 text-sm text-slate-500" colSpan="8">Apply a recommendation from Recommendation History to start measuring predicted vs actual results.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
