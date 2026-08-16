"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPreciseLocation } from "@/lib/geolocation";

interface NearestResult {
  location_id: string;
  name: string;
  tan_number: string;
  distance_meters: number;
  warn: boolean;
}

interface LocationRow {
  id: string;
  name: string;
  tan_number: string;
}

type Phase =
  | { type: "pin_entry" }
  | { type: "pin_locked"; until: string; secsLeft: number }
  | { type: "truck_select" }
  | { type: "acquiring_gps"; chassis: string }
  | { type: "confirm_auto"; chassis: string; nearest: NearestResult }
  | { type: "confirm_warn"; chassis: string; nearest: NearestResult }
  | { type: "manual_select"; chassis: string; nearest: NearestResult | null }
  | { type: "submitting" }
  | { type: "logged"; locationName: string; tanNumber: string };

function decodeDriverToken(): { managerId: string; exp: number } | null {
  try {
    const match = document.cookie.match(/trucktrace_driver_token=([^;]+)/);
    if (!match) return null;
    const payload = JSON.parse(atob(match[1].split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (!payload.managerId || !payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

function DriverForm() {
  const searchParams = useSearchParams();
  const dealer = searchParams.get("dealer") ?? "";

  const [phase, setPhase] = useState<Phase>({ type: "pin_entry" });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [chassisList, setChassisList] = useState<string[]>([]);
  const [chassisLoading, setChassisLoading] = useState(false);
  const [selectedChassis, setSelectedChassis] = useState("");

  const [allLocations, setAllLocations] = useState<LocationRow[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ type: "success" | "error" | "warning"; message: string } | null>(null);

  // Lockout countdown
  useEffect(() => {
    if (phase.type !== "pin_locked") return;
    if (phase.secsLeft <= 0) {
      setPhase({ type: "pin_entry" });
      return;
    }
    const t = setTimeout(() => {
      setPhase((p) =>
        p.type === "pin_locked" ? { ...p, secsLeft: p.secsLeft - 1 } : p
      );
    }, 1000);
    return () => clearTimeout(t);
  }, [phase]);

  // On mount: if valid dealer session already exists, skip PIN entry
  useEffect(() => {
    if (!dealer) return;
    const tok = decodeDriverToken();
    if (tok && tok.exp * 1000 > Date.now()) {
      loadChassis();
      setPhase({ type: "truck_select" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer]);

  const loadChassis = useCallback(async () => {
    setChassisLoading(true);
    try {
      const res = await fetch("/api/trucks/list", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setChassisList(data.chassis ?? []);
    } catch {
      setBanner({ type: "error", message: "Could not load truck list. Refresh to try again." });
    } finally {
      setChassisLoading(false);
    }
  }, []);

  const loadLocations = useCallback(async () => {
    try {
      const res = await fetch("/api/manager/locations", { cache: "no-store" });
      if (!res.ok) return;
      const data: LocationRow[] = await res.json();
      setAllLocations(data.filter((l) => (l as unknown as { active: boolean }).active));
    } catch { /* best effort */ }
  }, []);

  async function handlePinSubmit() {
    if (pin.length !== 4) return;
    setPinLoading(true);
    setPinError("");
    try {
      const res = await fetch("/api/driver/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealer, pin }),
      });
      const data = await res.json();
      if (res.status === 429) {
        setPhase({ type: "pin_locked", until: data.lockedUntilIso, secsLeft: data.secsLeft ?? 300 });
        setPin("");
        return;
      }
      if (!res.ok) {
        setPinError("Incorrect PIN. Please try again.");
        setPin("");
        return;
      }
      await loadChassis();
      setPhase({ type: "truck_select" });
    } catch {
      setPinError("Something went wrong. Check your connection.");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleLogLocation(chassis: string) {
    setBanner(null);
    setGpsAccuracy(null);
    setPhase({ type: "acquiring_gps", chassis });

    try {
      const { coords, timedOut } = await getPreciseLocation((acc) => setGpsAccuracy(acc));

      if (timedOut && coords.accuracy > 200) {
        // Poor signal — go straight to manual
        await loadLocations();
        setPhase({ type: "manual_select", chassis, nearest: null });
        setBanner({ type: "warning", message: `Poor GPS signal (${Math.round(coords.accuracy)} m). Pick location manually.` });
        return;
      }

      // Call nearest endpoint
      const res = await fetch("/api/locations/nearest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: coords.latitude, lng: coords.longitude }),
      });

      if (!res.ok) {
        await loadLocations();
        setPhase({ type: "manual_select", chassis, nearest: null });
        setBanner({ type: "warning", message: "Could not resolve nearest location. Pick manually." });
        return;
      }

      const nearest: NearestResult = await res.json();

      if (nearest.warn) {
        setPhase({ type: "confirm_warn", chassis, nearest });
      } else {
        setPhase({ type: "confirm_auto", chassis, nearest });
      }
    } catch (err) {
      const code = (err as GeolocationPositionError).code;
      const msgs: Record<number, string> = {
        1: "Location permission denied. Enable it in your browser settings.",
        2: "Location unavailable. Move outdoors and try again.",
        3: "GPS timed out. Move to an open area and try again.",
      };
      await loadLocations();
      setPhase({ type: "manual_select", chassis, nearest: null });
      setBanner({ type: "warning", message: msgs[code] ?? "Could not get GPS. Pick location manually." });
    }
  }

  async function submitLog(chassis: string, locationId: string, method: "auto" | "manual", distanceMeters?: number) {
    setPhase({ type: "submitting" });
    try {
      const res = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chassisNumber: chassis,
          locationId,
          method,
          distanceMeters: distanceMeters ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ type: "truck_select" });
        setBanner({ type: "error", message: data.error ?? "Failed to log location." });
        return;
      }
      setPhase({ type: "logged", locationName: data.locationName, tanNumber: data.tanNumber });
    } catch {
      setPhase({ type: "truck_select" });
      setBanner({ type: "error", message: "Network error. Check your connection." });
    }
  }

  async function handleManualSubmit(chassis: string) {
    if (!selectedLocationId) return;
    await submitLog(chassis, selectedLocationId, "manual");
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!dealer) {
    return (
      <Card>
        <div className="text-4xl mb-4 text-red-500 text-center">!</div>
        <h1 className="text-lg font-bold text-gray-900 mb-2 text-center">Invalid driver link</h1>
        <p className="text-sm text-gray-500 text-center">
          Please contact your fleet manager for the correct link.
        </p>
      </Card>
    );
  }

  if (phase.type === "pin_entry" || phase.type === "pin_locked") {
    return (
      <Card>
        <h1 className="text-3xl font-bold text-center text-gray-900 tracking-tight mb-6">
          TruckTrace
        </h1>
        {phase.type === "pin_locked" ? (
          <div className="text-center space-y-3">
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              Too many incorrect attempts. Try again in{" "}
              <span className="font-semibold">{phase.secsLeft}s</span>.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-1">
                PIN
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
                onKeyDown={(e) => e.key === "Enter" && handlePinSubmit()}
                className="w-full rounded-lg border border-gray-300 px-4 py-4 text-4xl text-center tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="••••"
                autoFocus
              />
              {pinError && (
                <p className="mt-2 text-sm text-red-600">{pinError}</p>
              )}
            </div>
            <button
              onClick={handlePinSubmit}
              disabled={pin.length !== 4 || pinLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 rounded-2xl transition-colors"
            >
              {pinLoading ? "Verifying…" : "Enter"}
            </button>
          </div>
        )}
      </Card>
    );
  }

  if (phase.type === "truck_select") {
    return (
      <Card>
        <h1 className="text-3xl font-bold text-center text-gray-900 tracking-tight mb-6">
          TruckTrace
        </h1>

        {banner && <BannerEl banner={banner} onDismiss={() => setBanner(null)} />}

        <div className="space-y-4">
          <div>
            <label htmlFor="chassis" className="block text-sm font-medium text-gray-700 mb-1">
              Chassis
            </label>
            <select
              id="chassis"
              value={selectedChassis}
              onChange={(e) => setSelectedChassis(e.target.value)}
              disabled={chassisLoading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">
                {chassisLoading ? "Loading…" : "— select chassis —"}
              </option>
              {chassisList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <button
            onClick={() => selectedChassis && handleLogLocation(selectedChassis)}
            disabled={!selectedChassis || chassisLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 rounded-2xl shadow-sm transition-colors active:scale-95"
          >
            Log Location
          </button>
        </div>
      </Card>
    );
  }

  if (phase.type === "acquiring_gps") {
    return (
      <Card>
        <div className="text-center space-y-4 py-4">
          <div className="text-4xl animate-pulse">📍</div>
          <p className="text-gray-700 font-medium">Acquiring GPS fix…</p>
          {gpsAccuracy !== null && (
            <p className="text-sm text-gray-400">Accuracy: {Math.round(gpsAccuracy)} m</p>
          )}
          <p className="text-xs text-gray-400">Chassis: {phase.chassis}</p>
        </div>
      </Card>
    );
  }

  if (phase.type === "confirm_auto") {
    const { chassis, nearest } = phase;
    return (
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Confirm Location</h2>
        <p className="text-xs text-gray-400 mb-4">Chassis: {chassis}</p>
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-4 mb-4 space-y-1">
          <p className="text-base font-semibold text-blue-900">{nearest.name}</p>
          <p className="text-sm text-blue-700">TAN: {nearest.tan_number}</p>
          <p className="text-xs text-blue-500">{formatDist(nearest.distance_meters)} away</p>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => submitLog(chassis, nearest.location_id, "auto", nearest.distance_meters)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Confirm
          </button>
          <button
            onClick={async () => { await loadLocations(); setPhase({ type: "manual_select", chassis, nearest }); }}
            className="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Pick Manually
          </button>
        </div>
      </Card>
    );
  }

  if (phase.type === "confirm_warn") {
    const { chassis, nearest } = phase;
    return (
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Location Warning</h2>
        <p className="text-xs text-gray-400 mb-4">Chassis: {chassis}</p>
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-sm text-amber-800">
          You appear to be{" "}
          <span className="font-semibold">{formatDist(nearest.distance_meters)}</span> from the
          nearest known location. Confirm the correct location or pick manually.
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-4 space-y-1">
          <p className="text-sm font-semibold text-gray-900">Nearest: {nearest.name}</p>
          <p className="text-xs text-gray-500">TAN: {nearest.tan_number}</p>
        </div>
        <div className="space-y-2">
          <button
            onClick={() => submitLog(chassis, nearest.location_id, "auto", nearest.distance_meters)}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Confirm Anyway
          </button>
          <button
            onClick={async () => { await loadLocations(); setPhase({ type: "manual_select", chassis, nearest }); }}
            className="w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
          >
            Pick Manually
          </button>
        </div>
      </Card>
    );
  }

  if (phase.type === "manual_select") {
    const { chassis } = phase;
    return (
      <Card>
        <h2 className="text-lg font-bold text-gray-900 mb-1">Select Location</h2>
        <p className="text-xs text-gray-400 mb-4">Chassis: {chassis}</p>
        {banner && <div className="mb-3"><BannerEl banner={banner} onDismiss={() => setBanner(null)} /></div>}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— select location —</option>
              {allLocations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setBanner(null); setPhase({ type: "truck_select" }); }}
              className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => handleManualSubmit(chassis)}
              disabled={!selectedLocationId}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      </Card>
    );
  }

  if (phase.type === "submitting") {
    return (
      <Card>
        <div className="text-center py-4 text-gray-500">Logging location…</div>
      </Card>
    );
  }

  if (phase.type === "logged") {
    return (
      <div className="fixed inset-0 bg-green-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="text-6xl mb-4">✓</div>
        <h1 className="text-2xl font-bold text-green-800 mb-1">Logged</h1>
        <p className="text-green-700 font-medium mb-1">{phase.locationName}</p>
        <p className="text-sm text-green-600">TAN: {phase.tanNumber}</p>
        <button
          onClick={() => {
            setBanner(null);
            setSelectedChassis("");
            setPhase({ type: "truck_select" });
          }}
          className="mt-8 bg-green-700 hover:bg-green-800 text-white font-semibold px-8 py-3 rounded-xl transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  return null;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8">
        {children}
      </div>
    </main>
  );
}

function BannerEl({
  banner,
  onDismiss,
}: {
  banner: { type: "success" | "error" | "warning"; message: string };
  onDismiss: () => void;
}) {
  return (
    <button
      onClick={onDismiss}
      className={`w-full text-left rounded-xl px-4 py-3 text-sm mb-4 ${
        banner.type === "success"
          ? "bg-green-50 border border-green-200 text-green-800"
          : banner.type === "warning"
          ? "bg-amber-50 border border-amber-200 text-amber-800"
          : "bg-red-50 border border-red-200 text-red-700"
      }`}
    >
      {banner.message}
    </button>
  );
}

export default function DriverPage() {
  return (
    <Suspense>
      <DriverForm />
    </Suspense>
  );
}
