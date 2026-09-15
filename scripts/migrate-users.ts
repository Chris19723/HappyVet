/**
 * HA-FOUND-001 — manifest-driven user / membership / staff migration (HQ #4).
 *
 * Turns approved legacy login users into tenant Memberships + StaffMembers and
 * remaps legacy clinical authorship (appointments.veterinarian_id and
 * medical_records.veterinarian_id) onto the new tenant-owned StaffMember
 * references. Everything is driven by an EXPLICIT manifest — this script never
 * invents identity, roles, or display names.
 *
 * FAIL CLOSED (HQ rule): any legacy veterinarian_id present in the org's data
 * that is NOT listed in the manifest aborts the whole migration. Unknown
 * identity is never auto-approved.
 *
 * IDEMPOTENT / RESTART-SAFE: re-running reuses existing StaffMembers/Memberships
 * and only fills NULL author references, so a crashed run can be repeated.
 *
 * Manifest (JSON, via USER_MANIFEST=<path> or MANIFEST_JSON=<inline json>):
 *   {
 *     "organizationId": "<org id from bootstrap>",
 *     "users": [
 *       { "userId": "<users.id>", "role": "admin",
 *         "staffDisplayName": "Dra. Ana López", "staffRole": "veterinarian" }
 *     ]
 *   }
 * `role` is the Membership role (admin | veterinarian). `staffDisplayName` is
 * REQUIRED and used verbatim. `staffRole` is an optional clinical label.
 *
 * Run order: bootstrap → backfill → THIS (before/after 0002 enforce both work,
 * but running before enforce is recommended so FK enforcement validates it).
 * NEVER run against production without explicit HQ authorization.
 */
import { readFileSync } from "fs";
import pg from "pg";
import { RECOGNIZED_ROLES } from "../server/tenantContext";

interface ManifestUser {
  userId: string;
  role: string;
  staffDisplayName: string;
  staffRole?: string | null;
}
interface Manifest {
  organizationId: string;
  users: ManifestUser[];
}

function loadManifest(): Manifest {
  const inline = process.env.MANIFEST_JSON?.trim();
  const path = process.env.USER_MANIFEST?.trim();
  let raw: string;
  if (inline) raw = inline;
  else if (path) raw = readFileSync(path, "utf8");
  else throw new Error("STOP: provide USER_MANIFEST=<path> or MANIFEST_JSON=<json>.");
  let parsed: Manifest;
  try { parsed = JSON.parse(raw); } catch (e) { throw new Error(`STOP: manifest is not valid JSON: ${(e as Error).message}`); }
  if (!parsed.organizationId?.trim()) throw new Error("STOP: manifest.organizationId is required.");
  if (!Array.isArray(parsed.users) || parsed.users.length === 0) throw new Error("STOP: manifest.users must be a non-empty array.");
  for (const [i, u] of parsed.users.entries()) {
    if (!u.userId?.trim()) throw new Error(`STOP: manifest.users[${i}].userId is required.`);
    if (!(RECOGNIZED_ROLES as readonly string[]).includes(u.role)) {
      throw new Error(`STOP: manifest.users[${i}].role '${u.role}' is not recognized (${RECOGNIZED_ROLES.join(", ")}).`);
    }
    if (!u.staffDisplayName?.trim()) {
      throw new Error(`STOP: manifest.users[${i}].staffDisplayName is required (identity is never invented).`);
    }
  }
  return parsed;
}

export async function migrateUsers(client: pg.Client, manifest: Manifest) {
  const org = manifest.organizationId;
  const orgRow = await client.query(`SELECT 1 FROM organizations WHERE id = $1`, [org]);
  if (orgRow.rowCount === 0) throw new Error(`STOP: organization ${org} does not exist.`);

  const approved = new Set(manifest.users.map((u) => u.userId));

  // FAIL CLOSED: every legacy veterinarian in this org's data must be approved.
  const legacyVets = await client.query<{ veterinarian_id: string }>(`
    SELECT DISTINCT veterinarian_id FROM (
      SELECT veterinarian_id FROM appointments WHERE organization_id = $1 AND veterinarian_id IS NOT NULL
      UNION
      SELECT veterinarian_id FROM medical_records WHERE organization_id = $1 AND veterinarian_id IS NOT NULL
    ) v`, [org]);
  const unknown = legacyVets.rows.map((r) => r.veterinarian_id).filter((id) => !approved.has(id));
  if (unknown.length > 0) {
    throw new Error(`UNKNOWN_IDENTITY: legacy veterinarian_id(s) not in manifest: ${unknown.join(", ")}. Aborting (fail closed).`);
  }

  // Every manifest user must exist as a login identity.
  for (const u of manifest.users) {
    const exists = await client.query(`SELECT 1 FROM users WHERE id = $1`, [u.userId]);
    if (exists.rowCount === 0) throw new Error(`STOP: manifest user ${u.userId} does not exist in users.`);
  }

  const userToStaff = new Map<string, string>();
  const created = { staff: 0, memberships: 0 };
  const reused = { staff: 0, memberships: 0 };

  for (const u of manifest.users) {
    // StaffMember (idempotent by org + user).
    let staffId: string;
    const existingStaff = await client.query<{ id: string }>(
      `SELECT id FROM staff_members WHERE organization_id = $1 AND user_id = $2 ORDER BY created_at ASC LIMIT 1`,
      [org, u.userId]);
    if (existingStaff.rows[0]) {
      staffId = existingStaff.rows[0].id;
      reused.staff++;
    } else {
      const s = await client.query<{ id: string }>(
        `INSERT INTO staff_members (organization_id, user_id, display_name, role, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [org, u.userId, u.staffDisplayName, u.staffRole ?? null]);
      staffId = s.rows[0].id;
      created.staff++;
    }
    userToStaff.set(u.userId, staffId);

    // Membership (idempotent by org + user).
    const existingM = await client.query<{ id: string }>(
      `SELECT id FROM memberships WHERE organization_id = $1 AND user_id = $2 LIMIT 1`, [org, u.userId]);
    if (existingM.rows[0]) {
      await client.query(
        `UPDATE memberships SET role = $1, status = 'active', staff_member_id = $2, updated_at = now()
         WHERE id = $3`, [u.role, staffId, existingM.rows[0].id]);
      reused.memberships++;
    } else {
      await client.query(
        `INSERT INTO memberships (organization_id, user_id, role, status, staff_member_id)
         VALUES ($1, $2, $3, 'active', $4)`, [org, u.userId, u.role, staffId]);
      created.memberships++;
    }
  }

  // Remap legacy authorship onto StaffMember references (only fill NULLs).
  const remap = { appointments: 0, medicalRecords: 0 };
  for (const [userId, staffId] of Array.from(userToStaff.entries())) {
    const a = await client.query(
      `UPDATE appointments SET staff_member_id = $1
       WHERE organization_id = $2 AND veterinarian_id = $3 AND staff_member_id IS NULL`,
      [staffId, org, userId]);
    remap.appointments += a.rowCount ?? 0;
    const m = await client.query(
      `UPDATE medical_records SET veterinarian_staff_member_id = $1
       WHERE organization_id = $2 AND veterinarian_id = $3 AND veterinarian_staff_member_id IS NULL`,
      [staffId, org, userId]);
    remap.medicalRecords += m.rowCount ?? 0;
  }

  return { created, reused, remap };
}

export async function reconcileUsers(client: pg.Client, org: string) {
  const q = async (sql: string) => Number((await client.query<{ c: string }>(sql, [org])).rows[0].c);
  return {
    apptsWithLegacyVet: await q(`SELECT count(*)::int AS c FROM appointments WHERE organization_id = $1 AND veterinarian_id IS NOT NULL`),
    apptsWithStaff: await q(`SELECT count(*)::int AS c FROM appointments WHERE organization_id = $1 AND staff_member_id IS NOT NULL`),
    apptsLegacyVetUnmapped: await q(`SELECT count(*)::int AS c FROM appointments WHERE organization_id = $1 AND veterinarian_id IS NOT NULL AND staff_member_id IS NULL`),
    recordsWithLegacyVet: await q(`SELECT count(*)::int AS c FROM medical_records WHERE organization_id = $1 AND veterinarian_id IS NOT NULL`),
    recordsWithStaff: await q(`SELECT count(*)::int AS c FROM medical_records WHERE organization_id = $1 AND veterinarian_staff_member_id IS NOT NULL`),
    recordsLegacyVetUnmapped: await q(`SELECT count(*)::int AS c FROM medical_records WHERE organization_id = $1 AND veterinarian_id IS NOT NULL AND veterinarian_staff_member_id IS NULL`),
  };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL must be set"); process.exit(1); }
  let manifest: Manifest;
  try { manifest = loadManifest(); } catch (e) { console.error((e as Error).message); process.exit(1); return; }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const before = await reconcileUsers(client, manifest.organizationId);
    await client.query("BEGIN");
    const result = await migrateUsers(client, manifest);
    await client.query("COMMIT");
    const after = await reconcileUsers(client, manifest.organizationId);
    console.log(JSON.stringify({ result, reconciliation: { before, after } }, null, 2));
    if (after.apptsLegacyVetUnmapped > 0 || after.recordsLegacyVetUnmapped > 0) {
      console.error("\nWARNING: some legacy authorship remains unmapped — review before ENFORCE.");
      process.exit(2);
    }
    console.log("\nOK: all legacy clinical authorship mapped to StaffMembers.");
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("User migration failed:", (e as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("migrate-users.ts");
if (invokedDirectly) main();
