import { formatCurrency } from "../utils/formatters";

const CHART_COLORS = {
  dot: "#3b82f6",
  dotHover: "#2563eb",
  line: "#0f172a",
  grid: "#e2e8f0",
  axis: "#64748b",
  areaFill: "rgba(15,23,42,0.08)",
  scenario1: "#0f172a",
  scenario2: "#475569",
  scenario3: "#94a3b8",
  heatLow: "#dbeafe",
  heatHigh: "#1e40af"
};

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function niceAxisTicks(min, max, targetTicks = 5) {
  if (max <= min) return [min];
  const range = max - min;
  const roughStep = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const candidates = [1, 2, 5, 10];
  const step = candidates.map((c) => c * magnitude).find((s) => range / s <= targetTicks + 1) || roughStep;
  const ticks = [];
  const start = Math.floor(min / step) * step;
  for (let v = start; v <= max + step * 0.01; v += step) {
    ticks.push(Number(v.toFixed(6)));
  }
  return ticks;
}

function compactNumber(value) {
  if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return Number(value).toFixed(value % 1 === 0 ? 0 : 1);
}

// ─── Chart 1: Demand Curve ──────────────────────────────────────────────────

export function DemandCurveChart({ model, currency = "USD" }) {
  const comparison = model?.modelComparison || {};
  const actualPoints = comparison.demandCurvePoints || [];
  const fittedPoints = comparison.fittedCurvePoints || [];

  if (actualPoints.length < 3) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Not enough demand points to draw a curve. Need at least 3 grouped demand points.
      </div>
    );
  }

  const allPrices = [...actualPoints.map((p) => p.price), ...fittedPoints.map((p) => p.price)];
  const allDemands = [...actualPoints.map((p) => p.actualDemand), ...fittedPoints.map((p) => p.predictedDemand)];
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const maxDemand = Math.max(...allDemands);

  const pad = { top: 20, right: 20, bottom: 36, left: 52 };
  const w = 560;
  const h = 240;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const xScale = (price) => pad.left + ((price - minPrice) / (maxPrice - minPrice || 1)) * plotW;
  const yScale = (demand) => pad.top + plotH - (demand / (maxDemand || 1)) * plotH;

  const xTicks = niceAxisTicks(minPrice, maxPrice, 5);
  const yTicks = niceAxisTicks(0, maxDemand, 4);

  const linePath = fittedPoints.map((p, i) => `${i === 0 ? "M" : "L"}${xScale(p.price).toFixed(1)},${yScale(p.predictedDemand).toFixed(1)}`).join(" ");

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {/* grid lines */}
      {yTicks.map((v) => (
        <line key={`yg-${v}`} x1={pad.left} x2={w - pad.right} y1={yScale(v)} y2={yScale(v)} stroke={CHART_COLORS.grid} strokeWidth="1" />
      ))}
      {xTicks.map((v) => (
        <line key={`xg-${v}`} x1={xScale(v)} x2={xScale(v)} y1={pad.top} y2={h - pad.bottom} stroke={CHART_COLORS.grid} strokeWidth="1" />
      ))}

      {/* fitted line */}
      <path d={linePath} fill="none" stroke={CHART_COLORS.line} strokeWidth="2" strokeLinejoin="round" />

      {/* actual points */}
      {actualPoints.map((p, i) => (
        <g key={`dot-${i}`}>
          <circle cx={xScale(p.price)} cy={yScale(p.actualDemand)} r="4.5" fill={CHART_COLORS.dot} stroke="white" strokeWidth="1.5" className="transition-transform hover:scale-150" style={{ transformOrigin: `${xScale(p.price)}px ${yScale(p.actualDemand)}px` }}>
            <title>{`Price: ${formatCurrency(p.price, currency)}\nActual: ${compactNumber(p.actualDemand)} units\nPredicted: ${compactNumber(p.predictedDemand)} units`}</title>
          </circle>
        </g>
      ))}

      {/* x-axis labels */}
      {xTicks.map((v) => (
        <text key={`xl-${v}`} x={xScale(v)} y={h - pad.bottom + 18} textAnchor="middle" fontSize="10" fill={CHART_COLORS.axis}>{compactNumber(v)}</text>
      ))}
      <text x={pad.left + plotW / 2} y={h - 2} textAnchor="middle" fontSize="10" fill={CHART_COLORS.axis} fontWeight="600">Price</text>

      {/* y-axis labels */}
      {yTicks.map((v) => (
        <text key={`yl-${v}`} x={pad.left - 6} y={yScale(v) + 3} textAnchor="end" fontSize="10" fill={CHART_COLORS.axis}>{compactNumber(v)}</text>
      ))}
      <text x={14} y={pad.top + plotH / 2} textAnchor="middle" fontSize="10" fill={CHART_COLORS.axis} fontWeight="600" transform={`rotate(-90, 14, ${pad.top + plotH / 2})`}>Demand</text>

      {/* legend */}
      <circle cx={pad.left + 8} cy={pad.top + 6} r="4" fill={CHART_COLORS.dot} />
      <text x={pad.left + 16} y={pad.top + 10} fontSize="9" fill={CHART_COLORS.axis}>Actual</text>
      <line x1={pad.left + 56} x2={pad.left + 72} y1={pad.top + 6} y2={pad.top + 6} stroke={CHART_COLORS.line} strokeWidth="2" />
      <text x={pad.left + 76} y={pad.top + 10} fontSize="9" fill={CHART_COLORS.axis}>Fitted model</text>
    </svg>
  );
}

// ─── Chart 2: Scenario Comparison ───────────────────────────────────────────

export function ScenarioComparisonChart({ scenarios = [], currency = "USD" }) {
  if (!scenarios.length) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Run the scenario planner to see a visual comparison.
      </div>
    );
  }

  const metrics = [
    { key: "expectedDemand", label: "Demand", format: (v) => `${compactNumber(v)} units` },
    { key: "expectedRevenue", label: "Revenue", format: (v) => formatCurrency(v, currency) },
    { key: "expectedProfit", label: "Profit", format: (v) => formatCurrency(v, currency) }
  ];

  const barColors = [CHART_COLORS.scenario1, CHART_COLORS.scenario2, CHART_COLORS.scenario3];
  const pad = { top: 24, right: 16, bottom: 28, left: 16 };
  const w = 560;
  const h = 200;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const groupWidth = plotW / metrics.length;
  const barWidth = Math.min(36, (groupWidth - 20) / scenarios.length);

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {metrics.map((metric, gi) => {
        const groupX = pad.left + gi * groupWidth;
        const maxVal = Math.max(...scenarios.map((s) => Math.abs(Number(s[metric.key] || 0))), 1);
        return (
          <g key={metric.key}>
            <text x={groupX + groupWidth / 2} y={h - 6} textAnchor="middle" fontSize="10" fill={CHART_COLORS.axis} fontWeight="600">{metric.label}</text>
            {scenarios.map((scenario, si) => {
              const val = Number(scenario[metric.key] || 0);
              const barH = Math.max(2, (Math.abs(val) / maxVal) * plotH);
              const x = groupX + (groupWidth - scenarios.length * barWidth) / 2 + si * barWidth;
              const y = pad.top + plotH - barH;
              return (
                <g key={`${metric.key}-${si}`}>
                  <rect x={x} y={y} width={barWidth - 2} height={barH} rx="3" fill={barColors[si % 3]}>
                    <title>{`${scenario.label || `Price ${si + 1}`}: ${formatCurrency(scenario.price, currency)}\n${metric.label}: ${metric.format(val)}`}</title>
                  </rect>
                  <text x={x + (barWidth - 2) / 2} y={y - 4} textAnchor="middle" fontSize="8" fill={CHART_COLORS.axis}>{compactNumber(val)}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      {/* legend */}
      {scenarios.map((scenario, si) => (
        <g key={`leg-${si}`}>
          <rect x={pad.left + si * 120} y={4} width="10" height="10" rx="2" fill={barColors[si % 3]} />
          <text x={pad.left + si * 120 + 14} y={12} fontSize="9" fill={CHART_COLORS.axis}>{scenario.label || `Price ${si + 1}`} ({formatCurrency(scenario.price, currency)})</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Chart 3: Revenue Trend Line ────────────────────────────────────────────

export function RevenueTrendChart({ data = [], dataKey = "revenue", currency = "USD" }) {
  if (data.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Not enough monthly data to show a trend. Need at least 2 months.
      </div>
    );
  }

  const values = data.map((d) => Number(d[dataKey] || 0));
  const maxVal = Math.max(...values, 1);

  const pad = { top: 16, right: 24, bottom: 32, left: 52 };
  const w = 560;
  const h = 200;
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;

  const xScale = (i) => pad.left + (i / (data.length - 1)) * plotW;
  const yScale = (v) => pad.top + plotH - (v / maxVal) * plotH;

  const linePath = values.map((v, i) => `${i === 0 ? "M" : "L"}${xScale(i).toFixed(1)},${yScale(v).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L${xScale(data.length - 1).toFixed(1)},${(pad.top + plotH).toFixed(1)} L${xScale(0).toFixed(1)},${(pad.top + plotH).toFixed(1)} Z`;

  const yTicks = niceAxisTicks(0, maxVal, 4);

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {/* grid */}
      {yTicks.map((v) => (
        <line key={`yg-${v}`} x1={pad.left} x2={w - pad.right} y1={yScale(v)} y2={yScale(v)} stroke={CHART_COLORS.grid} strokeWidth="1" />
      ))}

      {/* area fill */}
      <path d={areaPath} fill={CHART_COLORS.areaFill} />

      {/* line */}
      <path d={linePath} fill="none" stroke={CHART_COLORS.line} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* dots */}
      {values.map((v, i) => (
        <circle key={`d-${i}`} cx={xScale(i)} cy={yScale(v)} r="4" fill={CHART_COLORS.line} stroke="white" strokeWidth="1.5" className="transition-transform hover:scale-150" style={{ transformOrigin: `${xScale(i)}px ${yScale(v)}px` }}>
          <title>{`${data[i].month}: ${formatCurrency(v, currency)}`}</title>
        </circle>
      ))}

      {/* x-axis */}
      {data.map((d, i) => (
        <text key={`xl-${i}`} x={xScale(i)} y={h - pad.bottom + 16} textAnchor="middle" fontSize="9" fill={CHART_COLORS.axis}>
          {typeof d.month === "number" ? (MONTH_NAMES[d.month - 1] || d.month) : d.month}
        </text>
      ))}

      {/* y-axis */}
      {yTicks.map((v) => (
        <text key={`yl-${v}`} x={pad.left - 6} y={yScale(v) + 3} textAnchor="end" fontSize="9" fill={CHART_COLORS.axis}>{compactNumber(v)}</text>
      ))}
    </svg>
  );
}

// ─── Chart 4: Seasonality Heatmap ───────────────────────────────────────────

export function SeasonalityHeatmap({ data = [] }) {
  if (data.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
        Not enough monthly data to show seasonality. Need at least 2 months.
      </div>
    );
  }

  const maxIndex = Math.max(...data.map((d) => Number(d.demandIndex || 0)), 1);
  const minIndex = Math.min(...data.map((d) => Number(d.demandIndex || 0)), 0);

  const pad = { top: 8, right: 16, bottom: 8, left: 40 };
  const barHeight = 22;
  const gap = 4;
  const w = 560;
  const h = pad.top + data.length * (barHeight + gap) + pad.bottom;
  const plotW = w - pad.left - pad.right;

  function heatColor(index) {
    const t = maxIndex > minIndex ? (index - minIndex) / (maxIndex - minIndex) : 0.5;
    const r = Math.round(lerp(219, 30, t));
    const g = Math.round(lerp(234, 64, t));
    const b = Math.round(lerp(254, 175, t));
    return `rgb(${r},${g},${b})`;
  }

  return (
    <svg className="w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet">
      {/* baseline 100 line */}
      {maxIndex >= 100 && (
        <>
          <line
            x1={pad.left + (100 / maxIndex) * plotW}
            x2={pad.left + (100 / maxIndex) * plotW}
            y1={pad.top}
            y2={h - pad.bottom}
            stroke={CHART_COLORS.axis}
            strokeWidth="1"
            strokeDasharray="4,3"
          />
          <text x={pad.left + (100 / maxIndex) * plotW} y={pad.top - 1} textAnchor="middle" fontSize="8" fill={CHART_COLORS.axis}>avg (100)</text>
        </>
      )}

      {data.map((item, i) => {
        const index = Number(item.demandIndex || 0);
        const barW = Math.max(2, (index / maxIndex) * plotW);
        const y = pad.top + i * (barHeight + gap);
        const monthLabel = typeof item.month === "number" ? (MONTH_NAMES[item.month - 1] || item.month) : item.month;

        return (
          <g key={`bar-${i}`}>
            <text x={pad.left - 4} y={y + barHeight / 2 + 4} textAnchor="end" fontSize="10" fill={CHART_COLORS.axis}>{monthLabel}</text>
            <rect x={pad.left} y={y} width={barW} height={barHeight} rx="3" fill={heatColor(index)}>
              <title>{`${monthLabel}: Demand index ${index.toFixed(1)}`}</title>
            </rect>
            <text x={pad.left + barW + 4} y={y + barHeight / 2 + 4} fontSize="10" fill={CHART_COLORS.axis} fontWeight="500">{index.toFixed(1)}</text>
          </g>
        );
      })}
    </svg>
  );
}
