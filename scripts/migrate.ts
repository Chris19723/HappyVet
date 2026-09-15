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

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
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
    const appliedRes = await client.query<{ name: string }>(`SELECT name FROM "_ha_migrations"`);
    const applied = new Set(appliedRes.rows.map((r) => r.name));
    const files = migrationFiles();

    if (opts.status) {
      for (const f of files) console.log(`${applied.has(f) ? "APPLIED " : "PENDING "} ${f}`);
      return { applied: [...applied], pending: files.filter((f) => !applied.has(f)) };
    }

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
