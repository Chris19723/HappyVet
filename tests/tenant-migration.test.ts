/**
 * HA-FOUND-001 — versioned migration + legacy backfill reconciliation.
 *
 * Proves the EXPAND → BACKFILL → ENFORCE path preserves all legacy data with
 * ZERO unexplained delta. Runs against TEST_DATABASE_URL (skipped otherwise).
 * Run together with the isolation suite using --no-file-parallelism.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const TEST_DB = process.env.TEST_DATABASE_URL;
const run = TEST_DB ? describe : describe.skip;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

run("versioned migration + reconciliation (HA-FOUND-001)", () => {
  let raw: pg.Client;
  let before: any;
  let after: any;
  let orgId: string;
  let branchId: string;

  beforeAll(async () => {
    raw = new pg.Client({ connectionString: TEST_DB });
    await raw.connect();
    await raw.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

    const { runMigrations } = await import("../scripts/migrate");
    const { backfill, reconcile } = await import("../scripts/backfill-tenant");

    // 1) Baseline only (pre-tenant schema).
    await runMigrations({ to: "0000" });

    // 2) Seed LEGACY data (no tenant columns exist yet).
    const u = await raw.query(`INSERT INTO users (email) VALUES ('legacy@x.com') RETURNING id`);
    const userId = u.rows[0].id;
    const o = await raw.query(`INSERT INTO owners (first_name, last_name) VALUES ('Legacy','Owner') RETURNING id`);
    const ownerId = o.rows[0].id;
    const p = await raw.query(`INSERT INTO patients (name, species, owner_id) VALUES ('Rex','Canino',$1) RETURNING id`, [ownerId]);
    const patientId = p.rows[0].id;
    const a = await raw.query(`INSERT INTO appointments (patient_id, veterinarian_id, appointment_date, reason) VALUES ($1,$2,now(),'chk') RETURNING id`, [patientId, userId]);
    await raw.query(`INSERT INTO medical_records (patient_id, veterinarian_id, appointment_id, diagnosis) VALUES ($1,$2,$3,'dx')`, [patientId, userId, a.rows[0].id]);
    await raw.query(`INSERT INTO treatments (name, price) VALUES ('Consulta','150.00')`);
    const inv = await raw.query(`INSERT INTO inventory_items (name, current_stock, unit_price) VALUES ('Prod', 7, '50.00') RETURNING id`);
    const invItemId = inv.rows[0].id;
    const i = await raw.query(`INSERT INTO invoices (invoice_number, owner_id, patient_id, subtotal, tax_amount, total_amount, status) VALUES ('INV-000001',$1,$2,'300.00','0','300.00','paid') RETURNING id`, [ownerId, patientId]);
    await raw.query(`INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, total_price) VALUES ($1,'svc',1,'300.00','300.00')`, [i.rows[0].id]);
    await raw.query(`INSERT INTO expenses (amount, category, inventory_item_id, quantity) VALUES ('120.00','inventario',$1,3)`, [invItemId]);

    // 3) Expand.
    await runMigrations({ to: "0001_tenant_expand" });

    // 4) Bootstrap initial org/branch (explicit names).
    const org = await raw.query(`INSERT INTO organizations (name) VALUES ('Legacy Clinic') RETURNING id`);
    orgId = org.rows[0].id;
    const br = await raw.query(`INSERT INTO branches (organization_id, name) VALUES ($1,'Principal') RETURNING id`, [orgId]);
    branchId = br.rows[0].id;

    // 5) Reconcile snapshot, backfill, reconcile again.
    before = await reconcile(raw);
    await raw.query("BEGIN");
    await backfill(raw, orgId, branchId);
    await raw.query("COMMIT");
    after = await reconcile(raw);

    // 6) Enforce (NOT NULL + composite FKs) — must succeed post-backfill.
    await runMigrations({});
  }, 60000);

  afterAll(async () => { await raw?.end(); });

  it("row counts are unchanged by the backfill (no data lost or created)", () => {
    expect(after.counts).toEqual(before.counts);
    expect(before.counts.owners).toBe(1);
    expect(before.counts.invoices).toBe(1);
    expect(before.counts.expenses).toBe(1);
  });

  it("financial and inventory sums are preserved (zero delta)", () => {
    expect(after.sums).toEqual(before.sums);
    expect(after.sums.invoice_total).toBe("300.00");
    expect(after.sums.paid_revenue).toBe("300.00");
    expect(after.sums.expense_total).toBe("120.00");
    expect(after.sums.inventory_stock).toBe("7");
  });

  it("no required tenant columns remain null after backfill (incl. medical_records.branch_id)", () => {
    for (const [k, v] of Object.entries(after.remainingNulls)) {
      expect(v, k).toBe(0); // medical_records.branch_id is now REQUIRED and backfilled
    }
  });

  it("derives medical_records.branch_id from the linked appointment", async () => {
    const rows = await raw.query(`
      SELECT m.branch_id AS m_branch, a.branch_id AS a_branch
      FROM medical_records m JOIN appointments a ON a.id = m.appointment_id`);
    expect(rows.rowCount).toBeGreaterThan(0);
    for (const r of rows.rows) expect(r.m_branch).toBe(r.a_branch);
  });

  it("enforce migration applied cleanly and rows carry the tenant", async () => {
    const orphans = await raw.query(`SELECT count(*)::int c FROM owners WHERE organization_id IS NULL`);
    expect(orphans.rows[0].c).toBe(0);
    const fkCount = await raw.query(`SELECT count(*)::int c FROM information_schema.table_constraints WHERE constraint_type='FOREIGN KEY' AND table_schema='public'`);
    expect(fkCount.rows[0].c).toBeGreaterThan(30);
  });
});
