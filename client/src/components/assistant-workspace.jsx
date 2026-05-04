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
      <p className="mt-1 text-sm font-semibold text-slate-900">{value || "Unknown"}</p>
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
          <p className="mt-1 text-xs text-slate-500">{new Date(decision.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`w-fit rounded-md border px-2.5 py-1 text-xs font-semibold ${severityStyles(decision.advice?.severity)}`}>
            {decision.advice?.title || "Decision captured"}
          </span>
          {decision.precisionAnalytics && (
            <button 
              onClick={() => setShowDetailed(!showDetailed)}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-indigo-600 hover:text-indigo-800 transition-colors"
              type="button"
            >
              <Zap size={10} className={showDetailed ? "fill-indigo-600" : ""} />
              {showDetailed ? "Switch to Simple" : "Precision View"}
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {labelValue("Old price", decision.oldPrice !== null && decision.oldPrice !== undefined ? formatCurrency(decision.oldPrice, currency) : "Unknown")}
        {labelValue("New price", decision.newPrice !== null && decision.newPrice !== undefined ? formatCurrency(decision.newPrice, currency) : "Unknown")}
        {labelValue("Price move", decision.priceChangeType)}
        {labelValue("Demand", decision.demandChange)}
      </div>

      {!showDetailed ? (
        <div className="mt-3 rounded-md bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-900">{decision.advice?.recommendation}</p>
          <p className="mt-1">{decision.advice?.rationale}</p>
          {decision.advice?.aiJustification && (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <BotMessageSquare size={12} />
                Mentor's AI Note
              </p>
              <p className="text-sm italic text-slate-700 leading-relaxed">
                "{decision.advice.aiJustification}"
              </p>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">Next step: {decision.advice?.nextStep}</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-slate-900 p-4 text-white shadow-inner">
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-60">Optimal Price Formula</p>
              <p className="mt-1 font-mono text-sm text-indigo-300">{decision.precisionAnalytics.optimalPriceFormula}</p>
              
              <div className="mt-4 flex justify-between items-end">
                <div>
                  <p className="text-[10px] uppercase opacity-60">Elasticity (ε)</p>
                  <p className="text-xl font-bold text-white">{decision.precisionAnalytics.elasticityEstimate}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase opacity-60 text-emerald-400">Target Range</p>
                  <p className="text-sm font-semibold">
                    {formatCurrency(decision.precisionAnalytics.confidenceInterval.low, currency)} - {formatCurrency(decision.precisionAnalytics.confidenceInterval.high, currency)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Intelligence Sources</p>
              <ul className="mt-2 space-y-2">
                {decision.precisionAnalytics.dataSources.map((source, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                    <div className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                    {source}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-md bg-indigo-50 p-3 border border-indigo-100">
             <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1">Advanced Rationale</p>
             <p className="text-sm text-indigo-900 leading-relaxed">
               Based on the observed {Math.abs(decision.precisionAnalytics.elasticityEstimate) > 1 ? 'elastic' : 'inelastic'} demand response, 
               the model suggests that the optimal price point lies within the {formatCurrency(decision.precisionAnalytics.confidenceInterval.low, currency)} band 
               to maximize gross profit while maintaining volume.
             </p>
          </div>
        </div>
      )}

      {decision.advice?.theoreticalRoot && !showDetailed && (
        <div className="mt-3 rounded-md border-l-4 border-indigo-400 bg-indigo-50/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Economic Principle: {decision.advice.theoreticalRoot.title}</p>
          <p className="mt-1 text-sm font-semibold text-indigo-900">{decision.advice.theoreticalRoot.concept}</p>
          <p className="mt-1 text-xs text-indigo-800 leading-relaxed">{decision.advice.theoreticalRoot.description}</p>
        </div>
      )}

      {decision.advice?.historicalPrecedent && !showDetailed && (
        <div className="mt-2 rounded-md border-l-4 border-slate-400 bg-slate-100/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Historical Case: {decision.advice.historicalPrecedent.summary}</p>
          <p className="mt-1 text-xs text-slate-800 leading-relaxed italic">"{decision.advice.historicalPrecedent.outcome}"</p>
          <p className="mt-1 text-xs font-medium text-slate-900">Lesson: {decision.advice.historicalPrecedent.lesson}</p>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">Original message: “{decision.rawMessage}”</p>
    </article>
  );
}

export function PricingAssistantPanel({
  assistantDecisions,
  assistantInput,
  assistantMessage,
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
  unresolvedDecision
}) {
  const isRunning = assistantState === "running";

  return (
    <div className="grid h-full min-h-0 gap-4 overflow-auto">
      <WorkspacePanel>
        <SectionHeader
          icon={BotMessageSquare}
          title="Pricing Assistant"
          description="Capture small-business pricing decisions in natural language and convert them into structured decision history."
          action={
            <div className="flex items-center gap-2">
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
        />

        <div className="mt-4 flex h-[400px] flex-col rounded-lg border border-slate-200 bg-slate-50 shadow-sm">
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {chatHistory?.map((msg, index) => (
              <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-slate-900 text-white rounded-br-sm' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))}
            
            {draftDecision && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl px-4 py-3 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-bl-sm shadow-sm">
                  <p className="text-sm font-semibold mb-2">I understood the following:</p>
                  <ul className="text-sm list-disc pl-4 mb-3 space-y-1">
                    <li>Product: {draftDecision.product}</li>
                    <li>Price changed from {draftDecision.oldPrice} to {draftDecision.newPrice}</li>
                    <li>Sales {draftDecision.demandChange}</li>
                  </ul>
                  <p className="text-sm mb-3">Is this correct?</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => handleConfirmDecision(true)}
                      className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
                      type="button"
                    >
                      Yes, save it
                    </button>
                    <button 
                      onClick={() => handleConfirmDecision(false)}
                      className="px-4 py-1.5 bg-white border border-indigo-200 text-indigo-700 text-sm font-medium rounded-md hover:bg-indigo-50 transition-colors"
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
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed bg-white border border-slate-200 text-slate-500 rounded-bl-sm shadow-sm flex items-center gap-2">
                  <span className="flex h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="flex h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="flex h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>
          
          <div className="border-t border-slate-200 bg-white p-3 rounded-b-lg">
            {unresolvedDecision && (
              <div className="mb-2 flex justify-end px-1">
                <button
                  type="button"
                  onClick={handleSnoozeFeedback}
                  className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
                >
                  I'll answer this later
                </button>
              </div>
            )}
            <form className="flex gap-2" onSubmit={handleAssistantSubmit}>
              <input
                type="text"
                className="flex-1 rounded-full border border-slate-300 bg-slate-50 px-5 py-2.5 text-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
                onChange={(event) => setAssistantInput(event.target.value)}
                placeholder={draftDecision ? "Please confirm above..." : "Type your pricing decision..."}
                value={assistantInput}
                disabled={isRunning || !!draftDecision}
              />
              <button
                className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-slate-950 text-white disabled:bg-slate-400 transition-colors hover:bg-slate-800"
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
          <SectionHeader icon={ShieldCheck} title="Latest Advice" description="Immediate rule-based guidance from the captured pricing decision." />
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
        <SummaryCard icon={ShieldCheck} label="Current Method" note="No blind ML for sparse data" value="Rule-based" />
      </div>

      <WorkspacePanel>
        <SectionHeader icon={History} title="Decision History" description="Every captured chat becomes a structured pricing decision row for future learning." />
        <div className="mt-4 grid max-h-[32rem] gap-3 overflow-auto pr-1">
          {!assistantDecisions.length && (
            <EmptyState
              title="No assistant decisions yet"
              message="Capture the first pricing decision to start building shop-specific pricing memory."
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
