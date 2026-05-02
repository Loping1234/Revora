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
  MiniRevenueTrend,
  FormRow,
  SectionHeader,
  SummaryCard,
  WarningPanel
} from "./common";
import { useViewMode } from "../lib/view-mode";

export function ReportsExportPanel({ recommendations, exportState, exportMessage, handleDownloadReport }) {
  const { detailed } = useViewMode();
  const reportCards = [
    { type: "dashboard", title: "Dashboard Report", note: "Home metrics, revenue trend, top products, categories, and customer groups.", filename: "pricing-dashboard-report.xlsx" },
    { type: "products", title: "Products Report", note: "Product table with price, cost, inventory, readiness, and model status.", filename: "pricing-products-report.xlsx" },
    { type: "salesData", title: "Sales Data Report", note: "Imported rows, sales context, revenue, and product identity details.", filename: "pricing-sales-data-report.xlsx" },
    { type: "pricingInsights", title: "Pricing Insights Report", note: "Model formulas, reliability labels, grouped demand points, and warnings.", filename: "pricing-insights-report.xlsx" },
    { type: "recommendations", title: "Recommendations Report", note: "Best price outputs, tested prices, explanations, and guardrails.", filename: "pricing-recommendations-report.xlsx" },
    { type: "recommendationHistory", title: "Recommendation History Report", note: "Saved recommendation history in a polished workbook.", filename: "pricing-recommendation-history-report.xlsx" },
    { type: "examinerWorkbook", title: "All-in-One Examiner Report", note: "One workbook covering data quality, products, insights, dashboard, recommendations, and limitations.", filename: "pricing-examiner-workbook.xlsx" }
  ];
  const demoChecklist = [
    "Dataset summary and active source",
    "Revenue, profit, and product readiness",
    "Formulas and model quality warnings",
    "Recommendation result and tested prices",
    "Known limitations and next data needed"
  ];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={FileDown}
        title="Download Reports"
        description="Export polished workbooks for each major workspace and a complete examiner report."
      />

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase text-slate-500">Recommendation records</p>
          <p className="mt-2 text-xl font-semibold">{recommendations.length}</p>
          <p className="mt-2 text-sm text-slate-500">Exports the latest 500 recommendations.</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs uppercase text-slate-500">Report format</p>
          <p className="mt-2 text-xl font-semibold">XLSX + CSV</p>
          <p className="mt-2 text-sm text-slate-500">Polished workbooks for demo, plus CSV for recommendation data.</p>
        </div>
      </div>

      {detailed && (
      <section className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-3 text-slate-700">
          <CheckCircle2 size={18} />
          <h3 className="text-sm font-semibold text-slate-950">Demo Report Checklist</h3>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {demoChecklist.map((item) => (
            <div key={item} className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">
              {item}
            </div>
          ))}
        </div>
      </section>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {reportCards.map((report) => (
          <div key={report.type} className="rounded-md border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">{report.title}</p>
            <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{report.note}</p>
            <button
              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
              disabled={exportState === "running"}
              onClick={() => handleDownloadReport(report.type, report.filename)}
              type="button"
            >
              {exportState === "running" ? "Preparing" : "Download XLSX"}
            </button>
          </div>
        ))}
      </div>

      <button
        className="mt-5 inline-flex h-10 w-full items-center justify-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100 sm:w-auto"
        disabled={exportState === "running"}
        onClick={() => handleDownloadReport("recommendationsCsv", "pricing-recommendations.csv")}
        type="button"
      >
        {exportState === "running" ? "Preparing" : "Download Recommendation CSV"}
      </button>

      {exportMessage && <p className={`mt-3 text-sm ${exportState === "success" ? "text-emerald-700" : "text-rose-700"}`}>{exportMessage}</p>}
    </section>
  );
}

export function SettingsPanel({ settingsForm, setSettingsForm, settingsState, settingsMessage, handleSaveSettings, resetState, resetMessage, handleResetData }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={Settings}
        title="Workspace Settings"
        description="Control workspace branding, reporting defaults, appearance, and demo security settings."
      />

      <form className="mt-5 grid gap-4 lg:grid-cols-2" onSubmit={handleSaveSettings}>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 lg:col-span-2">
          <p className="text-sm font-semibold text-slate-900">Branding</p>
          <p className="mt-1 text-sm text-slate-500">Controls how the workspace appears during the examiner demo.</p>
        </div>

        <FormRow label="Company name">
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            onChange={(event) => setSettingsForm((current) => ({ ...current, companyName: event.target.value }))}
            value={settingsForm.companyName}
          />
        </FormRow>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Currency
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            onChange={(event) => setSettingsForm((current) => ({ ...current, currency: event.target.value }))}
            value={settingsForm.currency}
          >
            <option value="USD">USD</option>
            <option value="INR">INR</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Theme color
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            onChange={(event) => setSettingsForm((current) => ({ ...current, themeColor: event.target.value }))}
            type="color"
            value={settingsForm.themeColor}
          />
        </label>

        <div className="grid gap-2 text-sm font-medium text-slate-700">
          Appearance
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
            {[
              { value: "light", label: "Light mode" },
              { value: "dark", label: "Dark mode" }
            ].map((mode) => (
              <button
                className={`h-10 rounded-md text-sm font-medium ${
                  (settingsForm.appearanceMode || "light") === mode.value ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-white"
                }`}
                key={mode.value}
                onClick={() => setSettingsForm((current) => ({ ...current, appearanceMode: mode.value }))}
                type="button"
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 lg:col-span-2">
          <p className="text-sm font-semibold text-slate-900">Pricing Defaults</p>
          <p className="mt-1 text-sm text-slate-500">Sets the default currency, objective, and exported report title.</p>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          Default goal
          <select
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            onChange={(event) => setSettingsForm((current) => ({ ...current, defaultObjective: event.target.value }))}
            value={settingsForm.defaultObjective}
          >
            {objectiveOptions.map((objective) => (
              <option key={objective.value} value={objective.value}>
                {objective.label}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium text-slate-700 lg:col-span-2">
          Report name
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            onChange={(event) => setSettingsForm((current) => ({ ...current, reportName: event.target.value }))}
            value={settingsForm.reportName}
          />
        </label>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
          <p className="text-sm font-medium text-slate-900">Access control</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">Login is enabled with Admin and Analyst roles. Protected backend actions also require the configured API key.</p>
        </div>

        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 lg:col-span-2">
          <p className="text-sm font-medium text-rose-900">Reset workspace data</p>
          <p className="mt-2 text-sm leading-6 text-rose-800">Deletes imported sales rows, products, pricing insights, and recommendations from this local workspace. You must type RESET to confirm.</p>
          <button
            className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-rose-300 bg-white px-4 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            disabled={resetState === "running"}
            onClick={handleResetData}
            type="button"
          >
            {resetState === "running" ? "Resetting" : "Reset Workspace Data"}
          </button>
          {resetMessage && <p className={`mt-3 text-sm ${resetState === "error" ? "text-rose-700" : "text-emerald-700"}`}>{resetMessage}</p>}
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4 lg:col-span-2">
          <p className="text-sm font-medium text-slate-900">Demo security mode</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This local project uses role-based demo login, JWT expiry, API-key protection for machine access, and admin-only controls for upload, reset, API ingestion, and settings. For deployment, replace demo passwords with hashed environment values and production secrets.
          </p>
        </div>

        <div className="lg:col-span-2">
          <button
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
            disabled={settingsState === "saving"}
            type="submit"
          >
            {settingsState === "saving" ? "Saving" : "Save Settings"}
          </button>
          {settingsMessage && <p className={`mt-3 text-sm ${settingsState === "success" ? "text-emerald-700" : "text-rose-700"}`}>{settingsMessage}</p>}
        </div>
      </form>
    </section>
  );
}
