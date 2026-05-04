import { BrainCircuit, Calculator, Database, FileJson, RefreshCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { EmptyState, FormRow, HorizontalBars, OptionalDetailsPanel, SectionHeader, SummaryCard, WarningPanel, WorkspacePanel } from "./common";
import { WorkspaceTabs } from "./layout";
import { formatNumber, formatPercent } from "../utils/formatters";

function decimalToPercent(value) {
  if (value === null || value === undefined) return "Not available";
  return formatPercent(Number(value) * 100);
}

function labelItems(distribution = {}) {
  return Object.entries(distribution).map(([label, value]) => ({ label, value: Number(value || 0) }));
}

function sourceItems(sourceCounts = {}) {
  return Object.entries(sourceCounts).map(([label, value]) => ({ label, value: Number(value || 0) }));
}

function importanceItems(featureImportance = []) {
  return featureImportance.map((item) => ({
    label: item.feature.replace(/_/g, " "),
    value: Number(item.importance || 0)
  }));
}

function toneForLabel(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized === "terrific" || normalized === "good") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (normalized === "neutral") return "border-amber-200 bg-amber-50 text-amber-900";
  return "border-rose-200 bg-rose-50 text-rose-900";
}

function updateField(setForm, field, value) {
  setForm((current) => ({ ...current, [field]: value }));
}

function DecisionInput({ form, setForm, field, label, type = "number", placeholder }) {
  return (
    <FormRow className="min-w-0" label={label}>
      <input
        className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900"
        onChange={(event) => updateField(setForm, field, event.target.value)}
        placeholder={placeholder}
        type={type}
        value={form[field] ?? ""}
      />
    </FormRow>
  );
}

function DecisionTester({ form, setForm, handlePredict, prediction, predictionState, predictionMessage, summary }) {
  const isLoading = predictionState === "loading";
  const votes = prediction?.classVotes ? Object.entries(prediction.classVotes).map(([label, value]) => ({ label, value: Number(value || 0) })) : [];

  return (
    <div className="grid min-h-0 gap-4 2xl:grid-cols-[1.05fr_0.95fr]">
      <WorkspacePanel className="min-w-0">
        <SectionHeader
          icon={Calculator}
          title="Test A Pricing Decision"
          description="Enter before-and-after business values. The assistant classifies the decision using the trained offline ML artifact."
        />
        <form className="mt-4 grid gap-4" onSubmit={handlePredict}>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <DecisionInput field="currentPrice" form={form} label="Current price" setForm={setForm} />
            <DecisionInput field="previousPrice" form={form} label="Previous price" setForm={setForm} />
            <DecisionInput field="quantitySold" form={form} label="Units sold after change" setForm={setForm} />
            <DecisionInput field="unitsBeforeChange" form={form} label="Units before change" setForm={setForm} />
            <DecisionInput field="revenueBeforeChange" form={form} label="Revenue before change" setForm={setForm} />
            <DecisionInput field="profitBeforeChange" form={form} label="Profit before change" setForm={setForm} />
            <DecisionInput field="competitorPrice" form={form} label="Competitor price" setForm={setForm} />
            <DecisionInput field="discountPercent" form={form} label="Discount percent" setForm={setForm} />
            <DecisionInput field="inventoryLevel" form={form} label="Inventory level" setForm={setForm} />
            <DecisionInput field="category" form={form} label="Category" setForm={setForm} type="text" />
            <DecisionInput field="customerSegment" form={form} label="Customer group" setForm={setForm} type="text" />
            <DecisionInput field="region" form={form} label="Region" setForm={setForm} type="text" />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="inline-flex w-fit items-center gap-2 text-sm font-medium text-slate-700">
              <input
                checked={Boolean(form.holidayFlag)}
                className="h-4 w-4 rounded border-slate-300"
                onChange={(event) => updateField(setForm, "holidayFlag", event.target.checked)}
                type="checkbox"
              />
              Holiday or sales event
            </label>

            <button
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400 sm:w-fit"
              disabled={isLoading || !summary?.available}
              type="submit"
            >
              {isLoading ? "Checking decision" : "Predict decision quality"}
            </button>
          </div>

          {predictionMessage && <p className="text-sm text-rose-700">{predictionMessage}</p>}
        </form>
      </WorkspacePanel>

      <WorkspacePanel className="min-w-0">
        <SectionHeader
          icon={BrainCircuit}
          title="Assistant Result"
          description="This result is a second opinion. It does not approve or reject a price by itself."
        />

        {!prediction && (
          <EmptyState
            title="No prediction yet"
            message="Run the tester to see the predicted decision quality, confidence, and the strongest training signals."
          />
        )}

        {prediction && (
          <div className="mt-4 grid gap-4">
            <div className={`rounded-lg border p-4 ${toneForLabel(prediction.predictedLabel)}`}>
              <p className="text-xs font-semibold uppercase">Predicted decision quality</p>
              <p className="mt-2 text-3xl font-semibold">{prediction.predictedLabel}</p>
              <p className="mt-1 text-sm">Confidence: {formatPercent(prediction.confidencePercent)}</p>
            </div>

            <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">{prediction.businessExplanation}</p>

            <div>
              <p className="text-sm font-semibold text-slate-900">Class vote strength</p>
              <div className="mt-3">
                <HorizontalBars
                  emptyText="No class votes returned."
                  items={votes}
                  labelKey="label"
                  valueFormatter={(value) => formatPercent(value * 100)}
                  valueKey="value"
                />
              </div>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-900">Top influencing signals</p>
              <div className="mt-2 grid gap-2">
                {(prediction.topInfluencingSignals || []).map((item) => (
                  <div key={item.feature} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm">
                    <span className="capitalize text-slate-700">{String(item.feature).replace(/_/g, " ")}</span>
                    <span className="font-medium text-slate-900">{Number(item.importance || 0).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            </div>

            <WarningPanel warnings={[prediction.warning]} />
          </div>
        )}
      </WorkspacePanel>
    </div>
  );
}

function ExplainMlSpace() {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <WorkspacePanel>
          <SectionHeader icon={Calculator} title="Math Space" description="Transparent price-response decision support." />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            Math Space uses explainable demand models, simulations, recommendations, formulas, and reliability guards. It is the main pricing workflow when a business user needs to audit how a number was produced.
          </p>
        </WorkspacePanel>
        <WorkspacePanel>
          <SectionHeader icon={BrainCircuit} title="ML Space" description="Historical decision-quality classification." />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            ML Space checks whether a proposed pricing decision resembles historical patterns classified as Terrible, Bad, Neutral, Good, or Terrific. It is a second-opinion signal, not a price approval engine.
          </p>
        </WorkspacePanel>
        <WorkspacePanel>
          <SectionHeader icon={ShieldCheck} title="Best Use" description="Combine both spaces and avoid blind recommendations." />
          <p className="mt-4 text-sm leading-6 text-slate-600">
            The safest business story is: Math Space explains what the price may do, while ML Space checks whether the decision resembles successful or risky past decisions.
          </p>
        </WorkspacePanel>
      </div>

      <WorkspacePanel>
        <SectionHeader icon={ShieldCheck} title="Model Trust Narrative" description="Use this wording during assessment or demo." />
        <div className="mt-4 grid gap-3 text-sm leading-6 text-slate-600">
          <p>This system is built as a pricing decision-support workspace, not a fully autonomous dynamic pricing robot.</p>
          <p>Recommendations are guarded by data-readiness checks, baseline comparison, confidence labels, and warnings when the data is weak.</p>
          <p>ML outputs are advisory because the labels are engineered from before-and-after outcomes rather than official company decision labels.</p>
        </div>
      </WorkspacePanel>
    </div>
  );
}

export function MlDecisionSpacePanel({ form, handlePredict, prediction, predictionMessage, predictionState, setForm, summary, state, message, refreshMlSummary }) {
  const isLoading = state === "loading";

  if (!summary?.available) {
    return (
      <div className="grid h-full min-h-0 gap-4 overflow-auto">
        <WorkspacePanel>
          <SectionHeader
            icon={BrainCircuit}
            title="ML Decision Space"
            description="This space is separate from the explainable mathematical pricing engine. It becomes active after offline ML training produces a model artifact."
            action={
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={isLoading}
                onClick={refreshMlSummary}
                type="button"
              >
                <RefreshCcw size={15} />
                Refresh
              </button>
            }
          />
          <div className="mt-4">
            <EmptyState
              title={summary?.statusLabel || "ML model not trained"}
              message={summary?.message || message || "Run npm run ml:train, then refresh this screen."}
            />
          </div>
        </WorkspacePanel>
      </div>
    );
  }

  const labels = labelItems(summary.dataset?.labelDistribution);
  const sources = sourceItems(summary.dataset?.sourceCounts);
  const importance = importanceItems(summary.featureImportance);
  const model = summary.model || {};
  const macroWarnings = summary.macroData?.warnings || [];

  const overview = (
    <div className="flex flex-col gap-4 pb-4">
      <WorkspacePanel>
        <SectionHeader
          icon={BrainCircuit}
          title="ML Decision Space"
          description="A separate advisory space for predicting whether a pricing decision looks Terrible, Bad, Neutral, Good, or Terrific."
          action={
            <button
              className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              disabled={isLoading}
              onClick={refreshMlSummary}
              type="button"
            >
              <RefreshCcw size={15} />
              Refresh
            </button>
          }
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={Database} label="Decision Rows" note="Engineered pricing decisions" value={formatNumber(summary.dataset?.rowCount)} />
          <SummaryCard icon={TrendingUp} label="Model Accuracy" note="Time-based holdout" value={decimalToPercent(model.accuracy)} />
          <SummaryCard icon={ShieldCheck} label="Macro F1" note="Balanced class quality" value={decimalToPercent(model.macroF1)} />
          <SummaryCard
            icon={BrainCircuit}
            label="Baseline Lift"
            note="Macro F1 vs majority guess"
            value={model.macroF1LiftVsMajority === null ? "Not available" : `+${formatPercent(Number(model.macroF1LiftVsMajority) * 100)}`}
          />
        </div>

        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">{summary.statusLabel}</p>
          <p className="mt-1 leading-6">{summary.message}</p>
        </div>
      </WorkspacePanel>

      <div className="grid min-h-0 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <WorkspacePanel>
          <SectionHeader
            icon={ShieldCheck}
            title="Decision Quality Distribution"
            description="The assistant learned from engineered good, bad, neutral, and extreme pricing outcomes."
          />
          <div className="mt-4">
            <HorizontalBars
              emptyText="No decision labels were found."
              items={labels}
              labelKey="label"
              valueFormatter={formatNumber}
              valueKey="value"
            />
          </div>
        </WorkspacePanel>

        <WorkspacePanel>
          <SectionHeader
            icon={FileJson}
            title="Most Important Signals"
            description="The top inputs used by the trained classifier."
          />
          <div className="mt-4">
            <HorizontalBars
              emptyText="No feature importance file was generated."
              items={importance}
              labelKey="label"
              valueFormatter={(value) => value.toFixed(4)}
              valueKey="value"
            />
          </div>
        </WorkspacePanel>
      </div>

      <WorkspacePanel>
        <SectionHeader
          icon={Database}
          title="Training Sources"
          description="This is the ML space's dataset mix. It is intentionally separate from your uploaded app dataset."
        />
        <div className="mt-4">
          <HorizontalBars
            emptyText="No source dataset counts were found."
            items={sources}
            labelKey="label"
            valueFormatter={formatNumber}
            valueKey="value"
          />
        </div>
      </WorkspacePanel>

      <WarningPanel
        title="Important limits"
        warnings={[
          ...(summary.warnings || []),
          ...(macroWarnings.length 
            ? [`FRED macro data is incomplete. Missing keys: ${macroWarnings.map(w => w.split(':')[0]).join(', ')}. Add FRED_API_KEY to .env and rerun training for full enrichment.`] 
            : [])
        ]}
      />

      <OptionalDetailsPanel title="Generated artifact details">
        <div className="grid gap-2 text-xs text-slate-600">
          <p>Model implementation: {model.implementation || "Unknown"}</p>
          <p>Artifact format: {summary.modelFile?.artifactFormat || "Unknown"}</p>
          <p>Model file: {summary.modelFile?.path}</p>
          <p>Output folder: {summary.outputFolder}</p>
          <p>Generated at: {summary.generatedAt ? new Date(summary.generatedAt).toLocaleString() : "Unknown"}</p>
          <p>Train rows: {formatNumber(summary.dataset?.trainRows)}</p>
          <p>Test rows: {formatNumber(summary.dataset?.testRows)}</p>
          <p>Beats majority baseline: {model.modelBeatsMajorityBaseline ? "Yes" : "No"}</p>
          <p>Beats simple profit-lift rule: {model.modelBeatsSimpleProfitRule ? "Yes" : "No"}</p>
        </div>
      </OptionalDetailsPanel>
    </div>
  );

  return (
    <WorkspaceTabs
      tabs={[
        {
          id: "overview",
          label: "Overview",
          content: overview
        },
        {
          id: "tester",
          label: "Decision Tester",
          content: (
            <DecisionTester
              form={form}
              handlePredict={handlePredict}
              prediction={prediction}
              predictionMessage={predictionMessage}
              predictionState={predictionState}
              setForm={setForm}
              summary={summary}
            />
          )
        },
        {
          id: "explain",
          label: "How To Explain",
          content: <ExplainMlSpace />
        }
      ]}
    />
  );
}
