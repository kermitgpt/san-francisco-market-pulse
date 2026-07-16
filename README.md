# Foothills Market Pulse

A public-records data project for tracking recent recorded sales in Catalina Foothills luxury micro-markets.

## Pilot scope

- Ventana Canyon
- Pima Canyon
- Finisterra

## Current phase

Phases 0 and 1 are complete. Phase 2 adds the approved editorial map experience on top of the automated 36-month public-record pipeline.

Read the [Phase 0 data feasibility report](docs/phase-0-data-feasibility.md).

## Map experience

- Tilted parcel map for Ventana Canyon, Pima Canyon, and Finisterra
- Recorded sales colored by price band and revealed with a time scrubber
- Adaptive community windows with a strict eight-sale minimum for trend lines
- Current price levels calculated only from the trailing 12 months
- Responsive pulse cards with recorded price, price/sqft, sale count, and lot-size range

Run the local experience:

```powershell
pnpm install
pnpm dev
```

The site is built with Next.js, React, TypeScript, and MapLibre GL. See the [Phase 2 implementation notes](docs/phase-2-map-ui.md).

## Pipeline

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm pipeline
pnpm build
```

The scheduled workflow produces versioned JSON and GeoJSON under `data/processed`. The web build copies the four browser-safe files into an ignored `public/data` directory, so generated duplicates never need to be committed. See the [operator runbook](docs/phase-1-operator-runbook.md).

## Data labeling

Pilot outputs will be labeled **recent recorded sales**. MLS inventory and MLS-only market metrics are out of scope until an authorized feed is available.
