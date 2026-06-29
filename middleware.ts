import { NextRequest, NextResponse } from "next/server";

// Decodes JWT payload without verifying signature — for routing only.
// Cryptographic verification still happens in every API route handler.
function decodeJwtPayload(token: string): { role?: string } | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/dashboard")) {
    const token = req.cookies.get("trucktrace_admin_token")?.value;
    const payload = token ? decodeJwtPayload(token) : null;
    if (!payload || payload.role !== "admin") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  // /manager/dashboard
  const token = req.cookies.get("trucktrace_token")?.value;
  const payload = token ? decodeJwtPayload(token) : null;
  if (!payload || payload.role !== "manager") {
    return NextResponse.redirect(new URL("/manager", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/manager/dashboard", "/admin/dashboard"],
};
