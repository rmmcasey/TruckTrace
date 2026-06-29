"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { format } from "date-fns";

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

type LogEntry = {
  id: string;
  resolved_address: string;
  latitude: number;
  longitude: number;
  logged_at: string;
  journey_id: string;
  driver_name: string | null;
  journey_status: string | null;
  journey_started: string | null;
  journey_completed: string | null;
};

type JourneyGroup = {
  journey_id: string;
  status: string | null;
  started: string | null;
  completed: string | null;
  logs: LogEntry[];
};

function formatTs(iso: string): string {
  return format(new Date(iso), "dd MMM yyyy, HH:mm");
}

function groupByJourney(logs: LogEntry[]): JourneyGroup[] {
  const map = new Map<string, JourneyGroup>();
  for (const log of logs) {
    if (!map.has(log.journey_id)) {
      map.set(log.journey_id, {
        journey_id: log.journey_id,
        status: log.journey_status,
        started: log.journey_started,
        completed: log.journey_completed,
        logs: [],
      });
    }
    map.get(log.journey_id)!.logs.push(log);
  }
  return Array.from(map.values());
}

export default function TruckTimelinePage() {
  const params = useParams();
  const truckId = params.id as string;

  const [truck, setTruck] = useState<{ chassis_number: string } | null>(null);
  const [journeys, setJourneys] = useState<JourneyGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/manager/trucks/${truckId}/timeline`, {
          headers: { Authorization: `Bearer ${getCookie("trucktrace_token")}` },
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? `Error ${res.status}`);
          return;
        }
        const data = await res.json();
        setTruck(data.truck);
        setJourneys(groupByJourney(data.logs));
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [truckId]);

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <Link
          href="/manager/dashboard"
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 transition-colors"
        >
          ← Back to Dashboard
        </Link>
        {truck && (
          <div className="mt-2">
            <h1 className="text-xl font-bold text-gray-900 font-mono">{truck.chassis_number}</h1>
          </div>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {loading && (
          <p className="text-center text-gray-400 py-16">Loading timeline…</p>
        )}

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {!loading && !error && journeys.length === 0 && (
          <p className="text-center text-gray-400 py-16">
            No location history recorded yet.
          </p>
        )}

        {!loading && !error && journeys.length > 0 && (
          <div className="space-y-6">
            {journeys.map((journey, idx) => (
              <JourneySection
                key={journey.journey_id}
                journey={journey}
                journeyNumber={idx + 1}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function JourneySection({
  journey,
  journeyNumber,
}: {
  journey: JourneyGroup;
  journeyNumber: number;
}) {
  const inProgress = journey.status === "in_progress";

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Journey header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
            Journey {journeyNumber}
          </p>
          <p className="text-sm text-gray-700">
            {journey.started ? formatTs(journey.started) : "—"}
            <span className="mx-1.5 text-gray-400">→</span>
            {inProgress ? (
              <span className="text-green-600 font-medium">In Progress</span>
            ) : journey.completed ? (
              formatTs(journey.completed)
            ) : (
              "—"
            )}
          </p>
        </div>
        {inProgress ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            In Progress
          </span>
        ) : (
          <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
            Completed
          </span>
        )}
      </div>

      {/* Log entries */}
      <ul className="px-5 pt-4 pb-2">
        {journey.logs.map((log, i) => {
          const isFirst = i === 0;
          const isLast = i === journey.logs.length - 1;
          const isEndPoint = isLast && !inProgress;
          const isSingleEntry = journey.logs.length === 1;

          return (
            <li key={log.id} className="flex gap-3">
              {/* Dot + connector */}
              <div className="flex flex-col items-center pt-0.5">
                {isFirst ? (
                  <div className="w-3 h-3 rounded-full bg-green-500 ring-2 ring-green-100 shrink-0" />
                ) : isEndPoint ? (
                  <div className="w-3 h-3 rounded-full bg-gray-400 ring-2 ring-gray-100 shrink-0" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-200 shrink-0" />
                )}
                {!isLast && (
                  <div className="w-px flex-1 bg-gray-200 my-1 min-h-[1.5rem]" />
                )}
              </div>

              {/* Text */}
              <div className="pb-4 min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="text-sm font-medium text-gray-900 leading-snug">
                    {log.resolved_address}
                  </p>
                  {isFirst && (
                    <span className="text-xs font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded">
                      Start
                    </span>
                  )}
                  {(isEndPoint || (isSingleEntry && !inProgress)) && (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      End
                    </span>
                  )}
                </div>
                {log.driver_name && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    Driver: {log.driver_name}
                  </p>
                )}
                <p className="mt-0.5 text-xs text-gray-400">
                  {formatTs(log.logged_at)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
