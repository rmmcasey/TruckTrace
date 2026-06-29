import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { status } = await req.json();

  const { error } = await supabase
    .from("trucks")
    .update({ status })
    .eq("id", params.id)
    .eq("manager_id", managerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
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
    .select("id")
    .eq("id", params.id)
    .eq("manager_id", managerId)
    .is("deleted_at", null)
    .single();

  if (!truck) {
    return NextResponse.json({ error: "Truck not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("trucks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("manager_id", managerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
