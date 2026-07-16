# Phase 1 operator runbook

The Phase 1 pipeline uses only free Pima County Assessor bulk files and Pima County GIS REST services. It does not use the Recorder, MLS credentials, a database, or owner mailing data.

## Routine operation

The GitHub workflow runs daily at 7:30 a.m. Arizona time and can also be started manually from the repository's Actions tab. It:

1. downloads every sales archive needed for a complete trailing 36 months, the latest residential characteristics file, pilot parcels, and recorded subdivisions;
2. validates and normalizes the source rows;
3. deduplicates transactions by Recorder sequence;
4. applies the approved community boundary rules, market-sale filter, quality tiers, and adaptive 12/18/24/30/36-month windows;
5. rewrites the static files in `data/processed` only when a source fingerprint or boundary configuration changes;
6. commits changed processed outputs to `main`.

No secrets are required. A failure leaves the last verified output in place.

## Local verification

From the repository root:

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm pipeline
```

Set `FMP_FORCE=1` to rebuild even when source fingerprints are unchanged. Set `FMP_AS_OF_DATE=YYYY-MM-DD` to test source URL selection for a specific year.

## Outputs

- `market-pulse.json`: the Phase 2 read-only data contract;
- `recorded-sales.geojson`: map-eligible sale points;
- `community-boundaries.geojson`: county subdivision geometry labeled with the approved community and boundary version;
- `source-manifest.json`: source URLs, retrieval timestamps, checksums, row counts, and data-through date;
- `quality-report.json`: boundary reviews, exclusions, missing sqft, multi-parcel counts, CSV issues, and the privacy field audit.
- `market-sales-review.md`: every full-pull market-eligible transaction in one review table, the unresolved edge parcels, and the exact market-sale filter and limitations.

The public label is **recent recorded sales**. `SaleDate` retains month precision, map animation uses exact `RecordingDate`, and `daysToClose` remains null.

The parcel boundary layer intentionally retains common, club, and vacant candidate parcels for auditability. Only transactions on approved boundary memberships classified as `Single Family` or `Condo/Townhouse`, with one consistent price of at least $50,000 and quality tier A or B, are emitted to the public sale-point GeoJSON and community pulse summaries. Quitclaims and flagged nominal, related-party, partial-interest, personal-property, non-arm's-length, lot/parcel-split, court/government, intermediary, inconsistent, and unusable transactions are excluded.

Each community starts with a trailing-12-month count. If it has fewer than 12 market sales, the pipeline tests 18, 24, 30, and 36 months and selects the first window reaching 12, or 36 months if none does. Trend lines require at least eight tier-A sales in that window. Current price medians always use trailing-12-month sales only; extended sales never flow into today's price-level metrics.

## Alerts and intervention

Treat a failed workflow, a source schema error, or a newest-recording lag over 21 days as actionable. Review `quality-report.json` when:

- `needsReviewCount` increases for any community;
- a new or replacement plat is recorded;
- a parcel split creates overlapping or missing membership;
- source row counts change materially;
- a previously single-parcel transaction becomes multi-parcel.

Ventana is geographic, not HOA-based. Esperero Canyon and the documented gate-access ends of Stone Canyon, Hole in the Wall Way, and Hototo Place stay included. The Ridge, Ventana Entrada, Ventana del Oeste, and Westgate stay excluded.

The first geographic audit found seven unplatted residential/access parcels on those end streets. They are stored as reviewed parcel overrides in the versioned Ventana definition. Large non-residential parcels at `6850 N Hole in the Wall Way` and `7300 E Stone Canyon Drive` are outside the residential rule and are not overrides.
