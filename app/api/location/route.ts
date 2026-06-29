import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { reverseGeocode } from "@/lib/opencage";
import { pinRatelimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (pinRatelimit) {
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const { success } = await pinRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const { pin, chassisNumber, latitude, longitude, accuracy } = await req.json();

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, name, manager_id")
    .eq("pin", pin)
    .is("deleted_at", null)
    .single();

  if (!driver) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const { data: truck } = await supabase
    .from("trucks")
    .select("id")
    .eq("chassis_number", chassisNumber)
    .eq("manager_id", driver.manager_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .single();

  if (!truck) {
    return NextResponse.json({ error: "Invalid truck" }, { status: 404 });
  }

  const truckId = truck.id;
  const address = await reverseGeocode(latitude, longitude);

  let { data: journey } = await supabase
    .from("journeys")
    .select("id")
    .eq("truck_id", truckId)
    .eq("status", "in_progress")
    .single();

  if (!journey) {
    const { data: newJourney } = await supabase
      .from("journeys")
      .insert({ truck_id: truckId, status: "in_progress", started_at: new Date().toISOString() })
      .select("id")
      .single();
    journey = newJourney;
  }

  const { error: insertError } = await supabase.from("location_logs").insert({
    truck_id: truckId,
    journey_id: journey!.id,
    driver_id: driver.id,
    driver_name: driver.name,
    latitude,
    longitude,
    resolved_address: address,
    logged_at: new Date().toISOString(),
    accuracy_meters: accuracy ?? null,
  });

  if (insertError) {
    console.error("[location] insert failed:", insertError.message);
    return NextResponse.json({ success: false, error: "Failed to log location" }, { status: 500 });
  }

  return NextResponse.json({ success: true, address });
}
