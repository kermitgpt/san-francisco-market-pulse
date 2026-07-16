# San Francisco Market Pulse

A cinematic, interactive view of typical home values and recorded residential transfers across 18 featured San Francisco neighborhoods. Scrub through 36 months, compare neighborhood growth against the featured-market median, refine parcel records by public property class and interior area, and click a glowing dot to inspect its source record.

This zero-cost edition uses:

- [DataSF Analysis Neighborhoods](https://data.sfgov.org/Geographic-Locations-and-Boundaries/Analysis-Neighborhoods/j2bu-swwd) for all 41 city analysis boundaries.
- [DataSF Assessor Historical Secured Property Tax Rolls](https://data.sfgov.org/Housing-and-Buildings/Assessor-Historical-Secured-Property-Tax-Rolls/wv5m-vpq2) for parcel-level residential transfer dates, addresses, geometry, and property characteristics.
- [Zillow Research ZHVI](https://www.zillow.com/research/data/) for monthly neighborhood-level typical home values.

The experience intentionally distinguishes **typical home value** from a **recorded residential transfer**. ZHVI is a modeled index. The public parcel records do not include sale consideration or deed type, so a dot is not represented as a verified market sale and may include a non-market transfer.

Map colors use explicit change-since-window-start bands: below −2%, −2% to below +2%, +2% to below +10%, and +10% or more. The sidebar ranks the selected neighborhood against the other 17 featured neighborhoods and flags outliers using a robust, dispersion-aware threshold.

## Run locally

```powershell
pnpm install
pnpm dev
```

Open `http://localhost:3000`.

## Refresh the data

```powershell
pnpm pipeline -- --refresh
pnpm test
pnpm typecheck
pnpm build
```

The pipeline caches the large Zillow and DataSF source files under `data/raw/`, validates all configured mappings, retains 48 months for comparisons, and commits only compact processed outputs. A GitHub Action runs after Zillow's normal monthly release date and can also be triggered manually.

## Project map

- `app/` — Next.js map experience and styles
- `src/config/neighborhoods.ts` — reproducible DataSF-to-Zillow mappings
- `src/pipeline.ts` — download, validation, transformation, and output
- `data/processed/` — publishable JSON and GeoJSON
- `docs/data-methodology.md` — scope, boundary rules, and limitations

## Checks

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
