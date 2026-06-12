"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  LISTING_TYPES,
  SECTORS,
  type Listing,
  type ListingType,
  type Sector,
} from "@/lib/api";
import {
  archiveSiteAction,
  createSiteAction,
  updateSiteAction,
} from "@/lib/actions/sites";
import { MapPreview, type MapMarker } from "@/components/MapPreview";
import { formatDate } from "@/lib/utils";

const inputClass =
  "w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-colors";

const labelClass = "block text-sm font-medium text-neutral-300 mb-1.5";

const TYPE_COLORS: Record<string, string> = {
  transload: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  port: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  terminal: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  elevator: "bg-lime-500/15 text-lime-300 border-lime-500/30",
  producer: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  other: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
};

function TypeBadge({ type }: { type: string }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md border text-xs font-medium ${TYPE_COLORS[type] ?? TYPE_COLORS.other}`}
    >
      {type}
    </span>
  );
}

interface FormState {
  name: string;
  description: string;
  listingType: ListingType;
  sector: Sector;
  city: string;
  province: string;
  lat: number | null;
  lng: number | null;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  listingType: "transload",
  sector: "logistics",
  city: "",
  province: "",
  lat: null,
  lng: null,
};

export function SitesClient({ initialSites }: { initialSites: Listing[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(initialSites.length === 0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const markers = useMemo<MapMarker[]>(() => {
    const placed: MapMarker[] = initialSites
      .filter((s) => s.lat != null && s.lng != null && s.id !== editingId)
      .map((s) => ({
        lng: s.lng!,
        lat: s.lat!,
        color: "#737373",
        label: `${s.name} (${s.listingType})`,
      }));
    if (form.lat != null && form.lng != null) {
      placed.push({ lng: form.lng, lat: form.lat, color: "#e0a82e", label: "New location" });
    }
    return placed;
  }, [initialSites, form.lat, form.lng, editingId]);

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  function startEdit(site: Listing) {
    setEditingId(site.id);
    setForm({
      name: site.name,
      description: site.description ?? "",
      listingType: site.listingType,
      sector: site.sector,
      city: site.city ?? "",
      province: site.province ?? "",
      lat: site.lat,
      lng: site.lng,
    });
    setShowForm(true);
    setError(null);
    setNotice(null);
  }

  function handleSave() {
    if (!form.name.trim()) return;
    setError(null);
    setNotice(null);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      listingType: form.listingType,
      sector: form.sector,
      city: form.city.trim() || undefined,
      province: form.province.trim() || undefined,
      ...(form.lat != null && form.lng != null
        ? { lat: form.lat, lng: form.lng }
        : {}),
    };
    startTransition(async () => {
      const res = editingId
        ? await updateSiteAction(editingId, payload)
        : await createSiteAction(payload);
      if (res.ok) {
        setNotice(
          editingId
            ? `Updated "${res.data.name}".`
            : `Created "${res.data.name}" — published and ready for the route planner.`,
        );
        setForm(EMPTY_FORM);
        setEditingId(null);
        setShowForm(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleArchive(site: Listing) {
    if (!confirm(`Archive "${site.name}"? It disappears from the directory and the route planner.`)) {
      return;
    }
    setError(null);
    setArchivingId(site.id);
    startTransition(async () => {
      const res = await archiveSiteAction(site.id);
      setArchivingId(null);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Sites</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Typed directory locations — transloads, terminals, ports — used by
            the multimodal route planner.
          </p>
        </div>
        <button
          onClick={() => (showForm ? setShowForm(false) : startCreate())}
          className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 text-sm font-medium text-neutral-950 transition-colors"
        >
          {showForm ? "Close" : "Add site"}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}
      {notice && (
        <div className="p-3 rounded-lg bg-primary-950 border border-primary-800 text-primary-200 text-sm">
          {notice}
        </div>
      )}

      {showForm && (
        <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 space-y-5">
          <h2 className="font-medium text-neutral-100">
            {editingId ? "Edit site" : "Add a site"}
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label htmlFor="site-name" className={labelClass}>
                  Name
                </label>
                <input
                  id="site-name"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputClass}
                  placeholder="Saskatoon North Transload"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="site-type" className={labelClass}>
                    Site type
                  </label>
                  <select
                    id="site-type"
                    value={form.listingType}
                    onChange={(e) => set("listingType", e.target.value as ListingType)}
                    className={inputClass}
                  >
                    {LISTING_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="site-sector" className={labelClass}>
                    Sector
                  </label>
                  <select
                    id="site-sector"
                    value={form.sector}
                    onChange={(e) => set("sector", e.target.value as Sector)}
                    className={inputClass}
                  >
                    {SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="site-city" className={labelClass}>
                    City
                  </label>
                  <input
                    id="site-city"
                    value={form.city}
                    onChange={(e) => set("city", e.target.value)}
                    className={inputClass}
                    placeholder="Saskatoon"
                  />
                </div>
                <div>
                  <label htmlFor="site-province" className={labelClass}>
                    Province
                  </label>
                  <input
                    id="site-province"
                    value={form.province}
                    onChange={(e) => set("province", e.target.value)}
                    className={inputClass}
                    placeholder="SK"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="site-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="site-description"
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  rows={2}
                  className={inputClass}
                />
              </div>

              <div className="text-sm text-neutral-400">
                Location:{" "}
                {form.lat != null && form.lng != null ? (
                  <span className="text-neutral-200">
                    {form.lat.toFixed(5)}, {form.lng.toFixed(5)}
                  </span>
                ) : (
                  <span className="text-amber-400/90">
                    click the map to place the site
                  </span>
                )}
                {form.lat != null && (
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, lat: null, lng: null }))}
                    className="ml-3 text-xs text-neutral-500 hover:text-red-400"
                  >
                    Clear
                  </button>
                )}
              </div>

              <button
                onClick={handleSave}
                disabled={pending || !form.name.trim()}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm font-medium text-neutral-950 transition-colors"
              >
                {pending ? "Saving…" : editingId ? "Save changes" : "Create site"}
              </button>
            </div>

            <div>
              <p className={labelClass}>Click to place</p>
              <MapPreview
                geojson={null}
                markers={markers}
                fitToData={false}
                onMapClick={({ lat, lng }) => {
                  set("lat", lat);
                  set("lng", lng);
                }}
                className="w-full h-96 rounded-xl overflow-hidden border border-neutral-800"
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
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Sector</th>
              <th className="px-4 py-3 font-medium">Location</th>
              <th className="px-4 py-3 font-medium">Coordinates</th>
              <th className="px-4 py-3 font-medium">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {initialSites.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  No published sites yet — add one, or run{" "}
                  <code className="text-neutral-400">npm run seed:sites:dev</code>.
                </td>
              </tr>
            )}
            {initialSites.map((site) => (
              <tr key={site.id} className="hover:bg-neutral-800/40 transition-colors">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-100">{site.name}</div>
                  <div className="text-xs text-neutral-500">{site.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <TypeBadge type={site.listingType} />
                </td>
                <td className="px-4 py-3 text-neutral-300">{site.sector}</td>
                <td className="px-4 py-3 text-neutral-300">
                  {[site.city, site.province].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-3 text-neutral-400 text-xs">
                  {site.lat != null && site.lng != null
                    ? `${site.lat.toFixed(4)}, ${site.lng.toFixed(4)}`
                    : "—"}
                </td>
                <td className="px-4 py-3 text-neutral-400">{formatDate(site.createdAt)}</td>
                <td className="px-4 py-3 text-right space-x-3">
                  <button
                    type="button"
                    onClick={() => startEdit(site)}
                    className="text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleArchive(site)}
                    disabled={pending && archivingId === site.id}
                    className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
                  >
                    {pending && archivingId === site.id ? "Archiving…" : "Archive"}
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
