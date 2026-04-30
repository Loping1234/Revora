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
import { useEffect, useMemo, useState } from "react";
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
  ExplainableNumber,
  MiniRevenueTrend,
  SummaryCard,
  WarningPanel
} from "./common";

export function ProductsTable({ products, productError, currency, onCreateInsight, onSimulatePrice, onViewReadiness }) {
  const pageSize = 10;
  const [sortConfig, setSortConfig] = useState({ key: "name", direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [readinessFilter, setReadinessFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [dataFilter, setDataFilter] = useState("all");

  const columns = [
    { key: "name", label: "Product", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "basePrice", label: "Current Price", type: "number" },
    { key: "cost", label: "Cost", type: "number" },
    { key: "inventory", label: "Stock", type: "number" },
    { key: "salesRecords", label: "Sales Rows", type: "number" },
    { key: "readiness", label: "Readiness", type: "text" },
    { key: "fittedModels", label: "Insights Ready", type: "number" }
  ];

  const categoryOptions = useMemo(() => {
    return [...new Set(products.map((product) => product.category).filter(Boolean))].sort();
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const readinessStatus = product.readiness?.status || "Not ready";
      const matchesReadiness = readinessFilter === "all" || readinessStatus === readinessFilter;
      const matchesCategory = categoryFilter === "all" || product.category === categoryFilter;
      const matchesData =
        dataFilter === "all" ||
        (dataFilter === "missingCost" && product.readiness?.warnings?.some((warning) => warning.toLowerCase().includes("cost"))) ||
        (dataFilter === "missingCompetitor" && product.readiness?.warnings?.some((warning) => warning.toLowerCase().includes("competitor"))) ||
        (dataFilter === "readyOnly" && (readinessStatus === "Ready" || readinessStatus === "Limited"));

      return matchesReadiness && matchesCategory && matchesData;
    });
  }, [products, readinessFilter, categoryFilter, dataFilter]);

  const sortedProducts = useMemo(() => {
    const column = columns.find((item) => item.key === sortConfig.key);
    const direction = sortConfig.direction === "asc" ? 1 : -1;

    return [...filteredProducts].sort((left, right) => {
      const leftValue = left[sortConfig.key];
      const rightValue = right[sortConfig.key];

      if (sortConfig.key === "readiness") {
        const rank = { Ready: 3, Limited: 2, "Not ready": 1 };
        return ((rank[left.readiness?.status] || 0) - (rank[right.readiness?.status] || 0)) * direction;
      }

      if (column?.type === "number") {
        return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * direction;
      }

      return String(leftValue || "").localeCompare(String(rightValue || ""), undefined, {
        numeric: true,
        sensitivity: "base"
      }) * direction;
    });
  }, [filteredProducts, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const visibleProducts = sortedProducts.slice(pageStart, pageStart + pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [products.length, sortConfig, readinessFilter, categoryFilter, dataFilter]);

  function handleSort(key) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "asc" ? "desc" : "asc"
    }));
  }

  function SortIcon({ columnKey }) {
    if (sortConfig.key !== columnKey) return <ChevronsUpDown aria-hidden="true" size={14} />;
    return sortConfig.direction === "asc" ? <ChevronUp aria-hidden="true" size={14} /> : <ChevronDown aria-hidden="true" size={14} />;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Product Portfolio</h2>
          <p className="mt-1 text-sm text-slate-500">Price, cost, stock, and sales-data readiness.</p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          {productError && <span className="rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs text-rose-700">{productError}</span>}
          <span className="text-xs text-slate-500">
            Showing {products.length ? pageStart + 1 : 0}-{Math.min(pageStart + pageSize, sortedProducts.length)} of {sortedProducts.length}
          </span>
        </div>
      </div>

      <div className="mt-4 grid shrink-0 gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs font-medium uppercase text-slate-500">
          Readiness
          <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm normal-case text-slate-700" onChange={(event) => setReadinessFilter(event.target.value)} value={readinessFilter}>
            <option value="all">All readiness levels</option>
            <option value="Ready">Ready</option>
            <option value="Limited">Limited</option>
            <option value="Not ready">Not ready</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium uppercase text-slate-500">
          Category
          <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm normal-case text-slate-700" onChange={(event) => setCategoryFilter(event.target.value)} value={categoryFilter}>
            <option value="all">All categories</option>
            {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium uppercase text-slate-500">
          Data view
          <select className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm normal-case text-slate-700" onChange={(event) => setDataFilter(event.target.value)} value={dataFilter}>
            <option value="all">All products</option>
            <option value="readyOnly">Ready or limited only</option>
            <option value="missingCost">Missing cost</option>
            <option value="missingCompetitor">Missing competitor price</option>
          </select>
        </label>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              {columns.map((column) => (
                <th key={column.key} className="py-3 pr-4 font-medium">
                  <button
                    aria-label={`Sort by ${column.label}`}
                    className="inline-flex items-center gap-1.5 rounded-md py-1 text-left uppercase hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    onClick={() => handleSort(column.key)}
                    type="button"
                  >
                    <span>{column.label}</span>
                    <SortIcon columnKey={column.key} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleProducts.map((product) => (
              <tr key={product._id} className="border-b border-slate-100 transition-colors hover:bg-slate-50 last:border-0">
                <td className="py-2 pr-4">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.sku}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => onViewReadiness?.(product)}
                      type="button"
                    >
                      Data
                    </button>
                    <button
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => onCreateInsight?.(product)}
                      type="button"
                    >
                      Insight
                    </button>
                    <button
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                      onClick={() => onSimulatePrice?.(product)}
                      type="button"
                    >
                      Simulate
                    </button>
                  </div>
                </td>
                <td className="py-2 pr-4 text-slate-600">{product.category}</td>
                <td className="py-2 pr-4 text-slate-600">
                  <ExplainableNumber lines={["Current/base product price stored for this product.", "Used as baseline price in simulations and recommendations."]}>
                    {formatCurrency(product.basePrice, currency)}
                  </ExplainableNumber>
                </td>
                <td className="py-2 pr-4 text-slate-600">
                  <ExplainableNumber lines={["Product cost used for profit calculations.", product.costQuality ? `Cost quality: ${product.costQuality}.` : "If cost was missing, profit may use an estimated cost."]}>
                    {formatCurrency(product.cost, currency)}
                  </ExplainableNumber>
                </td>
                <td className="py-2 pr-4">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${product.inventory < 50 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                    <ExplainableNumber lines={["Inventory/stock value imported or stored for this product.", "Low stock may make demand modeling less reliable."]}>
                      {product.inventory} units
                    </ExplainableNumber>
                  </span>
                </td>
                <td className="py-2 pr-4 text-slate-600">
                  <ExplainableNumber lines={["Sales rows = imported transaction rows linked to this product.", "Rows may still be excluded from modeling if stockout or invalid."]}>
                    {product.salesRecords}
                  </ExplainableNumber>
                </td>
                <td className="py-2 pr-4">
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${getReadinessStyles(product.readiness?.status)}`}>
                    <ExplainableNumber lines={[
                      product.readiness?.reason || "No imported sales rows yet.",
                      ...(product.readiness?.warnings || []).slice(0, 2)
                    ]}>
                      {product.readiness?.status || "Not ready"}
                    </ExplainableNumber>
                  </span>
                  <p className="mt-1 max-w-44 text-xs text-slate-500">{product.readiness?.reason || "No imported sales rows yet."}</p>
                </td>
                <td className="py-2 pr-4 text-slate-600">
                  <ExplainableNumber lines={["Number of fitted pricing insights/models available for this product.", "Usually varies by customer segment."]}>
                    {product.fittedModels || 0}
                  </ExplainableNumber>
                </td>
              </tr>
            ))}
            {!visibleProducts.length && (
              <tr>
                <td className="py-6 text-sm text-slate-500" colSpan="8">
                  No products available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 shrink-0 flex flex-col gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          Page {safePage} of {totalPages} - 10 products per page
        </p>
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden="true" size={16} />
            Previous
          </button>
          <button
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            type="button"
          >
            Next
            <ChevronRight aria-hidden="true" size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

export function ProductIntelligencePanel({ productIntelligence, state, message, refreshProductIntelligence, currency }) {
  const products = productIntelligence?.products || [];
  const bestToAnalyze = productIntelligence?.bestToAnalyze || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <Boxes size={20} />
          <h2 className="text-base font-semibold">Product Intelligence</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshProductIntelligence} type="button">
          Refresh
        </button>
      </div>
      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className="mt-4 grid gap-4 xl:grid-cols-[360px_1fr]">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Best products to analyze first</h3>
          <div className="mt-3 grid gap-2">
            {bestToAnalyze.map((product) => (
              <div key={product.productId} className="rounded-md border border-slate-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{product.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{product.sku} - {product.distinctPriceCount} prices</p>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-medium ${getReadinessStyles(product.readiness.status)}`}>{product.readiness.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatCurrency(product.revenue, currency)} revenue - {formatPercent(product.marginPercent)} margin</p>
              </div>
            ))}
            {!bestToAnalyze.length && <p className="rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-500">Upload data with repeated prices to see priorities.</p>}
          </div>
        </section>

        <section className="min-h-0 overflow-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Revenue</th>
                <th className="p-3 font-medium">Units</th>
                <th className="p-3 font-medium">Avg Price</th>
                <th className="p-3 font-medium">Margin</th>
                <th className="p-3 font-medium">Price Range</th>
                <th className="p-3 font-medium">Demand Range</th>
                <th className="p-3 font-medium">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.productId} className="border-b border-slate-100 last:border-0">
                  <td className="p-3">
                    <p className="font-medium text-slate-900">{product.name}</p>
                    <p className="text-xs text-slate-500">{product.sku} - {product.category}</p>
                  </td>
                  <td className="p-3 text-slate-600">{formatCurrency(product.revenue, currency)}</td>
                  <td className="p-3 text-slate-600">{formatNumber(product.units)}</td>
                  <td className="p-3 text-slate-600">{formatCurrency(product.averagePrice, currency)}</td>
                  <td className="p-3 text-slate-600">{formatPercent(product.marginPercent)}</td>
                  <td className="p-3 text-slate-600">{formatCurrency(product.priceRange.min, currency)} to {formatCurrency(product.priceRange.max, currency)}</td>
                  <td className="p-3 text-slate-600">{product.demandRange.min} to {product.demandRange.max}</td>
                  <td className="p-3">
                    <span className={`rounded-md px-2 py-1 text-xs font-medium ${getReadinessStyles(product.readiness.status)}`}>{product.readiness.status}</span>
                    <p className="mt-1 max-w-48 text-xs text-slate-500">{product.readiness.reason}</p>
                  </td>
                </tr>
              ))}
              {!products.length && (
                <tr><td className="p-6 text-sm text-slate-500" colSpan="8">No product intelligence yet.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </section>
  );
}

export function CustomerSegmentsPanel({ segments, state, message, refreshCustomerSegments, currency }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <Users size={20} />
          <h2 className="text-base font-semibold">Customer Segments</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshCustomerSegments} type="button">
          Refresh
        </button>
      </div>
      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Revenue by customer group</h3>
          <div className="mt-4">
            <HorizontalBars items={segments} labelKey="label" valueKey="revenue" valueFormatter={(value) => formatCurrency(value, currency)} emptyText="No customer groups found." />
          </div>
        </section>
        <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="text-sm font-semibold text-slate-900">Units by customer group</h3>
          <div className="mt-4">
            <HorizontalBars items={segments} labelKey="label" valueKey="units" valueFormatter={(value) => `${formatNumber(value)} units`} emptyText="No customer groups found." />
          </div>
        </section>
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[880px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="p-3 font-medium">Segment</th>
              <th className="p-3 font-medium">Rows</th>
              <th className="p-3 font-medium">Products</th>
              <th className="p-3 font-medium">Revenue</th>
              <th className="p-3 font-medium">Profit</th>
              <th className="p-3 font-medium">Avg Price</th>
              <th className="p-3 font-medium">Readiness</th>
            </tr>
          </thead>
          <tbody>
            {segments.map((segment) => (
              <tr key={segment.segment} className="border-b border-slate-100 last:border-0">
                <td className="p-3 font-medium text-slate-900">{segment.label}</td>
                <td className="p-3 text-slate-600">{formatNumber(segment.rows)}</td>
                <td className="p-3 text-slate-600">{formatNumber(segment.products)}</td>
                <td className="p-3 text-slate-600">{formatCurrency(segment.revenue, currency)}</td>
                <td className="p-3 text-slate-600">{formatCurrency(segment.profit, currency)}</td>
                <td className="p-3 text-slate-600">{formatCurrency(segment.averagePrice, currency)}</td>
                <td className="p-3 text-slate-600">{segment.readinessHint}</td>
              </tr>
            ))}
            {!segments.length && <tr><td className="p-6 text-sm text-slate-500" colSpan="7">No customer segment data yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CompetitorMarketPanel({ market, state, message, refreshCompetitorMarket, currency }) {
  const products = market?.products || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <BadgeDollarSign size={20} />
          <h2 className="text-base font-semibold">Competitor & Market View</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshCompetitorMarket} type="button">
          Refresh
        </button>
      </div>
      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className={`mt-4 rounded-lg border p-4 ${market?.available ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <p className={`text-sm font-medium ${market?.available ? "text-emerald-900" : "text-amber-900"}`}>{market?.message || "Upload data to check competitor pricing."}</p>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <SummaryCard icon={Package} label="Products With Market Data" value={formatNumber(market?.summary?.productsWithCompetitorData || 0)} note="Competitor price rows detected" />
        <SummaryCard icon={ChevronUp} label="Priced Above Market" value={formatNumber(market?.summary?.aboveMarket || 0)} note="Average gap above competitor" />
        <SummaryCard icon={ChevronDown} label="Priced Below Market" value={formatNumber(market?.summary?.belowMarket || 0)} note="Potential margin opportunity" />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="p-3 font-medium">Product</th>
              <th className="p-3 font-medium">Own Avg Price</th>
              <th className="p-3 font-medium">Competitor Avg</th>
              <th className="p-3 font-medium">Gap</th>
              <th className="p-3 font-medium">Gap %</th>
              <th className="p-3 font-medium">Market Flag</th>
              <th className="p-3 font-medium">Rows</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.productId} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <p className="font-medium text-slate-900">{product.name}</p>
                  <p className="text-xs text-slate-500">{product.sku} - {product.category}</p>
                </td>
                <td className="p-3 text-slate-600">{formatCurrency(product.averagePrice, currency)}</td>
                <td className="p-3 text-slate-600">{formatCurrency(product.averageCompetitorPrice, currency)}</td>
                <td className="p-3 text-slate-600">{formatCurrency(product.gap, currency)}</td>
                <td className="p-3 text-slate-600">{formatPercent(product.gapPercent)}</td>
                <td className="p-3"><span className={`rounded-md px-2 py-1 text-xs font-medium ${product.riskLabel === "Near market" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{product.riskLabel}</span></td>
                <td className="p-3 text-slate-600">{formatNumber(product.rows)}</td>
              </tr>
            ))}
            {!products.length && <tr><td className="p-6 text-sm text-slate-500" colSpan="7">No competitor price data available from the current CSV.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function ProductRelationshipsPanel({ relationships, state, message, refreshRelationships }) {
  const rows = relationships?.relationships || [];

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="shrink-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 text-slate-700">
          <GitBranch size={20} />
          <h2 className="text-base font-semibold">Product Relationships</h2>
        </div>
        <button className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700" onClick={refreshRelationships} type="button">
          Refresh
        </button>
      </div>
      {message && <p className={`mt-3 text-sm ${state === "error" ? "text-rose-700" : "text-slate-500"}`}>{message}</p>}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <SummaryCard icon={Package} label="Products Checked" value={formatNumber(relationships?.summary?.productsChecked || 0)} note="Across imported dates" />
        <SummaryCard icon={ChevronDown} label="Possible Substitutes" value={formatNumber(relationships?.summary?.possibleSubstitutes || 0)} note="Opposite demand movement" />
        <SummaryCard icon={ChevronUp} label="Possible Complements" value={formatNumber(relationships?.summary?.possibleComplements || 0)} note="Demand moves together" />
        <SummaryCard icon={X} label="Not Enough Data" value={formatNumber(relationships?.summary?.notEnoughData || 0)} note="Needs overlapping dates" />
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="p-3 font-medium">Product A</th>
              <th className="p-3 font-medium">Product B</th>
              <th className="p-3 font-medium">Category</th>
              <th className="p-3 font-medium">Relationship</th>
              <th className="p-3 font-medium">Evidence</th>
              <th className="p-3 font-medium">Overlap</th>
              <th className="p-3 font-medium">Correlation</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${item.leftProduct.productId}-${item.rightProduct.productId}-${index}`} className="border-b border-slate-100 last:border-0">
                <td className="p-3">
                  <p className="font-medium text-slate-900">{item.leftProduct.name}</p>
                  <p className="text-xs text-slate-500">{item.leftProduct.sku}</p>
                </td>
                <td className="p-3">
                  <p className="font-medium text-slate-900">{item.rightProduct.name}</p>
                  <p className="text-xs text-slate-500">{item.rightProduct.sku}</p>
                </td>
                <td className="p-3 text-slate-600">{item.category}</td>
                <td className="p-3"><span className={`rounded-md px-2 py-1 text-xs font-medium ${item.relationship === "Not enough overlapping data" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}>{item.relationship}</span></td>
                <td className="p-3 text-slate-600">{item.confidence}</td>
                <td className="p-3 text-slate-600">{formatNumber(item.overlappingDates)} days</td>
                <td className="p-3 text-slate-600">{item.quantityCorrelation === null ? "N/A" : Number(item.quantityCorrelation).toFixed(3)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td className="p-6 text-sm text-slate-500" colSpan="7">No product relationship signals yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {relationships?.limitations?.length > 0 && (
        <div className="mt-3 grid shrink-0 gap-2 md:grid-cols-2">
          {relationships.limitations.map((limitation) => <p key={limitation} className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-800">{limitation}</p>)}
        </div>
      )}
    </section>
  );
}
