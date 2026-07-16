import type { CommunitySummary, RecordedSale } from "@/src/types";

interface PulseChartProps {
  community: CommunitySummary;
  sales: readonly RecordedSale[];
  visibleThrough: string;
}

const WIDTH = 420;
const HEIGHT = 176;
const PADDING = { top: 16, right: 14, bottom: 30, left: 14 };

export function PulseChart({ community, sales, visibleThrough }: PulseChartProps) {
  const marketSales = uniqueTransactions(
    sales.filter(
      (sale) =>
        sale.communityId === community.id &&
        sale.residentialScope &&
        sale.salePrice !== null &&
        sale.qualityTier !== "X" &&
        sale.membershipReviewStatus === "approved" &&
        sale.recordingDate >= community.analysisWindowStartDate &&
        sale.recordingDate <= community.analysisWindowEndDate,
    ),
  );
  const plottedSales = community.trendLineEligible
    ? marketSales.filter((sale) => sale.qualityTier === "A")
    : marketSales;

  if (plottedSales.length === 0) {
    return <p className="chart-empty">No qualifying recorded sales in this window.</p>;
  }

  const start = Date.parse(`${community.analysisWindowStartDate}T00:00:00Z`);
  const end = Date.parse(`${community.analysisWindowEndDate}T00:00:00Z`);
  const prices = plottedSales.map((sale) => sale.salePrice ?? 0);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const pricePadding = Math.max((high - low) * 0.12, 50_000);
  const minPrice = Math.max(0, low - pricePadding);
  const maxPrice = high + pricePadding;
  const chartWidth = WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const x = (date: string) =>
    PADDING.left +
    ((Date.parse(`${date}T00:00:00Z`) - start) / Math.max(1, end - start)) * chartWidth;
  const y = (price: number) =>
    PADDING.top + (1 - (price - minPrice) / Math.max(1, maxPrice - minPrice)) * chartHeight;
  const orderedSales = [...plottedSales].sort((left, right) =>
    `${left.recordingDate}:${left.sequenceId}`.localeCompare(
      `${right.recordingDate}:${right.sequenceId}`,
    ),
  );
  const linePath = orderedSales
    .map((sale, index) => `${index === 0 ? "M" : "L"}${x(sale.recordingDate)},${y(sale.salePrice ?? 0)}`)
    .join(" ");
  const scrubX = Math.max(PADDING.left, Math.min(WIDTH - PADDING.right, x(visibleThrough)));
  const titleId = `pulse-chart-${community.id}`;

  return (
    <div className="pulse-chart-wrap">
      <div className="chart-heading">
        <span>{community.trendLineEligible ? "Validated price path" : "Individual recorded sales"}</span>
        <span className="chart-count">
          {plottedSales.length} {plottedSales.length === 1 ? "sale" : "sales"}
        </span>
      </div>
      <svg
        className="pulse-chart"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          {community.trendLineEligible
            ? `${community.name} county-validated recorded sale prices across ${community.analysisWindowMonths} months.`
            : `${community.name} individual recorded sale prices; no trend line because fewer than eight sales meet the strict trend tier.`}
        </title>
        <line
          className="chart-rule"
          x1={PADDING.left}
          y1={PADDING.top + chartHeight}
          x2={WIDTH - PADDING.right}
          y2={PADDING.top + chartHeight}
        />
        <line
          className="chart-scrub-line"
          x1={scrubX}
          y1={PADDING.top}
          x2={scrubX}
          y2={PADDING.top + chartHeight}
        />
        {community.trendLineEligible && orderedSales.length >= 2 ? (
          <path className="chart-trend-line" d={linePath} />
        ) : null}
        {orderedSales.map((sale) => {
          const isVisible = sale.recordingDate <= visibleThrough;
          return (
            <circle
              className={isVisible ? "chart-point" : "chart-point chart-point-future"}
              key={sale.sequenceId}
              cx={x(sale.recordingDate)}
              cy={y(sale.salePrice ?? 0)}
              r={community.trendLineEligible ? 3.4 : 4.2}
            >
              <title>
                {`${formatCurrency(sale.salePrice ?? 0)} recorded ${formatDate(sale.recordingDate)}`}
              </title>
            </circle>
          );
        })}
        <text className="chart-axis-label" x={PADDING.left} y={HEIGHT - 7}>
          {formatMonthYear(community.analysisWindowStartDate)}
        </text>
        <text
          className="chart-axis-label chart-axis-label-end"
          x={WIDTH - PADDING.right}
          y={HEIGHT - 7}
        >
          {formatMonthYear(community.analysisWindowEndDate)}
        </text>
        <text className="chart-price-label" x={PADDING.left} y={PADDING.top + 2}>
          {formatCompactCurrency(high)}
        </text>
      </svg>
    </div>
  );
}

function uniqueTransactions(sales: readonly RecordedSale[]): RecordedSale[] {
  const transactions = new Map<string, RecordedSale>();
  for (const sale of sales) {
    if (!transactions.has(sale.sequenceId)) transactions.set(sale.sequenceId, sale);
  }
  return [...transactions.values()];
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMonthYear(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
