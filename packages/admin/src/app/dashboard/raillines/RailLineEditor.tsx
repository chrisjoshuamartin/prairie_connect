"use client";

import { useEffect, useState, useTransition, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import type { RailLine } from "@/lib/api";
import {
  getRailLineDetailAction,
  updateRailLineAction,
} from "@/lib/actions/raillines";
import { MapPreview } from "@/components/MapPreview";
import { parseGeoJsonInput, type ParsedGeoJson } from "@/lib/geojson";
import { slugify } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const labelClass = "block text-sm font-medium text-neutral-300 mb-1.5";

type GeoInputMode = "file" | "paste";

export function RailLineEditor({
  line,
  onClose,
}: {
  line: RailLine;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(line.name);
  const [slug, setSlug] = useState(line.slug);
  const [slugEdited, setSlugEdited] = useState(false);
  const [operator, setOperator] = useState(line.operator ?? "");
  const [description, setDescription] = useState(line.description ?? "");
  const [currentGeometry, setCurrentGeometry] = useState<Record<string, unknown> | null>(
    null,
  );

  const [replaceGeometry, setReplaceGeometry] = useState(false);
  const [geoInputMode, setGeoInputMode] = useState<GeoInputMode>("file");
  const [pasteText, setPasteText] = useState("");
  const [newSource, setNewSource] = useState<ParsedGeoJson | null>(null);
  const [rebuildGraph, setRebuildGraph] = useState(true);
  const [snapTolerance, setSnapTolerance] = useState(150);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getRailLineDetailAction(line.id).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setCurrentGeometry(res.data.geometry);
      setName(res.data.name);
      setSlug(res.data.slug);
      setOperator(res.data.operator ?? "");
      setDescription(res.data.description ?? "");
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [line.id]);

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) return;
    void f.text().then((text) => {
      const result = parseGeoJsonInput(text, f.name);
      if (!result.ok) {
        setError(`${f.name}: ${result.error}`);
        setNewSource(null);
        return;
      }
      setNewSource(result.data);
    });
  }

  function handlePasteChange(text: string) {
    setPasteText(text);
    setError(null);
    if (!text.trim()) {
      setNewSource(null);
      return;
    }
    const result = parseGeoJsonInput(text, "pasted.geojson");
    if (!result.ok) {
      setNewSource(null);
      return;
    }
    setNewSource(result.data);
  }

  function handleSave() {
    if (!name.trim()) return;
    if (replaceGeometry) {
      if (geoInputMode === "paste") {
        const result = parseGeoJsonInput(pasteText, "pasted.geojson");
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      if (!newSource) {
        setError("Provide valid GeoJSON to replace geometry");
        return;
      }
    }

    setError(null);
    startTransition(async () => {
      const res = await updateRailLineAction(line.id, {
        name: name.trim(),
        slug: slug.trim() || undefined,
        operator: operator.trim() || null,
        description: description.trim() || null,
        ...(replaceGeometry && newSource
          ? {
              geojson: newSource.text,
              sourceName: newSource.sourceName,
              rebuildGraph,
              snapToleranceM: snapTolerance,
            }
          : {}),
      });
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

  const previewGeojson =
    replaceGeometry && newSource ? newSource.parsed : currentGeometry;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close editor"
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl h-full bg-neutral-900 border-l border-neutral-800 shadow-xl overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-neutral-800 bg-neutral-900/95 backdrop-blur">
          <h2 className="font-medium text-neutral-100">Edit rail line</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
          >
            Close
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <>
              <div>
                <label htmlFor="edit-rl-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="edit-rl-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slugEdited) setSlug(slugify(e.target.value));
                  }}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-rl-slug" className={labelClass}>
                    Slug
                  </label>
                  <input
                    id="edit-rl-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="edit-rl-operator" className={labelClass}>
                    Operator
                  </label>
                  <input
                    id="edit-rl-operator"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-rl-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="edit-rl-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>

              <div>
                <p className={labelClass}>Current geometry</p>
                <MapPreview
                  geojson={currentGeometry}
                  className="w-full h-48 rounded-xl overflow-hidden border border-neutral-800"
                />
              </div>

              <div className="rounded-xl border border-neutral-800 p-4 space-y-4">
                <label className="flex items-center gap-2 text-sm text-neutral-300">
                  <input
                    type="checkbox"
                    checked={replaceGeometry}
                    onChange={(e) => {
                      setReplaceGeometry(e.target.checked);
                      setNewSource(null);
                      setPasteText("");
                      setError(null);
                    }}
                    className="rounded border-neutral-700 bg-neutral-800 text-primary-500 focus:ring-primary-500"
                  />
                  Replace geometry from GeoJSON
                </label>

                {replaceGeometry && (
                  <div className="space-y-4">
                    <div className="flex gap-1 p-1 rounded-lg bg-neutral-800/60 border border-neutral-800">
                      <button
                        type="button"
                        onClick={() => {
                          setGeoInputMode("file");
                          setNewSource(null);
                          setPasteText("");
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          geoInputMode === "file"
                            ? "bg-neutral-700 text-neutral-100"
                            : "text-neutral-400 hover:text-neutral-200"
                        }`}
                      >
                        Upload file
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setGeoInputMode("paste");
                          setNewSource(null);
                        }}
                        className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                          geoInputMode === "paste"
                            ? "bg-neutral-700 text-neutral-100"
                            : "text-neutral-400 hover:text-neutral-200"
                        }`}
                      >
                        Paste text
                      </button>
                    </div>

                    {geoInputMode === "file" ? (
                      <input
                        type="file"
                        accept=".geojson,.json,application/geo+json,application/json"
                        onChange={handleFile}
                        className="block w-full text-sm text-neutral-400 file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-neutral-800 file:text-neutral-200 file:text-sm file:font-medium hover:file:bg-neutral-700 file:transition-colors file:cursor-pointer"
                      />
                    ) : (
                      <textarea
                        value={pasteText}
                        onChange={(e) => handlePasteChange(e.target.value)}
                        rows={6}
                        spellCheck={false}
                        className={`${inputClass} font-mono text-xs leading-relaxed`}
                        placeholder={'{\n  "type": "FeatureCollection",\n  "features": [...]\n}'}
                      />
                    )}

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 text-sm text-neutral-300">
                        <input
                          type="checkbox"
                          checked={rebuildGraph}
                          onChange={(e) => setRebuildGraph(e.target.checked)}
                          className="rounded border-neutral-700 bg-neutral-800 text-primary-500 focus:ring-primary-500"
                        />
                        Rebuild routing graph
                      </label>
                      {rebuildGraph && (
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

                    {newSource && (
                      <MapPreview
                        geojson={previewGeojson}
                        className="w-full h-48 rounded-xl overflow-hidden border border-neutral-800"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={pending || !name.trim()}
                  className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm font-medium text-neutral-950 transition-colors"
                >
                  {pending ? "Saving…" : "Save changes"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={pending}
                  className="px-4 py-2 rounded-lg border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
