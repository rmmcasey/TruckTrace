import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function formatUTC(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().replace("T", " ").substring(0, 19);
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { data: truck } = await supabase
    .from("trucks")
    .select("chassis_number")
    .eq("id", params.id)
    .eq("manager_id", managerId)
    .single();

  if (!truck) {
    return NextResponse.json({ error: "Truck not found" }, { status: 404 });
  }

  const { data: logs, error } = await supabase
    .from("location_logs")
    .select("logged_at, resolved_address, latitude, longitude, journey_id, driver_id, journeys(status, started_at, completed_at)")
    .eq("truck_id", params.id)
    .order("logged_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = [
    "chassis_number",
    "timestamp",
    "address",
    "latitude",
    "longitude",
    "journey_id",
    "journey_status",
    "journey_started_at",
    "journey_completed_at",
    "driver_id",
  ];

  const csvRows = (logs ?? []).map((row) => {
    const j = row.journeys as { status: string; started_at: string; completed_at: string | null } | null;
    return [
      csvEscape(truck.chassis_number),
      csvEscape(formatUTC(row.logged_at)),
      csvEscape(row.resolved_address),
      csvEscape(row.latitude),
      csvEscape(row.longitude),
      csvEscape(row.journey_id),
      csvEscape(j?.status),
      csvEscape(formatUTC(j?.started_at)),
      csvEscape(formatUTC(j?.completed_at)),
      csvEscape(row.driver_id),
    ].join(",");
  });

  const csv = [headers.join(","), ...csvRows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="truck-${truck.chassis_number}-history.csv"`,
    },
  });
}
