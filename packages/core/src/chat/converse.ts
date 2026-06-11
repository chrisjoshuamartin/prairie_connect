import { Resource } from "sst";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type Message,
} from "@aws-sdk/client-bedrock-runtime";
import {
  BedrockAgentRuntimeClient,
  RetrieveCommand,
} from "@aws-sdk/client-bedrock-agent-runtime";
import { uiActionTools, toolUseToAction } from "./tools";
import type { UiAction } from "./actions";
import { publishRealtime, realtimePrefix } from "../realtime/publish";
import { topics, type ChatStreamEvent } from "../realtime/topics";

const SYSTEM_PROMPT = `You are the Prairie Connect guide — an assistant for a rail logistics platform connecting producers, shippers, short line railways, and economic development partners across the Canadian Prairies (BC, AB, SK, MB).

You help users:
- find buyers, processors, transload sites, and rail-served development sites (the Directory)
- plan shipping routes from farm/site to short line to Class I to port or processor (the Route Finder)
- explore rail corridors, interchanges, and trade opportunities (Corridor pages)

You can control the app's UI with the tools provided: show maps, draw routes, open directory results, navigate the user to other parts of the site. Use them whenever a visual answer is better than text — e.g. show the map when discussing a corridor, show directory results when recommending businesses. Keep text answers concise and rail-literate.

If retrieved context is provided below, ground your answers in it and say so when you are unsure.`;

let runtimeClient: BedrockRuntimeClient | null = null;
let agentClient: BedrockAgentRuntimeClient | null = null;

function getRuntime(): BedrockRuntimeClient {
  if (!runtimeClient) runtimeClient = new BedrockRuntimeClient({});
  return runtimeClient;
}

function getAgentRuntime(): BedrockAgentRuntimeClient {
  if (!agentClient) agentClient = new BedrockAgentRuntimeClient({});
  return agentClient;
}

/**
 * Retrieve grounding chunks from the Bedrock Knowledge Base (Aurora
 * pgvector). No-op until KNOWLEDGE_BASE_ID is configured.
 */
async function retrieveContext(query: string): Promise<string[]> {
  const kbId = Resource.Ai.knowledgeBaseId;
  if (!kbId) return [];
  try {
    const res = await getAgentRuntime().send(
      new RetrieveCommand({
        knowledgeBaseId: kbId,
        retrievalQuery: { text: query },
        retrievalConfiguration: {
          vectorSearchConfiguration: { numberOfResults: 5 },
        },
      }),
    );
    return (res.retrievalResults ?? [])
      .map((r) => r.content?.text)
      .filter((t): t is string => !!t);
  } catch (err) {
    console.warn("[chat] knowledge base retrieval failed", err);
    return [];
  }
}

export interface ChatTurnInput {
  /** Cognito sub — used to address the realtime stream topic. */
  sub: string;
  conversationId: string;
  message: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export interface ChatTurnResult {
  text: string;
  actions: UiAction[];
}

/**
 * Run one assistant turn: retrieve KB context, stream the model's reply
 * (publishing deltas + actions on the conversation's realtime topic), and
 * return the final text + validated UI actions for persistence and the
 * HTTP response.
 */
export async function runChatTurn(input: ChatTurnInput): Promise<ChatTurnResult> {
  const prefix = realtimePrefix();
  const topic = topics.chat(prefix, input.sub, input.conversationId);
  const publish = (event: ChatStreamEvent) => publishRealtime(topic, event);

  const context = await retrieveContext(input.message);
  const system =
    context.length > 0
      ? `${SYSTEM_PROMPT}\n\nRetrieved context:\n${context.map((c, i) => `[${i + 1}] ${c}`).join("\n\n")}`
      : SYSTEM_PROMPT;

  const messages: Message[] = [
    ...input.history.map(
      (m): Message => ({ role: m.role, content: [{ text: m.content }] }),
    ),
    { role: "user", content: [{ text: input.message }] },
  ];

  const res = await getRuntime().send(
    new ConverseStreamCommand({
      modelId: Resource.Ai.chatModelId,
      system: [{ text: system }],
      messages,
      toolConfig: uiActionTools(),
      inferenceConfig: { maxTokens: 1024, temperature: 0.4 },
    }),
  );

  let text = "";
  const actions: UiAction[] = [];
  // Tool inputs stream in as JSON fragments keyed by contentBlockIndex.
  const pendingTools = new Map<number, { name: string; json: string }>();

  for await (const event of res.stream ?? []) {
    if (event.contentBlockStart?.start?.toolUse) {
      pendingTools.set(event.contentBlockStart.contentBlockIndex!, {
        name: event.contentBlockStart.start.toolUse.name!,
        json: "",
      });
    } else if (event.contentBlockDelta?.delta) {
      const idx = event.contentBlockDelta.contentBlockIndex!;
      const delta = event.contentBlockDelta.delta;
      if (delta.text) {
        text += delta.text;
        await publish({ type: "delta", text: delta.text });
      } else if (delta.toolUse?.input !== undefined) {
        const pending = pendingTools.get(idx);
        if (pending) pending.json += delta.toolUse.input;
      }
    } else if (event.contentBlockStop) {
      const pending = pendingTools.get(event.contentBlockStop.contentBlockIndex!);
      if (pending) {
        pendingTools.delete(event.contentBlockStop.contentBlockIndex!);
        try {
          const action = toolUseToAction(
            pending.name,
            pending.json ? JSON.parse(pending.json) : {},
          );
          if (action) {
            actions.push(action);
            await publish({ type: "action", action });
          }
        } catch (err) {
          console.warn(`[chat] bad tool input for ${pending.name}`, err);
        }
      }
    }
  }

  return { text, actions };
}
