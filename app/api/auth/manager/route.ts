import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signManagerToken } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("manager_accounts")
    .select("id, company_name, email, hashed_password, status, slug")
    .ilike("email", email.trim())
    .single();

  if (!account) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  if (account.status === "pending") {
    return NextResponse.json(
      { error: "Your account is pending approval. You will receive an email when approved." },
      { status: 403 }
    );
  }

  if (account.status === "rejected") {
    return NextResponse.json(
      { error: "Your account application was not approved." },
      { status: 403 }
    );
  }

  const valid = await bcrypt.compare(password, account.hashed_password);
  if (!valid) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  const token = await signManagerToken({
    managerId: account.id,
    email: account.email,
    companyName: account.company_name,
    slug: account.slug ?? "",
  });

  return NextResponse.json({ token });
}
