# Foothills Market Pulse

A public-records data project for tracking recent recorded sales in Catalina Foothills luxury micro-markets.

## Pilot scope

- Ventana Canyon
- Pima Canyon
- Finisterra

## Current phase

Phase 0 is complete. Phase 1 implements the approved free-source, database-free data pipeline; UI work remains out of scope until Phase 2.

Read the [Phase 0 data feasibility report](docs/phase-0-data-feasibility.md).

## Pipeline

```powershell
pnpm install
pnpm typecheck
pnpm test
pnpm pipeline
```

The scheduled workflow produces versioned JSON and GeoJSON under `data/processed`. See the [operator runbook](docs/phase-1-operator-runbook.md).

## Data labeling

Pilot outputs will be labeled **recent recorded sales**. MLS inventory and MLS-only market metrics are out of scope until an authorized feed is available.
