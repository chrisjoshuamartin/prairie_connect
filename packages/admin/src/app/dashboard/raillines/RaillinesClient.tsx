"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { RailLine } from "@/lib/api";
import {
  importRailLineAction,
  deleteRailLineAction,
} from "@/lib/actions/raillines";
import type { ImportRailLineResult } from "@/lib/api";
import { MapPreview } from "@/components/MapPreview";
import { slugify, nameFromFilename, formatKm, formatDate } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const labelClass = "block text-sm font-medium text-neutral-300 mb-1.5";

interface ParsedFile {
  text: string;
  parsed: Record<string, unknown>;
  filename: string;
  lineFeatureCount: number;
}

function countLineFeatures(geojson: Record<string, unknown>): number {
  if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    return geojson.features.filter((f: { geometry?: { type?: string } }) =>
      ["LineString", "MultiLineString"].includes(f?.geometry?.type ?? ""),
    ).length;
  }
  if (geojson.type === "Feature" || geojson.type === "LineString" || geojson.type === "MultiLineString") {
    return 1;
  }
  return 0;
}

export function RaillinesClient({
  initialRaillines,
}: {
  initialRaillines: RailLine[];
}) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(initialRaillines.length === 0);
  const [pending, startTransition] = useTransition();

  const [file, setFile] = useState<ParsedFile | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [operator, setOperator] = useState("");
  const [description, setDescription] = useState("");
  const [buildGraph, setBuildGraph] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(150);

  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportRailLineResult | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function resetForm() {
    setFile(null);
    setName("");
    setSlug("");
    setSlugEdited(false);
    setOperator("");
    setDescription("");
    setBuildGraph(true);
    setSnapTolerance(150);
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    setResult(null);
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError(`${f.name} is not valid JSON`);
      setFile(null);
      return;
    }
    const lineFeatureCount = countLineFeatures(parsed);
    if (lineFeatureCount === 0) {
      setError(`${f.name} contains no LineString / MultiLineString geometry`);
      setFile(null);
      return;
    }
    setFile({ text, parsed, filename: f.name, lineFeatureCount });
    if (!name) {
      const derived = nameFromFilename(f.name);
      setName(derived);
      if (!slugEdited) setSlug(slugify(derived));
    }
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function handleImport() {
    if (!file || !name.trim()) return;
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importRailLineAction({
        name: name.trim(),
        slug: slug.trim() || undefined,
        operator: operator.trim() || undefined,
        description: description.trim() || undefined,
        geojson: file.text,
        sourceName: file.filename,
        buildGraph,
        snapToleranceM: snapTolerance,
      });
      if (res.ok) {
        setResult(res.data);
        resetForm();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete(line: RailLine) {
    if (
      !confirm(
        `Delete "${line.name}" and its ${line.edgeCount} routing edges? Corridors built on it keep their geometry.`,
      )
    ) {
      return;
    }
    setError(null);
    setDeletingId(line.id);
    startTransition(async () => {
      const res = await deleteRailLineAction(line.id);
      setDeletingId(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Rail lines</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Imported rail route geometry — the source for corridors and the
            routing network.
          </p>
        </div>
        <button
          onClick={() => setShowImport((s) => !s)}
          className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium text-neutral-950 transition-colors"
        >
          {showImport ? "Close" : "Import GeoJSON"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="p-3 rounded-lg bg-primary-950 border border-primary-800 text-primary-200 text-sm">
          Imported <span className="font-medium">{result.slug}</span>:{" "}
          {result.segmentCount} segments, {result.edgesCreated} edges,{" "}
          {result.nodesCreated} new nodes ({result.nodesReused} reused),{" "}
          {formatKm(result.totalLengthKm)} total.
        </div>
      )}

      {showImport && (
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 space-y-5">
          <h2 className="font-medium text-neutral-100">Import a rail line</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="geojson-file" className={labelClass}>
                  GeoJSON file
                </label>
                <input
                  id="geojson-file"
                  type="file"
                  accept=".geojson,.json,application/geo+json,application/json"
                  onChange={handleFile}
                  className="block w-full text-sm text-neutral-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-neutral-800 file:text-neutral-200 file:text-sm file:font-medium hover:file:bg-neutral-700 file:transition-colors file:cursor-pointer"
                />
                {file && (
                  <p className="mt-1.5 text-xs text-neutral-500">
                    {file.filename} — {file.lineFeatureCount} line feature
                    {file.lineFeatureCount === 1 ? "" : "s"}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="rl-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="rl-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={inputClass}
                  placeholder="Great Western Railway"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rl-slug" className={labelClass}>
                    Slug
                  </label>
                  <input
                    id="rl-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    className={inputClass}
                    placeholder="great-western-railway"
                  />
                </div>
                <div>
                  <label htmlFor="rl-operator" className={labelClass}>
                    Operator
                  </label>
                  <input
                    id="rl-operator"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className={inputClass}
                    placeholder="GWR"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="rl-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="rl-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={buildGraph}
                    onChange={(e) => setBuildGraph(e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-800 text-primary-500 focus:ring-primary-500"
                  />
                  Build routing graph
                </label>
                {buildGraph && (
                  <label className="flex items-center gap-2 text-sm text-neutral-400">
                    Snap tolerance
                    <input
                      type="number"
                      min={0}
                      max={5000}
                      value={snapTolerance}
                      onChange={(e) => setSnapTolerance(Number(e.target.value))}
                      className={`${inputClass} w-24`}
                    />
                    m
                  </label>
                )}
              </div>

              <button
                onClick={handleImport}
                disabled={pending || !file || !name.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm font-medium text-neutral-950 transition-colors"
              >
                {pending ? "Importing…" : "Import rail line"}
              </button>
            </div>

            <div>
              <p className={labelClass}>Preview</p>
              <MapPreview geojson={file?.parsed ?? null} className="w-full h-80 rounded-xl overflow-hidden border border-neutral-800" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Operator</th>
              <th className="px-4 py-3 font-medium text-right">Edges</th>
              <th className="px-4 py-3 font-medium text-right">Length</th>
              <th className="px-4 py-3 font-medium">Imported</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {initialRaillines.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No rail lines yet — import a GeoJSON file to get started.
                </td>
              </tr>
            )}
            {initialRaillines.map((line) => (
              <tr key={line.id} className="hover:bg-neutral-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-100">{line.name}</div>
                  <div className="text-xs text-neutral-500">{line.slug}</div>
                </td>
                <td className="px-4 py-3 text-neutral-300">{line.operator ?? "—"}</td>
                <td className="px-4 py-3 text-right text-neutral-300">{line.edgeCount}</td>
                <td className="px-4 py-3 text-right text-neutral-300">
                  {formatKm(line.totalLengthKm)}
                </td>
                <td className="px-4 py-3 text-neutral-400">{formatDate(line.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleDelete(line)}
                    disabled={pending && deletingId === line.id}
                    className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    {pending && deletingId === line.id ? "Deleting…" : "Delete"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
