"use client";

import { useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { ImportRailLineResult, RailLine } from "@/lib/api";
import {
  importRailLineAction,
  deleteRailLineAction,
  getRailLineLogoUploadUrlAction,
  setRailLineLogoAction,
  deleteRailLineLogoAction,
} from "@/lib/actions/raillines";
import { MapPreview } from "@/components/MapPreview";
import { parseGeoJsonInput, type ParsedGeoJson } from "@/lib/geojson";
import { RailLineEditor } from "./RailLineEditor";
import { slugify, nameFromFilename, formatKm, formatDate } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const labelClass = "block text-sm font-medium text-neutral-300 mb-1.5";

type InputMode = "file" | "paste";

export function RaillinesClient({
  initialRaillines,
}: {
  initialRaillines: RailLine[];
}) {
  const router = useRouter();
  const [showImport, setShowImport] = useState(initialRaillines.length === 0);
  const [pending, startTransition] = useTransition();

  const [inputMode, setInputMode] = useState<InputMode>("file");
  const [pasteText, setPasteText] = useState("");
  const [source, setSource] = useState<ParsedGeoJson | null>(null);
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
  const [uploadingLogoId, setUploadingLogoId] = useState<string | null>(null);
  const [editingLine, setEditingLine] = useState<RailLine | null>(null);

  const ALLOWED_LOGO_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/svg+xml",
  ]);

  function resetForm() {
    setSource(null);
    setPasteText("");
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
    const result = parseGeoJsonInput(text, f.name);
    if (!result.ok) {
      setError(`${f.name}: ${result.error}`);
      setSource(null);
      return;
    }
    setSource(result.data);
    if (!name) {
      const derived = nameFromFilename(f.name);
      setName(derived);
      if (!slugEdited) setSlug(slugify(derived));
    }
  }

  function handlePasteChange(text: string) {
    setPasteText(text);
    setError(null);
    setResult(null);
    if (!text.trim()) {
      setSource(null);
      return;
    }
    const result = parseGeoJsonInput(text, "pasted.geojson");
    if (!result.ok) {
      setSource(null);
      return;
    }
    setSource(result.data);
  }

  function switchInputMode(mode: InputMode) {
    setInputMode(mode);
    setError(null);
    setSource(null);
    setPasteText("");
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function handleImport() {
    if (!source || !name.trim()) return;
    if (inputMode === "paste") {
      const result = parseGeoJsonInput(pasteText, "pasted.geojson");
      if (!result.ok) {
        setError(result.error);
        return;
      }
    }
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await importRailLineAction({
        name: name.trim(),
        slug: slug.trim() || undefined,
        operator: operator.trim() || undefined,
        description: description.trim() || undefined,
        geojson: source.text,
        sourceName: source.sourceName,
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

  async function handleLogoUpload(line: RailLine, file: File) {
    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setError("Logo must be PNG, JPEG, WebP, or SVG");
      return;
    }
    setError(null);
    setUploadingLogoId(line.id);
    try {
      const urlRes = await getRailLineLogoUploadUrlAction(
        line.id,
        file.name,
        file.type,
      );
      if (!urlRes.ok) {
        setError(urlRes.error);
        return;
      }
      const putRes = await fetch(urlRes.data.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) {
        setError(`Upload to storage failed (${putRes.status})`);
        return;
      }
      const attachRes = await setRailLineLogoAction(line.id, urlRes.data.key);
      if (!attachRes.ok) setError(attachRes.error);
      else router.refresh();
    } finally {
      setUploadingLogoId(null);
    }
  }

  function handleLogoRemove(line: RailLine) {
    if (!confirm(`Remove the logo for "${line.name}"?`)) return;
    setError(null);
    setUploadingLogoId(line.id);
    startTransition(async () => {
      const res = await deleteRailLineLogoAction(line.id);
      setUploadingLogoId(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
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
                <span className={labelClass}>GeoJSON source</span>
                <div className="flex gap-1 p-1 rounded-lg bg-neutral-800/60 border border-neutral-800 mb-3">
                  <button
                    type="button"
                    onClick={() => switchInputMode("file")}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      inputMode === "file"
                        ? "bg-neutral-700 text-neutral-100"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => switchInputMode("paste")}
                    className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      inputMode === "paste"
                        ? "bg-neutral-700 text-neutral-100"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Paste text
                  </button>
                </div>
                {inputMode === "file" ? (
                  <>
                    <input
                      id="geojson-file"
                      type="file"
                      accept=".geojson,.json,application/geo+json,application/json"
                      onChange={handleFile}
                      className="block w-full text-sm text-neutral-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-neutral-800 file:text-neutral-200 file:text-sm file:font-medium hover:file:bg-neutral-700 file:transition-colors file:cursor-pointer"
                    />
                    {source && inputMode === "file" && (
                      <p className="mt-1.5 text-xs text-neutral-500">
                        {source.sourceName} — {source.lineFeatureCount} line feature
                        {source.lineFeatureCount === 1 ? "" : "s"}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <textarea
                      id="geojson-paste"
                      value={pasteText}
                      onChange={(e) => handlePasteChange(e.target.value)}
                      rows={8}
                      spellCheck={false}
                      className={`${inputClass} font-mono text-xs leading-relaxed`}
                      placeholder={'{\n  "type": "FeatureCollection",\n  "features": [...]\n}'}
                    />
                    {pasteText.trim() && !source && (
                      <p className="mt-1.5 text-xs text-amber-400/90">
                        Invalid JSON or no line geometry yet
                      </p>
                    )}
                    {source && inputMode === "paste" && (
                      <p className="mt-1.5 text-xs text-neutral-500">
                        {source.lineFeatureCount} line feature
                        {source.lineFeatureCount === 1 ? "" : "s"} ready to import
                      </p>
                    )}
                  </>
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
                disabled={pending || !source || !name.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm font-medium text-neutral-950 transition-colors"
              >
                {pending ? "Importing…" : "Import rail line"}
              </button>
            </div>

            <div>
              <p className={labelClass}>Preview</p>
              <MapPreview geojson={source?.parsed ?? null} className="w-full h-80 rounded-xl overflow-hidden border border-neutral-800" />
            </div>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 rounded-xl border border-neutral-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-neutral-500 border-b border-neutral-800">
              <th className="px-4 py-3 font-medium w-16">Logo</th>
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
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No rail lines yet — import GeoJSON to get started.
                </td>
              </tr>
            )}
            {initialRaillines.map((line) => (
              <tr key={line.id} className="hover:bg-neutral-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <label className="relative block w-10 h-10 rounded-lg border border-neutral-700 bg-neutral-800 overflow-hidden cursor-pointer hover:border-neutral-600 transition-colors">
                      {line.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={line.logoUrl}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="flex items-center justify-center w-full h-full text-neutral-600 text-xs">
                          +
                        </span>
                      )}
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="sr-only"
                        disabled={pending && uploadingLogoId === line.id}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleLogoUpload(line, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {line.logoUrl && (
                      <button
                        type="button"
                        onClick={() => handleLogoRemove(line)}
                        disabled={pending && uploadingLogoId === line.id}
                        className="text-[10px] text-neutral-500 hover:text-red-400 disabled:opacity-50"
                      >
                        {uploadingLogoId === line.id ? "…" : "Remove"}
                      </button>
                    )}
                  </div>
                </td>
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
                <td className="px-4 py-3 text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => setEditingLine(line)}
                    className="text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
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

      {editingLine && (
        <RailLineEditor line={editingLine} onClose={() => setEditingLine(null)} />
      )}
    </div>
  );
}
