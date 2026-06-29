import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function formatUTC(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().replace("T", " ").substring(0, 19);
}

function esc(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const HEADER =
    "chassis_number,truck_status,truck_deleted_at,timestamp,driver_name,address,latitude,longitude,journey_id,journey_status,journey_started_at,journey_completed_at";

  const { data: trucks, error: trucksError } = await supabase
    .from("trucks")
    .select("id, chassis_number, status, deleted_at")
    .eq("manager_id", managerId)
    .order("chassis_number");

  if (trucksError) {
    return NextResponse.json({ error: trucksError.message }, { status: 500 });
  }

  if (!trucks || trucks.length === 0) {
    return csvResponse(HEADER + "\n");
  }

  const truckMap = new Map(trucks.map((t) => [t.id, t]));

  const { data: logs, error: logsError } = await supabase
    .from("location_logs")
    .select(
      "truck_id, driver_name, resolved_address, latitude, longitude, logged_at, journey_id, journeys(status, started_at, completed_at)"
    )
    .in("truck_id", trucks.map((t) => t.id))
    .order("logged_at", { ascending: true });

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const rows: string[] = [HEADER];

  for (const log of logs ?? []) {
    const truck = truckMap.get(log.truck_id);
    if (!truck) continue;

    const j = log.journeys as {
      status: string;
      started_at: string;
      completed_at: string | null;
    } | null;

    const truckStatus = truck.deleted_at ? "deleted" : truck.status;

    rows.push(
      [
        truck.chassis_number,
        truckStatus,
        formatUTC(truck.deleted_at),
        formatUTC(log.logged_at),
        esc(log.driver_name),
        esc(log.resolved_address),
        log.latitude,
        log.longitude,
        log.journey_id,
        j?.status ?? "",
        formatUTC(j?.started_at),
        formatUTC(j?.completed_at),
      ].join(",")
    );
  }

  return csvResponse(rows.join("\n") + "\n");
}

function csvResponse(body: string): NextResponse {
  const date = new Date().toISOString().substring(0, 10);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="trucktrace-master-export-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
