import { Component } from "react";
import { formatCurrency } from "../utils/formatters";
import { AlertTriangle, Info } from "lucide-react";
import { useViewMode } from "../lib/view-mode";

function trustTone(label) {
  const normalized = String(label || "").toLowerCase();

  if (normalized.includes("recommended") || normalized.includes("usable") || normalized.includes("strong") || normalized.includes("real") || normalized.includes("low")) {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (normalized.includes("caution") || normalized.includes("risky") || normalized.includes("estimated") || normalized.includes("medium") || normalized.includes("summary")) {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }

  return "border-rose-200 bg-rose-50 text-rose-800";
}

export function StatusPill({ state }) {
  const styles = {
    checking: "border-slate-300 bg-slate-100 text-slate-700",
    online: "border-emerald-200 bg-emerald-50 text-emerald-700",
    offline: "border-rose-200 bg-rose-50 text-rose-700"
  };

  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${styles[state]}`}>
      {state === "online" ? "System online" : state === "offline" ? "Needs attention" : "Checking"}
    </span>
  );
}

export function WorkspacePanel({ children, className = "" }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      {children}
    </section>
  );
}

export function ScrollablePanel({ children, className = "" }) {
  return (
    <section className={`min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
      {children}
    </section>
  );
}

export function FormRow({ label, children, className = "" }) {
  return (
    <label className={`grid gap-2 text-sm font-medium text-slate-700 ${className}`}>
      {label}
      {children}
    </label>
  );
}

export function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <Icon className="mt-0.5 shrink-0 text-slate-600" size={20} />}
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          {description && <p className="mt-1 text-sm leading-5 text-slate-500">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ title = "No data yet", message, action }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm">
      <p className="font-semibold text-slate-900">{title}</p>
      {message && <p className="mt-1 leading-6 text-slate-500">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function TrustBadge({ label, note }) {
  if (!label && !note) return null;

  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${trustTone(label || note)}`}>
      {label}{note ? `: ${note}` : ""}
    </span>
  );
}

export function TrustStrip({ items = [] }) {
  const visibleItems = items.filter((item) => item?.label || item?.value);

  if (!visibleItems.length) return null;

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">
      {visibleItems.map((item) => (
        <div key={`${item.label}-${item.value}`} className="rounded-md border border-slate-200 bg-white p-3">
          <p className="text-xs font-medium uppercase text-slate-500">{item.label}</p>
          <p className={`mt-1 text-sm font-semibold ${item.tone === "danger" ? "text-rose-700" : item.tone === "success" ? "text-emerald-700" : "text-slate-950"}`}>
            {item.value}
          </p>
          {item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}
        </div>
      ))}
    </div>
  );
}

export function TableFrame({ children, minWidth = "720px" }) {
  return (
    <div className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white">
      <div style={{ minWidth }}>
        {children}
      </div>
    </div>
  );
}

export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("App render failed", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="min-h-screen bg-slate-50 p-8 text-slate-950">
          <section className="mx-auto max-w-3xl rounded-lg border border-rose-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-semibold uppercase text-rose-600">App failed to render</p>
            <h1 className="mt-2 text-2xl font-semibold">A frontend error stopped the dashboard.</h1>
            <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700">
              {this.state.error?.message || "Unknown frontend error"}
            </p>
            <p className="mt-4 text-sm text-slate-600">Refresh after the fix is saved. This screen exists so the app never fails silently.</p>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export function SummaryCard({ icon: Icon, label, value, note }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-3 text-slate-600">
        <Icon size={18} />
        <h2 className="text-sm font-medium">{label}</h2>
      </div>
      <p className="mt-3 text-xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </section>
  );
}

export function ExplainableNumber({ children, title = "How this was calculated", lines = [], className = "" }) {
  const { detailed } = useViewMode();
  const visibleLines = lines.filter(Boolean);

  if (!visibleLines.length || !detailed) {
    return <span className={className}>{children}</span>;
  }

  return (
    <span className={`group relative inline-flex w-fit max-w-full cursor-help items-center border-b border-dotted border-slate-400 focus-within:outline-none ${className}`} tabIndex={0}>
      {children}
      <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden w-80 max-w-[min(80vw,20rem)] rounded-md border border-slate-200 bg-white p-3 text-left text-xs font-normal leading-5 text-slate-600 shadow-xl group-hover:block group-focus:block group-focus-within:block">
        <span className="block font-semibold text-slate-900">{title}</span>
        <span className="mt-2 grid gap-1">
          {visibleLines.map((line) => (
            <span key={line} className="block">{line}</span>
          ))}
        </span>
      </span>
    </span>
  );
}

export function CalculationWorkingPanel({ title = "Show working", summary, items = [], formulas = [], evidence = [], defaultOpen = false }) {
  const { detailed } = useViewMode();
  const visibleItems = items.filter((item) => item?.label || item?.value);
  const visibleFormulas = formulas.filter(Boolean);
  const visibleEvidence = evidence.filter(Boolean);

  if (!summary && !visibleItems.length && !visibleFormulas.length && !visibleEvidence.length) return null;
  if (!detailed) return null;

  return (
    <details className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600" open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">{title}</summary>
      <div className="mt-3 grid gap-4">
        {summary && <p className="leading-6">{summary}</p>}
        {visibleItems.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <div key={`${item.label}-${item.value}`} className="rounded-md bg-slate-50 p-3">
                <p className="text-xs uppercase text-slate-500">{item.label}</p>
                <p className="mt-1 font-semibold text-slate-900">{item.value}</p>
                {item.note && <p className="mt-1 text-xs text-slate-500">{item.note}</p>}
              </div>
            ))}
          </div>
        )}
        {visibleFormulas.length > 0 && (
          <div className="grid gap-2 rounded-md bg-slate-50 p-3">
            {visibleFormulas.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        {visibleEvidence.length > 0 && (
          <div className="grid gap-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {visibleEvidence.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function OptionalDetailsPanel({ children, title, className = "" }) {
  const { detailed } = useViewMode();

  if (!detailed) return null;

  return (
    <details className={`rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600 ${className}`}>
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">{title || "Technical details"}</summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function WarningPanel({ warnings, title = "Use with care" }) {
  if (!warnings?.length) return null;

  return (
    <div className="flex gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4">
      <AlertTriangle className="mt-0.5 shrink-0 text-rose-600" size={18} />
      <div>
        <p className="text-sm font-semibold text-rose-900">{title}</p>
        <div className="mt-1.5 grid gap-1.5 text-sm leading-6 text-rose-800">
          {warnings.map((warning, index) => (
            <p key={index}>{warning}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MiniRevenueTrend({ items, currency }) {
  const maxRevenue = Math.max(...items.map((item) => Number(item.revenue || 0)), 0);

  if (!items.length) {
    return <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Upload sales data to see monthly revenue movement.</p>;
  }

  return (
    <div className="flex h-40 items-end gap-3 overflow-x-auto pt-3">
      {items.map((item) => {
        const height = maxRevenue > 0 ? Math.max(12, (Number(item.revenue || 0) / maxRevenue) * 100) : 0;

        return (
          <div key={item.month} className="flex min-w-16 flex-1 flex-col items-center gap-2">
            <div className="flex h-24 w-full items-end rounded-md bg-slate-100 px-2">
              <div className="w-full rounded-md bg-slate-900" style={{ height: `${height}%` }} />
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-slate-600">{item.month}</p>
              <p className="text-[11px] text-slate-500">{formatCurrency(item.revenue, currency)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HorizontalBars({ items, labelKey, valueKey, valueFormatter, emptyText }) {
  const maxValue = Math.max(...items.map((item) => Number(item[valueKey] || 0)), 0);

  if (!items.length) {
    return <p className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">{emptyText}</p>;
  }

  return (
    <div className="grid gap-3">
      {items.map((item) => {
        const value = Number(item[valueKey] || 0);
        const width = maxValue > 0 ? Math.max(5, (value / maxValue) * 100) : 0;

        return (
          <div key={`${item[labelKey]}-${value}`} className="grid gap-1">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate font-medium text-slate-700">{item[labelKey]}</span>
              <span className="text-slate-500">{valueFormatter(value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-slate-900" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
