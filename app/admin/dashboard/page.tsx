"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ManagerAccount {
  id: string;
  company_name: string;
  email: string;
  status: "pending" | "active" | "rejected";
  created_at: string;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeader() {
  return { Authorization: `Bearer ${getCookie("trucktrace_admin_token")}` };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });
}

const statusBadge: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-700",
};

export default function AdminDashboardPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ManagerAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState<string | null>(null);

  async function fetchAccounts() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/accounts", { headers: authHeader() });
      if (res.status === 401) {
        router.push("/admin");
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to load accounts.");
        return;
      }
      setAccounts(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAccounts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAction(id: string, status: "active" | "rejected") {
    setActing(id);
    try {
      const res = await fetch(`/api/admin/accounts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status } : a))
        );
      }
    } finally {
      setActing(null);
    }
  }

  function handleLogOut() {
    document.cookie = "trucktrace_admin_token=; path=/; max-age=0";
    router.push("/admin");
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">TruckTrace Admin</h1>
          <p className="text-xs text-gray-400">Manager Accounts</p>
        </div>
        <button
          onClick={handleLogOut}
          className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
        >
          Log Out
        </button>
      </header>

      <div className="px-6 py-6 pb-10">
        {error && (
          <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
            {error}
          </p>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-left">
                <th className="px-4 py-3 font-semibold text-gray-600">Company</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Email</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 font-semibold text-gray-600">Signed Up</th>
                <th className="px-4 py-3 font-semibold text-gray-600"></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && accounts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                    No accounts yet.
                  </td>
                </tr>
              )}
              {!loading &&
                accounts.map((account) => (
                  <tr
                    key={account.id}
                    className="border-t border-gray-100 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-900 font-medium">
                      {account.company_name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{account.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${statusBadge[account.status] ?? "bg-gray-100 text-gray-600"}`}
                      >
                        {account.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDate(account.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        {account.status !== "active" && (
                          <button
                            onClick={() => handleAction(account.id, "active")}
                            disabled={acting === account.id}
                            className="text-xs text-green-600 hover:text-green-800 font-medium disabled:opacity-50 transition-colors"
                          >
                            {acting === account.id ? "…" : "Approve"}
                          </button>
                        )}
                        {account.status !== "rejected" && (
                          <button
                            onClick={() => handleAction(account.id, "rejected")}
                            disabled={acting === account.id}
                            className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50 transition-colors"
                          >
                            {acting === account.id ? "…" : "Reject"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
