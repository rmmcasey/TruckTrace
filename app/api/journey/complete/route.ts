import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { pinRatelimit } from "@/lib/ratelimit";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (pinRatelimit) {
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1";
    const { success } = await pinRatelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }
  }

  const { pin, chassisNumber } = await req.json();

  const { data: driver } = await supabase
    .from("drivers")
    .select("id, manager_id")
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
    return NextResponse.json({ error: "Chassis not found" }, { status: 404 });
  }

  const { data: journey } = await supabase
    .from("journeys")
    .select("id")
    .eq("truck_id", truck.id)
    .eq("status", "in_progress")
    .single();

  if (!journey) {
    return NextResponse.json({ error: "No active journey" }, { status: 400 });
  }

  await supabase
    .from("journeys")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", journey.id);

  await supabase
    .from("trucks")
    .update({ status: "inactive" })
    .eq("id", truck.id);

  return NextResponse.json({ success: true });
}
