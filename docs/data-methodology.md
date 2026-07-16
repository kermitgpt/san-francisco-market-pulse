# Data methodology

## Product definition

San Francisco Market Pulse is a **neighborhood home-value and residential-transfer explorer**. It visualizes the Zillow Home Value Index (ZHVI) for selected San Francisco neighborhoods across a 36-month display window and overlays parcel-level residential transfer records from the latest complete DataSF assessor roll.

ZHVI is Zillow's modeled measure of the typical value for homes in a region. This build uses the all-homes, middle-tier, seasonally adjusted neighborhood series. It must never be labeled as a sale price, median recorded price, appraisal, or MLS statistic.

## Why this is the zero-cost public-data route

The [DataSF historical secured property tax roll](https://data.sfgov.org/Housing-and-Buildings/Assessor-Historical-Secured-Property-Tax-Rolls/wv5m-vpq2) exposes parcels, property characteristics, assessed values, and a current sale date, but no sale consideration price. The [Assessor-Recorder property-transfer fact sheet](https://media.api.sf.gov/documents/ASR_Factsheet_PropertyTransfer_English_2021_Cy4s1cO.pdf) explains that recorded documents can be searched online, while complete documents are obtained from the office or by mail. No official bulk/API sale-price feed was found.

The zero-cost demo therefore pairs official city boundaries and parcel-transfer dates with Zillow Research's public neighborhood ZHVI. Individual transaction prices, price per square foot, days on market, inventory, list-to-sale ratio, and days to close still require a licensed MLS or commercial recorder feed later.

## Transfer-dot rule

Each dot is one parcel record in the latest available assessor roll that meets all of these deterministic conditions:

1. Its property use code is `SRES` or `MRES`.
2. It has point geometry and a non-null `current_sales_date`.
3. That date falls within the 36-month display period.
4. Its `analysis_neighborhood` matches one of the 18 featured DataSF boundaries.

The current build contains 3,178 records dated July 3, 2023 through June 2, 2025 from the 2025 assessor roll. The transfer layer therefore ends roughly one year before the June 2026 ZHVI series; both cutoffs are shown separately in the interface.

DataSF describes `current_sales_date` as the date the current sale for that roll period was recorded, but the bulk dataset does not expose consideration price or deed type. The app therefore labels every dot a **recorded residential transfer**, never a verified sale. It cannot automatically exclude family transfers, quitclaims, nominal-value transfers, or other non-market recordings. Condominium records also often lack a distinct lot-area value.

### Transfer filters

The interface can filter dots by the assessor's public property-class description and recorded interior area. Property classes are grouped deterministically into single-family homes, condos/co-ops, townhomes, flats and 2–4-unit properties, apartment buildings, and other residential records. The square-footage threshold applies to the assessor's parcel or structure area; it is not guaranteed to be unit-level living area for every cooperative or multifamily record.

These controls affect parcel dots and counts only. They do not change the neighborhood ZHVI series. Minimum-price filtering is intentionally unavailable because the public bulk record has no transaction-price field.

## Growth comparison rule

Map color always represents change from the first visible month to the active scrub month:

- Below −2%
- −2% to below +2%
- +2% to below +10%
- +10% or more

For the sidebar comparison, all 18 featured-neighborhood changes are ranked at the active month. The peer benchmark is their median. A neighborhood is labeled a high- or lower-growth outlier only when its distance from that median is at least the larger of four percentage points or two median absolute deviations. This keeps the label meaningful when the market is tightly clustered while adapting when dispersion widens. The two highest- and two lowest-growth neighborhoods are shown as clickable market extremes whether or not they cross the stricter outlier threshold.

OpenFreeMap's generic neighborhood and village labels are suppressed because they repeat at higher zoom levels. The app renders one collision-aware label per featured DataSF neighborhood at city scale and only the selected neighborhood label after zooming in; road, city, and landmark labels remain from the basemap.

## Geographic rule

All geometry comes from the [DataSF Analysis Neighborhoods](https://data.sfgov.org/Geographic-Locations-and-Boundaries/Analysis-Neighborhoods/j2bu-swwd) dataset. DataSF defines 41 analysis neighborhoods by grouping census tracts for consistent analysis. These are reproducible analytical boundaries, not legal neighborhood or HOA boundaries.

The map draws all 41 boundaries for geographic context. Eighteen high-recognition neighborhoods are featured with value data. “Featured” is an editorial demo selection, not a measured popularity ranking.

| UI neighborhood | DataSF boundary | Zillow source region |
|---|---|---|
| Pacific Heights | Pacific Heights | Pacific Heights |
| Marina | Marina | Marina District |
| Noe Valley | Noe Valley | Noe Valley |
| Mission | Mission | Mission |
| Russian Hill | Russian Hill | Russian Hill |
| Nob Hill | Nob Hill | Nob Hill |
| Hayes Valley | Hayes Valley | Hayes Valley |
| Haight-Ashbury | Haight Ashbury | Haight |
| Castro | Castro/Upper Market | Castro |
| North Beach | North Beach | North Beach |
| Potrero Hill | Potrero Hill | Potrero Hill |
| Bernal Heights | Bernal Heights | Bernal Heights |
| Inner Sunset | Inner Sunset | Inner Sunset |
| Inner Richmond | Inner Richmond | Inner Richmond |
| SoMa | South of Market | South of Market |
| Presidio Heights | Presidio Heights | Presidio Heights |
| Sea Cliff | Seacliff | Seacliff |
| Mission Bay | Mission Bay | Mission Bay |

Where the names differ, the mapping is an explicit editorial proxy rather than an inferred spatial aggregation. It is encoded in `src/config/neighborhoods.ts`, validated for uniqueness, and surfaced in the UI when the source name differs.

## Pipeline

1. Download or reuse the Zillow neighborhood ZHVI CSV, DataSF boundary GeoJSON, and latest DataSF assessor-roll transfer records.
2. Filter Zillow rows to `RegionType=neighborhood`, `State=CA`, and `City=San Francisco`.
3. Require exactly one source row for every configured featured neighborhood.
4. Find the latest month that has a numeric value for every featured row.
5. Retain 48 months: 36 visible months plus the 12-month comparison support needed at the start of the scrub window.
6. Calculate latest 12-month and 36-month changes.
7. Validate that all 18 featured DataSF boundaries exist among the 41 official features.
8. Filter and normalize residential transfer records, format fixed-width assessor addresses, and validate that every featured neighborhood is represented.
9. Publish `sf-market-pulse.json`, `sf-neighborhoods.geojson`, `sf-residential-transfers.geojson`, and a source manifest.

The scheduled workflow refreshes after Zillow's normal mid-month update. If a source name or schema changes, the pipeline fails rather than silently dropping a neighborhood.

## Known limitations

- ZHVI is modeled and may be revised when Zillow updates its methodology or source data.
- The source geography and DataSF boundary can differ slightly; the mapping table makes those proxies explicit.
- The 18 featured neighborhoods are selected for recognizable demo coverage, not derived from search volume or visitor counts.
- Citywide comparisons include only featured neighborhoods, not all possible Zillow neighborhood rows.
- No claim about a specific property or transaction should be inferred from the neighborhood index.
- Transfer records may include non-market transfers because price and deed type are absent from the public bulk data.
- The assessor roll lags the monthly ZHVI series; the interface reports both source cutoffs independently.
- The transfer-card Zillow action is an exact-address search, not a stored Zillow property ID. A recognized address may resolve directly to a property page and photos; an unmatched or ambiguously formatted address may remain on Zillow search results.
