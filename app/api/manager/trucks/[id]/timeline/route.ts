import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const truckId = params.id;

  const { data: truck, error: truckError } = await supabase
    .from("trucks")
    .select("chassis_number")
    .eq("id", truckId)
    .eq("manager_id", managerId)
    .single();

  if (truckError || !truck) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: logs, error: logsError } = await supabase
    .from("location_logs")
    .select(
      "id, resolved_address, latitude, longitude, logged_at, journey_id, driver_name, drivers(name)"
    )
    .eq("truck_id", truckId)
    .order("logged_at", { ascending: true });

  if (logsError) {
    return NextResponse.json({ error: logsError.message }, { status: 500 });
  }

  if (!logs || logs.length === 0) {
    return NextResponse.json({ truck, logs: [] });
  }

  const journeyIds = [...new Set(logs.map((l) => l.journey_id))];
  const { data: journeys, error: journeysError } = await supabase
    .from("journeys")
    .select("id, status, started_at, completed_at")
    .in("id", journeyIds);

  if (journeysError) {
    return NextResponse.json({ error: journeysError.message }, { status: 500 });
  }

  const journeyMap = new Map((journeys ?? []).map((j) => [j.id, j]));

  const enrichedLogs = logs.map((log) => {
    const journey = journeyMap.get(log.journey_id);
    const driverJoin = (Array.isArray(log.drivers) ? log.drivers[0] : log.drivers) as { name: string } | null;
    return {
      id: log.id,
      resolved_address: log.resolved_address,
      latitude: log.latitude,
      longitude: log.longitude,
      logged_at: log.logged_at,
      journey_id: log.journey_id,
      driver_name: log.driver_name ?? driverJoin?.name ?? null,
      journey_status: journey?.status ?? null,
      journey_started: journey?.started_at ?? null,
      journey_completed: journey?.completed_at ?? null,
    };
  });

  return NextResponse.json({ truck, logs: enrichedLogs });
}
