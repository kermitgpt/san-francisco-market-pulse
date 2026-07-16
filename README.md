# San Francisco Market Pulse

A cinematic, interactive view of typical home values across 18 featured San Francisco neighborhoods. Scrub through 36 months, click a neighborhood, and watch its value path and movement assemble in the pulse card.

This zero-cost edition uses:

- [DataSF Analysis Neighborhoods](https://data.sfgov.org/Geographic-Locations-and-Boundaries/Analysis-Neighborhoods/j2bu-swwd) for all 41 city analysis boundaries.
- [Zillow Research ZHVI](https://www.zillow.com/research/data/) for monthly neighborhood-level typical home values.

The experience intentionally says **typical home value**, not recorded sale price. ZHVI is a modeled index; it is not an MLS feed, appraisal, listing price, or individual transaction record.

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

The pipeline caches the large Zillow source file under `data/raw/`, validates all configured mappings, retains 48 months for comparisons, and commits only compact processed outputs. A GitHub Action runs after Zillow's normal monthly release date and can also be triggered manually.

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
