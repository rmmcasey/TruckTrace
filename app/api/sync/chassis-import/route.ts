import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { upsertChassisList } from "@/lib/chassisImport";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single-tenant: this sync applies to one specific manager.
// If a second manager ever needs automated sync, issue per-manager secrets
// and look up manager_id from the matched secret instead.
const SYNC_MANAGER_ID = process.env.SYNC_MANAGER_ID ?? "";

// Simple in-memory rate limit — resets on cold start, fine for a 30-min cron.
let lastCallMs = 0;
const RATE_LIMIT_MS = 60_000;

function verifySecret(provided: string | null): boolean {
  const expected = process.env.SYNC_SHARED_SECRET ?? "";
  if (!provided || !expected) return false;
  // Pad to equal length so timingSafeEqual never throws on length mismatch.
  const len = Math.max(provided.length, expected.length, 1);
  const a = Buffer.alloc(len);
  const b = Buffer.alloc(len);
  Buffer.from(provided).copy(a);
  Buffer.from(expected).copy(b);
  return timingSafeEqual(a, b);
}

function parseCsv(raw: string): string[][] {
  return raw
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const result: string[] = [];
      let cur = "";
      let inQ = false;
      for (const c of line) {
        if (c === '"') { inQ = !inQ; continue; }
        if (c === "," && !inQ) { result.push(cur); cur = ""; continue; }
        cur += c;
      }
      result.push(cur);
      return result;
    });
}

// Same auto-detect as the manual dashboard importer: prefer a header containing
// "chassis", fall back to column B (index 1).
function detectChassisColumn(headers: string[]): number {
  const idx = headers.findIndex((h) => /chassis/i.test(h));
  return idx >= 0 ? idx : 1;
}

async function writeSyncLog(entry: {
  rowsProcessed: number;
  created: number;
  skipped: number;
  success: boolean;
  errorMessage?: string;
}) {
  await supabase.from("sync_logs").insert({
    manager_id: SYNC_MANAGER_ID,
    rows_processed: entry.rowsProcessed,
    created_count: entry.created,
    skipped_count: entry.skipped,
    success: entry.success,
    error_message: entry.errorMessage ?? null,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!verifySecret(req.headers.get("X-Sync-Secret"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!SYNC_MANAGER_ID) {
    return NextResponse.json(
      { error: "SYNC_MANAGER_ID not configured on server" },
      { status: 500 }
    );
  }

  const now = Date.now();
  if (now - lastCallMs < RATE_LIMIT_MS) {
    return NextResponse.json(
      { error: "Rate limit: wait 60 seconds between syncs" },
      { status: 429 }
    );
  }
  lastCallMs = now;

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Failed to read request body" }, { status: 400 });
  }

  if (!raw.trim()) {
    await writeSyncLog({ rowsProcessed: 0, created: 0, skipped: 0, success: false, errorMessage: "Empty CSV body" });
    return NextResponse.json({ error: "Empty CSV body" }, { status: 400 });
  }

  const rows = parseCsv(raw);
  if (rows.length < 2) {
    await writeSyncLog({ rowsProcessed: 0, created: 0, skipped: 0, success: false, errorMessage: "CSV has no data rows" });
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  }

  const colIdx = detectChassisColumn(rows[0]);
  const chassisNumbers = rows.slice(1).map((r) => (r[colIdx] ?? "").trim()).filter(Boolean);

  let result: { inserted: number; skipped: number; invalid: string[] };
  try {
    result = await upsertChassisList(chassisNumbers, SYNC_MANAGER_ID);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await writeSyncLog({ rowsProcessed: chassisNumbers.length, created: 0, skipped: 0, success: false, errorMessage: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await writeSyncLog({
    rowsProcessed: chassisNumbers.length,
    created: result.inserted,
    skipped: result.skipped,
    success: true,
  });

  return NextResponse.json({
    rowsProcessed: chassisNumbers.length,
    created: result.inserted,
    skipped: result.skipped,
    errors: result.invalid,
  });
}
