import React, { useState } from "react";
import { BotMessageSquare, History, Send, ShieldCheck, Zap } from "lucide-react";
import { EmptyState, SectionHeader, SummaryCard, WarningPanel, WorkspacePanel } from "./common";
import { formatCurrency, formatNumber } from "../utils/formatters";

function severityStyles(severity) {
  if (severity === "positive") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (severity === "warning") return "border-rose-200 bg-rose-50 text-rose-900";
  return "border-amber-200 bg-amber-50 text-amber-900";
}

function labelValue(label, value) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value !== null && value !== undefined && value !== "" ? value : "Unknown"}</p>
    </div>
  );
}

function displayPriceMove(value) {
  return value === "unchanged" ? "flat" : value;
}

function optionalCurrency(value, currency) {
  return value !== null && value !== undefined ? formatCurrency(value, currency) : "Unknown";
}

function KnowledgePanel({ decision }) {
  const root = decision.advice?.theoreticalRoot;
  const caseStudy = decision.advice?.historicalPrecedent;

  if (!root && !caseStudy) return null;

  return (
    <div className="mt-3 grid gap-2 lg:grid-cols-2">
      {root && (
        <div className="rounded-md border-l-4 border-indigo-400 bg-indigo-50/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Economic Principle</p>
          <p className="mt-1 text-sm font-semibold text-indigo-900">
            {root.economicPrinciple || root.title || root.concept}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-indigo-800">
            {root.explanation || root.description}
          </p>
          {(root.recommendation || root.risk) && (
            <p className="mt-2 text-xs text-indigo-900">
              {root.recommendation}
              {root.risk ? ` Risk: ${root.risk}` : ""}
            </p>
          )}
        </div>
      )}

      {caseStudy && (
        <div className="rounded-md border-l-4 border-slate-400 bg-slate-100/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">
            Historical Case: {caseStudy.market || caseStudy.summary || "Comparable pricing case"}
          </p>
          {caseStudy.what_happened && (
            <p className="mt-1 text-xs leading-relaxed text-slate-800">{caseStudy.what_happened}</p>
          )}
          {caseStudy.outcome && (
            <p className="mt-1 text-xs italic leading-relaxed text-slate-800">"{caseStudy.outcome}"</p>
          )}
          {caseStudy.lesson && (
            <p className="mt-1 text-xs font-medium text-slate-900">Lesson: {caseStudy.lesson}</p>
          )}
        </div>
      )}
    </div>
  );
}

function PrecisionPanel({ decision, currency }) {
  const analytics = decision.precisionAnalytics;
  if (!analytics) return null;

  return (
    <div className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md bg-slate-900 p-4 text-white shadow-inner">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">
            {analytics.formulaLabel || "Rough estimate"}
          </p>
          <p className="mt-1 font-mono text-sm text-indigo-300">{analytics.optimalPriceFormula}</p>

          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-[10px] uppercase opacity-60">Elasticity estimate</p>
              <p className="text-xl font-bold text-white">{analytics.elasticityEstimate}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-emerald-400 opacity-80">Rough range</p>
              <p className="text-sm font-semibold">
                {formatCurrency(analytics.confidenceInterval.low, currency)} - {formatCurrency(analytics.confidenceInterval.high, currency)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Inputs Used</p>
          <ul className="mt-2 space-y-2">
            {(analytics.dataSources || []).map((source, idx) => (
              <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                {source}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-md border border-indigo-100 bg-indigo-50 p-3">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">Rough Estimate Note</p>
        <p className="text-sm leading-relaxed text-indigo-900">
          Based on the observed {Math.abs(analytics.elasticityEstimate) > 1 ? "elastic" : "inelastic"} demand response,
          the assistant estimates a rough price range near {formatCurrency(analytics.confidenceInterval.low, currency)} to {formatCurrency(analytics.confidenceInterval.high, currency)}.
          {" "}{analytics.caveat || "This should be checked against real cost and sales history before use."}
        </p>
      </div>
    </div>
  );
}

function DecisionCard({ decision, currency }) {
  const [showDetailed, setShowDetailed] = useState(false);

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-all hover:shadow-md">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">{decision.product}</p>
          <p className="mt-1 text-xs text-slate-500">{new Date(decision.createdAt || Date.now()).toLocaleString()}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${severityStyles(decision.advice?.severity)}`}>
            {decision.advice?.title || "Decision captured"}
          </span>
          {decision.precisionAnalytics && (
            <button
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 transition-colors hover:text-indigo-800"
              onClick={() => setShowDetailed(!showDetailed)}
              type="button"
            >
              <Zap size={10} className={showDetailed ? "fill-indigo-600" : ""} />
              {showDetailed ? "Simple View" : "Rough Estimate"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {labelValue("Old price", optionalCurrency(decision.oldPrice, currency))}
        {labelValue("New price", optionalCurrency(decision.newPrice ?? decision.currentPrice, currency))}
        {labelValue("Cost", optionalCurrency(decision.cost, currency))}
        {labelValue("Competitor price", optionalCurrency(decision.competitorPrice, currency))}
        {labelValue("Price move", displayPriceMove(decision.priceChangeType))}
        {labelValue("Demand", decision.demandChange)}
        {labelValue("Goal", decision.goal)}
      </div>

      {!showDetailed ? (
        <>
          <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
            <p className="font-medium text-slate-900">{decision.advice?.recommendation}</p>
            <p className="mt-1">{decision.advice?.rationale}</p>
            {decision.advice?.aiJustification && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <p className="mb-1 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-indigo-600">
                  <BotMessageSquare size={12} />
                  Mentor note
                </p>
                <p className="text-sm italic leading-relaxed text-slate-700">"{decision.advice.aiJustification}"</p>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">Next step: {decision.advice?.nextStep}</p>
          </div>
          <KnowledgePanel decision={decision} />
        </>
      ) : (
        <PrecisionPanel currency={currency} decision={decision} />
      )}

      <p className="mt-3 text-xs text-slate-500">Original message: "{decision.rawMessage}"</p>
    </article>
  );
}

export function PricingAssistantPanel({
  assistantDecisions,
  assistantInput,
  assistantModelMode,
  assistantState,
  chatHistory,
  currency,
  draftDecision,
  handleAssistantSubmit,
  handleConfirmDecision,
  handleResetAssistant,
  handleSnoozeFeedback,
  latestAssistantDecision,
  refreshAssistantHistory,
  setAssistantInput,
  setAssistantModelMode,
  unresolvedDecision
}) {
  const isRunning = assistantState === "running";

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-auto">
      <WorkspacePanel>
        <SectionHeader
          action={
            <div className="flex items-center gap-2">
              <label
                className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors ${
                  assistantModelMode
                    ? "border-indigo-200 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                title="Force each chat turn through local Ollama Mistral"
              >
                <input
                  checked={assistantModelMode}
                  className="h-4 w-4 accent-indigo-600"
                  disabled={isRunning}
                  onChange={(event) => setAssistantModelMode(event.target.checked)}
                  type="checkbox"
                />
                Mistral test
              </label>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={handleResetAssistant}
                type="button"
              >
                New Chat
              </button>
              <button
                className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                onClick={refreshAssistantHistory}
                type="button"
              >
                <History size={15} />
                Refresh
              </button>
            </div>
          }
          description="Capture small-business pricing decisions in natural language and convert them into structured decision history."
          icon={BotMessageSquare}
          title="Pricing Assistant"
        />

        <div className="mt-4 flex h-[400px] flex-col rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {chatHistory?.map((msg, index) => (
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`} key={index}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "rounded-br-sm bg-slate-900 text-white"
                    : "rounded-bl-sm border border-slate-200 bg-white text-slate-800 shadow-sm"
                }`}
                >
                  {msg.text}
                  {msg.meta && (
                    <p className={`mt-1 text-[10px] ${msg.role === "user" ? "text-slate-300" : "text-slate-500"}`}>
                      {msg.meta}
                    </p>
                  )}
                </div>
              </div>
            ))}

            {draftDecision && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-indigo-200 bg-indigo-50 px-4 py-3 text-indigo-900 shadow-sm">
                  <p className="mb-3 text-sm italic">"{draftDecision.conversationalResponse}"</p>
                  <div className="mb-3 grid gap-2 text-xs sm:grid-cols-2">
                    {labelValue("Product", draftDecision.product)}
                    {labelValue("Price move", displayPriceMove(draftDecision.priceChangeType))}
                    {labelValue("Old price", draftDecision.oldPrice !== null && draftDecision.oldPrice !== undefined ? optionalCurrency(draftDecision.oldPrice, currency) : "Missing")}
                    {labelValue("New price", draftDecision.newPrice !== null && draftDecision.newPrice !== undefined ? optionalCurrency(draftDecision.newPrice, currency) : "Missing")}
                    {labelValue("Cost", draftDecision.cost !== null && draftDecision.cost !== undefined ? optionalCurrency(draftDecision.cost, currency) : "Missing")}
                    {labelValue("Competitor price", optionalCurrency(draftDecision.competitorPrice, currency))}
                    {labelValue("Demand", draftDecision.demandChange)}
                    {labelValue("Goal", draftDecision.goal || "Missing")}
                    {labelValue("Confidence", `${draftDecision.extractionConfidence || 0}%`)}
                  </div>
                  {draftDecision.missingFields?.length > 0 && (
                    <p className="mb-3 text-xs text-amber-700">
                      Missing: {draftDecision.missingFields.join(", ")}
                    </p>
                  )}
                  {draftDecision.modelDiagnostics?.forced && (
                    <p className="mb-3 text-xs text-indigo-700">
                      Mistral {draftDecision.modelDiagnostics.parsed ? "parsed" : "fallback"} in {((draftDecision.modelDiagnostics.latencyMs || 0) / 1000).toFixed(1)}s
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
                      onClick={() => handleConfirmDecision(true)}
                      type="button"
                    >
                      Yes, save it
                    </button>
                    <button
                      className="rounded-md border border-indigo-200 bg-white px-4 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50"
                      onClick={() => handleConfirmDecision(false)}
                      type="button"
                    >
                      No, I'll retype
                    </button>
                  </div>
                </div>
              </div>
            )}

            {isRunning && (
              <div className="flex justify-start">
                <div className="flex max-w-[85%] items-center gap-2 rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm leading-relaxed text-slate-500 shadow-sm">
                  <span className="flex h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: "0ms" }} />
                  <span className="flex h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: "150ms" }} />
                  <span className="flex h-2 w-2 animate-bounce rounded-full bg-slate-300" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-b-lg border-t border-slate-200 bg-white p-3">
            {unresolvedDecision && (
              <div className="mb-2 flex justify-end px-1">
                <button
                  className="text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700"
                  onClick={handleSnoozeFeedback}
                  type="button"
                >
                  I'll answer this later
                </button>
              </div>
            )}
            <form className="flex gap-2" onSubmit={handleAssistantSubmit}>
              <input
                className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-5 py-2.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                disabled={isRunning || !!draftDecision}
                onChange={(event) => setAssistantInput(event.target.value)}
                placeholder={draftDecision ? "Please confirm above..." : "Type your pricing decision..."}
                type="text"
                value={assistantInput}
              />
              <button
                className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-slate-950 text-white transition-colors hover:bg-slate-800 disabled:bg-slate-400"
                disabled={isRunning || !!draftDecision || !assistantInput.trim()}
                type="submit"
              >
                <Send size={16} className={assistantInput.trim() && !draftDecision ? "translate-x-0.5" : ""} />
              </button>
            </form>
          </div>
        </div>
      </WorkspacePanel>

      {latestAssistantDecision && (
        <WorkspacePanel>
          <SectionHeader description="Immediate rule-based guidance from the captured pricing decision." icon={ShieldCheck} title="Latest Advice" />
          <div className="mt-4">
            <DecisionCard currency={currency} decision={latestAssistantDecision} />
          </div>
          {latestAssistantDecision.missingFields?.length > 0 && (
            <div className="mt-3">
              <WarningPanel
                title="Improve this decision row"
                warnings={[`Missing or unclear: ${latestAssistantDecision.missingFields.join(", ")}.`]}
              />
            </div>
          )}
        </WorkspacePanel>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={History} label="Captured Decisions" note="Shop-specific learning history" value={formatNumber(assistantDecisions.length)} />
        <SummaryCard icon={BotMessageSquare} label="Learning Gate" note="ML personalization later" value={`${Math.min(assistantDecisions.length, 50)}/50`} />
        <SummaryCard icon={ShieldCheck} label="Current Method" note="Confirmed rows, no optimizer trigger" value={assistantModelMode ? "Mistral test" : "Hybrid fast"} />
      </div>

      <WorkspacePanel>
        <SectionHeader description="Every captured chat becomes a structured pricing decision row for future learning." icon={History} title="Decision History" />
        <div className="mt-4 grid max-h-[32rem] gap-3 overflow-auto pr-1">
          {!assistantDecisions.length && (
            <EmptyState
              message="Capture the first pricing decision to start building shop-specific pricing memory."
              title="No assistant decisions yet"
            />
          )}
          {assistantDecisions.map((decision) => (
            <DecisionCard currency={currency} decision={decision} key={decision._id} />
          ))}
        </div>
      </WorkspacePanel>
    </div>
  );
}
