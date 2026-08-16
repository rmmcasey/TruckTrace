import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { signDealerToken } from "@/lib/auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { dealer, pin } = await req.json();

  if (!dealer || !pin || typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("manager_accounts")
    .select("id, slug, driver_pin_hash, driver_pin_failed_attempts, driver_pin_locked_until, status")
    .eq("slug", dealer)
    .eq("status", "active")
    .single();

  if (!account) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  // Check lockout
  if (account.driver_pin_locked_until) {
    const lockedUntil = new Date(account.driver_pin_locked_until);
    if (lockedUntil > new Date()) {
      const secsLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Too many attempts", lockedUntilIso: account.driver_pin_locked_until, secsLeft },
        { status: 429 }
      );
    }
    // Lockout expired — reset before checking
    await supabase
      .from("manager_accounts")
      .update({ driver_pin_failed_attempts: 0, driver_pin_locked_until: null })
      .eq("id", account.id);
  }

  if (!account.driver_pin_hash) {
    return NextResponse.json({ error: "No driver PIN set for this dealer" }, { status: 403 });
  }

  const valid = await bcrypt.compare(pin, account.driver_pin_hash);

  if (!valid) {
    const newAttempts = (account.driver_pin_failed_attempts ?? 0) + 1;
    const update: Record<string, unknown> = { driver_pin_failed_attempts: newAttempts };
    if (newAttempts >= MAX_ATTEMPTS) {
      update.driver_pin_locked_until = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    await supabase.from("manager_accounts").update(update).eq("id", account.id);
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  // Success — reset counters
  await supabase
    .from("manager_accounts")
    .update({ driver_pin_failed_attempts: 0, driver_pin_locked_until: null })
    .eq("id", account.id);

  const token = await signDealerToken({ managerId: account.id, slug: account.slug });

  const res = NextResponse.json({ success: true });
  res.cookies.set("trucktrace_driver_token", token, {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 4 * 60 * 60, // 4 hours
    path: "/",
  });
  return res;
}
