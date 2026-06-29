import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { data: trucks, error: trucksError } = await supabase
    .from("trucks")
    .select("id, chassis_number, status, deleted_at, created_at")
    .eq("manager_id", managerId);

  if (trucksError) {
    return NextResponse.json({ error: trucksError.message }, { status: 500 });
  }

  if (!trucks || trucks.length === 0) {
    return NextResponse.json([]);
  }

  const { data: logs, error: logsError } = await supabase
    .from("location_logs")
    .select("truck_id, driver_name, resolved_address, logged_at")
    .in("truck_id", trucks.map((t) => t.id))
    .order("logged_at", { ascending: false });

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  const latestLog = new Map<
    string,
    { driver_name: string | null; resolved_address: string | null; logged_at: string }
  >();
  for (const log of logs ?? []) {
    if (!latestLog.has(log.truck_id)) {
      latestLog.set(log.truck_id, {
        driver_name: log.driver_name,
        resolved_address: log.resolved_address,
        logged_at: log.logged_at,
      });
    }
  }

  const result = trucks.map((truck) => {
    const latest = latestLog.get(truck.id);
    return {
      id: truck.id,
      chassis_number: truck.chassis_number,
      status: truck.deleted_at ? "deleted" : truck.status,
      deleted_at: truck.deleted_at ?? null,
      created_at: truck.created_at,
      last_driver: latest?.driver_name ?? null,
      last_known_location: latest?.resolved_address ?? null,
      last_updated: latest?.logged_at ?? null,
    };
  });

  result.sort((a, b) => {
    const order = (r: typeof result[0]) => {
      if (r.status === "active") return 0;
      if (r.status === "inactive") return 1;
      return 2;
    };
    return order(a) - order(b) || a.chassis_number.localeCompare(b.chassis_number);
  });

  return NextResponse.json(result);
}
