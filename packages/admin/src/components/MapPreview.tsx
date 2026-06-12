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

const SOURCE_ID = "preview";

/** Collect every [lng, lat] position from arbitrarily nested GeoJSON. */
function collectPositions(value: unknown, out: [number, number][]) {
  if (!Array.isArray(value)) {
    if (typeof value === "object" && value !== null) {
      for (const v of Object.values(value)) collectPositions(v, out);
    }
    return;
  }
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    out.push([value[0], value[1]]);
    return;
  }
  for (const v of value) collectPositions(v, out);
}

export interface MapMarker {
  lng: number;
  lat: number;
  color?: string;
  /** Tooltip text. */
  label?: string;
}

export function MapPreview({
  geojson,
  markers,
  onMapClick,
  fitToData = true,
  className,
}: {
  geojson: Record<string, unknown> | null;
  markers?: MapMarker[];
  onMapClick?: (pos: { lng: number; lat: number }) => void;
  /** Re-fit the viewport whenever the GeoJSON changes (default true). */
  fitToData?: boolean;
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
      center: [-106, 52.5],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    map.on("click", (e) => {
      clickHandlerRef.current?.({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    });
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
    markerRefs.current = (markers ?? []).map((m) => {
      const marker = new maplibregl.Marker({ color: m.color ?? "#e0a82e" })
        .setLngLat([m.lng, m.lat]);
      if (m.label) {
        marker.setPopup(new maplibregl.Popup({ closeButton: false }).setText(m.label));
      }
      return marker.addTo(map);
    });
  }, [markers]);

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
          id: "preview-line",
          type: "line",
          source: SOURCE_ID,
          paint: {
            "line-color": "#e0a82e",
            "line-width": 2.5,
            "line-opacity": 0.9,
          },
        });
      }

      if (geojson && fitToData) {
        const positions: [number, number][] = [];
        collectPositions(geojson, positions);
        if (positions.length > 0) {
          const bounds = positions.reduce(
            (b, p) => b.extend(p),
            new maplibregl.LngLatBounds(positions[0], positions[0]),
          );
          map.fitBounds(bounds, { padding: 40, maxZoom: 11, duration: 400 });
        }
      }
    };

    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [geojson, fitToData]);

  return (
    <div
      ref={containerRef}
      className={
        className ??
        "w-full h-72 rounded-xl overflow-hidden border border-neutral-800"
      }
    />
  );
}
