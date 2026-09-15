/**
 * HA-FOUND-001 — versioned migration runner.
 *
 * Applies `migrations/*.sql` in filename order, once each, tracked in the
 * `_ha_migrations` table. Each file runs inside its own transaction, so a
 * failure leaves the database on the last fully-applied migration
 * (restartable). This is the reproducible, Drizzle-folder-compatible apply
 * path used for HA-FOUND-001 (expand → backfill → enforce), replacing
 * `drizzle-kit push` for high-risk tenant/clinical changes.
 *
 * Usage:
 *   DATABASE_URL=... tsx scripts/migrate.ts            # apply all pending
 *   DATABASE_URL=... tsx scripts/migrate.ts --to 0001  # apply up to (incl.) 0001*
 *   DATABASE_URL=... tsx scripts/migrate.ts --status    # list applied/pending
 *
 * NEVER point DATABASE_URL at production for this task (HQ rule).
 */
import { readdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

const BASELINE_FILE = "0000_baseline.sql";

// The pre-tenant ("baseline") schema and the key columns that prove a legacy DB
// really is at the baseline. Used to ADOPT an existing legacy database into the
// versioned-migration system without re-running 0000 (which would fail on
// already-existing objects). Verification is fail-closed.
const BASELINE_TABLES: Record<string, string[]> = {
  sessions: ["sid", "sess", "expire"],
  users: ["id", "email", "role"],
  owners: ["id", "first_name", "last_name"],
  patients: ["id", "name", "species", "owner_id"],
  appointments: ["id", "patient_id", "veterinarian_id", "appointment_date"],
  medical_records: ["id", "patient_id", "veterinarian_id"],
  treatments: ["id", "name", "price"],
  inventory_items: ["id", "name", "current_stock"],
  invoices: ["id", "invoice_number", "owner_id", "total_amount"],
  invoice_items: ["id", "invoice_id", "total_price"],
  expenses: ["id", "amount", "category"],
};

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/**
 * Baseline adoption (HQ #2). Decides how to treat 0000_baseline.sql:
 *   - already recorded          → no-op
 *   - no baseline tables present → fresh DB; 0000 will be applied normally
 *   - ALL baseline tables + key columns present → record 0000 as adopted WITHOUT
 *     running its SQL (the legacy schema already IS the baseline)
 *   - a partial/unknown legacy schema → THROW (fail closed)
 * Never runs baseline DDL and never touches tenant migrations.
 */
export async function adoptBaseline(client: pg.Client): Promise<{ adopted: boolean; reason: string }> {
  const rec = await client.query(`SELECT 1 FROM "_ha_migrations" WHERE name = $1`, [BASELINE_FILE]);
  if ((rec.rowCount ?? 0) > 0) return { adopted: false, reason: "already-recorded" };

  const names = Object.keys(BASELINE_TABLES);
  const existing = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`, [names]);
  const present = new Set(existing.rows.map((r) => r.table_name));

  if (present.size === 0) return { adopted: false, reason: "fresh-db" };

  const missing = names.filter((n) => !present.has(n));
  if (missing.length > 0) {
    throw new Error(
      `BASELINE_ADOPTION_FAILED: legacy schema is partial/unknown (missing tables: ${missing.join(", ")}). Refusing to adopt (fail closed).`);
  }
  for (const [t, cols] of Object.entries(BASELINE_TABLES)) {
    const colRes = await client.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`, [t]);
    const have = new Set(colRes.rows.map((r) => r.column_name));
    const missCols = cols.filter((c) => !have.has(c));
    if (missCols.length > 0) {
      throw new Error(
        `BASELINE_ADOPTION_FAILED: table "${t}" is missing expected baseline columns: ${missCols.join(", ")}. Refusing to adopt (fail closed).`);
    }
  }
  // The legacy schema matches the baseline — record it as applied, do NOT run it.
  await client.query(`INSERT INTO "_ha_migrations"(name) VALUES ($1)`, [BASELINE_FILE]);
  return { adopted: true, reason: "legacy-verified" };
}

export async function runMigrations(opts: { to?: string; status?: boolean } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL must be set");
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_ha_migrations" (
        "name" varchar PRIMARY KEY,
        "applied_at" timestamptz NOT NULL DEFAULT now()
      );
    `);
    const files = migrationFiles();

    if (opts.status) {
      const appliedResS = await client.query<{ name: string }>(`SELECT name FROM "_ha_migrations"`);
      const appliedS = new Set(appliedResS.rows.map((r) => r.name));
      for (const f of files) console.log(`${appliedS.has(f) ? "APPLIED " : "PENDING "} ${f}`);
      return { applied: [...appliedS], pending: files.filter((f) => !appliedS.has(f)) };
    }

    // Baseline adoption runs before applying files: on a legacy DB it records
    // 0000 as adopted without executing it; on a fresh DB it is a no-op and 0000
    // is applied normally below; on a partial/unknown schema it throws.
    const baseline = await adoptBaseline(client);
    if (baseline.adopted) console.log(`adopted baseline (${baseline.reason}): ${BASELINE_FILE}`);

    const appliedRes = await client.query<{ name: string }>(`SELECT name FROM "_ha_migrations"`);
    const applied = new Set(appliedRes.rows.map((r) => r.name));

    const newlyApplied: string[] = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(`INSERT INTO "_ha_migrations"(name) VALUES ($1)`, [file]);
        await client.query("COMMIT");
        newlyApplied.push(file);
        console.log(`applied ${file}`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration failed at ${file}: ${(err as Error).message}`);
      }
      // Stop after applying the file whose name starts with --to prefix.
      if (opts.to && file.startsWith(opts.to)) break;
    }
    return { applied: [...applied, ...newlyApplied], pending: [] as string[] };
  } finally {
    await client.end();
  }
}

// Run when invoked directly.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith("migrate.ts");
if (invokedDirectly) {
  const args = process.argv.slice(2);
  const toIdx = args.indexOf("--to");
  const opts = { to: toIdx >= 0 ? args[toIdx + 1] : undefined, status: args.includes("--status") };
  runMigrations(opts)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e.message);
      process.exit(1);
    });
}
