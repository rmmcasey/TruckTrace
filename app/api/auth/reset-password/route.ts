import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { token, password } = await req.json();

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");

  const { data: record } = await supabase
    .from("password_reset_tokens")
    .select("id, manager_id, expires_at, used_at")
    .eq("token_hash", tokenHash)
    .single();

  if (!record) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  if (record.used_at) {
    return NextResponse.json(
      { error: "This reset link has already been used" },
      { status: 400 }
    );
  }

  if (new Date(record.expires_at) < new Date()) {
    return NextResponse.json({ error: "This reset link has expired" }, { status: 400 });
  }

  const hashed_password = await bcrypt.hash(password, 12);

  await supabase
    .from("manager_accounts")
    .update({ hashed_password })
    .eq("id", record.manager_id);

  await supabase
    .from("password_reset_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", record.id);

  return NextResponse.json({ success: true });
}
