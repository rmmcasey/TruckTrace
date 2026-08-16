import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("locations")
    .select("id, name, latitude, longitude, tan_number, active, created_at, updated_at")
    .eq("manager_id", manager.managerId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, latitude, longitude, tan_number } = await req.json();

  if (!name || typeof latitude !== "number" || typeof longitude !== "number" || !tan_number) {
    return NextResponse.json({ error: "name, latitude, longitude and tan_number are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("locations")
    .insert({
      manager_id: manager.managerId,
      name: name.trim(),
      latitude,
      longitude,
      tan_number: tan_number.trim(),
      active: true,
    })
    .select("id, name, latitude, longitude, tan_number, active, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
