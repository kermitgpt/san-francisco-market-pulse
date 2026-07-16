# Phase 0 — Pima County data feasibility

**Status:** Feasible for a public-records pilot, with clear limits.

Foothills Market Pulse can automate a credible 12-month view of **recent recorded sales** for Ventana Canyon, Pima Canyon, and Finisterra. The best baseline is the Pima County Assessor's bulk sales CSV joined to Assessor residential characteristics and Pima County GIS parcels. The Recorder is useful for verification and, later, paid document access; it is not the best primary feed.

The public-records version can support recorded price, recording date, assessor living area, derived price per square foot, parcel lot area, geography, price bands, and recorded-sales velocity. It cannot support inventory, days on market, contract-to-close time, listing price changes, or other MLS lifecycle metrics.

## What is actually available

| Source | Useful fields | Format and access | Freshness / lag | Recommendation |
| --- | --- | --- | --- | --- |
| Pima County Assessor — Affidavits of Sales | Parcel ID, recorder sequence number, sale month, sale price, property type, intended use, deed, financing, validation reason, related-party / solar / personal-property / partial-interest flags, exact recording date, parcel-use code | Public, direct year-specific ZIP containing CSV. The download page currently exposes 2023–2026. No documented public JSON API. [Downloads](https://www.asr.pima.gov/downloads-data) · [2026 ZIP](https://www.asr.pima.gov/Downloads/Data/sales/2026/SALE2026.ZIP) | File timestamp refreshed nightly in the spike. On July 15, 2026, the newest included recording date was July 1: an observed 14-calendar-day data lag, not a guaranteed SLA. | Primary sale feed. Fetch the current and prior year daily because prior-year validations can change. |
| Pima County Assessor — Real Property | Parcel ID, residential/condo flag, assessor living area (`SQFT`), year built, stories, rooms, quality, condition, garage, pool area and valuation fields | Public, direct ZIP/CSV files. `Mas27.csv` is the residential file. [Downloads](https://www.asr.pima.gov/downloads-data) · [2027 residential ZIP](https://www.asr.pima.gov/Downloads/Data/realprop/2027/noticeval/Mas27.ZIP) | Annual valuation snapshot; the 2027 file was dated January 28, 2026. It is not transaction-time or listing-reported data. | Use for assessor square footage and property type, with an explicit `sqft_as_of_tax_year`. |
| Pima County GIS — Parcels | Parcel ID, polygon, centroid, map-and-plat number, lot number, GIS area/acres, situs address, parcel use, legal description | Free Geospatial Data Portal plus unauthenticated ArcGIS REST. REST supports JSON, GeoJSON and PBF, with pagination. [Parcel metadata](https://gis.pima.gov/data/contents/metadet.cfm?name=paregion) · [Parcel REST layer](https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/12) | Parcel assembly runs nightly. Assessor ownership/valuation attributes can appear later after audit. | Primary parcel geometry, coordinates and lot-area feed. Do not ingest owner mailing fields. |
| Pima County GIS — Subdivisions | Subdivision polygon/name, recorder book-page, sequence number, recorded date, lot count | Free portal, weekly Shapefile export, and unauthenticated ArcGIS REST in JSON/GeoJSON/PBF. [Subdivision metadata](https://gis.pima.gov/data/contents/metadet.cfm?name=subdiv) · [Subdivision REST layer](https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/15) | Maintained as plats change; Shapefile export is regenerated weekly. | Source of truth for market membership candidates and recorded plat identifiers. |
| Pima County Recorder | Sequence/recording number, recording date, document type, pages, grantor/grantee, related document number, legal-description summary and document image | Free public search and watermarked images; no documented public API. Paid daily bulk subscription is $50 setup + $500/year. One-time historical bulk is $8,000 plus storage. The paid daily index still does not list sale price as a field. [Public search](https://www.recorder.pima.gov/PublicServices/PublicSearch) · [Fees](https://www.recorder.pima.gov/SubscriptionFees) · [Bulk agreement](https://www.recorder.pima.gov/docs/2025/Bulk%20Subscriber%20Agreement_Revised%202025.pdf) | Recorded images are published within three business days. Paid bulk is daily. [Recorder timing](https://recorder.pima.gov/DocumentPickup) | Verification / exception source. Do not make the paid Recorder feed a Phase 1 dependency. |

Arizona law explains why the Assessor feed is rich: most deeds must include an affidavit containing the sale date, total consideration, financing, parcel numbers, transaction conditions and intended use. The Recorder sends the affidavit electronically to the Assessor. Some transfers are exempt, so this is not a complete ledger of every deed. [A.R.S. §11-1133](https://www.azleg.gov/ars/11/01133.htm) · [§11-1134 exemptions](https://www.azleg.gov/ars/11/01134.htm) · [§11-1135 transmission](https://www.azleg.gov/ars/11/01135.htm)

Important date distinction: the source CSV stores `SaleDate` as `YYYYMM`, not a full date, even though the underlying affidavit requires an exact date. The UI should animate by exact `RecordingDate` and retain `sale_month` without inventing a day.

## Live spike result

The spike joined the July 15, 2026 Assessor files, the 2025 sales archive, the 2027 residential file, and live GIS parcel records. The test window was July 15, 2025 through July 15, 2026. Counts below are feasibility evidence, not publishable market statistics.

| Pilot definition tested | Current parcels | GIS lot area | Assessor sqft | Priced sale rows | Unique recorded transactions | Multi-parcel transactions | Single-parcel transactions ready for price/sqft |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pima Canyon Estates | 290 | 290 (100%) | 261 (90.0%) | 18 | 18 | 0 | 18 |
| Finisterra I–III | 193 | 193 (100%) | 185 (95.9%) | 7 | 6 | 1 | 4 |
| Ventana Canyon candidate set | 634 | 634 (100%) | 577 (91.0%) | 40 | 39 | 1 | 35 |

Two design implications were proven:

1. One recorder sequence can cover multiple parcel IDs. A sale must be counted once at the transaction level, with a many-to-many parcel bridge.
2. Price per square foot is safe by default only for a single-parcel transaction with one positive assessor living-area record. Multi-parcel price/sqft should be null unless a reviewed allocation rule applies.

## Reliable micro-market mapping

Do not use a loose subdivision-name search or only a hand-drawn geofence. The county subdivision layer contains official recorded plat identifiers in `BOOK_PAGE`; the parcel layer exposes the same identifier as `MP_OL`. Use a curated list of exact map-and-plat identifiers, pull current parcel IDs by `MP_OL`, then use geometry as an audit and split/replat fallback.

### Pilot definitions found

- **Pima Canyon:** Pima Canyon Estates plats `48089`, `50087`, `53036`, `55059`, and `57023`. “The Enclave at Pima Canyon” is separately platted as `48074`; it was excluded from the spike and needs an operator inclusion decision.
- **Finisterra:** Finisterra I–III plats `33069`, `34026`, and `43097`. This definition is unambiguous.
- **Ventana Canyon:** the name search returns many unrelated or adjacent “Ventana” developments. The candidate gated-club set uses the recorded families Ventana Canyon Estates, Golf Villas I/II, Lake Estates, Mountain Estates I/II, Ventana Country Club Estates, Deer Run, The Ridge, Clubdominiums, and Whaleback Ridge. Candidate plats are `37079`, `39021`, `41048`, `38059`, `43085`, `38032`, `38043`, `41031`, `56024`, `46002`, `46003`, `47092`, `49006`, `50055`, and `43089`. This list needs one operator sign-off before it becomes canonical.

Implementation rule:

1. Store `community_plat` rows keyed by community + exact book/page or modern sequence number.
2. Query parcels by `MP_OL` and deduplicate by parcel ID; county geometry can contain repeated subdivision polygons and multipart parcels.
3. Store a versioned `community_parcel` snapshot with membership method, source date and geometry hash.
4. Flag new plats, parcel splits, missing map/plat values and overlapping community assignments for review.
5. Use a curated boundary polygon only as a secondary spatial test—never as the sole membership rule.

## Proposed data pipeline

### Ingestion

1. **Daily sales:** fetch current-year and prior-year Assessor sales ZIPs; store immutable raw files, URL, retrieval time, checksum and HTTP metadata.
2. **Parcel geography:** query the county parcel REST layer for the canonical pilot plat keys; request only needed attributes and GeoJSON geometry.
3. **Subdivision registry:** refresh the subdivision layer weekly and detect new/changed plat keys or geometry.
4. **Residential characteristics:** fetch the current Assessor residential ZIP when its checksum changes; retain tax-year snapshots.
5. **Recorder verification:** keep a manual verification link by sequence number. Add paid bulk only if the Assessor lag becomes unacceptable or document-level auditing becomes a product requirement.

### Cleaning and quality rules

- Preserve raw source values; normalize parcel IDs as nine-character strings and recorder sequence numbers as strings.
- Parse `SaleDate` into `sale_month` plus `sale_date_precision = 'month'`; use exact `recording_date` for the timeline.
- Parse numeric sale price, reject `Unknown`, and never coerce missing values to zero.
- Group by recorder sequence number before calculating counts or medians.
- Quarantine malformed CSV rows and alert on header/schema drift. The residential CSV includes a dashed layout row and padded column names, so the loader must explicitly handle both.
- Create quality tiers:
  - **A — trend eligible:** numeric price, county `Good Sale`, and no related-party, partial-interest or personal-property flags.
  - **B — map eligible / review:** numeric price with a non-disqualifying county flag such as an out-of-state address; excluded from headline trend calculations initially.
  - **X — excluded:** pending/unknown price, non-arm's-length or duress, related parties, government/nominal/court transfers, partial interest, significant personal property, or inconsistent/unusable records.
- Store the rule version used for every derived eligibility decision.

### Logical schema

| Table / view | Purpose and key fields |
| --- | --- |
| `ingestion_run` | Source, URL, retrieved time, checksum, source file date, row counts, max recording date, status and error sample. |
| `sale_transaction` | Recorder sequence PK, sale month, sale-date precision, recording date, sale price, deed, financing, validation fields, quality tier and source lineage. |
| `sale_transaction_parcel` | Transaction-to-parcel bridge; prevents multi-parcel deeds from inflating transaction counts. |
| `parcel` | Parcel ID PK, map/plat, lot, situs address, use, lot square feet/acres, centroid and PostGIS geometry. |
| `parcel_improvement_snapshot` | Parcel + tax year, assessor sqft, SFR/condo flag, year built and other selected characteristics. |
| `community` / `community_plat` | Canonical market definition and approved recorded-plat identifiers. |
| `community_parcel` | Versioned parcel membership, method, source date and review status. |
| `recorded_sale_view` | Community, transaction, parcel, recording date, sale month, sale price, assessor sqft/as-of year, lot size, derived price/sqft, geometry, quality and freshness fields. `days_to_close` remains null. |

For condos, suppress lot-size claims unless the parcel geometry clearly represents an exclusive unit parcel. For multi-parcel transactions, suppress price/sqft until a documented allocation rule passes review.

## What public records do not provide

These require an authorized MLS feed later:

- active, coming-soon, pending, contingent, withdrawn, expired and canceled inventory;
- original/current list price, price reductions and close-to-list ratio;
- list date, pending/contract date, days on market, cumulative days on market and **days to close**;
- exact status history and relist behavior;
- seller concessions and many financing details used in market analysis;
- listing-entered square footage, room/amenity detail, condition, photos and remarks;
- reliable inventory absorption and supply metrics.

Public records can measure **recorded-sales velocity** (transactions recorded per rolling period). They cannot honestly be labeled “days to close,” “days on market,” “current inventory,” or “market absorption.”

## Recommended stack

- **Pipeline:** TypeScript on Node, using streaming ZIP/CSV processing and runtime schema validation. Keep the same language as the product unless GIS complexity later proves Python is justified.
- **Database:** managed PostgreSQL with PostGIS. It gives durable joins, spatial auditing, materialized market aggregates and a clean path to vector tiles later.
- **Raw archive:** S3-compatible object storage for immutable county ZIP/JSON snapshots and replayability.
- **Automation:** scheduled GitHub Actions job with manual replay, database credentials in repository secrets, checksum-based no-op runs, retries and lag alerts.
- **Web:** Next.js + React on the existing stack. Deploy the web app publicly, but keep raw ingestion credentials server-side.
- **Map for Phase 2:** MapLibre GL JS. It is TypeScript/WebGL based and supports vector data, data-driven styling and raster-DEM 3D terrain without coupling the data engine to one basemap vendor. [MapLibre GL JS](https://maplibre.org/projects/gl-js/) · [3D terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)
- **Privacy:** ingest only the minimum needed public fields. Exclude owner names and owner mailing addresses from storage and public output.

## Phase 1 — pipeline build

1. Lock the three canonical `community_plat` definitions; obtain the one Ventana inclusion sign-off and the Pima Canyon Enclave decision.
2. Create PostGIS schema, migrations, source registry and raw-file manifest.
3. Build idempotent sales, parcel/subdivision and residential-characteristic loaders with row quarantine and schema-drift tests.
4. Implement transaction deduplication, parcel bridge, quality tiers, community membership and derived metrics.
5. Backfill the latest 12 months, then the available 2023–present archive.
6. Validate a stratified sample against Assessor parcel pages and Recorder search; document every exception class.
7. Schedule daily ingestion and weekly boundary refresh; alert when source retrieval fails, row counts swing materially, or newest recording lag exceeds 21 days.
8. Publish a stable read-only data contract for Phase 2 and a small operator runbook.

Phase 1 acceptance criteria:

- replaying the same source files creates no duplicates;
- every displayed sale links to a source transaction and at least one current parcel geometry;
- transactions, not parcel rows, drive counts and medians;
- 100% of in-scope parcels have one approved community assignment or a quarantined exception;
- price/sqft is emitted only with a positive, source-dated sqft denominator and an eligible transaction shape;
- source freshness, sale-date precision and quality tier are available to the UI;
- automated tests cover the known malformed header row, unknown prices, multi-parcel deeds, re-recordings and parcel splits;
- no owner names or mailing addresses are stored.

## Phase 2 — map UI

1. Build the read-only map data endpoint and precomputed community pulse aggregates first.
2. Add a MapLibre terrain scene with restrained parcel/community geometry and sale markers keyed to exact recording date.
3. Add the 12-month time scrubber, price-band and price/sqft encodings, community zoom transitions and market-pulse cards.
4. Label the experience **recent recorded sales** and surface the data-through date, observed lag and metric definitions.
5. Keep pilot delivery simple: cached GeoJSON is sufficient at this size. Introduce vector tiles only when geography or history expands materially.
6. Verify desktop/mobile performance, keyboard/reduced-motion behavior, boundary accuracy and aggregate parity against the database before public release.

## Approval gate

No application, pipeline or UI code has been written. Phase 1 should begin only after approval of this report plus the Ventana Canyon and Pima Canyon Enclave boundary decisions.
