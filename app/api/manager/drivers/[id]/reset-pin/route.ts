import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const newPin = String(Math.floor(1000 + Math.random() * 9000));

  const { error } = await supabase
    .from("drivers")
    .update({ pin: newPin })
    .eq("id", params.id)
    .eq("manager_id", managerId);

  if (error) {
    return NextResponse.json({ error: "Failed to reset Driver ID" }, { status: 500 });
  }

  return NextResponse.json({ pin: newPin });
}
