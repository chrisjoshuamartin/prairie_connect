"use client";

import { useMemo, useState, useTransition } from "react";
import type { Listing, PlanRouteResult } from "@/lib/api";
import { planRouteAction } from "@/lib/actions/routeplanner";
import { formatKm } from "@/lib/utils";
import { RoutePlannerMap, type PlannerPin } from "./RoutePlannerMap";

type Point = { lat: number; lng: number };

function fmt(p: Point): string {
  return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
}

const LEG_BADGES: Record<"truck" | "rail", { label: string; className: string }> = {
  truck: {
    label: "Truck",
    className: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  rail: {
    label: "Rail",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
};

export function RoutePlannerClient({ sites }: { sites: Listing[] }) {
  const [pending, startTransition] = useTransition();
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [plan, setPlan] = useState<PlanRouteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const railServedCount = useMemo(
    () =>
      sites.filter(
        (s) =>
          s.lat != null &&
          ["transload", "terminal", "port"].includes(s.listingType),
      ).length,
    [sites],
  );

  function handleMapClick(pos: Point) {
    setError(null);
    if (!origin) {
      setOrigin(pos);
    } else if (!destination) {
      setDestination(pos);
    } else {
      // Both already set — start a fresh plan from this click.
      setOrigin(pos);
      setDestination(null);
      setPlan(null);
    }
  }

  function handleClear() {
    setOrigin(null);
    setDestination(null);
    setPlan(null);
    setError(null);
  }

  function handleSwap() {
    if (!origin || !destination) return;
    setOrigin(destination);
    setDestination(origin);
    setPlan(null);
  }

  function handlePlan() {
    if (!origin || !destination) return;
    setError(null);
    startTransition(async () => {
      const res = await planRouteAction({
        origin: { ...origin, label: "Origin" },
        destination: { ...destination, label: "Destination" },
      });
      if (res.ok) {
        setPlan(res.data);
      } else {
        setPlan(null);
        setError(res.error);
      }
    });
  }

  const pins = useMemo<PlannerPin[]>(() => {
    const activeSiteIds = new Set(
      plan ? [plan.originSite.id, plan.destinationSite.id] : [],
    );
    const out: PlannerPin[] = sites
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({
        lng: s.lng!,
        lat: s.lat!,
        kind: activeSiteIds.has(s.id) ? ("site-active" as const) : ("site" as const),
        label: `${s.name} (${s.listingType})`,
      }));
    if (origin) out.push({ ...origin, kind: "origin", label: "Origin (A)" });
    if (destination) out.push({ ...destination, kind: "destination", label: "Destination (B)" });
    return out;
  }, [sites, origin, destination, plan]);

  const railOperators = useMemo(() => {
    const rail = plan?.legs.find((l) => l.mode === "rail");
    if (!rail?.railDetail) return [];
    return [
      ...new Set(
        rail.railDetail.segments
          .map((s) => s.operator)
          .filter((o): o is string => Boolean(o)),
      ),
    ];
  }, [plan]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-100">Route planner</h1>
          <p className="text-sm text-neutral-400 mt-1">
            Prototype of the multimodal flow: truck to the nearest transload,
            rail across the network, truck (or port) at the far end. Click the
            map to set origin and destination.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSwap}
            disabled={!origin || !destination}
            className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-sm font-medium text-neutral-200 transition-colors"
          >
            Swap A/B
          </button>
          <button
            onClick={handleClear}
            disabled={!origin && !destination}
            className="px-3 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 text-sm font-medium text-neutral-200 transition-colors"
          >
            Clear
          </button>
          <button
            onClick={handlePlan}
            disabled={pending || !origin || !destination}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-sm font-medium text-neutral-950 transition-colors"
          >
            {pending ? "Planning…" : "Plan route"}
          </button>
        </div>
      </div>

      {railServedCount < 2 && (
        <div className="p-3 rounded-lg bg-amber-950 border border-amber-800 text-amber-300 text-sm">
          The planner needs at least two located transload / terminal / port
          sites — add them on the Sites page or run{" "}
          <code>npm run seed:sites:dev</code>. The rail network itself comes
          from <code>npm run tracks:import:dev</code>.
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <RoutePlannerMap
            geojson={plan?.geometry ?? null}
            pins={pins}
            onMapClick={handleMapClick}
          />
          <div className="flex items-center gap-5 mt-2 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-400" /> Origin
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-400" /> Destination
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 border-t-2 border-dashed border-sky-400" /> Truck leg
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-6 border-t-2 border-amber-400" /> Rail leg
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" /> Site in use
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 space-y-2 text-sm">
            <h2 className="font-medium text-neutral-100">Endpoints</h2>
            <p className="text-neutral-400">
              A — Origin:{" "}
              <span className="text-neutral-200">
                {origin ? fmt(origin) : "click the map"}
              </span>
            </p>
            <p className="text-neutral-400">
              B — Destination:{" "}
              <span className="text-neutral-200">
                {destination ? fmt(destination) : origin ? "click again" : "—"}
              </span>
            </p>
          </div>

          {plan && (
            <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 space-y-4">
              <div>
                <h2 className="font-medium text-neutral-100">Plan</h2>
                <p className="text-sm text-neutral-400 mt-1">
                  {formatKm(plan.totalDistanceKm)} total —{" "}
                  {formatKm(plan.truckDistanceKm)} truck,{" "}
                  {formatKm(plan.railDistanceKm)} rail
                  {railOperators.length > 0 && (
                    <> via {railOperators.join(", ")}</>
                  )}
                </p>
              </div>

              <ol className="space-y-3">
                {plan.legs.map((leg) => {
                  const badge = LEG_BADGES[leg.mode];
                  return (
                    <li key={leg.seq} className="flex gap-3">
                      <span
                        className={`shrink-0 self-start mt-0.5 px-2 py-0.5 rounded-md border text-xs font-medium ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <div className="text-sm min-w-0">
                        <p className="text-neutral-200">
                          {leg.from.label}{" "}
                          <span className="text-neutral-500">→</span>{" "}
                          {leg.to.label}
                        </p>
                        <p className="text-xs text-neutral-500 mt-0.5">
                          {formatKm(leg.distanceKm)}
                          {leg.mode === "truck" && " (straight-line est.)"}
                          {leg.railDetail &&
                            ` · ${leg.railDetail.segments.length} segments`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>

              <div className="pt-3 border-t border-neutral-800 text-xs text-neutral-500 space-y-1">
                <p>
                  Load on at{" "}
                  <span className="text-neutral-300">{plan.originSite.name}</span>{" "}
                  ({plan.originSite.listingType})
                </p>
                <p>
                  Load off at{" "}
                  <span className="text-neutral-300">{plan.destinationSite.name}</span>{" "}
                  ({plan.destinationSite.listingType})
                </p>
              </div>
            </div>
          )}

          {!plan && (
            <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-4 text-sm text-neutral-500">
              Set both endpoints and hit{" "}
              <span className="text-neutral-300">Plan route</span>. The planner
              picks the nearest rail-served site to each end, routes the rail
              leg with pgRouting, and estimates the truck drayage legs.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
