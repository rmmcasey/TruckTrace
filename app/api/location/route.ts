import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireDealerSession } from "@/lib/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireDealerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chassisNumber, locationId, method, distanceMeters } = await req.json();

  if (!chassisNumber || !locationId || !method) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (method !== "auto" && method !== "manual") {
    return NextResponse.json({ error: "Invalid method" }, { status: 400 });
  }

  const { data: truck } = await supabase
    .from("trucks")
    .select("id")
    .eq("chassis_number", chassisNumber)
    .eq("manager_id", session.managerId)
    .eq("status", "active")
    .is("deleted_at", null)
    .single();

  if (!truck) {
    return NextResponse.json({ error: "Invalid truck" }, { status: 404 });
  }

  const { data: location } = await supabase
    .from("locations")
    .select("id, name, tan_number")
    .eq("id", locationId)
    .eq("manager_id", session.managerId)
    .eq("active", true)
    .single();

  if (!location) {
    return NextResponse.json({ error: "Invalid location" }, { status: 404 });
  }

  const now = new Date().toISOString();

  const { error: logError } = await supabase.from("location_logs").insert({
    truck_id: truck.id,
    location_id: location.id,
    tan_number_snapshot: location.tan_number,
    method,
    distance_meters: typeof distanceMeters === "number" ? Math.round(distanceMeters) : null,
    logged_at: now,
  });

  if (logError) {
    return NextResponse.json({ error: logError.message }, { status: 500 });
  }

  await supabase
    .from("trucks")
    .update({
      current_location_id: location.id,
      location_logged_at: now,
      location_method: method,
    })
    .eq("id", truck.id);

  return NextResponse.json({
    success: true,
    locationName: location.name,
    tanNumber: location.tan_number,
  });
}
