import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

async function verifiedRole(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return (payload.role as string) ?? null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin/dashboard")) {
    const role = await verifiedRole(req.cookies.get("trucktrace_admin_token")?.value);
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return NextResponse.next();
  }

  // Covers /manager/dashboard and /manager/trucks/*/timeline
  const role = await verifiedRole(req.cookies.get("trucktrace_token")?.value);
  if (role !== "manager") {
    return NextResponse.redirect(new URL("/manager", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/manager/dashboard",
    "/manager/dashboard/:path*",
    "/manager/trucks/:path*",
    "/admin/dashboard",
    "/admin/dashboard/:path*",
  ],
};
