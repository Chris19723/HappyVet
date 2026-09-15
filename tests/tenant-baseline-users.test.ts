/**
 * HA-FOUND-001 — baseline adoption (HQ #2 / §32) + user-staff migration (HQ #4 / §33).
 *
 * Simulates a LEGACY database that predates the versioned-migration system:
 * the pre-tenant schema exists with real data but there is no `_ha_migrations`
 * table. Proves the migrator ADOPTS the baseline (records 0000 without executing
 * it), the full cutover then succeeds without data loss, and the manifest-driven
 * user migration maps approved identities while failing closed on unknown ones.
 *
 * Runs against TEST_DATABASE_URL (skipped otherwise); use --no-file-parallelism.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

run("baseline adoption + user migration (HA-FOUND-001)", () => {
  let raw: pg.Client;

  beforeAll(async () => {
    raw = new pg.Client({ connectionString: TEST_DB });
    await raw.connect();
  }, 60000);

  afterAll(async () => { await raw?.end(); });

  // Build a legacy DB: baseline schema + data, then remove the migration ledger
  // so it looks like a database that predates the migration runner.
  async function buildLegacy(): Promise<{ userId: string; ownerId: string; patientId: string; apptId: string }> {
    await raw.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    const { runMigrations } = await import("../scripts/migrate");
    await runMigrations({ to: "0000" }); // create the pre-tenant baseline schema
    // Erase the ledger → simulate a legacy DB with no knowledge of migrations.
    await raw.query(`DROP TABLE "_ha_migrations"`);

    const u = await raw.query(`INSERT INTO users (email, role) VALUES ('vet@x.com','veterinarian') RETURNING id`);
    const userId = u.rows[0].id;
    const o = await raw.query(`INSERT INTO owners (first_name, last_name) VALUES ('Legacy','Owner') RETURNING id`);
    const ownerId = o.rows[0].id;
    const p = await raw.query(`INSERT INTO patients (name, species, owner_id) VALUES ('Rex','Canino',$1) RETURNING id`, [ownerId]);
    const patientId = p.rows[0].id;
    const a = await raw.query(`INSERT INTO appointments (patient_id, veterinarian_id, appointment_date, reason) VALUES ($1,$2,now(),'chk') RETURNING id`, [patientId, userId]);
    const apptId = a.rows[0].id;
    await raw.query(`INSERT INTO medical_records (patient_id, veterinarian_id, appointment_id, diagnosis) VALUES ($1,$2,$3,'dx')`, [patientId, userId, apptId]);
    await raw.query(`INSERT INTO invoices (invoice_number, owner_id, patient_id, subtotal, tax_amount, total_amount, status) VALUES ('INV-000001',$1,$2,'300.00','0','300.00','paid')`, [ownerId, patientId]);
    return { userId, ownerId, patientId, apptId };
  }

  it("returns fresh-db for an empty database (no adoption)", async () => {
    await raw.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await raw.query(`CREATE TABLE IF NOT EXISTS "_ha_migrations" ("name" varchar PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())`);
    const { adoptBaseline } = await import("../scripts/migrate");
    const res = await adoptBaseline(raw);
    expect(res.adopted).toBe(false);
    expect(res.reason).toBe("fresh-db");
  });

  it("fails closed on a partial / unknown legacy schema", async () => {
    await buildLegacy();
    await raw.query(`DROP TABLE "invoice_items" CASCADE`); // corrupt the baseline shape
    await raw.query(`CREATE TABLE IF NOT EXISTS "_ha_migrations" ("name" varchar PRIMARY KEY, "applied_at" timestamptz NOT NULL DEFAULT now())`);
    const { adoptBaseline } = await import("../scripts/migrate");
    await expect(adoptBaseline(raw)).rejects.toThrow(/BASELINE_ADOPTION_FAILED/);
  });

  it("adopts a legacy schema (records 0000 without executing it) and completes the full cutover", async () => {
    const legacy = await buildLegacy();
    const { runMigrations } = await import("../scripts/migrate");
    const { backfill, reconcile } = await import("../scripts/backfill-tenant");
    const { migrateUsers, reconcileUsers } = await import("../scripts/migrate-users");

    // Adoption happens inside runMigrations. If 0000 were re-executed against the
    // existing legacy schema it would throw "relation already exists"; success
    // proves the baseline was adopted, not re-run.
    await runMigrations({ to: "0001_tenant_expand" });
    const ledger = await raw.query(`SELECT name FROM "_ha_migrations" WHERE name = '0000_baseline.sql'`);
    expect(ledger.rowCount).toBe(1);

    const before = await reconcile(raw);

    // Bootstrap the initial tenant.
    const org = await raw.query(`INSERT INTO organizations (name) VALUES ('Legacy Clinic') RETURNING id`);
    const orgId = org.rows[0].id;
    const br = await raw.query(`INSERT INTO branches (organization_id, name) VALUES ($1,'Principal') RETURNING id`, [orgId]);
    const branchId = br.rows[0].id;

    await raw.query("BEGIN");
    await backfill(raw, orgId, branchId);
    await raw.query("COMMIT");

    // Manifest-driven user migration BEFORE enforce so staff FKs validate.
    const manifest = { organizationId: orgId, users: [
      { userId: legacy.userId, role: "veterinarian", staffDisplayName: "Dra. Legacy", staffRole: "veterinarian" },
    ]};
    await raw.query("BEGIN");
    const mig = await migrateUsers(raw, manifest);
    await raw.query("COMMIT");
    expect(mig.remap.appointments).toBe(1);
    expect(mig.remap.medicalRecords).toBe(1);

    // Enforce must apply cleanly on the migrated data.
    await runMigrations({});

    const after = await reconcile(raw);
    expect(after.counts).toEqual(before.counts); // zero delta
    expect(after.sums.paid_revenue).toBe("300.00");

    // Authorship is now on StaffMembers; nothing left unmapped.
    const recon = await reconcileUsers(raw, orgId);
    expect(recon.apptsLegacyVetUnmapped).toBe(0);
    expect(recon.recordsLegacyVetUnmapped).toBe(0);
    expect(recon.apptsWithStaff).toBe(1);
    expect(recon.recordsWithStaff).toBe(1);

    // The membership references a staff member owned by the same user.
    const m = await raw.query(
      `SELECT mm.staff_member_id, sm.user_id FROM memberships mm JOIN staff_members sm ON sm.id = mm.staff_member_id
       WHERE mm.organization_id = $1 AND mm.user_id = $2`, [orgId, legacy.userId]);
    expect(m.rows[0].user_id).toBe(legacy.userId);
  }, 60000);

  it("user migration fails closed on an unknown legacy veterinarian", async () => {
    const legacy = await buildLegacy();
    const { runMigrations } = await import("../scripts/migrate");
    const { backfill } = await import("../scripts/backfill-tenant");
    const { migrateUsers } = await import("../scripts/migrate-users");

    await runMigrations({ to: "0001_tenant_expand" });
    const org = await raw.query(`INSERT INTO organizations (name) VALUES ('Legacy Clinic 2') RETURNING id`);
    const orgId = org.rows[0].id;
    const br = await raw.query(`INSERT INTO branches (organization_id, name) VALUES ($1,'Principal') RETURNING id`, [orgId]);
    await raw.query("BEGIN");
    await backfill(raw, orgId, br.rows[0].id);
    await raw.query("COMMIT");

    // Manifest omits the legacy vet (legacy.userId) → must abort, unknown identity.
    const otherUser = await raw.query(`INSERT INTO users (email) VALUES ('other@x.com') RETURNING id`);
    const manifest = { organizationId: orgId, users: [
      { userId: otherUser.rows[0].id, role: "admin", staffDisplayName: "Someone Else" },
    ]};
    await expect(migrateUsers(raw, manifest)).rejects.toThrow(/UNKNOWN_IDENTITY/);
  }, 60000);
});
