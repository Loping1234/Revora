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
  SectionHeader,
  SummaryCard,
  TrustStrip,
  WarningPanel
} from "./common";
import { useViewMode } from "../lib/view-mode";
import { DemandCurveChart, SeasonalityHeatmap } from "./charts";

export function PricingInsightsPanel({
  products,
  segmentOptions,
  readiness,
  readinessState,
  readinessMessage,
  refreshReadiness,
  selectedProductId,
  selectedSegment,
  setSelectedProductId,
  setSelectedSegment,
  handleFitModel,
  modelState,
  modelMessage,
  latestModel,
  currency = "USD"
}) {
  const { detailed } = useViewMode();
  const modelWarnings = latestModel?.warnings || [];
  const readyItems = readiness?.ready || [];
  const limitedExamples = readiness?.limitedExamples || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={TrendingUp}
        title="Customer Price Response"
        description="Fit a pricing insight only when sales history has enough repeated rows and changing prices."
        action={(
          <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshReadiness} type="button">
            Refresh readiness
          </button>
        )}
      />

      <section className="mt-4 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase text-slate-500">Ready for insights</p>
            <p className="mt-1 text-xl font-semibold">{formatNumber(readiness?.readyCombinations || 0)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Limited combinations</p>
            <p className="mt-1 text-xl font-semibold">{formatNumber(readiness?.notReadyCombinations || 0)}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-slate-500">Minimum needed</p>
            <p className="mt-1 text-xl font-semibold">{formatNumber(readiness?.minimumRecords || 3)} rows</p>
          </div>
        </div>
        {readinessMessage && <p className={`mt-2 text-sm ${readinessState === "error" ? "text-rose-700" : "text-slate-500"}`}>{readinessMessage}</p>}
      </section>

      <form className="mt-4 shrink-0 grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]" onSubmit={handleFitModel}>
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          onChange={(event) => setSelectedProductId(event.target.value)}
          value={selectedProductId}
        >
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product._id} value={product._id}>
              {product.name} ({product.sku})
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          onChange={(event) => setSelectedSegment(event.target.value)}
          value={selectedSegment}
        >
          {segmentOptions.map((segment) => (
            <option key={segment.value} value={segment.value}>
              {segment.label}
            </option>
          ))}
        </select>

        <button
          className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 lg:w-auto"
          disabled={modelState === "running"}
          type="submit"
        >
          {modelState === "running" ? "Reviewing" : "Create Insight"}
        </button>
      </form>

      {modelMessage && (
        <p className={`mt-3 text-sm ${modelState === "success" ? "text-emerald-700" : "text-rose-700"}`}>
          {modelMessage.replace("Fitted", "Created pricing insight for").replace("using", "from")}
        </p>
      )}

      {latestModel && (
        <div className="mt-4 shrink-0">
          <TrustStrip
            items={[
              { label: "Trust decision", value: latestModel.dataFitnessLabel || latestModel.resultMode || "Not scored" },
              { label: "Model reliability", value: latestModel.modelReliabilityLabel || latestModel.reliabilityLabel || "Weak" },
              { label: "Data fitness", value: `${latestModel.dataFitnessScore ?? 0}/100` },
              { label: "Cost quality", value: latestModel.costQuality?.label || "Unknown" },
              { label: "Backtest", value: latestModel.modelErrorSummary?.available ? `${Number(latestModel.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}% worst error` : "Not enough history" }
            ]}
          />
        </div>
      )}

      {latestModel && (
        <div className="mt-4 grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {latestModel.resultMode && latestModel.resultMode !== "Price Response Model" && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Result mode</p>
              <p className={`mt-1 inline-flex rounded-md px-2 py-1 text-lg font-semibold ${getResultModeStyles(latestModel.resultMode)}`}>
                {latestModel.resultMode}
              </p>
            </div>
          )}
          {latestModel.resultMode !== "Price Response Model" && latestModel.summaryMetrics && (
            <>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-500">Sales rows</p>
                <p className="mt-1 text-xl font-semibold">{latestModel.summaryMetrics.usableRows || latestModel.summaryMetrics.rawRows || 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-500">Revenue</p>
                <p className="mt-1 text-xl font-semibold">{formatCurrency(latestModel.summaryMetrics.revenue, currency)}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-500">Price levels</p>
                <p className="mt-1 text-xl font-semibold">{latestModel.summaryMetrics.distinctPriceCount || 0}</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-500">Demand points</p>
                <p className="mt-1 text-xl font-semibold">{latestModel.summaryMetrics.groupedDemandPoints || 0}</p>
              </div>
            </>
          )}
          {latestModel.resultMode !== "Business Summary Only" && (
            <>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Model used</p>
            <p className="mt-1 text-lg font-semibold">{latestModel.modelType === "context-adjusted" ? "Context-Adjusted" : latestModel.modelType === "log-log" ? "Log-Log Elasticity" : "Simple Price Response"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Model reliability</p>
            <p className={`mt-1 inline-flex rounded-md px-2 py-1 text-lg font-semibold ${getReliabilityStyles(latestModel.modelReliabilityLabel || latestModel.reliabilityLabel)}`}>
              <ExplainableNumber lines={[
                `${latestModel.groupedDemandPoints || latestModel.recordsUsed || 0} grouped demand points.`,
                `${latestModel.distinctPriceCount || 0} different price levels.`,
                latestModel.modelErrorSummary?.available ? `Backtest worst error: ${Number(latestModel.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}%.` : "Backtest unavailable.",
                ...(latestModel.modelReliabilityReasons || latestModel.reliabilityReasons || []).slice(0, 2)
              ]}>
                {latestModel.modelReliabilityLabel || latestModel.reliabilityLabel || "Weak"}
              </ExplainableNumber>
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Price sensitivity</p>
            <p className="mt-1 text-xl font-semibold">
              <ExplainableNumber lines={[
                `Price response strength: ${Number(latestModel.b || 0).toFixed(4)}.`,
                "This indicates how strongly quantity changes when price changes."
              ]}>
                {getPriceSensitivityLabel(latestModel)}
              </ExplainableNumber>
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Model evidence</p>
            <p className="mt-1 text-xl font-semibold">
              <ExplainableNumber lines={[
                `Historical fit score: ${Number(latestModel.rSquared || 0).toFixed(3)}.`,
                "This is evidence from past data, not a guarantee of future accuracy."
              ]}>
                {getConfidenceLabel(latestModel)}
              </ExplainableNumber>
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Demand points</p>
            <p className="mt-1 text-xl font-semibold">
              <ExplainableNumber lines={[
                "Grouped by product + customer group + date + price.",
                `Raw rows used: ${latestModel.rawRowsUsed || latestModel.recordsUsed || 0}.`
              ]}>
                {latestModel.groupedDemandPoints || latestModel.recordsUsed}
              </ExplainableNumber>
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Readiness gate</p>
            <p className="mt-1 text-lg font-semibold">{latestModel.readinessLevel || "Simple model ready"}</p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase text-slate-500">Data fitness</p>
            <p className="mt-1 text-lg font-semibold">{latestModel.dataFitnessLabel || "Recommendation blocked"}</p>
            <p className="mt-1 text-xs text-slate-500">{latestModel.dataFitnessScore ?? 0}/100</p>
          </div>
            </>
          )}
        </div>
      )}

      {detailed && latestModel && latestModel.resultMode === "Price Response Model" && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-900">Decision supported</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This tells whether customers reduce buying when price increases. The model uses grouped demand points, not raw transaction rows, so repeated sales at the same product, date, customer group, and price are treated as one demand signal.
          </p>
          {(latestModel.modelReliabilityReasons || latestModel.reliabilityReasons)?.length > 0 && (
            <div className="mt-3 grid gap-1 text-sm text-slate-600">
              {(latestModel.modelReliabilityReasons || latestModel.reliabilityReasons).map((reason) => <p key={reason}>{reason}</p>)}
            </div>
          )}
          {(latestModel.blockedReasons?.length > 0 || latestModel.dataFitnessWarnings?.length > 0) && (
            <div className="mt-3 grid gap-1 text-sm text-amber-800">
              {[...(latestModel.blockedReasons || []), ...(latestModel.dataFitnessWarnings || [])].slice(0, 5).map((reason) => <p key={reason}>{reason}</p>)}
            </div>
          )}
        </div>
      )}

      {detailed && latestModel?.modelComparison && latestModel.resultMode === "Price Response Model" && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-medium text-slate-900">Model comparison</p>
              <p className="mt-1 text-sm text-slate-600">{latestModel.modelComparison.selectedReason}</p>
            </div>
            <span className={`rounded-md px-2 py-1 text-xs font-semibold ${latestModel.modelFamily === "context_adjusted" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>
              {latestModel.modelFamily === "context_adjusted" ? "Context adjusted" : "Simple price response"}
            </span>
          </div>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {(latestModel.modelComparison.models || []).map((model) => (
              <div key={model.modelType} className={`rounded-md border p-3 ${model.selected ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
                <p className="text-sm font-semibold text-slate-900">{model.modelType === "context-adjusted" ? "Context-adjusted" : model.modelType === "log-log" ? "Log-log" : "Linear"}</p>
              <p className="mt-1 text-xs text-slate-500">Historical fit {Number(model.rSquared || 0).toFixed(3)}</p>
                <p className="mt-1 text-xs text-slate-500">{(model.featuresUsed || []).join(", ")}</p>
              </div>
            ))}
          </div>
          {latestModel.featuresUsed?.length > 0 && (
            <p className="mt-3 text-sm text-slate-600">Features used: {latestModel.featuresUsed.join(", ")}</p>
          )}
          {(latestModel.backtestMetrics || latestModel.accuracyMetrics)?.available ? (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Accuracy check on held-out sales</p>
              <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                <p>Train rows: {(latestModel.backtestMetrics || latestModel.accuracyMetrics).trainRows}</p>
                <p>Test rows: {(latestModel.backtestMetrics || latestModel.accuracyMetrics).testRows}</p>
                <p>Model tested: {(latestModel.backtestMetrics || latestModel.accuracyMetrics).trainedModelType}</p>
                <p>Demand error: {Number((latestModel.backtestMetrics || latestModel.accuracyMetrics).demandMAPE || 0).toFixed(1)}%</p>
                <p>Revenue error: {Number((latestModel.backtestMetrics || latestModel.accuracyMetrics).revenueMAPE || 0).toFixed(1)}%</p>
                <p>Profit error: {Number((latestModel.backtestMetrics || latestModel.accuracyMetrics).profitMAPE || 0).toFixed(1)}%</p>
              </div>
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Accuracy check unavailable: {(latestModel.backtestMetrics || latestModel.accuracyMetrics)?.reason || "not enough held-out demand points yet."}
            </p>
          )}
          {(() => {
            const bc = (latestModel.backtestMetrics || latestModel.accuracyMetrics)?.baselineComparison;
            if (!bc?.available) return null;
            const modelMAPE = Number((latestModel.backtestMetrics || latestModel.accuracyMetrics).demandMAPE || 0);
            return (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">Baseline comparison</p>
                <p className="mt-1 text-xs text-slate-500">Does the model beat simple guessing? Compared on the same held-out sales rows.</p>
                <div className={`mt-2 rounded-md px-3 py-2 text-sm font-medium ${bc.modelBeatsBaseline ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-rose-200 bg-rose-50 text-rose-800"}`}>
                  {bc.modelBeatsBaseline
                    ? `Model beats the best naive baseline (${bc.bestBaselineLabel}) by ${Number(bc.improvementPercent || 0).toFixed(1)}%.`
                    : `Model did NOT outperform the ${bc.bestBaselineLabel} baseline. Recommendations are blocked until the model can prove it adds value over simple guessing.`}
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="py-2 pr-3 font-medium">Method</th>
                        <th className="py-2 pr-3 font-medium">Demand Error</th>
                        <th className="py-2 pr-3 font-medium">Revenue Error</th>
                        <th className="py-2 pr-3 font-medium">vs Model</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(bc.baselines || []).map((baseline) => (
                        <tr key={baseline.name} className="border-b border-slate-100 last:border-0">
                          <td className="py-2 pr-3 font-medium text-slate-900">{baseline.label}</td>
                          <td className="py-2 pr-3 text-slate-600">{Number(baseline.demandMAPE || 0).toFixed(1)}%</td>
                          <td className="py-2 pr-3 text-slate-600">{Number(baseline.revenueMAPE || 0).toFixed(1)}%</td>
                          <td className="py-2 pr-3">{modelMAPE <= baseline.demandMAPE ? <span className="text-emerald-700">Model wins ✓</span> : <span className="text-rose-700">Baseline wins</span>}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-slate-300">
                        <td className="py-2 pr-3 font-semibold text-slate-900">Your Model</td>
                        <td className="py-2 pr-3 font-semibold text-slate-900">{modelMAPE.toFixed(1)}%</td>
                        <td className="py-2 pr-3 font-semibold text-slate-900">{Number((latestModel.backtestMetrics || latestModel.accuracyMetrics).revenueMAPE || 0).toFixed(1)}%</td>
                        <td className="py-2 pr-3 text-slate-400">—</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
          {latestModel.predictionIntervals?.demand && (
            <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">Prediction range at average price</p>
              <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                <p>Demand: {latestModel.predictionIntervals.demand.low} to {latestModel.predictionIntervals.demand.high} units</p>
                <p>Revenue: {formatCurrency(latestModel.predictionIntervals.revenue.low, currency)} to {formatCurrency(latestModel.predictionIntervals.revenue.high, currency)}</p>
                <p>Profit: {formatCurrency(latestModel.predictionIntervals.profit.low, currency)} to {formatCurrency(latestModel.predictionIntervals.profit.high, currency)}</p>
              </div>
            </div>
          )}
          {latestModel.mlReadiness && (
            <div className={`mt-3 rounded-md border p-3 text-sm ${latestModel.mlReadiness.ready ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
              <p className="font-medium">{latestModel.mlReadiness.ready ? "Advanced ML model candidate" : "Advanced ML not used"}</p>
              <p className="mt-1">{latestModel.mlReadiness.message}</p>
            </div>
          )}
          {latestModel.limitations?.length > 0 && (
            <div className="mt-3 grid gap-1 text-sm text-amber-800">
              {latestModel.limitations.map((limitation) => <p key={limitation}>{limitation}</p>)}
            </div>
          )}
        </div>
      )}

      {latestModel?.resultMode === "Business Summary Only" && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-950">No model fitted, but a business summary is available</p>
          <p className="mt-2 text-sm leading-6 text-amber-900">
            This product has sales history, but not enough grouped demand points with changing prices to estimate customer price response honestly.
          </p>
          {latestModel.blockingReasons?.length > 0 && (
            <div className="mt-3 grid gap-1 text-sm text-amber-900">
              {latestModel.blockingReasons.map((reason) => <p key={reason}>{reason}</p>)}
            </div>
          )}
          <p className="mt-3 text-sm font-medium text-amber-950">{latestModel.suggestedNextData}</p>
        </div>
      )}

      {latestModel?.resultMode === "Price Response Model" && modelWarnings.length > 0 && (
      <div className="mt-4">
          <WarningPanel
            title="Insight quality warning"
            warnings={modelWarnings}
          />
        </div>
      )}

      <div className="mt-4 grid gap-3 xl:grid-cols-2">
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Combinations that can create insights</h3>
          <p className="mt-1 text-xs text-slate-500">These product/customer groups have at least 3 sales rows.</p>
          <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto pr-1">
            {readyItems.map((item) => (
              <button
                key={`${item.productId}-${item.segment}`}
                className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:border-slate-300 hover:bg-white"
                onClick={() => {
                  setSelectedProductId(item.productId);
                  setSelectedSegment(item.segment);
                }}
                type="button"
              >
                <span className="block truncate font-medium text-slate-900">{item.name}</span>
                <span className="mt-1 block text-xs text-slate-500">{item.sku} - {item.segmentLabel} - {item.records} rows</span>
              </button>
            ))}
            {!readyItems.length && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">No product/customer group has enough repeated rows yet.</p>}
          </div>
        </section>

        {detailed && (
        <section className="rounded-md border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Why some insights fail</h3>
          <p className="mt-1 text-xs text-slate-500">These examples have only 1-2 rows, so the model correctly refuses to fit.</p>
          <div className="mt-3 grid max-h-[520px] gap-2 overflow-auto pr-1">
            {limitedExamples.map((item) => (
              <p key={`${item.productId}-${item.segment}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <span className="font-medium">{item.name}</span> - {item.segmentLabel} has {item.records} row{item.records === 1 ? "" : "s"}
              </p>
            ))}
            {!limitedExamples.length && <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">Limited combinations will appear here after sales data is imported.</p>}
          </div>
        </section>
        )}
      </div>

      {latestModel?.resultMode === "Price Response Model" && (
        <div className="mt-4">
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">Price vs demand curve</p>
            <p className="mt-1 text-xs text-slate-500">Dots are actual grouped demand points. The line is the fitted model prediction.</p>
            <div className="mt-3">
              <DemandCurveChart model={latestModel} currency={currency} />
            </div>
          </div>
          <CalculationWorkingPanel
            title="Show working"
            defaultOpen
            summary="The model first converts raw sales rows into grouped demand points, then fits a price-response formula only if there is enough price variation."
            items={[
              { label: "Formula", value: latestModel.formulaText || "Estimated demand from price response model" },
              { label: "Raw rows", value: latestModel.rawRowsUsed || latestModel.recordsUsed || 0 },
              { label: "Grouped points", value: latestModel.groupedDemandPoints || latestModel.recordsUsed || 0 },
              { label: "Price levels", value: latestModel.distinctPriceCount || 0 },
              { label: "Price range", value: `${formatCurrency(latestModel.priceRangeMin, currency)} to ${formatCurrency(latestModel.priceRangeMax, currency)}` },
              { label: "Demand range", value: `${Number(latestModel.demandRangeMin || 0).toFixed(2)} to ${Number(latestModel.demandRangeMax || 0).toFixed(2)} units` },
              { label: "Average price", value: formatCurrency(latestModel.averagePrice, currency) },
              { label: "Average demand", value: `${Number(latestModel.averageDemand || 0).toFixed(2)} units` }
            ]}
            formulas={[
              `Historical fit score = ${Number(latestModel.rSquared || 0).toFixed(3)}.`,
              `Price response strength = ${Number(latestModel.b || 0).toFixed(4)}.`,
              `Excluded rows = ${latestModel.excludedRows || 0}.`
            ]}
            evidence={[
              `Reliability score: ${latestModel.reliabilityScore || 0}/100.`,
              latestModel.modelErrorSummary?.available ? `Backtest worst error: ${Number(latestModel.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}%.` : "Backtest not available."
            ]}
          />
        </div>
      )}
    </section>
  );
}

export function SeasonalityPanel({ seasonality, state, message, refreshSeasonality, currency }) {
  const monthly = seasonality?.monthly || [];
  const promotionSplit = seasonality?.promotionSplit || [];
  const weekendSplit = seasonality?.weekendSplit || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <CalendarDays size={20} />
          <h2 className="text-base font-semibold">Seasonality & Promotion</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshSeasonality} type="button">
          Refresh
        </button>
      </div>
      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className={`mt-4 rounded-lg border p-4 ${seasonality?.reliability === "Usable" ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className={`text-sm font-medium ${seasonality?.reliability === "Usable" ? "text-emerald-900" : "text-amber-900"}`}>
          {seasonality?.message || "Upload data with dates to inspect seasonality."}
        </p>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4 xl:col-span-2">
          <h3 className="text-sm font-semibold text-slate-900">Demand index by month</h3>
          <p className="mt-1 text-xs text-slate-500">100 means average monthly demand. Higher means stronger demand month.</p>
          <div className="mt-4">
            <SeasonalityHeatmap data={monthly} />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Promotion split</h3>
          <div className="mt-4">
            <HorizontalBars items={promotionSplit} labelKey="label" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No promotion flags detected." />
          </div>
        </section>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Monthly detail</h3>
          <table className="mt-3 w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3 font-medium">Month</th>
                <th className="py-2 pr-3 font-medium">Rows</th>
                <th className="py-2 pr-3 font-medium">Units</th>
                <th className="py-2 pr-3 font-medium">Revenue</th>
                <th className="py-2 pr-3 font-medium">Promos</th>
                <th className="py-2 pr-3 font-medium">Index</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map((item) => (
                <tr key={item.month} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium text-slate-900">{item.month}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatNumber(item.rows)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatNumber(item.units)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatCurrency(item.revenue, currency)}</td>
                  <td className="py-2 pr-3 text-slate-600">{formatNumber(item.promotionRows)}</td>
                  <td className="py-2 pr-3 text-slate-600">{Number(item.demandIndex).toFixed(1)}</td>
                </tr>
              ))}
              {!monthly.length && <tr><td className="py-5 text-sm text-slate-500" colSpan="6">No monthly data available.</td></tr>}
            </tbody>
          </table>
        </section>
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">Weekend vs weekday</h3>
          <div className="mt-4">
            <HorizontalBars items={weekendSplit} labelKey="label" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No weekday/weekend split available." />
          </div>
          {seasonality?.limitations?.length > 0 && (
            <div className="mt-4 grid gap-2">
              {seasonality.limitations.map((limitation) => <p key={limitation} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">{limitation}</p>)}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
