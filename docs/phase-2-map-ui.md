# Phase 2 map UI

## Delivered scope

The root page is an interactive, public-record-only view of Ventana Canyon, Pima Canyon, and Finisterra. It combines the parcel geometries produced by the pipeline with recorded-sale points and the approved community summaries.

The interface includes:

- a tilted parcel map with the selected micro-market emphasized;
- recorded sales encoded as three price bands;
- a monthly time scrubber and optional playback;
- a per-community adaptive-window label;
- trailing-12-month median price and price/sqft;
- window sale count and single-family lot-size range;
- a validated price path only when at least eight strict tier-A sales qualify;
- individual sale dots, without a trend line, below that threshold; and
- public-record detail for a selected sale.

## Presentation rules

The UI reads every value from `market-pulse.json`; it does not recalculate or override the pipeline's adaptive window. The trend chart can use the selected extended window, while median price and median price/sqft always use `currentStatsMethod: trailing_12_months_only`.

All transaction language says **recent recorded sales**. The recording date controls the map and scrubber because public records do not supply a reliable exact close date or days-to-close value. No MLS inventory, listing status, DOM, or asking-price claims appear in this phase.

## Browser data contract

`scripts/sync-public-data.mjs` copies these generated files from `data/processed` into `public/data` before development and production builds:

- `market-pulse.json`
- `recorded-sales.geojson`
- `community-boundaries.geojson`
- `pilot-parcels.geojson`

The final file contains every pilot parcel, including approved and flagged edge parcels. The UI distinguishes the flagged parcels visually but excludes unapproved memberships from market statistics and sale layers.

## Local verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

The production build is statically rendered at `/`; MapLibre is initialized only in the browser. The basemap uses OpenFreeMap's Positron style and OpenStreetMap attribution.
