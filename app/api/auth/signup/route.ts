import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { sendSignupNotificationToAdmin } from "@/lib/email";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email, password, companyName, slug } = await req.json();

  if (!email || !password || !companyName || !slug) {
    return NextResponse.json({ error: "All fields are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters" },
      { status: 400 }
    );
  }

  if (!/^[a-z0-9-]+$/.test(slug) || slug.length < 2) {
    return NextResponse.json(
      { error: "Slug must be at least 2 characters and contain only lowercase letters, numbers, and hyphens" },
      { status: 400 }
    );
  }

  const { data: existingEmail } = await supabase
    .from("manager_accounts")
    .select("id")
    .ilike("email", email.trim())
    .single();

  if (existingEmail) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const { data: existingSlug } = await supabase
    .from("manager_accounts")
    .select("id")
    .eq("slug", slug.trim())
    .single();

  if (existingSlug) {
    return NextResponse.json(
      { error: "This slug is already taken" },
      { status: 409 }
    );
  }

  const hashed_password = await bcrypt.hash(password, 12);

  const { error } = await supabase.from("manager_accounts").insert({
    company_name: companyName.trim(),
    email: email.trim().toLowerCase(),
    hashed_password,
    slug: slug.trim(),
    status: "pending",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await sendSignupNotificationToAdmin(email.trim(), companyName.trim());
  } catch (e) {
    console.error("[signup] admin notification failed:", e);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}
