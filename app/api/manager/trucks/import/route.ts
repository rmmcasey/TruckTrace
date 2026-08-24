import { NextRequest, NextResponse } from "next/server";
import { requireManager } from "@/lib/auth";
import { upsertChassisList } from "@/lib/chassisImport";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const manager = await requireManager(req);
  if (!manager) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chassisNumbers } = await req.json();

  if (!Array.isArray(chassisNumbers) || chassisNumbers.length === 0) {
    return NextResponse.json({ error: "chassisNumbers array is required" }, { status: 400 });
  }

  try {
    const result = await upsertChassisList(chassisNumbers, manager.managerId);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
