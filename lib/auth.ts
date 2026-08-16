import { SignJWT, jwtVerify } from "jose";
import { NextRequest } from "next/server";

export interface ManagerPayload {
  role: "manager";
  managerId: string;
  email: string;
  companyName: string;
  slug: string;
}

export interface AdminPayload {
  role: "admin";
}

export interface DealerSessionPayload {
  role: "dealer_session";
  managerId: string;
  slug: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export async function signManagerToken(data: {
  managerId: string;
  email: string;
  companyName: string;
  slug: string;
}): Promise<string> {
  return new SignJWT({ role: "manager", ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(secret());
}

export async function signAdminToken(): Promise<string> {
  return new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(secret());
}

export async function signDealerToken(data: {
  managerId: string;
  slug: string;
}): Promise<string> {
  return new SignJWT({ role: "dealer_session", ...data })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("4h")
    .sign(secret());
}

export async function verifyToken(token: string): Promise<{ role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as { role: string };
  } catch (e) {
    console.error("[verifyToken]", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function requireManager(req: NextRequest): Promise<ManagerPayload | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.cookies.get("trucktrace_token")?.value ?? null);
  const payload = token ? await verifyToken(token) : null;
  return payload?.role === "manager" ? (payload as ManagerPayload) : null;
}

export async function requireAdmin(req: NextRequest): Promise<AdminPayload | null> {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : (req.cookies.get("trucktrace_admin_token")?.value ?? null);
  const payload = token ? await verifyToken(token) : null;
  return payload?.role === "admin" ? (payload as AdminPayload) : null;
}

export async function requireDealerSession(req: NextRequest): Promise<DealerSessionPayload | null> {
  const token = req.cookies.get("trucktrace_driver_token")?.value ?? null;
  const payload = token ? await verifyToken(token) : null;
  return payload?.role === "dealer_session" ? (payload as DealerSessionPayload) : null;
}
