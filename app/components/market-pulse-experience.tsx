"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CircleLayerSpecification,
  FillLayerSpecification,
  FilterSpecification,
  LineLayerSpecification,
  LngLatBoundsLike,
  Map as MapLibreMap,
} from "maplibre-gl";
import type { FeatureCollection, Geometry, Point } from "geojson";
import type { CommunitySummary, MarketPulseDataset, RecordedSale } from "@/src/types";
import { PulseChart } from "./pulse-chart";

type CommunityId = "pima-canyon" | "finisterra" | "ventana-canyon";

interface SalePointProperties {
  id: string;
  communityId: CommunityId;
  sequenceId: string;
  parcelId: string;
  recordingDate: string;
  salePrice: number;
  propertyType: string;
  pricePerSqft: number | null;
  lotSizeSqft: number | null;
  qualityTier: "A" | "B";
  recordingEpoch?: number;
}

interface ParcelMapProperties {
  parcelId: string;
  communityId: CommunityId;
  membershipReviewStatus: "approved" | "needs_review";
}

interface CommunityBoundaryProperties {
  communityId: CommunityId;
  boundaryVersion: string;
  platId: string;
  subdivisionName: string | null;
}

interface ExperienceData {
  dataset: MarketPulseDataset;
  salePoints: FeatureCollection<Point, SalePointProperties>;
  communityBoundaries: FeatureCollection<Geometry, CommunityBoundaryProperties>;
  parcels: FeatureCollection<Geometry, ParcelMapProperties>;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
const DEFAULT_COMMUNITY: CommunityId = "ventana-canyon";
const COMMUNITY_ACCENTS: Record<CommunityId, string> = {
  "pima-canyon": "#60796d",
  finisterra: "#8b6d58",
  "ventana-canyon": "#aa7740",
};

export function MarketPulseExperience() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [data, setData] = useState<ExperienceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityId>(DEFAULT_COMMUNITY);
  const [monthOffset, setMonthOffset] = useState(12);
  const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadData() {
      try {
        const [datasetResponse, salesResponse, boundariesResponse, parcelsResponse] =
          await Promise.all([
            fetch("/data/market-pulse.json", { signal: controller.signal }),
            fetch("/data/recorded-sales.geojson", { signal: controller.signal }),
            fetch("/data/community-boundaries.geojson", { signal: controller.signal }),
            fetch("/data/pilot-parcels.geojson", { signal: controller.signal }),
          ]);
        const responses = [
          datasetResponse,
          salesResponse,
          boundariesResponse,
          parcelsResponse,
        ];
        if (responses.some((response) => !response.ok)) {
          throw new Error("One or more published data files could not be loaded.");
        }
        const [dataset, salePoints, communityBoundaries, parcels] = await Promise.all([
          datasetResponse.json() as Promise<MarketPulseDataset>,
          salesResponse.json() as Promise<FeatureCollection<Point, SalePointProperties>>,
          boundariesResponse.json() as Promise<
            FeatureCollection<Geometry, CommunityBoundaryProperties>
          >,
          parcelsResponse.json() as Promise<FeatureCollection<Geometry, ParcelMapProperties>>,
        ]);
        setData({ dataset, salePoints, communityBoundaries, parcels });
        const initial = dataset.communities.find((community) => community.id === DEFAULT_COMMUNITY);
        if (initial) setMonthOffset(initial.analysisWindowMonths);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setLoadError(error instanceof Error ? error.message : "The map data could not be loaded.");
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

  const activeCommunity = useMemo(
    () => data?.dataset.communities.find((community) => community.id === selectedCommunity) ?? null,
    [data, selectedCommunity],
  );
  const visibleThrough = activeCommunity
    ? dateAtOffset(
        activeCommunity.analysisWindowStartDate,
        monthOffset,
        activeCommunity.analysisWindowMonths,
        activeCommunity.analysisWindowEndDate,
      )
    : "";

  const selectedSale = useMemo(
    () => data?.dataset.sales.find((sale) => sale.id === selectedSaleId) ?? null,
    [data, selectedSaleId],
  );

  const eligibleCommunitySales = useMemo(() => {
    if (!data || !activeCommunity) return [];
    return uniqueTransactions(
      data.dataset.sales.filter(
        (sale) =>
          sale.communityId === selectedCommunity &&
          isMarketEligible(sale) &&
          sale.recordingDate >= activeCommunity.analysisWindowStartDate &&
          sale.recordingDate <= visibleThrough,
      ),
    );
  }, [activeCommunity, data, selectedCommunity, visibleThrough]);

  const selectCommunity = useCallback(
    (communityId: CommunityId) => {
      if (!data) return;
      const community = data.dataset.communities.find((candidate) => candidate.id === communityId);
      if (!community) return;
      setSelectedCommunity(communityId);
      setMonthOffset(community.analysisWindowMonths);
      setSelectedSaleId(null);
      setIsPlaying(false);
    },
    [data],
  );

  useEffect(() => {
    if (!data || !mapContainerRef.current || mapRef.current) return;
    const loadedData = data;
    const mapContainer = mapContainerRef.current;
    let disposed = false;
    let map: MapLibreMap | null = null;

    async function initializeMap() {
      const maplibregl = await import("maplibre-gl");
      if (disposed || !mapContainerRef.current) return;

      const salePoints: FeatureCollection<Point, SalePointProperties> = {
        ...loadedData.salePoints,
        features: loadedData.salePoints.features.map((feature) => ({
          ...feature,
          properties: {
            ...feature.properties,
            recordingEpoch: Date.parse(`${feature.properties.recordingDate}T00:00:00Z`),
          },
        })),
      };

      map = new maplibregl.Map({
        container: mapContainer,
        style: MAP_STYLE,
        center: [-110.91, 32.33],
        zoom: 12.2,
        pitch: 47,
        bearing: -16,
        maxPitch: 65,
        canvasContextAttributes: { antialias: true },
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(
        new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }),
        "top-right",
      );
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: "Recorded sales: Pima County public records",
        }),
        "bottom-right",
      );

      map.on("load", () => {
        if (!map || disposed) return;
        map.getCanvas().setAttribute(
          "aria-label",
          "Interactive map of recorded home sales in Catalina Foothills micro-markets",
        );
        map.addSource("community-boundaries", {
          type: "geojson",
          data: loadedData.communityBoundaries,
        });
        map.addSource("pilot-parcels", { type: "geojson", data: loadedData.parcels });
        map.addSource("recorded-sales", { type: "geojson", data: salePoints });

        map.addLayer({
          id: "community-wash",
          type: "fill",
          source: "community-boundaries",
          paint: { "fill-color": communityColorExpression(), "fill-opacity": 0.035 },
        } as FillLayerSpecification);
        map.addLayer({
          id: "community-selected",
          type: "fill",
          source: "community-boundaries",
          filter: ["==", ["get", "communityId"], DEFAULT_COMMUNITY],
          paint: { "fill-color": COMMUNITY_ACCENTS[DEFAULT_COMMUNITY], "fill-opacity": 0.12 },
        } as FillLayerSpecification);
        map.addLayer({
          id: "community-outline",
          type: "line",
          source: "community-boundaries",
          paint: {
            "line-color": communityColorExpression(),
            "line-width": 1.3,
            "line-opacity": 0.58,
          },
        } as LineLayerSpecification);
        map.addLayer({
          id: "parcel-selected-fill",
          type: "fill",
          source: "pilot-parcels",
          filter: ["==", ["get", "communityId"], DEFAULT_COMMUNITY],
          paint: { "fill-color": COMMUNITY_ACCENTS[DEFAULT_COMMUNITY], "fill-opacity": 0.045 },
        } as FillLayerSpecification);
        map.addLayer({
          id: "parcel-lines",
          type: "line",
          source: "pilot-parcels",
          paint: { "line-color": "#4e5b55", "line-width": 0.55, "line-opacity": 0.28 },
        } as LineLayerSpecification);
        map.addLayer({
          id: "parcel-selected-lines",
          type: "line",
          source: "pilot-parcels",
          filter: ["==", ["get", "communityId"], DEFAULT_COMMUNITY],
          paint: {
            "line-color": COMMUNITY_ACCENTS[DEFAULT_COMMUNITY],
            "line-width": 0.9,
            "line-opacity": 0.68,
          },
        } as LineLayerSpecification);
        map.addLayer({
          id: "parcel-review-lines",
          type: "line",
          source: "pilot-parcels",
          filter: ["==", ["get", "membershipReviewStatus"], "needs_review"],
          paint: {
            "line-color": "#8d3b32",
            "line-width": 1.4,
            "line-opacity": 0.7,
            "line-dasharray": [2, 1.5],
          },
        } as LineLayerSpecification);
        map.addLayer({
          id: "sales-glow",
          type: "circle",
          source: "recorded-sales",
          paint: {
            "circle-color": "#b77935",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 18],
            "circle-blur": 0.82,
            "circle-opacity": 0.34,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "sales-core",
          type: "circle",
          source: "recorded-sales",
          paint: {
            "circle-color": [
              "step",
              ["get", "salePrice"],
              "#d9bd8b",
              1_000_000,
              "#b47b3d",
              2_000_000,
              "#774820",
            ],
            "circle-radius": [
              "interpolate",
              ["linear"],
              ["get", "salePrice"],
              400_000,
              3.4,
              2_000_000,
              5.8,
              5_000_000,
              8,
            ],
            "circle-stroke-color": "#fffaf0",
            "circle-stroke-width": 1,
            "circle-opacity": 0.94,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "sales-current-period",
          type: "circle",
          source: "recorded-sales",
          paint: {
            "circle-color": "#f2d7a6",
            "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 8, 14, 14],
            "circle-blur": 0.45,
            "circle-opacity": 0.62,
            "circle-stroke-color": "#9b632e",
            "circle-stroke-width": 1.2,
          },
        } as CircleLayerSpecification);
        map.addLayer({
          id: "sales-selected",
          type: "circle",
          source: "recorded-sales",
          filter: ["==", ["get", "id"], "__none__"],
          paint: {
            "circle-color": "#fff7e7",
            "circle-radius": 9,
            "circle-stroke-color": "#6f431e",
            "circle-stroke-width": 2.4,
          },
        } as CircleLayerSpecification);

        map.on("click", "sales-core", (event) => {
          const feature = event.features?.[0];
          const id = feature?.properties?.id;
          if (typeof id === "string") setSelectedSaleId(id);
        });
        map.on("mouseenter", "sales-core", () => {
          if (map) map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "sales-core", () => {
          if (map) map.getCanvas().style.cursor = "";
        });

        setMapReady(true);
      });
    }

    void initializeMap();
    return () => {
      disposed = true;
      setMapReady(false);
      map?.remove();
      mapRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!data || !activeCommunity || !map || !mapReady || !visibleThrough) return;
    const selectedFilter: FilterSpecification = [
      "==",
      ["get", "communityId"],
      selectedCommunity,
    ];
    const startEpoch = Date.parse(`${activeCommunity.analysisWindowStartDate}T00:00:00Z`);
    const endEpoch = Date.parse(`${visibleThrough}T23:59:59Z`);
    const saleFilter: FilterSpecification = [
      "all",
      selectedFilter,
      [">=", ["get", "recordingEpoch"], startEpoch],
      ["<=", ["get", "recordingEpoch"], endEpoch],
    ];
    const currentPeriodStart = monthStart(visibleThrough);
    const currentFilter: FilterSpecification = [
      "all",
      saleFilter,
      [">=", ["get", "recordingEpoch"], Date.parse(`${currentPeriodStart}T00:00:00Z`)],
    ];

    map.setFilter("community-selected", selectedFilter);
    map.setFilter("parcel-selected-fill", selectedFilter);
    map.setFilter("parcel-selected-lines", selectedFilter);
    map.setFilter("sales-glow", saleFilter);
    map.setFilter("sales-core", saleFilter);
    map.setFilter("sales-current-period", currentFilter);
    map.setFilter("sales-selected", ["==", ["get", "id"], selectedSaleId ?? "__none__"]);
    map.setPaintProperty("community-selected", "fill-color", COMMUNITY_ACCENTS[selectedCommunity]);
    map.setPaintProperty("parcel-selected-fill", "fill-color", COMMUNITY_ACCENTS[selectedCommunity]);
    map.setPaintProperty("parcel-selected-lines", "line-color", COMMUNITY_ACCENTS[selectedCommunity]);
  }, [
    activeCommunity,
    data,
    mapReady,
    selectedCommunity,
    selectedSaleId,
    visibleThrough,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!data || !map || !mapReady) return;
    fitCommunity(map, data.parcels, selectedCommunity, reducedMotion);
  }, [data, mapReady, reducedMotion, selectedCommunity]);

  useEffect(() => {
    if (!isPlaying || !activeCommunity) return;
    if (reducedMotion) return;
    const timer = window.setInterval(() => {
      setMonthOffset((current) => {
        if (current >= activeCommunity.analysisWindowMonths) {
          setIsPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 650);
    return () => window.clearInterval(timer);
  }, [activeCommunity, isPlaying, reducedMotion]);

  const togglePlayback = () => {
    if (!activeCommunity || reducedMotion) return;
    if (!isPlaying && monthOffset >= activeCommunity.analysisWindowMonths) setMonthOffset(0);
    setSelectedSaleId(null);
    setIsPlaying((current) => !current);
  };

  if (loadError) {
    return (
      <main className="error-state">
        <p className="eyebrow">Foothills Market Pulse</p>
        <h1>The recorded-sales files could not be opened.</h1>
        <p>{loadError}</p>
      </main>
    );
  }

  if (!data || !activeCommunity) {
    return (
      <main className="loading-state" aria-live="polite">
        <div className="loading-mark" aria-hidden="true" />
        <p>Assembling the latest recorded-sales view…</p>
      </main>
    );
  }

  const accentStyle = { "--community-accent": COMMUNITY_ACCENTS[selectedCommunity] } as CSSProperties;

  return (
    <main className="experience" style={accentStyle}>
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-rule" aria-hidden="true" />
          <div>
            <p className="eyebrow">Catalina Foothills</p>
            <h1>Market Pulse</h1>
          </div>
        </div>
        <div className="data-stamp">
          <span className="status-label"><span aria-hidden="true" />Recent recorded sales</span>
          <time dateTime={data.dataset.dataThroughDate}>
            Data through {formatDate(data.dataset.dataThroughDate)}
          </time>
        </div>
      </header>

      <section className="market-stage" aria-label="Interactive market pulse">
        <div className="map-frame">
          <div ref={mapContainerRef} className="market-map" />
          {!mapReady ? <div className="map-loading">Drawing parcel boundaries…</div> : null}

          <nav className="community-switcher" aria-label="Choose a micro-market">
            {data.dataset.communities.map((community) => {
              const id = community.id as CommunityId;
              const selected = id === selectedCommunity;
              return (
                <button
                  type="button"
                  key={community.id}
                  className={selected ? "community-tab is-active" : "community-tab"}
                  aria-pressed={selected}
                  onClick={() => selectCommunity(id)}
                >
                  <span>{community.name}</span>
                  <small>{community.trailing12MonthSaleCount} / 12 mo</small>
                </button>
              );
            })}
          </nav>

          <div className="price-legend" aria-label="Recorded price bands">
            <span><i className="legend-low" />Under $1M</span>
            <span><i className="legend-mid" />$1M–$2M</span>
            <span><i className="legend-high" />$2M+</span>
          </div>

          <div className="time-scrubber">
            <div className="scrub-heading">
              <div>
                <p className="eyebrow">Recorded through</p>
                <output htmlFor="market-month">{formatMonthYear(visibleThrough)}</output>
              </div>
              <span className="visible-sales-count">
                {eligibleCommunitySales.length} visible {eligibleCommunitySales.length === 1 ? "sale" : "sales"}
              </span>
            </div>
            <div className="scrub-controls">
              <button
                type="button"
                className="play-button"
                onClick={togglePlayback}
                disabled={reducedMotion}
                aria-label={
                  reducedMotion
                    ? "Playback disabled because reduced motion is enabled"
                    : isPlaying
                      ? "Pause timeline"
                      : "Play timeline"
                }
              >
                <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
              </button>
              <label className="sr-only" htmlFor="market-month">
                Recorded-sales timeline for {activeCommunity.name}
              </label>
              <input
                id="market-month"
                className="timeline-range"
                type="range"
                min="0"
                max={activeCommunity.analysisWindowMonths}
                value={monthOffset}
                onChange={(event) => {
                  setMonthOffset(Number(event.target.value));
                  setSelectedSaleId(null);
                  setIsPlaying(false);
                }}
                aria-valuetext={formatMonthYear(visibleThrough)}
              />
            </div>
            <div className="timeline-ends" aria-hidden="true">
              <span>{formatMonthYear(activeCommunity.analysisWindowStartDate)}</span>
              <span>{formatMonthYear(activeCommunity.analysisWindowEndDate)}</span>
            </div>
          </div>
        </div>

        <aside className="pulse-panel" aria-labelledby="community-name">
          <div className="pulse-heading">
            <p className="eyebrow">Micro-market pulse</p>
            <h2 id="community-name">{activeCommunity.name}</h2>
            <p className="window-label">{activeCommunity.analysisWindowLabel}</p>
          </div>

          <dl className="pulse-metrics">
            <div>
              <dt>Median sale</dt>
              <dd>{formatCompactCurrency(activeCommunity.medianSalePrice)}</dd>
              <small>Trailing 12 months</small>
            </div>
            <div>
              <dt>Median price / sqft</dt>
              <dd>{formatPricePerSqft(activeCommunity.medianPricePerSqft)}</dd>
              <small>Trailing 12 months</small>
            </div>
            <div>
              <dt>Sales in view</dt>
              <dd>{activeCommunity.saleCountInWindow}</dd>
              <small>{activeCommunity.analysisWindowMonths}-month window</small>
            </div>
            <div>
              <dt>Lot-size range</dt>
              <dd>{formatLotRange(activeCommunity)}</dd>
              <small>Single-family sales</small>
            </div>
          </dl>

          <PulseChart
            community={activeCommunity}
            sales={data.dataset.sales}
            visibleThrough={visibleThrough}
          />

          <div className={selectedSale ? "sale-detail has-selection" : "sale-detail"}>
            {selectedSale ? (
              <>
                <div className="sale-detail-heading">
                  <p className="eyebrow">Selected recorded sale</p>
                  <button
                    type="button"
                    className="detail-close"
                    onClick={() => setSelectedSaleId(null)}
                    aria-label="Clear selected sale"
                  >
                    ×
                  </button>
                </div>
                <h3>{selectedSale.address ?? "Address unavailable"}</h3>
                <div className="sale-detail-grid">
                  <span><b>{formatCurrency(selectedSale.salePrice)}</b>Recorded price</span>
                  <span><b>{formatPricePerSqft(selectedSale.pricePerSqft)}</b>Price / sqft</span>
                  <span><b>{formatInteger(selectedSale.assessorSqft)}</b>Assessor sqft</span>
                  <span><b>{formatAcres(selectedSale.lotSizeAcres)}</b>GIS lot size</span>
                </div>
                <p>Recorded {formatDate(selectedSale.recordingDate)} · Quality tier {selectedSale.qualityTier}</p>
              </>
            ) : (
              <p>Select a glowing sale on the map to inspect its public-record details.</p>
            )}
          </div>

          <p className="method-note">
            Price levels use only the trailing 12 months. Extended history is used for trend context,
            never as today&apos;s median. Recording date drives the map; exact close day and days to close
            are not available from public records.
          </p>
        </aside>
      </section>

      <footer className="site-footer">
        <span>Pima County Assessor + GIS</span>
        <span>Basemap © OpenStreetMap contributors · OpenFreeMap</span>
        <span>{data.dataset.label}</span>
      </footer>
    </main>
  );
}

function isMarketEligible(sale: RecordedSale): boolean {
  return (
    sale.residentialScope &&
    sale.salePrice !== null &&
    sale.qualityTier !== "X" &&
    sale.membershipReviewStatus === "approved"
  );
}

function uniqueTransactions(sales: readonly RecordedSale[]): RecordedSale[] {
  const transactions = new Map<string, RecordedSale>();
  for (const sale of sales) {
    if (!transactions.has(sale.sequenceId)) transactions.set(sale.sequenceId, sale);
  }
  return [...transactions.values()];
}

function dateAtOffset(startDate: string, offset: number, maximum: number, endDate: string): string {
  if (offset >= maximum) return endDate;
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string): string {
  return `${value.slice(0, 7)}-01`;
}

function communityColorExpression(): unknown[] {
  return [
    "match",
    ["get", "communityId"],
    "pima-canyon",
    COMMUNITY_ACCENTS["pima-canyon"],
    "finisterra",
    COMMUNITY_ACCENTS.finisterra,
    "ventana-canyon",
    COMMUNITY_ACCENTS["ventana-canyon"],
    "#6d756f",
  ];
}

function fitCommunity(
  map: MapLibreMap,
  parcels: FeatureCollection<Geometry, ParcelMapProperties>,
  communityId: CommunityId,
  reducedMotion: boolean,
) {
  let minLongitude = Number.POSITIVE_INFINITY;
  let minLatitude = Number.POSITIVE_INFINITY;
  let maxLongitude = Number.NEGATIVE_INFINITY;
  let maxLatitude = Number.NEGATIVE_INFINITY;
  for (const feature of parcels.features) {
    if (feature.properties.communityId !== communityId) continue;
    visitGeometry(feature.geometry, (longitude, latitude) => {
      minLongitude = Math.min(minLongitude, longitude);
      minLatitude = Math.min(minLatitude, latitude);
      maxLongitude = Math.max(maxLongitude, longitude);
      maxLatitude = Math.max(maxLatitude, latitude);
    });
  }
  if (!Number.isFinite(minLongitude)) return;
  map.fitBounds(
    [
      [minLongitude, minLatitude],
      [maxLongitude, maxLatitude],
    ] as LngLatBoundsLike,
    {
      padding: { top: 74, right: 64, bottom: 148, left: 64 },
      bearing: -16,
      pitch: 47,
      duration: reducedMotion ? 0 : 1100,
      maxZoom: 14.4,
    },
  );
}

function visitGeometry(
  geometry: Geometry,
  callback: (longitude: number, latitude: number) => void,
) {
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries) visitGeometry(child, callback);
    return;
  }
  visitCoordinates(geometry.coordinates, callback);
}

function visitCoordinates(value: unknown, callback: (longitude: number, latitude: number) => void) {
  if (!Array.isArray(value)) return;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    callback(value[0], value[1]);
    return;
  }
  for (const child of value) visitCoordinates(child, callback);
}

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCompactCurrency(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPricePerSqft(value: number | null): string {
  if (value === null) return "—";
  return `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value)}`;
}

function formatInteger(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
}

function formatAcres(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(value < 1 ? 2 : 1)} ac`;
}

function formatLotRange(community: CommunitySummary): string {
  const range = community.lotSizeRangeAcres;
  return range ? `${range.min.toFixed(2)}–${range.max.toFixed(2)} ac` : "—";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMonthYear(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}
