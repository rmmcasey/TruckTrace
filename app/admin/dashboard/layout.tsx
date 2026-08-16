import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { jwtVerify } from "jose";

function secret(): Uint8Array {
  return new TextEncoder().encode(process.env.JWT_SECRET!);
}

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get("trucktrace_admin_token")?.value;
  let authorized = false;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, secret());
      authorized = payload.role === "admin";
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    redirect("/admin");
  }

  return <>{children}</>;
}
