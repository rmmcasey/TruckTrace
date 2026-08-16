import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const locationId = params.id;
  const body = await req.json();
  const { name, latitude, longitude, tan_number, active } = body;

  // Verify ownership
  const { data: existing } = await supabase
    .from("locations")
    .select("id, tan_number")
    .eq("id", locationId)
    .eq("manager_id", manager.managerId)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Log TAN change before updating
  if (tan_number !== undefined && tan_number !== existing.tan_number) {
    await supabase.from("location_tan_history").insert({
      location_id: locationId,
      old_tan: existing.tan_number,
      new_tan: tan_number.trim(),
      changed_by_manager_id: manager.managerId,
    });
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) update.name = name.trim();
  if (latitude !== undefined) update.latitude = latitude;
  if (longitude !== undefined) update.longitude = longitude;
  if (tan_number !== undefined) update.tan_number = tan_number.trim();
  if (active !== undefined) update.active = active;

  const { data, error } = await supabase
    .from("locations")
    .update(update)
    .eq("id", locationId)
    .eq("manager_id", manager.managerId)
    .select("id, name, latitude, longitude, tan_number, active, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
