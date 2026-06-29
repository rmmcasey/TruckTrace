import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { searchParams } = new URL(req.url);

  if (searchParams.get("all") === "true") {
    const { data: allTrucksData, error: trucksErr } = await supabase
      .from("trucks")
      .select("id, chassis_number")
      .eq("manager_id", managerId)
      .order("chassis_number");

    if (trucksErr) return NextResponse.json({ error: trucksErr.message }, { status: 500 });

    const { data: viewData } = await supabase
      .from("active_trucks_latest_position")
      .select("truck_id, driver_name, last_known_address, last_updated")
      .eq("manager_id", managerId);

    const posMap = new Map(
      (viewData ?? []).map((r: Record<string, unknown>) => [r.truck_id as string, r])
    );

    const result = (allTrucksData ?? []).map((truck) => {
      const pos = posMap.get(truck.id) as Record<string, unknown> | undefined;
      return {
        truck_id: truck.id,
        chassis_number: truck.chassis_number,
        driver_name: (pos?.driver_name as string) ?? "—",
        last_known_address: (pos?.last_known_address as string | null) ?? null,
        last_updated: (pos?.last_updated as string | null) ?? null,
      };
    });

    return NextResponse.json(result);
  }

  const { data, error } = await supabase
    .from("active_trucks_latest_position")
    .select("*")
    .eq("manager_id", managerId)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
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
