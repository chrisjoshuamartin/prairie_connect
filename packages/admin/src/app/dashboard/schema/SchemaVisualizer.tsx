"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  MarkerType,
  type Node,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import ELK from "elkjs/lib/elk.bundled.js";
import { TableNode, type TableNodeData } from "@/components/schema/TableNode";
import type { SchemaGraph, SchemaTable, SchemaView } from "@/lib/schema-graph";

const nodeTypes: NodeTypes = { table: TableNode };

const elk = new ELK();

const VIEW_TABS: { id: SchemaView; label: string }[] = [
  { id: "rail", label: "Rail & corridors" },
  { id: "directory", label: "Directory" },
  { id: "platform", label: "Platform" },
  { id: "all", label: "Full database" },
  { id: "api", label: "API" },
];

function nodeHeight(table: SchemaTable): number {
  const rows = Math.min(table.columns.length, 14);
  const extra = table.columns.length > 14 ? 1 : 0;
  return 44 + rows * 20 + extra * 16 + 12;
}

async function layoutTables(
  tables: SchemaTable[],
  edges: { id: string; from: string; to: string }[],
): Promise<Node<TableNodeData>[]> {
  if (tables.length === 0) return [];

  const children = tables.map((t) => ({
    id: t.id,
    width: 240,
    height: nodeHeight(t),
  }));

  const layouted = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "96",
    },
    children,
    edges: edges.map((e) => ({
      id: e.id,
      sources: [e.from],
      targets: [e.to],
    })),
  });

  return tables.map((t) => {
    const layoutNode = layouted.children?.find((c) => c.id === t.id);
    return {
      id: t.id,
      type: "table",
      position: { x: layoutNode?.x ?? 0, y: layoutNode?.y ?? 0 },
      data: { label: t.id, columns: t.columns },
    };
  });
}

function methodColor(method: string): string {
  switch (method) {
    case "GET":
      return "text-emerald-400";
    case "POST":
      return "text-sky-400";
    case "PATCH":
      return "text-amber-400";
    case "DELETE":
      return "text-red-400";
    default:
      return "text-neutral-400";
  }
}

export function SchemaVisualizer({ graph }: { graph: SchemaGraph }) {
  const [view, setView] = useState<SchemaView>("rail");
  const [nodes, setNodes] = useState<Node<TableNodeData>[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [layouting, setLayouting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (view === "all" || view === "api") {
      return { tables: graph.tables, edgeList: graph.edges };
    }
    const tableIds = new Set(graph.domains[view]?.tables ?? []);
    const tables = graph.tables.filter((t) => tableIds.has(t.id));
    const edgeList = graph.edges.filter(
      (e) => tableIds.has(e.from) && tableIds.has(e.to),
    );
    return { tables, edgeList };
  }, [graph, view]);

  const selectedTable = useMemo(
    () => graph.tables.find((t) => t.id === selectedId) ?? null,
    [graph.tables, selectedId],
  );

  const outboundEdges = useMemo(
    () => (selectedId ? graph.edges.filter((e) => e.from === selectedId) : []),
    [graph.edges, selectedId],
  );

  useEffect(() => {
    if (view === "api") return;
    let cancelled = false;
    setLayouting(true);
    void layoutTables(filtered.tables, filtered.edgeList).then((layouted) => {
      if (cancelled) return;
      setNodes(layouted);
      setEdges(
        filtered.edgeList.map((e) => ({
          id: e.id,
          source: e.from,
          target: e.to,
          label: e.label,
          type: "smoothstep",
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          style: { stroke: "#525252", strokeWidth: 1.5 },
          labelStyle: { fill: "#a3a3a3", fontSize: 10, fontFamily: "monospace" },
        })),
      );
      setLayouting(false);
    });
    return () => {
      cancelled = true;
    };
  }, [filtered, view]);

  const onSelectionChange = useCallback(
    ({ nodes: selected }: { nodes: Node[] }) => {
      setSelectedId(selected[0]?.id ?? null);
    },
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Schema</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Database tables, foreign keys, and API surface — generated from Drizzle
            and OpenAPI.
          </p>
          <p className="text-xs text-neutral-600 mt-1">
            Updated {new Date(graph.generatedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-neutral-900 border border-neutral-800">
          {VIEW_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setView(tab.id);
                setSelectedId(null);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                view === tab.id
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-400 hover:text-neutral-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {view === "api" ? (
        <div className="grid lg:grid-cols-2 gap-4">
          {graph.api.tags.map((tag) => (
            <div
              key={tag.name}
              className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-800/40">
                <h2 className="font-medium text-neutral-100">{tag.name}</h2>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {tag.endpoints.length} endpoint
                  {tag.endpoints.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="divide-y divide-neutral-800 max-h-80 overflow-y-auto">
                {tag.endpoints.map((ep) => (
                  <li key={`${ep.method}-${ep.path}`} className="px-4 py-2.5">
                    <div className="flex items-start gap-2 font-mono text-xs">
                      <span
                        className={`shrink-0 w-14 font-semibold ${methodColor(ep.method)}`}
                      >
                        {ep.method}
                      </span>
                      <span className="text-neutral-300 break-all">{ep.path}</span>
                    </div>
                    {ep.summary && (
                      <p className="text-xs text-neutral-500 mt-1 pl-16">{ep.summary}</p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-4 h-[calc(100vh-12rem)] min-h-[480px]">
          <div className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 overflow-hidden relative">
            {layouting && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-neutral-950/60 text-sm text-neutral-400">
                Laying out…
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onSelectionChange={onSelectionChange}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
            >
              <Background gap={20} size={1} color="#262626" />
              <Controls className="!bg-neutral-900 !border-neutral-700 !shadow-lg [&>button]:!bg-neutral-800 [&>button]:!border-neutral-700 [&>button]:!text-neutral-300" />
              <MiniMap
                nodeColor="#404040"
                maskColor="rgb(10 10 10 / 0.75)"
                className="!bg-neutral-900 !border-neutral-700"
              />
            </ReactFlow>
          </div>

          <aside className="w-72 shrink-0 rounded-xl border border-neutral-800 bg-neutral-900 p-4 overflow-y-auto hidden lg:block">
            {selectedTable ? (
              <div className="space-y-4">
                <div>
                  <h2 className="font-mono text-sm font-medium text-neutral-100">
                    {selectedTable.id}
                  </h2>
                  <p className="text-xs text-neutral-500 mt-1">
                    Drizzle: {selectedTable.varName}
                  </p>
                </div>
                <div>
                  <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                    Columns
                  </h3>
                  <ul className="space-y-1.5">
                    {selectedTable.columns.map((col) => (
                      <li key={col.dbName} className="text-xs font-mono">
                        <span className="text-neutral-200">{col.dbName}</span>
                        <span className="text-neutral-600"> · {col.type}</span>
                        {col.primaryKey && (
                          <span className="text-primary-400"> · PK</span>
                        )}
                        {col.references && (
                          <span className="text-sky-400"> → {col.references}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
                {outboundEdges.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
                      Foreign keys
                    </h3>
                    <ul className="space-y-1 text-xs font-mono text-neutral-400">
                      {outboundEdges.map((e) => (
                        <li key={e.id}>
                          {e.label} → {e.to}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                Click a table to inspect columns and relationships.
              </p>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
