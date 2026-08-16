"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface LocationRow {
  id: string;
  name: string;
  tan_number: string;
  active: boolean;
}

type Phase =
  | { type: "pin_entry" }
  | { type: "pin_locked"; secsLeft: number }
  | { type: "select" }
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

function DriverForm() {
  const searchParams = useSearchParams();
  const dealer = searchParams.get("dealer") ?? "";

  const [phase, setPhase] = useState<Phase>({ type: "pin_entry" });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const [chassisList, setChassisList] = useState<string[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

  const [selectedChassis, setSelectedChassis] = useState("");
  const [selectedLocationId, setSelectedLocationId] = useState("");

  const [banner, setBanner] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Lockout countdown
  useEffect(() => {
    if (phase.type !== "pin_locked") return;
    if (phase.secsLeft <= 0) { setPhase({ type: "pin_entry" }); return; }
    const t = setTimeout(() =>
      setPhase((p) => p.type === "pin_locked" ? { ...p, secsLeft: p.secsLeft - 1 } : p),
      1000
    );
    return () => clearTimeout(t);
  }, [phase]);

  const loadData = useCallback(async () => {
    setDataLoading(true);
    try {
      const [truckRes, locRes] = await Promise.all([
        fetch("/api/trucks/list", { cache: "no-store" }),
        fetch("/api/manager/locations", { cache: "no-store" }),
      ]);
      if (truckRes.ok) {
        const d = await truckRes.json();
        setChassisList(d.chassis ?? []);
      }
      if (locRes.ok) {
        const d: LocationRow[] = await locRes.json();
        setLocations(d.filter((l) => l.active));
      }
    } finally {
      setDataLoading(false);
    }
  }, []);

  // Skip PIN if valid session cookie already exists
  useEffect(() => {
    if (!dealer) return;
    const tok = decodeDriverToken();
    if (tok && tok.exp * 1000 > Date.now()) {
      loadData();
      setPhase({ type: "select" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealer]);

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
        setPhase({ type: "pin_locked", secsLeft: data.secsLeft ?? 300 });
        setPin("");
        return;
      }
      if (!res.ok) {
        setPinError("Incorrect PIN. Please try again.");
        setPin("");
        return;
      }
      await loadData();
      setPhase({ type: "select" });
    } catch {
      setPinError("Something went wrong. Check your connection.");
    } finally {
      setPinLoading(false);
    }
  }

  async function handleSubmit() {
    if (!selectedChassis || !selectedLocationId) return;
    setPhase({ type: "submitting" });
    try {
      const res = await fetch("/api/location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chassisNumber: selectedChassis,
          locationId: selectedLocationId,
          method: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPhase({ type: "select" });
        setBanner({ type: "error", message: data.error ?? "Failed to log location." });
        return;
      }
      setPhase({ type: "logged", locationName: data.locationName, tanNumber: data.tanNumber });
    } catch {
      setPhase({ type: "select" });
      setBanner({ type: "error", message: "Network error. Check your connection." });
    }
  }

  // ── Invalid link ────────────────────────────────────────────────────────

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

  // ── PIN entry ───────────────────────────────────────────────────────────

  if (phase.type === "pin_entry" || phase.type === "pin_locked") {
    return (
      <Card>
        <h1 className="text-3xl font-bold text-center text-gray-900 tracking-tight mb-6">
          TruckTrace
        </h1>
        {phase.type === "pin_locked" ? (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center">
            Too many incorrect attempts. Try again in{" "}
            <span className="font-semibold">{phase.secsLeft}s</span>.
          </p>
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
                className="w-full rounded-lg border border-gray-300 px-4 py-4 text-4xl text-center tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••"
                autoFocus
              />
              {pinError && <p className="mt-2 text-sm text-red-600">{pinError}</p>}
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

  // ── Truck + location select ─────────────────────────────────────────────

  if (phase.type === "select") {
    const canSubmit = !!selectedChassis && !!selectedLocationId && !dataLoading;
    return (
      <Card>
        <h1 className="text-3xl font-bold text-center text-gray-900 tracking-tight mb-6">
          TruckTrace
        </h1>

        {banner && (
          <button
            onClick={() => setBanner(null)}
            className="w-full text-left mb-4 rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700"
          >
            {banner.message}
          </button>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="chassis" className="block text-sm font-medium text-gray-700 mb-1">
              Chassis
            </label>
            <select
              id="chassis"
              value={selectedChassis}
              onChange={(e) => setSelectedChassis(e.target.value)}
              disabled={dataLoading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{dataLoading ? "Loading…" : "— select chassis —"}</option>
              {chassisList.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Location
            </label>
            <select
              id="location"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              disabled={dataLoading}
              className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{dataLoading ? "Loading…" : "— select location —"}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-4 rounded-2xl shadow-sm transition-colors active:scale-95"
          >
            Log Location
          </button>
        </div>
      </Card>
    );
  }

  // ── Submitting ──────────────────────────────────────────────────────────

  if (phase.type === "submitting") {
    return (
      <Card>
        <div className="text-center py-4 text-gray-500">Logging location…</div>
      </Card>
    );
  }

  // ── Logged ──────────────────────────────────────────────────────────────

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
            setSelectedLocationId("");
            setPhase({ type: "select" });
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

export default function DriverPage() {
  return (
    <Suspense>
      <DriverForm />
    </Suspense>
  );
}
