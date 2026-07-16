# Phase 0 - Pima County data feasibility

**Status:** Feasible for a low-cost public-records pilot. Awaiting approval to build Phase 1.

## Recommendation

Validate the concept with **free Pima County data only**:

- Pima County Assessor sales and residential bulk files;
- Pima County GIS parcel and subdivision APIs;
- a small scheduled TypeScript job that publishes versioned JSON/GeoJSON for the three pilot markets.

Do not buy Recorder access, provision a database, or add permanent object storage for the pilot. The Recorder can be reconsidered if the product proves useful or the Assessor's observed lag becomes unacceptable. At this size, a database-free pipeline is enough to test whether the map and market summaries are compelling.

The public version can support recorded price, exact recording date, assessor square footage, derived price per square foot, parcel lot area, price bands, geography, and recorded-sales velocity. It cannot support MLS inventory or listing lifecycle metrics.

## Public data available

| Source | Useful fields | Format and access | Freshness / lag | Pilot use |
| --- | --- | --- | --- | --- |
| Pima County Assessor - Affidavits of Sales | Parcel ID, Recorder sequence number, sale month, sale price, property/intended-use fields, deed, financing, validation reason, transaction flags, exact recording date, parcel-use code | Free year-specific ZIP/CSV bulk files; no documented public JSON API. The download page currently exposes 2023-2026. [Downloads](https://www.asr.pima.gov/downloads-data) | Refreshed frequently. In the July 15, 2026 spike, the newest included recording date was July 1: an observed 14-day lag, not a promised SLA. | Primary sale feed. Fetch current and prior year because prior records can be corrected. |
| Pima County Assessor - Real Property | Parcel ID, SFR/condo flag, assessor living area (`SQFT`), year built and selected characteristics | Free annual ZIP/CSV bulk files. `Mas27.csv` is the residential file. [Downloads](https://www.asr.pima.gov/downloads-data) | Annual tax-year snapshot; it is not transaction-time or listing-reported data. | Square-footage denominator, labeled with its tax year. |
| Pima County GIS - Parcels | Parcel ID, polygon/centroid, map-and-plat number, lot, GIS area/acres, situs address, parcel use and legal description | Free portal and unauthenticated ArcGIS REST supporting JSON/GeoJSON/PBF. [Parcel metadata](https://gis.pima.gov/data/contents/metadet.cfm?name=paregion) - [Parcel REST](https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/12) | Parcel assembly runs nightly; some Assessor attributes can trail pending audit. | Parcel location, lot size and community membership. Do not ingest owner mailing data. |
| Pima County GIS - Subdivisions | Recorded subdivision polygon/name, book-page, sequence number, recorded date and lot count | Free weekly Shapefile export plus unauthenticated ArcGIS REST. [Subdivision metadata](https://gis.pima.gov/data/contents/metadet.cfm?name=subdiv) - [Subdivision REST](https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/15) | Maintained as plats change; Shapefile export is regenerated weekly. | Exact plat registry and a boundary audit source. |
| Pima County Recorder | Recording number/date, document type, pages, parties, legal-description summary and image | Free manual search; no documented public API. Paid daily bulk is $50 setup plus $500/year, and its published index fields still do not include sale price. [Public search](https://www.recorder.pima.gov/PublicServices/PublicSearch) - [Fees](https://www.recorder.pima.gov/SubscriptionFees) | Images are generally published within three business days. [Timing](https://recorder.pima.gov/DocumentPickup) | Deferred. Optional manual exception checking only; no Phase 1 dependency. |

The Assessor feed is viable because most deeds require an affidavit with sale consideration and related transaction details, although statutory exemptions mean it is not a complete ledger of every deed. [A.R.S. 11-1133](https://www.azleg.gov/ars/11/01133.htm) - [11-1134](https://www.azleg.gov/ars/11/01134.htm) - [11-1135](https://www.azleg.gov/ars/11/01135.htm)

The source `SaleDate` is only `YYYYMM`. The timeline should therefore use exact `RecordingDate`, retain `sale_month`, and never invent a sale day.

## Measured spike result

The spike joined the July 15, 2026 Assessor files, the 2025 sales archive, the 2027 residential file, and current GIS parcels. The test window was July 15, 2025 through July 15, 2026. These are feasibility counts, not publishable market statistics.

| Pilot definition tested | Current parcels | GIS lot area | Assessor sqft | Priced sale rows | Unique transactions | Multi-parcel transactions | Single-parcel transactions ready for price/sqft |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Pima Canyon Estates + The Enclave | 304 | 304 (100%) | 271 (89.1%) | 18 | 18 | 0 | 18 |
| Finisterra I-III | 193 | 193 (100%) | 185 (95.9%) | 7 | 6 | 1 | 4 |
| Ventana corrected behind-gate plat seed | 626 | 626 (100%) | 569 (90.9%) | 41 | 40 | 1 | 36 |

The Ventana count is the corrected recorded-plat seed. The Phase 1 boundary audit may add or remove edge parcels, particularly unplatted access-only lots and non-residential/common parcels.

Two rules follow from the spike:

1. Count a Recorder sequence once at the transaction level. One recorded transaction can cover multiple parcels.
2. Calculate price/sqft by default only when a transaction has one parcel and that parcel has one positive, source-dated Assessor sqft record.

## Reliable pilot boundaries

### Pima Canyon

Include Pima Canyon Estates plats `48089`, `50087`, `53036`, `55059`, and `57023`, plus **The Enclave at Pima Canyon** plat `48074`.

### Finisterra

Include Finisterra I-III plats `33069`, `34026`, and `43097`.

### Ventana Canyon

The approved pilot meaning is **all residential parcels physically behind the main Kolb Road gate**, not every subdivision containing the word "Ventana" and not VCCA membership alone.

The VCCA says it has homes both inside and outside the main gate. It specifically places The Ridge, Ventana Entrada, Ventana del Oeste, and Westgate outside the gate, so they are excluded. It also documents access for Esperero Canyon and the ends of Stone Canyon, Hole in the Wall Way, and Hototo Place even though those properties are not VCCA members; the physical boundary should include them. [VCCA FAQ](https://ventanacanyoncommunity.com/faqs/) - [official interior map](https://ventanacanyoncommunity.com/wp-content/uploads/vc-web-map.pdf)

The corrected plat seed is:

- Ventana Canyon Estates: `37079`, `39021`, `41048`
- Golf Villas: `38059`, `43085`
- Lake Estates: `38032`
- Mountain Estates: `38043`, `41031`, `56024`
- Ventana Country Club Estates: `46002`
- Deer Run at Ventana Canyon: `46003`
- Whaleback Ridge Estates: `43089`
- Ventana Serena: `40048`
- Desert Moon Estates: `43043`
- Esperero Canyon Estates: `41028`
- Clubdominiums: `50055`

Phase 1 should encode a versioned behind-gate polygon from the official interior map and county parcel geometry. Parcel centroids inside that polygon become the primary membership rule; exact plats provide an audit and edge-case override. This catches access-only/unplatted parcels while preventing outside-gate "Ventana" developments from leaking into the market.

Every community assignment should retain its method (`plat`, `centroid`, or reviewed override), source date, boundary version and review status. New plats, parcel splits, overlapping assignments and parcels on the boundary should be flagged automatically.

## Lean data pipeline

1. **Ingest:** fetch current/prior-year Assessor sales ZIPs daily, the current residential ZIP when its checksum changes, pilot parcels from GIS REST, and the subdivision registry weekly.
2. **Record lineage:** keep source URL, retrieval time, checksum, row counts, maximum recording date and schema version. Process raw county files during the job; permanent raw-file storage is deferred for the pilot.
3. **Clean:** normalize nine-character parcel IDs and sequence numbers; preserve raw values; quarantine malformed rows and schema drift; retain `sale_month` with month precision and exact `recording_date`.
4. **Deduplicate:** create one transaction per Recorder sequence and a transaction-to-parcel bridge.
5. **Qualify:** make numeric, county-validated arm's-length sales trend-eligible; keep reviewable sales separate; exclude unknown/nominal price, related-party, partial-interest, personal-property, duress and other unsuitable transfers from headline trends.
6. **Enrich:** join parcel lot area, centroid/geometry, source-dated Assessor sqft and versioned community membership.
7. **Publish:** generate small deterministic JSON/GeoJSON files for the latest 12 months and community summaries. Include data-through date, lag, quality tier and source lineage.

### Logical schema

| Record | Key fields |
| --- | --- |
| `source_manifest` | Source URL, retrieval time, checksum, source date, row counts, max recording date, schema version and status. |
| `sale_transaction` | Sequence ID, sale month, date precision, recording date, sale price, deed/financing, validation fields, quality tier and rule version. |
| `sale_transaction_parcel` | Sequence ID + parcel ID bridge. |
| `parcel` | Parcel ID, map/plat, lot, situs address, use, lot sqft/acres, centroid and geometry. |
| `parcel_improvement` | Parcel ID + tax year, Assessor sqft, SFR/condo flag and selected characteristics. |
| `community_membership` | Community, parcel ID, plat, membership method, boundary version, source date and review status. |
| `recorded_sale` | Community, transaction, parcel, recording date, sale month, price, sqft/as-of year, lot size, derived price/sqft, geometry, quality and freshness. `days_to_close` is null. |

For condos, suppress lot-size claims unless geometry represents an exclusive unit parcel. For multi-parcel transactions, suppress price/sqft unless a documented allocation rule is later approved.

## What public records do not provide

An authorized MLS feed is still required for:

- active, coming-soon, pending, contingent, withdrawn, expired and canceled inventory;
- original/current list price, price reductions and close-to-list ratio;
- list date, pending/contract date, days on market, cumulative days on market and **days to close**;
- status history, relists, seller concessions and many financing details;
- listing-entered sqft, condition, amenities, photos and remarks;
- reliable absorption and months-of-supply metrics.

Public records can support **recorded-sales velocity**. They cannot honestly support days to close, days on market, current inventory or market absorption.

## Recommended stack for the cheapest pilot

- **Pipeline:** TypeScript on Node with streaming ZIP/CSV parsing and runtime schema validation.
- **Automation:** a scheduled GitHub Actions workflow with a manual replay option, checksum-based no-op runs, retries and lag alerts.
- **Storage/output:** versioned normalized JSON and GeoJSON in the private repo. No database or permanent object store for the pilot.
- **Web in Phase 2:** Next.js + React, reading the generated static data files.
- **Map in Phase 2:** MapLibre GL JS for data-driven styling and later terrain support. [MapLibre GL JS](https://maplibre.org/projects/gl-js/) - [3D terrain example](https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/)
- **Privacy:** do not store or publish owner names or owner mailing addresses.

This should add no new data-source bill and no new infrastructure service at pilot scale, subject to the existing GitHub/deployment account quotas. Move to PostgreSQL/PostGIS and immutable object storage only after a clear validation signal: more markets/history, an MLS feed, operator corrections, multiple downstream products, or an API that needs concurrent querying.

## Phase 1 - lean pipeline build

1. Encode the Pima Canyon and Finisterra plat lists plus the versioned Ventana behind-gate polygon and plat audit list.
2. Build idempotent Assessor sales/residential and GIS parcel/subdivision loaders with schema-drift quarantine.
3. Implement transaction deduplication, parcel bridging, quality tiers, community membership and derived metrics.
4. Backfill the latest 12 months and emit the read-only JSON/GeoJSON contract needed by the map.
5. Test unknown prices, malformed headers, multi-parcel deeds, missing sqft, parcel splits and Ventana boundary edges.
6. Schedule daily sale refreshes and weekly geography refreshes; alert when retrieval fails or newest recording lag exceeds 21 days.
7. Add a one-page operator runbook and a simple feasibility output: sale coverage, missing-data rates and sample community pulse summaries.

Phase 1 is accepted when reruns create no duplicates; transaction counts are not inflated by parcel rows; every displayed sale has current geometry and source lineage; price/sqft is denominator-safe; all in-scope parcels have an approved assignment or quarantined exception; and no owner names or mailing addresses are stored.

## Phase 2 - map UI

1. Build the read-only data adapter and precomputed community pulse summaries.
2. Add the restrained MapLibre terrain/map scene and sale markers keyed to exact recording date.
3. Add the 12-month time scrubber, price bands, price/sqft encoding, community zoom transitions and market-pulse cards.
4. Label the experience **recent recorded sales** and show the data-through date, observed lag and metric definitions.
5. Validate desktop/mobile performance, keyboard and reduced-motion behavior, boundary accuracy and aggregate parity before public release.

## Approval gate

No application, pipeline or UI code has been written. The Enclave is included, and Ventana is defined as the complete residential area behind the main Kolb gate. Phase 1 begins only after explicit approval.
