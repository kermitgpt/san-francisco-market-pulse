import { Readable } from "node:stream";
import { parse } from "csv-parse";
import unzipper from "unzipper";
import type { ZodType } from "zod";

export interface CsvReadResult {
  rowCount: number;
  invalidRowCount: number;
  invalidSamples: string[];
}

export async function readCsvFromZip<T>(
  buffer: Buffer,
  schema: ZodType<T>,
  onRow: (row: T) => void | Promise<void>,
): Promise<CsvReadResult> {
  let rowCount = 0;
  let invalidRowCount = 0;
  const invalidSamples: string[] = [];
  const zipEntry = Readable.from(buffer).pipe(unzipper.ParseOne(/\.csv$/i));
  const records = zipEntry.pipe(
    parse({
      bom: true,
      columns: (headers: string[]) => headers.map((header) => header.trim()),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      skip_records_with_error: true,
      trim: false,
      on_skip: (error) => {
        rowCount += 1;
        invalidRowCount += 1;
        if (invalidSamples.length < 5) invalidSamples.push(error?.message ?? "CSV parse error");
        return undefined;
      },
    }),
  );

  for await (const rawRow of records) {
    rowCount += 1;
    const parsed = schema.safeParse(rawRow);
    if (!parsed.success) {
      invalidRowCount += 1;
      if (invalidSamples.length < 5) {
        invalidSamples.push(parsed.error.issues.map((issue) => issue.message).join("; "));
      }
      continue;
    }
    await onRow(parsed.data);
  }

  return { rowCount, invalidRowCount, invalidSamples };
}
