import { z } from "zod";
import type { Tool, ToolConfiguration } from "@aws-sdk/client-bedrock-runtime";
import { UI_ACTIONS, uiActionSchema, type UiAction } from "./actions";

const TOOL_DESCRIPTIONS: Record<string, string> = {
  show_map:
    "Display an interactive map to the user, centered on a location with optional layers (corridors, development sites, transloads).",
  navigate:
    "Send the user to another part of the Prairie Connect app (directory, route finder, a corridor page, etc.).",
  show_directory_results:
    "Show specific directory/marketplace listings or a filtered directory view to the user.",
  draw_route:
    "Draw a shipping route on the map between an origin and destination, or display a saved route by id.",
  open_corridor_page:
    "Open the detail page for a specific rail corridor.",
};

/**
 * Each UI action becomes a Bedrock tool whose input schema is the action's
 * payload. The model "calls" the tool; we validate the input and forward it
 * to the client as a typed action — the tool never executes server-side.
 */
export function uiActionTools(): ToolConfiguration {
  const tools: Tool[] = UI_ACTIONS.map((action) => {
    const name = action.shape.type.value;
    const payloadJsonSchema = z.toJSONSchema(action.shape.payload, {
      target: "draft-7",
    });
    return {
      toolSpec: {
        name,
        description: TOOL_DESCRIPTIONS[name] ?? name,
        inputSchema: { json: payloadJsonSchema as any },
      },
    };
  });
  return { tools };
}

/** Validate a model tool call into a typed UiAction (null if invalid). */
export function toolUseToAction(
  name: string,
  input: unknown,
): UiAction | null {
  const parsed = uiActionSchema.safeParse({ type: name, payload: input });
  if (!parsed.success) {
    console.warn(
      `[chat] model emitted invalid action '${name}':`,
      parsed.error.message,
    );
    return null;
  }
  return parsed.data;
}
