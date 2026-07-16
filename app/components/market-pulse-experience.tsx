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
import type { FeatureCollection, Geometry, Point } from "geojson";
import type {
  MarketPulseDataset,
  NeighborhoodBoundaries,
  NeighborhoodBoundaryProperties,
  ResidentialTransfers,
  TransferPointProperties,
  TransferPropertyCategory,
} from "@/src/types";
import { analyzeGrowth } from "@/src/growth-analysis";
import {
  categorizePropertyType,
  TRANSFER_CATEGORY_OPTIONS,
} from "@/src/transfer-categories";
import { zillowAddressUrl } from "@/src/zillow";
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

type TransferCategoryFilter = TransferPropertyCategory | "all";

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_NEIGHBORHOOD = "pacific-heights";
const GOLD = "#c9a064";
const TRANSFER_AMBIENT = "#45d2c5";
const TRANSFER_SELECTED = "#91f0e5";
const TRANSFER_ACTIVE = "#ff8a62";
const TRANSFER_EDGE = "#12383a";
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
  const [propertyCategory, setPropertyCategory] =
    useState<TransferCategoryFilter>("all");
  const [minimumArea, setMinimumArea] = useState(0);

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
        setData({ dataset, boundaries, transfers: withTransferCategories(transfers) });
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
  const growthAnalysis = useMemo(
    () =>
      data
        ? analyzeGrowth(
            data.dataset.neighborhoods.map((item) => {
              const display = item.history.slice(-data.dataset.displayMonths);
              const start = display[0];
              const active = display[monthIndex] ?? display.at(-1);
              return {
                id: item.id,
                name: item.name,
                change: active && start ? calculateChange(active.value, start.value) : 0,
              };
            }),
          )
        : null,
    [data, monthIndex],
  );
  const selectedGrowth =
    growthAnalysis?.rankings.find((item) => item.id === selectedId) ?? null;
  const growthPosition = selectedGrowth && growthAnalysis
    ? ((growthAnalysis.rankings.length - selectedGrowth.rank) /
        Math.max(1, growthAnalysis.rankings.length - 1)) * 100
    : 50;
  const categoryCounts = useMemo(() => {
    const counts = new Map<TransferPropertyCategory, number>();
    for (const feature of data?.transfers.features ?? []) {
      const category = feature.properties.propertyCategory;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
    return counts;
  }, [data]);
  const visibleTransfers = useMemo(
    () =>
      data && activePoint
        ? data.transfers.features.filter(
            (feature) =>
              feature.properties.recordedDate <= activePoint.date &&
              transferMatchesCriteria(feature.properties, propertyCategory, minimumArea),
          )
        : [],
    [activePoint, data, minimumArea, propertyCategory],
  );
  const selectedTransferCount = useMemo(
    () =>
      visibleTransfers.filter((feature) => feature.properties.neighborhoodId === selectedId)
        .length,
    [selectedId, visibleTransfers],
  );
  const displayedTransfer =
    selectedTransfer &&
    activePoint &&
    selectedTransfer.recordedDate <= activePoint.date &&
    transferMatchesCriteria(selectedTransfer, propertyCategory, minimumArea)
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
        for (const layerId of ["label_other", "label_village", "label_town"]) {
          if (map.getLayer(layerId)) map.setLayoutProperty(layerId, "visibility", "none");
        }
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
        map.addSource("featured-label-points", {
          type: "geojson",
          data: buildNeighborhoodLabelPoints(loaded.boundaries),
        });
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
              "step",
              ["get", "pulseChange"],
              "#4f7478",
              -2,
              "#7e7a70",
              2,
              "#b68d52",
              10,
              "#efd096",
            ],
            "fill-opacity": 0.42,
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
          filter: transferCriteriaFilter(loaded.dataset.latestDate, "all", 0),
          paint: {
            "circle-color": TRANSFER_AMBIENT,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 1.45, 14, 4.2],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0.48, 14, 0.86],
            "circle-blur": 0,
            "circle-stroke-color": TRANSFER_EDGE,
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10.5, 0.4, 14, 1.15],
            "circle-stroke-opacity": 0.92,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "transfer-selected",
          type: "circle",
          source: "residential-transfers",
          filter: transferSelectedFilter(
            DEFAULT_NEIGHBORHOOD,
            loaded.dataset.latestDate,
            "all",
            0,
          ),
          paint: {
            "circle-color": TRANSFER_SELECTED,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 1.9, 14, 5.1],
            "circle-opacity": ["interpolate", ["linear"], ["zoom"], 10.5, 0.84, 14, 0.95],
            "circle-blur": 0,
            "circle-stroke-color": TRANSFER_EDGE,
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10.5, 0.65, 14, 1.45],
            "circle-stroke-opacity": 1,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "transfer-active-month-halo",
          type: "circle",
          source: "residential-transfers",
          filter: transferMonthFilter(
            firstDayOfMonth(loaded.dataset.latestDate),
            loaded.dataset.latestDate,
            "all",
            0,
          ),
          paint: {
            "circle-color": TRANSFER_ACTIVE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 5, 14, 10],
            "circle-opacity": 0.3,
            "circle-blur": 0.55,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "transfer-active-month",
          type: "circle",
          source: "residential-transfers",
          filter: transferMonthFilter(
            firstDayOfMonth(loaded.dataset.latestDate),
            loaded.dataset.latestDate,
            "all",
            0,
          ),
          paint: {
            "circle-color": TRANSFER_ACTIVE,
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10.5, 3.2, 14, 6.4],
            "circle-opacity": 1,
            "circle-blur": 0,
            "circle-stroke-color": "#542519",
            "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10.5, 0.9, 14, 1.4],
            "circle-stroke-opacity": 0.96,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "featured-neighborhood-labels",
          type: "symbol",
          source: "featured-label-points",
          minzoom: 10.4,
          filter: ["==", ["get", "featured"], true],
          layout: {
            "text-field": ["get", "name"],
            "text-font": ["Noto Sans Regular"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 10.4, 11, 13.5, 14, 15.5, 17],
            "text-letter-spacing": 0.075,
            "text-transform": "uppercase",
            "text-max-width": 9,
            "text-padding": 10,
            "symbol-avoid-edges": true,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#fffaf0",
            "text-halo-color": "#0d1513",
            "text-halo-width": 2.2,
            "text-halo-blur": 0.35,
            "text-opacity": 0.98,
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
      transferSelectedFilter(
        selectedId,
        activePoint?.date ?? "9999-12-31",
        propertyCategory,
        minimumArea,
      ),
    );
  }, [activePoint?.date, mapReady, minimumArea, propertyCategory, selectedId]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !activePoint) return;
    mapRef.current.setFilter(
      "transfer-ambient",
      transferCriteriaFilter(activePoint.date, propertyCategory, minimumArea),
    );
    mapRef.current.setFilter(
      "transfer-active-month-halo",
      transferMonthFilter(
        firstDayOfMonth(activePoint.date),
        activePoint.date,
        propertyCategory,
        minimumArea,
      ),
    );
    mapRef.current.setFilter(
      "transfer-active-month",
      transferMonthFilter(
        firstDayOfMonth(activePoint.date),
        activePoint.date,
        propertyCategory,
        minimumArea,
      ),
    );
  }, [activePoint, mapReady, minimumArea, propertyCategory]);

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
            <span>Color tracks value change · dots are public transfer records</span>
          </div>
          <div className="pulse-legend" aria-label="Map color legend">
            <p>Change since {windowStart ? formatMonthYear(windowStart.date) : "window start"}</p>
            <span><i className="legend-transfer" /> Recorded transfer</span>
            <span><i className="legend-transfer-active" /> Active month</span>
            <span><i className="legend-decline" /> Below −2%</span>
            <span><i className="legend-stable" /> −2% to &lt;+2%</span>
            <span><i className="legend-growth" /> +2% to &lt;+10%</span>
            <span><i className="legend-strong" /> +10% or more</span>
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
              <a
                className="zillow-property-link"
                href={zillowAddressUrl(displayedTransfer.address)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`View ${displayedTransfer.address} on Zillow (opens in a new tab)`}
              >
                View on Zillow <span aria-hidden="true">↗</span>
              </a>
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

          <section className="transfer-filters" aria-labelledby="transfer-filter-heading">
            <div className="filter-heading">
              <div>
                <p className="eyebrow" id="transfer-filter-heading">Refine transfer dots</p>
                <strong>{visibleTransfers.length.toLocaleString()} matching citywide</strong>
              </div>
              {(propertyCategory !== "all" || minimumArea > 0) ? (
                <button
                  type="button"
                  onClick={() => {
                    setPropertyCategory("all");
                    setMinimumArea(0);
                    setSelectedTransfer(null);
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>
            <div className="filter-grid">
              <label>
                <span>Property class</span>
                <select
                  aria-label="Transfer property class"
                  value={propertyCategory}
                  onChange={(event) => {
                    setPropertyCategory(event.target.value as TransferCategoryFilter);
                    setSelectedTransfer(null);
                  }}
                  disabled={!data}
                >
                  <option value="all">All residential ({data?.transfers.features.length.toLocaleString() ?? "0"})</option>
                  {TRANSFER_CATEGORY_OPTIONS.filter(
                    (option) => (categoryCounts.get(option.value) ?? 0) > 0,
                  ).map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label} ({(categoryCounts.get(option.value) ?? 0).toLocaleString()})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Minimum interior</span>
                <select
                  aria-label="Minimum recorded interior area"
                  value={minimumArea}
                  onChange={(event) => {
                    setMinimumArea(Number(event.target.value));
                    setSelectedTransfer(null);
                  }}
                  disabled={!data}
                >
                  <option value={0}>Any size</option>
                  <option value={1000}>1,000+ sq ft</option>
                  <option value={1500}>1,500+ sq ft</option>
                  <option value={2000}>2,000+ sq ft</option>
                  <option value={3000}>3,000+ sq ft</option>
                </select>
              </label>
            </div>
            <p>
              Filters change parcel dots only. Sale-price filtering requires a priced transaction feed.
            </p>
          </section>

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

          {growthAnalysis && selectedGrowth && selected && windowStart ? (
            <section className="growth-context" aria-label="Featured-neighborhood growth comparison">
              <div className="growth-heading">
                <div>
                  <p className="eyebrow">Peer growth position</p>
                  <strong>{selectedGrowth.standing}</strong>
                </div>
                <span>#{selectedGrowth.rank} of {growthAnalysis.rankings.length}</span>
              </div>
              <div className="growth-rail" aria-hidden="true">
                <span style={{ left: `${growthPosition}%` }} />
              </div>
              <p className="growth-summary">
                {selected.name} is {formatPointDifference(selectedGrowth.deltaFromMedian)} the featured-neighborhood median of {formatPercent(growthAnalysis.medianChange)} since {formatMonthYear(windowStart.date)}.
              </p>
              <div className="market-extremes">
                <p className="eyebrow">Market extremes at this month</p>
                <div>
                  {[...growthAnalysis.highestGrowth, ...growthAnalysis.lowestGrowth].map((item, index) => (
                    <button
                      type="button"
                      key={item.id}
                      className={index < growthAnalysis.highestGrowth.length ? "extreme-high" : "extreme-low"}
                      onClick={() => selectNeighborhood(item.id)}
                      aria-label={`Show ${item.name}, ${formatPercent(item.change)} since window start`}
                    >
                      <span>{index < growthAnalysis.highestGrowth.length ? "Higher" : "Lower"}</span>
                      <strong>{item.name}</strong>
                      <b>{formatPercent(item.change)}</b>
                    </button>
                  ))}
                </div>
              </div>
              <small>
                “Outlier” requires at least {growthAnalysis.outlierThreshold.toFixed(1)} percentage points from the peer median; the threshold also adapts to dispersion.
              </small>
            </section>
          ) : null}

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

function buildNeighborhoodLabelPoints(
  boundaries: NeighborhoodBoundaries,
): FeatureCollection<Point, NeighborhoodBoundaryProperties> {
  return {
    type: "FeatureCollection",
    features: boundaries.features.flatMap((feature) => {
      if (!feature.properties.featured) return [];
      const coordinate = largestPolygonCentroid(feature.geometry);
      if (!coordinate) return [];
      return [{
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: coordinate },
        properties: feature.properties,
      }];
    }),
  };
}

function largestPolygonCentroid(geometry: Geometry): [number, number] | null {
  const rings = geometry.type === "Polygon"
    ? [geometry.coordinates[0]]
    : geometry.type === "MultiPolygon"
      ? geometry.coordinates.map((polygon) => polygon[0])
      : [];
  const usable = rings.filter((ring): ring is number[][] => Boolean(ring && ring.length >= 3));
  if (usable.length === 0) return null;
  const ring = usable.reduce((largest, candidate) =>
    Math.abs(ringArea(candidate)) > Math.abs(ringArea(largest)) ? candidate : largest,
  );
  const areaTwice = ringArea(ring);
  if (Math.abs(areaTwice) < 1e-12) {
    const longitudes = ring.map((point) => point[0] as number);
    const latitudes = ring.map((point) => point[1] as number);
    return [
      (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    ];
  }
  let longitude = 0;
  let latitude = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index] as number[];
    const next = ring[index + 1] as number[];
    const cross = (current[0] as number) * (next[1] as number) -
      (next[0] as number) * (current[1] as number);
    longitude += ((current[0] as number) + (next[0] as number)) * cross;
    latitude += ((current[1] as number) + (next[1] as number)) * cross;
  }
  return [longitude / (3 * areaTwice), latitude / (3 * areaTwice)];
}

function ringArea(ring: number[][]): number {
  let areaTwice = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index] as number[];
    const next = ring[index + 1] as number[];
    areaTwice += (current[0] as number) * (next[1] as number) -
      (next[0] as number) * (current[1] as number);
  }
  return areaTwice;
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

function withTransferCategories(transfers: ResidentialTransfers): ResidentialTransfers {
  return {
    ...transfers,
    features: transfers.features.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        propertyCategory: categorizePropertyType(feature.properties.propertyType),
      },
    })),
  };
}

function transferMatchesCriteria(
  properties: TransferPointProperties,
  category: TransferCategoryFilter,
  minimumArea: number,
): boolean {
  return (
    (category === "all" || properties.propertyCategory === category) &&
    (minimumArea === 0 ||
      (properties.propertyAreaSqft !== null && properties.propertyAreaSqft >= minimumArea))
  );
}

function transferCriteriaFilter(
  endDate: string,
  category: TransferCategoryFilter,
  minimumArea: number,
): ExpressionSpecification {
  const filters: ExpressionSpecification[] = [["<=", ["get", "recordedDate"], endDate]];
  if (category !== "all") {
    filters.push(["==", ["get", "propertyCategory"], category]);
  }
  if (minimumArea > 0) {
    filters.push([">=", ["coalesce", ["get", "propertyAreaSqft"], -1], minimumArea]);
  }
  return (filters.length === 1 ? filters[0] : ["all", ...filters]) as ExpressionSpecification;
}

function transferSelectedFilter(
  neighborhoodId: string,
  endDate: string,
  category: TransferCategoryFilter,
  minimumArea: number,
): FilterSpecification {
  return [
    "all",
    ["==", ["get", "neighborhoodId"], neighborhoodId],
    transferCriteriaFilter(endDate, category, minimumArea),
  ];
}

function transferMonthFilter(
  startDate: string,
  endDate: string,
  category: TransferCategoryFilter,
  minimumArea: number,
): FilterSpecification {
  return [
    "all",
    [">=", ["get", "recordedDate"], startDate],
    transferCriteriaFilter(endDate, category, minimumArea),
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

function formatPointDifference(value: number): string {
  if (Math.abs(value) < 0.05) return "in line with";
  return `${Math.abs(value).toFixed(1)} points ${value > 0 ? "above" : "below"}`;
}

function deltaClass(value: number | null): string {
  if (value === null || Math.abs(value) < 0.05) return "delta-neutral";
  return value > 0 ? "delta-positive" : "delta-negative";
}
