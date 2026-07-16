"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  FillLayerSpecification,
  FilterSpecification,
  GeoJSONSource,
  LineLayerSpecification,
  Map as MapLibreMap,
  MapGeoJSONFeature,
  SymbolLayerSpecification,
} from "maplibre-gl";
import type { FeatureCollection, Geometry } from "geojson";
import type {
  MarketPulseDataset,
  NeighborhoodBoundaries,
  NeighborhoodBoundaryProperties,
  ResidentialTransfers,
  TransferPointProperties,
} from "@/src/types";
import { PulseChart } from "./pulse-chart";

interface ExperienceData {
  dataset: MarketPulseDataset;
  boundaries: NeighborhoodBoundaries;
  transfers: ResidentialTransfers;
}

interface DisplayBoundaryProperties extends NeighborhoodBoundaryProperties {
  pulseChange: number;
  typicalValue: number;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_NEIGHBORHOOD = "pacific-heights";
const GOLD = "#c9a064";
const DATA_BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export function MarketPulseExperience() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [data, setData] = useState<ExperienceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedId, setSelectedId] = useState(DEFAULT_NEIGHBORHOOD);
  const [monthIndex, setMonthIndex] = useState(35);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferPointProperties | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadData() {
      try {
        const [datasetResponse, boundariesResponse, transfersResponse] = await Promise.all([
          fetch(`${DATA_BASE}/data/sf-market-pulse.json`, { signal: controller.signal }),
          fetch(`${DATA_BASE}/data/sf-neighborhoods.geojson`, { signal: controller.signal }),
          fetch(`${DATA_BASE}/data/sf-residential-transfers.geojson`, {
            signal: controller.signal,
          }),
        ]);
        if (!datasetResponse.ok || !boundariesResponse.ok || !transfersResponse.ok) {
          throw new Error("The published neighborhood data could not be loaded.");
        }
        const [dataset, boundaries, transfers] = await Promise.all([
          datasetResponse.json() as Promise<MarketPulseDataset>,
          boundariesResponse.json() as Promise<NeighborhoodBoundaries>,
          transfersResponse.json() as Promise<ResidentialTransfers>,
        ]);
        setData({ dataset, boundaries, transfers });
        setMonthIndex(dataset.displayMonths - 1);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setLoadError(error instanceof Error ? error.message : "The map could not be loaded.");
        }
      }
    }
    void loadData();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      setReducedMotion(media.matches);
      if (media.matches) setIsPlaying(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const selected = useMemo(
    () => data?.dataset.neighborhoods.find((item) => item.id === selectedId) ?? null,
    [data, selectedId],
  );
  const displayHistory = useMemo(
    () => selected?.history.slice(-Math.min(data?.dataset.displayMonths ?? 36, selected.history.length)) ?? [],
    [data, selected],
  );
  const activePoint = displayHistory[monthIndex] ?? displayHistory.at(-1) ?? null;
  const activeHistoryIndex = selected && activePoint
    ? selected.history.findIndex((point) => point.date === activePoint.date)
    : -1;
  const prior12 = selected && activeHistoryIndex >= 12
    ? selected.history[activeHistoryIndex - 12]
    : null;
  const windowStart = displayHistory[0] ?? null;
  const trailing12Change = activePoint && prior12
    ? calculateChange(activePoint.value, prior12.value)
    : null;
  const windowChange = activePoint && windowStart
    ? calculateChange(activePoint.value, windowStart.value)
    : null;
  const visibleTransfers = useMemo(
    () =>
      data && activePoint
        ? data.transfers.features.filter(
            (feature) => feature.properties.recordedDate <= activePoint.date,
          )
        : [],
    [activePoint, data],
  );
  const selectedTransferCount = useMemo(
    () =>
      visibleTransfers.filter((feature) => feature.properties.neighborhoodId === selectedId)
        .length,
    [selectedId, visibleTransfers],
  );
  const displayedTransfer =
    selectedTransfer && activePoint && selectedTransfer.recordedDate <= activePoint.date
      ? selectedTransfer
      : null;

  const selectNeighborhood = useCallback(
    (id: string, focusMap = true) => {
      if (!data?.dataset.neighborhoods.some((item) => item.id === id)) return;
      setSelectedId(id);
      setSelectedTransfer(null);
      if (focusMap && mapRef.current) {
        const feature = data.boundaries.features.find((item) => item.properties.dataId === id);
        if (feature) focusFeature(mapRef.current, feature.geometry, reducedMotion);
      }
    },
    [data, reducedMotion],
  );

  useEffect(() => {
    if (!data || !mapContainerRef.current || mapRef.current) return;
    const loaded = data;
    let disposed = false;
    let map: MapLibreMap | null = null;

    async function initializeMap() {
      const maplibregl = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: MAP_STYLE,
        center: [-122.447, 37.772],
        zoom: 11.35,
        pitch: 43,
        bearing: -17,
        maxPitch: 62,
        canvasContextAttributes: { antialias: true },
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: "Boundaries: DataSF · Values: Zillow Research",
        }),
        "bottom-right",
      );

      map.on("load", () => {
        if (!map || disposed) return;
        map.getCanvas().setAttribute(
          "aria-label",
          "Interactive map of typical home values and recorded residential transfers across featured San Francisco neighborhoods",
        );
        const initialBoundaries = decorateBoundaries(
          loaded.boundaries,
          loaded.dataset,
          loaded.dataset.displayMonths - 1,
        );
        map.addSource("sf-neighborhoods", { type: "geojson", data: initialBoundaries });
        map.addSource("residential-transfers", {
          type: "geojson",
          data: loaded.transfers,
        });
        map.addLayer({
          id: "analysis-neighborhood-wash",
          type: "fill",
          source: "sf-neighborhoods",
          paint: { "fill-color": "#293733", "fill-opacity": 0.035 },
        } as FillLayerSpecification);
        map.addLayer({
          id: "featured-neighborhood-pulse",
          type: "fill",
          source: "sf-neighborhoods",
          filter: ["==", ["get", "featured"], true],
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "pulseChange"],
              -15,
              "#526f70",
              0,
              "#9a8d77",
              10,
              "#c49b5d",
              25,
              "#efd096",
            ],
            "fill-opacity": [
              "interpolate",
              ["linear"],
              ["abs", ["get", "pulseChange"]],
              0,
              0.16,
              20,
              0.52,
            ],
          },
        } as FillLayerSpecification);
        map.addLayer({
          id: "analysis-neighborhood-lines",
          type: "line",
          source: "sf-neighborhoods",
          paint: { "line-color": "#52615c", "line-width": 0.65, "line-opacity": 0.42 },
        } as LineLayerSpecification);
        map.addLayer({
          id: "selected-neighborhood",
          type: "line",
          source: "sf-neighborhoods",
          filter: ["==", ["get", "dataId"], DEFAULT_NEIGHBORHOOD],
          paint: { "line-color": GOLD, "line-width": 3, "line-opacity": 0.95 },
        } as LineLayerSpecification);
        map.addLayer({
          id: "transfer-ambient",
          type: "circle",
          source: "residential-transfers",
          filter: transferVisibilityFilter(loaded.dataset.latestDate),
          paint: {
            "circle-color": "#eed19a",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 1.2, 14, 3.2],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0.24, 14, 0.42],
            "circle-blur": 0.38,
            "circle-stroke-color": "#fff4d9",
            "circle-stroke-width": 0.35,
            "circle-stroke-opacity": 0.5,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "transfer-selected",
          type: "circle",
          source: "residential-transfers",
          filter: transferSelectedFilter(DEFAULT_NEIGHBORHOOD, loaded.dataset.latestDate),
          paint: {
            "circle-color": "#f2cb7d",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 2, 14, 4.4],
            "circle-opacity": 0.7,
            "circle-blur": 0.24,
            "circle-stroke-color": "#fff7e6",
            "circle-stroke-width": 0.8,
            "circle-stroke-opacity": 0.78,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "transfer-active-month",
          type: "circle",
          source: "residential-transfers",
          filter: transferMonthFilter(
            firstDayOfMonth(loaded.dataset.latestDate),
            loaded.dataset.latestDate,
          ),
          paint: {
            "circle-color": "#fff0c4",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 3.3, 14, 6.5],
            "circle-opacity": 0.96,
            "circle-blur": 0.18,
            "circle-stroke-color": "#fff9eb",
            "circle-stroke-width": 1.25,
            "circle-stroke-opacity": 0.94,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "featured-neighborhood-labels",
          type: "symbol",
          source: "sf-neighborhoods",
          minzoom: 11.4,
          filter: ["==", ["get", "featured"], true],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 10,
            "text-letter-spacing": 0.05,
            "text-transform": "uppercase",
            "text-max-width": 8,
          },
          paint: {
            "text-color": "#ede5d7",
            "text-halo-color": "#17201d",
            "text-halo-width": 1.4,
            "text-opacity": 0.82,
          },
        } as SymbolLayerSpecification);

        map.on("click", "featured-neighborhood-pulse", (event) => {
          const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
          const id = feature?.properties?.dataId as string | undefined;
          if (id) selectNeighborhood(id, false);
        });
        map.on("click", "transfer-ambient", (event) => {
          const feature = event.features?.[0] as MapGeoJSONFeature | undefined;
          const properties = feature?.properties as TransferPointProperties | undefined;
          if (!properties?.transferId) return;
          selectNeighborhood(properties.neighborhoodId, false);
          setSelectedTransfer(properties);
        });
        map.on("mouseenter", "featured-neighborhood-pulse", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "featured-neighborhood-pulse", () => {
          if (map) map.getCanvas().style.cursor = "";
        });
        map.on("mouseenter", "transfer-ambient", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "transfer-ambient", () => {
          if (map) map.getCanvas().style.cursor = "";
        });
        setMapReady(true);
      });
    }

    void initializeMap();
    return () => {
      disposed = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [data, selectNeighborhood]);

  useEffect(() => {
    if (!mapReady || !data || !mapRef.current) return;
    const source = mapRef.current.getSource("sf-neighborhoods") as GeoJSONSource | undefined;
    source?.setData(decorateBoundaries(data.boundaries, data.dataset, monthIndex));
  }, [data, mapReady, monthIndex]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.setFilter("selected-neighborhood", ["==", ["get", "dataId"], selectedId]);
    mapRef.current.setFilter(
      "transfer-selected",
      transferSelectedFilter(selectedId, activePoint?.date ?? "9999-12-31"),
    );
  }, [activePoint?.date, mapReady, selectedId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !activePoint) return;
    mapRef.current.setFilter("transfer-ambient", transferVisibilityFilter(activePoint.date));
    mapRef.current.setFilter(
      "transfer-active-month",
      transferMonthFilter(firstDayOfMonth(activePoint.date), activePoint.date),
    );
  }, [activePoint, mapReady]);

  useEffect(() => {
    if (!isPlaying || reducedMotion || !data) return;
    const timer = window.setInterval(() => {
      setMonthIndex((current) =>
        current >= data.dataset.displayMonths - 1 ? 0 : current + 1,
      );
    }, 850);
    return () => window.clearInterval(timer);
  }, [data, isPlaying, reducedMotion]);

  if (loadError) {
    return (
      <main className="error-state">
        <p className="eyebrow">San Francisco Market Pulse</p>
        <h1>The neighborhood data did not load.</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  const accentStyle = { "--pulse-accent": GOLD } as CSSProperties;
  return (
    <main className="experience" style={accentStyle}>
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-rule" aria-hidden="true" />
          <div>
            <p className="eyebrow">San Francisco</p>
            <h1>Market Pulse</h1>
          </div>
        </div>
        <div className="data-stamp">
          <span className="status-label"><span aria-hidden="true" /> Values + transfer records</span>
          <span>
            {data
              ? `Values ${formatMonthYear(data.dataset.latestDate)} · Transfers ${formatMonthYear(data.dataset.transfers.dataEndDate)}`
              : "Loading current release"}
          </span>
        </div>
      </header>

      <section className="market-stage" aria-label="San Francisco neighborhood home-value explorer">
        <div className="map-frame">
          <div ref={mapContainerRef} className="market-map" />
          {!mapReady ? <div className="map-loading">Drawing San Francisco…</div> : null}
          <div className="map-caption">
            <p className="eyebrow">Citywide view</p>
            <strong>18 featured neighborhoods</strong>
            <span>Click a glowing parcel dot for its public record</span>
          </div>
          <div className="pulse-legend" aria-label="Map color legend">
            <span><i className="legend-transfer" /> Recorded transfer</span>
            <span><i className="legend-cool" /> Below window start</span>
            <span><i className="legend-neutral" /> Near window start</span>
            <span><i className="legend-warm" /> Above window start</span>
          </div>
          {displayedTransfer ? (
            <article className="transfer-detail" aria-label="Selected transfer detail">
              <button
                type="button"
                aria-label="Close transfer detail"
                onClick={() => setSelectedTransfer(null)}
              >
                ×
              </button>
              <p className="eyebrow">Recorded residential transfer</p>
              <strong>{displayedTransfer.address}</strong>
              <dl>
                <div><dt>Recorded</dt><dd>{formatLongDate(displayedTransfer.recordedDate)}</dd></div>
                <div><dt>Interior</dt><dd>{formatSquareFeet(displayedTransfer.propertyAreaSqft)}</dd></div>
                <div><dt>Lot</dt><dd>{formatSquareFeet(displayedTransfer.lotAreaSqft)}</dd></div>
              </dl>
              <p>{displayedTransfer.propertyType} · Parcel {displayedTransfer.parcelNumber}</p>
              <small>Sale price and deed type are not included in the public bulk record.</small>
            </article>
          ) : null}
          <div className="time-scrubber">
            <div className="scrub-heading">
              <div>
                <p className="eyebrow">36-month pulse</p>
                <output>{activePoint ? formatMonthYear(activePoint.date) : "Loading"}</output>
                <span className="visible-transfer-count">
                  {visibleTransfers.length.toLocaleString()} public transfers visible
                </span>
              </div>
              <button
                className="play-control"
                type="button"
                aria-label={isPlaying ? "Pause timeline" : "Play timeline"}
                aria-pressed={isPlaying}
                disabled={reducedMotion || !data}
                onClick={() => setIsPlaying((current) => !current)}
              >
                <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
                {isPlaying ? "Pause" : "Play"}
              </button>
            </div>
            <input
              aria-label="Home value month"
              type="range"
              min={0}
              max={Math.max(0, (data?.dataset.displayMonths ?? 36) - 1)}
              value={monthIndex}
              onChange={(event) => {
                setMonthIndex(Number(event.target.value));
                setIsPlaying(false);
              }}
            />
            <div className="timeline-ends">
              <span>{data ? formatMonthYear(data.dataset.displayStartDate) : ""}</span>
              <span>{data ? formatMonthYear(data.dataset.latestDate) : ""}</span>
            </div>
          </div>
        </div>

        <aside className="pulse-panel" aria-live="polite">
          <label className="neighborhood-field">
            <span>Featured neighborhood</span>
            <select
              value={selectedId}
              onChange={(event) => selectNeighborhood(event.target.value)}
              disabled={!data}
            >
              {data?.dataset.neighborhoods.map((item) => (
                <option value={item.id} key={item.id}>{item.name}</option>
              ))}
            </select>
          </label>

          <div className="pulse-heading">
            <p className="eyebrow">Neighborhood pulse</p>
            <h2>{selected?.name ?? "San Francisco"}</h2>
            <p>{activePoint ? `Typical home value · ${formatMonthYear(activePoint.date)}` : "Loading neighborhood history"}</p>
          </div>

          <div className="hero-value">
            <strong>{activePoint ? formatCurrency(activePoint.value) : "—"}</strong>
            <span>Zillow Home Value Index</span>
          </div>

          <div className="metric-grid">
            <div>
              <span>Prior 12 months</span>
              <strong className={deltaClass(trailing12Change)}>{formatPercent(trailing12Change)}</strong>
            </div>
            <div>
              <span>Since {windowStart ? formatMonthYear(windowStart.date) : "window start"}</span>
              <strong className={deltaClass(windowChange)}>{formatPercent(windowChange)}</strong>
            </div>
            <div>
              <span>Latest 3-year move</span>
              <strong className={deltaClass(selected?.latest36MonthChangePct ?? null)}>
                {formatPercent(selected?.latest36MonthChangePct ?? null)}
              </strong>
            </div>
          </div>

          <p className="transfer-count-line">
            <span aria-hidden="true" />
            {selectedTransferCount.toLocaleString()} residential transfer records visible · public data through {data ? formatMonthYear(data.dataset.transfers.dataEndDate) : "—"}
          </p>

          {selected ? (
            <PulseChart
              name={selected.name}
              history={displayHistory}
              activeIndex={monthIndex}
            />
          ) : null}

          <div className="source-note">
            <p className="eyebrow">What this measures</p>
            <p>
              A modeled estimate of the typical mid-tier home value. It is not a recorded sale
              price, listing price, appraisal, or MLS feed.
            </p>
            <p>
              Map dots are parcel-level residential transfer dates from the latest public assessor
              roll. Price and deed type are not published in the bulk dataset, so some may be
              non-market transfers.
            </p>
            {selected && selected.sourceRegionName !== selected.name ? (
              <p>Boundary label: {selected.name} · Zillow source region: {selected.sourceRegionName}</p>
            ) : null}
          </div>
        </aside>
      </section>

      <footer className="site-footer">
        <span>Boundaries + transfer dates: DataSF</span>
        <span>Values: Zillow Research ZHVI · Updated monthly</span>
      </footer>
    </main>
  );
}

function decorateBoundaries(
  boundaries: NeighborhoodBoundaries,
  dataset: MarketPulseDataset,
  monthIndex: number,
): FeatureCollection<Geometry, DisplayBoundaryProperties> {
  const pulseById = new Map(dataset.neighborhoods.map((item) => [item.id, item]));
  return {
    type: "FeatureCollection",
    features: boundaries.features.map((feature) => {
      const pulse = feature.properties.dataId
        ? pulseById.get(feature.properties.dataId)
        : undefined;
      const display = pulse?.history.slice(-dataset.displayMonths) ?? [];
      const active = display[monthIndex] ?? display.at(-1);
      const start = display[0];
      return {
        ...feature,
        properties: {
          ...feature.properties,
          pulseChange: active && start ? calculateChange(active.value, start.value) : 0,
          typicalValue: active?.value ?? 0,
        },
      };
    }),
  };
}

function focusFeature(map: MapLibreMap, geometry: Geometry, reducedMotion: boolean): void {
  const bounds = geometryBounds(geometry);
  if (!bounds) return;
  map.fitBounds(bounds, {
    padding: { top: 92, right: 90, bottom: 150, left: 90 },
    maxZoom: 13.2,
    pitch: 46,
    bearing: -17,
    duration: reducedMotion ? 0 : 850,
  });
}

function geometryBounds(geometry: Geometry): [[number, number], [number, number]] | null {
  const points: number[][] = [];
  collectCoordinates((geometry as { coordinates?: unknown }).coordinates, points);
  if (points.length === 0) return null;
  const longitudes = points.map((point) => point[0] ?? 0);
  const latitudes = points.map((point) => point[1] ?? 0);
  return [
    [Math.min(...longitudes), Math.min(...latitudes)],
    [Math.max(...longitudes), Math.max(...latitudes)],
  ];
}

function collectCoordinates(value: unknown, points: number[][]): void {
  if (!Array.isArray(value)) return;
  if (typeof value[0] === "number" && typeof value[1] === "number") {
    points.push(value as number[]);
    return;
  }
  for (const child of value) collectCoordinates(child, points);
}

function transferVisibilityFilter(endDate: string): ExpressionSpecification {
  return ["<=", ["get", "recordedDate"], endDate];
}

function transferSelectedFilter(neighborhoodId: string, endDate: string): FilterSpecification {
  return [
    "all",
    ["==", ["get", "neighborhoodId"], neighborhoodId],
    transferVisibilityFilter(endDate),
  ];
}

function transferMonthFilter(startDate: string, endDate: string): FilterSpecification {
  return [
    "all",
    [">=", ["get", "recordedDate"], startDate],
    ["<=", ["get", "recordedDate"], endDate],
  ];
}

function firstDayOfMonth(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function calculateChange(current: number, prior: number): number {
  if (!prior) return 0;
  return Math.round(((current / prior - 1) * 100) * 10) / 10;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonthYear(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatLongDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatSquareFeet(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "Not published";
  return `${new Intl.NumberFormat("en-US").format(value)} sq ft`;
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function deltaClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "delta-neutral";
  return value > 0 ? "delta-positive" : "delta-negative";
}
