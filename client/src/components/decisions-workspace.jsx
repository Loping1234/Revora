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
  TrustBadge,
  TrustStrip,
  WarningPanel
} from "./common";
import { useViewMode } from "../lib/view-mode";
import { ScenarioComparisonChart } from "./charts";

function formatImprovementRange(range, fallback) {
  if (range && Number.isFinite(Number(range.low)) && Number.isFinite(Number(range.high))) {
    return `${Number(range.low).toFixed(1)}% to ${Number(range.high).toFixed(1)}%`;
  }

  return formatPercent(fallback);
}

function workingFormulaLines(working) {
  if (!working) return [];

  return [
    working.finalDemandFormula ? `Demand: ${working.finalDemandFormula}` : null,
    working.revenueFormula ? `Revenue: ${working.revenueFormula}` : null,
    working.profitFormula ? `Profit: ${working.profitFormula}` : null
  ].filter(Boolean);
}

function workingEvidenceLines(result) {
  return [
    result?.evidenceSummary ? `${result.evidenceSummary.groupedDemandPoints} grouped demand points, ${result.evidenceSummary.distinctPrices} price levels.` : null,
    result?.modelErrorSummary?.available ? `Backtest worst error: ${Number(result.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}%.` : null,
    result?.profitUsesEstimatedCost ? "Profit uses estimated cost." : null
  ].filter(Boolean);
}

export function PriceSimulatorPanel({
  products,
  segmentOptions,
  currency,
  simulatorProductId,
  setSimulatorProductId,
  simulatorSegment,
  setSimulatorSegment,
  simulatorPrice,
  setSimulatorPrice,
  simulatorCompetitorPrice,
  setSimulatorCompetitorPrice,
  simulationState,
  simulationMessage,
  simulationResult,
  handleSimulatePrice
}) {
  const { detailed } = useViewMode();
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={Calculator}
        title="Test a Price"
        description="Estimate demand, revenue, and profit for one chosen price using the current pricing model."
      />

      <form className="mt-4 shrink-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_160px_180px_auto]" onSubmit={handleSimulatePrice}>
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          onChange={(event) => setSimulatorProductId(event.target.value)}
          value={simulatorProductId}
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
          onChange={(event) => setSimulatorSegment(event.target.value)}
          value={simulatorSegment}
        >
          {segmentOptions.map((segment) => (
            <option key={segment.value} value={segment.value}>
              {segment.label}
            </option>
          ))}
        </select>

        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setSimulatorPrice(event.target.value)}
          placeholder="Test price"
          step="0.01"
          type="number"
          value={simulatorPrice}
        />

        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setSimulatorCompetitorPrice(event.target.value)}
          placeholder="Competitor price"
          step="0.01"
          type="number"
          value={simulatorCompetitorPrice}
        />

        <button
          className="inline-flex h-10 w-full min-w-28 items-center justify-center whitespace-nowrap rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 xl:w-auto"
          disabled={simulationState === "running"}
          type="submit"
        >
          {simulationState === "running" ? "Testing" : "Run Test"}
        </button>
      </form>

      {simulationMessage && (
        <p className={`mt-3 text-sm ${simulationState === "success" ? "text-emerald-700" : "text-rose-700"}`}>
          {simulationMessage}
        </p>
      )}

      {simulationResult && (
        <div className="mt-4 grid gap-3 pr-1">
          <TrustStrip
            items={[
              { label: "Decision", value: simulationResult.decisionLabel || "Use with caution" },
              { label: "Model reliability", value: simulationResult.resultReliability?.label || "Weak" },
              { label: "Data fitness", value: simulationResult.dataFitnessLabel || "Not scored" },
              { label: "Backtest", value: simulationResult.modelErrorSummary?.available ? `${Number(simulationResult.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}% worst error` : "Not enough history" }
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Estimated demand</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  simulationResult.demandWorking?.finalDemandFormula,
                  simulationResult.demandWorking?.plainEnglish
                ]}>
                  {simulationResult.expectedDemand} units
                </ExplainableNumber>
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Estimated revenue</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  simulationResult.demandWorking?.revenueFormula,
                  "Revenue = tested price x estimated demand."
                ]}>
                  {formatCurrency(simulationResult.expectedRevenue, currency)}
                </ExplainableNumber>
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Estimated profit</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  simulationResult.demandWorking?.profitFormula,
                  "Profit = (tested price - product cost) x estimated demand.",
                  simulationResult.profitUsesEstimatedCost ? "Warning: product cost is estimated." : null
                ]}>
                  {formatCurrency(simulationResult.expectedProfit, currency)}
                </ExplainableNumber>
              </p>
              {simulationResult.profitUsesEstimatedCost && <div className="mt-2"><TrustBadge label="Profit uses estimated cost" /></div>}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Customer response</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  `Price response score: ${simulationResult.elasticity ?? "Not available"}.`,
                  "Higher sensitivity means demand changes more strongly when price changes."
                ]}>
                  {simulationResult.priceSensitivity}
                </ExplainableNumber>
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Decision supported</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">This estimates revenue and profit at one chosen price, using the fitted customer price response model.</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">What evidence supports this?</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-1 text-sm font-semibold ${getReliabilityStyles(simulationResult.decisionLabel)}`}>
                  {simulationResult.decisionLabel || "Use with caution"}
                </span>
                <span className={`rounded-md px-2 py-1 text-sm font-semibold ${getReliabilityStyles(simulationResult.resultReliability?.label)}`}>
                  {simulationResult.resultReliability?.label || "Weak"} model
                </span>
                {simulationResult.readinessLevel && <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{simulationResult.readinessLevel}</span>}
                {simulationResult.dataFitnessLabel && <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{simulationResult.dataFitnessLabel}</span>}
              </div>
              {simulationResult.resultReliability?.reasons?.length > 0 && <p className="mt-2 text-sm text-slate-600">{simulationResult.resultReliability.reasons[0]}</p>}
              {simulationResult.evidenceSummary && (
                <p className="mt-2 text-sm text-slate-600">
                  Evidence: {simulationResult.evidenceSummary.groupedDemandPoints} grouped points, {simulationResult.evidenceSummary.distinctPrices} price levels, {simulationResult.evidenceSummary.backtest}.
                </p>
              )}
              {simulationResult.modelErrorSummary?.available && <p className="mt-2 text-sm text-slate-600">Backtest worst error: {Number(simulationResult.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}%</p>}
            </div>
          </div>

          {simulationResult.predictionRange?.demand && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Estimated range, not just one number</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Demand: {simulationResult.predictionRange.demand.low} to {simulationResult.predictionRange.demand.high} units</p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Revenue: {formatCurrency(simulationResult.predictionRange.revenue.low, currency)} to {formatCurrency(simulationResult.predictionRange.revenue.high, currency)}</p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Profit: {formatCurrency(simulationResult.predictionRange.profit.low, currency)} to {formatCurrency(simulationResult.predictionRange.profit.high, currency)}</p>
              </div>
            </div>
          )}

          {detailed && simulationResult.demandWorking && (
            <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600" open>
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Show working</summary>
              <div className="mt-3 grid gap-4">
                <p className="leading-6">{simulationResult.demandWorking.plainEnglish}</p>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Model used</p>
                    <p className="mt-1 font-semibold text-slate-900">{simulationResult.demandWorking.modelType}</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Starting demand</p>
                    <p className="mt-1 font-semibold text-slate-900">
                      <ExplainableNumber lines={[
                        simulationResult.demandWorking.baselineFormula,
                        simulationResult.demandWorking.baselineExplanation
                      ]}>
                        {simulationResult.demandWorking.baselineDemand ?? "Not shown"} units
                      </ExplainableNumber>
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Final demand</p>
                    <p className="mt-1 font-semibold text-slate-900">{simulationResult.demandWorking.finalDemand} units</p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Product cost used</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatCurrency(simulationResult.product?.cost || 0, currency)}</p>
                  </div>
                </div>

                {(simulationResult.demandWorking.baselineFormula || simulationResult.demandWorking.baselineExplanation) && (
                  <div className="rounded-md border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase text-slate-500">How baseline demand was calculated</p>
                    {simulationResult.demandWorking.baselineFormula && (
                      <p className="mt-2 font-semibold text-slate-900">{simulationResult.demandWorking.baselineFormula}</p>
                    )}
                    {simulationResult.demandWorking.baselineExplanation && (
                      <p className="mt-1 leading-6">{simulationResult.demandWorking.baselineExplanation}</p>
                    )}
                  </div>
                )}

                {simulationResult.demandWorking.adjustments?.length > 0 && (
                  <div className="overflow-x-auto rounded-md border border-slate-100">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Factor</th>
                          <th className="px-3 py-2">Value used</th>
                          <th className="px-3 py-2">Historical average</th>
                          <th className="px-3 py-2">Demand change</th>
                          <th className="px-3 py-2">Meaning</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {simulationResult.demandWorking.adjustments.map((row) => (
                          <tr key={`${row.feature}-${row.source}`}>
                            <td className="px-3 py-2 font-medium text-slate-900">{row.feature}</td>
                            <td className="px-3 py-2">{row.value}</td>
                            <td className="px-3 py-2">{row.historicalAverage ?? "Not applicable"}</td>
                            <td className={`px-3 py-2 font-semibold ${Number(row.adjustment) < 0 ? "text-rose-700" : Number(row.adjustment) > 0 ? "text-emerald-700" : "text-slate-600"}`}>
                              {Number(row.adjustment) > 0 ? "+" : ""}{row.adjustment} units
                            </td>
                            <td className="px-3 py-2">{row.explanation}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid gap-2 rounded-md bg-slate-50 p-3">
                  <p><span className="font-semibold text-slate-900">Demand:</span> {simulationResult.demandWorking.finalDemandFormula}</p>
                  <p><span className="font-semibold text-slate-900">Revenue:</span> {simulationResult.demandWorking.revenueFormula}</p>
                  <p><span className="font-semibold text-slate-900">Profit:</span> {simulationResult.demandWorking.profitFormula}</p>
                </div>
              </div>
            </details>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">Business explanation</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{simulationResult.explanation}</p>
          </div>

          <WarningPanel warnings={simulationResult.warnings} />

          {detailed && (
          <details className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-800">How this was calculated</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <p>Model: {simulationResult.modelType === "log-log" ? "Log-Log Elasticity Model" : "Simple Price Response Model"}</p>
              <p>Model reliability: {simulationResult.modelReliabilityLabel || simulationResult.confidence}</p>
              <p>Records used: {simulationResult.model?.recordsUsed || simulationResult.summaryMetrics?.usableRows || 0}</p>
              <p>Raw rows used: {simulationResult.model?.rawRowsUsed || simulationResult.summaryMetrics?.rawRows || 0}</p>
              <p>Grouped demand points: {simulationResult.model?.groupedDemandPoints || simulationResult.summaryMetrics?.groupedDemandPoints || 0}</p>
              <p>Different prices: {simulationResult.model?.distinctPriceCount || simulationResult.summaryMetrics?.distinctPriceCount || 0}</p>
              {simulationResult.model?.accuracyMetrics?.available && <p>Holdout demand error: {Number(simulationResult.model.accuracyMetrics.demandMAPE || 0).toFixed(1)}%</p>}
              {simulationResult.model?.priceRange && <p>Historical price range: {formatCurrency(simulationResult.model.priceRange?.min, currency)} to {formatCurrency(simulationResult.model.priceRange?.max, currency)}</p>}
              <p>Price response score: {simulationResult.elasticity ?? "Not available"}</p>
              <p>{simulationResult.modelCreated ? "Pricing insight was created automatically." : "Existing pricing insight was used."}</p>
            </div>
            {simulationResult.calculationSteps?.length > 0 && (
              <div className="mt-3 grid gap-1">
                {simulationResult.calculationSteps.map((step) => <p key={step}>{step}</p>)}
              </div>
            )}
            {simulationResult.calculationBreakdown && (
              <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3">
                <p>Demand formula: {simulationResult.calculationBreakdown.demandFormula}</p>
                <p>Revenue formula: {simulationResult.calculationBreakdown.revenueFormula}</p>
                <p>Profit formula: {simulationResult.calculationBreakdown.profitFormula}</p>
              </div>
            )}
          </details>
          )}
        </div>
      )}
    </section>
  );
}

export function ScenarioPlannerPanel({
  products,
  segmentOptions,
  currency,
  scenarioProductId,
  setScenarioProductId,
  scenarioSegment,
  setScenarioSegment,
  scenarioPrices,
  setScenarioPrices,
  scenarioCompetitorPrice,
  setScenarioCompetitorPrice,
  scenarioState,
  scenarioMessage,
  scenarioResult,
  handlePlanScenarios
}) {
  function updateScenarioPrice(index, value) {
    setScenarioPrices((current) => current.map((item, itemIndex) => (itemIndex === index ? value : item)));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={PieChart}
        title="Scenario Planner"
        description="Compare up to three prices side by side before creating a formal recommendation."
      />

      <form className="mt-4 shrink-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_170px_repeat(3,130px)_160px_auto]" onSubmit={handlePlanScenarios}>
        <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => setScenarioProductId(event.target.value)} value={scenarioProductId}>
          <option value="">Select product</option>
          {products.map((product) => (
            <option key={product._id} value={product._id}>{product.name} ({product.sku})</option>
          ))}
        </select>
        <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700" onChange={(event) => setScenarioSegment(event.target.value)} value={scenarioSegment}>
          {segmentOptions.map((segment) => <option key={segment.value} value={segment.value}>{segment.label}</option>)}
        </select>
        {scenarioPrices.map((price, index) => (
          <input
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
            key={index}
            min="0"
            onChange={(event) => updateScenarioPrice(index, event.target.value)}
            placeholder={`Price ${index + 1}`}
            step="0.01"
            type="number"
            value={price}
          />
        ))}
        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setScenarioCompetitorPrice(event.target.value)}
          placeholder="Competitor"
          step="0.01"
          type="number"
          value={scenarioCompetitorPrice}
        />
        <button className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={scenarioState === "running"} type="submit">
          {scenarioState === "running" ? "Comparing" : "Compare"}
        </button>
      </form>

      {scenarioMessage && <p className={`mt-3 text-sm ${scenarioState === "success" ? "text-emerald-700" : "text-rose-700"}`}>{scenarioMessage}</p>}

      {scenarioResult && (
        <div className="mt-4 grid gap-4">
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">Decision supported</p>
            <p className="mt-2 text-sm text-slate-600">{scenarioResult.decisionSupported}</p>
          </section>

          {scenarioResult?.scenarios?.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-semibold text-slate-900">Scenario comparison</p>
              <div className="mt-4">
                <ScenarioComparisonChart scenarios={scenarioResult.scenarios} currency={currency} />
              </div>
            </div>
          )}

          <div className="grid gap-4 xl:grid-cols-3">
            {scenarioResult.scenarios.map((scenario) => (
              <article key={`${scenario.label}-${scenario.price}`} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{scenario.label}</p>
                    <p className="mt-1 text-2xl font-semibold">{formatCurrency(scenario.price, currency)}</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${getReliabilityStyles(scenario.decisionLabel)}`}>{scenario.decisionLabel}</span>
                </div>
                <div className="mt-4 grid gap-3">
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Demand</p>
                    <p className="mt-1 text-lg font-semibold">
                      <ExplainableNumber lines={[scenario.demandWorking?.finalDemandFormula, scenario.demandWorking?.plainEnglish]}>
                        {scenario.expectedDemand} units
                      </ExplainableNumber>
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Revenue</p>
                    <p className="mt-1 text-lg font-semibold">
                      <ExplainableNumber lines={[scenario.demandWorking?.revenueFormula, "Revenue = scenario price x estimated demand."]}>
                        {formatCurrency(scenario.expectedRevenue, currency)}
                      </ExplainableNumber>
                    </p>
                  </div>
                  <div className="rounded-md bg-slate-50 p-3">
                    <p className="text-xs uppercase text-slate-500">Profit</p>
                    <p className="mt-1 text-lg font-semibold">
                      <ExplainableNumber lines={[scenario.demandWorking?.profitFormula, "Profit = (scenario price - cost) x estimated demand."]}>
                        {formatCurrency(scenario.expectedProfit, currency)}
                      </ExplainableNumber>
                    </p>
                    {scenario.profitUsesEstimatedCost && <div className="mt-2"><TrustBadge label="Profit uses estimated cost" /></div>}
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">{scenario.modelBased ? "Model-based estimate" : "Business summary estimate only"}</p>
                {scenario.warnings?.[0] && <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">{scenario.warnings[0]}</p>}
                <div className="mt-3">
                  <CalculationWorkingPanel
                    title="Show working"
                    summary={scenario.demandWorking?.plainEnglish}
                    items={[
                      { label: "Model", value: scenario.demandWorking?.modelType || (scenario.modelBased ? "Pricing model" : "Summary only") },
                      {
                        label: "Starting demand",
                        value: (
                          <ExplainableNumber lines={[
                            scenario.demandWorking?.baselineFormula,
                            scenario.demandWorking?.baselineExplanation
                          ]}>
                            {scenario.demandWorking?.baselineDemand ?? "Not shown"} units
                          </ExplainableNumber>
                        )
                      },
                      { label: "Final demand", value: `${scenario.demandWorking?.finalDemand ?? scenario.expectedDemand} units` }
                    ]}
                    formulas={[
                      scenario.demandWorking?.baselineFormula ? `Baseline: ${scenario.demandWorking.baselineFormula}` : null,
                      ...workingFormulaLines(scenario.demandWorking)
                    ]}
                    evidence={workingEvidenceLines(scenario)}
                  />
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export function RecommendationPanel({
  products,
  segmentOptions,
  currency,
  recommendationProductId,
  setRecommendationProductId,
  recommendationSegment,
  setRecommendationSegment,
  recommendationObjective,
  setRecommendationObjective,
  recommendationMinPrice,
  setRecommendationMinPrice,
  recommendationMaxPrice,
  setRecommendationMaxPrice,
  recommendationStep,
  setRecommendationStep,
  recommendationCompetitorPrice,
  setRecommendationCompetitorPrice,
  recommendationState,
  recommendationMessage,
  recommendationResult,
  handleCreateRecommendation
}) {
  const { detailed } = useViewMode();
  const topTestedPrices = recommendationResult?.testedPrices
    ? [...recommendationResult.testedPrices]
        .sort((a, b) => {
          const key = recommendationResult.objective === "revenue" ? "expectedRevenue" : recommendationResult.objective === "clear_inventory" ? "expectedDemand" : "expectedProfit";
          return b[key] - a[key];
        })
        .slice(0, 5)
    : [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeader
        icon={Target}
        title="Find the Best Price"
        description="Compare candidate prices and return a guarded recommendation only when the model can defend it."
      />

      <form className="mt-4 shrink-0 grid gap-3 xl:grid-cols-[minmax(0,1fr)_150px_140px_130px_130px_110px_150px_auto]" onSubmit={handleCreateRecommendation}>
        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          onChange={(event) => setRecommendationProductId(event.target.value)}
          value={recommendationProductId}
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
          onChange={(event) => setRecommendationSegment(event.target.value)}
          value={recommendationSegment}
        >
          {segmentOptions.map((segment) => (
            <option key={segment.value} value={segment.value}>
              {segment.label}
            </option>
          ))}
        </select>

        <select
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          onChange={(event) => setRecommendationObjective(event.target.value)}
          value={recommendationObjective}
        >
          {objectiveOptions.map((objective) => (
            <option key={objective.value} value={objective.value}>
              {objective.label}
            </option>
          ))}
        </select>

        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setRecommendationMinPrice(event.target.value)}
          placeholder="Min price"
          step="0.01"
          type="number"
          value={recommendationMinPrice}
        />

        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setRecommendationMaxPrice(event.target.value)}
          placeholder="Max price"
          step="0.01"
          type="number"
          value={recommendationMaxPrice}
        />

        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setRecommendationStep(event.target.value)}
          placeholder="Step"
          step="0.01"
          type="number"
          value={recommendationStep}
        />

        <input
          className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700"
          min="0"
          onChange={(event) => setRecommendationCompetitorPrice(event.target.value)}
          placeholder="Competitor"
          step="0.01"
          type="number"
          value={recommendationCompetitorPrice}
        />

        <button
          className="inline-flex h-10 w-full min-w-32 items-center justify-center whitespace-nowrap rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 xl:w-auto"
          disabled={recommendationState === "running"}
          type="submit"
        >
          {recommendationState === "running" ? "Finding" : "Recommend"}
        </button>
      </form>

      {recommendationMessage && (
        <p className={`mt-3 text-sm ${recommendationState === "success" ? "text-emerald-700" : "text-rose-700"}`}>
          {recommendationMessage}
        </p>
      )}

      {recommendationResult && (
        <div className="mt-4 grid gap-3 pr-1">
          <TrustStrip
            items={[
              { label: "Decision", value: recommendationResult.recommendationStatus || recommendationResult.decisionLabel || "Use with caution" },
              { label: "Model reliability", value: recommendationResult.resultReliability?.label || "Weak" },
              { label: "Data fitness", value: recommendationResult.dataFitnessLabel || "Not scored" },
              { label: "Backtest", value: recommendationResult.modelErrorSummary?.available ? `${Number(recommendationResult.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}% worst error` : "Not enough history" }
            ]}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Recommended price</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  `Selected from ${recommendationResult.testedPriceCount || recommendationResult.testedPrices?.length || 0} tested prices.`,
                  `Objective: ${recommendationResult.objective || "profit"}.`,
                  recommendationResult.optimizationMethod ? `Optimizer: ${recommendationResult.optimizationMethod.replace("_", " ")}.` : null
                ]}>
                  {formatCurrency(recommendationResult.recommendedPrice, currency)}
                </ExplainableNumber>
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Estimated revenue</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  `${recommendationResult.recommendedPrice} x ${recommendationResult.expectedDemand} = ${recommendationResult.expectedRevenue}`,
                  "Revenue = recommended price x estimated demand."
                ]}>
                  {formatCurrency(recommendationResult.expectedRevenue, currency)}
                </ExplainableNumber>
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Estimated profit</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  "Profit = (recommended price - product cost) x estimated demand.",
                  recommendationResult.profitUsesEstimatedCost ? "Warning: profit uses estimated cost." : null
                ]}>
                  {formatCurrency(recommendationResult.expectedProfit, currency)}
                </ExplainableNumber>
              </p>
              {recommendationResult.profitUsesEstimatedCost && <div className="mt-2"><TrustBadge label="Profit uses estimated cost" /></div>}
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs uppercase text-slate-500">Estimated improvement</p>
              <p className="mt-1 text-xl font-semibold">
                <ExplainableNumber lines={[
                  "Improvement compares the selected objective at recommended price against the baseline/current price.",
                  recommendationResult.estimatedImprovementRange ? "Range is derived from prediction uncertainty." : "Single value shown because no prediction range was available."
                ]}>
                  {formatImprovementRange(recommendationResult.estimatedImprovementRange, recommendationResult.improvementPercent)}
                </ExplainableNumber>
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Decision supported</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                This compares many tested prices and selects the best one for your selected business goal.
              </p>
              {recommendationResult.objectiveExplanation && <p className="mt-2 text-sm text-slate-600">{recommendationResult.objectiveExplanation}</p>}
              {recommendationResult.optimizationMethod && <p className="mt-2 text-sm font-medium text-slate-700">Optimizer used: {recommendationResult.optimizationMethod.replace("_", " ")}</p>}
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">What evidence supports this?</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-md px-2 py-1 text-sm font-semibold ${getReliabilityStyles(recommendationResult.decisionLabel)}`}>
                  {recommendationResult.decisionLabel || "Use with caution"}
                </span>
                <span className={`rounded-md px-2 py-1 text-sm font-semibold ${getReliabilityStyles(recommendationResult.resultReliability?.label)}`}>
                  {recommendationResult.resultReliability?.label || "Weak"} model
                </span>
                {recommendationResult.readinessLevel && <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{recommendationResult.readinessLevel}</span>}
                {recommendationResult.dataFitnessLabel && <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700">{recommendationResult.dataFitnessLabel}</span>}
              </div>
              {recommendationResult.resultReliability?.reasons?.length > 0 && <p className="mt-2 text-sm text-slate-600">{recommendationResult.resultReliability.reasons[0]}</p>}
              {recommendationResult.evidenceSummary && (
                <p className="mt-2 text-sm text-slate-600">
                  Evidence: {recommendationResult.evidenceSummary.groupedDemandPoints} grouped points, {recommendationResult.evidenceSummary.distinctPrices} price levels, {recommendationResult.evidenceSummary.backtest}.
                </p>
              )}
              {recommendationResult.modelErrorSummary?.available && <p className="mt-2 text-sm text-slate-600">Backtest worst error: {Number(recommendationResult.modelErrorSummary.worstErrorPercent || 0).toFixed(1)}%</p>}
            </div>
          </div>

          {recommendationResult.predictionRange?.demand && (
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-sm font-medium text-slate-900">Recommendation range</p>
              <p className="mt-1 text-xs text-slate-500">The app shows a likely range because pricing predictions are never exact.</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Demand: {recommendationResult.predictionRange.demand.low} to {recommendationResult.predictionRange.demand.high} units</p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Revenue: {formatCurrency(recommendationResult.predictionRange.revenue.low, currency)} to {formatCurrency(recommendationResult.predictionRange.revenue.high, currency)}</p>
                <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-600">Profit: {formatCurrency(recommendationResult.predictionRange.profit.low, currency)} to {formatCurrency(recommendationResult.predictionRange.profit.high, currency)}</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">Business explanation</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{recommendationResult.explanation}</p>
          </div>

          <WarningPanel warnings={recommendationResult.warnings} />
          <WarningPanel title="Recommendation guardrails" warnings={recommendationResult.guardrailWarnings} />

          {(recommendationResult.goodPriceRange || recommendationResult.avoidPriceRange) && (
            <div className="grid gap-3 sm:grid-cols-2">
              {recommendationResult.goodPriceRange && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-sm font-medium text-emerald-900">Good price range</p>
                  <p className="mt-2 text-lg font-semibold text-emerald-950">
                    {formatCurrency(recommendationResult.goodPriceRange.min, currency)} to {formatCurrency(recommendationResult.goodPriceRange.max, currency)}
                  </p>
                </div>
              )}
              {recommendationResult.avoidPriceRange && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <p className="text-sm font-medium text-rose-900">Avoid range</p>
                  <p className="mt-2 text-lg font-semibold text-rose-950">
                    {formatCurrency(recommendationResult.avoidPriceRange.min, currency)} to {formatCurrency(recommendationResult.avoidPriceRange.max, currency)}
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-sm font-medium text-slate-900">Best tested prices</p>
            <p className="mt-1 text-xs text-slate-500">
              Tested {recommendationResult.testedPriceCount || recommendationResult.testedPrices?.length || 0} prices. Step was auto-adjusted when needed to keep the search practical.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-4 font-medium">Price</th>
                    <th className="py-2 pr-4 font-medium">Demand</th>
                    <th className="py-2 pr-4 font-medium">Revenue</th>
                    <th className="py-2 pr-4 font-medium">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {topTestedPrices.map((item) => (
                    <tr key={item.price} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-slate-900">{formatCurrency(item.price, currency)}</td>
                      <td className="py-2 pr-4 text-slate-600">{item.expectedDemand} units</td>
                      <td className="py-2 pr-4 text-slate-600">{formatCurrency(item.expectedRevenue, currency)}</td>
                      <td className="py-2 pr-4 text-slate-600">{formatCurrency(item.expectedProfit, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {detailed && recommendationResult.calculationSteps?.length > 0 && (
            <details className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600" open>
              <summary className="cursor-pointer font-medium text-slate-800">Show working</summary>
              <div className="mt-3 grid gap-1">
                {recommendationResult.calculationSteps.map((step) => <p key={step}>{step}</p>)}
              </div>
              {recommendationResult.accuracyMetrics?.available && (
                <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3">
                  <p className="font-medium text-slate-800">Accuracy check</p>
                  <p>Demand error on held-out rows: {Number(recommendationResult.accuracyMetrics.demandMAPE || 0).toFixed(1)}%</p>
                  <p>Revenue error on held-out rows: {Number(recommendationResult.accuracyMetrics.revenueMAPE || 0).toFixed(1)}%</p>
                  <p>Profit error on held-out rows: {Number(recommendationResult.accuracyMetrics.profitMAPE || 0).toFixed(1)}%</p>
                </div>
              )}
              {recommendationResult.nearbyPriceComparison?.length > 0 && (
                <div className="mt-3 grid gap-1 border-t border-slate-100 pt-3">
                  <p className="font-medium text-slate-800">Why nearby prices lost</p>
                  {recommendationResult.nearbyPriceComparison.map((item) => (
                    <p key={item.price}>{formatCurrency(item.price, currency)}: {item.reason}</p>
                  ))}
                </div>
              )}
            </details>
          )}
        </div>
      )}
    </section>
  );
}
