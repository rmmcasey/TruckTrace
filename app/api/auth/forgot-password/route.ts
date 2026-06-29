import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { supabase } from "@/lib/supabase";
import { sendPasswordResetEmail } from "@/lib/email";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email } = await req.json();

  if (!email) {
    return NextResponse.json({ error: "Email is required" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("manager_accounts")
    .select("id, status")
    .ilike("email", email.trim())
    .single();

  // Always return success to prevent email enumeration
  if (!account || account.status !== "active") {
    return NextResponse.json({ success: true });
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString(); // 1 hour

  await supabase.from("password_reset_tokens").insert({
    manager_id: account.id,
    token_hash: tokenHash,
    expires_at: expiresAt,
  });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const resetUrl = `${origin}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail(email.trim(), resetUrl);
  } catch (e) {
    console.error("[forgot-password] email failed:", e);
  }

  return NextResponse.json({ success: true });
}
