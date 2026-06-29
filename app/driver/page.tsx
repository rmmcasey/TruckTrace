"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { getPreciseLocation } from "@/lib/geolocation";

type ChassisStatus = "loading" | "ready" | "error" | "invalid";
type Banner = { type: "success" | "error" | "warning"; message: string } | null;
type LocPhase = "acquiring" | "submitting" | null;

const GEO_ERRORS: Record<number, string> = {
  1: "Location permission denied. Please enable it in your browser settings.",
  2: "Location unavailable. Move outdoors and try again.",
  3: "GPS timed out. Move to an open area and try again.",
};

function DriverForm() {
  const searchParams = useSearchParams();
  const dealer = searchParams.get("dealer");

  const [pin, setPin] = useState("");
  const [chassisStatus, setChassisStatus] = useState<ChassisStatus>(dealer ? "loading" : "invalid");
  const [chassisList, setChassisList] = useState<string[]>([]);
  const [selectedChassis, setSelectedChassis] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [journeyDone, setJourneyDone] = useState(false);
  const [locPhase, setLocPhase] = useState<LocPhase>(null);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [poorSignalCoords, setPoorSignalCoords] = useState<GeolocationCoordinates | null>(null);
  const [completeLoading, setCompleteLoading] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    if (!dealer) return;
    fetch(`/api/trucks/list?dealer=${encodeURIComponent(dealer)}`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { chassis: string[] }) => {
        setChassisList(data.chassis ?? []);
        setChassisStatus("ready");
      })
      .catch(() => setChassisStatus("error"));
  }, [dealer]);

  // Auto-dismiss success banners after 4 s
  useEffect(() => {
    if (banner?.type !== "success") return;
    const t = setTimeout(() => setBanner(null), 4000);
    return () => clearTimeout(t);
  }, [banner]);

  const canSubmit =
    pin.length === 4 && selectedChassis !== "" && chassisStatus === "ready";
  const locBusy = locPhase !== null;

  async function submitLocation(coords: GeolocationCoordinates) {
    setGpsAccuracy(null);
    setLocPhase("submitting");
    const { latitude, longitude, accuracy } = coords;
    try {
      const res = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, chassisNumber: selectedChassis, latitude, longitude, accuracy }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setBanner({ type: "error", message: "Invalid PIN. Please try again." });
      } else if (!res.ok) {
        setBanner({ type: "error", message: data.error ?? "Failed to log location." });
      } else {
        setBanner({ type: "success", message: `Location logged: ${data.address}` });
      }
    } catch {
      setBanner({ type: "error", message: "Failed to send location. Check your connection." });
    } finally {
      setLocPhase(null);
    }
  }

  async function handleLogLocation() {
    setBanner(null);
    setGpsAccuracy(null);
    setPoorSignalCoords(null);
    setLocPhase("acquiring");

    try {
      const { coords, timedOut } = await getPreciseLocation((acc) => setGpsAccuracy(acc));

      if (timedOut && coords.accuracy > 200) {
        setPoorSignalCoords(coords);
        setLocPhase(null);
        return;
      }

      if (timedOut) {
        setBanner({
          type: "warning",
          message: `Low accuracy fix used (${Math.round(coords.accuracy)}m) — consider moving outdoors.`,
        });
      }

      await submitLocation(coords);
    } catch (err) {
      const code = (err as GeolocationPositionError).code;
      setBanner({
        type: "error",
        message: GEO_ERRORS[code] ?? "Could not get location. Try again.",
      });
      setLocPhase(null);
    }
  }

  async function handleSubmitAnyway() {
    if (!poorSignalCoords) return;
    const coords = poorSignalCoords;
    setPoorSignalCoords(null);
    setBanner(null);
    await submitLocation(coords);
  }

  function handleTryAgain() {
    setPoorSignalCoords(null);
    setBanner(null);
  }

  async function handleConfirmComplete() {
    setBanner(null);
    setCompleteLoading(true);
    try {
      const res = await fetch("/api/journey/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, chassisNumber: selectedChassis }),
      });
      const data = await res.json();
      if (res.status === 401) {
        setConfirming(false);
        setBanner({ type: "error", message: "Invalid PIN. Please try again." });
      } else if (!res.ok) {
        setConfirming(false);
        setBanner({ type: "error", message: data.error ?? "Something went wrong." });
      } else {
        setConfirming(false);
        setJourneyDone(true);
      }
    } catch {
      setConfirming(false);
      setBanner({ type: "error", message: "Something went wrong. Check your connection." });
    } finally {
      setCompleteLoading(false);
    }
  }

  if (chassisStatus === "invalid") {
    return (
      <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8 text-center">
          <div className="text-4xl mb-4 text-red-500">!</div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Invalid driver link</h1>
          <p className="text-sm text-gray-500">
            Please contact your fleet manager for the correct link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-md p-8 space-y-6">
        <h1 className="text-3xl font-bold text-center text-gray-900 tracking-tight">
          TruckTrace
        </h1>

        {/* PIN */}
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
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            className="w-full rounded-lg border border-gray-300 px-4 py-4 text-4xl text-center tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="••••"
          />
        </div>

        {/* Chassis dropdown */}
        <div>
          <label htmlFor="chassis" className="block text-sm font-medium text-gray-700 mb-1">
            Chassis
          </label>
          <select
            id="chassis"
            value={selectedChassis}
            onChange={(e) => setSelectedChassis(e.target.value)}
            disabled={chassisStatus !== "ready"}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-400"
          >
            {chassisStatus === "loading" && <option value="">Loading chassis…</option>}
            {chassisStatus === "error" && (
              <option value="">Could not load chassis list</option>
            )}
            {chassisStatus === "ready" && (
              <>
                <option value="">— select chassis —</option>
                {chassisList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </>
            )}
          </select>
        </div>

        {/* Banner */}
        {banner && (
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              banner.type === "success"
                ? "bg-green-50 border border-green-200 text-green-800"
                : banner.type === "warning"
                ? "bg-amber-50 border border-amber-200 text-amber-800"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}
          >
            {banner.message}
          </div>
        )}

        {/* Action area */}
        {poorSignalCoords ? (
          <div className="space-y-3">
            <p className="text-center text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              Poor GPS signal ({Math.round(poorSignalCoords.accuracy)}m). Submit anyway or try again?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleTryAgain}
                className="flex-1 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium py-3 rounded-xl transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={handleSubmitAnyway}
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Submit Anyway
              </button>
            </div>
          </div>
        ) : !confirming ? (
          <div className="space-y-2">
            <div className="flex gap-3">
              <button
                onClick={handleLogLocation}
                disabled={!canSubmit || locBusy}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 rounded-2xl shadow-sm transition-colors active:scale-95"
              >
                {locPhase === "acquiring"
                  ? "Acquiring GPS fix…"
                  : locPhase === "submitting"
                  ? "Logging…"
                  : "Log Location"}
              </button>
              <button
                onClick={() => setConfirming(true)}
                disabled={!canSubmit || locBusy}
                className="flex-1 border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium py-4 rounded-2xl transition-colors active:scale-95"
              >
                Complete Journey
              </button>
            </div>
            {locPhase === "acquiring" && gpsAccuracy !== null && (
              <p className="text-center text-xs text-gray-400">
                Accuracy: {Math.round(gpsAccuracy)}m
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="text-center text-gray-700 mb-4 font-medium">
              Mark this journey as complete?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(false)}
                disabled={completeLoading}
                className="flex-1 border border-gray-300 text-gray-700 font-medium py-3 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmComplete}
                disabled={completeLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {completeLoading ? "Confirming…" : "Confirm"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Journey complete full-screen overlay */}
      {journeyDone && (
        <div className="fixed inset-0 bg-green-50 flex flex-col items-center justify-center px-6 text-center z-50">
          <div className="text-6xl mb-6">✓</div>
          <h1 className="text-3xl font-bold text-green-800">Journey complete.</h1>
          <button
            onClick={() => {
              setJourneyDone(false);
              setPin("");
            }}
            className="mt-10 bg-green-700 hover:bg-green-800 text-white font-semibold px-8 py-3 rounded-xl transition-colors text-base"
          >
            Done
          </button>
        </div>
      )}
    </main>
  );
}

export default function DriverPage() {
  return (
    <Suspense>
      <DriverForm />
    </Suspense>
  );
}
