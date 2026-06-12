"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Corridor, RailLine } from "@/lib/api";
import {
  getCorridorDetailAction,
  updateCorridorAction,
} from "@/lib/actions/corridors";
import { getRailLineDetailAction } from "@/lib/actions/raillines";
import { MapPreview } from "@/components/MapPreview";
import { slugify } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const labelClass = "block text-sm font-medium text-neutral-300 mb-1.5";

export function CorridorEditor({
  corridor,
  raillines,
  onClose,
}: {
  corridor: Corridor;
  raillines: RailLine[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(corridor.name);
  const [slug, setSlug] = useState(corridor.slug);
  const [slugEdited, setSlugEdited] = useState(false);
  const [operator, setOperator] = useState(corridor.operator ?? "");
  const [description, setDescription] = useState(corridor.description ?? "");
  const [railLineId, setRailLineId] = useState(corridor.railLineId ?? "");
  const [initialRailLineId, setInitialRailLineId] = useState<string | null>(
    corridor.railLineId ?? null,
  );
  const [geometry, setGeometry] = useState<Record<string, unknown> | null>(null);

  const railLineById = new Map(raillines.map((l) => [l.id, l]));

  async function loadRailLinePreview(
    lineId: string,
    fallbackGeometry: Record<string, unknown> | null,
  ): Promise<void> {
    setPreviewLoading(true);
    const res = await getRailLineDetailAction(lineId);
    setPreviewLoading(false);
    if (res.ok) {
      setGeometry(res.data.geometry);
    } else if (fallbackGeometry) {
      setGeometry(fallbackGeometry);
    } else {
      setGeometry(null);
      setError(res.error);
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      const res = await getCorridorDetailAction(corridor.id);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setLoading(false);
        return;
      }
      setName(res.data.name);
      setSlug(res.data.slug);
      setOperator(res.data.operator ?? "");
      setDescription(res.data.description ?? "");
      const lineId = res.data.railLineId ?? "";
      setRailLineId(lineId);
      setInitialRailLineId(res.data.railLineId ?? null);

      if (lineId) {
        await loadRailLinePreview(lineId, res.data.geometry);
      } else {
        setGeometry(res.data.geometry);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [corridor.id]);

  function handleRailLineChange(id: string) {
    setRailLineId(id);
    if (!id) {
      setGeometry(null);
      return;
    }

    const line = railLineById.get(id);
    if (line && !slugEdited && id !== initialRailLineId) {
      setSlug(`${line.slug}-corridor`);
    }

    void loadRailLinePreview(id, null);
  }

  function handleSave() {
    if (!name.trim()) return;
    setError(null);

    const railLineChanged =
      (railLineId || null) !== (initialRailLineId || null);

    startTransition(async () => {
      const payload: Parameters<typeof updateCorridorAction>[1] = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        operator: operator.trim() || null,
        description: description.trim() || null,
      };
      if (railLineChanged) {
        payload.railLineId = railLineId || null;
      }

      const res = await updateCorridorAction(corridor.id, payload);
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  }

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
          <h2 className="font-medium text-neutral-100">Edit corridor</h2>
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
                <label htmlFor="edit-c-railline" className={labelClass}>
                  Rail line
                </label>
                <select
                  id="edit-c-railline"
                  value={railLineId}
                  onChange={(e) => handleRailLineChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">None (detached)</option>
                  {raillines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name}
                      {line.operator ? ` — ${line.operator}` : ""}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-neutral-500">
                  Changing the rail line re-copies geometry and retags the routing
                  graph.
                </p>
              </div>

              <div>
                <label htmlFor="edit-c-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="edit-c-name"
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
                  <label htmlFor="edit-c-slug" className={labelClass}>
                    Slug
                  </label>
                  <input
                    id="edit-c-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="edit-c-operator" className={labelClass}>
                    Operator
                  </label>
                  <input
                    id="edit-c-operator"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="edit-c-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="edit-c-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>

              <div>
                <p className={labelClass}>
                  Route preview
                  {previewLoading ? " (loading…)" : ""}
                </p>
                <MapPreview
                  geojson={geometry}
                  className="w-full h-48 rounded-xl overflow-hidden border border-neutral-800"
                />
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
