"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Corridor, RailLine } from "@/lib/api";
import {
  createCorridorAction,
  deleteCorridorAction,
} from "@/lib/actions/corridors";
import { getRailLineDetailAction } from "@/lib/actions/raillines";
import { CorridorEditor } from "./CorridorEditor";
import { MapPreview } from "@/components/MapPreview";
import { slugify, formatDate } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const labelClass = "block text-sm font-medium text-neutral-300 mb-1.5";

export function CorridorsClient({
  initialCorridors,
  raillines,
}: {
  initialCorridors: Corridor[];
  raillines: RailLine[];
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(initialCorridors.length === 0);
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [operator, setOperator] = useState("");
  const [description, setDescription] = useState("");
  const [railLineId, setRailLineId] = useState("");
  const [previewGeometry, setPreviewGeometry] = useState<Record<string, unknown> | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Corridor | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingCorridor, setEditingCorridor] = useState<Corridor | null>(null);

  const railLineById = new Map(raillines.map((l) => [l.id, l]));

  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function handleRailLineChange(id: string) {
    setRailLineId(id);
    setPreviewGeometry(null);
    if (!id) return;

    const line = railLineById.get(id);
    if (line) {
      if (!slugEdited) {
        setName(line.name);
        setSlug(`${line.slug}-corridor`);
      } else if (!name) {
        setName(line.name);
      }
      if (!operator && line.operator) setOperator(line.operator);
    }
    setPreviewLoading(true);
    startTransition(async () => {
      const res = await getRailLineDetailAction(id);
      setPreviewLoading(false);
      if (res.ok) setPreviewGeometry(res.data.geometry);
      else setError(res.error);
    });
  }

  function handleCreate() {
    if (!name.trim()) return;
    setError(null);
    setCreated(null);
    startTransition(async () => {
      const res = await createCorridorAction({
        name: name.trim(),
        slug: slug.trim() || undefined,
        operator: operator.trim() || undefined,
        description: description.trim() || undefined,
        railLineId: railLineId || undefined,
      });
      if (res.ok) {
        setCreated(res.data);
        setName("");
        setSlug("");
        setSlugEdited(false);
        setOperator("");
        setDescription("");
        setRailLineId("");
        setPreviewGeometry(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleDelete(corridor: Corridor) {
    if (!confirm(`Delete corridor "${corridor.name}"?`)) return;
    setError(null);
    setDeletingId(corridor.id);
    startTransition(async () => {
      const res = await deleteCorridorAction(corridor.id);
      setDeletingId(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Corridors</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Corridors are built around an imported rail line — its geometry and
            routing graph carry the corridor.
          </p>
        </div>
        <button
          onClick={() => setShowAdd((s) => !s)}
          className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium text-neutral-950 transition-colors"
        >
          {showAdd ? "Close" : "Add corridor"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      {created && (
        <div className="p-3 rounded-lg bg-primary-950 border border-primary-800 text-primary-200 text-sm">
          Created corridor <span className="font-medium">{created.slug}</span>.
        </div>
      )}

      {showAdd && (
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 space-y-5">
          <h2 className="font-medium text-neutral-100">Add a corridor</h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="c-railline" className={labelClass}>
                  Rail line
                </label>
                <select
                  id="c-railline"
                  value={railLineId}
                  onChange={(e) => handleRailLineChange(e.target.value)}
                  className={inputClass}
                >
                  <option value="">None (geometry added later)</option>
                  {raillines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name}
                      {line.operator ? ` — ${line.operator}` : ""}
                    </option>
                  ))}
                </select>
                {raillines.length === 0 && (
                  <p className="mt-1.5 text-xs text-neutral-500">
                    No rail lines imported yet —{" "}
                    <Link
                      href="/dashboard/raillines"
                      className="text-primary-400 hover:text-primary-300"
                    >
                      import one first
                    </Link>{" "}
                    to build the corridor around it.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="c-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="c-name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className={inputClass}
                  placeholder="Great Western corridor"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="c-slug" className={labelClass}>
                    Slug
                  </label>
                  <input
                    id="c-slug"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugEdited(true);
                    }}
                    className={inputClass}
                    placeholder="great-western"
                  />
                </div>
                <div>
                  <label htmlFor="c-operator" className={labelClass}>
                    Operator
                  </label>
                  <input
                    id="c-operator"
                    value={operator}
                    onChange={(e) => setOperator(e.target.value)}
                    className={inputClass}
                    placeholder="Defaults to the rail line's"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="c-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="c-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>

              <button
                onClick={handleCreate}
                disabled={pending || !name.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm font-medium text-neutral-950 transition-colors"
              >
                {pending ? "Working…" : "Create corridor"}
              </button>
            </div>

            <div>
              <p className={labelClass}>
                Route preview{previewLoading ? " (loading…)" : ""}
              </p>
              <MapPreview
                geojson={previewGeometry}
                className="w-full h-80 rounded-xl overflow-hidden border border-neutral-800"
              />
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
              <th className="px-4 py-3 font-medium">Rail line</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {initialCorridors.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  No corridors yet — add one to get started.
                </td>
              </tr>
            )}
            {initialCorridors.map((corridor) => {
              const line = corridor.railLineId
                ? railLineById.get(corridor.railLineId)
                : null;
              return (
                <tr key={corridor.id} className="hover:bg-neutral-800/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-neutral-100">{corridor.name}</div>
                    <div className="text-xs text-neutral-500">{corridor.slug}</div>
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {corridor.operator ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">
                    {line ? line.name : corridor.railLineId ? "(deleted)" : "—"}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">
                    {formatDate(corridor.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right space-x-3">
                    <button
                      type="button"
                      onClick={() => setEditingCorridor(corridor)}
                      className="text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(corridor)}
                      disabled={pending && deletingId === corridor.id}
                      className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                    >
                      {pending && deletingId === corridor.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingCorridor && (
        <CorridorEditor
          corridor={editingCorridor}
          raillines={raillines}
          onClose={() => setEditingCorridor(null)}
        />
      )}
    </div>
  );
}
