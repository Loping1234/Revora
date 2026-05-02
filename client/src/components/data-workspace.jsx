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
  OptionalDetailsPanel,
  SectionHeader,
  SummaryCard,
  WarningPanel
} from "./common";
import { useViewMode } from "../lib/view-mode";

export function SalesDataPanel({
  canCommitImport = false,
  handleUpload,
  handleCommitImport,
  handleRejectImport,
  handleDownloadPanelReport,
  importReview,
  importReviewMessage,
  importReviewState,
  selectedFile,
  setSelectedFile,
  uploadState,
  uploadMessage,
  uploadSummary,
  totalSalesRecords
}) {
  const { detailed } = useViewMode();
  const mappedFields = Object.entries(uploadSummary?.mappedFields || {});
  const conflicts = Object.entries(uploadSummary?.conflicts || {}).filter(([, count]) => count > 0);
  const rowErrors = uploadSummary?.errors || [];
  const segmentsDetected = Object.entries(uploadSummary?.segmentsDetected || {});
  const optionalFields = Object.entries(uploadSummary?.detectedOptionalFields || {});
  const datasetWarnings = uploadSummary?.datasetWarnings || [];
  const reviewSummary = importReview?.qualitySummary || {};
  const sampleIssues = importReview?.sampleIssues || [];
  const isMappingPreview = uploadSummary?.status === "mapping_pending";
  const isQualityReview = uploadSummary?.status === "quality_review" || uploadSummary?.reviewRequired;
  const isCommitted = uploadSummary?.status === "committed";
  const uploadButtonLabel = uploadState === "uploading"
    ? "Working"
    : isMappingPreview
      ? "Process & Stage for Review"
      : "Upload & Preview Mapping";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={Upload}
        title="Import Sales History"
        description="Upload a business CSV, confirm how columns were understood, and keep the current dataset visible for demo confidence."
      />

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Expected CSV contents</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Include product identity, selling price or revenue, quantity sold, and preferably date, cost, category, customer group, inventory, and competitor price.
          </p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase text-slate-500">Current dataset</p>
          <p className="mt-1 text-lg font-semibold text-slate-950">{totalSalesRecords} sales rows</p>
          <p className="mt-1 text-sm text-slate-500">{uploadSummary?.latestImportSource || selectedFile?.name || "No file selected in this session"}</p>
        </div>
      </div>

      <div className="mt-6 rounded-xl border-2 border-slate-950/5 bg-slate-50 p-6 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Step 1: Select and Upload</h3>
        <p className="mt-1 text-xs text-slate-500">Choose your business CSV to begin the automated mapping process.</p>
        
        <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center" onSubmit={handleUpload}>
          <div className="relative flex-1">
            <input
              accept=".csv,text/csv"
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-950 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
              onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
              id="csv-upload-input"
              type="file"
            />
          </div>
          <button
            className="inline-flex h-10 w-full min-w-40 items-center justify-center whitespace-nowrap rounded-md bg-slate-950 px-6 text-sm font-bold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-auto"
            disabled={uploadState === "uploading"}
            type="submit"
          >
            {uploadButtonLabel}
          </button>
        </form>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {[
          ["Upload CSV", selectedFile ? "Ready" : "Waiting"],
          ["Confirm Mapping", isMappingPreview || isQualityReview || isCommitted ? "Ready" : "Next"],
          ["Review Quality", isQualityReview || isCommitted ? "Ready" : "Locked"],
          ["Commit Dataset", isCommitted ? "Committed" : isQualityReview ? "Action needed" : "Locked"]
        ].map(([label, state]) => (
          <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-2">
            <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
            <p className={`mt-1 text-sm font-semibold ${state === "Action needed" ? "text-amber-700" : state === "Ready" || state === "Committed" ? "text-emerald-700" : "text-slate-500"}`}>{state}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 shrink-0 grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase text-slate-500">Selected file</p>
          <p className="mt-1 truncate text-sm font-medium">{selectedFile?.name || "None selected"}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs uppercase text-slate-500">Sales rows in workspace</p>
          <p className="mt-1 text-sm font-medium">{totalSalesRecords}</p>
        </div>
      </div>

      {uploadMessage && (
        <p className={`mt-3 text-sm ${uploadState === "success" ? "text-emerald-700" : "text-rose-700"}`}>
          {uploadMessage}
        </p>
      )}

      {uploadSummary && (
        <section className="mt-4 min-h-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Import Summary</h3>
            {uploadSummary.truncated && <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">Processed first 10,000 rows</span>}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Committed</p>
              <p className="mt-1 text-lg font-semibold">{uploadSummary.importedRows ?? uploadSummary.committedRows ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Products</p>
              <p className="mt-1 text-lg font-semibold">{uploadSummary.productsDetected ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Model-safe</p>
              <p className="mt-1 text-lg font-semibold">{uploadSummary.modelEligibleRows ?? reviewSummary.modelEligibleRows ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Warnings</p>
              <p className="mt-1 text-lg font-semibold">{uploadSummary.warning ?? reviewSummary.warning ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Excluded</p>
              <p className="mt-1 text-lg font-semibold">{uploadSummary.excluded_from_model ?? reviewSummary.excluded_from_model ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Invalid</p>
              <p className="mt-1 text-lg font-semibold">{uploadSummary.invalidRowsSkipped ?? uploadSummary.skippedRows}</p>
            </div>
          </div>

          {isQualityReview && (
            <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-amber-950">Waiting for review</p>
                  <p className="mt-1 text-sm text-amber-800">This upload is staged only. Dashboards, products, pricing insights, simulator, and recommendations will not change until an admin or manager commits it.</p>
                </div>
                <div className="flex gap-2">
                  <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" disabled={importReviewState === "running"} onClick={handleRejectImport} type="button">
                    Reject
                  </button>
                  <button className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-sm font-medium text-white disabled:bg-slate-400" disabled={importReviewState === "running" || !canCommitImport} onClick={handleCommitImport} type="button">
                    {canCommitImport ? "Commit verified data" : "Admin or manager required"}
                  </button>
                </div>
              </div>
              {importReviewMessage && <p className={`mt-2 text-sm ${importReviewState === "error" ? "text-rose-700" : "text-emerald-700"}`}>{importReviewMessage}</p>}
            </div>
          )}

          {sampleIssues.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-slate-500">Rows needing review</p>
              <div className="mt-2 grid max-h-44 gap-2 overflow-auto">
                {sampleIssues.slice(0, 10).map((issue) => (
                  <p key={`${issue.rowNumber}-${issue.issueCodes?.join("-")}`} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-amber-900">
                    Row {issue.rowNumber}: {(issue.issueReasons || []).join("; ")}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs uppercase text-emerald-700">Ready products</p>
              <p className="mt-1 text-lg font-semibold text-emerald-900">{uploadSummary.productsReady ?? 0}</p>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs uppercase text-amber-700">Limited products</p>
              <p className="mt-1 text-lg font-semibold text-amber-900">{uploadSummary.productsLimited ?? 0}</p>
            </div>
            <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs uppercase text-rose-700">Needs cleanup</p>
              <p className="mt-1 text-lg font-semibold text-rose-900">{uploadSummary.productsNotReady ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Product identity</p>
              <p className="mt-1 text-sm font-semibold">{uploadSummary.productIdentityMode || "Detected from file"}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">External product IDs</p>
              <p className="mt-1 text-sm font-semibold">{uploadSummary.externalProductIdsDetected ?? 0}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Summary-only products</p>
              <p className="mt-1 text-sm font-semibold">{uploadSummary.productsWithSummaryOnlyData ?? 0}</p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Data fitness</p>
              <p className="mt-1 text-sm font-semibold">{uploadSummary.dataFitnessLabel || "Not scored"} ({uploadSummary.dataFitnessScore ?? 0}/100)</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Cost quality</p>
              <p className="mt-1 text-sm font-semibold">{uploadSummary.costQualitySummary?.label || "Unknown"}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Active for modeling</p>
              <p className="mt-1 text-sm font-semibold">Latest upload selected</p>
            </div>
          </div>

          {(datasetWarnings.length > 0 || optionalFields.length > 0) && (
            <div className="mt-4 rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs font-medium uppercase text-slate-500">Data quality notes</p>
              {datasetWarnings.length > 0 && (
                <div className="mt-2 grid gap-1 text-sm text-amber-800">
                  {datasetWarnings.map((warning) => <p key={warning}>{warning}</p>)}
                </div>
              )}
              {optionalFields.length > 0 && (
                <p className="mt-2 text-sm text-slate-600">
                  Optional context detected: {optionalFields.map(([field, column]) => `${column} -> ${field}`).join(", ")}
                </p>
              )}
            </div>
          )}

          {uploadSummary.reportAvailable && (
            <button
              className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white sm:w-auto"
              onClick={() => handleDownloadPanelReport("importSummary", "upload-intelligence-report.xlsx", { source: uploadSummary.latestImportSource })}
              type="button"
            >
              Download Upload Intelligence Report
            </button>
          )}

          {segmentsDetected.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-slate-500">Customer groups detected</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {segmentsDetected.map(([segment, count]) => (
                  <p key={segment} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                    <span className="font-medium capitalize text-slate-900">{segment}</span>: {count}
                  </p>
                ))}
              </div>
            </div>
          )}

          {detailed && mappedFields.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-slate-500">Detected mapping</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {mappedFields.map(([field, column]) => (
                  <p key={field} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600">
                      <span className="font-medium text-slate-900">{column}</span>{" -> "}{field}
                  </p>
                ))}
              </div>
            </div>
          )}

          {conflicts.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-slate-500">Conflicts found</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {conflicts.map(([field, count]) => (
                  <p key={field} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    {field}: {count}
                  </p>
                ))}
              </div>
            </div>
          )}

          {rowErrors.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium uppercase text-slate-500">First skipped rows</p>
              <div className="mt-2 grid gap-2">
                {rowErrors.map((error) => (
                  <p key={`${error.row}-${error.reason}`} className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                    Row {error.row}: {error.reason}
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {detailed && (
      <details className="mt-3 shrink-0 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-800">CSV columns</summary>
        <p className="mt-3">
          Preferred columns: SKU, Product Name, Category, Customer Segment, Unit Price, Cost, Competitor Price, Quantity Sold, Inventory, Revenue, Gross Margin, and Date.
        </p>
        <p className="mt-2">
          The importer also understands messy headers like Unit Price (), selling_price_inr, QuantitySold, Revenue(), Sales_Amount, and Date_of_Sale.
        </p>
      </details>
      )}
    </section>
  );
}

export function DataQualityPanel({ dataQuality, state, message, refreshDataQuality, handleSetActiveImportBatch, handleRollbackImport, currency }) {
  const overview = dataQuality?.overview || {};
  const readiness = dataQuality?.readiness || {};
  const warnings = dataQuality?.warnings || [];
  const importBatches = dataQuality?.importBatches || [];
  const activeImportBatchId = dataQuality?.activeImportBatchId ? String(dataQuality.activeImportBatchId) : "";

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <Gauge size={20} />
          <h2 className="text-base font-semibold">Data Quality</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshDataQuality} type="button">
          Refresh
        </button>
      </div>
      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SummaryCard icon={Database} label="Rows Imported" value={formatNumber(overview.rows)} note={`${formatNumber(overview.products)} products detected`} />
        <SummaryCard icon={TrendingUp} label="Revenue Found" value={formatCurrency(overview.revenue, currency)} note={`${formatNumber(overview.units)} units`} />
        <SummaryCard icon={CheckCircle2} label="Model Ready" value={formatNumber((readiness.readyCombinations || 0) + (readiness.limitedCombinations || 0))} note="Can attempt pricing insights" />
        <SummaryCard icon={X} label="Summary Only" value={formatNumber(readiness.notReadyCombinations || 0)} note="Useful, but no model yet" />
        <SummaryCard icon={BadgeDollarSign} label="Competitor Coverage" value={formatPercent(overview.competitorCoveragePercent || 0)} note={`${formatPercent(overview.costCoveragePercent || 0)} cost coverage`} />
      </div>

      <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Active modeling dataset</h3>
            <p className="mt-1 text-sm text-slate-500">
              Recommendations use the selected import batch. This prevents old bad uploads from silently polluting model results.
            </p>
          </div>
          <button
            className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"
            disabled={!handleSetActiveImportBatch}
            onClick={() => handleSetActiveImportBatch?.(null)}
            type="button"
          >
            Use all imports
          </button>
        </div>
        <div className="mt-3 grid gap-2 lg:grid-cols-3">
          {importBatches.slice(0, 6).map((batch) => (
            <button
              className={`rounded-md border p-3 text-left text-sm ${String(batch._id) === activeImportBatchId ? "border-emerald-300 bg-emerald-50 text-emerald-950" : "border-slate-200 bg-white text-slate-700"}`}
              key={batch._id}
              onClick={() => batch.status === "committed" ? handleSetActiveImportBatch?.(batch._id) : undefined}
              type="button"
            >
              <span className="block truncate font-semibold">{batch.source}</span>
              <span className="mt-1 block text-xs">{formatNumber(batch.rowCounts?.importedRows || batch.qualitySummary?.commitEligibleRows || 0)} rows - {batch.status || "imported"} - {batch.dataFitnessLabel || "Not scored"}</span>
              {String(batch._id) === activeImportBatchId && <span className="mt-2 inline-flex rounded-md bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">Active</span>}
              {batch.status === "archived" && handleRollbackImport && (
                <span
                  className="mt-2 inline-flex rounded-md bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleRollbackImport(batch._id);
                  }}
                  role="button"
                  tabIndex={0}
                >
                  Rollback
                </span>
              )}
            </button>
          ))}
          {!importBatches.length && <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">No import batches available yet.</p>}
        </div>
      </section>

      <div className="mt-4 grid min-h-0 gap-4 xl:grid-cols-2">
        <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Readiness split</h3>
          <div className="mt-4">
            <HorizontalBars
              items={[
                { label: "Ready", value: readiness.readyCombinations || 0 },
                { label: "Limited", value: readiness.limitedCombinations || 0 },
                { label: "Summary only", value: readiness.notReadyCombinations || 0 }
              ]}
              labelKey="label"
              valueKey="value"
              valueFormatter={(value) => formatNumber(value)}
              emptyText="Upload sales data to see readiness."
            />
          </div>
        </section>

        <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Detected context</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(dataQuality?.detectedOptionalFields || []).map((field) => (
              <span key={field} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-sm text-slate-700">{field}</span>
            ))}
            {!dataQuality?.detectedOptionalFields?.length && <p className="text-sm text-slate-500">No optional pricing context detected yet.</p>}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Regions</p>
              <p className="mt-1 text-sm font-medium">{dataQuality?.optionalValues?.regions?.join(", ") || "Not available"}</p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase text-slate-500">Channels</p>
              <p className="mt-1 text-sm font-medium">{dataQuality?.optionalValues?.channels?.join(", ") || "Not available"}</p>
            </div>
          </div>
        </section>

        <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Imported files</h3>
          <div className="mt-3 grid gap-2">
            {(dataQuality?.sources || []).map((source) => (
              <div key={source.source} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="truncate text-sm font-medium text-slate-900">{source.source}</p>
                <p className="mt-1 text-xs text-slate-500">{formatNumber(source.rows)} rows - {formatCurrency(source.revenue, currency)}</p>
              </div>
            ))}
            {!dataQuality?.sources?.length && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No imported files yet.</p>}
          </div>
        </section>

        <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Warnings and next data needed</h3>
          <div className="mt-3 grid gap-2">
            {warnings.map((warning) => (
              <p key={warning} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{warning}</p>
            ))}
            {!warnings.length && <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">No major data quality warning detected.</p>}
          </div>
        </section>
      </div>
    </section>
  );
}

export function ProductMatchingPanel({ duplicatesData, duplicatesState, duplicatesMessage, refreshProductDuplicates, handleMergeProducts }) {
  const duplicates = duplicatesData?.duplicates || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <GitBranch size={20} />
          <div>
            <h2 className="text-base font-semibold">Product Matching Review</h2>
            <p className="mt-1 text-sm text-slate-500">Review likely duplicate products before they fragment pricing analysis.</p>
          </div>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshProductDuplicates} type="button">
          Refresh
        </button>
      </div>

      {duplicatesMessage && <p className={`mt-3 text-sm ${duplicatesState === "error" ? "text-rose-700" : "text-slate-500"}`}>{duplicatesMessage}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryCard icon={Package} label="Products Checked" value={formatNumber(duplicatesData?.totalProducts || 0)} note="Master data records" />
        <SummaryCard icon={GitBranch} label="Possible Duplicates" value={formatNumber(duplicates.length)} note="Review before merge" />
        <SummaryCard icon={CheckCircle2} label="Matching Method" value="Manual Review" note="Exact IDs auto-match; fuzzy matches require approval" />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
        <table className="w-full min-w-[1280px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="p-3 font-medium">Keep as Master</th>
              <th className="p-3 font-medium">Possible Duplicate</th>
              <th className="p-3 font-medium">Category</th>
              <th className="p-3 font-medium">Shared ID</th>
              <th className="p-3 font-medium">Name Match</th>
              <th className="p-3 font-medium">Token Overlap</th>
              <th className="p-3 font-medium">Price Range</th>
              <th className="p-3 font-medium">Review Score</th>
              <th className="p-3 font-medium">Shared Tokens</th>
              <th className="p-3 font-medium">Reason</th>
              <th className="p-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {duplicates.map((item) => (
              <tr key={`${item.masterCandidate?._id}-${item.duplicateCandidate?._id}`} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <p className="font-medium text-slate-900">{item.masterCandidate?.name}</p>
                  <p className="text-xs text-slate-500">{item.masterCandidate?.sku || "No SKU"}</p>
                </td>
                <td className="p-3">
                  <p className="font-medium text-slate-900">{item.duplicateCandidate?.name}</p>
                  <p className="text-xs text-slate-500">{item.duplicateCandidate?.sku || "No SKU"}</p>
                </td>
                <td className="p-3 text-slate-600">{item.masterCandidate?.category || item.duplicateCandidate?.category || "Uncategorized"}</td>
                <td className="p-3 text-slate-600">{item.evidence?.sharedIdentity ? "Yes" : "No"}</td>
                <td className="p-3 text-slate-600">{formatPercent(Number(item.evidence?.nameSimilarity || 0) * 100)}</td>
                <td className="p-3 text-slate-600">{formatPercent(Number(item.evidence?.tokenOverlap || 0) * 100)}</td>
                <td className="p-3 text-slate-600">{formatPercent(Number(item.evidence?.priceRangeSimilarity || 0) * 100)}</td>
                <td className="p-3 text-slate-600">{formatPercent(Number(item.reviewScore ?? item.score ?? 0) * 100)}</td>
                <td className="p-3 text-slate-600">{item.evidence?.sharedTokens?.join(", ") || "-"}</td>
                <td className="p-3 text-slate-600">
                  <p>{item.decision || item.reason}</p>
                  {item.confidenceReasons?.length > 0 && (
                    <p className="mt-1 text-xs text-slate-500">{item.confidenceReasons.join(", ")}</p>
                  )}
                </td>
                <td className="p-3">
                  <button
                    className="inline-flex h-9 items-center justify-center rounded-md bg-slate-950 px-3 text-xs font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                    disabled={duplicatesState === "merging"}
                    onClick={() => handleMergeProducts(item.masterCandidate?._id, item.duplicateCandidate?._id)}
                    type="button"
                  >
                    Merge manually
                  </button>
                </td>
              </tr>
            ))}
            {!duplicates.length && (
              <tr>
                <td className="p-6 text-sm text-slate-500" colSpan="11">No suspected duplicates found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
