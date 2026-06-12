/**
 * Code-defined registry of map layers the frontend can render. Serving
 * this from the API keeps the client from hardcoding layer ids/sources;
 * layers move from "planned" to "available" as their data lands without
 * any frontend change.
 *
 * `source` describes where the data comes from today. GeoJSON sources are
 * API endpoints returning Feature/FeatureCollection geometry.
 */
export interface MapLayer {
  id: string;
  title: string;
  description: string;
  /** Rendering hint: line | point | polygon */
  kind: "line" | "point" | "polygon";
  status: "available" | "planned";
  /** Suggested default visibility for the main atlas view. */
  defaultVisible: boolean;
  source: {
    type: "geojson-api" | "none";
    /** Endpoint(s) to fetch from, when type is geojson-api. */
    hint?: string;
  };
}

export const MAP_LAYERS: MapLayer[] = [
  {
    id: "shortlines",
    title: "Short line railways",
    description: "The 18 short line corridors across BC, AB, SK, and MB.",
    kind: "line",
    status: "available",
    defaultVisible: true,
    source: {
      type: "geojson-api",
      hint: "GET /v1/corridors then GET /v1/corridors/{slug} for geometry",
    },
  },
  {
    id: "class1",
    title: "Class I connections",
    description: "CN and CPKC mainlines the short lines interchange with.",
    kind: "line",
    status: "available",
    defaultVisible: true,
    source: {
      type: "geojson-api",
      hint: "Corridors with operator CN/CPKC via GET /v1/corridors",
    },
  },
  {
    id: "interchanges",
    title: "Interchanges",
    description: "Short line to Class I interchange points.",
    kind: "point",
    status: "planned",
    defaultVisible: true,
    source: { type: "none" },
  },
  {
    id: "ports",
    title: "Ports",
    description: "Export gateways (Vancouver, Prince Rupert, Thunder Bay, Churchill).",
    kind: "point",
    status: "available",
    defaultVisible: false,
    source: {
      type: "geojson-api",
      hint: "GET /v1/directory?type=port (listings carry lat/lng when located)",
    },
  },
  {
    id: "transloads",
    title: "Transloads & terminals",
    description: "Truck-to-rail transload and terminal facilities from the directory.",
    kind: "point",
    status: "available",
    defaultVisible: false,
    source: {
      type: "geojson-api",
      hint: "GET /v1/directory?type=transload (listings carry lat/lng when located)",
    },
  },
  {
    id: "communities",
    title: "Communities",
    description: "Towns and cities along each corridor.",
    kind: "point",
    status: "planned",
    defaultVisible: false,
    source: { type: "none" },
  },
  {
    id: "development-sites",
    title: "Development sites",
    description: "Rail-served and rail-adjacent land ready for investment.",
    kind: "polygon",
    status: "planned",
    defaultVisible: false,
    source: { type: "none" },
  },
  {
    id: "resource-clusters",
    title: "Resource clusters",
    description: "Commodity and resource overlays (agrivalue, lumber, wind, aggregates, minerals).",
    kind: "polygon",
    status: "planned",
    defaultVisible: false,
    source: { type: "none" },
  },
  {
    id: "route-segments",
    title: "Route segments",
    description: "Computed shipping routes from the route finder.",
    kind: "line",
    status: "available",
    defaultVisible: false,
    source: {
      type: "geojson-api",
      hint: "POST /v1/routes/find returns a GeoJSON FeatureCollection",
    },
  },
  {
    id: "featured-partners",
    title: "Featured partners",
    description: "Sponsored placements with a map presence.",
    kind: "point",
    status: "available",
    defaultVisible: false,
    source: {
      type: "geojson-api",
      hint: "GET /v1/featured-placements?page=map (join listings for coordinates)",
    },
  },
];
