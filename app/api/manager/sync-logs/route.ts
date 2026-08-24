import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("sync_logs")
    .select("id, created_at, rows_processed, created_count, skipped_count, success, error_message")
    .eq("manager_id", manager.managerId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}
