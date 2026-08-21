"use client";

import { useState, useEffect, useCallback, FormEvent, useRef } from "react";
import { useRouter } from "next/navigation";

interface TruckRow {
  truck_id: string;
  chassis_number: string;
  status: string;
  location_name: string | null;
  tan_number: string | null;
  location_logged_at: string | null;
  location_method: "auto" | "manual" | null;
}

interface LocationRow {
  id: string;
  name: string;
  tan_number: string;
  active: boolean;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeader() {
  return { Authorization: `Bearer ${getCookie("trucktrace_token")}` };
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsvHeaders(raw: string): { headers: string[]; rows: string[][] } {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parse = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') { inQ = !inQ; continue; }
      if (c === "," && !inQ) { result.push(cur); cur = ""; continue; }
      cur += c;
    }
    result.push(cur);
    return result;
  };
  const headers = parse(lines[0]);
  const rows = lines.slice(1).map(parse);
  return { headers, rows };
}

// ── Main component ───────────────────────────────────────────────────────────

export default function ManagerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"master" | "locations">("master");
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Master tab
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(true);
  const [trucksError, setTrucksError] = useState("");

  // CSV import
  const [importPhase, setImportPhase] = useState<"idle" | "mapping" | "importing">("idle");
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<string[][]>([]);
  const [chassisColIdx, setChassisColIdx] = useState(0);
  const [importResult, setImportResult] = useState<{ inserted: number; skipped: number; invalid: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Locations tab
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState("");
  const [editingLoc, setEditingLoc] = useState<LocationRow | null>(null);
  const [showAddLocForm, setShowAddLocForm] = useState(false);
  const [locForm, setLocForm] = useState({ name: "", tan_number: "" });
  const [locFormLoading, setLocFormLoading] = useState(false);
  const [locFormError, setLocFormError] = useState("");

  // PIN management
  const [pinValue, setPinValue] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [pinResult, setPinResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const token = getCookie("trucktrace_token");
    if (token) {
      const p = decodeJwtPayload(token);
      setCompanyName((p?.companyName as string) ?? "");
      setSlug((p?.slug as string) ?? "");
    }
  }, []);

  const fetchTrucks = useCallback(async () => {
    setTrucksLoading(true);
    setTrucksError("");
    try {
      const res = await fetch("/api/manager/trucks", { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setTrucksError(data.error ?? "Failed to load trucks"); return; }
      setTrucks(data);
    } catch { setTrucksError("Failed to load trucks"); }
    finally { setTrucksLoading(false); }
  }, []);

  const fetchLocations = useCallback(async () => {
    setLocationsLoading(true);
    setLocationsError("");
    try {
      const res = await fetch("/api/manager/locations", { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) { setLocationsError(data.error ?? "Failed to load locations"); return; }
      setLocations(data);
    } catch { setLocationsError("Failed to load locations"); }
    finally { setLocationsLoading(false); }
  }, []);

  useEffect(() => { fetchTrucks(); }, [fetchTrucks]);
  useEffect(() => { if (activeTab === "locations") fetchLocations(); }, [activeTab, fetchLocations]);

  function handleLogOut() {
    document.cookie = "trucktrace_token=; path=/; max-age=0";
    router.push("/manager");
  }

  // ── CSV import ──────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const { headers, rows } = parseCsvHeaders(text);
      setCsvHeaders(headers);
      setCsvRows(rows);
      // Auto-detect: pick the first column whose header contains "chassis" (case-insensitive)
      const autoIdx = headers.findIndex((h) => /chassis/i.test(h));
      setChassisColIdx(autoIdx >= 0 ? autoIdx : 1); // default to column B (index 1)
      setImportPhase("mapping");
      setImportResult(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function handleImportConfirm() {
    const chassisNumbers = csvRows
      .map((row) => (row[chassisColIdx] ?? "").trim())
      .filter(Boolean);
    if (chassisNumbers.length === 0) return;
    setImportPhase("importing");
    try {
      const res = await fetch("/api/manager/trucks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ chassisNumbers }),
      });
      const data = await res.json();
      setImportPhase("idle");
      if (res.ok) {
        setImportResult(data);
        fetchTrucks();
      } else {
        setTrucksError(data.error ?? "Import failed.");
      }
    } catch {
      setImportPhase("idle");
      setTrucksError("Import failed. Please try again.");
    }
    setCsvHeaders([]);
    setCsvRows([]);
  }

  // ── Locations CRUD ──────────────────────────────────────────────────────

  async function handleLocFormSubmit(e: FormEvent) {
    e.preventDefault();
    setLocFormError("");
    setLocFormLoading(true);
    try {
      if (editingLoc) {
        const res = await fetch(`/api/manager/locations/${editingLoc.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ name: locForm.name, tan_number: locForm.tan_number }),
        });
        if (!res.ok) { const d = await res.json(); setLocFormError(d.error ?? "Failed"); return; }
      } else {
        const res = await fetch("/api/manager/locations", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader() },
          body: JSON.stringify({ name: locForm.name, tan_number: locForm.tan_number }),
        });
        if (!res.ok) { const d = await res.json(); setLocFormError(d.error ?? "Failed"); return; }
      }
      setEditingLoc(null);
      setShowAddLocForm(false);
      setLocForm({ name: "", tan_number: "" });
      fetchLocations();
    } catch { setLocFormError("Something went wrong."); }
    finally { setLocFormLoading(false); }
  }

  async function handleToggleActive(loc: LocationRow) {
    await fetch(`/api/manager/locations/${loc.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ active: !loc.active }),
    });
    fetchLocations();
  }

  async function handleMasterExport() {
    const res = await fetch("/api/manager/export/master", { headers: authHeader() });
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trucktrace-master-export-${new Date().toISOString().substring(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  async function handleSetPin(e: FormEvent) {
    e.preventDefault();
    setPinResult(null);
    setPinLoading(true);
    try {
      const res = await fetch("/api/manager/settings/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json();
      if (!res.ok) { setPinResult({ ok: false, msg: data.error ?? "Failed" }); return; }
      setPinResult({ ok: true, msg: "Driver PIN updated." });
      setPinValue("");
    } catch { setPinResult({ ok: false, msg: "Something went wrong." }); }
    finally { setPinLoading(false); }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">TruckTrace</h1>
          <p className="text-xs text-gray-400">{companyName || "Fleet Manager Dashboard"}</p>
          {slug && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 truncate">
                Driver link:{" "}
                <span className="font-mono text-blue-600">
                  https://truck-trace.vercel.app/driver?dealer={slug}
                </span>
              </span>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(`https://truck-trace.vercel.app/driver?dealer=${slug}`)
                    .then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); })
                    .catch(() => {});
                }}
                className="shrink-0 text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded px-1.5 py-0.5 transition-colors"
              >
                {linkCopied ? "Copied!" : "Copy"}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={handleLogOut}
          className="shrink-0 text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Log Out
        </button>
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex -mb-px">
          {(["master", "locations"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 capitalize transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab === "master" ? "Master" : "Locations"}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Master tab ───────────────────────────────────────────────────── */}
      {activeTab === "master" && (
        <div className="px-6 py-4 pb-10">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={fetchTrucks}
              disabled={trucksLoading}
              className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {trucksLoading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Import CSV
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
            <button
              onClick={handleMasterExport}
              className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Export CSV
            </button>
          </div>

          {/* CSV column-mapping UI */}
          {importPhase === "mapping" && csvHeaders.length > 0 && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-blue-900">
                Which column contains chassis numbers?
              </p>
              <div className="flex flex-wrap gap-2">
                {csvHeaders.map((h, i) => (
                  <button
                    key={i}
                    onClick={() => setChassisColIdx(i)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      chassisColIdx === i
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {h || `Column ${i + 1}`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-blue-700">
                Preview: {csvRows.slice(0, 3).map((r) => r[chassisColIdx] ?? "—").join(", ")}
                {csvRows.length > 3 ? ` … (${csvRows.length} total)` : ""}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => { setImportPhase("idle"); setCsvHeaders([]); setCsvRows([]); }}
                  className="text-sm border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportConfirm}
                  className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg"
                >
                  Import {csvRows.length} rows
                </button>
              </div>
            </div>
          )}

          {importPhase === "importing" && (
            <p className="mb-4 text-sm text-gray-500">Importing…</p>
          )}

          {importResult && (
            <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 space-y-1">
              <p>Inserted: {importResult.inserted} &nbsp;·&nbsp; Already existed: {importResult.skipped}</p>
              {(importResult.invalid?.length ?? 0) > 0 && (
                <p className="text-amber-700">
                  Skipped (not 7-digit): {importResult.invalid.join(", ")}
                </p>
              )}
              <button
                onClick={() => setImportResult(null)}
                className="text-xs text-green-600 underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {trucksError && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {trucksError}
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Chassis</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Location</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">TAN</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Last Logged</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 whitespace-nowrap">Method</th>
                </tr>
              </thead>
              <tbody>
                {trucksLoading && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
                )}
                {!trucksLoading && trucks.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-10 text-center text-gray-400">No trucks found. Import a CSV to get started.</td></tr>
                )}
                {!trucksLoading && trucks.map((truck) => (
                  <tr key={truck.truck_id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-gray-900">{truck.chassis_number}</td>
                    <td className="px-4 py-3 text-gray-700">{truck.location_name ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-700 font-mono">{truck.tan_number ?? "—"}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(truck.location_logged_at)}</td>
                    <td className="px-4 py-3">
                      {truck.location_method ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          truck.location_method === "auto"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {truck.location_method}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Locations tab ────────────────────────────────────────────────── */}
      {activeTab === "locations" && (
        <div className="px-6 py-4 pb-10 space-y-6">
          {/* Locations list */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Locations</h2>
              <button
                onClick={() => {
                  setEditingLoc(null);
                  setLocForm({ name: "", tan_number: "" });
                  setLocFormError("");
                  setShowAddLocForm(true);
                }}
                className="text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
              >
                Add Location
              </button>
            </div>

            {locationsError && (
              <p className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                {locationsError}
              </p>
            )}

            {/* Add / Edit form */}
            {(showAddLocForm || editingLoc) && (
              <form
                onSubmit={handleLocFormSubmit}
                className="mb-4 bg-white border border-gray-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="text-sm font-semibold text-gray-900">
                  {editingLoc ? `Edit: ${editingLoc.name}` : "Add New Location"}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                    <input
                      type="text"
                      required
                      value={locForm.name}
                      onChange={(e) => setLocForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g. Yard A"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">TAN Number</label>
                    <input
                      type="text"
                      required
                      value={locForm.tan_number}
                      onChange={(e) => setLocForm((f) => ({ ...f, tan_number: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="TAN-001"
                    />
                  </div>
                </div>
                {locFormError && (
                  <p className="text-xs text-red-600">{locFormError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowAddLocForm(false); setEditingLoc(null); setLocFormError(""); }}
                    className="flex-1 border border-gray-300 text-gray-700 text-sm font-medium py-2 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={locFormLoading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-semibold py-2 rounded-lg"
                  >
                    {locFormLoading ? "Saving…" : (editingLoc ? "Save Changes" : "Add Location")}
                  </button>
                </div>
              </form>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">TAN</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                    <th className="px-4 py-3 font-semibold text-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {locationsLoading && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">Loading…</td></tr>
                  )}
                  {!locationsLoading && locations.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-gray-400">No locations yet. Add one to get started.</td></tr>
                  )}
                  {!locationsLoading && locations.map((loc) => (
                    <tr
                      key={loc.id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${!loc.active ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 font-medium text-gray-900">{loc.name}</td>
                      <td className="px-4 py-3 font-mono text-gray-700">{loc.tan_number}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          loc.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                        }`}>
                          {loc.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => {
                              setEditingLoc(loc);
                              setShowAddLocForm(false);
                              setLocForm({
                                name: loc.name,
                                tan_number: loc.tan_number,
                              });
                              setLocFormError("");
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleToggleActive(loc)}
                            className="text-xs text-gray-500 hover:text-gray-700 font-medium"
                          >
                            {loc.active ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PIN management */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-1">Driver PIN</h2>
            <p className="text-xs text-gray-500 mb-4">
              Set the 4-digit PIN drivers use to access the check-in page. After 5 wrong attempts the PIN locks for 5 minutes.
            </p>
            <form onSubmit={handleSetPin} className="flex items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinValue}
                  onChange={(e) => { setPinValue(e.target.value.replace(/\D/g, "")); setPinResult(null); }}
                  className="w-28 rounded-lg border border-gray-300 px-3 py-2 text-xl text-center tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="••••"
                />
              </div>
              <button
                type="submit"
                disabled={pinValue.length !== 4 || pinLoading}
                className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold px-4 py-2 rounded-lg transition-colors"
              >
                {pinLoading ? "Saving…" : "Set PIN"}
              </button>
            </form>
            {pinResult && (
              <p className={`mt-2 text-sm ${pinResult.ok ? "text-green-700" : "text-red-600"}`}>
                {pinResult.msg}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
