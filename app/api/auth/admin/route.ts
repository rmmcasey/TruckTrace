import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signAdminToken } from "@/lib/auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const { password } = await req.json();

  if (!password) {
    return NextResponse.json({ error: "Password is required" }, { status: 400 });
  }

  const adminHash = process.env.ADMIN_PASSWORD;
  if (!adminHash) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 503 });
  }

  const valid = await bcrypt.compare(password, adminHash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = await signAdminToken();
  return NextResponse.json({ token });
}
