import { Component } from "react";
import { formatCurrency } from "../utils/formatters";

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

export function WarningPanel({ warnings, title = "Use with care" }) {
  if (!warnings?.length) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-medium text-amber-900">{title}</p>
      <div className="mt-2 grid gap-1 text-sm text-amber-800">
        {warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
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
