import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { requireManager } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { pin } = await req.json();

  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "PIN must be exactly 4 digits" }, { status: 400 });
  }

  const driver_pin_hash = await bcrypt.hash(pin, 12);

  const { error } = await supabase
    .from("manager_accounts")
    .update({
      driver_pin_hash,
      driver_pin_failed_attempts: 0,
      driver_pin_locked_until: null,
    })
    .eq("id", manager.managerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
