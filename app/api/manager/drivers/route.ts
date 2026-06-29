import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { data, error } = await supabase
    .from("drivers")
    .select("id, name, pin, created_at")
    .eq("manager_id", managerId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

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

  const { name } = await req.json();
  const pin = Math.floor(1000 + Math.random() * 9000).toString();

  const { data, error } = await supabase
    .from("drivers")
    .insert({ name, pin, manager_id: managerId })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, driverId: data.id, pin }, { status: 201 });
}
