import type { MonthlyValue } from "@/src/types";

interface PulseChartProps {
  name: string;
  history: readonly MonthlyValue[];
  activeIndex: number;
}

const WIDTH = 440;
const HEIGHT = 190;
const PADDING = { top: 24, right: 12, bottom: 28, left: 12 };

export function PulseChart({ name, history, activeIndex }: PulseChartProps) {
  if (history.length < 2) return null;
  const values = history.map((point) => point.value);
  const rawLow = Math.min(...values);
  const rawHigh = Math.max(...values);
  const spread = Math.max(rawHigh - rawLow, rawHigh * 0.05);
  const low = rawLow - spread * 0.12;
  const high = rawHigh + spread * 0.12;
  const plotWidth = WIDTH - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const x = (index: number) => PADDING.left + (index / (history.length - 1)) * plotWidth;
  const y = (value: number) => PADDING.top + (1 - (value - low) / (high - low)) * plotHeight;
  const linePath = history
    .map((point, index) => `${index === 0 ? "M" : "L"}${x(index)},${y(point.value)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(history.length - 1)},${PADDING.top + plotHeight} L${x(0)},${PADDING.top + plotHeight} Z`;
  const currentIndex = Math.max(0, Math.min(history.length - 1, activeIndex));
  const current = history[currentIndex];
  if (!current) return null;
  const titleId = `chart-title-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <div className="pulse-chart-wrap">
      <div className="chart-heading">
        <span>36-month value path</span>
        <span>{formatCompactCurrency(rawLow)} — {formatCompactCurrency(rawHigh)}</span>
      </div>
      <svg className="pulse-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{`${name} typical home-value history, ${formatMonthYear(history[0]?.date ?? "")} through ${formatMonthYear(history.at(-1)?.date ?? "")}.`}</title>
        <defs>
          <linearGradient id={`${titleId}-area`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="chart-rule" x1={PADDING.left} y1={PADDING.top + plotHeight} x2={WIDTH - PADDING.right} y2={PADDING.top + plotHeight} />
        <path className="chart-area" d={areaPath} fill={`url(#${titleId}-area)`} />
        <path className="chart-trend-line" d={linePath} />
        <line className="chart-scrub-line" x1={x(currentIndex)} y1={PADDING.top} x2={x(currentIndex)} y2={PADDING.top + plotHeight} />
        <circle className="chart-point" cx={x(currentIndex)} cy={y(current.value)} r="4.3">
          <title>{`${formatCurrency(current.value)} in ${formatMonthYear(current.date)}`}</title>
        </circle>
        <text className="chart-axis-label" x={PADDING.left} y={HEIGHT - 6}>{formatMonthYear(history[0]?.date ?? "")}</text>
        <text className="chart-axis-label chart-axis-label-end" x={WIDTH - PADDING.right} y={HEIGHT - 6}>{formatMonthYear(history.at(-1)?.date ?? "")}</text>
      </svg>
    </div>
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatMonthYear(value: string): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}
