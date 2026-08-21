import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chassisNumbers } = await req.json();

  if (!Array.isArray(chassisNumbers) || chassisNumbers.length === 0) {
    return NextResponse.json({ error: "chassisNumbers array is required" }, { status: 400 });
  }

  const invalid: string[] = [];
  const valid: string[] = [];

  for (const c of chassisNumbers) {
    const s = String(c).trim();
    if (/^\d{7}$/.test(s)) {
      valid.push(s);
    } else {
      invalid.push(s);
    }
  }

  const uniqueValid = [...new Set(valid)];

  if (uniqueValid.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, invalid }, { status: 200 });
  }

  // Fetch existing chassis for this manager
  const { data: existing } = await supabase
    .from("trucks")
    .select("chassis_number")
    .eq("manager_id", manager.managerId)
    .in("chassis_number", uniqueValid);

  const existingSet = new Set((existing ?? []).map((t) => t.chassis_number));
  const toInsert = uniqueValid.filter((c) => !existingSet.has(c));
  const skipped = uniqueValid.length - toInsert.length + (valid.length - uniqueValid.length);

  if (toInsert.length === 0) {
    return NextResponse.json({ inserted: 0, skipped, invalid });
  }

  const { error } = await supabase.from("trucks").insert(
    toInsert.map((chassis_number) => ({
      chassis_number,
      status: "active",
      manager_id: manager.managerId,
    }))
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: toInsert.length, skipped, invalid });
}
