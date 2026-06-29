"use client";

import { useState, useEffect, useCallback, FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface TruckRow {
  truck_id: string;
  chassis_number: string;
  driver_name: string;
  last_known_address: string | null;
  last_updated: string | null;
}

interface DriverRow {
  id: string;
  name: string;
  pin: string;
  created_at: string;
}

interface RecordRow {
  id: string;
  chassis_number: string;
  status: string;
  deleted_at: string | null;
  created_at: string;
  last_driver: string | null;
  last_known_location: string | null;
  last_updated: string | null;
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
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

const recordStatusBadge: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  inactive: "bg-amber-100 text-amber-800",
  deleted: "bg-gray-100 text-gray-500",
};

export default function ManagerDashboardPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"fleet" | "records" | "drivers">("fleet");
  const [companyName, setCompanyName] = useState<string>("");
  const [slug, setSlug] = useState<string>("");
  const [linkCopied, setLinkCopied] = useState(false);

  // Fleet tab
  const [trucks, setTrucks] = useState<TruckRow[]>([]);
  const [trucksLoading, setTrucksLoading] = useState(true);
  const [trucksError, setTrucksError] = useState("");
  // Add Truck modal
  const [showAddTruckModal, setShowAddTruckModal] = useState(false);
  const [addTruckChassis, setAddTruckChassis] = useState("");
  const [addTruckLoading, setAddTruckLoading] = useState(false);
  const [addTruckError, setAddTruckError] = useState("");

  // Records tab
  const [records, setRecords] = useState<RecordRow[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [confirmDeleteRecordId, setConfirmDeleteRecordId] = useState<string | null>(null);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);

  // Drivers tab
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [driversError, setDriversError] = useState("");
  const [showAddDriverForm, setShowAddDriverForm] = useState(false);
  const [addDriverName, setAddDriverName] = useState("");
  const [addDriverLoading, setAddDriverLoading] = useState(false);
  const [addDriverError, setAddDriverError] = useState("");
  const [pinModal, setPinModal] = useState<{ pin: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resetIdConfirmId, setResetIdConfirmId] = useState<string | null>(null);
  const [resettingIdFor, setResettingIdFor] = useState<string | null>(null);
  const [resetIdModal, setResetIdModal] = useState<{ name: string; pin: string } | null>(null);
  const [resetIdError, setResetIdError] = useState<string | null>(null);

  useEffect(() => {
    const token = getCookie("trucktrace_token");
    if (token) {
      const payload = decodeJwtPayload(token);
      setCompanyName((payload?.companyName as string) ?? "");
      setSlug((payload?.slug as string) ?? "");
    }
  }, []);

  const fetchTrucks = useCallback(async () => {
    setTrucksLoading(true);
    setTrucksError("");
    try {
      const res = await fetch("/api/manager/trucks", { headers: authHeader() });
      const text = await res.text();
      if (!res.ok) {
        let detail = text;
        try { detail = JSON.parse(text)?.error ?? text; } catch { /* html error page */ }
        setTrucksError(`Failed to load trucks (${res.status}): ${detail}`);
        return;
      }
      setTrucks(JSON.parse(text));
    } catch (e) {
      setTrucksError(`Failed to load trucks: ${e}`);
    } finally {
      setTrucksLoading(false);
    }
  }, []);

  const fetchRecords = useCallback(async () => {
    setRecordsLoading(true);
    setRecordsError("");
    try {
      const res = await fetch("/api/manager/records", { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) {
        setRecordsError(data.error ?? "Failed to load records.");
        return;
      }
      setRecords(data);
    } catch (e) {
      setRecordsError(`Failed to load records: ${e}`);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  const fetchDrivers = useCallback(async () => {
    setDriversLoading(true);
    setDriversError("");
    try {
      const res = await fetch("/api/manager/drivers", { headers: authHeader() });
      const data = await res.json();
      if (!res.ok) {
        setDriversError(data.error ?? "Failed to load drivers.");
        return;
      }
      setDrivers(data);
    } catch (e) {
      setDriversError(`Failed to load drivers: ${e}`);
    } finally {
      setDriversLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrucks(); }, [fetchTrucks]);

  useEffect(() => {
    if (activeTab === "records") fetchRecords();
  }, [activeTab, fetchRecords]);

  useEffect(() => {
    if (activeTab === "drivers") fetchDrivers();
  }, [activeTab, fetchDrivers]);

  function handleLogOut() {
    document.cookie = "trucktrace_token=; path=/; max-age=0";
    router.push("/manager");
  }

  async function handleAddTruck(e: FormEvent) {
    e.preventDefault();
    setAddTruckError("");
    if (!/^\d{7}$/.test(addTruckChassis)) {
      setAddTruckError("Chassis number must be exactly 7 digits.");
      return;
    }
    setAddTruckLoading(true);
    try {
      const res = await fetch("/api/manager/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ chassisNumber: addTruckChassis }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddTruckError(data.error ?? "Failed to add truck.");
        return;
      }
      setShowAddTruckModal(false);
      setAddTruckChassis("");
      fetchTrucks();
    } catch {
      setAddTruckError("Something went wrong.");
    } finally {
      setAddTruckLoading(false);
    }
  }

  async function handleDeleteRecord(recordId: string) {
    setDeletingRecordId(recordId);
    try {
      const res = await fetch(`/api/manager/trucks/${recordId}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (res.ok) {
        setConfirmDeleteRecordId(null);
        setRecords((prev) =>
          prev.map((r) =>
            r.id === recordId
              ? { ...r, status: "deleted", deleted_at: new Date().toISOString() }
              : r
          )
        );
      }
    } finally {
      setDeletingRecordId(null);
    }
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

  async function handleAddDriver(e: FormEvent) {
    e.preventDefault();
    setAddDriverError("");
    setAddDriverLoading(true);
    try {
      const res = await fetch("/api/manager/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ name: addDriverName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAddDriverError(data.error ?? "Failed to add driver.");
        return;
      }
      setAddDriverName("");
      setShowAddDriverForm(false);
      setPinModal({ pin: data.pin });
    } catch {
      setAddDriverError("Something went wrong.");
    } finally {
      setAddDriverLoading(false);
    }
  }

  async function handleDeleteDriver(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/manager/drivers/${id}`, {
        method: "DELETE",
        headers: authHeader(),
      });
      if (res.ok) {
        setConfirmDeleteId(null);
        setDrivers((prev) => prev.filter((d) => d.id !== id));
      }
    } finally {
      setDeletingId(null);
    }
  }

  async function handleResetDriverId(id: string, name: string) {
    setResettingIdFor(id);
    setResetIdError(null);
    try {
      const res = await fetch(`/api/manager/drivers/${id}/reset-pin`, {
        method: "POST",
        headers: authHeader(),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetIdError("Failed to reset Driver ID. Please try again.");
        setResetIdConfirmId(null);
        return;
      }
      setResetIdConfirmId(null);
      setDrivers((prev) => prev.map((d) => (d.id === id ? { ...d, pin: data.pin } : d)));
      setResetIdModal({ name, pin: data.pin });
    } catch {
      setResetIdError("Failed to reset Driver ID. Please try again.");
      setResetIdConfirmId(null);
    } finally {
      setResettingIdFor(null);
    }
  }

  const tabLabel: Record<"fleet" | "records" | "drivers", string> = {
    fleet: "Fleet",
    records: "Records",
    drivers: "Drivers",
  };

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">TruckTrace</h1>
          <p className="text-xs text-gray-400">
            {companyName ? companyName : "Fleet Manager Dashboard"}
          </p>
          {slug && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-gray-500 truncate">
                Driver link:{" "}
                <span className="font-mono text-blue-600">
                  https://trucktrace.net/driver?dealer={slug}
                </span>
              </span>
              <button
                onClick={() => {
                  navigator.clipboard
                    .writeText(`https://trucktrace.net/driver?dealer=${slug}`)
                    .then(() => {
                      setLinkCopied(true);
                      setTimeout(() => setLinkCopied(false), 2000);
                    })
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

      {/* Tab switcher */}
      <div className="bg-white border-b border-gray-200 px-6">
        <nav className="flex -mb-px">
          {(["fleet", "records", "drivers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tabLabel[tab]}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Fleet tab ─────────────────────────────────────────────────────────── */}
      {activeTab === "fleet" && (
        <>
          <div className="px-6 py-4 flex items-center gap-3">
            <button
              onClick={() => { setShowAddTruckModal(true); setAddTruckError(""); setAddTruckChassis(""); }}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Add Truck
            </button>
            <button
              onClick={fetchTrucks}
              disabled={trucksLoading}
              className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {trucksLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>

          <div className="px-6 pb-10">
            {trucksError && (
              <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                {trucksError}
              </p>
            )}

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-600">Chassis Number</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Last Driver</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Last Known Location</th>
                    <th className="px-4 py-3 font-semibold text-gray-600">Last Updated</th>
                    <th className="px-4 py-3 font-semibold text-gray-600"></th>
                  </tr>
                </thead>
                <tbody>
                  {trucksLoading && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!trucksLoading && trucks.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                        No active trucks found.
                      </td>
                    </tr>
                  )}
                  {!trucksLoading &&
                    trucks.map((truck) => (
                      <tr
                        key={truck.truck_id}
                        className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-900 font-mono font-medium">
                          {truck.chassis_number}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{truck.driver_name}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                          {truck.last_known_address ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {formatDate(truck.last_updated)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/manager/trucks/${truck.truck_id}/timeline`}
                            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                          >
                            Timeline
                          </Link>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Records tab ───────────────────────────────────────────────────────── */}
      {activeTab === "records" && (
        <div className="px-6 py-6 pb-10">
          <div className="mb-4 flex items-center gap-3">
            <button
              onClick={fetchRecords}
              disabled={recordsLoading}
              className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {recordsLoading ? "Refreshing…" : "Refresh"}
            </button>
            <button
              onClick={handleMasterExport}
              className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Export All Records
            </button>
          </div>

          {recordsError && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {recordsError}
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Chassis Number</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Last Driver</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Last Known Location</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Last Updated</th>
                  <th className="px-4 py-3 font-semibold text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {recordsLoading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!recordsLoading && records.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      No trucks found.
                    </td>
                  </tr>
                )}
                {!recordsLoading &&
                  records.map((record) => (
                    <tr
                      key={record.id}
                      className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${
                        record.status === "deleted" ? "opacity-60" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-gray-900 font-mono font-medium">
                        {record.chassis_number}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${
                            recordStatusBadge[record.status] ?? "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {record.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{record.last_driver ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                        {record.last_known_location ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(record.last_updated)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {record.status !== "deleted" && (
                          <div className="inline-flex items-center gap-4">
                            <Link
                              href={`/manager/trucks/${record.id}/timeline`}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                            >
                              Timeline
                            </Link>
                            {confirmDeleteRecordId === record.id ? (
                              <span className="inline-flex items-center gap-2">
                                <span className="text-xs text-gray-600">Are you sure?</span>
                                <button
                                  onClick={() => handleDeleteRecord(record.id)}
                                  disabled={deletingRecordId === record.id}
                                  className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50 transition-colors"
                                >
                                  {deletingRecordId === record.id ? "Deleting…" : "Confirm"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteRecordId(null)}
                                  disabled={deletingRecordId === record.id}
                                  className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteRecordId(record.id)}
                                className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Drivers tab ───────────────────────────────────────────────────────── */}
      {activeTab === "drivers" && (
        <div className="px-6 py-6 pb-10">
          <div className="mb-6">
            {!showAddDriverForm ? (
              <button
                onClick={() => setShowAddDriverForm(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                Add Driver
              </button>
            ) : (
              <form
                onSubmit={handleAddDriver}
                className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-end gap-3 max-w-md"
              >
                <div className="flex-1 w-full">
                  <label
                    htmlFor="addDriverName"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Driver Name
                  </label>
                  <input
                    id="addDriverName"
                    type="text"
                    required
                    autoFocus
                    value={addDriverName}
                    onChange={(e) => setAddDriverName(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="e.g. John Smith"
                  />
                  {addDriverError && (
                    <p className="mt-1 text-xs text-red-600">{addDriverError}</p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddDriverForm(false);
                      setAddDriverName("");
                      setAddDriverError("");
                    }}
                    className="text-sm border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={addDriverLoading}
                    className="text-sm bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium px-3 py-2 rounded-lg transition-colors"
                  >
                    {addDriverLoading ? "Adding…" : "Add Driver"}
                  </button>
                </div>
              </form>
            )}
          </div>

          {driversError && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {driversError}
            </p>
          )}

          {resetIdError && (
            <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {resetIdError}
            </p>
          )}

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Name</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Driver ID</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Date Added</th>
                  <th className="px-4 py-3 font-semibold text-gray-600"></th>
                </tr>
              </thead>
              <tbody>
                {driversLoading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                )}
                {!driversLoading && drivers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-400">
                      No drivers yet.
                    </td>
                  </tr>
                )}
                {!driversLoading &&
                  drivers.map((driver) => (
                    <tr
                      key={driver.id}
                      className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3 text-gray-900 font-medium">{driver.name}</td>
                      <td className="px-4 py-3 text-gray-700 font-mono tracking-wider">
                        {driver.pin}
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {formatDate(driver.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {resetIdConfirmId === driver.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-gray-600">
                              Reset this driver&apos;s ID?
                            </span>
                            <button
                              onClick={() => handleResetDriverId(driver.id, driver.name)}
                              disabled={resettingIdFor === driver.id}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium disabled:opacity-50 transition-colors"
                            >
                              {resettingIdFor === driver.id ? "Resetting…" : "Confirm"}
                            </button>
                            <button
                              onClick={() => setResetIdConfirmId(null)}
                              disabled={resettingIdFor === driver.id}
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : confirmDeleteId === driver.id ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="text-xs text-gray-600">Are you sure?</span>
                            <button
                              onClick={() => handleDeleteDriver(driver.id)}
                              disabled={deletingId === driver.id}
                              className="text-xs text-red-600 hover:text-red-800 font-medium disabled:opacity-50 transition-colors"
                            >
                              {deletingId === driver.id ? "Deleting…" : "Confirm"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              disabled={deletingId === driver.id}
                              className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-4">
                            <button
                              onClick={() => {
                                setResetIdConfirmId(driver.id);
                                setConfirmDeleteId(null);
                                setResetIdError(null);
                              }}
                              className="text-xs text-blue-500 hover:text-blue-700 font-medium transition-colors"
                            >
                              Reset ID
                            </button>
                            <button
                              onClick={() => {
                                setConfirmDeleteId(driver.id);
                                setResetIdConfirmId(null);
                              }}
                              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Add Truck modal ───────────────────────────────────────────────────── */}
      {showAddTruckModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Add Truck</h2>

            <div className="mb-5 flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
              <span className="shrink-0 font-bold">⚠</span>
              <p>
                Trucks are normally synced automatically from the stock list via Power Automate.
                Only add a truck manually if it is not in the stock system.
              </p>
            </div>

            <form onSubmit={handleAddTruck} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chassis Number (7 digits)
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={addTruckChassis}
                  onChange={(e) => setAddTruckChassis(e.target.value)}
                  pattern="\d{7}"
                  maxLength={7}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="1234567"
                />
                {addTruckError && (
                  <p className="mt-1 text-xs text-red-600">{addTruckError}</p>
                )}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTruckModal(false);
                    setAddTruckChassis("");
                    setAddTruckError("");
                  }}
                  className="flex-1 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2.5 rounded-xl transition-colors text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addTruckLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-2.5 rounded-xl transition-colors text-sm"
                >
                  {addTruckLoading ? "Adding…" : "Add Truck"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── New driver PIN modal ───────────────────────────────────────────────── */}
      {pinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Driver Added</h2>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl py-6 px-4 mb-6">
              <p className="text-xs font-semibold text-blue-500 uppercase tracking-widest mb-3">
                Driver ID
              </p>
              <p className="text-6xl font-bold tracking-[0.3em] text-blue-700">
                {pinModal.pin}
              </p>
            </div>
            <button
              onClick={() => {
                setPinModal(null);
                fetchDrivers();
              }}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* ── Reset Driver ID result modal ───────────────────────────────────────── */}
      {resetIdModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center px-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Driver ID Reset</h2>
            <p className="text-sm text-gray-500 mb-6">
              The new Driver ID for{" "}
              <span className="font-medium text-gray-900">{resetIdModal.name}</span> is:
            </p>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl py-6 px-4 mb-4">
              <p className="text-4xl font-mono tracking-widest text-blue-700">
                {resetIdModal.pin}
              </p>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(resetIdModal.pin).catch(() => {});
              }}
              className="w-full mb-3 border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2.5 rounded-xl transition-colors text-sm"
            >
              Copy to Clipboard
            </button>
            <button
              onClick={() => setResetIdModal(null)}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
