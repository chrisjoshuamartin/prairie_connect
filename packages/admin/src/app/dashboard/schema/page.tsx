import graph from "@/data/schema-graph.json";
import type { SchemaGraph } from "@/lib/schema-graph";
import { SchemaVisualizer } from "./SchemaVisualizer";

export default function SchemaPage() {
  return (
    <div className="relative left-1/2 -translate-x-1/2 w-[min(100vw-3rem,1400px)] max-w-none">
      <SchemaVisualizer graph={graph as SchemaGraph} />
    </div>
  );
}
