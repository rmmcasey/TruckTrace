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

  const { data, error } = await supabase
    .from("trucks")
    .select("id, chassis_number, status, deleted_at, current_location_id, location_logged_at, location_method, locations(name, tan_number)")
    .eq("manager_id", managerId)
    .is("deleted_at", null)
    .order("chassis_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const result = (data ?? []).map((truck) => {
    const loc = (Array.isArray(truck.locations) ? truck.locations[0] : truck.locations) as
      | { name: string; tan_number: string }
      | null;
    return {
      truck_id: truck.id,
      chassis_number: truck.chassis_number,
      status: truck.status,
      current_location_id: truck.current_location_id ?? null,
      location_name: loc?.name ?? null,
      tan_number: loc?.tan_number ?? null,
      location_logged_at: truck.location_logged_at ?? null,
      location_method: truck.location_method ?? null,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { chassisNumber } = await req.json();

  const { error } = await supabase
    .from("trucks")
    .insert({ chassis_number: chassisNumber, status: "active", manager_id: managerId });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "This chassis number already exists." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
