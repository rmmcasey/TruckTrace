import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { requireDealerSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await requireDealerSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("trucks")
    .select("chassis_number")
    .eq("manager_id", session.managerId)
    .eq("status", "active")
    .is("deleted_at", null)
    .order("chassis_number");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const chassis = (data ?? [])
    .map((row) => String(row.chassis_number))
    .sort((a, b) => Number(a) - Number(b));

  return NextResponse.json({ chassis }, {
    headers: { "Cache-Control": "no-store" },
  });
}
