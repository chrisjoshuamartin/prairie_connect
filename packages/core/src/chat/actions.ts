import { z } from "zod";

/**
 * The chatbot UI-action protocol.
 *
 * Each schema below is simultaneously:
 *   1. a Bedrock tool the model can call (see tools.ts),
 *   2. runtime validation for what the model produced,
 *   3. part of the OpenAPI contract the frontend builds against.
 *
 * Adding a new UI capability = add a schema here and register it in
 * UI_ACTIONS. The protocol shape ({ type, payload }) never changes.
 */

export const showMapAction = z.object({
  type: z.literal("show_map"),
  payload: z.object({
    center: z
      .tuple([z.number(), z.number()])
      .describe("Map center as [longitude, latitude]"),
    zoom: z.number().min(1).max(20).default(8),
    layers: z
      .array(z.string())
      .default([])
      .describe(
        "Layer ids to enable, e.g. 'corridor:<slug>', 'development-sites', 'transloads'",
      ),
  }),
});

export const navigateAction = z.object({
  type: z.literal("navigate"),
  payload: z.object({
    path: z
      .string()
      .describe(
        "App-relative path to send the user to, e.g. '/directory', '/route-finder', '/corridors/great-western'",
      ),
  }),
});

export const showDirectoryResultsAction = z.object({
  type: z.literal("show_directory_results"),
  payload: z.object({
    listingIds: z
      .array(z.string())
      .default([])
      .describe("Directory listing ids to display"),
    filter: z
      .object({
        q: z.string().optional(),
        sector: z.string().optional(),
      })
      .optional()
      .describe("Filter to apply to the directory view"),
  }),
});

export const drawRouteAction = z.object({
  type: z.literal("draw_route"),
  payload: z.object({
    routeId: z
      .string()
      .optional()
      .describe("A saved route id to display, if one exists"),
    origin: z
      .object({
        lat: z.number(),
        lng: z.number(),
        label: z.string().optional(),
      })
      .optional(),
    destination: z
      .object({
        lat: z.number(),
        lng: z.number(),
        label: z.string().optional(),
      })
      .optional(),
  }),
});

export const openCorridorPageAction = z.object({
  type: z.literal("open_corridor_page"),
  payload: z.object({
    slug: z.string().describe("Corridor slug, e.g. 'great-western'"),
  }),
});

export const UI_ACTIONS = [
  showMapAction,
  navigateAction,
  showDirectoryResultsAction,
  drawRouteAction,
  openCorridorPageAction,
] as const;

export const uiActionSchema = z.discriminatedUnion("type", [
  showMapAction,
  navigateAction,
  showDirectoryResultsAction,
  drawRouteAction,
  openCorridorPageAction,
]);

export type UiAction = z.infer<typeof uiActionSchema>;
