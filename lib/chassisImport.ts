import { supabase } from "./supabase";

export interface ImportResult {
  inserted: number;
  skipped: number;
  invalid: string[];
}

export async function upsertChassisList(
  chassisNumbers: string[],
  managerId: string
): Promise<ImportResult> {
  const invalid: string[] = [];
  const valid: string[] = [];

  for (const c of chassisNumbers) {
    const s = String(c).trim();
    if (/^\d{7}$/.test(s)) {
      valid.push(s);
    } else {
      invalid.push(s);
    }
  }

  const uniqueValid = [...new Set(valid)];

  if (uniqueValid.length === 0) {
    return { inserted: 0, skipped: 0, invalid };
  }

  const { data: existing } = await supabase
    .from("trucks")
    .select("chassis_number")
    .eq("manager_id", managerId)
    .in("chassis_number", uniqueValid);

  const existingSet = new Set(
    (existing ?? []).map((t: { chassis_number: string }) => t.chassis_number)
  );
  const toInsert = uniqueValid.filter((c) => !existingSet.has(c));
  const skipped =
    uniqueValid.length - toInsert.length + (valid.length - uniqueValid.length);

  if (toInsert.length === 0) {
    return { inserted: 0, skipped, invalid };
  }

  const { error } = await supabase.from("trucks").insert(
    toInsert.map((chassis_number) => ({
      chassis_number,
      status: "active",
      manager_id: managerId,
    }))
  );

  if (error) throw new Error(error.message);

  return { inserted: toInsert.length, skipped, invalid };
}
