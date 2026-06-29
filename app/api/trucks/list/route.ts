import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const dealer = req.nextUrl.searchParams.get("dealer");
  if (!dealer) {
    return NextResponse.json({ error: "Missing dealer" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("manager_accounts")
    .select("id")
    .eq("slug", dealer)
    .eq("status", "active")
    .single();

  if (!account) {
    return NextResponse.json({ error: "Invalid dealer" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("trucks")
    .select("chassis_number")
    .eq("manager_id", account.id)
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
