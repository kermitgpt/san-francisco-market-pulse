import { sha256 } from "./hash.js";

export interface DownloadedSource {
  name: string;
  url: string;
  retrievedAt: string;
  sha256: string;
  bytes: number;
  buffer: Buffer;
}

export async function downloadSource(name: string, url: string): Promise<DownloadedSource> {
  const response = await fetch(url, {
    headers: { "user-agent": "foothills-market-pulse/0.1 data-feasibility-pilot" },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${name}: ${response.status} ${response.statusText} (${url})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    name,
    url,
    retrievedAt: new Date().toISOString(),
    sha256: sha256(buffer),
    bytes: buffer.byteLength,
    buffer,
  };
}

export async function downloadFirstAvailable(
  candidates: readonly { name: string; url: string }[],
): Promise<DownloadedSource> {
  const errors: string[] = [];

  for (const candidate of candidates) {
    try {
      return await downloadSource(candidate.name, candidate.url);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(`No candidate source was available:\n${errors.join("\n")}`);
}
