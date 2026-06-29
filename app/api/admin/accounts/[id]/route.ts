import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { sendApprovalEmail, sendRejectionEmail } from "@/lib/email";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!(await requireAdmin(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status } = await req.json();

  if (status !== "active" && status !== "rejected") {
    return NextResponse.json({ error: "Status must be 'active' or 'rejected'" }, { status: 400 });
  }

  const { data: account } = await supabase
    .from("manager_accounts")
    .select("email, company_name")
    .eq("id", params.id)
    .single();

  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("manager_accounts")
    .update({ status })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    if (status === "active") {
      await sendApprovalEmail(account.email, account.company_name);
    } else {
      await sendRejectionEmail(account.email, account.company_name);
    }
  } catch (e) {
    console.error("[admin/accounts] notification email failed:", e);
  }

  return NextResponse.json({ success: true });
}
