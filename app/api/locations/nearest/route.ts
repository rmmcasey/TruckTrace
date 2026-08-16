import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireDealerSession } from "@/lib/auth";
import { haversineMeters } from "@/lib/haversine";

const WARN_THRESHOLD_METERS = 5000;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await requireDealerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lat, lng } = await req.json();
  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
  }

  const { data: locations, error } = await supabase
    .from("locations")
    .select("id, name, tan_number, latitude, longitude")
    .eq("manager_id", session.managerId)
    .eq("active", true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!locations || locations.length === 0) {
    return NextResponse.json({ error: "No locations configured for this dealer" }, { status: 404 });
  }

  let nearest = locations[0];
  let nearestDist = haversineMeters(lat, lng, nearest.latitude, nearest.longitude);

  for (const loc of locations.slice(1)) {
    const dist = haversineMeters(lat, lng, loc.latitude, loc.longitude);
    if (dist < nearestDist) {
      nearest = loc;
      nearestDist = dist;
    }
  }

  return NextResponse.json({
    location_id: nearest.id,
    name: nearest.name,
    tan_number: nearest.tan_number,
    distance_meters: Math.round(nearestDist),
    warn: nearestDist > WARN_THRESHOLD_METERS,
  });
}
