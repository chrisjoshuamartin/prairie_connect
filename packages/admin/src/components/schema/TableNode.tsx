"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { SchemaColumn } from "@/lib/schema-graph";

export interface TableNodeData {
  label: string;
  columns: SchemaColumn[];
  [key: string]: unknown;
}

function columnClass(col: SchemaColumn): string {
  if (col.primaryKey) return "text-primary-400";
  if (col.references) return "text-sky-400";
  return "text-neutral-400";
}

export const TableNode = memo(function TableNode({
  data,
  selected,
}: NodeProps & { data: TableNodeData }) {
  const shown = data.columns.slice(0, 14);
  const hidden = data.columns.length - shown.length;

  return (
    <div
      className={`min-w-[220px] max-w-[260px] rounded-lg border bg-neutral-900 shadow-lg transition-colors ${
        selected
          ? "border-primary-500 ring-1 ring-primary-500/40"
          : "border-neutral-700"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !bg-neutral-500 !border-neutral-600"
      />
      <div className="px-3 py-2 border-b border-neutral-800 bg-neutral-800/80 rounded-t-lg">
        <p className="font-mono text-sm font-medium text-neutral-100">{data.label}</p>
      </div>
      <ul className="px-3 py-2 space-y-0.5">
        {shown.map((col) => (
          <li
            key={col.dbName}
            className="flex items-baseline justify-between gap-2 text-[11px] font-mono leading-relaxed"
          >
            <span className={`truncate ${columnClass(col)}`}>
              {col.dbName}
              {col.unique ? " ◆" : ""}
            </span>
            <span className="text-neutral-600 shrink-0">{col.type}</span>
          </li>
        ))}
        {hidden > 0 && (
          <li className="text-[10px] text-neutral-600 pt-1">+{hidden} more</li>
        )}
      </ul>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-neutral-500 !border-neutral-600"
      />
    </div>
  );
});
