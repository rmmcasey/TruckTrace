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

  const HEADER = "chassis_number,truck_status,location_name,tan_number,logged_at,method,distance_meters";

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
    .select("truck_id, location_id, tan_number_snapshot, method, distance_meters, logged_at, locations(name)")
    .in("truck_id", trucks.map((t) => t.id))
    .not("location_id", "is", null)
    .order("logged_at", { ascending: true });

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const rows: string[] = [HEADER];

  for (const log of logs ?? []) {
    const truck = truckMap.get(log.truck_id);
    if (!truck) continue;

    const locJoin = (Array.isArray(log.locations) ? log.locations[0] : log.locations) as
      | { name: string }
      | null;

    const truckStatus = truck.deleted_at ? "deleted" : truck.status;

    rows.push(
      [
        esc(truck.chassis_number),
        esc(truckStatus),
        esc(locJoin?.name ?? log.tan_number_snapshot ?? ""),
        esc(log.tan_number_snapshot),
        esc(formatUTC(log.logged_at)),
        esc(log.method),
        log.distance_meters ?? "",
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
