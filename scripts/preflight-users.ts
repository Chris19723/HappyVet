/**
 * HA-FOUND-001 — READ-ONLY user preflight.
 *
 * Classifies existing users to support membership decisions. Creates NOTHING.
 * Unknown/unrecognized identities are flagged DECISION_REQUIRED (fail closed —
 * no automatic membership creation for test/unknown/former users).
 *
 * Usage: DATABASE_URL=… tsx scripts/preflight-users.ts
 */
import pg from "pg";
import { RECOGNIZED_ROLES } from "../server/tenantContext";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL must be set"); process.exit(1); }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const users = await client.query<{ id: string; email: string | null; role: string | null }>(
      `SELECT id, email, role FROM users ORDER BY created_at NULLS LAST`);
    const memberships = await client.query<{ user_id: string; organization_id: string; role: string; status: string }>(
      `SELECT user_id, organization_id, role, status FROM memberships`).catch(() => ({ rows: [] as any[] }));
    const staff = await client.query<{ user_id: string | null; organization_id: string }>(
      `SELECT user_id, organization_id FROM staff_members`).catch(() => ({ rows: [] as any[] }));

    const mByUser = new Map<string, any[]>();
    for (const m of memberships.rows) { (mByUser.get(m.user_id) ?? mByUser.set(m.user_id, []).get(m.user_id)!).push(m); }
    const staffByUser = new Set(staff.rows.filter((s) => s.user_id).map((s) => s.user_id));

    const report = users.rows.map((u) => {
      const mems = mByUser.get(u.id) ?? [];
      const legacyRole = u.role ?? null;
      const candidateRole = (RECOGNIZED_ROLES as readonly string[]).includes(legacyRole ?? "") ? legacyRole : null;
      let classification: string;
      if (mems.some((m) => m.status === "active")) classification = "HAS_ACTIVE_MEMBERSHIP";
      else if (!u.email) classification = "DECISION_REQUIRED_NO_EMAIL";
      else if (!candidateRole) classification = "DECISION_REQUIRED_UNRECOGNIZED_ROLE";
      else classification = "CANDIDATE_MEMBERSHIP";
      return {
        userId: u.id,
        email: u.email,
        currentLegacyRole: legacyRole,
        candidateMembershipRole: candidateRole,
        hasStaffMapping: staffByUser.has(u.id),
        activeMemberships: mems.filter((m) => m.status === "active").length,
        classification,
      };
    });

    console.log(JSON.stringify({ totalUsers: report.length, users: report }, null, 2));
    console.log("\nNOTE: this is read-only. No memberships were created. Unknown/unrecognized identities require an explicit HQ decision.");
  } finally {
    await client.end();
  }
}

main();
