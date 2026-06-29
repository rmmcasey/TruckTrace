import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

function csvEscape(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { managerId } = manager;

  const { data, error } = await supabase
    .from("active_trucks_latest_position")
    .select("*")
    .eq("manager_id", managerId)
    .eq("status", "active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const headers = ["Chassis Number", "Driver Name", "Last Known Address", "Last Updated"];
  const rows = (data ?? []).map((row) => [
    csvEscape(row.chassis_number),
    csvEscape(row.driver_name),
    csvEscape(row.last_known_address),
    csvEscape(row.last_updated),
  ].join(","));

  const csv = [headers.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="trucktrace-export.csv"',
    },
  });
}
