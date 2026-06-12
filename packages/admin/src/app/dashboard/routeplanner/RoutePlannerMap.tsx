"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const OSM_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "&copy; OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

const SOURCE_ID = "plan";

export interface PlannerPin {
  lng: number;
  lat: number;
  kind: "origin" | "destination" | "site" | "site-active";
  label?: string;
}

const PIN_COLORS: Record<PlannerPin["kind"], string> = {
  origin: "#4ade80",
  destination: "#f87171",
  site: "#737373",
  "site-active": "#e0a82e",
};

function collectPositions(value: unknown, out: [number, number][]) {
  if (!Array.isArray(value)) {
    if (typeof value === "object" && value !== null) {
      for (const v of Object.values(value)) collectPositions(v, out);
    }
    return;
  }
  if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
    out.push([value[0], value[1]]);
    return;
  }
  for (const v of value) collectPositions(v, out);
}

/**
 * Planner map: click to set endpoints, truck legs render dashed, rail legs
 * solid, with pins for endpoints and directory sites.
 */
export function RoutePlannerMap({
  geojson,
  pins,
  onMapClick,
  className,
}: {
  geojson: Record<string, unknown> | null;
  pins: PlannerPin[];
  onMapClick?: (pos: { lng: number; lat: number }) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const clickHandlerRef = useRef(onMapClick);
  clickHandlerRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [-108, 52.5],
      zoom: 4.2,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.on("click", (e) => {
      clickHandlerRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
    map.getCanvas().style.cursor = "crosshair";
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const m of markerRefs.current) m.remove();
    markerRefs.current = pins.map((pin) => {
      const marker = new maplibregl.Marker({
        color: PIN_COLORS[pin.kind],
        scale: pin.kind === "site" ? 0.6 : 0.9,
      }).setLngLat([pin.lng, pin.lat]);
      if (pin.label) {
        marker.setPopup(new maplibregl.Popup({ closeButton: false }).setText(pin.label));
      }
      return marker.addTo(map);
    });
  }, [pins]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      const data = (geojson ?? {
        type: "FeatureCollection",
        features: [],
      }) as unknown as GeoJSON.GeoJSON;

      const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (source) {
        source.setData(data);
      } else {
        map.addSource(SOURCE_ID, { type: "geojson", data });
        map.addLayer({
          id: "plan-rail",
          type: "line",
          source: SOURCE_ID,
          filter: ["!=", ["get", "mode"], "truck"],
          paint: {
            "line-color": "#e0a82e",
            "line-width": 3,
            "line-opacity": 0.95,
          },
        });
        map.addLayer({
          id: "plan-truck",
          type: "line",
          source: SOURCE_ID,
          filter: ["==", ["get", "mode"], "truck"],
          paint: {
            "line-color": "#38bdf8",
            "line-width": 2.5,
            "line-dasharray": [2, 2],
            "line-opacity": 0.95,
          },
        });
      }

      if (geojson) {
        const positions: [number, number][] = [];
        collectPositions(geojson, positions);
        if (positions.length > 0) {
          const bounds = positions.reduce(
            (b, p) => b.extend(p),
            new maplibregl.LngLatBounds(positions[0], positions[0]),
          );
          map.fitBounds(bounds, { padding: 60, maxZoom: 10, duration: 500 });
        }
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [geojson]);

  return (
    <div
      ref={containerRef}
      className={
        className ?? "w-full h-[32rem] rounded-xl overflow-hidden border border-neutral-800"
      }
    />
  );
}
