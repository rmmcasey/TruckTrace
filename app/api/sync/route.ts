import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

interface TruckPayload {
  chassis: string;
  onSite: boolean;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-sync-secret");
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const managerId = process.env.SYNC_MANAGER_ID;
  if (!managerId) {
    return NextResponse.json({ error: "Sync not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();

    if (!body.trucks || !Array.isArray(body.trucks)) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid 'trucks' array" },
        { status: 400 }
      );
    }

    const skipped: string[] = [];
    const valid: TruckPayload[] = [];

    for (const item of body.trucks as TruckPayload[]) {
      if (typeof item.chassis !== "string" || !/^\d{7}$/.test(item.chassis)) {
        skipped.push(String(item.chassis ?? "(missing)"));
      } else {
        valid.push(item);
      }
    }

    // Fetch all trucks for this manager including soft-deleted so we never re-insert a deleted truck
    const { data: existing, error: fetchError } = await supabase
      .from("trucks")
      .select("id, chassis_number, status, deleted_at")
      .eq("manager_id", managerId);

    if (fetchError) {
      console.error("[SYNC] Failed to fetch trucks:", fetchError.message);
      return NextResponse.json({ success: false, error: "Internal sync error" }, { status: 500 });
    }

    const existingMap = new Map(
      (existing ?? []).map((t) => [t.chassis_number, t])
    );

    let inserted = 0;
    let activated = 0;
    let deactivated = 0;

    for (const item of valid) {
      const row = existingMap.get(item.chassis);

      if (item.onSite) {
        if (!row) {
          const { error } = await supabase
            .from("trucks")
            .insert({ chassis_number: item.chassis, status: "active", manager_id: managerId });
          if (error) {
            console.error(`[SYNC] Insert failed for ${item.chassis}:`, error.message);
          } else {
            inserted++;
            console.log(`[SYNC] Inserted ${item.chassis}`);
          }
        } else if (row.status === "inactive" && !row.deleted_at) {
          // Only reactivate non-deleted inactive trucks
          const { error } = await supabase
            .from("trucks")
            .update({ status: "active" })
            .eq("id", row.id)
            .eq("manager_id", managerId);
          if (error) {
            console.error(`[SYNC] Activate failed for ${item.chassis}:`, error.message);
          } else {
            activated++;
            console.log(`[SYNC] Activated ${item.chassis}`);
          }
        }
        // If deleted_at is set or already active: skip
      } else {
        if (row && row.status === "active" && !row.deleted_at) {
          const { error } = await supabase
            .from("trucks")
            .update({ status: "inactive" })
            .eq("id", row.id)
            .eq("manager_id", managerId);
          if (error) {
            console.error(`[SYNC] Deactivate failed for ${item.chassis}:`, error.message);
          } else {
            deactivated++;
            console.log(`[SYNC] Deactivated ${item.chassis}`);
          }
        }
      }
    }

    const { data: completedJourneys, error: journeyError } = await supabase
      .from("journeys")
      .select("truck_id, trucks(chassis_number)")
      .eq("status", "completed");

    if (journeyError) {
      console.error("[SYNC] Failed to fetch completed journeys:", journeyError.message);
    }

    const completedChassis = Array.from(
      new Set(
        (completedJourneys ?? [])
          .map((j) => {
            const t = (Array.isArray(j.trucks) ? j.trucks[0] : j.trucks) as { chassis_number: string } | null;
            return t?.chassis_number ?? null;
          })
          .filter(Boolean) as string[]
      )
    );

    console.log(
      `[SYNC] Done — inserted: ${inserted}, activated: ${activated}, deactivated: ${deactivated}, skipped: ${skipped.length}, completedJourneys: ${completedChassis.length}`
    );

    return NextResponse.json({
      success: true,
      processed: valid.length,
      inserted,
      activated,
      deactivated,
      skipped,
      completedJourneys: completedChassis,
    });
  } catch (err) {
    console.error("[SYNC] Unexpected error:", err);
    return NextResponse.json({ success: false, error: "Internal sync error" }, { status: 500 });
  }
}
