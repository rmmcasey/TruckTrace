import { supabase } from "./supabase";

export interface ImportResult {
  inserted: number;
  skipped: number;
  restored: number;
  removed: number;
  invalid: string[];
}

export interface ImportOptions {
  /**
   * The list is the complete, authoritative set of trucks (the SharePoint sync).
   * Trucks missing from it are soft-deleted; soft-deleted trucks that reappear
   * are restored with their history intact. Leave false for manual imports,
   * which may only contain a few new chassis numbers.
   */
  fullSync?: boolean;
}

// Refuse to soft-delete more than this share of active trucks in one sync.
// Protects against a truncated/wrong file hiding the whole fleet.
const MAX_REMOVAL_RATIO = 0.5;

export async function upsertChassisList(
  chassisNumbers: string[],
  managerId: string,
  { fullSync = false }: ImportOptions = {}
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
    if (fullSync) {
      throw new Error("Sync file contains no valid chassis numbers — aborting, nothing changed");
    }
    return { inserted: 0, skipped: 0, restored: 0, removed: 0, invalid };
  }

  // All of this manager's trucks, including soft-deleted ones.
  const { data: allTrucks, error: fetchError } = await supabase
    .from("trucks")
    .select("id, chassis_number, deleted_at")
    .eq("manager_id", managerId);

  if (fetchError) throw new Error(fetchError.message);

  const byChassis = new Map(
    (allTrucks ?? []).map((t: { id: string; chassis_number: string; deleted_at: string | null }) => [
      t.chassis_number,
      t,
    ])
  );
  const inFile = new Set(uniqueValid);

  const toInsert = uniqueValid.filter((c) => !byChassis.has(c));
  const toRestore = uniqueValid
    .map((c) => byChassis.get(c))
    .filter((t): t is { id: string; chassis_number: string; deleted_at: string | null } => !!t && !!t.deleted_at);
  const active = (allTrucks ?? []).filter((t) => !t.deleted_at);
  const toRemove = fullSync ? active.filter((t) => !inFile.has(t.chassis_number)) : [];

  if (fullSync && active.length > 0 && toRemove.length / active.length > MAX_REMOVAL_RATIO) {
    throw new Error(
      `Sync would remove ${toRemove.length} of ${active.length} active trucks — aborting, nothing changed. ` +
        `Check the SharePoint file.`
    );
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("trucks").insert(
      toInsert.map((chassis_number) => ({
        chassis_number,
        status: "active",
        manager_id: managerId,
      }))
    );
    if (error) throw new Error(error.message);
  }

  // Restoring only happens on a full sync; a manual import of a previously
  // deleted chassis number also restores it, which is the intuitive behaviour.
  if (toRestore.length > 0) {
    const { error } = await supabase
      .from("trucks")
      .update({ deleted_at: null })
      .eq("manager_id", managerId)
      .in("id", toRestore.map((t) => t.id));
    if (error) throw new Error(error.message);
  }

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("trucks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("manager_id", managerId)
      .is("deleted_at", null)
      .in("id", toRemove.map((t) => t.id));
    if (error) throw new Error(error.message);
  }

  const skipped =
    uniqueValid.length - toInsert.length - toRestore.length + (valid.length - uniqueValid.length);

  return {
    inserted: toInsert.length,
    skipped,
    restored: toRestore.length,
    removed: toRemove.length,
    invalid,
  };
}
