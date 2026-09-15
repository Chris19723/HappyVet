/**
 * HA-FOUND-001 — legacy-data tenant backfill (idempotent / restartable).
 *
 * Assigns existing rows to the initial Organization/Branch created by bootstrap.
 * Only touches rows whose tenant columns are NULL, so re-running is safe. Prints
 * a reconciliation summary (row counts + financial/stock sums) so callers can
 * verify ZERO unexplained delta before the ENFORCE migration.
 *
 * Usage:
 *   BACKFILL_ORG_ID=… BACKFILL_BRANCH_ID=… DATABASE_URL=… tsx scripts/backfill-tenant.ts
 *
 * Run order: migrate --to 0001_tenant_expand → THIS → migrate (0002 enforce).
 * NEVER run against production without explicit HQ authorization.
 */
import pg from "pg";

const ORG_TABLES = ["owners", "patients", "appointments", "medical_records", "treatments", "inventory_items", "invoices", "invoice_items", "expenses"];
const BRANCH_TABLES = ["appointments", "medical_records", "inventory_items", "invoices", "invoice_items", "expenses"];

export async function backfill(client: pg.Client, organizationId: string, branchId: string) {
  // Validate the org/branch relationship.
  const chk = await client.query(`SELECT 1 FROM branches WHERE id = $1 AND organization_id = $2`, [branchId, organizationId]);
  if (chk.rowCount === 0) throw new Error("Branch does not belong to the given organization");

  const updated: Record<string, number> = {};
  for (const t of ORG_TABLES) {
    const r = await client.query(`UPDATE ${t} SET organization_id = $1 WHERE organization_id IS NULL`, [organizationId]);
    updated[`${t}.organization_id`] = r.rowCount ?? 0;
  }
  for (const t of BRANCH_TABLES) {
    const r = await client.query(`UPDATE ${t} SET branch_id = $1 WHERE branch_id IS NULL`, [branchId]);
    updated[`${t}.branch_id`] = r.rowCount ?? 0;
  }
  // Mark the legacy walk-in owner as this org's public owner.
  await client.query(
    `UPDATE owners SET is_public = true WHERE organization_id = $1 AND first_name = 'Público' AND last_name = 'General' AND (is_public IS DISTINCT FROM true)`,
    [organizationId]);
  return updated;
}

export async function reconcile(client: pg.Client) {
  const counts: Record<string, number> = {};
  for (const t of [...new Set([...ORG_TABLES])]) {
    const r = await client.query(`SELECT count(*)::int AS c FROM ${t}`);
    counts[t] = r.rows[0].c;
  }
  const nulls: Record<string, number> = {};
  for (const t of ORG_TABLES) {
    const r = await client.query(`SELECT count(*)::int AS c FROM ${t} WHERE organization_id IS NULL`);
    nulls[`${t}.organization_id_null`] = r.rows[0].c;
  }
  for (const t of BRANCH_TABLES) {
    const r = await client.query(`SELECT count(*)::int AS c FROM ${t} WHERE branch_id IS NULL`);
    nulls[`${t}.branch_id_null`] = r.rows[0].c;
  }
  const sums = await client.query(`
    SELECT
      COALESCE((SELECT sum(subtotal) FROM invoices),0)::text AS invoice_subtotal,
      COALESCE((SELECT sum(tax_amount) FROM invoices),0)::text AS invoice_tax,
      COALESCE((SELECT sum(total_amount) FROM invoices),0)::text AS invoice_total,
      COALESCE((SELECT sum(total_amount) FROM invoices WHERE status='paid'),0)::text AS paid_revenue,
      COALESCE((SELECT sum(amount) FROM expenses),0)::text AS expense_total,
      COALESCE((SELECT sum(current_stock) FROM inventory_items),0)::text AS inventory_stock
  `);
  return { counts, remainingNulls: nulls, sums: sums.rows[0] };
}

async function main() {
  const organizationId = process.env.BACKFILL_ORG_ID?.trim();
  const branchId = process.env.BACKFILL_BRANCH_ID?.trim();
  const url = process.env.DATABASE_URL;
  if (!organizationId || !branchId) { console.error("STOP: BACKFILL_ORG_ID and BACKFILL_BRANCH_ID are required."); process.exit(1); }
  if (!url) { console.error("DATABASE_URL must be set"); process.exit(1); }

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const before = await reconcile(client);
    await client.query("BEGIN");
    const updated = await backfill(client, organizationId, branchId);
    await client.query("COMMIT");
    const after = await reconcile(client);
    console.log(JSON.stringify({ updated, before, after }, null, 2));
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Backfill failed:", (e as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("backfill-tenant.ts");
if (invokedDirectly) main();
