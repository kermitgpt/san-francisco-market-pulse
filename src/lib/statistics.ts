export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const current = sorted[middle];
  if (current === undefined) return null;
  if (sorted.length % 2 === 1) return current;
  const previous = sorted[middle - 1];
  return previous === undefined ? current : (previous + current) / 2;
}

export function subtractOneYear(isoDate: string): string {
  return subtractMonths(isoDate, 12);
}

export type AnalysisWindowMonths = 12 | 18 | 24 | 30 | 36;

export interface AnalysisWindow {
  months: AnalysisWindowMonths;
  startDate: string;
  saleCount: number;
  trailing12MonthSaleCount: number;
}

export function subtractMonths(isoDate: string, months: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate) || !Number.isInteger(months) || months < 0) {
    throw new Error(`Invalid ISO date or month count: ${isoDate}, ${months}`);
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid ISO date: ${isoDate}`);

  const sourceDay = date.getUTCDate();
  const targetMonthIndex = date.getUTCFullYear() * 12 + date.getUTCMonth() - months;
  const targetYear = Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return new Date(Date.UTC(targetYear, targetMonth, Math.min(sourceDay, lastTargetDay)))
    .toISOString()
    .slice(0, 10);
}

export function selectAdaptiveWindow(
  dataThroughDate: string,
  recordingDates: readonly string[],
  targetSaleCount = 12,
): AnalysisWindow {
  const candidateMonths: readonly AnalysisWindowMonths[] = [12, 18, 24, 30, 36];
  const counts = candidateMonths.map((months) => {
    const startDate = subtractMonths(dataThroughDate, months);
    const saleCount = recordingDates.filter(
      (recordingDate) => recordingDate >= startDate && recordingDate <= dataThroughDate,
    ).length;
    return { months, startDate, saleCount };
  });
  const selected = counts.find((candidate) => candidate.saleCount >= targetSaleCount) ?? counts.at(-1);
  const trailing = counts[0];
  if (!selected || !trailing) throw new Error("Adaptive-window candidates were not created");
  return {
    months: selected.months,
    startDate: selected.startDate,
    saleCount: selected.saleCount,
    trailing12MonthSaleCount: trailing.saleCount,
  };
}
